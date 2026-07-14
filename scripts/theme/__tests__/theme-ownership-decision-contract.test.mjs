import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { generatedThemeArtifacts } from '../generate-theme-css.mjs';
import { assertThemeOwnershipDecisionContract } from '../theme-ownership-decision-contract.mjs';
import { sha256 } from '../theme-css-contract.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');
const tokenSourceContent = read('design-tokens', 'figma.tokens.json');
const tokens = JSON.parse(tokenSourceContent);
const manifest = JSON.parse(
  read('design-tokens', 'migrations', 'theme-ownership-decisions.v1.json'),
);
const themeExtensionCss = read('apps', 'mfe-shell', 'src', 'styles', 'theme.extensions.css');
const themeInlineExtensionCss = read(
  'apps',
  'mfe-shell',
  'src',
  'styles',
  'theme-inline.extensions.css',
);

const clone = (value) => structuredClone(value);
const contract = (overrides = {}) =>
  assertThemeOwnershipDecisionContract({
    manifest,
    tokenSourceContent,
    tokens,
    generatedThemeCss: generatedThemeArtifacts.themeCss.content,
    themeExtensionCss,
    generatedThemeInlineCss: generatedThemeArtifacts.themeInlineCss.content,
    themeInlineExtensionCss,
    ...overrides,
  });

test('reviewed ledger binds canonical sources, generated bridge and result digests', () => {
  assert.equal(contract(), true);
});

test('unknown manifest fields are rejected fail-closed', () => {
  const candidate = clone(manifest);
  candidate.unreviewedAllowance = true;
  assert.throws(() => contract({ manifest: candidate }), /manifest keys must be exactly/);
});

test('fake or stale token pointers cannot claim reviewed provenance', () => {
  const fakePointer = clone(manifest);
  fakePointer.decisions[0].targets[0].jsonPointer = '/totally/fake/reviewed/target';
  assert.throws(() => contract({ manifest: fakePointer }), /JSON pointer does not resolve/);

  const staleValue = clone(manifest);
  staleValue.decisions[0].targets[0].expectedValue = 'hotpink';
  assert.throws(() => contract({ manifest: staleValue }), /expected "hotpink"/);
});

test('token target fan-out is bound to exact generated identities', () => {
  const candidate = clone(manifest);
  candidate.decisions[0].targets[0].affectedIdentityCount = 3;
  candidate.decisions[0].candidateIdentityCount = 14;
  candidate.inventory.valueDriftIdentities = 40;
  assert.throws(() => contract({ manifest: candidate }), /binds 2 generated identities/);
});

test('bridge decisions are bound to both dark and system-dark payloads', () => {
  const candidate = clone(manifest);
  candidate.decisions[1].bindings[0].expectedValue = 'var(--unreviewed)';
  assert.throws(() => contract({ manifest: candidate }), /dark bridge is not bound/);
});

test('curated edits and stale result digests fail the required contract', () => {
  assert.throws(
    () =>
      contract({ themeExtensionCss: `${themeExtensionCss}\n:root { --unreviewed: hotpink; }\n` }),
    /theme extension CSS result digest mismatch/,
  );
  assert.throws(
    () =>
      contract({
        themeExtensionCss: `${themeExtensionCss}\n[data-theme="serban-dark"] .candidate { --action-primary-bg: hotpink; }\n`,
      }),
    /theme extension CSS result digest mismatch/,
  );

  const candidate = clone(manifest);
  candidate.result.generatedThemeCssSha256 = '0'.repeat(64);
  assert.throws(
    () => contract({ manifest: candidate }),
    /generated theme CSS result digest mismatch/,
  );
});

test('baseline records and unreconciled output are verified from real historical Git objects', () => {
  const fakeCommit = clone(manifest);
  fakeCommit.baseline.commit = '0'.repeat(40);
  assert.throws(() => contract({ manifest: fakeCommit }), /baseline commit.*unavailable/);

  const fakeBlobDigest = clone(manifest);
  fakeBlobDigest.baseline.themeCss.sha256 = '0'.repeat(64);
  assert.throws(
    () => contract({ manifest: fakeBlobDigest }),
    /baseline\.themeCss historical blob digest mismatch/,
  );

  const fakeUnreconciled = clone(manifest);
  fakeUnreconciled.baseline.unreconciledGeneratedThemeSha256 = '0'.repeat(64);
  assert.throws(
    () => contract({ manifest: fakeUnreconciled }),
    /unreconciled generated theme digest does not match historical generator output/,
  );
});

test('historically derived inventory and removal partition reject caller-authored substitutes', () => {
  const fakeInventory = clone(manifest);
  fakeInventory.inventory.themeDeclarationTotal += 1;
  assert.throws(
    () => contract({ manifest: fakeInventory }),
    /inventory\.themeDeclarationTotal.*derived historical value/,
  );

  const fakeRemoval = clone(manifest);
  fakeRemoval.decisions[2].property = '--ring-focus';
  assert.throws(
    () => contract({ manifest: fakeRemoval }),
    /historical removal payload does not match the reviewed decision/,
  );

  const fakeScope = clone(manifest);
  fakeScope.decisions[2].scopes[0] = '[data-mode="unreviewed"]';
  assert.throws(() => contract({ manifest: fakeScope }), /historical removal scopes mismatch/);
});

test('unreviewed generated substitutions fail even with a matching caller-authored result digest', () => {
  const generatedThemeCss = generatedThemeArtifacts.themeCss.content.replace(
    '  --surface-default-bg: oklch(100% 0 0);',
    '  --surface-default-bg: hotpink;',
  );
  assert.notEqual(generatedThemeCss, generatedThemeArtifacts.themeCss.content);
  const candidate = clone(manifest);
  candidate.result.generatedThemeCssSha256 = sha256(generatedThemeCss);
  assert.throws(
    () => contract({ manifest: candidate, generatedThemeCss }),
    /historical generated-theme decision partition mismatch/,
  );
});

test('an unrelated existing dark/system property cannot substitute for a reviewed bridge', () => {
  const candidate = clone(manifest);
  candidate.decisions[1].bindings[0] = {
    property: '--action-primary',
    expectedValue: 'oklch(62.31% 0.188 259.81deg)',
  };
  assert.throws(
    () => contract({ manifest: candidate }),
    /historical generated-theme decision partition mismatch/,
  );
});

test('cross-selector curated provenance rejects additions and mutations after digest refresh', () => {
  const addedOverride = `${themeExtensionCss}\n[data-theme="serban-dark"] .candidate { --action-primary-bg: hotpink; }\n`;
  const addedManifest = clone(manifest);
  addedManifest.result.themeExtensionCssSha256 = sha256(addedOverride);
  assert.throws(
    () => contract({ manifest: addedManifest, themeExtensionCss: addedOverride }),
    /composed theme contains 1 declaration not present in the historical baseline/,
  );

  const mutatedOverride = themeExtensionCss.replace(
    '--action-primary-bg: oklch(62% 0.19 260deg);',
    '--action-primary-bg: hotpink;',
  );
  assert.notEqual(mutatedOverride, themeExtensionCss);
  const mutatedManifest = clone(manifest);
  mutatedManifest.result.themeExtensionCssSha256 = sha256(mutatedOverride);
  assert.throws(
    () => contract({ manifest: mutatedManifest, themeExtensionCss: mutatedOverride }),
    /composed theme contains 1 declaration not present in the historical baseline/,
  );
});
