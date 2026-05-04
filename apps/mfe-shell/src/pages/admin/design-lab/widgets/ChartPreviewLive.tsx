/**
 * ChartPreviewLive — renders a real @mfe/x-charts component with mock data
 * inside Design Lab pages, replacing the previous SVG ChartPreviewPlaceholder.
 *
 * Mock data and prop shapes are taken verbatim from the Storybook reference
 * stories (`packages/x-charts/src/__stories__/AllChartTypes.stories.tsx`)
 * so the visual matches what visual-regression already covers.
 *
 * Boolean toggles flowing in from the PlaygroundTab `pgState` are forwarded
 * as raw props on the underlying chart component when applicable. Unknown
 * chart ids fall back to a friendly empty state instead of throwing.
 */
import React, { useRef } from 'react';
import {
  BarChart,
  LineChart,
  AreaChart,
  PieChart,
  ScatterChart,
  GaugeChart,
  RadarChart,
  TreemapChart,
  HeatmapChart,
  WaterfallChart,
  FunnelChart,
  SankeyChart,
  SunburstChart,
  KPICard,
  SparklineChart,
  ChartDashboard,
  ChartContainer,
  ChartToolbar,
  useChartInteractions,
  useResponsiveBreakpoint,
  // Faz 21.9 PR3a: shared chart-size contract — replaces the local
  // CHART_CANVAS_HEIGHT mirror that used to live in this file.
  CHART_CANVAS_HEIGHT as SHARED_CHART_CANVAS_HEIGHT,
} from '@mfe/x-charts';
import CrossFilterDemoLive from './CrossFilterDemoLive';
import CrossFilterGridDemoLive from './CrossFilterGridDemoLive';
import DrillDownDemoLive from './DrillDownDemoLive';
import FeatureDemoLive, { type FeatureId } from './FeatureDemoLive';
import AiHookDemoLive, { type AiHookId } from './AiHookDemoLive';
import PerfUtilityDemoLive, { type PerfUtilityId } from './PerfUtilityDemoLive';
import {
  getBool,
  getDecal,
  getEnum,
  getNum,
  getOptStr,
  getStr,
  getPreviewSurfaceStyle,
  type PlaygroundState,
} from './chartPlaygroundModel';

const categories = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran'];
const values1 = [320, 332, 301, 334, 390, 330];
const values2 = [220, 182, 191, 234, 290, 330];

export interface ChartPreviewLiveProps {
  chartId: string;
  chartName: string;
  /**
   * Typed playground state forwarded from `PlaygroundTab`. Faz 21.8
   * follow-up (Codex thread `019def27`): widened from `boolean | string`
   * to `PlaygroundState` (boolean | string | number | undefined) so enum
   * pickers and number inputs can drive the underlying chart prop. The
   * accessors `getBool` / `getEnum` / `getNum` / `getStr` from
   * `chartPlaygroundModel` provide typed reads with safe fallbacks.
   */
  toggles?: PlaygroundState;
  /**
   * Optional minimum-height floor (px). Faz 21.9 PR2 (Codex `019defa5`):
   * the preview surface height is normally derived from the *clamped*
   * chart size — `220 / 320 / 420` for `sm / md / lg`. Pass a non-zero
   * `height` here to insist on a floor when the chart-size envelope
   * would otherwise be too small (e.g. theme-only previews without a
   * chart). Defaults to `0` so the responsive shrink wins on mobile /
   * tablet without callers having to remember to override.
   */
  height?: number;
}

// Backwards-compat shim — kept inline so call sites that still expect a
// boolean reader keep working. Internally just delegates to `getBool`.
const isOn = (toggles: PlaygroundState | undefined, key: string, fallback: boolean): boolean =>
  getBool(toggles, key, fallback);

// Mirror of `packages/x-charts/src/types.ts` `ChartSize`. Keep in sync if
// the wrapper extends the size axis.
type ChartSize = 'sm' | 'md' | 'lg';

interface PreviewBoxProps {
  testId: string;
  height: number;
  surfaceStyle?: React.CSSProperties;
  children: React.ReactNode;
}

