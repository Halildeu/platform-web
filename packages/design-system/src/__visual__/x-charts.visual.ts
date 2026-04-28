import { test, expect } from '@playwright/test';

/* ------------------------------------------------------------------ */
/*  Visual Regression — @mfe/x-charts (K5 baseline)                    */
/*                                                                     */
/*  Snapshots the 13 real chart components rendered through the        */
/*  Storybook AllChartTypes story (charts-all-chart-types--{name}).    */
/*                                                                     */
/*  Per-test timeout 120s (per chart) — Storybook static build serves  */
/*  pre-compiled bundles, but cold cache + chart library init still    */
/*  needs headroom on the slowest CI runner.                           */
/*                                                                     */
/*  Mode: advisory — failures do not block merges in the K5 sprint.    */
/*  Hard gate planned for a follow-up sprint after baseline soak.      */
/*                                                                     */
/*  Baseline regeneration (Linux only — see workflow):                 */
/*    gh workflow run x-charts-visual-advisory.yml                     */
/*    gh run download <run-id> -n x-charts-linux-baseline              */
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

async function openStory(page: import('@playwright/test').Page, storyId: string, chartId: string) {
  // Reduced motion BEFORE goto — chart libraries (ECharts) honor this for
  // their own animation pipeline; CSS animation override (below) handles
  // the rest. Both are needed for deterministic screenshots.
  await page.emulateMedia({ reducedMotion: 'reduce' });

  // 'load' instead of 'networkidle' — Storybook keeps HMR/SSE channels
  // open in dev mode; static build is fine but 'load' is the correct
  // semantic for a single iframe page in either mode.
  await page.goto(`${STORYBOOK_BASE}/iframe.html?id=${storyId}&viewMode=story`, {
    waitUntil: 'load',
    timeout: 60_000,
  });

  // Belt-and-suspenders: also disable transitions/animations via CSS.
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        transition: none !important;
        animation: none !important;
      }
    `,
  });

  // Wait for the chart's wrapper data-testid (set in the story file)
  // before we try to screenshot anything. This is the real readiness
  // signal — Storybook root being attached doesn't mean the story has
  // mounted, let alone that the chart container has rendered.
  const wrapper = page.getByTestId(`x-charts-${chartId}`);
  await wrapper.waitFor({ state: 'visible', timeout: 60_000 });

  // Wait for the chart's primary surface (canvas or svg) to exist with
  // non-zero dimensions. ECharts uses canvas; some chart types use svg.
  await page.waitForFunction(
    (testId) => {
      const el = document.querySelector(`[data-testid="${testId}"]`);
      if (!el) return false;
      const surface = el.querySelector('canvas, svg');
      if (!surface) return false;
      const rect = surface.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    },
    `x-charts-${chartId}`,
    { timeout: 60_000 },
  );

  // Final settle to absorb any one-frame layout reflow after first paint.
  await page.waitForTimeout(500);
}

test.describe('x-charts visual baseline', () => {
  // Per-test timeout — config global is 30s which is too tight for
  // chart init + first-paint settle even on a static build.
  test.describe.configure({ timeout: 120_000 });

  for (const { id, label } of CHART_STORIES) {
    test(`x-charts ${label}`, async ({ page }) => {
      await openStory(page, `charts-all-chart-types--${id}`, id);

      // Screenshot only the chart wrapper, not the Storybook chrome.
      const wrapper = page.getByTestId(`x-charts-${id}`);
      await expect(wrapper).toHaveScreenshot(`${id}.png`, {
        maxDiffPixelRatio: 0.02,
      });
    });
  }
});
