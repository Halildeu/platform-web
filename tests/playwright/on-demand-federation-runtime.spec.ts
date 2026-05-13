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
  // Use a fresh isolated context per test so HTTP cache + storage
  // don't leak across runs.
  test.use({
    storageState: undefined,
    serviceWorkers: 'block',
  });

  test('no eager admin remoteEntry.js fetches on /login cold-anonymous', async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(60_000);

    // Force testai default if no override — this smoke is targeted at
    // the canary deployment.
    const target = process.env.PLAYWRIGHT_BASE_URL || baseURL || 'https://testai.acik.com';

    // Fresh context with cache disabled via CDP.  Without this, HTTP
    // cache from previous runs hides the network observability we
    // need; matches `route-performance-budget.mjs` methodology.
    const context = await browser.newContext({
      // Ignore HTTPS errors for testai self-signed certs if present.
      ignoreHTTPSErrors: true,
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

    await page.goto(`${target}/login`, { waitUntil: 'networkidle' });

    // Filter for any of the 7 on-demand canary patterns.
    const violations = allRequests.filter((u) =>
      ON_DEMAND_REMOTE_ENTRY_URL_PATTERNS.some((p) => u.includes(p)),
    );

    if (violations.length > 0) {
      // Build a clear failure message that names which remote(s)
      // regressed so on-call can map directly to the responsible
      // wrapper / lazy-routes / shell-services-wiring change.
      const byRemote: Record<string, string[]> = {};
      for (const u of violations) {
        const remote =
          ON_DEMAND_REMOTE_ENTRY_URL_PATTERNS.find((p) => u.includes(p)) ?? '<unknown>';
        byRemote[remote] = byRemote[remote] || [];
        byRemote[remote].push(u);
      }
      const summary = Object.entries(byRemote)
        .map(([r, urls]) => `  ${r}: ${urls.length} request(s)`)
        .join('\n');
      throw new Error(
        `[B5b3b] On-demand canary regression — eager admin remote fetch on /login:\n` +
          `${summary}\n\n` +
          `All violating URLs:\n${violations.map((u) => `  ${u}`).join('\n')}\n\n` +
          `Source/build guard (PR #463) catches this at PR time; if you reached this ` +
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
