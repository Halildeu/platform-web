#!/usr/bin/env node
/**
 * PERF-INIT-V2.1 PR-G2: False-positive ledger appender.
 *
 * Confirms a flake (rerun PASS in identical 5-part context) and appends a
 * JSONL line to docs/performance/measurements/perf-budget-fp-ledger.jsonl.
 * Used by CI rerun flow + manual confirmation path.
 *
 * Codex thread (spike): 019e26f9 ABM-1 §4.2 false-positive definition:
 *   same route + mode + auth state + BUILD_SHA class + browser profile
 *   AND rerun PASS AND source/deploy unchanged AND no sentinel fail.
 *
 * Usage:
 *   node scripts/perf/flake-budget-tracker.mjs \
 *     --original PATH --rerun PATH --route /login --mode cold-anonymous \
 *     --ledger PATH [--baseline PATH]
 *
 * Exit:
 *   0  confirmed FP appended
 *   1  not a confirmed FP (context mismatch or rerun also failed)
 *   2  usage / IO error
 */

import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { computeSlidingStats, outsideVarianceBand, ensureRouteEntry, TRACKED_METRICS } from './sliding-baseline-check.mjs';

const DEFAULTS = {
  ledger: 'docs/performance/measurements/perf-budget-fp-ledger.jsonl',
  baseline: 'tests/perf/baseline.json',
  varianceBandPct: 5,
  windowDays: 14,
  fifoSize: 30,
};

function parseArgs(argv) {
  const opt = { ...DEFAULTS, original: null, rerun: null, route: null, mode: null, authState: 'anonymous' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--original') opt.original = argv[++i];
    else if (a === '--rerun') opt.rerun = argv[++i];
    else if (a === '--route') opt.route = argv[++i];
    else if (a === '--mode') opt.mode = argv[++i];
    else if (a === '--auth-state') opt.authState = argv[++i];
    else if (a === '--ledger') opt.ledger = argv[++i];
    else if (a === '--baseline') opt.baseline = argv[++i];
    else if (a === '--help' || a === '-h') {
      printUsage();
      process.exit(0);
    } else {
      console.error(`Unknown arg: ${a}`);
      printUsage();
      process.exit(2);
    }
  }
  return opt;
}

function printUsage() {
  console.log(
    [
      'Usage: node scripts/perf/flake-budget-tracker.mjs [options]',
      '',
      '  --original PATH   original failing run JSON (tests/perf/last-run.json shape)',
      '  --rerun PATH      rerun JSON; must PASS in same context for FP confirm',
      '  --route /path     route key',
      '  --mode MODE       cold-anonymous | cold-authenticated | warm-fresh',
      '  --auth-state S    anonymous | authenticated (default anonymous)',
      '  --ledger PATH     ledger output (JSONL append)',
      '  --baseline PATH   baseline for variance band reference',
    ].join('\n'),
  );
}

function pickRoute(runJson, route, mode) {
  if (!runJson || !Array.isArray(runJson.routes)) return null;
  return runJson.routes.find((r) => r.route === route && r.mode === mode) ?? null;
}

/**
 * Spike §4.2 5-part context equality. Codex iter-2 absorb P0-4:
 *   - route, mode, authState always present (per-route summary)
 *   - build_sha + browser_profile MUST be present; else fail-closed
 *   - frontend_image_digest optional but compared if both supply
 *
 * Returns {same: bool, reason: string}.
 */
function sameContext(a, b) {
  if (!a || !b) return { same: false, reason: 'missing run summary' };
  if (a.route !== b.route) return { same: false, reason: `route mismatch (${a.route} vs ${b.route})` };
  if (a.mode !== b.mode) return { same: false, reason: `mode mismatch (${a.mode} vs ${b.mode})` };
  const authA = a.auth ?? a.authState ?? 'anonymous';
  const authB = b.auth ?? b.authState ?? 'anonymous';
  if (authA !== authB) return { same: false, reason: `auth mismatch (${authA} vs ${authB})` };
  // build_sha REQUIRED on both sides (fail-closed). 'unknown' shadowed via
  // missing field detection rather than ?? default.
  if (!a.build_sha || !b.build_sha) return { same: false, reason: 'build_sha missing on original or rerun (fail-closed)' };
  if (a.build_sha !== b.build_sha) return { same: false, reason: `build_sha mismatch (${a.build_sha} vs ${b.build_sha})` };
  // browser_profile REQUIRED on both sides (fail-closed). Tautology removed.
  if (!a.browser_profile || !b.browser_profile) return { same: false, reason: 'browser_profile missing on original or rerun (fail-closed)' };
  if (a.browser_profile !== b.browser_profile) return { same: false, reason: `browser_profile mismatch (${a.browser_profile} vs ${b.browser_profile})` };
  // Optional but compared when both supply
  if (a.frontend_image_digest && b.frontend_image_digest && a.frontend_image_digest !== b.frontend_image_digest) {
    return { same: false, reason: `frontend_image_digest mismatch` };
  }
  return { same: true, reason: '5-part context identical' };
}

