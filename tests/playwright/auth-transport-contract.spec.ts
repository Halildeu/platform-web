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

    // Mock /api/v1/users:
    // - first 3 calls (one per parallel request): 401
    // - retry calls (after refresh closure): 200
    let firstWave = 0;
    await page.route('**/api/v1/users**', async (route) => {
      const headers = route.request().headers();
      const isRetry = headers.authorization?.includes('refreshed') ?? false;
      if (isRetry || firstWave >= 3) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: [], total: 0 }),
        });
      }
      firstWave += 1;
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
  });

  test('slow-init banner appears via Playwright clock fast-forward', async ({ page, baseURL }) => {
    const root = baseURL ?? 'http://localhost:3000';

    // Codex iter-2 Q-O: page.clock.install() controls Date + setTimeout
    // + setInterval, so the banner's 5s tick fires deterministically.
    await page.clock.install();
    await installAuthTransportProbe(page);

    // Do NOT install mock keycloak; let the FSM stay pre-terminal.
    // We force a non-terminal phase via store.dispatch after navigation,
    // then fast-forward past the slow-init threshold (>30s).

    await page.goto(`${root}/login`, { waitUntil: 'domcontentloaded' });

    // Wait for the probe to be installed (AppProviders mounted)
    await page.waitForFunction(
      () => Boolean((window as unknown as { __authContractProbe?: unknown }).__authContractProbe),
      { timeout: 5_000 },
    );

    // Force phase to a pre-terminal state so the banner's slow-init
    // condition can trigger
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

  test('recent-refresh-failures banner + /login self-link suppression', async ({
    page,
    baseURL,
  }) => {
    const root = baseURL ?? 'http://localhost:3000';
    const mockToken = buildMockJwt();

    await installAuthTransportProbe(page);
    await installMockKeycloakToken(page, mockToken);
    await mockBootstrapEndpoints(page, { allowedModules: ['USER_MANAGEMENT'] });

    // Navigate directly to /login (terminal display surface) to verify
    // the self-link suppression invariant from PR-Obs-5
    await page.goto(`${root}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => Boolean((window as unknown as { __authContractProbe?: unknown }).__authContractProbe),
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

    // Wait for the metrics throttle (1s) + banner tick (5s) to settle
    await page.waitForTimeout(7_000);

    const banner = page.locator('[data-testid="auth-degraded-banner"]');
    // Banner should appear because we're on /login and phase is
    // initializing/unauthenticated (not failed); recent failures > 2/60s
    // triggers the recent-refresh-failures branch.
    await expect(banner).toBeVisible({ timeout: 5_000 });
    await expect(banner).toHaveAttribute('data-reason', 'recent-refresh-failures');

    // Self-link suppression: when already on /login, the "Yeniden giriş
    // yap" link points to plain /login (no recursive redirect param).
    const loginLink = page.locator('[data-testid="auth-degraded-login"]');
    await expect(loginLink).toHaveAttribute('href', '/login');
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
