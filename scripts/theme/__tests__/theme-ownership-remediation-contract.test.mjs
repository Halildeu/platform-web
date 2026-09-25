import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { generatedThemeArtifacts } from '../generate-theme-css.mjs';
import { diffDeclarationMultisets, sha256 } from '../theme-css-contract.mjs';
import {
  REMEDIATION_PATHS,
  assertThemeOwnershipRemediationContract,
  validateAgainstSchema,
} from '../theme-ownership-remediation-contract.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (relative) => fs.readFileSync(path.join(repoRoot, relative), 'utf8');
const clone = (value) => structuredClone(value);

const manifest = JSON.parse(read(REMEDIATION_PATHS.v2));
const schema = JSON.parse(read(REMEDIATION_PATHS.schema));
const v1ManifestContent = read(REMEDIATION_PATHS.v1);
const tokenSourceContent = read(REMEDIATION_PATHS.tokens);
const tokens = JSON.parse(tokenSourceContent);
const themeExtensionCss = read(REMEDIATION_PATHS.themeExtension);
const themeInlineExtensionCss = read(REMEDIATION_PATHS.themeInlineExtension);
const generatedThemeCss = generatedThemeArtifacts.themeCss.content;
const generatedThemeInlineCss = generatedThemeArtifacts.themeInlineCss.content;

const contract = (overrides = {}) =>
  assertThemeOwnershipRemediationContract({
    manifest,
    v1ManifestContent,
    tokenSourceContent,
    tokens,
    generatedThemeCss,
    themeExtensionCss,
    generatedThemeInlineCss,
    themeInlineExtensionCss,
    baseManifest: null,
    ...overrides,
  });

const DANGER_POINTER = '/semantic/color/state/danger/text/modes/serban-light/value';
const DANGER_BEFORE = 'oklch(63.68% 0.2078 25.33)';
const DANGER_AFTER = 'oklch(50.5% 0.19 27)';

/**
 * A synthetic remediation shaped like the #1021 token PR: one token value and
 * the generated `:root` declaration it renders change together. The recorded
 * ratio is taken from the gate's own recomputation, so the test pins the
 * recompute path rather than a second copy of the colour math.
 */
function remediation({ withTokenChange = true } = {}) {
  const changedCss = generatedThemeCss.replace(
    `  --state-danger-text: ${DANGER_BEFORE};`,
    `  --state-danger-text: ${DANGER_AFTER};`,
  );
  assert.notEqual(changedCss, generatedThemeCss);
  const [change] = diffDeclarationMultisets(generatedThemeCss, changedCss).changed;

  const changedTokens = clone(tokens);
  if (withTokenChange) {
    changedTokens.semantic.color.state.danger.text.modes['serban-light'].value =
      '{raw.color.danger.700}';
  }
  const changedSource = `${JSON.stringify(changedTokens, null, 2)}\n`;

  const decision = {
    id: 'danger-text-contrast-test',
    kind: 'contrast-remediation',
    issue: 'Halildeu/platform-web#1021',
    tokenTargets: withTokenChange
      ? [
          {
            jsonPointer: DANGER_POINTER,
            from: '{raw.color.danger.500}',
            to: '{raw.color.danger.700}',
          },
        ]
      : [],
    cssTargets: [
      {
        artifact: 'generatedTheme',
        selector: change.selector,
        atRules: change.atRules.map(({ name, params }) => ({ name, params })),
        property: '--state-danger-text',
        from: DANGER_BEFORE,
        to: DANGER_AFTER,
      },
    ],
    aliasBridges: [],
    measurements: [
      {
        themeSelector: change.selector,
        foreground: '--state-danger-text',
        background: '--surface-default-bg',
        compositeOver: null,
        ratio: 1,
        threshold: 4.5,
      },
    ],
    reason: 'Synthetic remediation for the gate tests.',
  };
  const candidate = clone(manifest);
  candidate.decisions = [decision];
  candidate.result.tokenSourceSha256 = sha256(changedSource);
  candidate.result.generatedThemeCssSha256 = sha256(changedCss);
  const inputs = {
    manifest: candidate,
    tokens: changedTokens,
    tokenSourceContent: changedSource,
    generatedThemeCss: changedCss,
  };
  const message = captureMessage(() => contract(inputs));
  const recomputed = /recomputed (\d+\.\d+)/.exec(message);
  assert.ok(recomputed, message);
  decision.measurements[0].ratio = Number(recomputed[1]);
  return inputs;
}

