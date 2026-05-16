import { test, expect } from '@playwright/test';
import {
  buildMockJwt,
  installAuthTransportProbe,
  installMockKeycloakToken,
  isAllowedPreTransport,
  mockBootstrapEndpoints,
  readRequestLog,
  waitForTransportReady,
} from './utils/auth-contract';

/**
 * Phase 2 PR-E2E-6 — MFE Auth Transport Contract end-to-end tests.
 *
 * <p>Validates the contract pinned in ADR-0014 (Codex thread
 * 019e04d0) end-to-end in a real browser, against a deterministic
 * mocked backend:
 * <ul>
 *   <li>I1/I3: protected MFE HTTP awaits transportReady</li>
 *   <li>I4: bootstrap-chain requests are the sole gate-bypass class</li>
 *   <li>I5: 401 single-flight refresh + retry</li>
 *   <li>I7: degraded UI banner for slow init + recent refresh failures</li>
 * </ul>
 *
 * <p>Hard gate: chromium only. Firefox/webkit run nightly via
 * separate workflow (cross-browser advisory).
 *
 * <p>Stack: {@code auth-business-routes-live} (NOT
 * {@code auth-business-routes} — the latter forces permitAll/fakeAuth
 * which bypasses the very contract we're testing; Codex iter-2 must-fix #1).
 */

test.describe.configure({ mode: 'serial' });

