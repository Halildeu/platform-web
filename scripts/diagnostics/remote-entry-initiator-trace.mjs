#!/usr/bin/env node
/**
 * PERF-INIT-V2 PR-B5b0 — RemoteEntry initiator-attribution diagnostic.
 *
 * Wave B5b (MFE on-demand bootstrap) becomes the primary
 * decoded-reduction path after PR-B5d0 (#443) closed Wave B5d-a.
 * Before B5b1 (single-MFE canary) can choose WHICH remote to defer,
 * we need to know WHO triggers each remoteEntry.js / loadShare
 * fetch on `/home` cold load.
 *
 * Three hypothesised initiators (Codex iter-5 thread 019e20fa):
 *   (a) shell-services-wiring.ts   — explicit `import('mfe_X/...')`
 *   (b) Module Federation runtime  — manifest/remote preload
 *   (c) <link rel="modulepreload"> — HTML-level preload helper
 *
 * The diagnostic uses Chrome DevTools Protocol (CDP) via Playwright's
 * `page.context().newCDPSession()` to capture `Network.requestWillBeSent`
 * with the full initiator stack (URL + line + function name), then
 * filters to `remoteEntry.js` and `loadShare` chunk URLs.
 *
 * Output:
 *   tests/perf/initiator-trace/<BUILD_SHA>.json
 *     {
 *       buildSha, route, target, timestamp,
 *       remoteEntries: [
 *         { url, remoteName, initiatorType, stack }
 *       ],
 *       loadShareChunks: [
 *         { url, dep, initiatorType, stack }
 *       ],
 *       summary: {
 *         byInitiatorType: { script: N, link: M, parser: P },
 *         byInitiatorSource: { 'shell-services-wiring': N, 'mf-runtime': M, 'preload-helper': P }
 *       }
 *     }
 *
 * USAGE:
 *   node scripts/diagnostics/remote-entry-initiator-trace.mjs           # local dev (port 3000)
 *   node scripts/diagnostics/remote-entry-initiator-trace.mjs --target testai
 *
 * REQUIRES:
 *   - Playwright installed (already a devDep)
 *   - For --target testai: auth-storage fixture (M2a) — pre-M2a we
 *     run against /login or rely on the SSO-redirect path which
 *     still emits remoteEntry fetches before auth completes
 *
 * ACCEPTANCE (per PMD v4 §3 PR-B5b0):
 *   - Artifact tests/perf/initiator-trace/<BUILD_SHA>.json committed
 *   - PMD §3 row updated with summary finding (canary recommendation
 *     for B5b1)
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..', '..');

const args = process.argv.slice(2);
const opt = {
  target: 'local',
  route: '/home',
  authStorageState: null,
  outDir: join(ROOT, 'tests/perf/initiator-trace'),
};

for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === '--target') opt.target = args[++i];
  else if (a === '--route') opt.route = args[++i];
  else if (a === '--auth-storage') opt.authStorageState = args[++i];
  else if (a === '--out-dir') opt.outDir = args[++i];
}

const TARGETS = {
  local: 'http://localhost:3000',
  testai: 'https://testai.acik.com',
  prod: 'https://ai.acik.com',
};

const baseUrl = TARGETS[opt.target] || opt.target;
const url = opt.route.startsWith('http') ? opt.route : `${baseUrl}${opt.route}`;

/* ------------------------------------------------------------------ */
/*  Classification helpers                                              */
/* ------------------------------------------------------------------ */

function classifyRemoteEntry(reqUrl) {
  // /remotes/<name>/remoteEntry.js
  const m = reqUrl.match(/\/remotes\/([^/]+)\/remoteEntry\.js/);
  if (m) return { type: 'remoteEntry', remoteName: m[1] };
  // /assets/__mfe_internal__mfe_<name>__loadShare__... (per-MFE loadShare)
  const loadShare = reqUrl.match(/__mfe_internal__mfe_([^_]+)__loadShare/);
  if (loadShare) return { type: 'loadShare', remoteName: loadShare[1] };
  // /mf-entry-bootstrap-*.js — NOT a loadShare chunk; the MF runtime
  // bootstrap entry that the document loads via parser.  Codex iter-1
  // P1 (thread 019e2272): keep this separate from loadShareChunks so
  // the artifact summary counts are honest.
  if (reqUrl.match(/\/mf-entry-bootstrap[-_]\d+\.js/)) {
    return { type: 'mfBootstrap' };
  }
  return null;
}

