import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeCheckResult } from '../lib/result-model.mjs';
import {
  BaselineError,
  createBaselineCandidate,
  createImprovementBaseline,
  evaluateRatchet,
  normalizeBaseline,
  writeBaselineAtomic,
} from '../lib/ratchet-baseline.mjs';
import {
  assertBaselineMonotonic,
  verifyBaselineProvenance,
} from '../lib/baseline-provenance.mjs';

const SHA = 'a'.repeat(40);

function check(id, status = 'fail', items = [{ key: 'a', count: 2 }], version = 1) {
  return normalizeCheckResult({
    id,
    label: id,
    result: {
      status,
      message: status,
      ratchet: {
        measurementVersion: version,
        dimensions: {
          debt: {
            direction: 'lower-is-better',
            value: items.reduce((sum, item) => sum + item.count, 0),
            items,
          },
        },
      },
    },
  });
}

function baselineFor(result = check('color-leaks')) {
  return normalizeBaseline({
    $schema: './baseline.schema.json',
    schemaVersion: 1,
    tool: 'theme-doctor',
    sourceCommit: SHA,
    checks: {
      [result.id]: {
        measurementVersion: result.ratchet.measurementVersion,
        observedStatus: result.status,
        dimensions: result.ratchet.dimensions,
      },
    },
  });
}

test('exact known failure remains observed fail while default gate passes', () => {
  const result = check('color-leaks');
  const evaluated = evaluateRatchet([result], baselineFor(result));
  assert.equal(evaluated.exitCode, 0);
  assert.equal(evaluated.checks[0].status, 'fail');
  assert.equal(evaluated.checks[0].gateStatus, 'known-debt');
  assert.equal(evaluated.knownDebt.length, 1);
});

test('count increase, new key, and equal-total fingerprint swap are regressions', () => {
  const base = baselineFor(check('color-leaks', 'fail', [{ key: 'a', count: 2 }]));
  for (const items of [
    [{ key: 'a', count: 3 }],
    [{ key: 'a', count: 2 }, { key: 'b', count: 1 }],
    [{ key: 'b', count: 2 }],
  ]) {
    const evaluated = evaluateRatchet([check('color-leaks', 'fail', items)], base);
    assert.equal(evaluated.exitCode, 1);
    assert.equal(evaluated.regressions.length, 1);
  }
});

test('new failing check id fails the gate', () => {
  const known = check('color-leaks');
  const fresh = normalizeCheckResult({ id: 'fresh-failure', label: 'Fresh', result: { status: 'fail', message: 'new' } });
  const evaluated = evaluateRatchet([known, fresh], baselineFor(known));
  assert.equal(evaluated.exitCode, 1);
  assert.match(evaluated.regressions[0].reason, /new failing/);
});

test('strict subset is an improvement requiring baseline refresh', () => {
  const base = baselineFor(check('color-leaks', 'fail', [{ key: 'a', count: 2 }, { key: 'b', count: 1 }]));
  const evaluated = evaluateRatchet([check('color-leaks', 'fail', [{ key: 'a', count: 2 }])], base);
  assert.equal(evaluated.exitCode, 2);
  assert.equal(evaluated.improvements.length, 1);
});

test('status severity cannot worsen behind an unchanged fingerprint', () => {
  const warned = check('color-leaks', 'warn');
  const evaluated = evaluateRatchet([check('color-leaks', 'fail')], baselineFor(warned));
  assert.equal(evaluated.exitCode, 1);
  assert.equal(evaluated.regressions.length, 1);
});

test('orphan check and measurement version mismatch invalidate baseline', () => {
  const result = check('color-leaks');
  const orphan = evaluateRatchet([], baselineFor(result));
  assert.equal(orphan.exitCode, 2);
  assert.match(orphan.baselineErrors[0].reason, /orphan/);

  const mismatch = evaluateRatchet([check('color-leaks', 'fail', [{ key: 'a', count: 2 }], 2)], baselineFor(result));
  assert.equal(mismatch.exitCode, 2);
  assert.match(mismatch.baselineErrors[0].reason, /measurementVersion/);
});

test('strict baseline schema rejects unknown properties and malformed item sums', () => {
  const value = baselineFor();
  assert.throws(() => normalizeBaseline({ ...value, surprise: true }), /unknown property/);
  const malformed = structuredClone(value);
  malformed.checks['color-leaks'].dimensions.debt.value = 99;
  assert.throws(() => normalizeBaseline(malformed), /does not equal item count sum/);

  const unexpected = structuredClone(value);
  unexpected.checks['unexpected-check'] = unexpected.checks['color-leaks'];
  assert.throws(() => normalizeBaseline(unexpected), /reviewed allowlist/);
});