function main() {
  const opt = parseArgs(process.argv.slice(2));
  if (!opt.original || !opt.rerun || !opt.route || !opt.mode) {
    console.error('[fp-tracker] --original, --rerun, --route, --mode required');
    printUsage();
    process.exit(2);
  }
  if (!existsSync(opt.original) || !existsSync(opt.rerun)) {
    console.error('[fp-tracker] original or rerun JSON missing');
    process.exit(2);
  }
  if (!existsSync(opt.baseline)) {
    console.error('[fp-tracker] baseline missing; cannot evaluate variance band');
    process.exit(2);
  }

  const original = JSON.parse(readFileSync(opt.original, 'utf8'));
  const rerun = JSON.parse(readFileSync(opt.rerun, 'utf8'));
  const baseline = JSON.parse(readFileSync(opt.baseline, 'utf8'));

  const o = pickRoute(original, opt.route, opt.mode);
  const r = pickRoute(rerun, opt.route, opt.mode);
  if (!o || !r) {
    console.error(`[fp-tracker] route ${opt.route}::${opt.mode} missing from one of original/rerun`);
    process.exit(1);
  }
  const ctx = sameContext(o, r);
  if (!ctx.same) {
    console.error(`[fp-tracker] context mismatch: ${ctx.reason}; not a confirmed FP`);
    process.exit(1);
  }

  const routeKey = `${opt.route}::${opt.mode}`;
  const entry = ensureRouteEntry(baseline, routeKey, opt);
  const stats = computeSlidingStats(entry.history, opt.windowDays);
  if (stats.insufficient) {
    console.error('[fp-tracker] insufficient history for variance band check; rerun cannot be classified yet');
    process.exit(1);
  }

  // Rerun must pass variance band on all tracked metrics
  let rerunPassed = true;
  for (const metric of TRACKED_METRICS) {
    const cur = r[metric];
    if (cur === undefined) continue;
    if (outsideVarianceBand(cur, stats, metric)) {
      rerunPassed = false;
      console.error(`[fp-tracker] rerun ${metric}=${cur} still outside variance band; not a confirmed FP`);
      break;
    }
  }

  if (!rerunPassed) {
    process.exit(1);
  }

  const ledgerEntry = {
    timestamp: Date.now(),
    route: opt.route,
    mode: opt.mode,
    authState: o.auth ?? o.authState ?? 'anonymous',
    build_sha: o.build_sha,
    browser_profile: o.browser_profile,
    frontend_image_digest: o.frontend_image_digest ?? null,
    outcome: 'confirmed_fp',
    is_fp: true,
    // confirmed_fp:true kept for backward compat (legacy readers).
    confirmed_fp: true,
    original_metrics: {
      transferKB: o.transferKB,
      tbtMs: o.tbtMs,
      longTaskTotalMs: o.longTaskTotalMs,
    },
    rerun_metrics: {
      transferKB: r.transferKB,
      tbtMs: r.tbtMs,
      longTaskTotalMs: r.longTaskTotalMs,
    },
    rationale: 'rerun PASS in 5-part identical context (ABM-1 §4.2)',
  };

  mkdirSync(dirname(opt.ledger), { recursive: true });
  appendFileSync(opt.ledger, JSON.stringify(ledgerEntry) + '\n');
  console.log(`[fp-tracker] confirmed FP appended → ${opt.ledger}`);
  console.log(JSON.stringify(ledgerEntry, null, 2));
  process.exit(0);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  try {
    main();
  } catch (e) {
    console.error('[fp-tracker] FATAL:', e && e.message ? e.message : e);
    process.exit(2);
  }
}

export { sameContext, pickRoute };
