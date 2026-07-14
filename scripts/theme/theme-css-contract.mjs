import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import valueParser from 'postcss-value-parser';

const ROOT_SELECTOR = '<root>';

function normalizeNumericWord(word) {
  const match = word.match(/^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))([^\d].*)?$/);
  if (!match) return /^#[\da-f]+$/i.test(word) ? word.toLowerCase() : word;

  const [, sign, integerPart, fractionAfterInteger, fractionWithoutInteger, suffix = ''] = match;
  const integer = (integerPart ?? '0').replace(/^0+(?=\d)/, '') || '0';
  const fraction = (fractionAfterInteger ?? fractionWithoutInteger ?? '').replace(/0+$/, '');
  const number = fraction ? `${integer}.${fraction}` : integer;
  const normalizedSign = sign === '-' && number !== '0' ? '-' : sign === '+' ? '+' : '';
  return `${normalizedSign}${number}${suffix}`;
}

function serializeValueNodes(nodes, parentFunction = '') {
  let output = '';
  let pendingSpace = false;

  for (const node of nodes) {
    if (node.type === 'space') {
      pendingSpace = output.length > 0;
      continue;
    }
    if (node.type === 'comment') continue;

    if (node.type === 'div') {
      output = output.trimEnd();
      output += node.value;
      pendingSpace = false;
      continue;
    }

    let serialized;
    if (node.type === 'function') {
      const functionName = node.value;
      serialized = `${functionName}(${serializeValueNodes(node.nodes ?? [], functionName)})`;
    } else if (node.type === 'string') {
      serialized = JSON.stringify(node.value);
    } else {
      serialized = normalizeNumericWord(node.value);
      if (parentFunction.toLowerCase() === 'oklch') {
        serialized = serialized.replace(/deg$/i, '');
      }
    }

    if (pendingSpace && output && !output.endsWith('(')) output += ' ';
    output += serialized;
    pendingSpace = false;
  }

  return output.trim();
}

/** Normalize CSS values without erasing token order or meaningful spaces. */
export function normalizeValue(value) {
  return serializeValueNodes(valueParser(String(value ?? '')).nodes);
}

/** Normalize a selector list; selector-list order and quote style are non-semantic. */
export function normalizeSelector(selector) {
  const processor = selectorParser((root) => {
    root.walkAttributes((attribute) => {
      if (attribute.value !== undefined) attribute.quoteMark = '"';
    });
  });

  let canonical;
  try {
    canonical = processor.processSync(String(selector), { lossless: false });
  } catch (error) {
    throw new Error(`Invalid CSS selector ${JSON.stringify(selector)}: ${error.message}`);
  }

  const root = selectorParser().astSync(canonical, { lossless: false });
  return root.nodes
    .map((node) => node.toString())
    .sort()
    .join(',');
}

function normalizeImportParams(params) {
  const parsed = valueParser(String(params ?? ''));
  const firstIndex = parsed.nodes.findIndex(
    (node) => node.type !== 'space' && node.type !== 'comment',
  );
  if (firstIndex < 0) return '';

  const first = parsed.nodes[firstIndex];
  let target;
  if (first.type === 'string') {
    target = first.value;
  } else if (first.type === 'function' && first.value.toLowerCase() === 'url') {
    const content = (first.nodes ?? []).filter(
      (node) => node.type !== 'space' && node.type !== 'comment',
    );
    if (content.length === 1 && (content[0].type === 'string' || content[0].type === 'word')) {
      target = content[0].value;
    }
  }

  if (target === undefined) return normalizeValue(params);
  const remainder = serializeValueNodes(parsed.nodes.slice(firstIndex + 1));
  return `url(${JSON.stringify(target)})${remainder ? ` ${remainder}` : ''}`;
}

/** Normalize parameters for an at-rule while retaining their semantic order. */
export function normalizeAtRuleParams(name, params) {
  return String(name).toLowerCase() === 'import'
    ? normalizeImportParams(params)
    : normalizeValue(params);
}

