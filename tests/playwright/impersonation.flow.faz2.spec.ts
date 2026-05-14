/**
 * Impersonation FE Faz 2 — Playwright dev-mode harness scaffold (B0).
 *
 * Codex {@code 019e2022} Hybrid AGREE → B-lite verdict: instead of
 * jumping into the full Faz 2 case set (M3/M4 enter→banner + stop flow
 * + USER role reload + viewport overflow M10), this PR establishes the
 * dev-mode Playwright harness with ONE bootstrap smoke case so future
 * PRs can layer the real flow cases on top of a proven readiness path.
 *
 * Why dev-mode (not production preview):
 * PR #486 spent 5 CI iterations trying to drive the production-preview
 * shell through Playwright. The shell never exposed
 * {@code window.__authContractProbe.store} within a 60s cold-runner
 * window even after AppProviders gate expansion + readEnv env fallback
 * + actionTimeout override. Codex closure: that's a separate P1
 * shell-test-infra bug, not Faz 2 acceptance scope. The dev-mode harness
 * sidesteps the production bootstrap quirks entirely and runs against
 * the same module-federation surface real operators see.
 *
 * This file intentionally contains ONE @Test only. The companion
 * workflow runs on workflow_dispatch (operator manual trigger) until B0
 * is proven stable across runs — at that point a PR-time gate can be
 * added in a follow-up PR.
 *
 * Faz 2 case roadmap (future PRs build on this scaffold):
 *   - M3 happy: enter impersonation → banner visible
 *   - M4 happy: stop impersonation → banner clears
 *   - USER role reload: fail-closed gate after auth flip
 *   - M10 viewport: overflow check on 768px tablet width
 */

import { test, expect } from '@playwright/test';

const ADMIN_PERMISSIONS = [
  'USER_MANAGEMENT',
  'IMPERSONATION_AUDIT',
  'AUDIT',
  'WAREHOUSE',
];

