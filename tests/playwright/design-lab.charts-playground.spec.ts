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

const CHART_PLAYGROUND_ROUTES: Array<{ slug: string; previewTestId: string }> = [
  { slug: 'bar-chart', previewTestId: 'design-lab-chart-preview-bar-chart' },
  { slug: 'line-chart', previewTestId: 'design-lab-chart-preview-line-chart' },
  { slug: 'pie-chart', previewTestId: 'design-lab-chart-preview-pie-chart' },
  { slug: 'gauge-chart', previewTestId: 'design-lab-chart-preview-gauge-chart' },
  { slug: 'kpi-card', previewTestId: 'design-lab-chart-preview-kpi-card' },
  { slug: 'sparkline-chart', previewTestId: 'design-lab-chart-preview-sparkline-chart' },
  { slug: 'chart-dashboard', previewTestId: 'design-lab-chart-preview-chart-dashboard' },
  { slug: 'chart-container', previewTestId: 'design-lab-chart-preview-chart-container' },
  { slug: 'chart-toolbar', previewTestId: 'design-lab-chart-preview-chart-toolbar' },
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
