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
  else if (a === '--routes') opt.routesFilter = args[++i].split(',');
  else if (a === '--require-baseline') opt.requireBaseline = true;
  else if (a === '--help' || a === '-h') {
    console.log(
      `Usage: node scripts/ci/route-performance-budget.mjs [options]\n\n` +
      `  --target local|testai|prod  (default: local)\n` +
      `  --runs N                    (default: 5)\n` +
      `  --routes /a,/b,...          Filter routes to a subset (default: all from performance-budgets.json)\n` +
      `  --update-baseline           write tests/perf/baseline.json\n` +
      `  --warn-only                 never exit 1 (warmup mode)\n` +
      `  --require-baseline          fail if tests/perf/baseline.json has no routes (hard-flip guard)\n` +
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
async function measureOnce(browser, routeBudget) {
  const { route, mode, auth } = routeBudget;

  // Auth field semantic enforcement (Codex critical finding 2):
  //  - `anonymous` mode: never apply storageState
  //  - `authenticated` mode: storageState required from --auth-storage
  //  - `anonymous-to-authenticated` (sso-return): skipped (PR-G1 territory)
  const wantsAuth = auth === 'authenticated';
  const storageState = wantsAuth ? (opt.authStorageState ?? undefined) : undefined;

  if (wantsAuth && !storageState) {
    return {
      error: `route ${route} requires auth (auth=${auth}) but --auth-storage not provided. Use --auth-storage PATH or generate via PR-S1.b test persona fixture.`,
    };
  }

  const context = await browser.newContext({
    storageState,
    viewport: { width: 1440, height: 900 },
  });

  // Inject the production opt-in flag BEFORE any page script runs. The
  // perf-observer module's shouldExposeGlobal() reads this flag and only
  // exposes window.__perfSnapshot() / __perfMark() when it is truthy. In
  // dev/test bundles NODE_ENV !== 'production' is enough; this addInitScript
  // covers production/preview/testai/prod measurements.
  await context.addInitScript(() => {
    /* eslint-disable */
    // Set the perf-observer opt-in flag before any page script runs.
    // perf-observer.ts shouldExposeGlobal() reads this flag and exposes
    // window.__perfSnapshot()/window.__perfMark() when truthy.
    window.__PERF_OBSERVER_ENABLE = 1;
  });

  const page = await context.newPage();

  const url = route.startsWith('http') ? route : `${BASE_URL}${route}`;

  try {
    // soft-navigation and sso-return harness implementations live in PR-G1.
    // Marking them here so the matrix is honest about scope.
    if (mode === 'soft-navigation' || mode === 'sso-return') {
      return { skipped: true, reason: `mode=${mode} not yet implemented (PR-G1 scope)` };
    }

    // warm-fresh mode requires cache priming across two same-context runs —
    // also PR-G1 territory. For now, mark advisory + skip.
    if (mode === 'warm-fresh') {
      return { skipped: true, reason: `mode=warm-fresh not yet implemented (PR-G1 cache priming scope)` };
    }

    // Hard navigate; bringToFront ensures we are not hidden
    const navResponse = await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await page.bringToFront();

    // PERF-INIT-V2 PR-B5c-lite (Codex thread 019e20fa iter-2): redirect
    // guard. /admin/* routes silently redirect to /login when auth-storage
    // is missing or expired; without this check the runner would record a
    // /login measurement against a /admin/users budget — false-green.
    //
    // iter-2 P0 fix (Codex thread 019e2112): SPA-driven redirects fire
    // AFTER React bootstrap + auth FSM resolution, not at navigation time.
    // Path check must run AFTER the settle window, immediately before
    // reading the snapshot, so we catch:
    //   - SPA Navigate() inside ProtectedRoute denying auth
    //   - MFE wildcard Navigate (e.g. /admin/access → /access/roles)
    //   - any client-side redirect within the budget window
    // Budget entries may set `expectedPath` for the canonical post-redirect
    // path (e.g. /admin/access budget with expectedPath=/access/roles).
    const targetUrl = (() => {
      try { return new URL(url); } catch { return null; }
    })();
    const initialPath = targetUrl ? targetUrl.pathname : route;
    const expectedPath = routeBudget.expectedPath ?? initialPath;
    const checkPath = () => {
      const cur = page.url();
      try { return new URL(cur).pathname; } catch { return cur; }
    };
    // First check: any nav-time redirect (server 30x or near-instant SPA)
    let finalPath = checkPath();
    if (finalPath !== expectedPath) {
      return {
        error: `redirect (nav-time): expected ${expectedPath}, landed on ${finalPath} (auth-storage missing/expired?)`,
        redirected: true,
        navStatus: navResponse?.status() ?? null,
        expectedPath,
        finalPath,
      };
    }

    // Wait for perf snapshot harness to attach + LCP to settle
    await page.waitForFunction(() => typeof (window).__perfSnapshot === 'function', null, { timeout: 5000 });

    // PERF-INIT-V2 PR-B5c-lite (Codex thread 019e20fa iter-2): rendered
    // sentinel guard. Each route declares a `sentinel` selector in
    // performance-budgets.json. If the sentinel does not appear within
    // 10s the route render is considered incomplete and the measurement
    // is rejected — protects against /admin/* blank-on-init false-green
    // from the pre-existing auth FSM race documented in §5 risk register.
    // When the budget entry omits `sentinel` we fall back to the legacy
    // 3s settle wait (advisory mode for unmigrated routes).
    if (route?.sentinel || routeBudget.sentinel) {
      const sentinelSelector = routeBudget.sentinel ?? route.sentinel;
      try {
        await page.waitForSelector(sentinelSelector, { timeout: 10000, state: 'visible' });
      } catch (e) {
        return {
          error: `sentinel-not-rendered: selector "${sentinelSelector}" did not appear within 10s on ${checkPath()}`,
          sentinelMissing: true,
          sentinelSelector,
        };
      }
    } else {
      await page.waitForTimeout(3000); // legacy fallback
    }

    // Extra 2s for LCP / longtask observer to settle after sentinel render
    await page.waitForTimeout(2000);

    // iter-2 P0 fix (Codex 019e2112): re-check path AFTER settle window.
    // SPA redirects (ProtectedRoute → /login, wildcard → canonical) fire
    // post-bootstrap; nav-time check alone is insufficient.
    finalPath = checkPath();
    if (finalPath !== expectedPath) {
      return {
        error: `redirect (post-settle): expected ${expectedPath}, ended up on ${finalPath} (SPA navigation / auth FSM redirect)`,
        redirected: true,
        navStatus: navResponse?.status() ?? null,
        expectedPath,
        finalPath,
      };
    }

    const snap = await page.evaluate(() => (window).__perfSnapshot?.());
    const visibility = await page.evaluate(() => document.visibilityState);

    return { snap, visibility, finalPath, expectedPath };
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
    const res = await measureOnce(browser, routeBudget);
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
  // Fail-closed guard for hard-flip phase: refuse to run without a populated
  // baseline.json when `--require-baseline` is set. Prevents the first
  // post-warmup run from passing with zero comparison data.
  if (opt.requireBaseline) {
    const keys = Object.keys(baseline.routes ?? {});
    if (keys.length === 0) {
      console.error('[perf-budget] FATAL: --require-baseline set but tests/perf/baseline.json has no routes');
      console.error('              Hard-flip guard: run `npm run perf:budget:update-baseline` first or stay in --warn-only.');
      process.exit(2);
    }
  }

  // Apply --routes filter if provided (Codex thread 019e1e5d critical 1)
  const targetRoutes = opt.routesFilter
    ? budgets.routes.filter((r) => opt.routesFilter.includes(r.route))
    : budgets.routes;

  if (opt.routesFilter && targetRoutes.length === 0) {
    console.error(`[perf-budget] FATAL: --routes filter matched no entries in performance-budgets.json`);
    console.error(`              Requested: ${opt.routesFilter.join(', ')}`);
    process.exit(2);
  }

  const browser = await chromium.launch({ headless: true });
  const results = [];
  let anyFail = false;

  for (const routeBudget of targetRoutes) {
    const summary = await measureRoute(browser, routeBudget);

    // Critical-finding fix (Codex thread 019e1e1b): measurement errors must
    // surface as failures, not silently swallowed. Skipped routes that are
    // not explicitly marked advisory also count as failures (otherwise an
    // empty matrix would always "pass").
    if (summary.error) {
      console.log(`  -> ERROR: ${summary.error}`);
      results.push({ ...routeBudget, ...summary });
      anyFail = true;
      continue;
    }
    if (summary.skipped) {
      if (routeBudget._acceptance === 'advisory') {
        console.log(`  -> skipped (advisory, no fail)`);
      } else {
        console.log(`  -> skipped (FAIL — runner does not implement mode=${routeBudget.mode} yet)`);
        anyFail = true;
      }
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
