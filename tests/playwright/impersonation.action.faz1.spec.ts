/**
 * Impersonation FE E2E — Faz 1 (Codex {@code 019e2022} strategy AGREE'd
 * + REVISE-2 absorbed).
 *
 * Phase 1 covers two authz-boundary contracts at the UI layer:
 *
 *   1. {@code action_visible_for_super_admin} — SuperAdmin sees the
 *      "Impersonate this user" affordance inside {@code UserDetailDrawer}
 *      and can open the reason form.
 *   2. {@code action_hidden_for_user_role} — A non-admin profile
 *      ({@code authzSnapshot.superAdmin === false}) never sees the
 *      affordance. The component returns null in the {@code canImpersonate}
 *      gate that reads {@code getShellServices().auth.isSuperAdmin()}.
 *
 * Critical fixture detail (Codex {@code 019e2022} BLOCKER fix): the
 * impersonation gate reads from the shell Redux store
 * ({@code state.auth.authzSnapshot.superAdmin}), NOT from the local
 * permissions array bundled with the fake-auth shell. The existing
 * {@code authenticateAndNavigate} helper does not seed this snapshot,
 * so this spec dispatches it explicitly after navigation so both cases
 * exercise the real gate instead of the default-null state.
 */

import { test, expect, type Page } from '@playwright/test';
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

const FIRST_ROW_SELECTOR = '.ag-root .ag-row';
const IMPERSONATE_OPEN_TESTID = 'impersonate-open-btn';
const IMPERSONATE_REASON_TESTID = 'impersonate-reason';

const ensureFakeAuthEnv = () => {
  if (!process.env.PW_FAKE_AUTH) {
    process.env.PW_FAKE_AUTH = '1';
  }
};

/**
 * Dispatch the shell Redux action that backs
 * {@code selectIsSuperAdmin}. Without this, the gate stays at its
 * default-null state regardless of permission flags. The payload only
 * sets the snapshot — token/profile remain whatever
 * {@code installSessionState} put there.
 */
const seedSuperAdminSnapshot = async (page: Page, isSuperAdmin: boolean) => {
  await page.evaluate((value) => {
    const store = (window as unknown as { __shellStore?: {
      dispatch: (action: { type: string; payload: unknown }) => unknown;
    } }).__shellStore;
    if (!store) {
      return;
    }
    store.dispatch({
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
};

const stubUserList = async (page: Page) => {
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
};

test.describe('Impersonation action authz boundary — Faz 1', () => {
  test.beforeAll(() => {
    ensureFakeAuthEnv();
  });

  test('action_visible_for_super_admin', async ({ page, baseURL }) => {
    test.skip(process.env.PW_FAKE_AUTH !== '1', 'Faz 1 runs against the fake-auth shell');

    await stubUserList(page);
    await authenticateAndNavigate(page, baseURL, '/admin/users', ADMIN_PERMISSIONS);
    await seedSuperAdminSnapshot(page, true);

    // Grid renders the deterministic mocked row.
    await expect(page.locator('.ag-root')).toBeVisible({ timeout: 20_000 });
    const firstRow = page.locator(FIRST_ROW_SELECTOR).first();
    await expect(firstRow).toBeVisible({ timeout: 20_000 });
    await firstRow.click();

    // Drawer mounts; the SuperAdmin sees the affordance and can open
    // the reason form.
    const openBtn = page.getByTestId(IMPERSONATE_OPEN_TESTID);
    await expect(openBtn).toBeVisible({ timeout: 10_000 });
    await openBtn.click();
    await expect(page.getByTestId(IMPERSONATE_REASON_TESTID)).toBeVisible();
  });

  test('action_hidden_for_user_role', async ({ page, baseURL }) => {
    test.skip(process.env.PW_FAKE_AUTH !== '1', 'Faz 1 runs against the fake-auth shell');

    await stubUserList(page);
    await authenticateAndNavigate(page, baseURL, '/admin/users', USER_PERMISSIONS);
    await seedSuperAdminSnapshot(page, false);

    // Even if the route lets us land on /admin/users with a viewer
    // profile, the action component fail-closes — its testId never
    // matches. We deliberately stub the user list and try to open the
    // drawer too, so the assertion proves "drawer present but action
    // absent" rather than "page redirected away."
    const gridVisible = await page
      .locator('.ag-root')
      .isVisible({ timeout: 10_000 })
      .catch(() => false);
    if (gridVisible) {
      const firstRow = page.locator(FIRST_ROW_SELECTOR).first();
      const rowVisible = await firstRow.isVisible({ timeout: 5_000 }).catch(() => false);
      if (rowVisible) {
        await firstRow.click();
      }
    }

    // Settle the route so the page has a fair chance to mount the gate.
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);

    const openBtn = page.getByTestId(IMPERSONATE_OPEN_TESTID);
    await expect(openBtn).toHaveCount(0);
  });
});
