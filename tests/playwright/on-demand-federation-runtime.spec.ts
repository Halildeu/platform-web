/**
 * PERF-INIT-V2 PR-B5b3b — runtime smoke for the 7 on-demand remote
 * canaries (suggestions / ethic / schema_explorer / users / access /
 * audit / reporting).
 *
 * Companion to PR-B5b3 source/build static guard (PR #463).  The
 * static guard catches source/dist regression at PR time; this
 * runtime smoke catches the case where source/dist look correct but
 * the deployed build STILL fetches eager federation chunks (e.g.
 * stale CDN cache, edge nginx misroute, service worker caching old
 * bundle).  Codex thread `019e239a` two-layer recommendation; this is
 * layer 2 (runtime/network observation).
 *
 * Test setup
 *   - Fresh browser context (no shared cookies/storage)
 *   - HTTP cache DISABLED via CDP `Network.setCacheDisabled` so
 *     each run measures a cold fetch graph (mirrors the
 *     `route-performance-budget.mjs --target testai` methodology)
 *   - Navigate to `<baseURL>/login` (default testai.acik.com)
 *   - Capture ALL network requests via `page.on('request', ...)`
 *   - Assert ZERO requests match the 7 on-demand remote entry URL
 *     pattern `/remotes/<remote>/remoteEntry.js`
 *   - Soft assert transfer + decoded budget (info-only; perf-budget
 *     script remains the canonical hard gate)
 *
 * Run
 *   PLAYWRIGHT_BASE_URL=https://testai.acik.com \
 *     pnpm playwright test tests/playwright/on-demand-federation-runtime.spec.ts \
 *     --config tests/playwright/playwright.config.ts \
 *     --project chromium
 *
 * Or via the nightly cron workflow
 *   `.github/workflows/on-demand-federation-nightly.yml`
 */

import { test, expect } from '@playwright/test';

/**
 * Canonical list of on-demand remote URL prefixes that MUST NOT be
 * fetched on `/login` cold-anonymous when the canary build is alive.
 * Kept in sync with `scripts/ci/on-demand-federation-guard.mjs`
 * registry; if you add a new on-demand canary, add it here too.
 */
const ON_DEMAND_REMOTE_ENTRY_URL_PATTERNS = [
  '/remotes/suggestions/remoteEntry.js',
  '/remotes/ethic/remoteEntry.js',
  '/remotes/schema-explorer/remoteEntry.js',
  '/remotes/users/remoteEntry.js',
  '/remotes/access/remoteEntry.js',
  '/remotes/audit/remoteEntry.js',
  '/remotes/reporting/remoteEntry.js',
];

/**
 * PR-B5b3d (Codex `019e239a` iter-2 P2 defense-in-depth): the
 * @module-federation/vite plugin emits two auxiliary chunk shapes
 * per remote when the manifest entry is present:
 *
 *   1. Virtual remoteEntry assets at
 *      `/remotes/<slug>/assets/virtual_mf-...__mfe_internal__mfe_<key>__remoteEntry_js-*.js`
 *      (the chunked remoteEntry implementation, fetched AFTER the
 *      top-level `remoteEntry.js`)
 *   2. Host static-loadRemote wrapper chunks at
 *      `/assets/__mfe_internal__mfe_shell__loadRemote__mfe_<key>_*.js`
 *      (emitted ONLY when a static `import('mfe_<key>/...')` survives
 *      DCE — the regression class D3 catches at build time)
 *
 * Direct `remoteEntry.js` patterns above catch the expensive eager
 * fetch; these auxiliary patterns are hardening so a future Rolldown /
 * MF-plugin shape change doesn't silently mask a regression.  Source/
 * build guard (PR #463) D1+D3 are the canonical proof; this runtime
 * check is the live-deploy tripwire for the same regression class.
 */