function captureMessage(run) {
  try {
    run();
  } catch (error) {
    return error.message;
  }
  assert.fail('expected the gate to reject');
}

test('the empty v2 ledger chains to the frozen v1 and passes on the repository', () => {
  assert.equal(contract(), true);
  assert.deepEqual(manifest.decisions, []);
});

test('the schema rejects unknown fields and unknown decision kinds', () => {
  const extra = clone(manifest);
  extra.unreviewedAllowance = true;
  assert.throws(
    () => contract({ manifest: extra }),
    /manifest\.unreviewedAllowance is not allowed/,
  );

  const inputs = remediation();
  const unknownKind = clone(inputs.manifest);
  unknownKind.decisions[0].kind = 'palette-refresh';
  assert.throws(() => contract({ ...inputs, manifest: unknownKind }), /kind must be one of/);

  const extraField = clone(inputs.manifest);
  extraField.decisions[0].approvedBy = 'self';
  assert.throws(() => contract({ ...inputs, manifest: extraField }), /approvedBy is not allowed/);
});

test('the schema cannot carry a rule the gate does not enforce', () => {
  assert.throws(
    () => validateAgainstSchema(manifest, { ...schema, minProperties: 1 }),
    /schema keyword minProperties at manifest is not enforced/,
  );
  const open = clone(schema);
  delete open.properties.predecessor.additionalProperties;
  assert.throws(
    () => validateAgainstSchema(manifest, open),
    /object schema at manifest\.predecessor must set additionalProperties: false/,
  );
});

test('an unreviewed token or theme change fails the ledger', () => {
  const inputs = remediation();
  const empty = clone(inputs.manifest);
  empty.decisions = [];
  assert.throws(() => contract({ ...inputs, manifest: empty }), /unreviewed token change at/);

  const cssOnly = remediation({ withTokenChange: false });
  const emptyCss = clone(cssOnly.manifest);
  emptyCss.decisions = [];
  assert.throws(
    () => contract({ ...cssOnly, manifest: emptyCss }),
    /unreviewed generatedTheme change: --state-danger-text/,
  );
});

test('a reviewed remediation passes with its measurement recomputed by the gate', () => {
  assert.equal(contract(remediation()), true);
});

test('recorded ratios are recomputed with an explicit tolerance and threshold', () => {
  const inputs = remediation();
  const measured = inputs.manifest.decisions[0].measurements[0];

  const within = clone(inputs.manifest);
  within.decisions[0].measurements[0].ratio = Number((measured.ratio + 0.005).toFixed(3));
  assert.equal(contract({ ...inputs, manifest: within }), true);

  const drifted = clone(inputs.manifest);
  drifted.decisions[0].measurements[0].ratio = measured.ratio + 0.02;
  assert.throws(
    () => contract({ ...inputs, manifest: drifted }),
    /recorded ratio .* \(tolerance ±0\.01\)/,
  );

  const stricter = clone(inputs.manifest);
  stricter.decisions[0].measurements[0].threshold = 7;
  assert.throws(() => contract({ ...inputs, manifest: stricter }), /is below threshold 7/);
});

test('a decision cannot misrecord or invent a change', () => {
  const inputs = remediation();
  const wrongCss = clone(inputs.manifest);
  wrongCss.decisions[0].cssTargets[0].from = 'oklch(10% 0 0)';
  assert.throws(() => contract({ ...inputs, manifest: wrongCss }), /records oklch\(10% 0 0\)/);

  const wrongToken = clone(inputs.manifest);
  wrongToken.decisions[0].tokenTargets[0].to = '{raw.color.danger.900}';
  assert.throws(() => contract({ ...inputs, manifest: wrongToken }), /records .*danger\.900/);

  const invented = clone(inputs.manifest);
  invented.decisions[0].cssTargets.push({
    ...invented.decisions[0].cssTargets[0],
    property: '--state-success-text',
  });
  assert.throws(
    () => contract({ ...inputs, manifest: invented }),
    /--state-success-text .* did not change/,
  );
});

