/**
 * PERF-INIT-V2.1 dual budget Phase 2: route-budget evaluation unit tests.
 *
 * Covers scripts/ci/lib/route-budget-evaluate.mjs — the pure threshold
 * evaluation core extracted from route-performance-budget.mjs so it can be
 * tested without the Playwright dependency graph.
 *
 * Runs with `node --test` (dependency-free; the `unit-tests` job in
 * perf-budget.yml runs install-free — same pattern as
 * scripts/perf/__tests__/sliding-baseline.test.mjs).
 *
 * Run: node --test scripts/ci/__tests__/route-budget-evaluate.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { evaluate, resolveBudgetThresholds } from '../lib/route-budget-evaluate.mjs';

// --- resolveBudgetThresholds -------------------------------------------------

test('resolveBudgetThresholds: no profile → flat schema (route entry itself)', () => {
  const budget = { route: '/home', mode: 'cold-authenticated', transferFailKB: 3000 };
  const res = resolveBudgetThresholds(budget, null);
  assert.equal(res.error, undefined);
  assert.equal(res.thresholds, budget, 'flat schema returns the budget entry by reference');
});

test('resolveBudgetThresholds: profile present → nested object', () => {
  const guard = { transferFailKB: 10000 };
  const budget = { route: '/home', mode: 'cold-authenticated', regressionGuard: guard };
  const res = resolveBudgetThresholds(budget, 'regressionGuard');
  assert.equal(res.error, undefined);
  assert.equal(res.thresholds, guard, 'nested profile object returned');
});

test('resolveBudgetThresholds: requested profile absent → fail-closed error', () => {
  const budget = { route: '/home', mode: 'cold-authenticated', transferFailKB: 3000 };
  const res = resolveBudgetThresholds(budget, 'regressionGuard');
  assert.equal(res.thresholds, undefined);
  assert.match(res.error, /budget-profile "regressionGuard" is not defined/);
});

test('resolveBudgetThresholds: profile key is an array → error (arrays rejected)', () => {
  const budget = { route: '/x', mode: 'cold', regressionGuard: [1, 2, 3] };
  const res = resolveBudgetThresholds(budget, 'regressionGuard');
  assert.match(res.error, /not defined \(or not an object\)/);
});

test('resolveBudgetThresholds: profile key is a primitive → error', () => {
  const budget = { route: '/x', mode: 'cold', regressionGuard: 5000 };
  const res = resolveBudgetThresholds(budget, 'regressionGuard');
  assert.match(res.error, /not defined \(or not an object\)/);
});

// --- evaluate: flat schema (back-compat) -------------------------------------

test('evaluate: flat schema — value over fail threshold → failure (pre-Phase-2 behavior)', () => {
  const budget = { route: '/home', mode: 'cold-authenticated', transferFailKB: 3000 };
  const res = evaluate({ transferKB: 9000 }, budget);
  assert.equal(res.pass, false);
  assert.equal(res.failures.length, 1);
  assert.match(res.failures[0], /transferKB=9000 \(fail threshold 3000\)/);
});

test('evaluate: flat schema — value under fail threshold → pass', () => {
  const budget = { route: '/home', mode: 'cold-authenticated', transferFailKB: 3000 };
  const res = evaluate({ transferKB: 2000 }, budget);
  assert.equal(res.pass, true);
  assert.equal(res.failures.length, 0);
});

test('evaluate: flat schema — value between warn and fail → warning, still pass', () => {
  const budget = {
    route: '/home',
    mode: 'cold-authenticated',
    transferWarnKB: 2000,
    transferFailKB: 3000,
  };
  const res = evaluate({ transferKB: 2500 }, budget);
  assert.equal(res.pass, true);
  assert.equal(res.failures.length, 0);
  assert.equal(res.warnings.length, 1);
  assert.match(res.warnings[0], /transferKB=2500 \(warn threshold 2000\)/);
});

// --- evaluate: budget-profile (Phase 2) --------------------------------------

test('evaluate: profile=regressionGuard — passes loose guard while flat would fail', () => {
  // flat transferFailKB=3000 would FAIL at 9000; regressionGuard 10000 PASSES.
  const budget = {
    route: '/home',
    mode: 'cold-authenticated',
    transferFailKB: 3000,
    regressionGuard: { transferFailKB: 10000 },
  };
  const res = evaluate({ transferKB: 9000 }, budget, { budgetProfile: 'regressionGuard' });
  assert.equal(res.pass, true, 'regressionGuard threshold (10000) read, flat (3000) ignored');
  assert.equal(res.failures.length, 0);
});

test('evaluate: profile=targetBudget — stricter threshold fails value that flat passes', () => {
  // flat transferFailKB=9500 would PASS at 9000; targetBudget 3000 FAILS.
  const budget = {
    route: '/home',
    mode: 'cold-authenticated',
    transferFailKB: 9500,
    targetBudget: { transferFailKB: 3000 },
  };
  const res = evaluate({ transferKB: 9000 }, budget, { budgetProfile: 'targetBudget' });
  assert.equal(res.pass, false, 'targetBudget threshold (3000) read, flat (9500) ignored');
  assert.match(res.failures[0], /transferKB=9000 \(fail threshold 3000\)/);
});

test('evaluate: profile requested but absent → validityError, pass:false', () => {
  const budget = { route: '/home', mode: 'cold-authenticated', transferFailKB: 3000 };
  const res = evaluate({ transferKB: 9000 }, budget, { budgetProfile: 'regressionGuard' });
  assert.equal(res.pass, false);
  assert.match(res.validityError, /budget-profile "regressionGuard" is not defined/);
  assert.deepEqual(res.failures, [], 'validityError short-circuits threshold checks');
});

test('evaluate: profile present but a metric key absent → that metric skipped, others checked', () => {
  // regressionGuard defines only lcpFailMs; transferKB has no threshold there.
  const budget = {
    route: '/home',
    mode: 'cold-authenticated',
    transferFailKB: 3000,
    regressionGuard: { lcpFailMs: 2400 },
  };
  const res = evaluate(
    { transferKB: 99999, lcpMs: 5000 },
    budget,
    { budgetProfile: 'regressionGuard' },
  );
  // transferKB not checked (no key in profile); lcpMs checked → fail.
  assert.equal(res.pass, false);
  assert.equal(res.failures.length, 1);
  assert.match(res.failures[0], /lcpMs=5000 \(fail threshold 2400\)/);
});

// --- evaluate: regression-vs-baseline (orthogonal to profile) ----------------

test('evaluate: regression vs baseline — >5% over baseline → regression failure', () => {
  const budget = { route: '/home', mode: 'cold-authenticated', transferFailKB: 99999 };
  const baseline = { routes: { '/home::cold-authenticated': { transferKB: 1000 } } };
  const res = evaluate({ transferKB: 1100 }, budget, {
    baseline,
    regressionPolicy: { hardFailRegressionPercent: 5 },
  });
  assert.equal(res.pass, false);
  assert.match(res.failures[0], /transferKB regression: 1100 vs baseline 1000/);
});

test('evaluate: regression check is orthogonal — fires regardless of budgetProfile', () => {
  const budget = {
    route: '/home',
    mode: 'cold-authenticated',
    regressionGuard: { transferFailKB: 99999 }, // profile static threshold passes
  };
  const baseline = { routes: { '/home::cold-authenticated': { transferKB: 1000 } } };
  const res = evaluate({ transferKB: 1100 }, budget, {
    budgetProfile: 'regressionGuard',
    baseline,
    regressionPolicy: { hardFailRegressionPercent: 5 },
  });
  // regressionGuard static threshold passes (99999); baseline regression fails.
  assert.equal(res.pass, false);
  assert.match(res.failures[0], /transferKB regression/);
});

test('evaluate: no baseline supplied → regression check inert (threshold-only verdict)', () => {
  const budget = { route: '/home', mode: 'cold-authenticated', transferFailKB: 99999 };
  const res = evaluate({ transferKB: 9000 }, budget, {
    regressionPolicy: { hardFailRegressionPercent: 5 },
  });
  assert.equal(res.pass, true, 'no baseline → no regression comparison');
});

// --- Codex 019e2f6c P1 fail-closed hardening: silent-no-op schema traps ------

test('resolveBudgetThresholds: profile with un-suffixed metric keys → trap error (§5.3 sketch rejected)', () => {
  // The PERF-DEBT-V3 §5.3 sketch used bare metric names (transferKB/lcpMs/cls);
  // check() never reads those → silent no-op. resolveBudgetThresholds rejects it.
  const budget = {
    route: '/home',
    mode: 'cold-authenticated',
    targetBudget: { transferKB: 3000, lcpMs: 1200, cls: 0.1 },
  };
  const res = resolveBudgetThresholds(budget, 'targetBudget');
  assert.equal(res.thresholds, undefined);
  assert.match(res.error, /un-suffixed metric key/);
  assert.match(res.error, /transferKB/);
});

test('resolveBudgetThresholds: profile with no recognized threshold key → error', () => {
  const budget = {
    route: '/home',
    mode: 'cold-authenticated',
    regressionGuard: { foo: 1, bar: 2 },
  };
  const res = resolveBudgetThresholds(budget, 'regressionGuard');
  assert.equal(res.thresholds, undefined);
  assert.match(res.error, /no recognized threshold key/);
});

test('resolveBudgetThresholds: profile with recognized key + non-threshold metadata → OK', () => {
  const guard = { transferFailKB: 10000, _phase: 'hard-fail-regression-guard-only' };
  const budget = { route: '/home', mode: 'cold-authenticated', regressionGuard: guard };
  const res = resolveBudgetThresholds(budget, 'regressionGuard');
  assert.equal(res.error, undefined);
  assert.equal(res.thresholds, guard, 'non-threshold metadata keys are tolerated');
});

test('evaluate: profile with un-suffixed metric keys → validityError (silent no-op blocked)', () => {
  // Codex 019e2f6c P1 smoke replay: absurd metrics + bare-key profile must NOT
  // pass. Pre-fix this returned { pass: true, failures: [] }.
  const budget = {
    route: '/home',
    mode: 'cold-authenticated',
    targetBudget: { transferKB: 300, lcpMs: 2500, cls: 0.1 },
  };
  const res = evaluate(
    { transferKB: 999999, lcpMs: 999999, cls: 999 },
    budget,
    { budgetProfile: 'targetBudget' },
  );
  assert.equal(res.pass, false);
  assert.match(res.validityError, /un-suffixed metric key/);
});
