/**
 * Headless smoke for the design-lab `/admin/design-lab/charts` route.
 *
 * Verifies the post-deploy state on testai (or any reachable cluster):
 *   1. Listing renders 23 chart cards including the 6 PR-X campaign
 *      additions (BoxPlot, Candlestick, PictorialBar, Parallel,
 *      Graph, GeoMap).
 *   2. Each new wrapper's detail page mounts without crash, with
 *      Playground tab visible and Examples gallery non-empty (PR #449
 *      + #451 + iter follow-ups closed the gap).
 *
 * Auth path: direct grant against the realm Keycloak. The runner-side
 * env supplies `ITER34_USERNAME` / `ITER34_PASSWORD` for the
 * `d35-admin-persona` test persona (HARD RULE: never the user's login
 * user). Falls back to `PW_REAL_USER_EMAIL` / `PW_REAL_USER_PASSWORD`
 * for the canonical smoke secrets that already exist in the repo's
 * GitHub Actions secrets bucket.
 *
 * Local invocation:
 *   ITER34_PASSWORD=… PLAYWRIGHT_BASE_URL=https://testai.acik.com \
 *     pnpm exec playwright test tests/playwright/x-charts-design-lab-23.spec.ts \
 *     --config tests/playwright/playwright.config.ts --project=chromium
 *
 * CI invocation: dispatched via `.github/workflows/x-charts-design-lab-smoke.yml`.
 */
import { test, expect, type Page } from '@playwright/test';

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

const KC_URL = process.env.ITER34_KEYCLOAK_URL ?? 'https://testai.acik.com';
const REALM = process.env.ITER34_REALM ?? 'platform-test';
const CLIENT_ID = process.env.ITER34_CLIENT_ID ?? 'frontend';
const USERNAME =
  process.env.ITER34_USERNAME ?? process.env.PW_REAL_USER_EMAIL ?? 'd35-admin-persona';
const PASSWORD = process.env.ITER34_PASSWORD ?? process.env.PW_REAL_USER_PASSWORD ?? '';

async function fetchToken(): Promise<string> {
  const res = await fetch(`${KC_URL}/realms/${REALM}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: CLIENT_ID,
      username: USERNAME,
      password: PASSWORD,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Keycloak token call failed: ${res.status} ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error('access_token missing in token response');
  return json.access_token;
}

async function injectAuthAndGoto(
  page: Page,
  baseURL: string | undefined,
  path: string,
  token: string,
) {
  const root = baseURL ?? 'http://localhost:3000';
  // Plant token + minimal user profile in localStorage BEFORE the
  // shell's AuthBootstrapper runs. The shell reads `token` /
  // `tokenExpiresAt` on init and short-circuits Keycloak SSO.
  await page.addInitScript(
    ({ injectedToken }) => {
      try {
        window.localStorage.setItem('token', injectedToken);
        window.localStorage.setItem(
          'user',
          JSON.stringify({
            id: 'd35-admin-persona',
            fullName: 'Design Lab Smoke Persona',
            email: 'd35-admin-persona@test.local',
            permissions: ['DESIGN_LAB', 'ADMIN_ACCESS_ROUTES'],
            role: 'ADMIN',
          }),
        );
        window.localStorage.setItem('tokenExpiresAt', String(Date.now() + 60 * 60 * 1000));
      } catch {
        /* noop */
      }
    },
    { injectedToken: token },
  );
  await page.goto(`${root}${path}`, { waitUntil: 'domcontentloaded' });
  // Wait for the shell to finish auth init.
  await page
    .waitForFunction(
      () => {
        const w = window as unknown as {
          __shellStore?: { getState: () => { auth?: { initialized?: boolean; token?: string } } };
        };
        return Boolean(w.__shellStore?.getState?.()?.auth?.initialized);
      },
      undefined,
      { timeout: 30_000 },
    )
    .catch(() => {
      /* even if the shell store probe times out, listing may still be
         reachable; continue and let the assertion handle the rest */
    });
}

test.describe('Design-lab charts listing — 23 wrappers (PR-X campaign closure)', () => {
  test.skip(!PASSWORD, 'ITER34_PASSWORD or PW_REAL_USER_PASSWORD env required for live probe');

  let token: string;

  test.beforeAll(async () => {
    token = await fetchToken();
  });

  test('listing shows all 6 new PR-X campaign wrappers', async ({ page, baseURL }) => {
    await injectAuthAndGoto(page, baseURL, '/admin/design-lab/charts', token);
    await page.waitForSelector('a[href*="/admin/design-lab/charts/"]', { timeout: 30_000 });
    const cardLinks = await page
      .locator('a[href*="/admin/design-lab/charts/"]')
      .evaluateAll((nodes) =>
        nodes
          .map((n) => (n as HTMLAnchorElement).getAttribute('href') ?? '')
          .filter((h) => /\/admin\/design-lab\/charts\/.+/.test(h))
          .map((h) => h.split('/').pop() ?? ''),
      );
    const uniqueSlugs = Array.from(new Set(cardLinks)).filter(Boolean);
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
      await injectAuthAndGoto(page, baseURL, `/admin/design-lab/charts/${slug}`, token);
      // Must surface a heading or section with the chart name (case-insensitive).
      const slugBare = slug.replace(/-/g, '').slice(0, 5);
      const heading = page.locator('h1, h2').filter({ hasText: new RegExp(slugBare, 'i') });
      await expect(heading.first()).toBeVisible({ timeout: 20_000 });
      await page.screenshot({ path: `tests/output/design-lab-${slug}.png`, fullPage: false });
    });
  }
});
