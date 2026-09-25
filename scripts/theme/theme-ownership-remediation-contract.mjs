import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contrastRatio, compositeOver, parseCssColor, RATIO_TOLERANCE } from './color-contrast.mjs';
import {
  assertNoCuratedShadow,
  diffDeclarationMultisets,
  normalizeAtRuleParams,
  normalizeSelector,
  normalizeValue,
  parseDeclarationMultiset,
  sha256,
} from './theme-css-contract.mjs';
import {
  assertThemeOwnershipDecisionContract,
  collectJsonLeafChanges,
  resolveAuthorityCommit,
  resolveJsonPointer,
} from './theme-ownership-decision-contract.mjs';

/**
 * #1021 — theme ownership remediation ledger (v2).
 *
 * v1 is frozen at its own result commit (`predecessor.commit`) and verified
 * there, from Git objects. Every token or theme change after that commit must
 * be the exact union of the reviewed v2 decisions, each decision's contrast
 * measurements are recomputed here, and decisions already on the merge-base
 * can never be edited or removed — the ledger only grows.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const REMEDIATION_PATHS = Object.freeze({
  v1: 'design-tokens/migrations/theme-ownership-decisions.v1.json',
  v2: 'design-tokens/migrations/theme-ownership-decisions.v2.json',
  schema: 'design-tokens/migrations/theme-ownership-decisions.v2.schema.json',
  tokens: 'design-tokens/figma.tokens.json',
  generatedTheme: 'apps/mfe-shell/src/styles/theme.css',
  themeExtension: 'apps/mfe-shell/src/styles/theme.extensions.css',
  generatedThemeInline: 'apps/mfe-shell/src/styles/generated-theme-inline.css',
  themeInlineExtension: 'apps/mfe-shell/src/styles/theme-inline.extensions.css',
});
const MAX_VAR_DEPTH = 16;
const SCHEMA_KEYWORDS = new Set([
  '$schema',
  '$id',
  '$defs',
  '$ref',
  'title',
  'description',
  'type',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'minItems',
  'enum',
  'const',
  'pattern',
  'minLength',
  'minimum',
  'maximum',
]);

function fail(message) {
  const error = new Error(`Theme ownership remediation contract rejected: ${message}`);
  error.code = 'THEME_REMEDIATION_CONTRACT';
  throw error;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
}

/**
 * Validate against the checked-in JSON Schema. Only the keywords above are
 * implemented; any other keyword fails, so the schema cannot silently promise
 * a rule nobody enforces. Every object schema must close itself.
 */
