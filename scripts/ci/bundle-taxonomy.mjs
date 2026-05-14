#!/usr/bin/env node
/**
 * PERF-INIT-V2 PR-A0: Bundle taxonomy runner.
 *
 * Browses each route in Playwright, captures the full resource list via
 * `performance.getEntriesByType('resource')` plus the perf-observer
 * snapshot (PR-M1), and emits a JSON taxonomy:
 *
 *   {
 *     route: '/home',
 *     mode: 'cold-authenticated',
 *     timestamp: ...,
 *     resources: [
 *       { name, initiatorType, encodedBodySize, decodedBodySize,
 *         transferSize, duration, nextHopProtocol, isCacheHit,
 *         hashedName, category }
 *     ],
 *     totals: { transferKB, decodedKB, jsDecodedKB, cssDecodedKB,
 *               cacheHitCount, resourceCount },
 *     dominantChunks: [...top 10 by decoded size],
 *     protocolHistogram: {...},
 *   }
 *
 * Plus a Playwright trace (NOT Chrome DevTools format) is captured for
 * action/network/console inspection. Inspect via
 *   npx playwright show-trace tests/perf/bundle-stats/<route-slug>/trace.zip
 * Real Chrome DevTools trace (devtools.timeline + v8.execute) requires
 * CDP `Tracing.start`/`Tracing.end` — scoped to follow-up PR-A0.b.
 *
 * Long task attribution uses the perf-observer `longtask` observer
 * (taxonomy.json `perfSnapshot.longTasks`) rather than the Playwright
 * trace alone.
 *
 * Usage:
 *   node scripts/ci/bundle-taxonomy.mjs [--target testai|local]
 *                                       [--routes /login,/home,...]
 *                                       [--auth-storage PATH]
 *
 * Output:
 *   tests/perf/bundle-stats/<route-slug>/{taxonomy.json, trace.zip}
 *   tests/perf/bundle-stats/all-routes.json (aggregate)
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..', '..');

const args = process.argv.slice(2);
const opt = {
  target: 'local',
  routes: null,
  authStorage: null,
  runs: 1,
};

for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === '--target') opt.target = args[++i];
  else if (a === '--routes') opt.routes = args[++i].split(',');
  else if (a === '--auth-storage') opt.authStorage = args[++i];
  else if (a === '--runs') opt.runs = parseInt(args[++i], 10);
  else if (a === '--help' || a === '-h') {
    console.log(
      `Usage: node scripts/ci/bundle-taxonomy.mjs [options]\n\n` +
      `  --target local|testai   (default: local)\n` +
      `  --routes /a,/b,...      (default: from performance-budgets.json hard routes)\n` +
      `  --auth-storage PATH     Playwright storageState JSON\n` +
      `  --runs N                (default: 1 — taxonomy is structural; median not needed)`,
    );
    process.exit(0);
  }
}

const TARGETS = {
  local: 'http://localhost:5174',
  testai: 'https://testai.acik.com',
  prod: 'https://ai.acik.com',
};
const BASE_URL = TARGETS[opt.target] ?? TARGETS.local;

// Default routes: all hard-acceptance routes from performance-budgets.json
let routes = opt.routes;
if (!routes) {
  const budgets = JSON.parse(
    await import('node:fs').then((m) => m.promises.readFile(join(ROOT, 'performance-budgets.json'), 'utf8')),
  );
  routes = budgets.routes
    .filter((r) => r._acceptance !== 'advisory' && r.mode === 'cold-anonymous' || r.mode === 'cold-authenticated')
    .map((r) => r.route);
}

const OUT_ROOT = join(ROOT, 'tests', 'perf', 'bundle-stats');
mkdirSync(OUT_ROOT, { recursive: true });

function routeSlug(route) {
  return route.replace(/^\//, '').replace(/\//g, '_') || 'root';
}

/** Categorise a resource URL into a coarse bucket for the taxonomy. */
function categorise(url, initiatorType) {
  // Module Federation chunk patterns (token-boundary protected to avoid
  // false matches; e.g. `loadShare__react` should NOT match `react-dom`)
  if (/loadShare(__|_mf_\d+_)design[_-]system(__|$|[._-])/i.test(url)) {
    return 'mf-shared:design-system';
  }
  if (/loadShare(__|_mf_\d+_)react([_-]dom)?(__|$|[._-])/i.test(url)) {
    return /react[_-]dom/i.test(url) ? 'mf-shared:react-dom' : 'mf-shared:react';
  }
  if (/loadShare__/i.test(url)) {
    // Extract canonical package token, normalise `_mf_0_design_mf_1_system`
    // to `design-system`.
    const m = url.match(/loadShare__(?:_mf_\d+_)?([^/]+?)(?:__|\.|$)/i);
    let token = m ? m[1] : 'unknown';
    token = token.replace(/_mf_\d+_/g, '-').replace(/_/g, '-');
    return `mf-shared:${token}`;
  }
  if (/remoteEntry\.js/.test(url)) return 'mf-remote-entry';
  if (/virtual_mf|virtualExposes|_virtual_mf/i.test(url)) return 'mf-virtual';
  if (/rolldown/i.test(url)) return 'mf-rolldown';

  // App-level chunks
  if (/\/assets\/index-[A-Za-z0-9_-]+\.(js|mjs)$/i.test(url)) return 'app-entry';
  if (/\.css(\?|$)/i.test(url)) return 'css';
  if (/\.(woff2?|ttf|otf|eot)(\?|$)/i.test(url)) return 'font';
  if (/\.(svg|png|jpg|jpeg|gif|webp|avif|ico)(\?|$)/i.test(url)) return 'image';
  if (/\/api\//i.test(url)) return 'api';

  // Initiator type fallback
  if (initiatorType === 'script') return 'app-chunk';
  if (initiatorType === 'link') return 'preload';

  return 'other';
}

function hashedName(url) {
  // Extract the file path tail; collapse 8+ char hash to {hash}
  const tail = url.split('?')[0].split('/').pop() || url;
  return tail.replace(/-[A-Za-z0-9_-]{8,}(?=\.)/g, '-{hash}');
}

/**
 * PERF-INIT-V2 PR-B3d0-impl: CSS attribution extractor (runtime / A channel).
 *
 * Confidence-based bucket assignment per spike doc §4.2 (Codex thread
 * `019e26ee` blocking-1 absorb):
 *
 *   - `remote:<name>`     — `/remotes/<name>/assets/...`        (confidence: medium)
 *   - `shell-root`        — `/assets/index-<hash>.css`          (confidence: low — URL only)
 *   - `<package>?`        — heuristic substring match           (confidence: low — URL only)
 *   - `unknown`           — no rule matched                     (confidence: low)
 *
 * **Package attribution is NOT decisively answered here**; that is the
 * source-map-explorer (B channel) job. Heuristic `<package>?` buckets
 * carry the `?` suffix as a visual hint that they are URL-pattern
 * guesses, not sourcemap-verified facts. Downstream consumers gate any
 * decision (e.g. B3d1 lazy-import) on the `unknown` ratio: if it exceeds
 * 20%, runtime channel is insufficient and B channel sourcemap baseline
 * is required (see `cssAttributionSummary.requiresSourcemapBaseline`).
 *
 * @param {object} resource - resource entry with `name`, `decodedBodySize`
 * @returns {object} CssAttribution record
 */
function extractCssAttribution(resource) {
  const decodedKB = (resource.decodedBodySize || 0) / 1024;
  let pathname = '';
  try {
    pathname = new URL(resource.name).pathname;
  } catch {
    pathname = resource.name;
  }

  const base = {
    decodedKB: Math.round(decodedKB * 100) / 100,
    confidence: 'low',
    evidence: ['url'],
    assetUrl: pathname,
  };

  // Remote bucket — confident URL evidence (path namespace)
  const remoteMatch = pathname.match(/^\/remotes\/([^/]+)\/assets\//);
  if (remoteMatch) {
    return {
      ...base,
      source: `remote:${remoteMatch[1]}`,
      confidence: 'medium',
      evidence: ['url', 'remote'],
    };
  }

  // Shell-root bucket — index-<hash>.css under /assets
  if (/^\/assets\/index-[A-Za-z0-9_-]+\.css$/.test(pathname)) {
    return { ...base, source: 'shell-root' };
  }

  // Heuristic package match (low confidence, `?` suffix as warning)
  if (/ag[-_]?grid/i.test(pathname)) {
    return { ...base, source: 'ag-grid?' };
  }
  if (/echarts|chartjs|\bchart\b/i.test(pathname)) {
    return { ...base, source: 'echarts?' };
  }
  if (/design[-_]system|mfe[-_]ds/i.test(pathname)) {
    return { ...base, source: 'design-system?' };
  }

  return { ...base, source: 'unknown' };
}

/**
 * Aggregate CSS attribution rows into a summary suitable for decision
 * gating (B3d1 / B3d2 trigger criteria per spike doc §4.4).
 *
 * Output keys are intentionally additive (Codex thread `019e276d`
 * blocking-3 absorb): the top-level `totals.cssDecodedKB` aggregate is
 * NOT mutated; new fields live under `taxonomy.cssAttributionSummary`
 * to keep `totals.*` numeric-only and avoid downstream consumer breakage.
 */
function summarizeCssAttribution(breakdown) {
  const totalKB = breakdown.reduce((acc, r) => acc + r.decodedKB, 0);
  const bySource = breakdown.reduce((acc, r) => {
    acc[r.source] = (acc[r.source] || 0) + r.decodedKB;
    return acc;
  }, {});
  const topContributors = Object.entries(bySource)
    .map(([source, decodedKB]) => ({
      source,
      decodedKB: Math.round(decodedKB * 100) / 100,
      ratio: totalKB > 0 ? Math.round((decodedKB / totalKB) * 1000) / 1000 : 0,
    }))
    .sort((a, b) => b.decodedKB - a.decodedKB)
    .slice(0, 10);

  const unknownKB = bySource['unknown'] || 0;
  const unknownRatio = totalKB > 0 ? unknownKB / totalKB : 0;
  // Decision-gate hint per spike doc §4.4: when runtime heuristic
  // coverage drops below 80% (unknown >= 20%), B channel sourcemap
  // baseline is required because URL-pattern matching is no longer a
  // representative signal.
  const requiresSourcemapBaseline = unknownRatio >= 0.2;

  return {
    totalKB: Math.round(totalKB * 100) / 100,
    rowCount: breakdown.length,
    topContributors,
    unknownRatio: Math.round(unknownRatio * 1000) / 1000,
    requiresSourcemapBaseline,
    // Confidence rollup — what fraction of decoded CSS bytes is backed
    // by which evidence tier.
    confidenceMix: breakdown.reduce(
      (acc, r) => {
        acc[r.confidence] = (acc[r.confidence] || 0) + r.decodedKB;
        return acc;
      },
      { high: 0, medium: 0, low: 0 },
    ),
  };
}

async function captureRoute(browser, routeBudget) {
  const { route, auth } = routeBudget;
  console.log(`[taxonomy] ${route}`);
  const slug = routeSlug(route);
  const outDir = join(OUT_ROOT, slug);
  mkdirSync(outDir, { recursive: true });

  // Auth fail-fast (Codex thread 019e1e34 finding 5): authenticated routes
  // without --auth-storage produce silently-wrong taxonomy (login redirect
  // or unauthorized shell shape). Require storage explicitly.
  const wantsAuth = auth === 'authenticated';
  if (wantsAuth && !opt.authStorage) {
    console.error(`  ERROR ${route}: auth=authenticated but --auth-storage not provided`);
    return {
      route,
      slug,
      error: 'auth=authenticated requires --auth-storage (PR-S1.b/B4 test persona fixture)',
    };
  }

  const context = await browser.newContext({
    storageState: wantsAuth ? opt.authStorage : undefined,
    viewport: { width: 1440, height: 900 },
  });
  await context.addInitScript(() => {
    window.__PERF_OBSERVER_ENABLE = 1;
  });
  const page = await context.newPage();

  const url = route.startsWith('http') ? route : `${BASE_URL}${route}`;
  // Playwright trace (NOT Chrome DevTools format). Inspect via
  // `npx playwright show-trace tests/perf/bundle-stats/<slug>/trace.zip`.
  // For Chrome DevTools-format long-task attribution, see follow-up PR
  // PR-A0.b (CDP Tracing.start/end -> chrome://tracing format).
  const traceFile = join(outDir, 'trace.zip');

  try {
    // Playwright trace BEFORE navigation so the full load is recorded.
    // This is the Playwright trace API, NOT Chrome DevTools format —
    // inspect via `npx playwright show-trace path.zip`. Real
    // devtools.timeline / v8.execute requires CDP, PR-A0.b scope.
    await context.tracing.start({
      screenshots: false,
      snapshots: false,
      sources: false,
    });

    await page.goto(url, { waitUntil: 'load', timeout: 45000 });
    await page.bringToFront();
    await page.waitForTimeout(4000); // settle late chunks

    // Capture per-route taxonomy via in-page JS
    const data = await page.evaluate(() => {
      const resources = performance.getEntriesByType('resource').map((r) => ({
        name: r.name,
        initiatorType: r.initiatorType,
        encodedBodySize: r.encodedBodySize || 0,
        decodedBodySize: r.decodedBodySize || 0,
        transferSize: r.transferSize || 0,
        duration: Math.round(r.duration),
        nextHopProtocol: r.nextHopProtocol || 'unknown',
        startTime: Math.round(r.startTime),
        responseEnd: Math.round(r.responseEnd),
      }));
      const nav = performance.getEntriesByType('navigation')[0];
      const snap = (window).__perfSnapshot?.() ?? null;
      return { resources, navigation: nav ? { ttfb: nav.responseStart - nav.requestStart, dcl: nav.domContentLoadedEventEnd - nav.startTime, load: nav.loadEventEnd - nav.startTime } : null, snap };
    });

    await context.tracing.stop({ path: traceFile });

    // Annotate resources with category + hashed name
    for (const r of data.resources) {
      r.isCacheHit = r.transferSize === 0 && r.encodedBodySize > 0;
      r.category = categorise(r.name, r.initiatorType);
      r.hashedName = hashedName(r.name);
    }

    // Aggregates
    const totals = data.resources.reduce(
      (acc, r) => {
        acc.transferKB += (r.transferSize || 0) / 1024;
        acc.decodedKB += (r.decodedBodySize || 0) / 1024;
        if (r.category.startsWith('mf-') || r.category === 'app-entry' || r.category === 'app-chunk') {
          acc.jsDecodedKB += (r.decodedBodySize || 0) / 1024;
        }
        if (r.category === 'css') acc.cssDecodedKB += (r.decodedBodySize || 0) / 1024;
        if (r.isCacheHit) acc.cacheHitCount += 1;
        return acc;
      },
      { transferKB: 0, decodedKB: 0, jsDecodedKB: 0, cssDecodedKB: 0, cacheHitCount: 0 },
    );
    for (const k of Object.keys(totals)) {
      if (typeof totals[k] === 'number' && !Number.isInteger(totals[k])) {
        totals[k] = Math.round(totals[k]);
      }
    }
    totals.resourceCount = data.resources.length;

    // Top 10 dominant chunks by decoded size
    const dominantChunks = [...data.resources]
      .sort((a, b) => b.decodedBodySize - a.decodedBodySize)
      .slice(0, 10)
      .map((r) => ({
        name: r.hashedName,
        url: r.name,
        category: r.category,
        decodedKB: Math.round(r.decodedBodySize / 1024),
        transferKB: Math.round(r.transferSize / 1024),
        durationMs: r.duration,
      }));

    const protocolHistogram = data.resources.reduce((acc, r) => {
      acc[r.nextHopProtocol] = (acc[r.nextHopProtocol] || 0) + 1;
      return acc;
    }, {});

    // PERF-INIT-V2 PR-B3d0-impl: CSS attribution breakdown (additive
    // schema — does NOT mutate `totals.cssDecodedKB`; lives as siblings
    // `cssBreakdown` + `cssAttributionSummary`). Codex thread `019e276d`
    // blocking-3 absorb.
    const cssBreakdown = data.resources
      .filter((r) => r.category === 'css')
      .map((r) => extractCssAttribution(r))
      .sort((a, b) => b.decodedKB - a.decodedKB);
    const cssAttributionSummary = summarizeCssAttribution(cssBreakdown);

    // Decision-gate hint stdout: log when unknown ratio crosses the
    // sourcemap-baseline threshold so CI logs surface the signal.
    if (cssAttributionSummary.requiresSourcemapBaseline) {
      console.warn(
        `  WARN ${route}: CSS unknown ratio ${(cssAttributionSummary.unknownRatio * 100).toFixed(1)}% >= 20% — runtime heuristic insufficient; run \`pnpm perf:css-breakdown\` (source-map-explorer) for authoritative attribution.`,
      );
    }

    const taxonomy = {
      route,
      slug,
      target: opt.target,
      timestamp: Date.now(),
      navigation: data.navigation,
      perfSnapshot: data.snap,
      totals,
      dominantChunks,
      protocolHistogram,
      cssBreakdown,
      cssAttributionSummary,
      resources: data.resources,
    };

    // __perfSnapshot null check (Codex finding 4 advisory): explicit warn
    // so silent zero-data is not mistaken for success.
    if (!taxonomy.perfSnapshot) {
      console.warn(`  WARN ${route}: __perfSnapshot returned null (PR-M1 harness not active or window flag missing)`);
    }

    writeFileSync(join(outDir, 'taxonomy.json'), JSON.stringify(taxonomy, null, 2));
    console.log(`  -> ${outDir}/taxonomy.json (${totals.resourceCount} resources, ${totals.decodedKB} KB decoded)`);
    console.log(`  -> ${traceFile} (Playwright trace; inspect via 'npx playwright show-trace ${traceFile}')`);

    return taxonomy;
  } catch (e) {
    console.error(`  ERROR ${route}: ${e.message}`);
    try {
      await context.tracing.stop({ path: traceFile });
    } catch {
      /* trace stop may fail if start failed */
    }
    return { route, slug, error: String(e.message || e) };
  } finally {
    await context.close();
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  // Load budget records so each captured route inherits its auth/_acceptance
  // metadata. Budget file is the single source of truth for what a route is.
  const budgets = JSON.parse(
    await import('node:fs').then((m) => m.promises.readFile(join(ROOT, 'performance-budgets.json'), 'utf8')),
  );
  const budgetByRoute = new Map();
  for (const b of budgets.routes) {
    if (!budgetByRoute.has(b.route)) budgetByRoute.set(b.route, b);
  }

  let anyFail = false;
  for (const route of routes) {
    const routeBudget = budgetByRoute.get(route) ?? { route, mode: 'cold-anonymous', auth: 'anonymous' };
    const t = await captureRoute(browser, routeBudget);
    results.push(t);
    if (t.error) anyFail = true;
  }

  await browser.close();

  const aggregate = {
    target: opt.target,
    timestamp: Date.now(),
    routes: results.map((r) => ({
      route: r.route,
      slug: r.slug,
      error: r.error,
      totals: r.totals,
      dominantChunks: r.dominantChunks,
      protocolHistogram: r.protocolHistogram,
      // PR-B3d0-impl: aggregate-level CSS attribution summary so consumers
      // can scan the cross-route signal without per-route taxonomy.json IO.
      cssAttributionSummary: r.cssAttributionSummary,
    })),
  };
  writeFileSync(join(OUT_ROOT, 'all-routes.json'), JSON.stringify(aggregate, null, 2));
  console.log(`\n[taxonomy] aggregate: ${OUT_ROOT}/all-routes.json`);
  if (anyFail) {
    console.error(`\n[taxonomy] FAILURES present (see route.error fields); exit 1`);
    process.exit(1);
  }
}

// PR-B3d0-impl: gate top-level Playwright execution so unit tests can
// import the CSS attribution helpers without triggering browser launch.
// Mirrors the pattern used by other scripts/ci/*.mjs that export pure
// helpers (e.g. benchmark-1m-enforcer.mjs).
const __isDirectInvoke =
  process.argv[1] && process.argv[1].endsWith('bundle-taxonomy.mjs');
if (__isDirectInvoke) {
  main().catch((e) => {
    console.error(e);
    process.exit(2);
  });
}

export { extractCssAttribution, summarizeCssAttribution };