const ON_DEMAND_REMOTE_AUX_REGEXES = [
  // Per-remote virtual remoteEntry chunks (loaded from the remote origin).
  /\/remotes\/suggestions\/assets\/[^?]*__mfe_internal__mfe_suggestions__remoteEntry_js/,
  /\/remotes\/ethic\/assets\/[^?]*__mfe_internal__mfe_ethic__remoteEntry_js/,
  /\/remotes\/schema-explorer\/assets\/[^?]*__mfe_internal__mfe_schema_explorer__remoteEntry_js/,
  /\/remotes\/users\/assets\/[^?]*__mfe_internal__mfe_users__remoteEntry_js/,
  /\/remotes\/access\/assets\/[^?]*__mfe_internal__mfe_access__remoteEntry_js/,
  /\/remotes\/audit\/assets\/[^?]*__mfe_internal__mfe_audit__remoteEntry_js/,
  /\/remotes\/reporting\/assets\/[^?]*__mfe_internal__mfe_reporting__remoteEntry_js/,
  // Host static-loadRemote wrapper chunks (emitted by host build).
  // Codex iter-4 P2 absorb: loosen the host wrapper path so future
  // chunk-path reshaping (e.g. `assets/<subdir>/__mfe_internal...`)
  // still matches.  Anchor on the canonical chunk-name prefix only.
  /\/assets\/[^?]*__mfe_internal__mfe_shell__loadRemote__mfe_suggestions_/,
  /\/assets\/[^?]*__mfe_internal__mfe_shell__loadRemote__mfe_ethic_/,
  /\/assets\/[^?]*__mfe_internal__mfe_shell__loadRemote__mfe_schema_explorer_/,
  /\/assets\/[^?]*__mfe_internal__mfe_shell__loadRemote__mfe_users_/,
  /\/assets\/[^?]*__mfe_internal__mfe_shell__loadRemote__mfe_access_/,
  /\/assets\/[^?]*__mfe_internal__mfe_shell__loadRemote__mfe_audit_/,
  /\/assets\/[^?]*__mfe_internal__mfe_shell__loadRemote__mfe_reporting_/,
];

/**
 * Safe ceiling for /login cold transfer (KB).  Measured baseline
 * post-B5b2 is 2,344 KB (median of 3 Playwright runs on testai
 * BUILD_SHA `2a59704`); we set the ceiling at 5,000 KB to allow
 * normal variance + future small additions but catch the 49 MB
 * pre-V2 regression.  Hard fail above ceiling.
 */
const TRANSFER_CEILING_KB = 5000;

/**
 * Safe ceiling for /login decoded JS (KB).  Measured baseline
 * post-B5b2 is 9,088 KB; ceiling 15,000 KB.
 */
const DECODED_CEILING_KB = 15000;