test('duplicate result IDs and exceptions cannot be hidden by baseline', () => {
  const result = check('color-leaks');
  assert.throws(() => evaluateRatchet([result, result], baselineFor(result)), /duplicate check id/);
  const exception = normalizeCheckResult({ id: 'color-leaks', label: 'Color', error: new Error('boom') });
  const evaluated = evaluateRatchet([exception], baselineFor(result));
  assert.equal(evaluated.exitCode, 1);
  assert.equal(evaluated.checks[0].gateStatus, 'regression');
});

test('strict-zero rejects known debt and warnings but accepts clean passes', () => {
  const debt = check('color-leaks');
  assert.equal(evaluateRatchet([debt], undefined, { strictZero: true }).exitCode, 1);
  const warning = normalizeCheckResult({ id: 'warning', label: 'Warning', result: { status: 'warn', message: 'warn' } });
  assert.equal(evaluateRatchet([warning], undefined, { strictZero: true }).exitCode, 1);
  const clean = normalizeCheckResult({ id: 'clean', label: 'Clean', result: { status: 'pass', message: 'pass' } });
  assert.equal(evaluateRatchet([clean], undefined, { strictZero: true }).exitCode, 0);
});

test('candidate permits only explicit measured failing IDs', () => {
  const candidate = createBaselineCandidate([check('color-leaks')], SHA);
  assert.deepEqual(Object.keys(candidate.checks), ['color-leaks']);
  assert.throws(() => createBaselineCandidate([check('unexpected-check')], SHA), /unexpected failing check/);
  const unmeasured = normalizeCheckResult({ id: 'color-leaks', label: 'Color', result: { status: 'fail', message: 'bad' } });
  assert.throws(() => createBaselineCandidate([unmeasured], SHA), /non-measured/);
});

test('improvement-only update is deterministic and rejects regressions', () => {
  const original = check('color-leaks', 'fail', [{ key: 'a', count: 2 }, { key: 'b', count: 1 }]);
  const base = baselineFor(original);
  const improvedResult = check('color-leaks', 'fail', [{ key: 'a', count: 1 }]);
  const evaluation = evaluateRatchet([improvedResult], base);
  const improved = createImprovementBaseline(base, evaluation, 'b'.repeat(40));
  assert.equal(improved.checks['color-leaks'].dimensions.debt.value, 1);

  const dir = mkdtempSync(join(tmpdir(), 'theme-doctor-'));
  try {
    const path = join(dir, 'baseline.json');
    writeBaselineAtomic(path, improved);
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), improved);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const regression = evaluateRatchet([check('color-leaks', 'fail', [{ key: 'a', count: 4 }])], base);
  assert.throws(() => createImprovementBaseline(base, regression, 'b'.repeat(40)), BaselineError);
});

test('provenance rejects a hash-shaped sourceCommit that is not a real HEAD ancestor', () => {
  const candidate = baselineFor(check('color-leaks'));
  assert.throws(() => verifyBaselineProvenance(candidate, {
    headCommit: 'b'.repeat(40),
    isAncestor: () => false,
    measureCommit: () => { throw new Error('must not measure a fake commit'); },
  }), /not a real ancestor/);
});

test('provenance rejects caller-authored debt that does not match sourceCommit measurement', () => {
  const candidate = baselineFor(check('color-leaks', 'fail', [{ key: 'a', count: 3 }]));
  assert.throws(() => verifyBaselineProvenance(candidate, {
    headCommit: 'b'.repeat(40),
    isAncestor: () => true,
    measureCommit: () => [check('color-leaks', 'fail', [{ key: 'a', count: 2 }])],
  }), /does not exactly match/);
});

test('authoritative baseline rejects growth even when candidate matches its own sourceCommit', () => {
  const authority = baselineFor(check('color-leaks', 'fail', [{ key: 'a', count: 2 }]));
  const candidate = baselineFor(check('color-leaks', 'fail', [{ key: 'a', count: 3 }]));
  assert.throws(() => verifyBaselineProvenance(candidate, {
    headCommit: 'b'.repeat(40),
    isAncestor: () => true,
    measureCommit: () => [check('color-leaks', 'fail', [{ key: 'a', count: 3 }])],
    authoritativeBaseline: authority,
  }), /grows .* from 2 to 3/);
});

test('authoritative baseline accepts an equal baseline or strict debt subset only', () => {
  const authority = baselineFor(check('color-leaks', 'fail', [
    { key: 'a', count: 2 },
    { key: 'b', count: 1 },
  ]));
  assert.doesNotThrow(() => assertBaselineMonotonic(authority, authority));
  const improved = baselineFor(check('color-leaks', 'fail', [{ key: 'a', count: 1 }]));
  assert.doesNotThrow(() => assertBaselineMonotonic(improved, authority));

  const swapped = baselineFor(check('color-leaks', 'fail', [{ key: 'c', count: 1 }]));
  assert.throws(() => assertBaselineMonotonic(swapped, authority), /swaps\/adds/);
});
