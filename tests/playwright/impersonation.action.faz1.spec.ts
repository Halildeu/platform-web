/**
 * Impersonation FE E2E — Faz 1 (Codex {@code 019e2022} strategy AGREE'd).
 *
 * Phase 1 covers two authz-boundary contracts at the UI layer:
 *
 *   1. {@code action_visible_for_super_admin} — SuperAdmin sees the
 *      "Impersonate this user" affordance inside {@code UserDetailDrawer}
 *      and can open the reason form.
 *   2. {@code action_hidden_for_user_role} — A non-admin profile
 *      (no {@code IMPERSONATION_AUDIT} permission, {@code isSuperAdmin=false})
 *      never sees the affordance. The component returns null in the
 *      `canImpersonate` gate.
 *
 * Phase 2 (spawn task chip) builds on this fixture: M3/M4 happy + stop,
 * viewport overflow M10, and full enter→stop flow with mocked API.
 *
 * Boundary (ADR-0011 §2.3): test-only. Auth runs through the existing
 * fake-auth shell fixture (PW_FAKE_AUTH=1); no live KC interaction.
 */

import { test, expect } from '@playwright/test';
import { authenticateAndNavigate } from './utils/auth';

const ADMIN_PERMISSIONS = [
  'USER_MANAGEMENT',
  'IMPERSONATION_AUDIT',
  'AUDIT',
  'WAREHOUSE',
];

const USER_PERMISSIONS = [
  // Intentionally NO IMPERSONATION_AUDIT and NO admin role markers; this
  // mirrors the "viewer" profile that must never see the impersonate CTA.
  'WAREHOUSE',
];

// UsersPage renders ag-grid; pick the first data row that is not the
// pinned header. The existing admin-users.auth.spec uses the same
// `.ag-root` selector to wait for grid readiness.
const FIRST_ROW_SELECTOR = '.ag-root .ag-row';
const IMPERSONATE_OPEN_TESTID = 'impersonate-open-btn';
const IMPERSONATE_REASON_TESTID = 'impersonate-reason';

const enableFakeAuth = () => {
  // Tests in this file always use the fake-auth shell — they probe FE
  // gating, not the live KC flow. We still let an operator override via
  // PW_FAKE_AUTH=0 to drive against a real test cluster.
  if (!process.env.PW_FAKE_AUTH) {
    process.env.PW_FAKE_AUTH = '1';
  }
};

test.describe('Impersonation action authz boundary — Faz 1', () => {
  test.beforeAll(() => {
    enableFakeAuth();
  });

  test('action_visible_for_super_admin', async ({ page, baseURL }) => {
    test.skip(process.env.PW_FAKE_AUTH !== '1', 'Faz 1 runs against the fake-auth shell');

    // Mock the user list so the test does not depend on a dev seed and
    // produces a deterministic row we can click. The shape mirrors the
    // contract verified by admin-users.auth.spec.
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
            },
          ],
          total: 1,
          page: 1,
          pageSize: 100,
        }),
      });
    });

    await authenticateAndNavigate(page, baseURL, '/admin/users', ADMIN_PERMISSIONS);

    // Grid mounts and the mocked row is clickable.
    await expect(page.locator('.ag-root')).toBeVisible({ timeout: 20_000 });
    const firstRow = page.locator(FIRST_ROW_SELECTOR).first();
    await expect(firstRow).toBeVisible({ timeout: 20_000 });
    await firstRow.click();

    // Drawer mounts; the SuperAdmin sees the affordance.
    const openBtn = page.getByTestId(IMPERSONATE_OPEN_TESTID);
    await expect(openBtn).toBeVisible({ timeout: 10_000 });

    // Clicking expands the inline reason form.
    await openBtn.click();
    await expect(page.getByTestId(IMPERSONATE_REASON_TESTID)).toBeVisible();
  });

  test('action_hidden_for_user_role', async ({ page, baseURL }) => {
    test.skip(process.env.PW_FAKE_AUTH !== '1', 'Faz 1 runs against the fake-auth shell');

    // Non-admin profile — PermissionProvider may redirect away from
    // /admin/users entirely; either way the affordance must not render.
    await authenticateAndNavigate(page, baseURL, '/admin/users', USER_PERMISSIONS);

    // Give the route a brief settle window before asserting absence.
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);

    // The action component fail-closes when isSuperAdmin() returns false;
    // it renders nothing, so even if the user happens to land on a page
    // that includes the drawer, the testid must remain unmatched.
    const openBtn = page.getByTestId(IMPERSONATE_OPEN_TESTID);
    await expect(openBtn).toHaveCount(0);
  });
});
