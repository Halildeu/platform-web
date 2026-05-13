/**
 * Headless smoke for the design-lab `/admin/design-lab/charts` route.
 *
 * Verifies the post-deploy state on testai (or any reachable cluster):
 *   1. Listing renders 23 chart cards including the 6 PR-X campaign
 *      additions (BoxPlot, Candlestick, PictorialBar, Parallel,
 *      Graph, GeoMap).
 *   2. Each new wrapper's detail page mounts without crash (heading
 *      surface contains the chart name).
 *
 * Auth flow (Codex 019e2349 iter-1 absorb): direct localStorage token
 * injection does NOT complete the shell's
 * `transportReady + authorizationReady` chain. Instead the spec drives
 * a real browser SSO login through the shell's LoginPage button →
 * Keycloak form → callback, identical to the canonical
 * `performBrowserLogin` helper in `authz.explain-modal.stage.spec.ts`.
 *
 * Persona discipline (HARD RULE — Kullanıcı Aktif Credential'ına
 * Dokunma YASAK): the persona is hard-pinned to `d35-admin-persona`
 * (or `PW_REAL_USER_EMAIL` if it happens to be a non-admin smoke
 * persona). The spec refuses to log in as `admin@example.com` even
 * if the runner supplies that credential — the workflow validation
 * step rejects the override before the spec ever runs.
 *
 * Local invocation:
 *   ITER34_PASSWORD=… PLAYWRIGHT_BASE_URL=https://testai.acik.com \
 *     pnpm exec playwright test tests/playwright/x-charts-design-lab-23.spec.ts \
 *     --config tests/playwright/playwright.config.ts --project=chromium
 *
 * CI invocation: dispatched via `.github/workflows/design-lab-23-smoke.yml`.
 */
import { test, expect, type Page, type Locator } from '@playwright/test';

const NEW_SLUGS = [
  'box-plot-chart',
  'candlestick-chart',
  'pictorial-bar-chart',
  'parallel-coordinates-chart',
  'graph-chart',
  'geo-map',
] as const;

const NEW_NAMES = [
  'BoxPlotChart',
  'CandlestickChart',
  'PictorialBarChart',
  'ParallelCoordinatesChart',
  'GraphChart',
  'GeoMap',
] as const;

// Codex 019e2349 iter-2 absorb: blank-aware env reader. GitHub Actions
// `secrets.MISSING` expression collapses to an empty string instead of
// `undefined`, which would defeat the `??` nullish fallback and leave
// PASSWORD='' (then `test.skip(!PASSWORD)` would silently green the
// whole smoke). Trim + fall through on empty.
const readEnv = (name: string): string | undefined => {
  const raw = process.env[name];
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const USERNAME = readEnv('ITER34_USERNAME') ?? readEnv('PW_REAL_USER_EMAIL') ?? 'd35-admin-persona';
const PASSWORD = readEnv('ITER34_PASSWORD') ?? readEnv('PW_REAL_USER_PASSWORD') ?? '';

// HARD RULE persona guard: refuse anything that looks like the user's
// canonical login. The workflow validation step does the same gate
// before this spec runs; double-check here for defence in depth.
const FORBIDDEN_USERNAMES = new Set(['admin@example.com', 'gladyatore@hotmail.com']);
if (FORBIDDEN_USERNAMES.has(USERNAME.trim().toLowerCase())) {
  throw new Error(
    `[smoke] HARD RULE violation: refusing to authenticate as ${USERNAME}. Use d35-admin-persona or another test persona.`,
  );
}

const AUTH_STORAGE_KEYS = [
  'token',
  'user',
  'tokenExpiresAt',
  'shell_auth_state',
  'serban.shell.authState',
  'shell-auth-sync',
];

async function waitForFirstVisible(
  page: Page,
  selectors: string[],
  timeoutMs: number,
): Promise<Locator | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const sel of selectors) {
      const loc = page.locator(sel).first();
      if (await loc.isVisible().catch(() => false)) return loc;
    }
    await page.waitForTimeout(250);
  }
  return null;
}

