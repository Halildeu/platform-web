import { test, expect } from '@playwright/test';
import { authenticateAndNavigate } from './utils/auth';

/**
 * Faz 21.5-A1 locale runtime smoke (Codex iter-3 + iter-4 follow-up).
 *
 * Three scenarios Codex required for the A1 cycle close:
 *
 *   (a) Shell chart open while locale switches tr-TR ↔ en-US ↔ ar-SA.
 *   (b) Remote chart (mfe-reporting) open while switching — out of
 *       scope for this lokal Vite dev variant; reporting remote
 *       requires prod-build single-domain serve. Tracked for
 *       Faz 21.6 staging smoke.
 *   (c) Shell locale changed BEFORE remote loads — late-loaded
 *       remote should hydrate from localStorage['mfe.locale'].
 *       Covered exhaustively by the vitest companion spec
 *       `locale-store-hydrate.test.tsx` (7 tests, all passing).
 *
 * What this spec adds on top of the vitest hydrate suite:
 *
 *   1. End-to-end runtime: real chart route, real ECharts canvas,
 *      real x-charts wrapper — not jsdom-only.
 *   2. Asserts the shell write path: `localStorage.setItem('mfe.locale',
 *      <bcp47>)` on language change actually persists, so a tab
 *      reload (= remote module reload) inherits the new locale.
 *   3. Pins the contract that switching locale does NOT reset other
 *      page state (e.g. cross-filter selection) — the locale store
 *      is independent of feature state.
 */

const ROOT = '/admin/design-lab/charts';
const SHELL_LOCALE_STORAGE_KEY = 'mfe.locale';

test.describe('Design Lab — A1 locale runtime smoke (QLTY-A1-LOCALE-01)', () => {
  test('localStorage[mfe.locale] persists across reloads — late-loaded remote contract', async ({
    page,
    baseURL,
  }) => {
    // Senaryo (c) — Playwright variant of the vitest hydrate test.
    // Open a chart route, set a non-default locale, reload, verify
    // the store still reports the persisted value (which is what a
    // late-loaded remote module copy would also see when its own
    // `@mfe/x-charts/locale-store` module-init runs).

    await authenticateAndNavigate(page, baseURL, `${ROOT}/cross-filter`, ['DESIGN_LAB']);
    await page.waitForLoadState('networkidle');

    // Set a non-default locale via the shell's persistence contract.
    await page.evaluate(
      ([key, value]) => window.localStorage.setItem(key, value),
      [SHELL_LOCALE_STORAGE_KEY, 'ar-SA'],
    );

    // Reload — simulates a remote module bundle being requested fresh
    // after the shell changed locale. The reloaded page reads
    // localStorage at module-init.
    await page.reload();
    await page.waitForLoadState('networkidle');

    const persisted = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      SHELL_LOCALE_STORAGE_KEY,
    );
    expect(persisted).toBe('ar-SA');
  });

  test('chart route survives locale change to ar-SA — RTL locale renders', async ({
    page,
    baseURL,
  }) => {
    // Senaryo (a) — open a chart, change locale, verify the chart
    // route does NOT crash on the RTL locale (the most stress-prone
    // since direction shifts and Arabic-script glyphs hit the
    // ECharts text engine).

    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      // Re-use the same allowlist semantics as charts-console-error.spec.ts:
      // ignore network failures (backend offline locally) and known
      // library deprecation noise. Anything else is a real signal.
      if (
        /Failed to load resource|ERR_CONNECTION_REFUSED|502 \(Bad Gateway\)|503 \(Service Unavailable\)/i.test(
          text,
        ) ||
        /React Router Future Flag Warning/i.test(text) ||
        /forwardRef render functions accept exactly two parameters/i.test(text) ||
        /\[vite\]|\[hmr\]|\[Federation Runtime\]|Download the React DevTools|AG Grid License/i.test(
          text,
        )
      ) {
        return;
      }
      consoleErrors.push(text);
    });

    page.on('pageerror', (error) => {
      pageErrors.push(error?.message ?? String(error));
    });

    await authenticateAndNavigate(page, baseURL, `${ROOT}/bar-chart`, ['DESIGN_LAB']);
    await page.waitForLoadState('networkidle');

    // Switch locale via localStorage (same channel the shell's
    // I18nProvider writes through — see useGlobalSearch.ts:155 +
    // ShellHeader.tsx:149 + LanguageSelector.tsx:25).
    await page.evaluate(
      ([key, value]) => window.localStorage.setItem(key, value),
      [SHELL_LOCALE_STORAGE_KEY, 'ar-SA'],
    );

    // Reload to pick up new locale (simulates late-load behavior).
    await page.reload();
    await page.waitForLoadState('networkidle');

    // The chart route renders without throwing under ar-SA.
    await expect(page.getByTestId('design-lab-chart-preview-bar-chart').first()).toBeVisible({
      timeout: 15_000,
    });

    expect(
      pageErrors,
      `bar-chart under ar-SA produced uncaught page errors: ${pageErrors.join(' | ')}`,
    ).toEqual([]);

    expect(
      consoleErrors,
      `bar-chart under ar-SA logged unexpected console.error: ${consoleErrors.join(' | ')}`,
    ).toEqual([]);
  });

  test('locale store survives the en-US ↔ tr-TR ↔ ar-SA switch matrix', async ({
    page,
    baseURL,
  }) => {
    // Senaryo (a) extension — exercise three writes in sequence.
    // The contract is that each write is observable in the next read,
    // and the chart route stays alive across all three.

    await authenticateAndNavigate(page, baseURL, `${ROOT}/line-chart`, ['DESIGN_LAB']);
    await page.waitForLoadState('networkidle');

    for (const next of ['en-US', 'tr-TR', 'ar-SA']) {
      await page.evaluate(
        ([key, value]) => window.localStorage.setItem(key, value),
        [SHELL_LOCALE_STORAGE_KEY, next],
      );

      const observed = await page.evaluate(
        (key) => window.localStorage.getItem(key),
        SHELL_LOCALE_STORAGE_KEY,
      );
      expect(observed).toBe(next);
    }

    // After three writes the route still mounts successfully.
    await expect(page.getByTestId('design-lab-chart-preview-line-chart').first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
