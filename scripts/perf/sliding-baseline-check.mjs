#!/usr/bin/env node
/**
 * PERF-INIT-V2.1 PR-G2: Sliding baseline drift gate + flake budget.
 *
 * Replaces the single-snapshot regression check in route-performance-budget.mjs
 * with a rolling FIFO window: 14-day sliding median per route key, IQR-based
 * variance band, flake budget tracking with external JSONL ledger.
 *
 * Spike contract: docs/performance/PR-V2.1-G2-sliding-baseline-spike.md
 * Codex thread (spike): 019e26f9-5c6d-7bb1-a81e-5fdf403a80bf (AGREE final)
 *
 * Inputs:
 *   --baseline PATH        path to tests/perf/baseline.json (extended schema)
 *   --current PATH         path to current run JSON (e.g. tests/perf/last-run.json)
 *   --ledger PATH          false-positive ledger (JSONL append-only)
 *   --window-days N        sliding window (default 14)
 *   --fifo-size N          history cap per route (default 30; 50 if cadence>2/day)
 *   --variance-band-pct N  variance threshold (default 5)
 *   --routes a,b,...       filter routes (default all)
 *   --append-history       append current run to history FIFO + recompute stats
 *   --warn-only            never exit 1 (hard-fail eligible date overrides)
 *   --waiver               accept hard-fail waiver if present in baseline._hardFailWaiver
 *
 * Exit codes:
 *   0   PASS or warn-only with regressions
 *   1   HARD FAIL (hard-fail active + confirmed regression outside variance band)
 *   2   FLAKE BUDGET EXCEEDED (>1 FP/20 or >=3 FP/100)
 *   3   USAGE / INPUT ERROR
 *
 * Hard-fail activation criteria (spike §4.4):
 *   - baseline._phase === 'hard-fail'
 *   - now >= baseline._hardFailActivationDate
 *   - _hardFailActivation.windowsSatisfied >= 3
 *   - _hardFailActivation.comparableRuns >= 20
 *   - _hardFailActivation.flakeBudgetSatisfied === true
 *
 * Owner waiver (spike §4.4): baseline._hardFailWaiver.expires_at in future → bypass.
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DEFAULTS = {
  baseline: 'tests/perf/baseline.json',
  current: 'tests/perf/last-run.json',
  ledger: 'docs/performance/measurements/perf-budget-fp-ledger.jsonl',
  windowDays: 14,
  fifoSize: 30,
  varianceBandPct: 5,
  warnOnly: false,
  appendHistory: false,
  acceptWaiver: false,
};

function parseArgs(argv) {
  const opt = { ...DEFAULTS, routes: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--baseline') opt.baseline = argv[++i];
    else if (a === '--current') opt.current = argv[++i];
    else if (a === '--ledger') opt.ledger = argv[++i];
    else if (a === '--window-days') opt.windowDays = parseInt(argv[++i], 10);
    else if (a === '--fifo-size') opt.fifoSize = parseInt(argv[++i], 10);
    else if (a === '--variance-band-pct') opt.varianceBandPct = parseFloat(argv[++i]);
    else if (a === '--routes') opt.routes = argv[++i].split(',');
    else if (a === '--append-history') opt.appendHistory = true;
    else if (a === '--warn-only') opt.warnOnly = true;
    else if (a === '--waiver') opt.acceptWaiver = true;
    else if (a === '--help' || a === '-h') {
      printUsage();
      process.exit(0);
    } else {
      console.error(`Unknown arg: ${a}`);
      printUsage();
      process.exit(3);
    }
  }
  return opt;
}

function printUsage() {
  console.log(
    [
      'Usage: node scripts/perf/sliding-baseline-check.mjs [options]',
      '',
      '  --baseline PATH           tests/perf/baseline.json',
      '  --current  PATH           tests/perf/last-run.json',
      '  --ledger   PATH           docs/performance/measurements/perf-budget-fp-ledger.jsonl',
      '  --window-days N           sliding window days (default 14)',
      '  --fifo-size N             history cap (default 30)',
      '  --variance-band-pct N     variance band % (default 5)',
      '  --routes a,b,...          filter routes',
      '  --append-history          push current run into history FIFO + recompute',
      '  --warn-only               never exit 1 on regression',
      '  --waiver                  honor baseline._hardFailWaiver',
    ].join('\n'),
  );
}

const TRACKED_METRICS = [
  'transferKB',
  'decodedKB',
  'resourceCount',
  'tbtMs',
  'longTaskTotalMs',
  'lcpMs',
  'fcpMs',
];

/**
 * Sorted median (low-mid index for even-length per Codex tur-1 absorb).
 * Returns undefined for empty input.
 */