test.describe('Auth Transport Contract (PR-E2E-6)', () => {
  // CI cold-start absorber. On a fresh GitHub-hosted runner the FIRST
  // browser navigation pays the entire Module Federation host warm-up
  // (V8 compile of the built bundle + the auth-FSM bootstrap chain),
  // which has repeatedly pushed test #1's `waitForTransportReady` past
  // its 25 s ceiling — and because this block runs `mode: 'serial'`,
  // that single cold-start timeout then skips the other 6 tests
  // (PR #310 advisory demotion + #338-#342 follow-ups all hit exactly
  // this). This `beforeAll` pays the cold-start ONCE on a throwaway
  // page with a generous 120 s budget, so the 7 real tests below run
  // against a warm preview server + warm V8 code cache and keep the
  // tight 25 s `waitForTransportReady` that still surfaces a genuine
  // FSM regression.
  test.beforeAll(async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const root = baseURL ?? 'http://localhost:3000';
    const warmupPage = await browser.newPage();
    try {
      await installAuthTransportProbe(warmupPage);
      await installMockKeycloakToken(warmupPage, buildMockJwt());
      await mockBootstrapEndpoints(warmupPage, { allowedModules: ['USER_MANAGEMENT'] });
      await warmupPage.goto(`${root}/admin/users`, { waitUntil: 'domcontentloaded' });
      await waitForTransportReady(warmupPage, 80_000);
    } finally {
      await warmupPage.close();
    }
  });

  test('only allowlisted requests fire before transportReady', async ({ page, baseURL }) => {
    const root = baseURL ?? 'http://localhost:3000';
    const mockToken = buildMockJwt();

    await installAuthTransportProbe(page);
    await installMockKeycloakToken(page, mockToken);
    await mockBootstrapEndpoints(page, { allowedModules: ['USER_MANAGEMENT'] });

    await page.goto(`${root}/admin/users`, { waitUntil: 'domcontentloaded' });
    await waitForTransportReady(page);

    const log = await readRequestLog(page);

    // Filter: requests that fired BEFORE transportReady AND target /api/.
    // Anything in this set must be on the allowlist; otherwise it's a
    // contract violation (a protected request escaped the gate).
    const violations = log.filter(
      (r) =>
        r.phaseAtFire !== 'transportReady' &&
        r.url.includes('/api/') &&
        !isAllowedPreTransport(r.url),
    );

    expect(violations, `unexpected pre-transport requests: ${JSON.stringify(violations)}`).toEqual(
      [],
    );
  });

  test('bootstrap allowlist actually fires pre-transportReady', async ({ page, baseURL }) => {
    const root = baseURL ?? 'http://localhost:3000';
    const mockToken = buildMockJwt();

    await installAuthTransportProbe(page);
    await installMockKeycloakToken(page, mockToken);
    await mockBootstrapEndpoints(page, { allowedModules: ['USER_MANAGEMENT'] });

    await page.goto(`${root}/admin/users`, { waitUntil: 'domcontentloaded' });
    await waitForTransportReady(page);

    const log = await readRequestLog(page);

    // Positive case: contract requires that /auth/cookie AND /v1/authz/me
    // actually DO fire before transportReady (otherwise the FSM never
    // advances). Verifies the gate-skip allowlist is wired correctly.
    const cookiePre = log.some(
      (r) => /\/api\/auth\/cookie\b/.test(r.url) && r.phaseAtFire !== 'transportReady',
    );
    const authzPre = log.some(
      (r) => /\/api\/v1\/authz\/me\b/.test(r.url) && r.phaseAtFire !== 'transportReady',
    );

    expect(cookiePre, 'expected POST /auth/cookie pre-transportReady').toBe(true);
    expect(authzPre, 'expected GET /v1/authz/me pre-transportReady').toBe(true);
  });

  test('401 refresh single-flight: 1 owner attempt + N waiters retry', async ({
    page,
    baseURL,
  }) => {
    const root = baseURL ?? 'http://localhost:3000';
    const mockToken = buildMockJwt();

    await installAuthTransportProbe(page);
    await installMockKeycloakToken(page, mockToken);
    await mockBootstrapEndpoints(page, { allowedModules: ['USER_MANAGEMENT'] });

    await page.goto(`${root}/admin/users`, { waitUntil: 'domcontentloaded' });
    await waitForTransportReady(page);

    // Spy on keycloak.updateToken — count owner invocations
    await page.evaluate(() => {
      const w = window as unknown as { __keycloak?: Record<string, unknown> };
      const kc = w.__keycloak as
        | {
            updateToken: (...args: unknown[]) => Promise<boolean>;
            token?: string;
            tokenParsed?: Record<string, unknown>;
          }
        | undefined;
      if (!kc) return;
      let calls = 0;
      kc.updateToken = async () => {
        calls += 1;
        // Simulate fresh token issued
        const exp = Math.floor(Date.now() / 1000) + 3600;
        kc.token = 'refreshed.mock.token.signature';
        kc.tokenParsed = { exp };
        return true;
      };
      (window as unknown as { __updateTokenCallCount: () => number }).__updateTokenCallCount = () =>
        calls;
    });

    // Mock /api/v1/users with strict stale-token regression guard:
    // - first wave (one per parallel request, no Authorization=refreshed): 401
    // - retry MUST carry refreshed token Authorization; otherwise 500
    //   (Codex iter-3 P1 #3 absorb: the previous "any retry → 200"
    //   handler would silently pass a stale-token regression).
    let firstWaveCount = 0;
    let retrySuccessCount = 0;
    let staleRetryCount = 0;
    await page.route('**/api/v1/users**', async (route) => {
      const headers = route.request().headers();
      const auth = headers.authorization ?? '';
      const isRetryWithFreshToken = auth.includes('refreshed');
      const isRetryWithStaleToken = firstWaveCount >= 3 && !isRetryWithFreshToken;

      if (isRetryWithFreshToken) {
        retrySuccessCount += 1;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: [], total: 0 }),
        });
      }
      if (isRetryWithStaleToken) {
        staleRetryCount += 1;
        return route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'STALE_TOKEN_REGRESSION', auth }),
        });
      }
      firstWaveCount += 1;
      return route.fulfill({ status: 401, body: '{}' });
    });

    // Trigger 3 parallel protected requests via the probe http
    const results = await page.evaluate(async () => {
      const probe = (
        window as unknown as {
          __authContractProbe?: { http: { get: (url: string) => Promise<unknown> } };
        }
      ).__authContractProbe;
      if (!probe) return { error: 'no-probe' };
      const settled = await Promise.allSettled([
        probe.http.get('/v1/users?p=1'),
        probe.http.get('/v1/users?p=2'),
        probe.http.get('/v1/users?p=3'),
      ]);
      return {
        statuses: settled.map((s) => s.status),
        updateTokenCalls: (
          window as unknown as { __updateTokenCallCount?: () => number }
        ).__updateTokenCallCount?.(),
      };
    });

    expect(results.statuses).toEqual(['fulfilled', 'fulfilled', 'fulfilled']);
    // Single-flight contract: updateToken called exactly once even with
    // 3 simultaneous 401s. Waiters coalesce onto the in-flight refresh.
    expect(results.updateTokenCalls).toBe(1);
    // First-wave 401 count: exactly 3 (one per parallel request)
    expect(firstWaveCount).toBe(3);
    // Retry success count: exactly 3 (each parallel request retried with
    // the fresh token after single-flight refresh)
    expect(retrySuccessCount).toBe(3);
    // Stale-token regression guard: the retry MUST NOT carry the
    // pre-refresh Authorization header. If this counter is >0, the
    // token rotation in shared-http's response interceptor is broken
    // (Codex iter-3 P1 #3).
    expect(staleRetryCount).toBe(0);
  });

  test('slow-init banner appears via Playwright clock fast-forward', async ({ page, baseURL }) => {
    const root = baseURL ?? 'http://localhost:3000';
    const mockToken = buildMockJwt();

    // Codex iter-2 Q-O: page.clock.install() controls Date + setTimeout
    // + setInterval, so the banner's 5s tick fires deterministically.
    // Codex iter-3 P1 #4 absorb: install mock token + endpoints first
    // so bootstrap reaches a deterministic state before phase override.
    // Without this, race between real keycloak.init and the test's
    // store.dispatch could push phase to unauthenticated/failed and
    // hide the banner mid-test.
    await page.clock.install();
    await installAuthTransportProbe(page);
    await installMockKeycloakToken(page, mockToken);
    await mockBootstrapEndpoints(page, { allowedModules: ['USER_MANAGEMENT'] });

    await page.goto(`${root}/admin/users`, { waitUntil: 'domcontentloaded' });
    await waitForTransportReady(page);

    // Now force phase BACK to a pre-terminal state. The banner mounted
    // on the authenticated route will see this transition and start
    // the slow-init clock. Reset bootstrapStartRef-equivalent timing
    // by treating this as a "fresh" pre-terminal phase entry; the
    // banner's mount-time bootstrapStartAt is already captured but the
    // clock fast-forward below moves Date.now ahead of it deterministically.
    await page.evaluate(() => {
      const store = (
        window as unknown as {
          __authContractProbe?: {
            store: { dispatch: (action: { type: string; payload: string }) => void };
          };
        }
      ).__authContractProbe?.store;
      store?.dispatch({ type: 'auth/setAuthPhase', payload: 'cookieReady' });
    });

    // Fast-forward past the 30s slow-init threshold + 1 banner tick (5s)
    await page.clock.fastForward(35_000);

    const banner = page.locator('[data-testid="auth-degraded-banner"]');
    await expect(banner).toBeVisible({ timeout: 5_000 });
    await expect(banner).toHaveAttribute('data-reason', 'slow-init');
  });

  test('recent-refresh-failures banner appears on authenticated route', async ({
    page,
    baseURL,
  }) => {
    const root = baseURL ?? 'http://localhost:3000';
    const mockToken = buildMockJwt();

    await installAuthTransportProbe(page);
    await installMockKeycloakToken(page, mockToken);
    await mockBootstrapEndpoints(page, { allowedModules: ['USER_MANAGEMENT'] });

    await page.goto(`${root}/admin/users`, { waitUntil: 'domcontentloaded' });
    await waitForTransportReady(page);

    // Inject 3 refresh failures via the probe metrics API
    await page.evaluate(() => {
      const probe = (
        window as unknown as {
          __authContractProbe?: {
            metrics: { recordRefreshAttempt: (reason: string) => void };
          };
        }
      ).__authContractProbe;
      probe?.metrics.recordRefreshAttempt('handler-threw');
      probe?.metrics.recordRefreshAttempt('refresh-closure-failed');
      probe?.metrics.recordRefreshAttempt('handler-threw');
    });

    // Wait for the metrics throttle (1s) + banner tick (5s) to settle
    await page.waitForTimeout(7_000);

    const banner = page.locator('[data-testid="auth-degraded-banner"]');
    await expect(banner).toBeVisible({ timeout: 5_000 });
    await expect(banner).toHaveAttribute('data-reason', 'recent-refresh-failures');
  });

  test('login self-link suppression on /login (no mock auth)', async ({ page, baseURL }) => {
    const root = baseURL ?? 'http://localhost:3000';

    // Codex iter-3 P0 #2 absorb: do NOT install mock token here —
    // mock-token bootstrap → LoginPage redirect away from /login,
    // so the URL would no longer match the test premise. Drive the
    // banner via probe metrics on the unauthenticated /login surface.
    await installAuthTransportProbe(page);

    await page.goto(`${root}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => Boolean((window as unknown as { __authContractProbe?: unknown }).__authContractProbe),
      // arg / options: `{ timeout }` must be the 3rd `waitForFunction`
      // parameter — same fix as waitForTransportReady in
      // utils/auth-contract.ts (2nd slot is the page-function arg).
      undefined,
      { timeout: 5_000 },
    );

    // Inject 3 refresh failures via the probe metrics API
    await page.evaluate(() => {
      const probe = (
        window as unknown as {
          __authContractProbe?: {
            metrics: { recordRefreshAttempt: (reason: string) => void };
          };
        }
      ).__authContractProbe;
      probe?.metrics.recordRefreshAttempt('handler-threw');
      probe?.metrics.recordRefreshAttempt('refresh-closure-failed');
      probe?.metrics.recordRefreshAttempt('handler-threw');
    });

    await page.waitForTimeout(7_000);

    // We're still on /login (no mock-token redirect).
    expect(page.url().includes('/login')).toBe(true);

    // The self-link suppression invariant: if the banner renders, its
    // login link MUST be plain /login (no recursive redirect param —
    // would create a redirect loop on click).
    const loginLink = page.locator('[data-testid="auth-degraded-login"]');
    if (await loginLink.isVisible()) {
      await expect(loginLink).toHaveAttribute('href', '/login');
    }
  });

  test('refresh failure dispatches unauthorized once + no retry loop', async ({
    page,
    baseURL,
  }) => {
    const root = baseURL ?? 'http://localhost:3000';
    const mockToken = buildMockJwt();

    await installAuthTransportProbe(page);
    await installMockKeycloakToken(page, mockToken);
    await mockBootstrapEndpoints(page, { allowedModules: ['USER_MANAGEMENT'] });

    await page.goto(`${root}/admin/users`, { waitUntil: 'domcontentloaded' });
    await waitForTransportReady(page);

    // Listen for app:auth:unauthorized events
    await page.evaluate(() => {
      (window as unknown as { __capturedAuthEvents: unknown[] }).__capturedAuthEvents = [];
      window.addEventListener('app:auth:unauthorized', (event) => {
        (window as unknown as { __capturedAuthEvents: unknown[] }).__capturedAuthEvents.push({
          status: (event as CustomEvent).detail?.status,
          ts: Date.now(),
        });
      });
    });

    // Mock keycloak.updateToken to fail
    await page.evaluate(() => {
      const w = window as unknown as { __keycloak?: Record<string, unknown> };
      const kc = w.__keycloak as
        | { updateToken?: (...args: unknown[]) => Promise<boolean> }
        | undefined;
      if (!kc) return;
      kc.updateToken = async () => {
        throw new Error('refresh-failed-mock');
      };
    });

    // Mock /api/v1/users to always return 401
    let userRequestCount = 0;
    await page.route('**/api/v1/users**', async (route) => {
      userRequestCount += 1;
      return route.fulfill({ status: 401, body: '{}' });
    });

    // Single protected request
    await page.evaluate(async () => {
      const probe = (
        window as unknown as {
          __authContractProbe?: { http: { get: (url: string) => Promise<unknown> } };
        }
      ).__authContractProbe;
      try {
        await probe?.http.get('/v1/users?p=1');
      } catch {
        // expected
      }
    });

    await page.waitForTimeout(500);

    const captured = await page.evaluate(
      () =>
        (window as unknown as { __capturedAuthEvents: { status: number; ts: number }[] })
          .__capturedAuthEvents,
    );

    // Strict count: exactly one app:auth:unauthorized for this single
    // failed request. Multiple firings would indicate a retry loop.
    expect(captured.length).toBe(1);
    expect(captured[0].status).toBe(401);
    // userRequestCount: 1 original + 0 retries (refresh failed before retry)
    expect(userRequestCount).toBe(1);
  });
});
