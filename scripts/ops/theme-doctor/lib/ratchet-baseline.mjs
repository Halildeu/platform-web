import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { normalizeRatchetMeasurement, ratchetDebtTotal, ResultModelError } from './result-model.mjs';

export const BASELINE_SCHEMA_VERSION = 1;
export const BASELINE_TOOL = 'theme-doctor';
export const BASELINED_CHECK_IDS = Object.freeze([
  'color-leaks',
  'palette-over-token',
  'preview-coverage',
]);

const BASELINE_STATUSES = new Set(['pass', 'warn', 'fail']);
const STATUS_SEVERITY = Object.freeze({ pass: 0, warn: 1, fail: 2 });
const canonicalCompare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export class BaselineError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BaselineError';
  }
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BaselineError(`${label} must be an object`);
  }
}

function assertExactKeys(value, required, optional, label) {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new BaselineError(`${label} has unknown property "${key}"`);
  }
  for (const key of required) {
    if (!(key in value)) throw new BaselineError(`${label} is missing required property "${key}"`);
  }
}

function stableObject(entries) {
  return Object.fromEntries([...entries].sort(([a], [b]) => canonicalCompare(a, b)));
}

function normalizeBaselineCheck(value, id) {
  const label = `baseline.checks.${id}`;
  assertObject(value, label);
  assertExactKeys(value, ['measurementVersion', 'observedStatus', 'dimensions'], [], label);
  if (!BASELINE_STATUSES.has(value.observedStatus)) {
    throw new BaselineError(`${label}.observedStatus is invalid`);
  }
  let measurement;
  try {
    measurement = normalizeRatchetMeasurement({
      measurementVersion: value.measurementVersion,
      dimensions: value.dimensions,
    }, label);
  } catch (error) {
    throw new BaselineError(error.message);
  }
  return {
    measurementVersion: measurement.measurementVersion,
    observedStatus: value.observedStatus,
    dimensions: measurement.dimensions,
  };
}

export function normalizeBaseline(value) {
  assertObject(value, 'baseline');
  assertExactKeys(
    value,
    ['$schema', 'schemaVersion', 'tool', 'sourceCommit', 'checks'],
    [],
    'baseline',
  );
  if (value.$schema !== './baseline.schema.json') {
    throw new BaselineError('baseline.$schema must be "./baseline.schema.json"');
  }
  if (value.schemaVersion !== BASELINE_SCHEMA_VERSION) {
    throw new BaselineError(`baseline.schemaVersion must be ${BASELINE_SCHEMA_VERSION}`);
  }
  if (value.tool !== BASELINE_TOOL) throw new BaselineError(`baseline.tool must be "${BASELINE_TOOL}"`);
  if (typeof value.sourceCommit !== 'string' || !/^[0-9a-f]{40}$/.test(value.sourceCommit)) {
    throw new BaselineError('baseline.sourceCommit must be a full lowercase Git commit SHA');
  }
  assertObject(value.checks, 'baseline.checks');

  const entries = Object.entries(value.checks);
  if (entries.length === 0) throw new BaselineError('baseline.checks must not be empty');
  const checks = {};
  for (const [id, check] of entries.sort(([a], [b]) => canonicalCompare(a, b))) {
    if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new BaselineError(`baseline check id ${JSON.stringify(id)} is invalid`);
    if (!BASELINED_CHECK_IDS.includes(id)) {
      throw new BaselineError(`baseline check ${JSON.stringify(id)} is not in the reviewed allowlist`);
    }
    checks[id] = normalizeBaselineCheck(check, id);
  }
  return {
    $schema: './baseline.schema.json',
    schemaVersion: BASELINE_SCHEMA_VERSION,
    tool: BASELINE_TOOL,
    sourceCommit: value.sourceCommit,
    checks,
  };
}

export function loadBaseline(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    throw new BaselineError(`cannot read baseline ${path}: ${error.message}`);
  }
  try {
    return normalizeBaseline(JSON.parse(text));
  } catch (error) {
    if (error instanceof SyntaxError) throw new BaselineError(`baseline is not valid JSON: ${error.message}`);
    throw error;
  }
}