test('every changed identity belongs to exactly one decision', () => {
  const inputs = remediation();
  const overlapping = clone(inputs.manifest);
  overlapping.decisions.push({
    ...clone(overlapping.decisions[0]),
    id: 'danger-text-contrast-duplicate',
    tokenTargets: [],
  });
  assert.throws(
    () => contract({ ...inputs, manifest: overlapping }),
    /belongs to more than one decision \(danger-text-contrast-test, danger-text-contrast-duplicate\)/,
  );
});

test('decisions on the merge-base are append-only', () => {
  const inputs = remediation();
  assert.equal(contract({ ...inputs, baseManifest: manifest }), true, 'appending is allowed');
  assert.equal(
    contract({ ...inputs, baseManifest: inputs.manifest }),
    true,
    'unchanged is allowed',
  );

  const edited = clone(inputs.manifest);
  edited.decisions[0].reason = 'Rewritten after merge.';
  assert.throws(
    () => contract({ ...inputs, manifest: edited, baseManifest: inputs.manifest }),
    /decision danger-text-contrast-test on the merge-base was changed, reordered or removed/,
  );

  const removed = clone(manifest);
  assert.throws(
    () => contract({ manifest: removed, baseManifest: inputs.manifest }),
    /on the merge-base was changed, reordered or removed/,
  );

  const moved = clone(inputs.manifest);
  moved.predecessor.commit = '0'.repeat(40);
  assert.throws(
    () => contract({ ...inputs, baseManifest: moved }),
    /predecessor must not change once v2 is on the merge-base/,
  );
});

test('the predecessor is a real ancestor and v1 stays frozen', () => {
  const fake = clone(manifest);
  fake.predecessor.commit = '0'.repeat(40);
  assert.throws(() => contract({ manifest: fake }), /predecessor commit is unavailable/);

  assert.throws(
    () => contract({ v1ManifestContent: `${v1ManifestContent} ` }),
    /v1 manifest differs from its frozen predecessor commit/,
  );
});

test('alias bridges must be complete and point at the remediated property', () => {
  const inputs = remediation();
  const bridged = clone(inputs.manifest);
  bridged.decisions[0].aliasBridges = [
    { property: '--status-error', resolvesTo: '--state-danger-text' },
  ];
  assert.equal(contract({ ...inputs, manifest: bridged }), true);

  const partial = clone(inputs.manifest);
  partial.decisions[0].aliasBridges = [
    { property: '--text-danger', resolvesTo: '--state-danger-text' },
  ];
  assert.throws(
    () => contract({ ...inputs, manifest: partial }),
    /alias --text-danger in .* is not bridged to --state-danger-text/,
  );

  const unrelated = clone(inputs.manifest);
  unrelated.decisions[0].aliasBridges = [
    { property: '--status-error', resolvesTo: '--text-primary' },
  ];
  assert.throws(
    () => contract({ ...inputs, manifest: unrelated }),
    /must resolve to a property this decision remediates/,
  );
});

test('theme-inline files are outside every remediation', () => {
  const changedInline = `${generatedThemeInlineCss}\n@theme inline { --color-unreviewed: hotpink; }\n`;
  const candidate = clone(manifest);
  candidate.result.generatedThemeInlineCssSha256 = sha256(changedInline);
  assert.throws(
    () => contract({ manifest: candidate, generatedThemeInlineCss: changedInline }),
    /generated theme-inline changed after the predecessor/,
  );
});

test('result digests are bound to the repository files', () => {
  const candidate = clone(manifest);
  candidate.result.themeExtensionCssSha256 = '0'.repeat(64);
  assert.throws(
    () => contract({ manifest: candidate }),
    /theme extension CSS result digest mismatch/,
  );
});

test('governance files are owned in CODEOWNERS', () => {
  const owners = read('.github/CODEOWNERS');
  for (const governed of [
    '/design-tokens/migrations/',
    '/scripts/theme/theme-ownership-decision-contract.mjs',
    '/scripts/theme/theme-ownership-remediation-contract.mjs',
    '/scripts/theme/color-contrast.mjs',
    '/scripts/theme/__tests__/theme-ownership-remediation-contract.test.mjs',
  ]) {
    assert.match(
      owners,
      new RegExp(`^${governed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+@Halildeu$`, 'm'),
      governed,
    );
  }
});
