import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCheckResult,
  normalizeRatchetMeasurement,
  ratchetDebtTotal,
  ResultModelError,
} from '../lib/result-model.mjs';

function measurement(items = [{ key: 'a', count: 2 }]) {
  return {
    measurementVersion: 1,
    dimensions: {
      debt: { direction: 'lower-is-better', value: items.reduce((sum, item) => sum + item.count, 0), items },
    },
  };
}

test('normalizes and deterministically sorts ratchet dimensions and items', () => {
  const normalized = normalizeRatchetMeasurement({
    measurementVersion: 1,
    dimensions: {
      zebra: { direction: 'lower-is-better', value: 0, items: [] },
      alpha: { direction: 'lower-is-better', value: 3, items: [{ key: 'z', count: 1 }, { key: 'a', count: 2 }] },
    },
    context: { total: 3 },
  });
  assert.deepEqual(Object.keys(normalized.dimensions), ['alpha', 'zebra']);
  assert.deepEqual(normalized.dimensions.alpha.items.map(({ key }) => key), ['a', 'z']);
});

test('rejects unknown result fields and metric sum mismatch', () => {
  assert.throws(() => normalizeCheckResult({
    id: 'sample', label: 'Sample', result: { status: 'pass', message: 'ok', hidden: true },
  }), ResultModelError);
  assert.throws(() => normalizeRatchetMeasurement({
    measurementVersion: 1,
    dimensions: { debt: { direction: 'lower-is-better', value: 3, items: [{ key: 'a', count: 2 }] } },
  }), /does not equal item count sum/);
});

test('rejects duplicate fingerprints and unsafe keys', () => {
  assert.throws(() => normalizeRatchetMeasurement(measurement([
    { key: 'same', count: 1 },
    { key: 'same', count: 1 },
  ])), /duplicate key/);
  assert.throws(() => normalizeRatchetMeasurement(measurement([{ key: 'line\nbreak', count: 1 }])), /single-line/);
});

test('models exceptions as non-baselinable failures', () => {
  const result = normalizeCheckResult({ id: 'sample', label: 'Sample', error: new Error('boom') });
  assert.equal(result.status, 'fail');
  assert.equal(result.origin, 'exception');
  assert.match(result.message, /boom/);
});

test('calculates total debt across dimensions', () => {
  const result = normalizeCheckResult({
    id: 'sample',
    label: 'Sample',
    result: { status: 'fail', message: 'debt', ratchet: measurement() },
  });
  assert.equal(ratchetDebtTotal(result), 2);
});