/**
 * PreviewBox — Faz 21.9 PR2 (Codex thread `019defa5`): the Design Lab
 * chart-detail preview surface that wraps every live chart. Two roles:
 *
 *   1. Apply the design-lab theme background so dark/print-mode previews
 *      blend with the surrounding canvas.
 *   2. Contain the chart canvas with `overflow: hidden` + `position:
 *      relative` so the chart body never bleeds onto neighbouring layout
 *      (the screenshot bug where Generated Code / Sample Data text landed
 *      on top of the bar chart canvas at 360px container height while the
 *      `size="lg"` wrapper produced a 400px canvas).
 *
 *  The fixed `maxWidth: 720` cap is intentional — it keeps preview width
 *  in lockstep with the Storybook visual-regression snapshot so design-lab
 *  and visual review render the same pixels.
 */
const PreviewBox = React.forwardRef<HTMLDivElement, PreviewBoxProps>(
  ({ testId, height, surfaceStyle, children }, ref) => (
    <div
      ref={ref}
      data-testid={testId}
      style={{
        width: '100%',
        maxWidth: 720,
        height,
        position: 'relative',
        overflow: 'hidden',
        background: surfaceStyle?.background ?? 'var(--surface-canvas, #ffffff)',
        color: surfaceStyle?.color,
        transition: 'background-color 200ms ease, color 200ms ease',
      }}
    >
      {children}
    </div>
  ),
);
PreviewBox.displayName = 'PreviewBox';

/* ------------------------------------------------------------------ */
/*  Responsive size clamping                                           */
/* ------------------------------------------------------------------ */

export const SIZE_ORDER: ChartSize[] = ['sm', 'md', 'lg'];

/**
 * Coerce the user-selected chart `size` (from the playground toggles) to
 * the largest size that actually fits the live preview container at the
 * current breakpoint. Without this, mobile users on the design-lab page
 * who happened to flip `size="lg"` got a 400px-tall ECharts canvas inside
 * a 240px PreviewBox — the chart body would clip into Generated Code /
 * Sample Data sections directly underneath.
 *
 * Mapping:
 *   - mobile  (< 480px container width): cap at "sm" (200px ECharts canvas)
 *   - tablet  (480–1024px): cap at "md" (300px)
 *   - desktop (> 1024px): no cap, honour the user choice up to "lg" (400px)
 *
 * Exported for unit tests; the production path stays inside this file.
 */
export const clampChartSize = (
  userSize: ChartSize,
  breakpoint: 'mobile' | 'tablet' | 'desktop',
): ChartSize => {
  const cap: ChartSize = breakpoint === 'mobile' ? 'sm' : breakpoint === 'tablet' ? 'md' : 'lg';
  const userIdx = SIZE_ORDER.indexOf(userSize);
  const capIdx = SIZE_ORDER.indexOf(cap);
  return SIZE_ORDER[Math.min(userIdx, capIdx)];
};

/**
 * Re-export of the shared chart-size contract from `@mfe/x-charts/chartSize`.
 * Faz 21.9 PR3a (Codex thread `019defa5`): the local mirror that used to
 * live here is gone — there's now exactly one runtime source of truth for
 * chart canvas heights, imported above as `SHARED_CHART_CANVAS_HEIGHT` and
 * re-exported under the legacy name for backwards compatibility with
 * existing test imports (`chartPreviewResponsive.test.ts`).
 */
export const CHART_CANVAS_HEIGHT = SHARED_CHART_CANVAS_HEIGHT;

/**
 * PreviewBox height envelope: derived from the *clamped* chart size, not
 * the user's requested height. The container is always exactly 20px
 * taller than the chart canvas it wraps so we never reproduce the
 * original screenshot bug (chart body bleeding into the Generated Code
 * section underneath).
 *
 *   mobile  + lg → clampedSize 'sm' → 200 + 20 = 220
 *   tablet  + lg → clampedSize 'md' → 300 + 20 = 320
 *   desktop + lg → clampedSize 'lg' → 400 + 20 = 420
 *
 * The optional `floor` argument lets the caller insist on a minimum
 * height — but the playground call-site keeps it at 0 so the responsive
 * shrink actually takes effect. (Codex 019defa5 PARTIAL fix: an earlier
 * draft passed `floor={360}` which kept mobile previews at 360px even
 * after the chart canvas clamped down to `sm`.)
 *
 * Breakpoint isn't a parameter because `clampedSize` already encodes the
 * breakpoint cap upstream; passing it twice would invite a re-derive bug.
 *
 * Exported for unit tests.
 */
export const responsiveHeight = (clampedSize: ChartSize, floor = 0): number =>
  Math.max(floor, CHART_CANVAS_HEIGHT[clampedSize] + 20);

