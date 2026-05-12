#!/usr/bin/env node
/**
 * PERF-INIT-V2 PR-M1: Playwright-driven route performance budget runner.
 *
 * Loads `performance-budgets.json`, navigates each route in headless Chrome,
 * captures `window.__perfSnapshot()` (installed by perf-observer.ts), runs
 * N times (default 5), computes median per metric, compares to budget.
 *
 * Outputs:
 *   - tests/perf/baseline.json: latest median snapshot per route (committable)
 *   - tests/perf/last-run.json: most recent run (CI artifact)
 *   - exit 0 if all routes pass; exit 1 on hard fail (warn-only mode never fails)
 *
 * Usage:
 *   node scripts/ci/route-performance-budget.mjs [--target local|testai] [--runs N]
 *                                                [--update-baseline] [--warn-only]
 *
 * Methodology (Codex thread 019e1de0 AGREE):
 *   - median of N runs (default 5) to dampen outliers
 *   - foreground only (page.bringToFront)
 *   - fixed Chrome version (Playwright bundled chromium)
 *   - CPU/network profile recorded in artifact (no throttling for now —
 *     baseline at desktop fast-network; PMD §4.2 PR-M1 acceptance criteria)
 *   - hidden-page entries marked invalid (LCP/paint observer doesn't fire
 *     when page is background-throttled)
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..', '..');

const args = process.argv.slice(2);
const opt = {
  target: 'local',
  runs: 5,
  updateBaseline: false,
  warnOnly: false,
  authStorageState: null,
};

for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === '--target') opt.target = args[++i];
  else if (a === '--runs') opt.runs = parseInt(args[++i], 10);
  else if (a === '--update-baseline') opt.updateBaseline = true;
  else if (a === '--warn-only') opt.warnOnly = true;
  else if (a === '--auth-storage') opt.authStorageState = args[++i];
  else if (a === '--help' || a === '-h') {
    console.log(
      `Usage: node scripts/ci/route-performance-budget.mjs [options]\n\n` +
      `  --target local|testai|prod  (default: local)\n` +
      `  --runs N                    (default: 5)\n` +
      `  --update-baseline           write tests/perf/baseline.json\n` +
      `  --warn-only                 never exit 1 (warmup mode)\n` +
      `  --auth-storage PATH         Playwright storageState JSON for auth fixture`,
    );
    process.exit(0);
  }
}

const TARGETS = {
  local: 'http://localhost:5174',
  testai: 'https://testai.acik.com',
  prod: 'https://ai.acik.com',
};
const BASE_URL = TARGETS[opt.target];
if (!BASE_URL) {
  console.error(`Unknown target: ${opt.target}`);
  process.exit(2);
}

const budgets = JSON.parse(readFileSync(join(ROOT, 'performance-budgets.json'), 'utf8'));
const baselinePath = join(ROOT, 'tests', 'perf', 'baseline.json');
const lastRunPath = join(ROOT, 'tests', 'perf', 'last-run.json');
mkdirSync(dirname(baselinePath), { recursive: true });

const baseline = existsSync(baselinePath)
  ? JSON.parse(readFileSync(baselinePath, 'utf8'))
  : { routes: {} };

/** Median value from an array of numbers (or undefined). */
function median(values) {
  const arr = values.filter((v) => typeof v === 'number' && !Number.isNaN(v)).sort((a, b) => a - b);
  if (arr.length === 0) return undefined;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 === 0 ? (arr[mid - 1] + arr[mid]) / 2 : arr[mid];
}