function compareDimension(current, baseline) {
  if (current.direction !== baseline.direction) {
    return { kind: 'contract-error', reasons: ['direction changed'] };
  }
  const oldItems = new Map(baseline.items.map((item) => [item.key, item.count]));
  const currentItems = new Map(current.items.map((item) => [item.key, item.count]));
  const newItems = [];
  const increasedItems = [];
  const removedItems = [];
  const decreasedItems = [];

  for (const [key, count] of currentItems) {
    if (!oldItems.has(key)) newItems.push({ key, count });
    else if (count > oldItems.get(key)) increasedItems.push({ key, before: oldItems.get(key), after: count });
    else if (count < oldItems.get(key)) decreasedItems.push({ key, before: oldItems.get(key), after: count });
  }
  for (const [key, count] of oldItems) {
    if (!currentItems.has(key)) removedItems.push({ key, count });
  }

  if (newItems.length || increasedItems.length || current.value > baseline.value) {
    return { kind: 'regression', newItems, increasedItems, removedItems, decreasedItems };
  }
  if (removedItems.length || decreasedItems.length || current.value < baseline.value) {
    return { kind: 'improvement', newItems, increasedItems, removedItems, decreasedItems };
  }
  return { kind: 'exact', newItems, increasedItems, removedItems, decreasedItems };
}

function gateRecord(result, gateStatus, reason) {
  return { ...result, gateStatus, gateReason: reason };
}

export function evaluateRatchet(results, baseline, { strictZero = false } = {}) {
  const normalizedBaseline = baseline ? normalizeBaseline(baseline) : null;
  const seen = new Set();
  const checks = [];
  const regressions = [];
  const improvements = [];
  const baselineErrors = [];
  const knownDebt = [];

  for (const result of results) {
    if (seen.has(result.id)) throw new ResultModelError(`duplicate check id ${JSON.stringify(result.id)}`);
    seen.add(result.id);
    const baselineCheck = normalizedBaseline?.checks[result.id];

    if (result.origin === 'exception') {
      regressions.push({ id: result.id, reason: 'check exception' });
      checks.push(gateRecord(result, 'regression', 'check exception'));
      continue;
    }

    if (strictZero) {
      const debt = ratchetDebtTotal(result);
      if (result.status !== 'pass' || debt > 0) {
        regressions.push({ id: result.id, reason: result.status !== 'pass' ? `observed ${result.status}` : `debt ${debt}` });
        checks.push(gateRecord(result, 'strict-fail', 'strict-zero requires pass with zero debt'));
      } else {
        checks.push(gateRecord(result, 'pass', 'strict-zero clean'));
      }
      continue;
    }

    if (!normalizedBaseline) {
      if (result.status === 'fail') {
        regressions.push({ id: result.id, reason: 'observed failure without baseline' });
        checks.push(gateRecord(result, 'regression', 'observed failure without baseline'));
      } else checks.push(gateRecord(result, 'pass', 'not failing'));
      continue;
    }

    if (!baselineCheck) {
      if (result.status === 'fail') {
        regressions.push({ id: result.id, reason: 'new failing check id' });
        checks.push(gateRecord(result, 'regression', 'new failing check id'));
      } else checks.push(gateRecord(result, 'pass', 'not baselined'));
      continue;
    }

    if (!result.ratchet) {
      baselineErrors.push({ id: result.id, reason: 'baselined check emitted no ratchet measurement' });
      checks.push(gateRecord(result, 'baseline-error', 'missing ratchet measurement'));
      continue;
    }
    if (result.ratchet.measurementVersion !== baselineCheck.measurementVersion) {
      baselineErrors.push({ id: result.id, reason: 'measurementVersion mismatch' });
      checks.push(gateRecord(result, 'baseline-error', 'measurementVersion mismatch'));
      continue;
    }
    const currentNames = Object.keys(result.ratchet.dimensions);
    const baselineNames = Object.keys(baselineCheck.dimensions);
    if (JSON.stringify(currentNames) !== JSON.stringify(baselineNames)) {
      baselineErrors.push({ id: result.id, reason: 'dimension contract mismatch' });
      checks.push(gateRecord(result, 'baseline-error', 'dimension contract mismatch'));
      continue;
    }

    const comparisons = currentNames.map((name) => ({
      name,
      ...compareDimension(result.ratchet.dimensions[name], baselineCheck.dimensions[name]),
    }));
    if (comparisons.some((item) => item.kind === 'contract-error')) {
      baselineErrors.push({ id: result.id, reason: 'dimension direction mismatch', dimensions: comparisons });
      checks.push(gateRecord(result, 'baseline-error', 'dimension direction mismatch'));
    } else if (comparisons.some((item) => item.kind === 'regression')
      || STATUS_SEVERITY[result.status] > STATUS_SEVERITY[baselineCheck.observedStatus]) {
      const reason = STATUS_SEVERITY[result.status] > STATUS_SEVERITY[baselineCheck.observedStatus]
        ? 'observed status severity worsened'
        : 'new or worsened fingerprint';
      regressions.push({ id: result.id, reason, dimensions: comparisons });
      checks.push(gateRecord(result, 'regression', reason));
    } else if (comparisons.some((item) => item.kind === 'improvement')
      || STATUS_SEVERITY[result.status] < STATUS_SEVERITY[baselineCheck.observedStatus]) {
      improvements.push({ id: result.id, reason: 'baseline is stale after improvement', dimensions: comparisons });
      checks.push(gateRecord(result, 'improvement', 'baseline update required'));
    } else {
      knownDebt.push({ id: result.id });
      checks.push(gateRecord(result, 'known-debt', 'exact reviewed baseline match'));
    }
  }

  if (normalizedBaseline && !strictZero) {
    for (const id of Object.keys(normalizedBaseline.checks)) {
      if (!seen.has(id)) baselineErrors.push({ id, reason: 'orphan baseline check id' });
    }
  }

  const exitCode = baselineErrors.length ? 2 : regressions.length ? 1 : improvements.length ? 2 : 0;
  return {
    exitCode,
    verdict: exitCode === 0 ? 'pass' : exitCode === 1 ? 'fail' : 'baseline-stale',
    checks,
    knownDebt,
    regressions,
    improvements,
    baselineErrors,
  };
}