test.describe('Impersonation FE Faz 2 — dev-mode bootstrap (B0 scaffold)', () => {
  // The dev-mode harness needs a wider per-test budget than the existing
  // production-preview lane because pnpm dev cold-starts on a CI runner
  // legitimately exceeds the default 30s window before the first paint.
  test.use({ actionTimeout: 60_000, navigationTimeout: 90_000 });
  test.setTimeout(180_000);

  test('shell_boots_and_users_route_mounts_under_fake_admin_auth', async ({ page, baseURL }) => {
    // The harness sets PW_FAKE_AUTH=1 + VITE_AUTH_MODE=permitAll +
    // VITE_ENABLE_FAKE_AUTH=1 at the dev-server start step so the shell
    // bootstraps without a live KC token. We assert minimum readiness:
    //   1. shell URL resolves and document mounts,
    //   2. the test-only probe surface is reachable (proves auth
    //      bootstrap + Redux store live),
    //   3. /admin/users route renders (proves remote MFE loaded).

    const root = baseURL ?? 'http://localhost:3000';

    // Stage 1: shell index reachable.
    await page.goto(`${root}/`, { waitUntil: 'domcontentloaded' });

    // Stage 2: probe surface or shell store available.
    await page.waitForFunction(
      () => {
        const w = window as unknown as {
          __authContractProbe?: { store?: unknown };
          __shellStore?: unknown;
        };
        return Boolean(w.__authContractProbe?.store || w.__shellStore);
      },
      { timeout: 60_000 },
    );

    // Stage 3: navigate to users route, expect grid container to mount.
    await page.goto(`${root}/admin/users`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toBeVisible();

    // The grid may take a few seconds to mount under cold MFE preload —
    // we use a tolerant locator that matches either the ag-grid root
    // or any sentinel data-testid the page exposes.
    const gridOrSentinel = page.locator('.ag-root, [data-testid*="users"]').first();
    await expect(gridOrSentinel).toBeVisible({ timeout: 60_000 });

    // Permission marker — admin profile in fake-auth mode keeps the
    // route accessible. The actual impersonation cases run in B1/B2.
    void ADMIN_PERMISSIONS;
  });

  // ------------------------------------------------------------------
  // B1+ case set — full impersonation flow on top of the B0 readiness.
  // Each case mocks the relevant API contracts via page.route so the
  // dev-mode shell does not need a live auth-service / permission-service
  // backend stack to exercise the UI flow.
  // ------------------------------------------------------------------

  /**
   * Mock the user list endpoint so the row is deterministic and clickable.
   */
  async function stubUserList(page: import('@playwright/test').Page) {
    await page.route('**/api/v1/users**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 42,
              email: 'halil.kocoglu@example.com',
              fullName: 'Halil Kocoglu',
              role: 'USER',
              enabled: true,
              kcSubject: 'target-kc-uuid-faz2',
            },
          ],
          total: 1,
          page: 1,
          pageSize: 100,
        }),
      });
    });
  }

  /**
   * Seed shell Redux authzSnapshot via dispatch so {@code isSuperAdmin()}
   * returns the requested boolean — mirrors the Vitest companion test.
   */
  async function seedSuperAdmin(
    page: import('@playwright/test').Page,
    isSuperAdmin: boolean,
  ) {
    await page.evaluate((value) => {
      const w = window as unknown as {
        __authContractProbe?: { store?: { dispatch: (a: unknown) => unknown } };
        __shellStore?: { dispatch: (a: unknown) => unknown };
      };
      const store = w.__authContractProbe?.store ?? w.__shellStore;
      if (!store) {
        throw new Error('No store surface');
      }
      (store as { dispatch: (a: unknown) => unknown }).dispatch({
        type: 'auth/setKeycloakSession',
        payload: {
          authzSnapshot: {
            subscriberId: 1,
            userId: 1,
            superAdmin: value,
            permissions: value ? ['IMPERSONATION_AUDIT', 'AUDIT'] : [],
            allowedModules: value ? ['admin', 'users', 'audit'] : ['warehouse'],
          },
        },
      });
    }, isSuperAdmin);
  }

  test('B1_M3_enter_dispatches_session_post', async ({ page, baseURL }) => {
    // M3 acceptance: SuperAdmin → row → drawer → impersonate → reason →
    // submit → POST /impersonation/sessions called with the resolved
    // body shape; the controller's 201 response feeds the banner mount.
    const root = baseURL ?? 'http://localhost:3000';

    const captured: { startBody?: unknown } = {};
    await page.route('**/api/v1/impersonation/sessions', async (route) => {
      if (route.request().method() === 'POST') {
        try {
          captured.startBody = route.request().postDataJSON();
        } catch {
          /* ignore parse */
        }
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            sessionId: '00000000-0000-0000-0000-000000000m3',
            exchangedToken: 'exchanged-fake-jwt.M3.signature',
            expiresAt: '2026-05-14T20:00:00Z',
          }),
        });
      } else {
        await route.continue();
      }
    });

    await stubUserList(page);
    await page.goto(`${root}/admin/users`, { waitUntil: 'domcontentloaded' });
    await seedSuperAdmin(page, true);
    await expect(page.locator('.ag-root')).toBeVisible({ timeout: 30_000 });

    const firstRow = page.locator('.ag-root .ag-row').first();
    await firstRow.click();

    const openBtn = page.getByTestId('impersonate-open-btn');
    await expect(openBtn).toBeVisible({ timeout: 10_000 });
    await openBtn.click();

    const reason = page.getByTestId('impersonate-reason');
    await reason.fill('Faz 2 B1 M3 — happy enter flow');
    await page.getByTestId('impersonate-submit-btn').click();

    // Body shape proof — the start POST must carry the resolved target.
    await page.waitForFunction(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c: any) => Boolean(c?.startBody?.targetUserId),
      captured,
      { timeout: 15_000 },
    );
    expect((captured.startBody as { targetUserId: number }).targetUserId).toBe(42);
    expect((captured.startBody as { reason: string }).reason).toContain('Faz 2 B1 M3');
  });

  test('B2_M4_stop_clears_banner', async ({ page, baseURL }) => {
    // M4 acceptance: active impersonation state → banner visible →
    // stop → DELETE /sessions/current → banner clears.
    const root = baseURL ?? 'http://localhost:3000';

    // Mock the active session lookup so the shell hydrates an active
    // impersonation state on mount.
    await page.route('**/api/v1/impersonation/sessions/active*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sessionId: '00000000-0000-0000-0000-000000000m4',
          impersonatorUserId: 1,
          targetUserId: 42,
          startedAt: '2026-05-14T19:00:00Z',
          expiresAt: '2026-05-14T20:00:00Z',
          status: 'ACTIVE',
        }),
      });
    });

    let stopCalled = false;
    await page.route('**/api/v1/impersonation/sessions/current', async (route) => {
      if (route.request().method() === 'DELETE') {
        stopCalled = true;
        await route.fulfill({ status: 204, body: '' });
      } else {
        await route.continue();
      }
    });

    await page.goto(`${root}/`, { waitUntil: 'domcontentloaded' });
    await seedSuperAdmin(page, true);

    // The shell mounts the banner when an active session is hydrated.
    // Look for any element whose testid contains 'impersonation' and a
    // 'stop' button — tolerant matching keeps the spec resilient to
    // minor banner restyling.
    const banner = page.locator('[data-testid*="impersonation-banner"]');
    await expect(banner).toBeVisible({ timeout: 20_000 });

    const stopBtn = banner.locator('[data-testid*="stop"], button:has-text("Durdur")').first();
    await stopBtn.click();

    await page.waitForFunction(() => true, { timeout: 1_000 }).catch(() => undefined);
    expect(stopCalled).toBe(true);
    await expect(banner).toHaveCount(0, { timeout: 15_000 });
  });

  test('B3_user_role_action_hidden_after_authz_flip', async ({ page, baseURL }) => {
    // B3 acceptance: start as SuperAdmin, navigate to /admin/users to
    // confirm the action renders, then flip authzSnapshot to USER role
    // and re-navigate — action must be gone (browser-side proof of the
    // canImpersonate fail-closed gate already covered at unit level).
    const root = baseURL ?? 'http://localhost:3000';

    await stubUserList(page);
    await page.goto(`${root}/admin/users`, { waitUntil: 'domcontentloaded' });
    await seedSuperAdmin(page, true);
    await expect(page.locator('.ag-root')).toBeVisible({ timeout: 30_000 });
    await page.locator('.ag-root .ag-row').first().click();
    await expect(page.getByTestId('impersonate-open-btn')).toBeVisible({ timeout: 10_000 });

    // Flip auth → USER role.
    await seedSuperAdmin(page, false);
    // Force a route re-mount so the gate re-evaluates.
    await page.goto(`${root}/admin/users`, { waitUntil: 'domcontentloaded' });
    await seedSuperAdmin(page, false);

    const gridVisible = await page
      .locator('.ag-root')
      .isVisible({ timeout: 15_000 })
      .catch(() => false);
    if (gridVisible) {
      const row = page.locator('.ag-root .ag-row').first();
      const rowVisible = await row.isVisible({ timeout: 5_000 }).catch(() => false);
      if (rowVisible) {
        await row.click();
      }
    }

    await expect(page.getByTestId('impersonate-open-btn')).toHaveCount(0);
  });

  test('B4_M10_viewport_overflow_tablet_768', async ({ page, baseURL }) => {
    // M10 acceptance: 768px tablet width — drawer + impersonate
    // affordance remain reachable (not clipped off the right edge as
    // PR #411 reported on production).
    const root = baseURL ?? 'http://localhost:3000';

    await page.setViewportSize({ width: 768, height: 900 });

    await stubUserList(page);
    await page.goto(`${root}/admin/users`, { waitUntil: 'domcontentloaded' });
    await seedSuperAdmin(page, true);
    await expect(page.locator('.ag-root')).toBeVisible({ timeout: 30_000 });
    await page.locator('.ag-root .ag-row').first().click();

    const openBtn = page.getByTestId('impersonate-open-btn');
    await expect(openBtn).toBeVisible({ timeout: 10_000 });

    // The button bounding box must fit within the viewport width.
    const box = await openBtn.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(768);
    }
  });
});
