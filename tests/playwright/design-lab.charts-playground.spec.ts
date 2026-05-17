import { test, expect } from '@playwright/test';
import { authenticateAndNavigate } from './utils/auth';

/**
 * E2E smoke for the Design Lab chart playground (Faz 21.4-A + 21.4-B + B2).
 *
 * Verifies that the routes restored / added in those PRs each render a
 * real x-charts component (or the CrossFilterDemoLive widget) instead of
 * the previous SVG `ChartPreviewPlaceholder`. Click-level interaction
 * lives in the unit tests (CrossFilterDemoLive.test.tsx + ChartPreviewLive
 * .test.tsx) — this spec only asserts that the routes resolve and the
 * sentinel testids appear in the DOM.
 */

const ROOT = '/admin/design-lab/charts';

/**
 * Codex iter-2 B4 absorbu: spec previously covered only 4 of the 13
 * core chart wrappers (bar/line/pie/gauge). The 9 chart wrappers below
 * (area/scatter/radar/treemap/heatmap/waterfall/funnel/sankey/sunburst)
 * also have ChartPreviewLive switch entries and design-lab routes,
 * so smoke must include them. Without these the regression gate
 * misses 9 of the 13 charts the playground claims to host.
 */
const CHART_PLAYGROUND_ROUTES: Array<{ slug: string; previewTestId: string }> = [
  // 13 core chart wrappers
  { slug: 'bar-chart', previewTestId: 'design-lab-chart-preview-bar-chart' },
  { slug: 'line-chart', previewTestId: 'design-lab-chart-preview-line-chart' },
  { slug: 'area-chart', previewTestId: 'design-lab-chart-preview-area-chart' },
  { slug: 'pie-chart', previewTestId: 'design-lab-chart-preview-pie-chart' },
  { slug: 'scatter-chart', previewTestId: 'design-lab-chart-preview-scatter-chart' },
  { slug: 'gauge-chart', previewTestId: 'design-lab-chart-preview-gauge-chart' },
  { slug: 'radar-chart', previewTestId: 'design-lab-chart-preview-radar-chart' },
  { slug: 'treemap-chart', previewTestId: 'design-lab-chart-preview-treemap-chart' },
  { slug: 'heatmap-chart', previewTestId: 'design-lab-chart-preview-heatmap-chart' },
  { slug: 'waterfall-chart', previewTestId: 'design-lab-chart-preview-waterfall-chart' },
  { slug: 'funnel-chart', previewTestId: 'design-lab-chart-preview-funnel-chart' },
  { slug: 'sankey-chart', previewTestId: 'design-lab-chart-preview-sankey-chart' },
  { slug: 'sunburst-chart', previewTestId: 'design-lab-chart-preview-sunburst-chart' },
  // PR-X16a (Codex thread 019e32da) — ECharts Depth campaign hierarchical tree.
  { slug: 'tree-chart', previewTestId: 'design-lab-chart-preview-tree-chart' },
  // PR-X16b (Codex thread 019e33a9) — ECharts Depth campaign calendar heatmap.
  { slug: 'calendar-heatmap', previewTestId: 'design-lab-chart-preview-calendar-heatmap' },
  // PR-X16c (Codex thread 019e35b3) — ECharts Depth campaign polar chart.
  { slug: 'polar-chart', previewTestId: 'design-lab-chart-preview-polar-chart' },
  // PR-X16d (Codex thread 019e3615) — ECharts Depth campaign theme-river chart.
  { slug: 'theme-river-chart', previewTestId: 'design-lab-chart-preview-theme-river-chart' },
  // PR-X16e (Codex thread 019e365b) — ECharts Depth campaign gantt chart.
  { slug: 'gantt-chart', previewTestId: 'design-lab-chart-preview-gantt-chart' },
  // Composite widgets (PR-B series)
  { slug: 'kpi-card', previewTestId: 'design-lab-chart-preview-kpi-card' },
  { slug: 'sparkline-chart', previewTestId: 'design-lab-chart-preview-sparkline-chart' },
  { slug: 'chart-dashboard', previewTestId: 'design-lab-chart-preview-chart-dashboard' },
  { slug: 'chart-container', previewTestId: 'design-lab-chart-preview-chart-container' },
  { slug: 'chart-toolbar', previewTestId: 'design-lab-chart-preview-chart-toolbar' },
  // AI hook demos (PR-B3)
  { slug: 'detect-anomalies', previewTestId: 'design-lab-chart-preview-detect-anomalies' },
  { slug: 'identify-trends', previewTestId: 'design-lab-chart-preview-identify-trends' },
  { slug: 'suggest-chart', previewTestId: 'design-lab-chart-preview-suggest-chart' },
  { slug: 'chart-description', previewTestId: 'design-lab-chart-preview-chart-description' },
  { slug: 'nl-to-chart', previewTestId: 'design-lab-chart-preview-nl-to-chart' },
  // Perf utility demos (PR-B4)
  { slug: 'lttb', previewTestId: 'design-lab-chart-preview-lttb' },
  { slug: 'progressive-render', previewTestId: 'design-lab-chart-preview-progressive-render' },
  { slug: 'lazy-chart', previewTestId: 'design-lab-chart-preview-lazy-chart' },
  { slug: 'lru-cache', previewTestId: 'design-lab-chart-preview-lru-cache' },
  { slug: 'code-split', previewTestId: 'design-lab-chart-preview-code-split' },
];

