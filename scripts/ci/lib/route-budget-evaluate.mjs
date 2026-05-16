/**
 * PERF-INIT-V2.1 dual budget Phase 2: pure route-budget evaluation core.
 *
 * Extracted from `scripts/ci/route-performance-budget.mjs` so the threshold
 * evaluation logic can be unit-tested without the Playwright dependency graph.
 * The CI `unit-tests` job in `perf-budget.yml` runs `node --test` install-free
 * — same pattern as `scripts/perf/__tests__/sliding-baseline.test.mjs`.
 *
 * This module is intentionally dependency-free (no `node:*`, no third-party
 * imports) — pure functions only.
 *
 * Dual budget design (Codex `019e2cbf` strategic warning + `019e2d16` §0
 * REVISE absorb — see docs/performance/PERF-DEBT-V3-backlog-tracking.md §5):
 *   - Pre-Phase-2 the runner read budget thresholds from the FLAT route entry
 *     (`transferFailKB`, `lcpFailMs`, `clsFail`, ...).
 *   - Phase 2 adds an optional `budgetProfile` selector. When set, thresholds
 *     are read from a nested object `budget[budgetProfile]` (e.g.
 *     `regressionGuard` — current-baseline + tolerance, hard-flip guard; or
 *     `targetBudget` — V3 leader-target aspirational tracker).
 *   - The nested profile object reuses the SAME flat threshold key names
 *     (`transferFailKB`, `decodedFailKB`, `lcpFailMs`, `clsFail`,
 *     `transferWarnKB`, ...). Any subset is allowed; a missing key skips that
 *     metric's check. This keeps `check()` unchanged — only the lookup object
 *     differs. Phase 3 (`performance-budgets.json` nested schema extend) MUST
 *     populate profile objects with these flat key names.
 *   - Flat-schema back-compat: `budgetProfile` falsy → thresholds come from the
 *     route entry itself (identical to pre-Phase-2 behavior).
 *   - Fail-closed: a requested `--budget-profile X` that is missing, not an
 *     object, uses an un-suffixed metric-key trap, or defines no recognized
 *     threshold key → `evaluate()` returns `validityError`; the caller
 *     hard-fails and never masks it with `--warn-only`.
 */

/**
 * Threshold keys that evaluate()'s check() actually consults. A nested budget
 * profile object MUST supply at least one of these (suffixed form) — otherwise
 * the profile would silently pass every route (the pre-Phase-2 "nested schema
 * silent no-op" risk, Codex thread 019e2f6c P1).
 */
const RECOGNIZED_THRESHOLD_KEYS = new Set([
  'transferWarnKB',
  'transferFailKB',
  'decodedFailKB',
  'resourceFailCount',
  'tbtFailMs',
  'longTaskMaxFailMs',
  'longTaskCountFail',
  'longTaskTotalFailMs',
  'lcpFailMs',
  'fcpFailMs',
  'inpFailMs',
  'clsFail',
]);

/**
 * Un-suffixed measurement metric names. If these appear as keys in a profile
 * object they are a silent-no-op trap — check() reads the suffixed form
 * (transferFailKB, ...), never the bare metric name. The PERF-DEBT-V3 §5.3
 * sketch used these bare names; Phase 2 rejects them with an explicit error so
 * Phase 3 cannot accidentally reintroduce the silent no-op.
 */
const METRIC_TRAP_KEYS = new Set([
  'transferKB',
  'decodedKB',
  'resourceCount',
  'tbtMs',
  'longTaskMaxMs',
  'longTaskCount',
  'longTaskTotalMs',
  'lcpMs',
  'fcpMs',
  'inpMs',
  'cls',
]);

/**
 * Resolve which object supplies threshold keys for a route.
 *
 * Flat schema (no budgetProfile) → the route entry itself. Profile mode → the
 * nested `budget[budgetProfile]` object, fail-closed on a missing/invalid
 * profile, on un-suffixed metric-key traps, and on a profile that defines no
 * recognized threshold key.
 *
 * @param {object} budget         route budget entry from performance-budgets.json
 * @param {?string} budgetProfile profile name, or falsy for flat schema
 * @returns {{thresholds: object} | {error: string}}
 */
export function resolveBudgetThresholds(budget, budgetProfile) {
  if (!budgetProfile) {
    // Flat schema (back-compat): the route entry itself supplies thresholds.
    return { thresholds: budget };
  }
  const routeId = `${budget.route}::${budget.mode}`;
  const profileObj = budget[budgetProfile];
  if (
    profileObj === null
    || typeof profileObj !== 'object'
    || Array.isArray(profileObj)
  ) {
    return {
      error: `budget-profile "${budgetProfile}" is not defined (or not an object) for route ${routeId}`,
    };
  }
  // Fail-closed schema validation (Codex 019e2f6c P1) — a profile object whose
  // keys check() never reads would silently pass every route. Reject the
  // un-suffixed-metric-key trap explicitly, and require at least one
  // recognized (suffixed) threshold key.
  const keys = Object.keys(profileObj);
  const trapKeys = keys.filter((k) => METRIC_TRAP_KEYS.has(k));
  if (trapKeys.length > 0) {
    return {
      error: `budget-profile "${budgetProfile}" for route ${routeId} uses un-suffixed metric key(s) [${trapKeys.join(', ')}]; profile threshold keys must use the suffixed form (transferFailKB, decodedFailKB, lcpFailMs, clsFail, ...)`,
    };
  }
  if (!keys.some((k) => RECOGNIZED_THRESHOLD_KEYS.has(k))) {
    return {
      error: `budget-profile "${budgetProfile}" for route ${routeId} defines no recognized threshold key (expected at least one of: ${[...RECOGNIZED_THRESHOLD_KEYS].join(', ')})`,
    };
  }
  return { thresholds: profileObj };
}