/** Take a single measurement of one route. */
async function measureOnce(browser, route, mode) {
  const context = await browser.newContext({
    storageState: opt.authStorageState ?? undefined,
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  const url = route.startsWith('http') ? route : `${BASE_URL}${route}`;

  try {
    // Skip soft-nav/sso-return for now (separate harness needed)
    if (mode === 'soft-navigation' || mode === 'sso-return') {
      return { skipped: true, reason: `mode=${mode} not yet implemented` };
    }

    // Hard navigate; bringToFront ensures we are not hidden
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await page.bringToFront();

    // Wait for perf snapshot harness to attach + LCP to settle
    await page.waitForFunction(() => typeof (window).__perfSnapshot === 'function', null, { timeout: 5000 });
    await page.waitForTimeout(3000); // settle LCP + long tasks

    const snap = await page.evaluate(() => (window).__perfSnapshot?.());
    const visibility = await page.evaluate(() => document.visibilityState);

    return { snap, visibility };
  } catch (e) {
    return { error: String(e && e.message ? e.message : e) };
  } finally {
    await context.close();
  }
}

/** Run N times and compute median per metric. */
async function measureRoute(browser, routeBudget) {
  const route = routeBudget.route;
  const mode = routeBudget.mode;
  console.log(`[perf-budget] ${route} mode=${mode} runs=${opt.runs}`);

  const snaps = [];
  let invalidCount = 0;

  for (let i = 0; i < opt.runs; i += 1) {
    const res = await measureOnce(browser, route, mode);
    if (res.skipped) {
      console.log(`  -> skipped: ${res.reason}`);
      return { skipped: true };
    }
    if (res.error) {
      console.log(`  run ${i + 1}: ERROR ${res.error}`);
      invalidCount += 1;
      continue;
    }
    if (res.visibility !== 'visible') {
      console.log(`  run ${i + 1}: invalid (visibility=${res.visibility})`);
      invalidCount += 1;
      continue;
    }
    snaps.push(res.snap);
  }

  if (snaps.length === 0) {
    return { error: `no valid runs (invalid=${invalidCount})` };
  }

  const summary = {
    route,
    mode,
    runs: snaps.length,
    invalidRuns: invalidCount,
    transferKB: median(snaps.map((s) => s.resources?.totalTransferKB)),
    decodedKB: median(snaps.map((s) => s.resources?.totalDecodedKB)),
    jsDecodedKB: median(snaps.map((s) => s.resources?.jsDecodedKB)),
    cssDecodedKB: median(snaps.map((s) => s.resources?.cssDecodedKB)),
    resourceCount: median(snaps.map((s) => s.resources?.resourceCount)),
    cacheHitCount: median(snaps.map((s) => s.resources?.cacheHitCount)),
    heapUsedMB: median(snaps.map((s) => s.resources?.heapUsedMB)),
    protocolHistogram: snaps[0]?.resources?.protocolHistogram ?? {},
    tbtMs: median(snaps.map((s) => s.tbtMs)),
    longTaskCount: median(snaps.map((s) => s.longTaskCount)),
    longTaskTotalMs: median(snaps.map((s) => s.longTaskTotalMs)),
    longTaskMaxMs: median(snaps.map((s) => Math.max(0, ...(s.longTasks ?? []).map((t) => t.duration)))),
    lcpMs: median(snaps.map((s) => s.vitals?.LCP?.value)),
    fcpMs: median(snaps.map((s) => s.vitals?.FCP?.value)),
    inpMs: median(snaps.map((s) => s.vitals?.INP?.value)),
    cls: median(snaps.map((s) => s.vitals?.CLS?.value)),
    ttfbMs: median(snaps.map((s) => s.vitals?.TTFB?.value)),
    timestamp: Date.now(),
  };

  return summary;
}

/** Evaluate measurements against a budget. Returns { pass, warnings, failures }. */
function evaluate(summary, budget) {
  const warnings = [];
  const failures = [];

  function check(metric, value, warnKey, failKey, op = 'lte') {
    const warn = budget[warnKey];
    const fail = budget[failKey];
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

  // Regression check vs baseline (only if baseline exists for this route+mode)
  const baseKey = `${budget.route}::${budget.mode}`;
  const base = baseline.routes[baseKey];
  if (base && budgets._regressionPolicy?.hardFailRegressionPercent) {
    const pct = budgets._regressionPolicy.hardFailRegressionPercent;
    function regression(metric, current, baseValue) {
      if (current === undefined || baseValue === undefined) return;
      if (current > baseValue * (1 + pct / 100)) {
        failures.push(`${metric} regression: ${current} vs baseline ${baseValue} (>${pct}%)`);
      }
    }
    regression('transferKB', summary.transferKB, base.transferKB);
    regression('decodedKB', summary.decodedKB, base.decodedKB);
    regression('tbtMs', summary.tbtMs, base.tbtMs);
    regression('longTaskTotalMs', summary.longTaskTotalMs, base.longTaskTotalMs);
  }

  return { pass: failures.length === 0, warnings, failures };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  let anyFail = false;

  for (const routeBudget of budgets.routes) {
    const summary = await measureRoute(browser, routeBudget);
    if (summary.error) {
      console.log(`  -> ERROR: ${summary.error}`);
      results.push({ ...routeBudget, ...summary });
      continue;
    }
    if (summary.skipped) {
      results.push({ ...routeBudget, skipped: true });
      continue;
    }

    const evalResult = evaluate(summary, routeBudget);
    console.log(`  -> ${evalResult.pass ? 'PASS' : 'FAIL'}`);
    for (const w of evalResult.warnings) console.log(`     WARN  ${w}`);
    for (const f of evalResult.failures) console.log(`     FAIL  ${f}`);

    if (!evalResult.pass) anyFail = true;
    results.push({ ...routeBudget, ...summary, ...evalResult });
  }

  await browser.close();

  // Write artifacts
  const artifact = {
    target: opt.target,
    timestamp: Date.now(),
    runs: opt.runs,
    methodology: budgets._methodology,
    routes: results,
  };
  writeFileSync(lastRunPath, JSON.stringify(artifact, null, 2));
  console.log(`\n[perf-budget] last-run artifact: ${lastRunPath}`);

  if (opt.updateBaseline) {
    const newBaseline = { ...baseline, timestamp: Date.now(), routes: {} };
    for (const r of results) {
      if (r.skipped || r.error) continue;
      newBaseline.routes[`${r.route}::${r.mode}`] = {
        transferKB: r.transferKB,
        decodedKB: r.decodedKB,
        resourceCount: r.resourceCount,
        tbtMs: r.tbtMs,
        longTaskTotalMs: r.longTaskTotalMs,
        lcpMs: r.lcpMs,
        fcpMs: r.fcpMs,
        inpMs: r.inpMs,
      };
    }
    writeFileSync(baselinePath, JSON.stringify(newBaseline, null, 2));
    console.log(`[perf-budget] baseline updated: ${baselinePath}`);
  }

  if (anyFail) {
    if (opt.warnOnly) {
      console.log('\n[perf-budget] FAILURES present but --warn-only set; exit 0');
      process.exit(0);
    }
    console.log('\n[perf-budget] FAILURES present; exit 1');
    process.exit(1);
  }
  console.log('\n[perf-budget] ALL PASS');
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
