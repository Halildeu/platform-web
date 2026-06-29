import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = join(__dirname, '..');
const schemaPath = join(appRoot, 'contracts', 'ws-stream-events.schema.json');
const sourcePath = join(appRoot, 'contracts', 'ws-stream-events.schema-source.json');
const fixturesPath = join(appRoot, 'contracts', 'ws-stream-events.fixtures.json');

const offline =
  process.argv.includes('--offline') || process.env.MFE_MEETING_WS_CONTRACT_OFFLINE === 'true';

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateProperty(rule, value) {
  if (Object.prototype.hasOwnProperty.call(rule, 'const') && value !== rule.const) return false;
  if (Array.isArray(rule.enum) && !rule.enum.includes(value)) return false;
  if (rule.type === 'string' && typeof value !== 'string') return false;
  if (rule.type === 'integer' && (!Number.isInteger(value) || !Number.isFinite(value)))
    return false;
  if (rule.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value)))
    return false;
  if (typeof rule.minimum === 'number' && typeof value === 'number' && value < rule.minimum)
    return false;
  return true;
}

function validateAgainstDefinition(schema, definitionName, event) {
  const definition = schema.$defs?.[definitionName];
  if (!definition || definition.type !== 'object' || !isObject(event)) return false;

  const required = definition.required ?? [];
  if (!required.every((key) => Object.prototype.hasOwnProperty.call(event, key))) return false;

  const properties = definition.properties ?? {};
  for (const [key, value] of Object.entries(event)) {
    const propertyRule = properties[key];
    if (!propertyRule) {
      if (definition.additionalProperties === false) return false;
      continue;
    }
    if (!validateProperty(propertyRule, value)) return false;
  }

  return true;
}

function matchingDefinitions(schema, event) {
  return Object.keys(schema.$defs ?? {}).filter((definitionName) =>
    validateAgainstDefinition(schema, definitionName, event),
  );
}

async function verifyRemotePin(localSchema, source) {
  if (offline) {
    return;
  }
  const response = await fetch(source.rawUrl, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`schema-source-fetch-failed:${response.status}`);
  }
  const remoteSchema = JSON.parse(await response.text());
  if (stableStringify(remoteSchema) !== stableStringify(localSchema)) {
    throw new Error(`schema-pin-drift:${source.rawUrl}`);
  }
}

function verifyFixtures(schema, fixtures) {
  for (const fixture of fixtures.valid ?? []) {
    const matches = matchingDefinitions(schema, fixture.event);
    if (matches.length !== 1) {
      throw new Error(`valid-fixture-rejected:${fixture.name}:${matches.join('|') || 'none'}`);
    }
  }

  for (const fixture of fixtures.invalid ?? []) {
    const matches = matchingDefinitions(schema, fixture.event);
    if (matches.length !== 0) {
      throw new Error(`invalid-fixture-accepted:${fixture.name}:${matches.join('|')}`);
    }
  }
}

const schema = await readJson(schemaPath);
const source = await readJson(sourcePath);
const fixtures = await readJson(fixturesPath);

if (!source.sourceCommit || !/^[0-9a-f]{40}$/.test(source.sourceCommit)) {
  throw new Error('schema-source-commit-missing');
}
if (!source.rawUrl.includes(source.sourceCommit)) {
  throw new Error('schema-source-raw-url-not-commit-pinned');
}

await verifyRemotePin(schema, source);
verifyFixtures(schema, fixtures);

console.log(
  `mfe-meeting ws-stream contract verified (${source.sourceRepo}@${source.sourceCommit.slice(0, 12)})`,
);