function median(values) {
  const arr = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (arr.length === 0) return undefined;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 === 0 ? (arr[mid - 1] + arr[mid]) / 2 : arr[mid];
}

function percentile(values, p) {
  const arr = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (arr.length === 0) return undefined;
  if (arr.length === 1) return arr[0];
  const idx = Math.min(arr.length - 1, Math.floor(arr.length * p));
  return arr[idx];
}

function stdDev(values) {
  const arr = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (arr.length < 2) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

/**
 * Compute sliding window stats over history entries within windowDays.
 * Returns { median, p95, stdDev, count } per metric, or insufficient marker.
 */
function computeSlidingStats(history, windowDays) {
  const cutoff = Date.now() - windowDays * 86400000;
  const recent = (history ?? []).filter((e) => typeof e.timestamp === 'number' && e.timestamp >= cutoff);
  if (recent.length < 3) {
    return { insufficient: true, count: recent.length, reason: 'insufficient_history (<3 entries)' };
  }
  const stats = { count: recent.length, median: {}, p95: {}, stdDev: {} };
  for (const metric of TRACKED_METRICS) {
    const values = recent.map((e) => e.metrics?.[metric]).filter((v) => typeof v === 'number');
    if (values.length === 0) continue;
    stats.median[metric] = median(values);
    stats.p95[metric] = percentile(values, 0.95);
    stats.stdDev[metric] = stdDev(values);
  }
  return stats;
}

/**
 * Count false positives in last N comparable runs from JSONL ledger.
 * Ledger entry shape: { timestamp, route, mode, authState, build_sha, confirmed_fp: bool }
 * routeKey format: "<route>::<mode>" (authState carried by ledger entry itself,
 * tracked per route+mode pair; spike §4.2 5-part context still validated by
 * flake-budget-tracker.mjs at append time).
 */
function countFalsePositives(ledgerPath, routeKey, lastN) {
  if (!existsSync(ledgerPath)) return 0;
  const lines = readFileSync(ledgerPath, 'utf8').split('\n').filter(Boolean);
  const entries = lines
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter((e) => e && e.confirmed_fp === true)
    .filter((e) => `${e.route}::${e.mode}` === routeKey)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, lastN);
  return entries.length;
}

/**
 * Spike §4.2 flake budget evaluation. Returns satisfied + reason.
 */
function evaluateFlakeBudget(ledgerPath, routeKey) {
  const last20 = countFalsePositives(ledgerPath, routeKey, 20);
  const last100 = countFalsePositives(ledgerPath, routeKey, 100);
  const satisfied = last20 <= 1 && last100 < 3;
  return { satisfied, last20, last100 };
}

/**
 * Variance band check (spike §4.4):
 *   outsideBand = current > p95 OR current > median + 2*stdDev
 */
function outsideVarianceBand(currentValue, stats, metric) {
  const p95 = stats.p95?.[metric];
  const med = stats.median?.[metric];
  const sd = stats.stdDev?.[metric];
  if (p95 === undefined || med === undefined) return false;
  if (currentValue > p95) return true;
  if (sd !== undefined && currentValue > med + 2 * sd) return true;
  return false;
}

