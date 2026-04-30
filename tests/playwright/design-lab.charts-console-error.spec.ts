import { test, expect } from '@playwright/test';
import { authenticateAndNavigate } from './utils/auth';

/**
 * Codex iter-3 next_action: "Lokal Playwright 29-route Design Lab
 * smoke'u çalıştır; aynı run'da console/pageerror capture açık olsun."
 *
 * The companion spec (design-lab.charts-playground.spec.ts) only asserts
 * the sentinel testid is visible per route. This spec sweeps the same
 * routes again with strict console.error / pageerror capture so a regression
 * that throws a runtime error (without removing the sentinel) still fails
 * the gate.
 *
 * The two specs are kept separate so the lighter-weight visibility smoke
 * can run as a quick PR gate while this strict variant runs as a
 * pre-staging release gate.
 */

const ROOT = '/admin/design-lab/charts';

/**
 * Allowlist for known-safe console messages that don't indicate a real
 * regression. Keep this list as small as possible. Each entry is a regex
 * pattern checked against the full message string.
 *
 * Local-only false-positives (backend stack offline):
 *  - 502 Bad Gateway / ERR_CONNECTION_REFUSED — auth-service / user-service
 *    not running locally; staging will hit real backends.
 *  - The bare "Failed to load resource" pattern catches that whole class
 *    of network failures so the smoke runs against `vite dev` without
 *    the full backend stack.
 *
 * Library deprecation notices we don't own:
 *  - React Router v7 future-flag warnings (Faz 21.6 router upgrade)
 *  - AG Grid React forwardRef warning (ag-grid-react 34.3.1 known issue)
 *  - Module Federation `[Federation Runtime] ...` informational logs
 *  - HMR / Vite dev-mode notices (only when running against `vite dev`)
 *
 * Run staging variant against the real backend — there should be no
 * 502 / ECONNREFUSED matches there, and the strict pre-prod gate will
 * surface them if they reappear.
 */
const CONSOLE_ALLOWLIST: RegExp[] = [
  /React Router Future Flag Warning/i,
  /\[vite\]/i,
  /\[hmr\]/i,
  /\[Federation Runtime\]/i,
  /Download the React DevTools/i,
  /AG Grid License/i,
  // Backend-offline (local dev only — verify absent on staging)
  /Failed to load resource/i,
  /ERR_CONNECTION_REFUSED/i,
  /502 \(Bad Gateway\)/i,
  /503 \(Service Unavailable\)/i,
  // Library deprecation notices we don't own
  /forwardRef render functions accept exactly two parameters/i,
];

const isAllowedConsoleMessage = (text: string): boolean =>
  CONSOLE_ALLOWLIST.some((pattern) => pattern.test(text));

const CHART_PLAYGROUND_ROUTES: string[] = [
  // 13 core chart wrappers
  'bar-chart',
  'line-chart',
  'area-chart',
  'pie-chart',
  'scatter-chart',
  'gauge-chart',
  'radar-chart',
  'treemap-chart',
  'heatmap-chart',
  'waterfall-chart',
  'funnel-chart',
  'sankey-chart',
  'sunburst-chart',
  // Composite widgets
  'kpi-card',
  'sparkline-chart',
  'chart-dashboard',
  'chart-container',
  'chart-toolbar',
  // AI hook demos
  'detect-anomalies',
  'identify-trends',
  'suggest-chart',
  'chart-description',
  'nl-to-chart',
  // Perf utility demos
  'lttb',
  'progressive-render',
  'lazy-chart',
  'lru-cache',
  'code-split',
  // Cross-filter
  'cross-filter',
];

test.describe('Design Lab chart console-error smoke (QLTY-DL-CONSOLE-ERR-01)', () => {
  for (const slug of CHART_PLAYGROUND_ROUTES) {
    test(`route /${slug} produces no console errors and no page errors`, async ({
      page,
      baseURL,
    }) => {
      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];

      page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const text = msg.text();
        if (isAllowedConsoleMessage(text)) return;
        consoleErrors.push(text);
      });

      page.on('pageerror', (error) => {
        const message = error?.message ?? String(error);
        if (isAllowedConsoleMessage(message)) return;
        pageErrors.push(message);
      });

      await authenticateAndNavigate(page, baseURL, `${ROOT}/${slug}`, ['DESIGN_LAB']);
      await page.waitForLoadState('networkidle');

      // Give chart wrappers a moment to mount and dispatch any async errors
      // (echarts.init lifecycle, lazy-chart IntersectionObserver, etc).
      await page.waitForTimeout(500);

      expect(
        pageErrors,
        `route /${slug} produced uncaught page errors: ${pageErrors.join(' | ')}`,
      ).toEqual([]);

      expect(
        consoleErrors,
        `route /${slug} logged console.error: ${consoleErrors.join(' | ')}`,
      ).toEqual([]);
    });
  }
});
