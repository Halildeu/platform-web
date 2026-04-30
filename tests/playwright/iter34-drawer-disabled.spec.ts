import { test, expect } from '@playwright/test';

/**
 * Codex 019dda1c iter-34 diagnostic — reproduce the screenshot bug:
 *   "Yetki ataması yapamıyorum kullanıcılara — drawer'da rol checkbox'ları
 *    cursor: not-allowed (disabled)."
 *
 * Run against staging-sw frontend (https://testai.acik.com) with a real
 * Keycloak direct-grant token for the d35-admin-persona TEST persona.
 * Critically: this is NOT the user's login user (admin@example.com); the
 * HARD RULE in CLAUDE.md forbids touching that account's password.
 *
 * What this spec proves:
 *  1. /v1/authz/me returns superAdmin: true for the test persona
 *  2. The drawer renders → assert role checkbox.disabled and cursor style
 *  3. If both backend says superAdmin=true AND drawer is disabled →
 *     production bundle bug (different from the dev source vitest covers).
 *     If both backend says superAdmin=true AND drawer is NOT disabled →
 *     user-side cache stale (hard reload fix), no code change needed.
 *
 * Required env:
 *   PLAYWRIGHT_BASE_URL=https://testai.acik.com
 *   ITER34_KEYCLOAK_URL=https://testai.acik.com  (default)
 *   ITER34_REALM=platform-test                   (default)
 *   ITER34_USERNAME=d35-admin-persona            (default)
 *   ITER34_PASSWORD=iter34CanaryProbe!           (set externally; never check in)
 */

const KC_URL = process.env.ITER34_KEYCLOAK_URL ?? 'https://testai.acik.com';
const REALM = process.env.ITER34_REALM ?? 'platform-test';
const CLIENT_ID = process.env.ITER34_CLIENT_ID ?? 'frontend';
const USERNAME = process.env.ITER34_USERNAME ?? 'd35-admin-persona';
const PASSWORD = process.env.ITER34_PASSWORD ?? '';