const ChartPreviewLive: React.FC<ChartPreviewLiveProps> = ({
  chartId,
  chartName,
  toggles,
  // Default `height = 0` — the chart-size-derived envelope wins. Callers
  // that need a hard floor (theme-only previews) can still pass an
  // explicit value. (Codex 019defa5 PARTIAL fix: an earlier draft
  // defaulted to 360, which silently bypassed the responsive shrink the
  // whole PR was meant to deliver.)
  height = 0,
}) => {
  const testId = `design-lab-chart-preview-${chartId}`;

  // Faz 21.9 PR2: track the preview surface size with the same hook the
  // chart wrappers use, so PreviewBox height + chart `size` clamp stay in
  // lockstep. The same DOM node feeds the breakpoint observer; chart
  // wrappers attach their own renderer ref through React's normal flow.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const breakpoint = useResponsiveBreakpoint(containerRef);
  const userSize = getEnum<ChartSize>(toggles, 'size', 'lg');
  const clampedSize = clampChartSize(userSize, breakpoint);
  // Height is driven by the clamped chart size, not the user's `height`
  // prop, so the PreviewBox is always exactly 20px taller than the chart
  // canvas — preventing the original screenshot bug where a 400px lg
  // canvas overflowed a 360px container. `height` is treated as a *floor*
  // (theme-only previews can insist on a minimum), but the design-lab
  // call-site no longer passes a non-zero floor so the responsive shrink
  // actually wins on mobile/tablet.
  const finalHeight = responsiveHeight(clampedSize, height);

  /**
   * Resolve the chart `size` prop from the playground toggles, then clamp
   * it against the active breakpoint cap. `defaultSize` is the wrapper's
   * own default (e.g. BarChart defaults to 'md'); each switch case picks
   * the size it wants the live preview to honour.
   */
  const sizeFor = (defaultSize: ChartSize): ChartSize =>
    clampChartSize(getEnum<ChartSize>(toggles, 'size', defaultSize), breakpoint);

  switch (chartId) {
    case 'bar-chart': {
      const themeOverride = getEnum(toggles, 'theme', 'auto');
      const surfaceStyle = getPreviewSurfaceStyle(themeOverride);
      return (
        <PreviewBox
          ref={containerRef}
          testId={testId}
          height={finalHeight}
          surfaceStyle={surfaceStyle}
        >
          <BarChart
            data={categories.map((c, i) => ({ label: c, value: values1[i] }))}
            title={getStr(toggles, 'title', chartName)}
            description={getOptStr(toggles, 'description')}
            className={getOptStr(toggles, 'className')}
            orientation={getEnum(toggles, 'orientation', 'vertical')}
            size={sizeFor('lg')}
            showValues={isOn(toggles, 'showValues', false)}
            showGrid={isOn(toggles, 'showGrid', true)}
            showLegend={isOn(toggles, 'showLegend', false)}
            animate={isOn(toggles, 'animate', true)}
            theme={themeOverride}
            decal={getDecal(toggles, 'decal', 'auto')}
            density={getEnum(toggles, 'density', 'auto')}
            accent={getEnum(toggles, 'accent', 'auto')}
            access={getEnum(toggles, 'access', 'full')}
            accessReason={getOptStr(toggles, 'accessReason')}
          />
        </PreviewBox>
      );
    }

    case 'line-chart': {
      const themeOverride = getEnum(toggles, 'theme', 'auto');
      const surfaceStyle = getPreviewSurfaceStyle(themeOverride);
      return (
        <PreviewBox
          ref={containerRef}
          testId={testId}
          height={finalHeight}
          surfaceStyle={surfaceStyle}
        >
          <LineChart
            series={[
              { name: 'Seri A', data: values1 },
              { name: 'Seri B', data: values2 },
            ]}
            labels={categories}
            title={getStr(toggles, 'title', chartName)}
            size={sizeFor('lg')}
            showDots={isOn(toggles, 'showDots', true)}
            showGrid={isOn(toggles, 'showGrid', true)}
            showLegend={isOn(toggles, 'showLegend', true)}
            curved={isOn(toggles, 'curved', false)}
            showArea={isOn(toggles, 'showArea', false)}
            animate={isOn(toggles, 'animate', true)}
            theme={themeOverride}
            decal={getDecal(toggles, 'decal', 'auto')}
            density={getEnum(toggles, 'density', 'auto')}
            accent={getEnum(toggles, 'accent', 'auto')}
            access={getEnum(toggles, 'access', 'full')}
          />
        </PreviewBox>
      );
    }

    case 'area-chart': {
      const themeOverride = getEnum(toggles, 'theme', 'auto');
      const surfaceStyle = getPreviewSurfaceStyle(themeOverride);
      return (
        <PreviewBox
          ref={containerRef}
          testId={testId}
          height={finalHeight}
          surfaceStyle={surfaceStyle}
        >
          <AreaChart
            series={[
              { name: 'Gelir', data: values1 },
              { name: 'Gider', data: values2 },
            ]}
            labels={categories}
            title={getStr(toggles, 'title', chartName)}
            size={sizeFor('lg')}
            stacked={isOn(toggles, 'stacked', true)}
            showLegend={isOn(toggles, 'showLegend', true)}
            showGrid={isOn(toggles, 'showGrid', true)}
            showDots={isOn(toggles, 'showDots', false)}
            gradient={isOn(toggles, 'gradient', true)}
            curved={isOn(toggles, 'curved', true)}
            animate={isOn(toggles, 'animate', true)}
            theme={themeOverride}
            decal={getDecal(toggles, 'decal', 'auto')}
            density={getEnum(toggles, 'density', 'auto')}
            accent={getEnum(toggles, 'accent', 'auto')}
            access={getEnum(toggles, 'access', 'full')}
          />
        </PreviewBox>
      );
    }

    case 'pie-chart': {
      const themeOverride = getEnum(toggles, 'theme', 'auto');
      const surfaceStyle = getPreviewSurfaceStyle(themeOverride);
      return (
        <PreviewBox
          ref={containerRef}
          testId={testId}
          height={finalHeight}
          surfaceStyle={surfaceStyle}
        >
          <PieChart
            data={categories.slice(0, 5).map((c, i) => ({ label: c, value: values1[i] }))}
            title={getStr(toggles, 'title', chartName)}
            size={sizeFor('lg')}
            donut={isOn(toggles, 'donut', true)}
            showLabels={isOn(toggles, 'showLabels', true)}
            showLegend={isOn(toggles, 'showLegend', false)}
            showPercentage={isOn(toggles, 'showPercentage', true)}
            animate={isOn(toggles, 'animate', true)}
            theme={themeOverride}
            decal={getDecal(toggles, 'decal', 'auto')}
            density={getEnum(toggles, 'density', 'auto')}
            accent={getEnum(toggles, 'accent', 'auto')}
            access={getEnum(toggles, 'access', 'full')}
          />
        </PreviewBox>
      );
    }

    case 'scatter-chart': {
      const themeOverride = getEnum(toggles, 'theme', 'auto');
      const surfaceStyle = getPreviewSurfaceStyle(themeOverride);
      return (
        <PreviewBox
          ref={containerRef}
          testId={testId}
          height={finalHeight}
          surfaceStyle={surfaceStyle}
        >
          <ScatterChart
            data={values1.map((v, i) => ({ x: v, y: values2[i], label: categories[i] }))}
            title={getStr(toggles, 'title', chartName)}
            xLabel={getStr(toggles, 'xLabel', 'Seri A')}
            yLabel={getStr(toggles, 'yLabel', 'Seri B')}
            size={sizeFor('lg')}
            theme={themeOverride}
            decal={getDecal(toggles, 'decal', 'auto')}
            density={getEnum(toggles, 'density', 'auto')}
            accent={getEnum(toggles, 'accent', 'auto')}
            access={getEnum(toggles, 'access', 'full')}
          />
        </PreviewBox>
      );
    }

    case 'gauge-chart': {
      const themeOverride = getEnum(toggles, 'theme', 'auto');
      const surfaceStyle = getPreviewSurfaceStyle(themeOverride);
      return (
        <PreviewBox
          ref={containerRef}
          testId={testId}
          height={finalHeight}
          surfaceStyle={surfaceStyle}
        >
          <GaugeChart
            value={getNum(toggles, 'value', 72)}
            min={getNum(toggles, 'min', 0)}
            max={getNum(toggles, 'max', 100)}
            title={getStr(toggles, 'title', chartName)}
            thresholds={[
              { value: 30, color: '#ef4444' },
              { value: 70, color: '#f59e0b' },
              { value: 100, color: '#22c55e' },
            ]}
            size={sizeFor('lg')}
            theme={themeOverride}
            decal={getDecal(toggles, 'decal', 'auto')}
            density={getEnum(toggles, 'density', 'auto')}
            accent={getEnum(toggles, 'accent', 'auto')}
            access={getEnum(toggles, 'access', 'full')}
          />
        </PreviewBox>
      );
    }

    case 'radar-chart':
      return (
        <PreviewBox ref={containerRef} testId={testId} height={finalHeight}>
          <RadarChart
            indicators={[
              { name: 'Satış', max: 100 },
              { name: 'Pazarlama', max: 100 },
              { name: 'Teknoloji', max: 100 },
              { name: 'Destek', max: 100 },
              { name: 'Geliştirme', max: 100 },
            ]}
            series={[
              { name: 'Ekip A', data: [85, 70, 95, 60, 80] },
              { name: 'Ekip B', data: [65, 90, 70, 85, 55] },
            ]}
            title={chartName}
            showLegend={isOn(toggles, 'showLegend', true)}
            size={sizeFor('lg')}
          />
        </PreviewBox>
      );

    case 'treemap-chart':
      return (
        <PreviewBox ref={containerRef} testId={testId} height={finalHeight}>
          <TreemapChart
            data={[
              {
                name: 'Satış',
                value: 100,
                children: [
                  { name: 'Online', value: 60 },
                  { name: 'Mağaza', value: 40 },
                ],
              },
              {
                name: 'Pazarlama',
                value: 80,
                children: [
                  { name: 'Dijital', value: 50 },
                  { name: 'Basılı', value: 30 },
                ],
              },
            ]}
            title={chartName}
            size={sizeFor('lg')}
          />
        </PreviewBox>
      );

    case 'heatmap-chart':
      return (
        <PreviewBox ref={containerRef} testId={testId} height={finalHeight}>
          <HeatmapChart
            data={[
              [0, 0, 10],
              [0, 1, 22],
              [0, 2, 28],
              [1, 0, 35],
              [1, 1, 42],
              [1, 2, 18],
              [2, 0, 15],
              [2, 1, 30],
              [2, 2, 45],
              [3, 0, 50],
              [3, 1, 12],
              [3, 2, 33],
              [4, 0, 25],
              [4, 1, 38],
              [4, 2, 20],
            ]}
            xLabels={['Pzt', 'Sal', 'Çar', 'Per', 'Cum']}
            yLabels={['Sabah', 'Öğle', 'Akşam']}
            title={chartName}
            showValues={isOn(toggles, 'showValues', true)}
            size={sizeFor('lg')}
          />
        </PreviewBox>
      );

    case 'waterfall-chart':
      return (
        <PreviewBox ref={containerRef} testId={testId} height={finalHeight}>
          <WaterfallChart
            data={[
              { label: 'Başlangıç', value: 1000 },
              { label: 'Gelir', value: 300 },
              { label: 'Hizmet', value: 200 },
              { label: 'Gider', value: -150 },
              { label: 'Vergi', value: -100 },
              { label: 'Sonuç', value: 1250 },
            ]}
            title={chartName}
            showValues={isOn(toggles, 'showValues', true)}
            size={sizeFor('lg')}
          />
        </PreviewBox>
      );

    case 'funnel-chart':
      return (
        <PreviewBox ref={containerRef} testId={testId} height={finalHeight}>
          <FunnelChart
            data={[
              { name: 'Ziyaret', value: 5000 },
              { name: 'Kayıt', value: 3000 },
              { name: 'Deneme', value: 1500 },
              { name: 'Satın Alma', value: 500 },
            ]}
            title={chartName}
            showConversion={isOn(toggles, 'showConversion', true)}
            size={sizeFor('lg')}
          />
        </PreviewBox>
      );

    case 'sankey-chart':
      return (
        <PreviewBox ref={containerRef} testId={testId} height={finalHeight}>
          <SankeyChart
            nodes={[
              { name: 'Kaynak A' },
              { name: 'Kaynak B' },
              { name: 'Hedef X' },
              { name: 'Hedef Y' },
            ]}
            links={[
              { source: 'Kaynak A', target: 'Hedef X', value: 30 },
              { source: 'Kaynak A', target: 'Hedef Y', value: 20 },
              { source: 'Kaynak B', target: 'Hedef X', value: 10 },
              { source: 'Kaynak B', target: 'Hedef Y', value: 40 },
            ]}
            title={chartName}
            size={sizeFor('lg')}
          />
        </PreviewBox>
      );

    case 'sunburst-chart':
      return (
        <PreviewBox ref={containerRef} testId={testId} height={finalHeight}>
          <SunburstChart
            data={[
              {
                name: 'Türkiye',
                children: [
                  {
                    name: 'İstanbul',
                    children: [
                      { name: 'Kadıköy', value: 50 },
                      { name: 'Beşiktaş', value: 30 },
                    ],
                  },
                  {
                    name: 'Ankara',
                    children: [
                      { name: 'Çankaya', value: 40 },
                      { name: 'Keçiören', value: 20 },
                    ],
                  },
                ],
              },
            ]}
            title={chartName}
            size={sizeFor('lg')}
          />
        </PreviewBox>
      );

    case 'kpi-card':
      return (
        <PreviewBox ref={containerRef} testId={testId} height={finalHeight}>
          <div className="flex h-full w-full items-center justify-center p-4">
            <KPICard
              title="Revenue"
              value="$128,500"
              trend={{ direction: 'up', value: '+12.5%', positive: true }}
              chart={<SparklineChart data={values1} type="area" width="auto" />}
            />
          </div>
        </PreviewBox>
      );

    case 'sparkline-chart':
      return (
        <PreviewBox ref={containerRef} testId={testId} height={finalHeight}>
          <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-4">
            {/*
              Faz 21.10 wave 3: showcase the new fluid-width mode. Each
              row's flex-1 slot receives `width="auto"` so the sparkline
              fills the container instead of clipping at 120px.
            */}
            <div className="flex w-full max-w-md items-center gap-3 text-xs text-text-secondary">
              <span className="w-20 shrink-0">line</span>
              <div className="flex-1">
                <SparklineChart data={values1} type="line" width="auto" />
              </div>
            </div>
            <div className="flex w-full max-w-md items-center gap-3 text-xs text-text-secondary">
              <span className="w-20 shrink-0">area</span>
              <div className="flex-1">
                <SparklineChart data={values1} type="area" width="auto" />
              </div>
            </div>
            <div className="flex w-full max-w-md items-center gap-3 text-xs text-text-secondary">
              <span className="w-20 shrink-0">bar</span>
              <div className="flex-1">
                <SparklineChart data={values1} type="bar" width="auto" />
              </div>
            </div>
          </div>
        </PreviewBox>
      );

    case 'chart-dashboard':
      return (
        <PreviewBox ref={containerRef} testId={testId} height={finalHeight}>
          <ChartDashboard columns={{ sm: 1, md: 2, lg: 3 }} gap="md">
            <KPICard
              title="Revenue"
              value="$128K"
              trend={{ direction: 'up', value: '+12%', positive: true }}
              chart={<SparklineChart data={values1} type="area" width="auto" />}
            />
            <KPICard
              title="Users"
              value="12,847"
              trend={{ direction: 'up', value: '+3.2%', positive: true }}
              chart={<SparklineChart data={values2} type="line" width="auto" />}
            />
            <KPICard
              title="Errors"
              value="42"
              trend={{ direction: 'down', value: '-18%', positive: true }}
              chart={<SparklineChart data={[20, 18, 15, 12, 10, 8, 6]} type="bar" width="auto" />}
            />
          </ChartDashboard>
        </PreviewBox>
      );

    case 'chart-container':
      return (
        <PreviewBox ref={containerRef} testId={testId} height={finalHeight}>
          <ChartContainer
            title="Q3 Sales"
            description="ChartContainer ile sarılmış BarChart — title + description + height slot"
            height={260}
          >
            <BarChart
              data={categories.map((c, i) => ({ label: c, value: values1[i] }))}
              showValues
              showGrid
              animate={false}
              size="md"
            />
          </ChartContainer>
        </PreviewBox>
      );

    case 'chart-toolbar':
      return (
        <PreviewBox ref={containerRef} testId={testId} height={finalHeight}>
          <ChartToolbarShowcase chartName={chartName} />
        </PreviewBox>
      );

    case 'cross-filter':
      // Cross-filter demo manages its own height (two stacked charts + reset button).
      return (
        <div
          data-testid={testId}
          style={{ width: '100%', maxWidth: 720, background: 'var(--surface-canvas, #ffffff)' }}
        >
          <CrossFilterDemoLive />
        </div>
      );

    case 'cross-filter-grid':
      // Faz 21.4 PR-B: chart → grid cross-filter bridge demo.
      return (
        <div
          data-testid={testId}
          style={{ width: '100%', maxWidth: 720, background: 'var(--surface-canvas, #ffffff)' }}
        >
          <CrossFilterGridDemoLive />
        </div>
      );

    case 'drill-down':
      // Faz 21.4 PR-B: 3-level hierarchical drill (region → city → store).
      return (
        <div
          data-testid={testId}
          style={{ width: '100%', maxWidth: 720, background: 'var(--surface-canvas, #ffffff)' }}
        >
          <DrillDownDemoLive mode="basic" />
        </div>
      );

    case 'feature-brush':
    case 'feature-zoom-pan':
    case 'feature-realtime':
    case 'feature-theme-switch':
    case 'feature-export':
      // Faz 21.4 PR-C: 5 isolated feature demos (brush, zoom/pan,
      // realtime stream, theme switch, export). Each demo uses real
      // x-charts hooks; only the export demo uses a mock ECharts
      // instance (the public BarChart wrapper does not expose its
      // instance ref).
      return (
        <div
          data-testid={testId}
          style={{ width: '100%', maxWidth: 720, background: 'var(--surface-canvas, #ffffff)' }}
        >
          <FeatureDemoLive featureId={chartId as FeatureId} />
        </div>
      );

    case 'drill-down-history':
      // Faz 21.4 PR-B: drill-down + explicit Undo (drillUp) + Reset (drillToRoot) + depth/drill counter.
      return (
        <div
          data-testid={testId}
          style={{ width: '100%', maxWidth: 720, background: 'var(--surface-canvas, #ffffff)' }}
        >
          <DrillDownDemoLive mode="history" />
        </div>
      );

    case 'detect-anomalies':
    case 'identify-trends':
    case 'suggest-chart':
    case 'chart-description':
    case 'nl-to-chart':
      return (
        <div
          data-testid={testId}
          style={{ width: '100%', maxWidth: 720, background: 'var(--surface-canvas, #ffffff)' }}
        >
          <AiHookDemoLive hookId={chartId as AiHookId} />
        </div>
      );

    case 'lttb':
    case 'progressive-render':
    case 'lazy-chart':
    case 'lru-cache':
    case 'code-split':
      return (
        <div
          data-testid={testId}
          style={{ width: '100%', maxWidth: 720, background: 'var(--surface-canvas, #ffffff)' }}
        >
          <PerfUtilityDemoLive utilityId={chartId as PerfUtilityId} />
        </div>
      );

    default:
      return (
        <PreviewBox ref={containerRef} testId={testId} height={finalHeight}>
          <div className="flex h-full w-full items-center justify-center text-sm text-text-tertiary">
            {chartName}: live preview yakında
          </div>
        </PreviewBox>
      );
  }
};