test.describe('PR-B5b3b: on-demand federation runtime smoke (/login)', () => {
  test('no eager on-demand remoteEntry.js fetches on /login cold-anonymous', async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(60_000);

    // Force testai default if no override — this smoke is targeted at
    // the canary deployment.
    const target = process.env.PLAYWRIGHT_BASE_URL || baseURL || 'https://testai.acik.com';

    // Fresh context with cache disabled via CDP + service workers
    // blocked so a previous-run SW cache cannot mask the live
    // network state.  Codex `019e239a` iter-2 P2 absorb: passing
    // `serviceWorkers: 'block'` directly into `browser.newContext()`
    // is the only way to enforce it — the `test.use({...})` form
    // does not propagate to manually-created contexts.
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      serviceWorkers: 'block',
      storageState: undefined,
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });

    // Capture every request; we don't filter at observer level so the
    // assertion message can include the FULL violating URL list.
    const allRequests: string[] = [];
    page.on('request', (req) => {
      allRequests.push(req.url());
    });

    // B5b3b iter-2 (nightly first-fire failure absorb 2026-05-14):
    // `waitUntil: 'networkidle'` waits 500ms with ZERO network activity.
    // SPA shells with SSE/heartbeat/polling never reach idle within
    // 30s default → CI timeout.  Switch to `'load'` (window.onload
    // fires) which is sufficient for the network-observability assertion
    // (request capture started on `page.on('request', ...)` BEFORE goto,
    // so all sub-resource fetches are recorded regardless of waitUntil).
    // Bump per-call timeout to 45s for slower GitHub Actions runner
    // network paths.
    await page.goto(`${target}/login`, { waitUntil: 'load', timeout: 45_000 });
    // Give late-fired fetches (post-load JS-initiated chunks) 5s to
    // flush before the assertion — without this, lazy import requests
    // launched after window.load could miss the capture window.
    await page.waitForTimeout(5_000);

    // Filter for any of the 7 direct remoteEntry.js patterns + 14
    // auxiliary chunk patterns (per-remote virtual entry + host
    // static-loadRemote wrappers) — Codex `019e239a` iter-2 P2
    // defense-in-depth absorb.
    const directViolations = allRequests.filter((u) =>
      ON_DEMAND_REMOTE_ENTRY_URL_PATTERNS.some((p) => u.includes(p)),
    );
    const auxViolations = allRequests.filter((u) =>
      ON_DEMAND_REMOTE_AUX_REGEXES.some((re) => re.test(u)),
    );
    const violations = [...directViolations, ...auxViolations];

    if (violations.length > 0) {
      // Build a clear failure message that splits direct vs auxiliary
      // chunk hits so on-call can map directly to the responsible
      // wrapper / lazy-routes / shell-services-wiring change.
      const categoryLines: string[] = [];
      if (directViolations.length > 0) {
        categoryLines.push(`  direct-remoteEntry: ${directViolations.length} request(s)`);
      }
      if (auxViolations.length > 0) {
        categoryLines.push(`  auxiliary-chunk: ${auxViolations.length} request(s)`);
      }
      const summary = categoryLines.join('\n');
      throw new Error(
        `[B5b3b] On-demand canary regression — eager remote fetch on /login:\n` +
          `${summary}\n\n` +
          `All violating URLs:\n${violations.map((u) => `  ${u}`).join('\n')}\n\n` +
          `Source/build guard (PR #463) D1+D3 invariants catch this at PR time; if you reached this ` +
          `nightly smoke with a regression, check: stale CDN cache, edge nginx misroute, ` +
          `or service worker caching the pre-canary bundle.`,
      );
    }

    expect(violations.length).toBe(0);

    // Soft transfer + decoded budget assertion.  Hard gate is
    // `scripts/ci/route-performance-budget.mjs --target testai
    // --routes /login --require-baseline`; this is a duplicate
    // tripwire for the nightly so an alert fires even if the
    // perf-budget script is misconfigured.
    const perf = await page.evaluate(() => {
      const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      let transferBytes = 0;
      let decodedBytes = 0;
      for (const e of entries) {
        transferBytes += e.transferSize ?? 0;
        decodedBytes += e.decodedBodySize ?? 0;
      }
      return {
        transferKB: Math.round(transferBytes / 1024),
        decodedKB: Math.round(decodedBytes / 1024),
        resourceCount: entries.length,
      };
    });

    console.log(
      `[B5b3b] /login cold-anonymous: ` +
        `transferKB=${perf.transferKB} decodedKB=${perf.decodedKB} ` +
        `resources=${perf.resourceCount}`,
    );

    expect(perf.transferKB, `transferKB ${perf.transferKB} exceeds ${TRANSFER_CEILING_KB} ceiling`).toBeLessThanOrEqual(
      TRANSFER_CEILING_KB,
    );
    expect(perf.decodedKB, `decodedKB ${perf.decodedKB} exceeds ${DECODED_CEILING_KB} ceiling`).toBeLessThanOrEqual(
      DECODED_CEILING_KB,
    );

    await context.close();
  });
});
