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
});
