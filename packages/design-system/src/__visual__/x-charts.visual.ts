import { test, expect } from '@playwright/test';

/* ------------------------------------------------------------------ */
/*  Visual Regression — @mfe/x-charts (K5 baseline)                    */
/*                                                                     */
/*  Snapshots:                                                          */
/*    - 13 atomic charts via charts-all-chart-types--{name}             */
/*    - 3 KPICard variants via x-charts-kpicard--{name}                 */
/*    - 2 ChartDashboard composites via x-charts-chartdashboard--{name} */
/*  → 18 stories × N browsers (config defines 3: chromium/firefox/webkit) */
/*                                                                     */
/*  Per-test timeout 120s — Storybook static build serves pre-compiled  */
/*  bundles, but cold cache + chart library init still needs headroom   */
/*  on the slowest CI runner.                                           */
/*                                                                     */
/*  Hard gate (post-PR #56). Recovery: regenerate Linux baseline via    */
/*    gh workflow run x-charts-visual-gate.yml -f mode=baseline     */
/*    gh run download <run-id> -n x-charts-linux-baseline               */
/*  then commit the artifact contents.                                  */
/* ------------------------------------------------------------------ */

const STORYBOOK_BASE = 'http://localhost:6006';

interface VisualStory {
  storyId: string; // Storybook story id (URL fragment)
  testId: string; // wrapper data-testid suffix (also snapshot file basename)
  label: string; // human-readable test name
  /** Some composites render only DOM (no canvas/svg); skip the geometry guard then. */
  hasChartSurface?: boolean;
}

const ATOMIC_CHARTS: ReadonlyArray<VisualStory> = [
  {
    storyId: 'charts-all-chart-types--bar-chart',
    testId: 'bar-chart',
    label: 'BarChart',
    hasChartSurface: true,
  },
  {
    storyId: 'charts-all-chart-types--line-chart',
    testId: 'line-chart',
    label: 'LineChart',
    hasChartSurface: true,
  },
  {
    storyId: 'charts-all-chart-types--area-chart',
    testId: 'area-chart',
    label: 'AreaChart',
    hasChartSurface: true,
  },
  {
    storyId: 'charts-all-chart-types--pie-chart',
    testId: 'pie-chart',
    label: 'PieChart',
    hasChartSurface: true,
  },
  {
    storyId: 'charts-all-chart-types--scatter-chart',
    testId: 'scatter-chart',
    label: 'ScatterChart',
    hasChartSurface: true,
  },
  {
    storyId: 'charts-all-chart-types--gauge-chart',
    testId: 'gauge-chart',
    label: 'GaugeChart',
    hasChartSurface: true,
  },
  {
    storyId: 'charts-all-chart-types--radar-chart',
    testId: 'radar-chart',
    label: 'RadarChart',
    hasChartSurface: true,
  },
  {
    storyId: 'charts-all-chart-types--treemap-chart',
    testId: 'treemap-chart',
    label: 'TreemapChart',
    hasChartSurface: true,
  },
  {
    storyId: 'charts-all-chart-types--heatmap-chart',
    testId: 'heatmap-chart',
    label: 'HeatmapChart',
    hasChartSurface: true,
  },
  {
    storyId: 'charts-all-chart-types--waterfall-chart',
    testId: 'waterfall-chart',
    label: 'WaterfallChart',
    hasChartSurface: true,
  },
  {
    storyId: 'charts-all-chart-types--funnel-chart',
    testId: 'funnel-chart',
    label: 'FunnelChart',
    hasChartSurface: true,
  },
  {
    storyId: 'charts-all-chart-types--sankey-chart',
    testId: 'sankey-chart',
    label: 'SankeyChart',
    hasChartSurface: true,
  },
  {
    storyId: 'charts-all-chart-types--sunburst-chart',
    testId: 'sunburst-chart',
    label: 'SunburstChart',
    hasChartSurface: true,
  },
];

const COMPOSITE_STORIES: ReadonlyArray<VisualStory> = [
  // KPICard — Default has no chart surface; WithChart embeds SparklineChart
  { storyId: 'x-charts-kpicard--default', testId: 'kpicard-default', label: 'KPICard Default' },
  {
    storyId: 'x-charts-kpicard--with-trend',
    testId: 'kpicard-with-trend',
    label: 'KPICard WithTrend',
  },
  {
    storyId: 'x-charts-kpicard--with-chart',
    testId: 'kpicard-with-chart',
    label: 'KPICard WithChart',
    hasChartSurface: true,
  },
  // ChartDashboard — FourColumnKPIs embeds 4 sparklines; StatWidgets is DOM-only
  {
    storyId: 'x-charts-chartdashboard--four-column-kp-is',
    testId: 'chartdashboard-four-column-kpis',
    label: 'ChartDashboard FourColumnKPIs',
    hasChartSurface: true,
  },
  {
    storyId: 'x-charts-chartdashboard--stat-widgets',
    testId: 'chartdashboard-stat-widgets',
    label: 'ChartDashboard StatWidgets',
  },
];

const ALL_STORIES = [...ATOMIC_CHARTS, ...COMPOSITE_STORIES];

async function openStory(page: import('@playwright/test').Page, story: VisualStory) {
  // Reduced motion BEFORE goto — chart libraries (ECharts) honor this for
  // their own animation pipeline; CSS animation override (below) handles
  // the rest. Both are needed for deterministic screenshots.
  await page.emulateMedia({ reducedMotion: 'reduce' });

  // 'load' instead of 'networkidle' — Storybook keeps HMR/SSE channels
  // open in dev mode; static build is fine but 'load' is the correct
  // semantic for a single iframe page in either mode.
  await page.goto(`${STORYBOOK_BASE}/iframe.html?id=${story.storyId}&viewMode=story`, {
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

  // Wait for the wrapper data-testid set in the story file.
  const wrapper = page.getByTestId(`x-charts-${story.testId}`);
  await wrapper.waitFor({ state: 'visible', timeout: 60_000 });

  // For chart-bearing stories also wait for the canvas/svg surface to
  // exist with non-zero dimensions. ECharts uses canvas; some chart types
  // use svg. DOM-only composites (StatWidgets, KPICard Default/WithTrend)
  // skip this guard.
  if (story.hasChartSurface) {
    await page.waitForFunction(
      (testId) => {
        const el = document.querySelector(`[data-testid="${testId}"]`);
        if (!el) return false;
        const surface = el.querySelector('canvas, svg');
        if (!surface) return false;
        const rect = surface.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      },
      `x-charts-${story.testId}`,
      { timeout: 60_000 },
    );
  }

  // Final settle to absorb any one-frame layout reflow after first paint.
  await page.waitForTimeout(500);
}

test.describe('x-charts visual baseline', () => {
  // Per-test timeout — config global is 30s which is too tight for
  // chart init + first-paint settle even on a static build.
  test.describe.configure({ timeout: 120_000 });

  for (const story of ALL_STORIES) {
    test(`x-charts ${story.label}`, async ({ page }) => {
      await openStory(page, story);

      // Screenshot only the wrapper, not the Storybook chrome.
      const wrapper = page.getByTestId(`x-charts-${story.testId}`);
      await expect(wrapper).toHaveScreenshot(`${story.testId}.png`, {
        maxDiffPixelRatio: 0.02,
      });
    });
  }
});
