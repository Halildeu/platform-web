import { test, expect } from '@playwright/test';

/* ------------------------------------------------------------------ */
/*  Visual Regression — @mfe/x-charts mobile baseline (Faz 21.10 W8)   */
/*                                                                     */
/*  Snapshot story set is intentionally narrower than the desktop      */
/*  fixture: only composites whose responsive primitives changed in    */
/*  waves 1-7 are pinned to a 393×851 (Pixel 5) viewport so we can     */
/*  catch regressions where the responsive fix actually matters.       */
/*                                                                     */
/*  Atomic chart stories (BarChart, LineChart, …) are NOT included     */
/*  here — they re-render at any viewport via ECharts and the desktop  */
/*  baseline already covers their visual contract. Adding them at      */
/*  mobile resolution would just double-snapshot the same canvas.      */
/*                                                                     */
/*  Project: `mobile-pixel5` (see playwright.config.ts). Snapshots end */
/*  up under                                                           */
/*    src/__visual__/__snapshots__/x-charts-mobile.visual.ts/          */
/*      mobile-pixel5/{testId}.png                                     */
/*  so they don't collide with the desktop baseline tree.              */
/*                                                                     */
/*  Per-test timeout 120s — cold cache + chart init still needs        */
/*  headroom on the slowest CI runner.                                 */
/* ------------------------------------------------------------------ */

const STORYBOOK_BASE = 'http://localhost:6006';

interface MobileVisualStory {
  storyId: string;
  testId: string;
  label: string;
  /** Some composites are DOM-only; skip the chart-surface guard then. */
  hasChartSurface?: boolean;
  /** Wave that introduced the responsive primitive being pinned here. */
  wave: 'wave2' | 'wave3' | 'wave5' | 'wave7';
}

/*
 * Story selection rationale (per wave):
 *
 * - wave2: KPICard `p-3 sm:p-5` + value font `text-xl sm:text-2xl` —
 *   captured by both Default and WithTrend variants.
 * - wave3 + wave5: SparklineChart fluid width (and height) lives inside
 *   KPICard's chart slot — captured by WithChart, plus the
 *   ChartDashboard FourColumnKPIs which renders 4 KPICard+spark in a
 *   responsive grid (also exercises ChartDashboard mobile cascade).
 * - wave7: ChartLegend mobile gap is exercised indirectly through
 *   ChartDashboard StatWidgets which contains stat cards with their own
 *   inline legends. We intentionally don't add a dedicated ChartLegend
 *   story here — the existing StatWidgets composite is enough to lock
 *   the mobile-tight gap regression.
 */
const MOBILE_STORIES: ReadonlyArray<MobileVisualStory> = [
  // KPICard — wave 2 padding + value font baseline
  {
    storyId: 'x-charts-kpicard--default',
    testId: 'kpicard-default',
    label: 'KPICard Default (mobile)',
    wave: 'wave2',
  },
  {
    storyId: 'x-charts-kpicard--with-trend',
    testId: 'kpicard-with-trend',
    label: 'KPICard WithTrend (mobile)',
    wave: 'wave2',
  },
  // KPICard with embedded SparklineChart — waves 2 + 3 + 5 composed
  {
    storyId: 'x-charts-kpicard--with-chart',
    testId: 'kpicard-with-chart',
    label: 'KPICard WithChart (mobile)',
    hasChartSurface: true,
    wave: 'wave3',
  },
  // ChartDashboard 4-up KPI grid — wave 2 per-breakpoint columns +
  // wave 3 sparkline fluid width composed end-to-end. This is the
  // single highest-value mobile snapshot; it's where the KPICard +
  // spark combo would overflow before the responsive work.
  {
    storyId: 'x-charts-chartdashboard--four-column-kp-is',
    testId: 'chartdashboard-four-column-kpis',
    label: 'ChartDashboard FourColumnKPIs (mobile)',
    hasChartSurface: true,
    wave: 'wave3',
  },
  {
    storyId: 'x-charts-chartdashboard--stat-widgets',
    testId: 'chartdashboard-stat-widgets',
    label: 'ChartDashboard StatWidgets (mobile)',
    wave: 'wave7',
  },
];

async function openStory(page: import('@playwright/test').Page, story: MobileVisualStory) {
  // Reduced motion BEFORE goto — same as the desktop fixture; ECharts
  // honors this and CSS animation override below catches the rest.
  await page.emulateMedia({ reducedMotion: 'reduce' });

  await page.goto(`${STORYBOOK_BASE}/iframe.html?id=${story.storyId}&viewMode=story`, {
    waitUntil: 'load',
    timeout: 60_000,
  });

  // Belt-and-suspenders: disable transitions/animations via CSS.
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        transition: none !important;
        animation: none !important;
      }
    `,
  });

  const wrapper = page.getByTestId(`x-charts-${story.testId}`);
  await wrapper.waitFor({ state: 'visible', timeout: 60_000 });

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

  // Final settle to absorb one-frame layout reflow after first paint.
  await page.waitForTimeout(500);
}

test.describe('x-charts mobile visual baseline (Faz 21.10 W8)', () => {
  test.describe.configure({ timeout: 120_000 });

  for (const story of MOBILE_STORIES) {
    test(`x-charts ${story.label} [${story.wave}]`, async ({ page }) => {
      await openStory(page, story);

      const wrapper = page.getByTestId(`x-charts-${story.testId}`);
      await expect(wrapper).toHaveScreenshot(`${story.testId}.png`, {
        // Slightly looser pixel ratio than desktop (0.02 → 0.03) to
        // absorb sub-pixel font rendering differences across mobile
        // emulator engines (Chromium device emulation isn't always
        // pixel-stable for small text on first paint).
        maxDiffPixelRatio: 0.03,
      });
    });
  }
});