export function createBaselineCandidate(results, sourceCommit, {
  eligibleIds = BASELINED_CHECK_IDS,
  requireFail = true,
} = {}) {
  if (!/^[0-9a-f]{40}$/.test(sourceCommit)) throw new BaselineError('candidate sourceCommit must be a full lowercase Git commit SHA');
  const eligible = new Set(eligibleIds);
  const checks = {};
  for (const result of results) {
    if (result.status !== 'fail') continue;
    if (!eligible.has(result.id)) throw new BaselineError(`refusing to baseline unexpected failing check ${result.id}`);
    if (result.origin === 'exception' || !result.ratchet) throw new BaselineError(`refusing to baseline non-measured failure ${result.id}`);
    checks[result.id] = {
      measurementVersion: result.ratchet.measurementVersion,
      observedStatus: result.status,
      dimensions: result.ratchet.dimensions,
    };
  }
  if (requireFail && Object.keys(checks).length === 0) throw new BaselineError('candidate contains no eligible failing checks');
  return normalizeBaseline({
    $schema: './baseline.schema.json',
    schemaVersion: BASELINE_SCHEMA_VERSION,
    tool: BASELINE_TOOL,
    sourceCommit,
    checks: stableObject(Object.entries(checks)),
  });
}

export function createImprovementBaseline(baseline, evaluation) {
  const normalized = normalizeBaseline(baseline);
  if (evaluation.regressions.length || evaluation.baselineErrors.length) {
    throw new BaselineError('refusing baseline update while regressions or baseline errors exist');
  }
  if (!evaluation.improvements.length) throw new BaselineError('no improvements available for baseline update');
  const improvedIds = new Set(evaluation.improvements.map(({ id }) => id));
  const checks = {};
  for (const result of evaluation.checks) {
    if (!normalized.checks[result.id]) continue;
    if (!improvedIds.has(result.id)) {
      checks[result.id] = normalized.checks[result.id];
      continue;
    }
    if (!result.ratchet) throw new BaselineError(`improved check ${result.id} has no ratchet measurement`);
    if (ratchetDebtTotal(result) === 0 && result.status === 'pass') continue;
    checks[result.id] = {
      measurementVersion: result.ratchet.measurementVersion,
      observedStatus: result.status,
      dimensions: result.ratchet.dimensions,
    };
  }
  if (Object.keys(checks).length === 0) {
    throw new BaselineError('all debt cleared; remove the baseline file and --baseline gate explicitly');
  }
  return normalizeBaseline({ ...normalized, checks: stableObject(Object.entries(checks)) });
}

export function writeBaselineAtomic(path, baseline) {
  const normalized = normalizeBaseline(baseline);
  const temporary = join(dirname(path), `.${path.split('/').pop()}.${process.pid}.tmp`);
  writeFileSync(temporary, `${JSON.stringify(normalized, null, 2)}\n`, { encoding: 'utf8', mode: 0o644 });
  renameSync(temporary, path);
}
