import { test, expect } from '@playwright/test';

/* ------------------------------------------------------------------ */
/*  Visual Regression — @mfe/x-charts (K5 baseline)                    */
/*                                                                     */
/*  Snapshots the 13 real chart components rendered through the        */
/*  Storybook AllChartTypes story (charts-all-chart-types--{name}).    */
/*                                                                     */
/*  Mode: advisory — failures do not block merges in the K5 sprint.    */
/*  Hard gate planned for a follow-up sprint after baseline soak.      */
/*                                                                     */
/*  Baseline run:                                                      */
/*    pnpm exec playwright test \                                       */
/*      --config packages/design-system/playwright.config.ts \         */
/*      --project=desktop-light \                                      */
/*      --grep "x-charts" \                                            */
/*      --update-snapshots                                             */
/* ------------------------------------------------------------------ */

const STORYBOOK_BASE = 'http://localhost:6006';

const CHART_STORIES: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'bar-chart', label: 'BarChart' },
  { id: 'line-chart', label: 'LineChart' },
  { id: 'area-chart', label: 'AreaChart' },
  { id: 'pie-chart', label: 'PieChart' },
  { id: 'scatter-chart', label: 'ScatterChart' },
  { id: 'gauge-chart', label: 'GaugeChart' },
  { id: 'radar-chart', label: 'RadarChart' },
  { id: 'treemap-chart', label: 'TreemapChart' },
  { id: 'heatmap-chart', label: 'HeatmapChart' },
  { id: 'waterfall-chart', label: 'WaterfallChart' },
  { id: 'funnel-chart', label: 'FunnelChart' },
  { id: 'sankey-chart', label: 'SankeyChart' },
  { id: 'sunburst-chart', label: 'SunburstChart' },
];

async function openStory(page: import('@playwright/test').Page, storyId: string) {
  // 'load' instead of 'networkidle' — Storybook keeps HMR/SSE channels open
  // and never reaches network idle, which would always trigger a timeout.
  await page.goto(`${STORYBOOK_BASE}/iframe.html?id=${storyId}&viewMode=story`, {
    waitUntil: 'load',
    timeout: 60_000,
  });
  // Wait for the story root to be present (Storybook renders inside #storybook-root)
  await page.waitForSelector('#storybook-root', { state: 'attached', timeout: 30_000 });
  // Disable transitions/animations to keep snapshots deterministic
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        transition: none !important;
        animation: none !important;
      }
    `,
  });
  // Final settle before screenshot (chart libraries finish initial paint)
  await page.waitForTimeout(1000);
}

test.describe('x-charts visual baseline', () => {
  for (const { id, label } of CHART_STORIES) {
    test(`x-charts ${label}`, async ({ page }) => {
      await openStory(page, `charts-all-chart-types--${id}`);
      await expect(page).toHaveScreenshot(`${id}.png`, {
        fullPage: false,
        maxDiffPixelRatio: 0.02,
      });
    });
  }
});
