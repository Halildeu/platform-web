import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { generatedThemeArtifacts } from '../generate-theme-css.mjs';
import { assertThemeOwnershipDecisionContract } from '../theme-ownership-decision-contract.mjs';

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