/**
 * Spike §4.4 hard-fail activation evaluator. Returns isActive + criteria detail.
 */
function isHardFailActive(baseline, opts) {
  if (baseline._phase !== 'hard-fail') {
    return { active: false, reason: `phase=${baseline._phase ?? 'unset'} (not 'hard-fail')` };
  }
  const eligibleDate = baseline._hardFailActivationDate
    ? new Date(baseline._hardFailActivationDate)
    : null;
  if (!eligibleDate || Number.isNaN(eligibleDate.getTime())) {
    return { active: false, reason: 'missing _hardFailActivationDate' };
  }
  if (Date.now() < eligibleDate.getTime()) {
    return { active: false, reason: `before eligibility (${baseline._hardFailActivationDate})` };
  }
  const ev = baseline._hardFailActivation;
  if (!ev) return { active: false, reason: 'missing _hardFailActivation evidence block' };
  if (!(ev.windowsSatisfied >= 3)) return { active: false, reason: `windowsSatisfied=${ev.windowsSatisfied} < 3` };
  if (!(ev.comparableRuns >= 20)) return { active: false, reason: `comparableRuns=${ev.comparableRuns} < 20` };
  if (ev.flakeBudgetSatisfied !== true) return { active: false, reason: 'flakeBudgetSatisfied !== true' };
  if (!ev.baselineReviewSha) return { active: false, reason: 'missing baselineReviewSha' };
  if (!ev.activatedBy || !ev.activatedAt) return { active: false, reason: 'missing activatedBy/activatedAt' };
  if (opts.acceptWaiver && baseline._hardFailWaiver) {
    const expires = baseline._hardFailWaiver.expires_at
      ? new Date(baseline._hardFailWaiver.expires_at)
      : null;
    if (expires && expires.getTime() > Date.now()) {
      return { active: false, reason: `owner waiver (${baseline._hardFailWaiver.owner}; expires ${baseline._hardFailWaiver.expires_at})` };
    }
  }
  return { active: true, evidence: ev };
}

/**
 * Build extended baseline entry from current run summary.
 * Codex tur-1 absorb: full join-key schema.
 */
function buildHistoryEntry(run, route) {
  return {
    timestamp: run.timestamp ?? Date.now(),
    build_sha: run.build_sha ?? process.env.GITHUB_SHA ?? 'unknown',
    frontend_image_ref: run.frontend_image_ref ?? '',
    frontend_image_digest: run.frontend_image_digest ?? '',
    route: route.route,
    mode: route.mode,
    authState: route.auth ?? 'anonymous',
    cacheMode: route.mode?.includes('warm') ? 'warm' : 'cold',
    browserProfile: 'playwright-chromium-bundled',
    browserVersion: run.browserVersion ?? '',
    target: run.target ?? 'local',
    metrics: {
      transferKB: route.transferKB,
      decodedKB: route.decodedKB,
      resourceCount: route.resourceCount,
      tbtMs: route.tbtMs,
      longTaskTotalMs: route.longTaskTotalMs,
      lcpMs: route.lcpMs,
      fcpMs: route.fcpMs,
    },
  };
}

function pushFifo(arr, entry, cap) {
  const next = [...(arr ?? []), entry];
  if (next.length > cap) next.splice(0, next.length - cap);
  return next;
}

