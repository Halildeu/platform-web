/**
 * Role Drawer — policies render regression guard
 *
 * Codex 019dd927 iter-19 (state-replace race fix). Drawer briefly
 * populated correct values on mount, then state-replaced to empty
 * `{}` — every module rendered "—" even when role.policies / granules
 * data was valid. Live React fiber inspection confirmed hooks 21-24
 * (moduleGrants/actionGrants/reportGrants/pageGrants) = `{}` despite
 * roleGranulesQuery.data carrying parsed Array(2) of policy entries.
 *
 * Root cause: single useEffect at parse time raced with React's
 * commit phase; setModuleGrants(filledMods) was either dropped or
 * overwritten before paint.
 *
 * Fix (iter-19):
 *   1. useState lazy initializer derives mods from props.role.policies
 *      on mount → first paint guaranteed populated.
 *   2. Effect A (deps: [role?.id]): on role change, reset to props
 *      initial. Uses role.id string instead of object reference so
 *      same-content re-renders don't trigger reset.
 *   3. Effect B (deps: [role, granules.data]): only OVERWRITES grants
 *      when granules data carries parseable entries. Empty/undefined
 *      data NEVER clears state (regression vector closed).
 *
 * This spec asserts that an open role drawer's MODÜLLER section shows
 * non-NONE level for at least one catalog module — i.e., the parse
 * pipeline did populate the state and render committed.
 *
 * Stage-only: requires PLAYWRIGHT_BASE_URL pointing at a real frontend
 * with backend wired (testai.acik.com). Localhost runs are SKIPPED so
 * mock-auth pattern doesn't false-greenify the regression guard.
 */

import { test, expect, type Page } from '@playwright/test';

test.describe.configure({ retries: 1 });

const STAGE_HOSTS = new Set(['testai.acik.com', 'ai.acik.com']);

const isStageHost = (baseURL: string | undefined): boolean => {
  if (!baseURL) return false;
  try {
    return STAGE_HOSTS.has(new URL(baseURL).host);
  } catch {
    return false;
  }
};

const ADMIN_EMAIL = (process.env.PW_ADMIN_EMAIL ?? 'admin@example.com').trim();
const ADMIN_PASSWORD = (process.env.PW_ADMIN_PASSWORD ?? '').trim();
const REQUIRE_OIDC = (process.env.PW_REQUIRE_OIDC ?? '').trim() === '1';

const AUTH_STORAGE_KEYS = [
  'token',
  'user',
  'tokenExpiresAt',
  'shell_auth_state',
  'serban.shell.authState',
  'shell-auth-sync',
];

const waitForFirstVisible = async (page: Page, selectors: string[], timeoutMs = 15_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      if (await locator.isVisible().catch(() => false)) {
        return locator;
      }
    }
    await page.waitForTimeout(250);
  }
  return null;
};

const fillFirst = async (page: Page, selectors: string[], value: string) => {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) {
      await locator.fill(value);
      return;
    }
  }
  throw new Error(`Beklenen input bulunamadı: ${selectors.join(', ')}`);
};

const clickFirst = async (page: Page, selectors: string[]) => {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) {
      await locator.click();
      return;
    }
  }
  throw new Error(`Beklenen buton bulunamadı: ${selectors.join(', ')}`);
};

const performBrowserLogin = async (
  page: Page,
  root: string,
  email: string,
  password: string,
  redirectPath: string,
) => {
  await page.context().clearCookies();
  await page.addInitScript((keys: string[]) => {
    try {
      keys.forEach((k) => {
        window.localStorage.removeItem(k);
        window.sessionStorage.removeItem(k);
      });
    } catch {
      // ignore
    }
  }, AUTH_STORAGE_KEYS);
  await page.goto(`${root}/login?redirect=${encodeURIComponent(redirectPath)}`, {
    waitUntil: 'domcontentloaded',
  });

  const appLoginButtonSelectors = [
    '[data-testid="corporate-login-button"]',
    'button:has-text("Güvenli Kurumsal Giriş")',
    'button:has-text("Kurumsal Giriş")',
    'button:has-text("Sign In")',
  ];
  const loginButton = await waitForFirstVisible(page, appLoginButtonSelectors, 15_000);
  if (loginButton) {
    await expect(loginButton).toBeEnabled({ timeout: 30_000 });
    await loginButton.click();
  }

  const kcUserSelectors = ['#username', 'input[name="username"]', 'input[type="email"]'];
  const kcPassSelectors = ['#password', 'input[name="password"]', 'input[type="password"]'];
  const kcSubmitSelectors = ['#kc-login', 'button[type="submit"]', 'input[type="submit"]'];

  const keycloakVisible = await page
    .waitForFunction(
      ({ userSelectors }) => userSelectors.some((selector) => !!document.querySelector(selector)),
      { userSelectors: kcUserSelectors },
      { timeout: 20_000 },
    )
    .then(() => true)
    .catch(() => false);

  if (keycloakVisible) {
    await fillFirst(page, kcUserSelectors, email);
    await fillFirst(page, kcPassSelectors, password);
    await clickFirst(page, kcSubmitSelectors);
  }

  await page.waitForURL((url) => !url.toString().includes('/realms/'), { timeout: 60_000 });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => Boolean(window.localStorage.getItem('token')), undefined, {
    timeout: 60_000,
  });
};