export function validateAgainstSchema(value, schema, root = schema, at = 'manifest') {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    fail(`schema at ${at} must be an object`);
  }
  for (const keyword of Object.keys(schema)) {
    if (!SCHEMA_KEYWORDS.has(keyword)) fail(`schema keyword ${keyword} at ${at} is not enforced`);
  }
  if (schema.$ref !== undefined) {
    const match = /^#\/\$defs\/([A-Za-z0-9]+)$/.exec(schema.$ref);
    if (!match || !root.$defs || !Object.hasOwn(root.$defs, match[1])) {
      fail(`unresolvable schema reference ${schema.$ref}`);
    }
    return validateAgainstSchema(value, root.$defs[match[1]], root, at);
  }
  if (schema.const !== undefined && canonical(value) !== canonical(schema.const)) {
    fail(`${at} must be ${JSON.stringify(schema.const)}`);
  }
  if (
    schema.enum !== undefined &&
    !schema.enum.some((option) => canonical(option) === canonical(value))
  ) {
    fail(`${at} must be one of ${JSON.stringify(schema.enum)}`);
  }
  const actualType = typeOf(value);
  if (schema.type !== undefined) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    const matches = allowed.some(
      (type) => type === actualType || (type === 'number' && actualType === 'integer'),
    );
    if (!matches) fail(`${at} must be ${allowed.join(' or ')}, got ${actualType}`);
  }
  if (actualType === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      fail(`${at} is shorter than ${schema.minLength}`);
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, 'u').test(value)) {
      fail(`${at} does not match ${schema.pattern}`);
    }
  }
  if (actualType === 'number' || actualType === 'integer') {
    if (!Number.isFinite(value)) fail(`${at} must be finite`);
    if (schema.minimum !== undefined && value < schema.minimum)
      fail(`${at} is below ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum)
      fail(`${at} is above ${schema.maximum}`);
  }
  if (actualType === 'array') {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      fail(`${at} needs at least ${schema.minItems} item(s)`);
    }
    if (schema.items !== undefined) {
      value.forEach((item, index) =>
        validateAgainstSchema(item, schema.items, root, `${at}[${index}]`),
      );
    }
  }
  const describesObject =
    schema.type === 'object' || (Array.isArray(schema.type) && schema.type.includes('object'));
  if (describesObject && schema.additionalProperties !== false) {
    fail(`object schema at ${at} must set additionalProperties: false`);
  }
  if (actualType === 'object') {
    const properties = schema.properties ?? {};
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(value, key)) fail(`${at}.${key} is required`);
    }
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(properties, key)) {
        if (schema.additionalProperties === false) fail(`${at}.${key} is not allowed`);
        continue;
      }
      validateAgainstSchema(value[key], properties[key], root, `${at}.${key}`);
    }
  }
  return true;
}

function runGit(args, label) {
  try {
    return execFileSync('git', ['-C', repoRoot, ...args], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    fail(`${label} is unavailable from the local Git object database`);
  }
}

function isAncestor(ancestor, descendant) {
  try {
    execFileSync('git', ['-C', repoRoot, 'merge-base', '--is-ancestor', ancestor, descendant], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function readBlob(commit, filePath, label) {
  return runGit(['cat-file', 'blob', `${commit}:${filePath}`], label);
}

function blobExists(commit, filePath) {
  try {
    execFileSync('git', ['-C', repoRoot, 'cat-file', '-e', `${commit}:${filePath}`], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function identityKey(atRules, selector, property) {
  return JSON.stringify([
    atRules.map(({ name, params }) => [
      name.toLowerCase(),
      normalizeAtRuleParams(name.toLowerCase(), params),
    ]),
    normalizeSelector(selector),
    property,
  ]);
}

/** v1 stays frozen: same bytes as at its commit, and it still verifies there. */
function verifyPredecessor(manifest, v1ManifestContent, authority, authorityRef) {
  const { commit } = manifest.predecessor;
  const resolved = String(
    runGit(['rev-parse', '--verify', `${commit}^{commit}`], 'predecessor commit'),
  ).trim();
  if (resolved !== commit) fail('predecessor.commit does not resolve to the declared commit');
  if (!isAncestor(commit, 'HEAD')) fail('predecessor.commit must be an ancestor of HEAD');
  if (!isAncestor(commit, authority.commit)) {
    fail(`predecessor.commit must be an ancestor of canonical authority ${authority.ref}`);
  }

  const frozenV1 = readBlob(commit, REMEDIATION_PATHS.v1, 'predecessor v1 manifest');
  if (typeof v1ManifestContent !== 'string' || sha256(v1ManifestContent) !== sha256(frozenV1)) {
    fail('v1 manifest differs from its frozen predecessor commit');
  }
  const at = Object.fromEntries(
    [
      'tokens',
      'generatedTheme',
      'themeExtension',
      'generatedThemeInline',
      'themeInlineExtension',
    ].map((key) => [key, readBlob(commit, REMEDIATION_PATHS[key], `predecessor ${key}`)]),
  );
  assertThemeOwnershipDecisionContract({
    manifest: JSON.parse(frozenV1),
    tokenSourceContent: at.tokens,
    tokens: JSON.parse(at.tokens),
    generatedThemeCss: at.generatedTheme,
    themeExtensionCss: at.themeExtension,
    generatedThemeInlineCss: at.generatedThemeInline,
    themeInlineExtensionCss: at.themeInlineExtension,
    authorityRef,
  });
  return at;
}

/** Decisions already on the merge-base are immutable; the ledger only appends. */
function verifyAppendOnly(manifest, baseManifest) {
  if (baseManifest === null) return;
  if (canonical(baseManifest.predecessor) !== canonical(manifest.predecessor)) {
    fail('predecessor must not change once v2 is on the merge-base');
  }
  baseManifest.decisions.forEach((decision, index) => {
    const current = manifest.decisions[index];
    if (!current || canonical(current) !== canonical(decision)) {
      fail(`decision ${decision.id} on the merge-base was changed, reordered or removed`);
    }
  });
}

function verifyTokenPartition(decisions, previousTokens, tokens, owners) {
  const changed = new Set(collectJsonLeafChanges(previousTokens, tokens));
  const reviewed = new Set();
  for (const decision of decisions) {
    for (const target of decision.tokenTargets) {
      const owner = `token ${target.jsonPointer}`;
      if (owners.has(owner)) {
        fail(`${owner} belongs to more than one decision (${owners.get(owner)}, ${decision.id})`);
      }
      owners.set(owner, decision.id);
      reviewed.add(target.jsonPointer);
      const before = resolveJsonPointer(previousTokens, target.jsonPointer);
      const after = resolveJsonPointer(tokens, target.jsonPointer);
      if (before !== target.from || after !== target.to) {
        fail(
          `${decision.id} ${target.jsonPointer} records ${JSON.stringify(target.from)} → ${JSON.stringify(target.to)}, repository has ${JSON.stringify(before)} → ${JSON.stringify(after)}`,
        );
      }
    }
  }
  for (const pointer of changed) {
    if (!reviewed.has(pointer)) fail(`unreviewed token change at ${pointer}`);
  }
  for (const pointer of reviewed) {
    if (!changed.has(pointer)) fail(`token target ${pointer} did not change`);
  }
}

function changedDeclarations(label, before, after) {
  const diff = diffDeclarationMultisets(before, after);
  const changed = new Map(diff.changed.map((entry) => [entry.identityKey, entry]));
  for (const delta of [...diff.missing, ...diff.unexpected]) {
    if (!changed.has(delta.identityKey)) {
      fail(
        `${label} adds or removes ${delta.property} in ${delta.selector}; only reviewed value changes are allowed`,
      );
    }
  }
  const result = new Map();
  for (const [key, entry] of changed) {
    const [from] = entry.expected;
    const [to] = entry.actual;
    if (
      entry.expected.length !== 1 ||
      entry.actual.length !== 1 ||
      from.count !== 1 ||
      to.count !== 1 ||
      from.important ||
      to.important
    ) {
      fail(`${label} ${entry.property} in ${entry.selector} is not a single plain value change`);
    }
    result.set(key, { ...entry, from: from.value, to: to.value });
  }
  return result;
}

function verifyCssPartition(decisions, previous, current, owners) {
  const changes = {
    generatedTheme: changedDeclarations(
      'generated theme',
      previous.generatedTheme,
      current.generatedThemeCss,
    ),
    themeExtension: changedDeclarations(
      'theme extension',
      previous.themeExtension,
      current.themeExtensionCss,
    ),
  };
  const claim = (artifact, key, decisionId, entry) => {
    const owner = `${artifact} ${key}`;
    if (owners.has(owner)) {
      fail(
        `${entry.property} in ${entry.selector} belongs to more than one decision (${owners.get(owner)}, ${decisionId})`,
      );
    }
    owners.set(owner, decisionId);
  };

  for (const decision of decisions) {
    for (const target of decision.cssTargets) {
      const key = identityKey(target.atRules, target.selector, target.property);
      const entry = changes[target.artifact].get(key);
      if (!entry) {
        fail(`${decision.id} css target ${target.property} in ${target.selector} did not change`);
      }
      if (entry.from !== normalizeValue(target.from) || entry.to !== normalizeValue(target.to)) {
        fail(
          `${decision.id} ${target.property} in ${target.selector} records ${target.from} → ${target.to}, repository has ${entry.from} → ${entry.to}`,
        );
      }
      claim(target.artifact, key, decision.id, entry);
    }
    const bridges = new Map(
      decision.aliasBridges.map(({ property, resolvesTo }) => [property, resolvesTo]),
    );
    for (const [artifact, entries] of Object.entries(changes)) {
      for (const [key, entry] of entries) {
        if (!bridges.has(entry.property)) continue;
        if (entry.to !== normalizeValue(`var(${bridges.get(entry.property)})`)) {
          fail(
            `${decision.id} alias ${entry.property} in ${entry.selector} does not resolve to ${bridges.get(entry.property)}`,
          );
        }
        claim(artifact, key, decision.id, entry);
      }
    }
  }

  for (const [artifact, entries] of Object.entries(changes)) {
    for (const [key, entry] of entries) {
      if (!owners.has(`${artifact} ${key}`)) {
        fail(`unreviewed ${artifact} change: ${entry.property} in ${entry.selector}`);
      }
    }
  }
}

function verifyAliasBridges(decision, composed) {
  const remediated = new Set(decision.cssTargets.map(({ property }) => property));
  for (const { property, resolvesTo } of decision.aliasBridges) {
    if (!remediated.has(resolvesTo)) {
      fail(`${decision.id} alias ${property} must resolve to a property this decision remediates`);
    }
    const expected = normalizeValue(`var(${resolvesTo})`);
    const declarations = [...composed.values()].filter((entry) => entry.property === property);
    if (declarations.length === 0) fail(`${decision.id} alias ${property} is not declared`);
    for (const entry of declarations) {
      if (entry.occurrences.some(({ value }) => value !== expected)) {
        fail(
          `${decision.id} alias ${property} in ${entry.selector} is not bridged to ${resolvesTo}`,
        );
      }
    }
  }
}

function lookupValue(composed, selector, property) {
  for (const candidate of [selector, ':root']) {
    const entry = composed.get(identityKey([], candidate, property));
    if (entry) return entry.occurrences.at(-1).value;
  }
  return null;
}

function resolveColor(composed, selector, property) {
  let value = lookupValue(composed, selector, property);
  for (let depth = 0; value !== null && depth < MAX_VAR_DEPTH; depth += 1) {
    const reference = /^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*(.+))?\)$/.exec(value);
    if (!reference) return parseCssColor(value);
    value = lookupValue(composed, selector, reference[1]) ?? reference[2]?.trim() ?? null;
  }
  fail(`${property} does not resolve to a colour in ${selector}`);
}

function verifyMeasurements(decision, composed) {
  const remediated = new Set([
    ...decision.cssTargets.map(({ property }) => property),
    ...decision.aliasBridges.map(({ property }) => property),
  ]);
  const selectors = new Set([...composed.values()].map(({ selector }) => selector));
  for (const measurement of decision.measurements) {
    const selector = normalizeSelector(measurement.themeSelector);
    const label = `${decision.id} ${measurement.foreground} on ${measurement.background} in ${measurement.themeSelector}`;
    if (!selectors.has(selector)) fail(`${label}: theme selector not found`);
    if (!remediated.has(measurement.foreground) && !remediated.has(measurement.background)) {
      fail(`${label}: a measurement must involve a property this decision remediates`);
    }
    let background = resolveColor(composed, selector, measurement.background);
    if (background.alpha < 1) {
      if (measurement.compositeOver === null)
        fail(`${label}: translucent background needs compositeOver`);
      const base = resolveColor(composed, selector, measurement.compositeOver);
      if (base.alpha !== 1) fail(`${label}: compositeOver must be opaque`);
      background = compositeOver(background, base);
    } else if (measurement.compositeOver !== null) {
      fail(`${label}: compositeOver is only for a translucent background`);
    }
    const ratio = contrastRatio(
      resolveColor(composed, selector, measurement.foreground),
      background,
    );
    if (Math.abs(ratio - measurement.ratio) > RATIO_TOLERANCE) {
      fail(
        `${label}: recorded ratio ${measurement.ratio}, recomputed ${ratio.toFixed(3)} (tolerance ±${RATIO_TOLERANCE})`,
      );
    }
    if (ratio < measurement.threshold) {
      fail(`${label}: ratio ${ratio.toFixed(3)} is below threshold ${measurement.threshold}`);
    }
  }
}

function readBaseManifest(authority) {
  if (!blobExists(authority.commit, REMEDIATION_PATHS.v2)) return null;
  const base = JSON.parse(
    readBlob(authority.commit, REMEDIATION_PATHS.v2, 'merge-base v2 manifest'),
  );
  return base;
}

/**
 * Validate the v2 remediation ledger against the frozen v1 predecessor, the
 * merge-base ledger, the current token source and the rendered themes.
 */
export function assertThemeOwnershipRemediationContract({
  manifest,
  schema = JSON.parse(readFileSync(path.join(repoRoot, REMEDIATION_PATHS.schema), 'utf8')),
  v1ManifestContent,
  tokenSourceContent,
  tokens,
  generatedThemeCss,
  themeExtensionCss,
  generatedThemeInlineCss,
  themeInlineExtensionCss,
  authorityRef = process.env.THEME_OWNERSHIP_AUTHORITY_REF,
  baseManifest,
}) {
  validateAgainstSchema(manifest, schema);
  const ids = manifest.decisions.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) fail('decision IDs must be unique');

  const authority = resolveAuthorityCommit(authorityRef);
  const previous = verifyPredecessor(manifest, v1ManifestContent, authority, authorityRef);
  const base = baseManifest === undefined ? readBaseManifest(authority) : baseManifest;
  if (base !== null) validateAgainstSchema(base, schema, schema, 'merge-base manifest');
  verifyAppendOnly(manifest, base);

  if (typeof tokenSourceContent !== 'string') fail('tokenSourceContent is required');
  const owners = new Map();
  verifyTokenPartition(manifest.decisions, JSON.parse(previous.tokens), tokens, owners);
  verifyCssPartition(
    manifest.decisions,
    previous,
    { generatedThemeCss, themeExtensionCss },
    owners,
  );
  for (const [label, before, after] of [
    ['generated theme-inline', previous.generatedThemeInline, generatedThemeInlineCss],
    ['theme-inline extension', previous.themeInlineExtension, themeInlineExtensionCss],
  ]) {
    if (!diffDeclarationMultisets(before, after).equal) {
      fail(`${label} changed after the predecessor; no remediation kind covers it`);
    }
  }

  const composed = parseDeclarationMultiset(`${generatedThemeCss}\n${themeExtensionCss}`);
  for (const decision of manifest.decisions) {
    verifyAliasBridges(decision, composed);
    verifyMeasurements(decision, composed);
  }

  for (const [label, content, expected] of [
    ['token source', tokenSourceContent, manifest.result.tokenSourceSha256],
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
  return true;
}