/**
 * Evaluate a route measurement summary against its budget.
 *
 * @param {object} summary  per-route median metrics (route-performance-budget summary)
 * @param {object} budget   route budget entry
 * @param {object} [options]
 * @param {?string} [options.budgetProfile]    nested profile selector (Phase 2)
 * @param {?object} [options.baseline]         baseline.json contents ({routes:{}})
 * @param {?object} [options.regressionPolicy] budgets._regressionPolicy
 * @returns {{pass:boolean, warnings:string[], failures:string[], validityError?:string}}
 */
export function evaluate(summary, budget, options = {}) {
  const { budgetProfile = null, baseline = null, regressionPolicy = null } = options;
  const warnings = [];
  const failures = [];

  // Phase 2 dual budget: resolve the threshold-source object. A requested but
  // absent profile is a configuration validity error — fail-closed.
  const resolved = resolveBudgetThresholds(budget, budgetProfile);
  if (resolved.error) {
    return { pass: false, warnings: [], failures: [], validityError: resolved.error };
  }
  const thresholds = resolved.thresholds;

  function check(metric, value, warnKey, failKey, op = 'lte') {
    const warn = thresholds[warnKey];
    const fail = thresholds[failKey];
    if (value === undefined) return;
    const cmp = op === 'lte' ? (v, t) => v > t : (v, t) => v < t;
    if (fail !== undefined && cmp(value, fail)) {
      failures.push(`${metric}=${value} (fail threshold ${fail})`);
    } else if (warn !== undefined && cmp(value, warn)) {
      warnings.push(`${metric}=${value} (warn threshold ${warn})`);
    }
  }

  check('transferKB', summary.transferKB, 'transferWarnKB', 'transferFailKB');
  check('decodedKB', summary.decodedKB, undefined, 'decodedFailKB');
  check('resourceCount', summary.resourceCount, undefined, 'resourceFailCount');
  check('tbtMs', summary.tbtMs, undefined, 'tbtFailMs');
  check('longTaskMaxMs', summary.longTaskMaxMs, undefined, 'longTaskMaxFailMs');
  check('longTaskCount', summary.longTaskCount, undefined, 'longTaskCountFail');
  check('longTaskTotalMs', summary.longTaskTotalMs, undefined, 'longTaskTotalFailMs');
  check('lcpMs', summary.lcpMs, undefined, 'lcpFailMs');
  check('fcpMs', summary.fcpMs, undefined, 'fcpFailMs');
  check('inpMs', summary.inpMs, undefined, 'inpFailMs');
  check('cls', summary.cls, undefined, 'clsFail');

  // Regression check vs baseline — orthogonal to budget-profile (always
  // compares to the committed baseline, regardless of which static profile is
  // active). Only runs when a baseline + regression policy are supplied.
  // PR-G2 iter-2 absorb (Codex thread 019e2776 P1-5): support BOTH legacy
  // single-snapshot baseline shape and extended schema with .history[] +
  // .median {}. Resolution order:
  //   1. base.<metric>            (legacy single-snapshot)
  //   2. base.median.<metric>     (G2 extended schema)
  //   3. latest base.history[].metrics.<metric>  (extended fallback)
  const baseKey = `${budget.route}::${budget.mode}`;
  const base = baseline?.routes?.[baseKey];
  function baselineMetric(metric) {
    if (!base) return undefined;
    if (base[metric] !== undefined) return base[metric];
    if (base.median && base.median[metric] !== undefined) return base.median[metric];
    if (Array.isArray(base.history) && base.history.length > 0) {
      const latest = base.history[base.history.length - 1];
      return latest.metrics?.[metric];
    }
    return undefined;
  }
  if (base && regressionPolicy?.hardFailRegressionPercent) {
    const pct = regressionPolicy.hardFailRegressionPercent;
    function regression(metric, current) {
      const baseValue = baselineMetric(metric);
      if (current === undefined || baseValue === undefined) return;
      if (current > baseValue * (1 + pct / 100)) {
        failures.push(`${metric} regression: ${current} vs baseline ${baseValue} (>${pct}%)`);
      }
    }
    regression('transferKB', summary.transferKB);
    regression('decodedKB', summary.decodedKB);
    regression('tbtMs', summary.tbtMs);
    regression('longTaskTotalMs', summary.longTaskTotalMs);
  }

  return { pass: failures.length === 0, warnings, failures };
}