function declarationIdentity(declaration) {
  const atRules = [];
  let selector = ROOT_SELECTOR;
  let ruleDepth = 0;
  let parent = declaration.parent;

  while (parent && parent.type !== 'root') {
    if (parent.type === 'atrule') {
      const name = parent.name.toLowerCase();
      atRules.push(
        Object.freeze({
          name,
          params: normalizeAtRuleParams(name, parent.params),
        }),
      );
    } else if (parent.type === 'rule') {
      ruleDepth += 1;
      if (ruleDepth > 1) {
        const error = new Error(
          `Nested style rules are unsupported in the theme ownership contract: ${JSON.stringify(parent.selector)}`,
        );
        error.code = 'THEME_NESTED_RULE_UNSUPPORTED';
        throw error;
      }
      selector = normalizeSelector(parent.selector);
    }
    parent = parent.parent;
  }

  atRules.reverse();
  const property = declaration.prop.startsWith('--')
    ? declaration.prop
    : declaration.prop.toLowerCase();
  const key = JSON.stringify([
    atRules.map(({ name, params }) => [name, params]),
    selector,
    property,
  ]);

  return { key, atRules: Object.freeze(atRules), selector, property };
}

function payloadKey(value, important) {
  return JSON.stringify([value, important]);
}

/**
 * Parse CSS into a declaration multiset.
 *
 * Map key identity: ordered at-rule ancestry + normalized selector + property.
 * Each entry retains every source occurrence and a value/importance count map.
 */
export function parseDeclarationMultiset(css, options = {}) {
  const root =
    css?.type === 'root'
      ? css
      : postcss.parse(Buffer.isBuffer(css) ? css.toString('utf8') : String(css ?? ''), {
          from: options.from,
        });
  const multiset = new Map();
  let order = 0;

  root.walkDecls((declaration) => {
    const identity = declarationIdentity(declaration);
    const value = normalizeValue(declaration.value);
    const important = Boolean(declaration.important);
    const key = payloadKey(value, important);
    const occurrence = Object.freeze({
      value,
      important,
      payloadKey: key,
      order,
      source: declaration.source?.start
        ? Object.freeze({
            line: declaration.source.start.line,
            column: declaration.source.start.column,
          })
        : null,
    });
    order += 1;

    let entry = multiset.get(identity.key);
    if (!entry) {
      entry = {
        ...identity,
        occurrences: [],
        payloadCounts: new Map(),
      };
      multiset.set(identity.key, entry);
    }

    entry.occurrences.push(occurrence);
    const current = entry.payloadCounts.get(key);
    entry.payloadCounts.set(
      key,
      Object.freeze({
        value,
        important,
        count: (current?.count ?? 0) + 1,
      }),
    );
  });

  return multiset;
}

function asMultiset(input) {
  return input instanceof Map ? input : parseDeclarationMultiset(input);
}

function sortedPayloads(entry) {
  return entry
    ? [...entry.payloadCounts.entries()]
        .map(([key, payload]) => ({ key, ...payload }))
        .sort((first, second) => first.key.localeCompare(second.key))
    : [];
}

function occurrenceDelta(identity, payload, count) {
  return Object.freeze({
    identityKey: identity.key,
    atRules: identity.atRules,
    selector: identity.selector,
    property: identity.property,
    value: payload.value,
    important: payload.important,
    count,
  });
}

/** Diff two declaration multisets, including payload occurrence counts. */
export function diffDeclarationMultisets(expectedInput, actualInput) {
  const expected = asMultiset(expectedInput);
  const actual = asMultiset(actualInput);
  const missing = [];
  const unexpected = [];
  const changed = [];
  const identityKeys = [...new Set([...expected.keys(), ...actual.keys()])].sort();

  for (const identityKey of identityKeys) {
    const expectedEntry = expected.get(identityKey);
    const actualEntry = actual.get(identityKey);
    const identity = expectedEntry ?? actualEntry;
    const expectedPayloads = new Map(
      sortedPayloads(expectedEntry).map((payload) => [payload.key, payload]),
    );
    const actualPayloads = new Map(
      sortedPayloads(actualEntry).map((payload) => [payload.key, payload]),
    );
    const payloadKeys = [...new Set([...expectedPayloads.keys(), ...actualPayloads.keys()])].sort();
    let identityChanged = false;

    for (const key of payloadKeys) {
      const expectedPayload = expectedPayloads.get(key);
      const actualPayload = actualPayloads.get(key);
      const expectedCount = expectedPayload?.count ?? 0;
      const actualCount = actualPayload?.count ?? 0;
      if (expectedCount > actualCount) {
        missing.push(occurrenceDelta(identity, expectedPayload, expectedCount - actualCount));
        identityChanged = true;
      }
      if (actualCount > expectedCount) {
        unexpected.push(occurrenceDelta(identity, actualPayload, actualCount - expectedCount));
        identityChanged = true;
      }
    }

    if (identityChanged && expectedEntry && actualEntry) {
      changed.push(
        Object.freeze({
          identityKey,
          atRules: identity.atRules,
          selector: identity.selector,
          property: identity.property,
          expected: Object.freeze(sortedPayloads(expectedEntry)),
          actual: Object.freeze(sortedPayloads(actualEntry)),
        }),
      );
    }
  }

  return Object.freeze({
    equal: missing.length === 0 && unexpected.length === 0,
    missing: Object.freeze(missing),
    unexpected: Object.freeze(unexpected),
    changed: Object.freeze(changed),
  });
}