function ensureRouteEntry(baseline, routeKey, opts) {
  if (!baseline.routes[routeKey] || Array.isArray(baseline.routes[routeKey].history) === false) {
    // Migrate legacy single-snapshot shape if present (PR-G1 #420).
    const legacy = baseline.routes[routeKey];
    const isLegacy = legacy && legacy.history === undefined && typeof legacy === 'object';
    const history = isLegacy
      ? [
          {
            timestamp: baseline.timestamp ?? Date.now(),
            build_sha: 'legacy-pr-g1',
            route: routeKey.split('::')[0],
            mode: routeKey.split('::')[1] ?? 'cold-anonymous',
            authState: routeKey.split('::')[2] ?? 'anonymous',
            target: 'local',
            browserProfile: 'playwright-chromium-bundled',
            metrics: {
              transferKB: legacy.transferKB,
              decodedKB: legacy.decodedKB,
              resourceCount: legacy.resourceCount,
              tbtMs: legacy.tbtMs,
              longTaskTotalMs: legacy.longTaskTotalMs,
              lcpMs: legacy.lcpMs,
              fcpMs: legacy.fcpMs,
            },
          },
        ]
      : [];
    baseline.routes[routeKey] = {
      history,
      windowDays: opts.windowDays,
      median: {},
      p95: {},
      stdDev: {},
      flakeBudget: {
        last20Runs_falsePositives: 0,
        last100Runs_falsePositives: 0,
        varianceBand_percent: opts.varianceBandPct,
        falsePositiveLedgerPath: opts.ledger,
      },
    };
  }
  return baseline.routes[routeKey];
}

function checkRoute(routeRun, baseline, opts) {
  const routeKey = `${routeRun.route}::${routeRun.mode}`;
  const entry = ensureRouteEntry(baseline, routeKey, opts);
  const stats = computeSlidingStats(entry.history, opts.windowDays);
  const flake = evaluateFlakeBudget(opts.ledger, routeKey);
  const hardFail = isHardFailActive(baseline, opts);

  const result = {
    routeKey,
    stats,
    flake,
    hardFail,
    regressions: [],
    warnings: [],
    decisions: [],
  };

  if (stats.insufficient) {
    result.decisions.push(`INSUFFICIENT_HISTORY: ${stats.reason}; warn-only by default`);
    return result;
  }

  for (const metric of TRACKED_METRICS) {
    const current = routeRun[metric];
    const med = stats.median?.[metric];
    if (current === undefined || med === undefined) continue;
    const ratio = current / med;
    const outsideBand = outsideVarianceBand(current, stats, metric);
    if (ratio > 1.05) {
      if (outsideBand) {
        const tag = hardFail.active ? 'HARD_FAIL' : 'WARN_ONLY';
        result.regressions.push({
          metric,
          current,
          median: med,
          ratio: Number(ratio.toFixed(3)),
          p95: stats.p95?.[metric],
          stdDev: stats.stdDev?.[metric],
          tag,
          outsideBand: true,
        });
      } else {
        result.warnings.push({
          metric,
          current,
          median: med,
          ratio: Number(ratio.toFixed(3)),
          reason: 'inside_variance_band: flake-tracker decide (rerun candidate)',
        });
      }
    }
  }

  return result;
}

function maybeAppendHistory(routeRun, baseline, opts) {
  const routeKey = `${routeRun.route}::${routeRun.mode}`;
  const entry = ensureRouteEntry(baseline, routeKey, opts);
  const newEntry = buildHistoryEntry({ timestamp: baseline._currentRunTs ?? Date.now() }, routeRun);
  entry.history = pushFifo(entry.history, newEntry, opts.fifoSize);
  const stats = computeSlidingStats(entry.history, opts.windowDays);
  if (!stats.insufficient) {
    entry.median = stats.median;
    entry.p95 = stats.p95;
    entry.stdDev = stats.stdDev;
  }
  entry.flakeBudget.last20Runs_falsePositives = countFalsePositives(opts.ledger, routeKey, 20);
  entry.flakeBudget.last100Runs_falsePositives = countFalsePositives(opts.ledger, routeKey, 100);
}