test.describe('iter-34 — drawer disabled bug', () => {
  test.skip(!PASSWORD, 'ITER34_PASSWORD env required for live probe');

  let token: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post(`${KC_URL}/realms/${REALM}/protocol/openid-connect/token`, {
      form: {
        client_id: CLIENT_ID,
        grant_type: 'password',
        username: USERNAME,
        password: PASSWORD,
      },
    });
    expect(res.ok(), `Keycloak token call failed: ${res.status()}`).toBeTruthy();
    const body = await res.json();
    token = body.access_token;
    expect(token, 'access_token missing').toBeTruthy();
  });

  test('backend /authz/me reports superAdmin:true for test persona', async ({
    request,
    baseURL,
  }) => {
    const res = await request.get(`${baseURL}/api/v1/authz/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    console.log('[iter-34] /authz/me payload:', JSON.stringify(body, null, 2));
    expect(body.superAdmin).toBe(true);
  });

  test('drawer renders with role checkboxes ENABLED for super-admin caller', async ({
    page,
    baseURL,
  }) => {
    // Capture every authz/me round-trip the frontend itself makes — the
    // request that PermissionProvider issues is what populates canEdit.
    const authzCalls: {
      url: string;
      status: number;
      hasAuthHeader: boolean;
      superAdmin?: unknown;
      bodyHead: string;
      ct?: string;
    }[] = [];
    page.on('response', async (resp) => {
      const url = resp.url();
      if (!url.includes('/api/v1/authz/me') && !url.includes('/api/v1/authz/version')) return;
      const req = resp.request();
      const reqHeaders = await req.allHeaders();
      const respHeaders = await resp.allHeaders();
      let bodyText = '';
      let parsed: unknown = null;
      try {
        bodyText = await resp.text();
        try {
          parsed = JSON.parse(bodyText);
        } catch {
          /* not json */
        }
      } catch {
        /* abort */
      }
      authzCalls.push({
        url,
        status: resp.status(),
        hasAuthHeader: Boolean(reqHeaders['authorization']),
        superAdmin: (parsed as { superAdmin?: unknown })?.superAdmin,
        bodyHead: bodyText.slice(0, 80),
        ct: respHeaders['content-type'],
        bodyLen: bodyText.length,
        etag: respHeaders['etag'],
        cacheControl: respHeaders['cache-control'],
        ifNoneMatch: reqHeaders['if-none-match'],
      } as any);
    });

    // Inject the real keycloak token into localStorage BEFORE app boot.
    // The shell reads `token` from localStorage as part of its auth bootstrap.
    await page.addInitScript((injected) => {
      window.localStorage.setItem('token', injected);
    }, token);

    // Step 1 — load the SPA root (this triggers PermissionProvider /authz/me).
    await page.goto(baseURL!);
    await page.waitForLoadState('domcontentloaded');

    // Step 2 — wait for the authz/me round-trip to finish so PermissionProvider
    // has populated the superAdmin flag before we navigate.
    const authzPromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/v1/authz/me') && resp.status() === 200,
      { timeout: 15_000 },
    );
    // Trigger a refresh in case the first load hit cached HTML before our token landed.
    await page.reload();
    await authzPromise;

    // Step 3 — navigate to the user-management grid.
    await page.goto(`${baseURL}/admin/users`);
    await page.waitForLoadState('domcontentloaded');

    // Step 4 — open the drawer via the row's actions menu (cell click does
    // NOT open the drawer; the "İşlemler" dropdown → "Detayı Görüntüle" item
    // is the trigger).
    const targetEmail = 'testuser@testai.acik.com';
    const emailCell = page.getByText(targetEmail, { exact: true });
    await expect(emailCell, `cell for ${targetEmail} not visible`).toBeVisible({ timeout: 30_000 });

    // AG Grid SSRM may pin the actions column to a separate viewport — the
    // button isn't always a DOM descendant of the row that contains the
    // email cell. Match by row-index instead: locate the row, read its
    // row-index attribute, then click the matching action button.
    const targetRow = page.locator('.ag-row').filter({ hasText: targetEmail }).first();
    await expect(targetRow).toBeVisible();
    const rowIndex = await targetRow.getAttribute('row-index');
    expect(rowIndex, 'AG Grid row-index attribute missing').not.toBeNull();

    const allActionRows = page.locator(`.ag-row[row-index="${rowIndex}"]`);
    const actionsButton = allActionRows.locator('button', { hasText: 'İşlemler' }).first();
    await expect(actionsButton).toBeVisible();
    await actionsButton.click();

    const viewItem = page.getByRole('button', { name: /Detay\s*ı\s*Görüntüle/i });
    await expect(viewItem).toBeVisible();
    await viewItem.click();

    // Step 5 — drawer should open with the role checkboxes.
    // Probe the first role checkbox that the drawer renders.
    const firstRoleCheckbox = page.locator('section:has(h3) input[type="checkbox"]').first();
    await expect(firstRoleCheckbox).toBeVisible({ timeout: 10_000 });

    // Step 6 — capture both DOM disabled attribute AND computed cursor style.
    const disabledAttr = await firstRoleCheckbox.evaluate(
      (el) => (el as HTMLInputElement).disabled,
    );
    const labelEl = firstRoleCheckbox.locator('xpath=ancestor::label').first();
    const cursorStyle = await labelEl.evaluate((el) => window.getComputedStyle(el).cursor);

    console.log('[iter-34] checkbox.disabled =', disabledAttr);
    console.log('[iter-34] label cursor =', cursorStyle);

    // Drill down — what does the live authz state look like INSIDE the page?
    const liveAuthzProbe = await page.evaluate(async () => {
      const tok = localStorage.getItem('token');
      try {
        const r = await fetch('/api/v1/authz/me', {
          headers: tok ? { Authorization: `Bearer ${tok}` } : {},
        });
        const body = r.ok ? await r.json() : null;
        return { status: r.status, superAdmin: body?.superAdmin, authzVersion: body?.authzVersion };
      } catch (e) {
        return { error: String(e) };
      }
    });
    console.log('[iter-34] live in-page /authz/me probe:', JSON.stringify(liveAuthzProbe));
    console.log('[iter-34] frontend-issued /authz traffic:');
    for (const c of authzCalls) {
      console.log(`  → ${c.status} ${c.url}`);
      const e = c as any;
      console.log(
        `    auth=${c.hasAuthHeader} ct=${c.ct} superAdmin=${c.superAdmin} len=${e.bodyLen}`,
      );
      console.log(`    etag=${e.etag} cacheControl=${e.cacheControl} ifNoneMatch=${e.ifNoneMatch}`);
      console.log(`    body[80]=${JSON.stringify(c.bodyHead)}`);
    }

    await page.screenshot({ path: 'iter34-drawer-state.png', fullPage: true });

    // The fix-or-no-fix decision rests on these two assertions:
    expect(disabledAttr, 'checkbox is disabled — drawer thinks caller cannot edit').toBe(false);
    expect(cursorStyle, 'cursor is not-allowed — drawer thinks caller cannot edit').not.toBe(
      'not-allowed',
    );
  });
});