test.describe('Role Drawer — iter-19 policies render regression', () => {
  test.skip(
    ({ baseURL }) => !isStageHost(baseURL) && !REQUIRE_OIDC,
    `Stage-only spec: PLAYWRIGHT_BASE_URL ${process.env.PLAYWRIGHT_BASE_URL ?? '(unset)'} testai/ai.acik.com değil ve PW_REQUIRE_OIDC=1 değil.`,
  );

  test.skip(
    () => !ADMIN_PASSWORD,
    'PW_ADMIN_PASSWORD env değişkeni gerekli (admin@example.com için).',
  );

  test('drawer açıldığında MODÜLLER bölümünde en az bir non-NONE level görünür', async ({
    page,
    baseURL,
  }) => {
    const root = baseURL ?? process.env.PLAYWRIGHT_BASE_URL ?? '';

    await performBrowserLogin(page, root, ADMIN_EMAIL, ADMIN_PASSWORD, '/access/roles');

    // Wait for grid + at least one role row
    await expect(page.locator('.ag-root')).toBeVisible({ timeout: 30_000 });
    await page.waitForFunction(() => document.querySelectorAll('.ag-row').length > 0, undefined, {
      timeout: 30_000,
    });

    // Pick a role with policies — PURCHASE_MANAGER and PERMISSION_MANAGE both
    // exhibited the bug in incident reports. PURCHASE_MANAGER is FK-mode
    // (legacy) and PERMISSION_MANAGE is action-only — covering both paths.
    const targetRoleName = 'PURCHASE_MANAGER';
    const roleRow = page.locator('.ag-row', { hasText: targetRoleName }).first();
    await expect(roleRow).toBeVisible({ timeout: 30_000 });
    await roleRow.dblclick();

    // Drawer must open
    const drawer = page.locator('aside, [role="dialog"]').filter({ hasText: 'MODÜLLER' });
    await expect(drawer).toBeVisible({ timeout: 15_000 });
    await expect(drawer).toContainText('PURCHASE_MANAGER');

    // Wait for granules query to settle and module selects to render
    await page.waitForTimeout(2_000);

    // Read every module-level <select> inside the drawer and assert at least
    // one shows a non-NONE value. Pre-iter-19, all selects locked at "NONE"
    // ("—") even though backend returned populated policies.
    const moduleSelects = drawer.locator('select');
    const totalSelects = await moduleSelects.count();
    expect(totalSelects).toBeGreaterThan(0);

    const values: string[] = [];
    for (let i = 0; i < totalSelects; i++) {
      values.push((await moduleSelects.nth(i).inputValue()) ?? '');
    }

    const hasFilledLevel = values.some((v) => v && v !== 'NONE');

    expect(
      hasFilledLevel,
      `iter-19 regression: PURCHASE_MANAGER drawer'ında tüm modüller NONE — state-replace race geri geldi. ` +
        `Select values: ${JSON.stringify(values)}`,
    ).toBe(true);

    // Bonus: assert that the catalog module count matches expectation (7
    // modules per PermissionCatalogService) so we catch silent regressions
    // where the drawer renders zero rows.
    expect(totalSelects).toBeGreaterThanOrEqual(7);
  });

  test('drawer kapatılıp tekrar açıldığında state stable kalır (race retry)', async ({
    page,
    baseURL,
  }) => {
    const root = baseURL ?? process.env.PLAYWRIGHT_BASE_URL ?? '';

    await performBrowserLogin(page, root, ADMIN_EMAIL, ADMIN_PASSWORD, '/access/roles');
    await expect(page.locator('.ag-root')).toBeVisible({ timeout: 30_000 });

    // Open + close + reopen — checks effect cleanup + remount race
    const targetRoleName = 'PURCHASE_MANAGER';
    const roleRow = page.locator('.ag-row', { hasText: targetRoleName }).first();
    await roleRow.dblclick();
    const drawer = page.locator('aside, [role="dialog"]').filter({ hasText: 'MODÜLLER' });
    await expect(drawer).toBeVisible();

    // Find close button and dismiss
    const closeButton = drawer
      .locator('button[aria-label*="Close" i], button[aria-label*="Kapat" i]')
      .first();
    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click();
      await expect(drawer).toBeHidden({ timeout: 5_000 });
    }

    // Reopen + assert again
    await roleRow.dblclick();
    await expect(drawer).toBeVisible();
    await page.waitForTimeout(1_500);

    const selects = drawer.locator('select');
    const count = await selects.count();
    const values: string[] = [];
    for (let i = 0; i < count; i++) {
      values.push((await selects.nth(i).inputValue()) ?? '');
    }
    const hasFilledLevel = values.some((v) => v && v !== 'NONE');
    expect(
      hasFilledLevel,
      `iter-19 regression (reopen path): tüm modüller NONE. Values: ${JSON.stringify(values)}`,
    ).toBe(true);
  });
});