test.describe('Design Lab chart playground (QLTY-DL-CHART-PLAYGROUND-01)', () => {
  for (const { slug, previewTestId } of CHART_PLAYGROUND_ROUTES) {
    test(`route /${slug} renders the live preview sentinel`, async ({ page, baseURL }) => {
      await authenticateAndNavigate(page, baseURL, `${ROOT}/${slug}`, ['DESIGN_LAB']);
      await page.waitForLoadState('networkidle');

      await expect(page.getByTestId(previewTestId).first()).toBeVisible({
        timeout: 15_000,
      });
    });
  }

  test('cross-filter route mounts the linked-chart demo with both panels', async ({
    page,
    baseURL,
  }) => {
    await authenticateAndNavigate(page, baseURL, `${ROOT}/cross-filter`, ['DESIGN_LAB']);
    await page.waitForLoadState('networkidle');

    // The wrapper testid the page-level switch case attaches.
    await expect(page.getByTestId('design-lab-chart-preview-cross-filter')).toBeVisible({
      timeout: 15_000,
    });

    // The CrossFilterDemoLive root element from the widget.
    const demoRoot = page.getByTestId('cross-filter-demo');
    await expect(demoRoot).toBeVisible({ timeout: 10_000 });

    // Both panels mount with their initial unfiltered totals (31800).
    await expect(demoRoot.getByTestId('cross-filter-region-total')).toHaveText('31800', {
      timeout: 10_000,
    });
    await expect(demoRoot.getByTestId('cross-filter-category-total')).toHaveText('31800', {
      timeout: 10_000,
    });

    // No filter badges before any interaction.
    await expect(demoRoot.getByTestId('cross-filter-region-badge')).toHaveCount(0);
    await expect(demoRoot.getByTestId('cross-filter-category-badge')).toHaveCount(0);

    // Reset button should be present and enabled.
    await expect(demoRoot.getByTestId('cross-filter-reset')).toBeEnabled();
  });

  test('detect-anomalies route runs the helper and populates the result on click', async ({
    page,
    baseURL,
  }) => {
    await authenticateAndNavigate(page, baseURL, `${ROOT}/detect-anomalies`, ['DESIGN_LAB']);
    await page.waitForLoadState('networkidle');

    const result = page.getByTestId('ai-detect-anomalies-result-content');
    await expect(result).toBeVisible({ timeout: 15_000 });
    await expect(result).toHaveAttribute('data-empty', 'true');

    await page.getByTestId('ai-detect-anomalies-run').click();
    await expect(result).toHaveAttribute('data-empty', 'false', { timeout: 5_000 });
    await expect(result).toContainText('"value": 95');
  });

  test('chart-toolbar route exposes the interactions state panel', async ({ page, baseURL }) => {
    await authenticateAndNavigate(page, baseURL, `${ROOT}/chart-toolbar`, ['DESIGN_LAB']);
    await page.waitForLoadState('networkidle');

    // The state inspector underneath the toolbar prints the current zoom
    // level and brush range. Initial zoom level is 1 with no brush.
    const stateInspector = page.getByTestId('chart-toolbar-state').first();
    await expect(stateInspector).toBeVisible({ timeout: 15_000 });
    await expect(stateInspector).toContainText('zoomLevel: 1');
    await expect(stateInspector).toContainText('brush: —');
  });
});