function formatIdentity(entry) {
  const ancestry = entry.atRules
    .map(({ name, params }) => `@${name}${params ? ` ${params}` : ''}`)
    .join(' > ');
  return `${ancestry ? `${ancestry} > ` : ''}${entry.selector} { ${entry.property} }`;
}

/** Reject any curated declaration that re-declares a generator-owned identity. */
export function assertNoCuratedShadow(generatedInput, curatedInput) {
  const generated = asMultiset(generatedInput);
  const curated = asMultiset(curatedInput);
  const collisions = [...generated.keys()]
    .filter((identityKey) => curated.has(identityKey))
    .sort()
    .map((identityKey) => ({
      identity: generated.get(identityKey),
      generated: sortedPayloads(generated.get(identityKey)),
      curated: sortedPayloads(curated.get(identityKey)),
    }));

  if (collisions.length > 0) {
    const error = new Error(
      `Curated CSS shadows ${collisions.length} generator-owned declaration identity:\n${collisions
        .map(({ identity }) => `- ${formatIdentity(identity)}`)
        .join('\n')}`,
    );
    error.code = 'THEME_CURATED_SHADOW';
    error.collisions = collisions;
    throw error;
  }

  return true;
}

function normalizeExpectedImport(expected) {
  const text = String(expected).trim();
  if (/^@import\b/i.test(text)) {
    return normalizeAtRuleParams('import', text.replace(/^@import\s*/i, '').replace(/;\s*$/, ''));
  }
  if (/^(?:url\(|["'])/i.test(text)) return normalizeAtRuleParams('import', text);
  return normalizeAtRuleParams('import', JSON.stringify(text));
}

/** Assert required top-level imports are unique and occur in the requested order. */
export function assertExpectedImportOrder(css, expectedImports, options = {}) {
  const root = css?.type === 'root' ? css : postcss.parse(String(css ?? ''));
  const actual = root.nodes
    .filter((node) => node.type === 'atrule' && node.name.toLowerCase() === 'import')
    .map((node) => normalizeAtRuleParams('import', node.params));
  const expected = expectedImports.map(normalizeExpectedImport);

  if (new Set(expected).size !== expected.length) {
    throw new Error('Expected import contract contains duplicates');
  }

  const positions = expected.map((item) =>
    actual.reduce((indexes, candidate, index) => {
      if (candidate === item) indexes.push(index);
      return indexes;
    }, []),
  );
  const missing = expected.filter((_, index) => positions[index].length === 0);
  const duplicates = expected.filter((_, index) => positions[index].length > 1);
  const selected = positions.map((indexes) => indexes[0]);
  const ordered = selected.every(
    (position, index) => index === 0 || position > selected[index - 1],
  );
  const exact =
    options.allowAdditional === false
      ? actual.length === expected.length && actual.every((item, index) => item === expected[index])
      : true;

  if (missing.length || duplicates.length || !ordered || !exact) {
    const error = new Error(
      `Theme import order mismatch. Expected: ${expected.join(' -> ')}. Actual: ${actual.join(' -> ')}`,
    );
    error.code = 'THEME_IMPORT_ORDER';
    error.expected = expected;
    error.actual = actual;
    throw error;
  }

  return Object.freeze(actual);
}

export function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

/** Atomically replace a file only when its bytes have changed. */
export function writeFileAtomicIfChanged(filePath, content, options = {}) {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(String(content));
  const existing = existsSync(filePath) ? readFileSync(filePath) : null;
  const hash = sha256(bytes);
  if (existing?.equals(bytes)) {
    return Object.freeze({ changed: false, hash, bytes: bytes.length });
  }

  const directory = path.dirname(filePath);
  mkdirSync(directory, { recursive: true });
  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );

  try {
    const mode = existsSync(filePath) ? statSync(filePath).mode & 0o777 : options.mode;
    writeFileSync(temporaryPath, bytes, mode === undefined ? undefined : { mode });
    if (mode !== undefined) chmodSync(temporaryPath, mode);
    renameSync(temporaryPath, filePath);
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }

  return Object.freeze({ changed: true, hash, bytes: bytes.length });
}