function classifyInitiatorSource(initiator, stack) {
  // initiator.type: parser | script | preload | preflight
  // stack frames may reveal the originating script.  In production
  // builds names are mangled so URL pattern matching is what we have.
  const frames = stack?.callFrames ?? [];
  for (const f of frames) {
    const u = f.url || '';
    if (u.includes('shell-services-wiring')) return 'shell-services-wiring';
    if (u.includes('preload-helper') || u.includes('mf-preload')) return 'preload-helper';
    if (u.includes('hostInit') || u.includes('mf-entry-bootstrap')) return 'mf-runtime-host-init';
    if (u.includes('createLazyRemoteModule')) return 'lazy-route-loader';
    // `dist-<hash>.js` is the shell's main app bundle which contains the
    // federation config + the MF runtime that registers all declared
    // remotes at startup.  This is the canonical initiator for
    // eager remoteEntry.js fetches under @module-federation/vite.
    if (u.match(/\/assets\/dist-[A-Za-z0-9_-]+\.js$/)) return 'mf-runtime-shell-bundle';
    // Generic MF internal chunks
    if (u.includes('__mfe_internal__')) return 'mf-internal-chunk';
  }
  if (initiator?.type === 'preload') return 'preload-link';
  if (initiator?.type === 'parser') return 'document-parser';
  return `unknown(${initiator?.type ?? 'no-initiator'})`;
}

/* ------------------------------------------------------------------ */
/*  Main capture flow                                                   */
/* ------------------------------------------------------------------ */

async function captureInitiatorTrace() {
  console.log(`[initiator-trace] target=${opt.target} url=${url}`);

  const browser = await chromium.launch({ headless: true });
  const contextOpts = { viewport: { width: 1440, height: 900 } };
  if (opt.authStorageState && existsSync(opt.authStorageState)) {
    contextOpts.storageState = opt.authStorageState;
    console.log(`[initiator-trace] using auth-storage: ${opt.authStorageState}`);
  }
  const context = await browser.newContext(contextOpts);

  // Inject the perf-observer flag in case we want to read post-nav metrics too
  await context.addInitScript(() => {
    /* eslint-disable */
    window.__PERF_OBSERVER_ENABLE = 1;
  });

  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');

  const remoteEntries = [];
  const loadShareChunks = [];
  const mfBootstrapChunks = [];
  let buildSha = null;

  cdp.on('Network.requestWillBeSent', (event) => {
    const reqUrl = event.request.url;
    const classification = classifyRemoteEntry(reqUrl);
    if (!classification) return;

    const initiator = event.initiator;
    const stack = initiator?.stack ?? null;
    const source = classifyInitiatorSource(initiator, stack);

    const record = {
      url: reqUrl,
      remoteName: classification.remoteName ?? null,
      initiatorType: initiator?.type ?? null,
      initiatorSource: source,
      initiatorScript: initiator?.url ?? null,
      stack: stack
        ? (stack.callFrames ?? []).slice(0, 5).map((f) => ({
            functionName: f.functionName || '<anonymous>',
            url: f.url,
            lineNumber: f.lineNumber,
            columnNumber: f.columnNumber,
          }))
        : null,
    };

    if (classification.type === 'remoteEntry') {
      remoteEntries.push(record);
    } else if (classification.type === 'mfBootstrap') {
      mfBootstrapChunks.push(record);
    } else {
      loadShareChunks.push({ ...record, dep: classification.remoteName });
    }
  });

  // Read BUILD_SHA from index.html before navigation completes
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  buildSha = await page.evaluate(() => window.__BUILD_SHA__ || null);

  // Wait for any lazy remote loadShare chunks to fire post-init
  await page.waitForTimeout(5000);

  await browser.close();

  /* ---- Summarise ---- */

  const byInitiatorType = {};
  const byInitiatorSource = {};
  for (const r of remoteEntries) {
    byInitiatorType[r.initiatorType] = (byInitiatorType[r.initiatorType] || 0) + 1;
    byInitiatorSource[r.initiatorSource] = (byInitiatorSource[r.initiatorSource] || 0) + 1;
  }

  const result = {
    tool: 'remote-entry-initiator-trace',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    target: opt.target,
    url,
    buildSha,
    summary: {
      remoteEntryCount: remoteEntries.length,
      loadShareCount: loadShareChunks.length,
      mfBootstrapCount: mfBootstrapChunks.length,
      byInitiatorType,
      byInitiatorSource,
    },
    remoteEntries,
    loadShareChunks: loadShareChunks.slice(0, 50), // cap to keep artifact readable
    mfBootstrapChunks,
  };

  /* ---- Persist ---- */

  if (!existsSync(opt.outDir)) {
    mkdirSync(opt.outDir, { recursive: true });
  }
  const fname = `${buildSha || 'unknown'}.json`;
  const outPath = join(opt.outDir, fname);
  writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`[initiator-trace] artifact written: ${outPath}`);
  console.log(`[initiator-trace] remoteEntries=${remoteEntries.length} loadShare=${loadShareChunks.length}`);
  console.log(`[initiator-trace] byInitiatorSource:`, byInitiatorSource);

  return outPath;
}

captureInitiatorTrace().catch((err) => {
  console.error('[initiator-trace] FAIL:', err);
  process.exit(1);
});
