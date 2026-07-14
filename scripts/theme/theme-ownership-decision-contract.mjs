import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertNoCuratedShadow,
  diffDeclarationMultisets,
  normalizeAtRuleParams,
  normalizeSelector,
  normalizeValue,
  parseDeclarationMultiset,
  sha256,
} from './theme-css-contract.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const POSITIVE_INTEGER = (value) => Number.isInteger(value) && value > 0;
const FULL_GIT_SHA = /^[a-f0-9]{40}$/;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASELINE_PATHS = Object.freeze({
  themeCss: 'apps/mfe-shell/src/styles/theme.css',
  themeInlineCss: 'apps/mfe-shell/src/styles/generated-theme-inline.css',
  tokens: 'design-tokens/figma.tokens.json',
  generator: 'scripts/theme/generate-theme-css.mjs',
});
const historicalGenerationCache = new Map();

function fail(message) {
  const error = new Error(`Theme ownership decision contract rejected: ${message}`);
  error.code = 'THEME_DECISION_CONTRACT';
  throw error;
}

function exactObject(value, label, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} keys must be exactly [${expected.join(', ')}], got [${actual.join(', ')}]`);
  }
}

function assertString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') fail(`${label} must be a non-empty string`);
}

function assertDigest(value, label) {
  if (typeof value !== 'string' || !SHA256.test(value)) fail(`${label} must be a SHA-256 hex`);
}

function assertPositiveInteger(value, label) {
  if (!POSITIVE_INTEGER(value)) fail(`${label} must be a positive integer`);
}

function assertBoolean(value, label) {
  if (typeof value !== 'boolean') fail(`${label} must be a boolean`);
}

function assertUnique(values, label) {
  if (new Set(values).size !== values.length) fail(`${label} contains duplicates`);
}

function resolveJsonPointer(root, pointer) {
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) {
    fail(`invalid JSON pointer ${JSON.stringify(pointer)}`);
  }
  let current = root;
  for (const rawSegment of pointer.slice(1).split('/')) {
    const segment = rawSegment.replace(/~1/g, '/').replace(/~0/g, '~');
    if (['__proto__', 'prototype', 'constructor'].includes(segment)) {
      fail(`unsafe JSON pointer segment ${JSON.stringify(segment)}`);
    }
    if (!current || typeof current !== 'object' || !Object.hasOwn(current, segment)) {
      fail(`JSON pointer does not resolve: ${pointer}`);
    }
    current = current[segment];
  }
  return current;
}

function validateFileDigestRecord(record, label) {
  exactObject(record, label, ['path', 'sha256']);
  assertString(record.path, `${label}.path`);
  if (
    record.path.startsWith('/') ||
    record.path.includes('..') ||
    !/^[a-zA-Z0-9._/-]+$/.test(record.path)
  ) {
    fail(`${label}.path must be repo-relative`);
  }
  assertDigest(record.sha256, `${label}.sha256`);
}

function assertCanonicalBaselinePath(record, key) {
  if (record.path !== BASELINE_PATHS[key]) {
    fail(`baseline.${key}.path must be ${BASELINE_PATHS[key]}`);
  }
}

function validateManifestShape(manifest) {
  exactObject(manifest, 'manifest', [
    'schemaVersion',
    'kind',
    'baseline',
    'inventory',
    'decisions',
    'result',
    'evidence',
  ]);
  if (manifest.schemaVersion !== 1) fail('schemaVersion must be 1');
  if (manifest.kind !== 'theme-ownership-migration-decisions') fail('unexpected kind');

  exactObject(manifest.baseline, 'baseline', [
    'commit',
    'themeCss',
    'themeInlineCss',
    'tokens',
    'generator',
    'unreconciledGeneratedThemeSha256',
  ]);
  if (!FULL_GIT_SHA.test(manifest.baseline.commit)) fail('baseline.commit must be full SHA');
  validateFileDigestRecord(manifest.baseline.themeCss, 'baseline.themeCss');
  validateFileDigestRecord(manifest.baseline.themeInlineCss, 'baseline.themeInlineCss');
  validateFileDigestRecord(manifest.baseline.tokens, 'baseline.tokens');
  validateFileDigestRecord(manifest.baseline.generator, 'baseline.generator');
  for (const key of Object.keys(BASELINE_PATHS)) {
    assertCanonicalBaselinePath(manifest.baseline[key], key);
  }
  assertDigest(
    manifest.baseline.unreconciledGeneratedThemeSha256,
    'baseline.unreconciledGeneratedThemeSha256',
  );

  const inventoryKeys = [
    'themeDeclarationTotal',
    'themeCustomPropertyDeclarations',
    'themeCustomPropertyIdentities',
    'generatedThemeDeclarationTotal',
    'generatedThemeCustomPropertyIdentities',
    'curatedThemeCustomPropertyIdentities',
    'valueDriftIdentities',
    'duplicateConflictIdentities',
    'themeInlineDeclarations',
    'generatedThemeInlineDeclarations',
    'curatedThemeInlineDeclarations',
  ];
  exactObject(manifest.inventory, 'inventory', inventoryKeys);
  for (const key of inventoryKeys)
    assertPositiveInteger(manifest.inventory[key], `inventory.${key}`);

  if (!Array.isArray(manifest.decisions) || manifest.decisions.length !== 3) {
    fail('decisions must contain exactly three reviewed decisions');
  }
  const decisionIds = manifest.decisions.map(({ id }) => id);
  assertUnique(decisionIds, 'decision IDs');
  const byAction = new Map(manifest.decisions.map((decision) => [decision.action, decision]));
  if (byAction.size !== 3) fail('decision actions must be unique');

  const source = byAction.get('preserve-runtime-in-token-source');
  exactObject(source, 'source decision', [
    'id',
    'action',
    'candidateIdentityCount',
    'targets',
    'reason',
  ]);
  assertString(source.id, 'source decision.id');
  assertString(source.reason, 'source decision.reason');
  assertPositiveInteger(source.candidateIdentityCount, 'source decision.candidateIdentityCount');
  if (!Array.isArray(source.targets) || source.targets.length === 0) fail('source targets missing');
  for (const [index, target] of source.targets.entries()) {
    exactObject(target, `source target ${index}`, [
      'jsonPointer',
      'expectedValue',
      'affectedIdentityCount',
    ]);
    assertString(target.jsonPointer, `source target ${index}.jsonPointer`);
    assertString(target.expectedValue, `source target ${index}.expectedValue`);
    assertPositiveInteger(
      target.affectedIdentityCount,
      `source target ${index}.affectedIdentityCount`,
    );
  }
  assertUnique(
    source.targets.map(({ jsonPointer }) => jsonPointer),
    'source target pointers',
  );
  const sourceCount = source.targets.reduce(
    (total, { affectedIdentityCount }) => total + affectedIdentityCount,
    0,
  );
  if (sourceCount !== source.candidateIdentityCount) fail('source target fan-out count mismatch');

  const bridge = byAction.get('preserve-runtime-indirection-in-generator');
  exactObject(bridge, 'bridge decision', [
    'id',
    'action',
    'candidateIdentityCount',
    'bindings',
    'reason',
  ]);
  assertString(bridge.id, 'bridge decision.id');
  assertString(bridge.reason, 'bridge decision.reason');
  assertPositiveInteger(bridge.candidateIdentityCount, 'bridge decision.candidateIdentityCount');
  if (!Array.isArray(bridge.bindings) || bridge.bindings.length === 0) {
    fail('bridge bindings missing');
  }
  for (const [index, binding] of bridge.bindings.entries()) {
    exactObject(binding, `bridge binding ${index}`, ['property', 'expectedValue']);
    if (!/^--[a-z0-9-]+$/.test(binding.property))
      fail(`invalid bridge property ${binding.property}`);
    assertString(binding.expectedValue, `bridge binding ${index}.expectedValue`);
  }
  assertUnique(
    bridge.bindings.map(({ property }) => property),
    'bridge properties',
  );
  if (bridge.bindings.length * 2 !== bridge.candidateIdentityCount) {
    fail('bridge binding fan-out count mismatch');
  }

  const removal = byAction.get('remove-redundant-override');
  exactObject(removal, 'removal decision', [
    'id',
    'action',
    'candidateIdentityCount',
    'property',
    'scopes',
    'expectedValue',
    'important',
    'reason',
  ]);
  assertString(removal.id, 'removal decision.id');
  assertString(removal.reason, 'removal decision.reason');
  assertPositiveInteger(removal.candidateIdentityCount, 'removal candidateIdentityCount');
  if (!/^--[a-z0-9-]+$/.test(removal.property)) fail('invalid removal property');
  if (!Array.isArray(removal.scopes) || removal.scopes.length !== removal.candidateIdentityCount) {
    fail('removal scopes/count mismatch');
  }
  removal.scopes.forEach((scope, index) => assertString(scope, `removal scope ${index}`));
  assertUnique(removal.scopes, 'removal scopes');
  assertString(removal.expectedValue, 'removal expectedValue');
  assertBoolean(removal.important, 'removal important');

  if (
    source.candidateIdentityCount + bridge.candidateIdentityCount !==
    manifest.inventory.valueDriftIdentities
  ) {
    fail('reviewed drift decisions do not partition value-drift inventory');
  }
  if (removal.candidateIdentityCount !== manifest.inventory.duplicateConflictIdentities) {
    fail('removal decision does not partition duplicate inventory');
  }

  exactObject(manifest.result, 'result', [
    'tokenSourceSha256',
    'generatedThemeCssSha256',
    'themeExtensionCssSha256',
    'generatedThemeInlineCssSha256',
    'themeInlineExtensionCssSha256',
    'removedRedundantDeclarations',
    'composedThemeCustomPropertyIdentities',
    'composedThemeInlineDeclarations',
  ]);
  for (const key of [
    'tokenSourceSha256',
    'generatedThemeCssSha256',
    'themeExtensionCssSha256',
    'generatedThemeInlineCssSha256',
    'themeInlineExtensionCssSha256',
  ]) {
    assertDigest(manifest.result[key], `result.${key}`);
  }
  for (const key of [
    'removedRedundantDeclarations',
    'composedThemeCustomPropertyIdentities',
    'composedThemeInlineDeclarations',
  ]) {
    assertPositiveInteger(manifest.result[key], `result.${key}`);
  }

  exactObject(manifest.evidence, 'evidence', [
    'sourceFix',
    'wholeMfeAcceptance',
    'wholeMfeRun',
    'reviewBoundary',
  ]);
  for (const [key, value] of Object.entries(manifest.evidence)) {
    assertString(value, `evidence.${key}`);
  }

  return { source, bridge, removal };
}

function runGit(args, label, options = {}) {
  try {
    return execFileSync('git', ['-C', repoRoot, ...args], {
      encoding: Object.hasOwn(options, 'encoding') ? options.encoding : 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    fail(`${label} is unavailable from the local Git object database`);
  }
}

function readHistoricalBlob(commit, record, label) {
  const objectSpec = `${commit}:${record.path}`;
  const objectType = String(runGit(['cat-file', '-t', objectSpec], `${label} blob`)).trim();
  if (objectType !== 'blob') fail(`${label} is not a Git blob`);
  const content = runGit(['cat-file', 'blob', objectSpec], `${label} blob`, { encoding: null });
  const actualDigest = sha256(content);
  if (actualDigest !== record.sha256) {
    fail(`${label} historical blob digest mismatch`);
  }
  return content;
}

function assertHistoricalCommit(commit) {
  const resolved = String(
    runGit(['rev-parse', '--verify', `${commit}^{commit}`], 'baseline commit'),
  ).trim();
  if (resolved !== commit) fail('baseline.commit does not resolve to the declared commit');
  try {
    execFileSync('git', ['-C', repoRoot, 'merge-base', '--is-ancestor', commit, 'HEAD'], {
      stdio: 'ignore',
    });
  } catch {
    fail('baseline.commit must be an ancestor of HEAD');
  }
}

function generateHistoricalArtifacts({ commit, generator, tokens }) {
  const cacheKey = `${commit}:${sha256(generator)}:${sha256(tokens)}`;
  const cached = historicalGenerationCache.get(cacheKey);
  if (cached) return cached;

  const temporaryRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'theme-ownership-baseline-')));
  const generatorPath = path.join(temporaryRoot, BASELINE_PATHS.generator);
  const tokenPath = path.join(temporaryRoot, BASELINE_PATHS.tokens);
  const themePath = path.join(temporaryRoot, BASELINE_PATHS.themeCss);
  const themeInlinePath = path.join(temporaryRoot, BASELINE_PATHS.themeInlineCss);
  try {
    for (const filePath of [generatorPath, tokenPath, themePath, themeInlinePath]) {
      mkdirSync(path.dirname(filePath), { recursive: true });
    }
    mkdirSync(path.join(temporaryRoot, 'design-tokens/generated'), { recursive: true });
    writeFileSync(generatorPath, generator);
    writeFileSync(tokenPath, tokens);
    execFileSync(
      process.execPath,
      [
        '--permission',
        `--allow-fs-read=${temporaryRoot}`,
        `--allow-fs-write=${temporaryRoot}`,
        generatorPath,
      ],
      {
        cwd: temporaryRoot,
        env: {},
        maxBuffer: 4 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 10_000,
      },
    );
    const result = Object.freeze({
      themeCss: readFileSync(themePath, 'utf8'),
      themeInlineCss: readFileSync(themeInlinePath, 'utf8'),
    });
    historicalGenerationCache.set(cacheKey, result);
    return result;
  } catch {
    fail('historical generator could not reproduce the unreconciled artifacts');
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function loadHistoricalBaseline(manifest) {
  assertHistoricalCommit(manifest.baseline.commit);
  const blobs = {};
  for (const key of Object.keys(BASELINE_PATHS)) {
    blobs[key] = readHistoricalBlob(
      manifest.baseline.commit,
      manifest.baseline[key],
      `baseline.${key}`,
    );
  }
  const generated = generateHistoricalArtifacts({
    commit: manifest.baseline.commit,
    generator: blobs.generator,
    tokens: blobs.tokens,
  });
  if (sha256(generated.themeCss) !== manifest.baseline.unreconciledGeneratedThemeSha256) {
    fail('unreconciled generated theme digest does not match historical generator output');
  }
  return Object.freeze({
    themeCss: blobs.themeCss.toString('utf8'),
    themeInlineCss: blobs.themeInlineCss.toString('utf8'),
    tokens: JSON.parse(blobs.tokens.toString('utf8')),
    generatedThemeCss: generated.themeCss,
    generatedThemeInlineCss: generated.themeInlineCss,
  });
}

function escapeJsonPointerSegment(segment) {
  return String(segment).replace(/~/g, '~0').replace(/\//g, '~1');
}

function collectJsonLeafChanges(expected, actual, pointer = '') {
  const expectedObject = expected !== null && typeof expected === 'object';
  const actualObject = actual !== null && typeof actual === 'object';
  const bothArrays = Array.isArray(expected) && Array.isArray(actual);
  const bothRecords =
    expectedObject && actualObject && !Array.isArray(expected) && !Array.isArray(actual);
  if (bothArrays || bothRecords) {
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
    return [...keys].flatMap((key) =>
      collectJsonLeafChanges(
        expected[key],
        actual[key],
        `${pointer}/${escapeJsonPointerSegment(key)}`,
      ),
    );
  }
  return JSON.stringify(expected) === JSON.stringify(actual) ? [] : [pointer];
}

function assertExactSet(actual, expected, label) {
  const actualSorted = [...actual].sort();
  const expectedSorted = [...expected].sort();
  if (JSON.stringify(actualSorted) !== JSON.stringify(expectedSorted)) {
    fail(
      `${label} mismatch: expected ${expectedSorted.length} exact items, got ${actualSorted.length}`,
    );
  }
}

function expectedAppearanceSelectors(mode) {
  const themed = normalizeSelector(
    `:root[data-theme="${mode}"], [data-theme-scope][data-theme="${mode}"]`,
  );
  return mode === 'serban-light'
    ? new Set([normalizeSelector(':root'), themed])
    : new Set([themed]);
}

function validateSourceBindings(source, tokens, generatedThemeCss) {
  const declarations = parseDeclarationMultiset(generatedThemeCss);
  const identityKeys = new Set();
  for (const target of source.targets) {
    const actualValue = resolveJsonPointer(tokens, target.jsonPointer);
    if (actualValue !== target.expectedValue) {
      fail(
        `${target.jsonPointer} expected ${JSON.stringify(target.expectedValue)}, got ${JSON.stringify(actualValue)}`,
      );
    }
    const segments = target.jsonPointer.slice(1).split('/');
    const semanticIndex = segments.indexOf('semantic');
    const colorIndex = segments.indexOf('color', semanticIndex + 1);
    const modesIndex = segments.indexOf('modes', colorIndex + 1);
    if (semanticIndex !== 0 || colorIndex !== 1 || modesIndex < 3 || segments.at(-1) !== 'value') {
      fail(`source pointer is not a semantic color mode value: ${target.jsonPointer}`);
    }
    const property = `--${segments.slice(colorIndex + 1, modesIndex).join('-')}`;
    const mode = segments[modesIndex + 1];
    const expectedSelectors = expectedAppearanceSelectors(mode);
    const matched = [...declarations.values()].filter(
      (entry) =>
        entry.atRules.length === 0 &&
        entry.property === property &&
        expectedSelectors.has(entry.selector) &&
        entry.occurrences.length === 1 &&
        entry.occurrences[0].value === normalizeValue(target.expectedValue),
    );
    if (matched.length !== target.affectedIdentityCount) {
      fail(
        `${target.jsonPointer} binds ${matched.length} generated identities, expected ${target.affectedIdentityCount}`,
      );
    }
    for (const entry of matched) identityKeys.add(entry.key);
  }
  return identityKeys;
}

function findBridgeEntry(declarations, property, selector, atRules) {
  return [...declarations.values()].find(
    (entry) =>
      entry.property === property &&
      entry.selector === selector &&
      JSON.stringify(entry.atRules) === JSON.stringify(atRules),
  );
}

function validateBridgeBindings(bridge, generatedThemeCss) {
  const declarations = parseDeclarationMultiset(generatedThemeCss);
  const identityKeys = new Set();
  const darkSelector = normalizeSelector('[data-mode="dark"]');
  const systemSelector = normalizeSelector(
    ':root[data-mode="system"]:not([data-theme="serban-hc"]), [data-theme-scope][data-mode="system"]:not([data-theme="serban-hc"])',
  );
  const systemAtRules = Object.freeze([
    Object.freeze({
      name: 'media',
      params: normalizeAtRuleParams('media', '(prefers-color-scheme: dark)'),
    }),
  ]);

  for (const binding of bridge.bindings) {
    const expectedValue = normalizeValue(binding.expectedValue);
    for (const [label, selector, atRules] of [
      ['dark', darkSelector, []],
      ['system-dark', systemSelector, systemAtRules],
    ]) {
      const entry = findBridgeEntry(declarations, binding.property, selector, atRules);
      if (
        !entry ||
        entry.occurrences.length !== 1 ||
        entry.occurrences[0].value !== expectedValue ||
        entry.occurrences[0].important
      ) {
        fail(`${binding.property} ${label} bridge is not bound to ${binding.expectedValue}`);
      }
      identityKeys.add(entry.key);
    }
  }
  return identityKeys;
}

function countDeclarations(multiset) {
  return [...multiset.values()].reduce((total, entry) => total + entry.occurrences.length, 0);
}

function customPropertyEntries(multiset) {
  return [...multiset.values()].filter(({ property }) => property.startsWith('--'));
}

function countCustomPropertyDeclarations(multiset) {
  return customPropertyEntries(multiset).reduce(
    (total, entry) => total + entry.occurrences.length,
    0,
  );
}

function customPropertyDiffIdentityKeys(diff) {
  return new Set(
    [...diff.missing, ...diff.unexpected]
      .filter(({ property }) => property.startsWith('--'))
      .map(({ identityKey }) => identityKey),
  );
}

function formatRemovalScope(delta) {
  const ancestry = delta.atRules
    .map(({ name, params }) => `@${name}${params ? ` ${params}` : ''}`)
    .join(' > ');
  return `${ancestry ? `${ancestry} > ` : ''}${delta.selector}`;
}

function validateHistoricalProvenance({
  manifest,
  source,
  bridge,
  removal,
  historical,
  tokens,
  generatedThemeCss,
  themeExtensionCss,
  generatedThemeInlineCss,
  themeInlineExtensionCss,
  sourceIdentityKeys,
  bridgeIdentityKeys,
}) {
  const tokenChanges = new Set(collectJsonLeafChanges(historical.tokens, tokens));
  const reviewedTokenPointers = new Set(source.targets.map(({ jsonPointer }) => jsonPointer));
  assertExactSet(tokenChanges, reviewedTokenPointers, 'historical token-source decision partition');

  const drift = diffDeclarationMultisets(historical.generatedThemeCss, generatedThemeCss);
  const driftIdentityKeys = customPropertyDiffIdentityKeys(drift);
  const reviewedDriftIdentityKeys = new Set([...sourceIdentityKeys, ...bridgeIdentityKeys]);
  if (reviewedDriftIdentityKeys.size !== sourceIdentityKeys.size + bridgeIdentityKeys.size) {
    fail('source and bridge decisions overlap');
  }
  assertExactSet(
    driftIdentityKeys,
    reviewedDriftIdentityKeys,
    'historical generated-theme decision partition',
  );
  if (sourceIdentityKeys.size !== source.candidateIdentityCount) {
    fail('source decision identity inventory mismatch');
  }
  if (bridgeIdentityKeys.size !== bridge.candidateIdentityCount) {
    fail('bridge decision identity inventory mismatch');
  }

  const historicalInlineGeneration = diffDeclarationMultisets(
    historical.generatedThemeInlineCss,
    generatedThemeInlineCss,
  );
  if (!historicalInlineGeneration.equal) {
    fail('generated theme-inline differs from the historical generator output');
  }

  const composedThemeCss = `${generatedThemeCss}\n${themeExtensionCss}`;
  const composedThemeDiff = diffDeclarationMultisets(historical.themeCss, composedThemeCss);
  if (composedThemeDiff.unexpected.length > 0) {
    fail(
      `composed theme contains ${composedThemeDiff.unexpected.length} declaration not present in the historical baseline`,
    );
  }
  const removedOccurrences = composedThemeDiff.missing.reduce(
    (total, delta) => total + delta.count,
    0,
  );
  if (
    removedOccurrences !== removal.candidateIdentityCount ||
    composedThemeDiff.missing.length !== removal.candidateIdentityCount
  ) {
    fail('historical removal decision is not the exact composed-theme difference');
  }
  const expectedRemovalValue = normalizeValue(removal.expectedValue);
  for (const delta of composedThemeDiff.missing) {
    if (
      delta.count !== 1 ||
      delta.property !== removal.property ||
      delta.value !== expectedRemovalValue ||
      delta.important !== removal.important
    ) {
      fail('historical removal payload does not match the reviewed decision');
    }
  }
  assertExactSet(
    new Set(composedThemeDiff.missing.map(formatRemovalScope)),
    new Set(removal.scopes),
    'historical removal scopes',
  );

  const composedInlineDiff = diffDeclarationMultisets(
    historical.themeInlineCss,
    `${generatedThemeInlineCss}\n${themeInlineExtensionCss}`,
  );
  if (!composedInlineDiff.equal) {
    fail('composed theme-inline differs from the historical baseline');
  }

  const baselineTheme = parseDeclarationMultiset(historical.themeCss);
  const generatedTheme = parseDeclarationMultiset(generatedThemeCss);
  const curatedTheme = parseDeclarationMultiset(themeExtensionCss);
  const baselineInline = parseDeclarationMultiset(historical.themeInlineCss);
  const generatedInline = parseDeclarationMultiset(generatedThemeInlineCss);
  const curatedInline = parseDeclarationMultiset(themeInlineExtensionCss);
  const actualInventory = {
    themeDeclarationTotal: countDeclarations(baselineTheme),
    themeCustomPropertyDeclarations: countCustomPropertyDeclarations(baselineTheme),
    themeCustomPropertyIdentities: customPropertyEntries(baselineTheme).length,
    generatedThemeDeclarationTotal: countDeclarations(generatedTheme),
    generatedThemeCustomPropertyIdentities: customPropertyEntries(generatedTheme).length,
    curatedThemeCustomPropertyIdentities: customPropertyEntries(curatedTheme).length,
    valueDriftIdentities: driftIdentityKeys.size,
    duplicateConflictIdentities: composedThemeDiff.missing.length,
    themeInlineDeclarations: countDeclarations(baselineInline),
    generatedThemeInlineDeclarations: countDeclarations(generatedInline),
    curatedThemeInlineDeclarations: countDeclarations(curatedInline),
  };
  for (const [key, actual] of Object.entries(actualInventory)) {
    if (manifest.inventory[key] !== actual) {
      fail(`inventory.${key} is ${manifest.inventory[key]}, derived historical value is ${actual}`);
    }
  }
  if (manifest.result.removedRedundantDeclarations !== removedOccurrences) {
    fail('result removed declaration count is not historically derived');
  }
}

/**
 * Validate the reviewed migration ledger against canonical token sources,
 * rendered generator output and content-addressed curated results.
 */
export function assertThemeOwnershipDecisionContract({
  manifest,
  tokenSourceContent,
  tokens,
  generatedThemeCss,
  themeExtensionCss,
  generatedThemeInlineCss,
  themeInlineExtensionCss,
}) {
  const { source, bridge, removal } = validateManifestShape(manifest);
  if (typeof tokenSourceContent !== 'string') fail('tokenSourceContent is required');
  const historical = loadHistoricalBaseline(manifest);
  if (sha256(tokenSourceContent) !== manifest.result.tokenSourceSha256) {
    fail('token source result digest mismatch');
  }
  const sourceIdentityKeys = validateSourceBindings(source, tokens, generatedThemeCss);
  const bridgeIdentityKeys = validateBridgeBindings(bridge, generatedThemeCss);

  for (const [label, content, expected] of [
    ['generated theme CSS', generatedThemeCss, manifest.result.generatedThemeCssSha256],
    ['theme extension CSS', themeExtensionCss, manifest.result.themeExtensionCssSha256],
    [
      'generated theme-inline CSS',
      generatedThemeInlineCss,
      manifest.result.generatedThemeInlineCssSha256,
    ],
    [
      'theme-inline extension CSS',
      themeInlineExtensionCss,
      manifest.result.themeInlineExtensionCssSha256,
    ],
  ]) {
    if (typeof content !== 'string' || sha256(content) !== expected) {
      fail(`${label} result digest mismatch`);
    }
  }

  assertNoCuratedShadow(generatedThemeCss, themeExtensionCss);
  assertNoCuratedShadow(generatedThemeInlineCss, themeInlineExtensionCss);
  validateHistoricalProvenance({
    manifest,
    source,
    bridge,
    removal,
    historical,
    tokens,
    generatedThemeCss,
    themeExtensionCss,
    generatedThemeInlineCss,
    themeInlineExtensionCss,
    sourceIdentityKeys,
    bridgeIdentityKeys,
  });
  const composedTheme = parseDeclarationMultiset(`${generatedThemeCss}\n${themeExtensionCss}`);
  const customPropertyIdentities = [...composedTheme.values()].filter(({ property }) =>
    property.startsWith('--'),
  ).length;
  if (customPropertyIdentities !== manifest.result.composedThemeCustomPropertyIdentities) {
    fail(`composed theme identity count is ${customPropertyIdentities}`);
  }
  const inlineDeclarations =
    countDeclarations(parseDeclarationMultiset(generatedThemeInlineCss)) +
    countDeclarations(parseDeclarationMultiset(themeInlineExtensionCss));
  if (inlineDeclarations !== manifest.result.composedThemeInlineDeclarations) {
    fail(`composed theme-inline declaration count is ${inlineDeclarations}`);
  }
  if (
    manifest.result.removedRedundantDeclarations !== manifest.inventory.duplicateConflictIdentities
  ) {
    fail('removed redundant declaration count does not match reviewed inventory');
  }

  return true;
}