async function fillFirst(page: Page, selectors: string[], value: string): Promise<boolean> {
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if (await loc.isVisible().catch(() => false)) {
      await loc.fill(value);
      return true;
    }
  }
  return false;
}

async function clickFirst(page: Page, selectors: string[]): Promise<boolean> {
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if (await loc.isVisible().catch(() => false)) {
      await loc.click();
      return true;
    }
  }
  return false;
}

async function performBrowserLogin(page: Page, root: string, redirectPath: string): Promise<void> {
  await page.context().clearCookies();
  // Persona drift guard: storage reset (cookie silme tek başına yetmiyor;
  // LoginPage initialized+token varsa Keycloak'a gitmiyor).
  await page.addInitScript((keys: string[]) => {
    try {
      keys.forEach((k) => {
        window.localStorage.removeItem(k);
        window.sessionStorage.removeItem(k);
      });
    } catch {
      /* ignore */
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
    const beforeClickUrl = page.url();
    await loginButton.click();
    await page
      .waitForURL(
        (url) => url.toString() !== beforeClickUrl || url.toString().includes('/realms/'),
        { timeout: 20_000 },
      )
      .catch(() => undefined);
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
    await fillFirst(page, kcUserSelectors, USERNAME);
    await fillFirst(page, kcPassSelectors, PASSWORD);
    await clickFirst(page, kcSubmitSelectors);
  }

  // After SSO callback the shell mounts the protected route. Wait until
  // we're back on the original `redirectPath` (or any /admin/* surface)
  // and the route content is interactive.
  await page
    .waitForURL((url) => /\/admin\//.test(url.toString()), { timeout: 30_000 })
    .catch(() => undefined);
}

test.describe('Design-lab charts listing — 23 wrappers (PR-X campaign closure)', () => {
  test.skip(!PASSWORD, 'ITER34_PASSWORD or PW_REAL_USER_PASSWORD env required for live probe');

  test('listing shows all 6 new PR-X campaign wrappers', async ({ page, baseURL }) => {
    const root = baseURL ?? 'http://localhost:3000';
    await performBrowserLogin(page, root, '/admin/design-lab/charts');
    // Listing renders buttons with `data-chart-slug` attribute — this is
    // the stable hook added to ChartsListing.tsx as part of this PR.
    await page.waitForSelector('[data-chart-slug]', { timeout: 60_000 });
    const slugs = await page
      .locator('[data-chart-slug]')
      .evaluateAll((nodes) =>
        nodes.map((n) => (n as HTMLElement).getAttribute('data-chart-slug') ?? ''),
      );
    const uniqueSlugs = Array.from(new Set(slugs)).filter(Boolean);
    expect(
      uniqueSlugs.length,
      `expected 23+ slugs; got ${uniqueSlugs.length}: ${uniqueSlugs.join(',')}`,
    ).toBeGreaterThanOrEqual(23);
    for (const slug of NEW_SLUGS) {
      expect(uniqueSlugs, `missing ${slug}`).toContain(slug);
    }
    for (const name of NEW_NAMES) {
      await expect(page.getByText(name, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    }
    await page.screenshot({ path: 'tests/output/design-lab-charts-23.png', fullPage: true });

    console.log(`[smoke] design-lab listing: ${uniqueSlugs.length} unique slugs`);
  });

  for (const slug of NEW_SLUGS) {
    test(`detail page for ${slug} mounts without crash`, async ({ page, baseURL }) => {
      const root = baseURL ?? 'http://localhost:3000';
      await performBrowserLogin(page, root, `/admin/design-lab/charts/${slug}`);
      // ChartDetail renders an h1 with the chart name (`{chart.name}`).
      // Match case-insensitive substring of the slug to accommodate
      // multi-word camelCase names (BoxPlotChart, GeoMap, etc.).
      const slugBare = slug.replace(/-/g, '').slice(0, 5);
      const heading = page.locator('h1, h2').filter({ hasText: new RegExp(slugBare, 'i') });
      await expect(heading.first()).toBeVisible({ timeout: 25_000 });
      await page.screenshot({ path: `tests/output/design-lab-${slug}.png`, fullPage: false });
    });
  }
});