function main() {
  const opt = parseArgs(process.argv.slice(2));

  if (!existsSync(opt.baseline)) {
    console.error(`[g2] FATAL: baseline file missing: ${opt.baseline}`);
    process.exit(3);
  }
  if (!existsSync(opt.current)) {
    console.error(`[g2] FATAL: current run file missing: ${opt.current}`);
    process.exit(3);
  }

  const baseline = JSON.parse(readFileSync(opt.baseline, 'utf8'));
  const current = JSON.parse(readFileSync(opt.current, 'utf8'));
  if (!baseline.routes) baseline.routes = {};

  const routes = Array.isArray(current.routes) ? current.routes : [];
  const targets = opt.routes ? routes.filter((r) => opt.routes.includes(r.route)) : routes;
  if (opt.routes && targets.length === 0) {
    console.error(`[g2] FATAL: --routes filter matched no entries in ${opt.current}`);
    process.exit(3);
  }

  console.log(`[g2] sliding baseline check; window=${opt.windowDays}d fifo=${opt.fifoSize} ledger=${opt.ledger}`);

  let anyHardFail = false;
  let flakeBudgetExceeded = false;
  const report = [];

  for (const r of targets) {
    if (r.skipped || r.error) {
      console.log(`[g2] ${r.route}::${r.mode} skipped (${r.error ?? 'skipped'})`);
      continue;
    }
    const res = checkRoute(r, baseline, opt);
    report.push(res);

    console.log(`[g2] ${res.routeKey}`);
    console.log(`     history.count=${res.stats.count ?? 0} hardFail.active=${res.hardFail.active} reason=${res.hardFail.reason ?? 'eligible'}`);
    console.log(`     flake last20FP=${res.flake.last20} last100FP=${res.flake.last100} satisfied=${res.flake.satisfied}`);
    for (const d of res.decisions) {
      console.log(`     ${d}`);
    }

    if (!res.flake.satisfied) {
      flakeBudgetExceeded = true;
      console.error(`     FLAKE_BUDGET_EXCEEDED: last20=${res.flake.last20} (max 1), last100=${res.flake.last100} (max 2)`);
    }

    for (const w of res.warnings) {
      console.log(`     WARN  ${w.metric}=${w.current} vs median=${w.median} ratio=${w.ratio} (${w.reason})`);
    }
    for (const fail of res.regressions) {
      console.log(`     ${fail.tag}  ${fail.metric}=${fail.current} vs median=${fail.median} ratio=${fail.ratio} p95=${fail.p95} stdDev=${fail.stdDev?.toFixed?.(2)}`);
      if (fail.tag === 'HARD_FAIL') anyHardFail = true;
    }

    if (opt.appendHistory) {
      maybeAppendHistory(r, baseline, opt);
    }
  }

  if (opt.appendHistory) {
    baseline.timestamp = Date.now();
    mkdirSync(dirname(opt.baseline), { recursive: true });
    writeFileSync(opt.baseline, JSON.stringify(baseline, null, 2));
    console.log(`[g2] baseline history appended → ${opt.baseline}`);
  }

  // Decision
  if (flakeBudgetExceeded) {
    console.error('[g2] FLAKE BUDGET EXCEEDED (>1 FP/20 or >=3 FP/100). exit 2');
    process.exit(2);
  }
  if (anyHardFail) {
    if (opt.warnOnly) {
      console.log('[g2] HARD_FAIL present but --warn-only set; exit 0');
      process.exit(0);
    }
    console.error('[g2] HARD_FAIL regression confirmed (outside variance band + hard-fail active). exit 1');
    process.exit(1);
  }
  console.log('[g2] PASS');
  process.exit(0);
}

// ESM main guard
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  try {
    main();
  } catch (e) {
    console.error('[g2] FATAL:', e && e.message ? e.message : e);
    process.exit(3);
  }
}

export {
  parseArgs,
  median,
  percentile,
  stdDev,
  computeSlidingStats,
  countFalsePositives,
  evaluateFlakeBudget,
  outsideVarianceBand,
  isHardFailActive,
  buildHistoryEntry,
  ensureRouteEntry,
  pushFifo,
  checkRoute,
  TRACKED_METRICS,
};