/* ------------------------------------------------------------------ */
/*  ChartToolbarShowcase — local hook scope                            */
/*                                                                     */
/*  Wires useChartInteractions to ChartToolbar so the demo surfaces    */
/*  observable state (zoomLevel, brushRange) underneath the toolbar.   */
/* ------------------------------------------------------------------ */

const ChartToolbarShowcase: React.FC<{ chartName: string }> = ({ chartName }) => {
  const [interactions] = useChartInteractions({
    enableZoom: true,
    enablePan: false,
    enableBrush: true,
  });

  return (
    <div className="space-y-3 p-3">
      <ChartToolbar interactions={interactions} />
      <BarChart
        data={categories.map((c, i) => ({ label: c, value: values1[i] }))}
        title={chartName}
        showValues
        showGrid
        animate={false}
        size="md"
      />
      <div
        className="rounded border border-border-subtle bg-surface-muted p-2 text-xs text-text-secondary"
        data-testid="chart-toolbar-state"
      >
        <span className="font-mono">zoomLevel: {interactions.zoomLevel}</span>
        {interactions.brushRange ? (
          <span className="ml-3 font-mono">
            brush: [{interactions.brushRange.start}, {interactions.brushRange.end}]
          </span>
        ) : (
          <span className="ml-3 font-mono">brush: —</span>
        )}
      </div>
    </div>
  );
};

export default ChartPreviewLive;
