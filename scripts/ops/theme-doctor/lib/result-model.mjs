const CHECK_STATUSES = new Set(['pass', 'warn', 'fail']);
const RATCHET_DIRECTIONS = new Set(['lower-is-better']);
const canonicalCompare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export class ResultModelError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ResultModelError';
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ResultModelError(`${label} must be an object`);
  }
}

function assertExactKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new ResultModelError(`${label} has unknown property "${key}"`);
    }
  }
}

function normalizeRatchetItem(item, label) {
  assertPlainObject(item, label);
  assertExactKeys(item, new Set(['key', 'count']), label);
  if (typeof item.key !== 'string' || item.key.length === 0) {
    throw new ResultModelError(`${label}.key must be a non-empty string`);
  }
  if (item.key.includes('\n') || item.key.includes('\r') || item.key.includes('\0')) {
    throw new ResultModelError(`${label}.key must be a single-line canonical string`);
  }
  if (!Number.isSafeInteger(item.count) || item.count <= 0) {
    throw new ResultModelError(`${label}.count must be a positive safe integer`);
  }
  return { key: item.key, count: item.count };
}

function normalizeRatchetDimension(dimension, label) {
  assertPlainObject(dimension, label);
  assertExactKeys(dimension, new Set(['direction', 'value', 'items']), label);
  if (!RATCHET_DIRECTIONS.has(dimension.direction)) {
    throw new ResultModelError(`${label}.direction must be "lower-is-better"`);
  }
  if (!Number.isSafeInteger(dimension.value) || dimension.value < 0) {
    throw new ResultModelError(`${label}.value must be a non-negative safe integer`);
  }
  if (!Array.isArray(dimension.items)) {
    throw new ResultModelError(`${label}.items must be an array`);
  }

  const items = dimension.items
    .map((item, index) => normalizeRatchetItem(item, `${label}.items[${index}]`))
    .sort((a, b) => canonicalCompare(a.key, b.key));
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.key)) {
      throw new ResultModelError(`${label}.items contains duplicate key ${JSON.stringify(item.key)}`);
    }
    seen.add(item.key);
  }
  const measuredValue = items.reduce((sum, item) => sum + item.count, 0);
  if (measuredValue !== dimension.value) {
    throw new ResultModelError(
      `${label}.value (${dimension.value}) does not equal item count sum (${measuredValue})`,
    );
  }

  return {
    direction: dimension.direction,
    value: dimension.value,
    items,
  };
}

export function normalizeRatchetMeasurement(ratchet, label = 'ratchet') {
  assertPlainObject(ratchet, label);
  assertExactKeys(ratchet, new Set(['measurementVersion', 'dimensions', 'context']), label);
  if (!Number.isSafeInteger(ratchet.measurementVersion) || ratchet.measurementVersion <= 0) {
    throw new ResultModelError(`${label}.measurementVersion must be a positive safe integer`);
  }
  assertPlainObject(ratchet.dimensions, `${label}.dimensions`);
  const dimensionEntries = Object.entries(ratchet.dimensions).sort(([a], [b]) => canonicalCompare(a, b));
  if (dimensionEntries.length === 0) {
    throw new ResultModelError(`${label}.dimensions must not be empty`);
  }

  const dimensions = {};
  for (const [name, dimension] of dimensionEntries) {
    if (!/^[a-z][a-zA-Z0-9]*$/.test(name)) {
      throw new ResultModelError(`${label}.dimensions has invalid name ${JSON.stringify(name)}`);
    }
    dimensions[name] = normalizeRatchetDimension(dimension, `${label}.dimensions.${name}`);
  }

  const normalized = {
    measurementVersion: ratchet.measurementVersion,
    dimensions,
  };
  if (ratchet.context !== undefined) {
    assertPlainObject(ratchet.context, `${label}.context`);
    normalized.context = structuredClone(ratchet.context);
  }
  return normalized;
}

export function normalizeCheckResult({ id, label, result, error }) {
  if (typeof id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(id)) {
    throw new ResultModelError(`check id ${JSON.stringify(id)} is invalid`);
  }
  if (typeof label !== 'string' || label.length === 0) {
    throw new ResultModelError(`check ${id} label must be a non-empty string`);
  }

  if (error !== undefined) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      id,
      label,
      status: 'fail',
      message: `Exception: ${message}`,
      origin: 'exception',
    };
  }

  assertPlainObject(result, `check ${id} result`);
  assertExactKeys(
    result,
    new Set(['status', 'message', 'details', 'issues', 'fix', 'ratchet']),
    `check ${id} result`,
  );
  if (!CHECK_STATUSES.has(result.status)) {
    throw new ResultModelError(`check ${id} returned invalid status ${JSON.stringify(result.status)}`);
  }
  if (typeof result.message !== 'string' || result.message.length === 0) {
    throw new ResultModelError(`check ${id} message must be a non-empty string`);
  }

  const normalized = {
    id,
    label,
    status: result.status,
    message: result.message,
    origin: 'check',
  };
  if (result.details !== undefined) normalized.details = structuredClone(result.details);
  if (result.issues !== undefined) normalized.issues = structuredClone(result.issues);
  if (result.fix !== undefined) {
    if (typeof result.fix !== 'string') {
      throw new ResultModelError(`check ${id} fix must be a string`);
    }
    normalized.fix = result.fix;
  }
  if (result.ratchet !== undefined) {
    normalized.ratchet = normalizeRatchetMeasurement(result.ratchet, `check ${id} ratchet`);
  }
  return normalized;
}

export function ratchetDebtTotal(result) {
  if (!result.ratchet) return 0;
  return Object.values(result.ratchet.dimensions)
    .reduce((sum, dimension) => sum + dimension.value, 0);
}
