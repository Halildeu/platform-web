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
  TreeChart,
  // PR-X16b (Codex thread 019e33a9 AGREE): GitHub-contributions-style
  // daily calendar heatmap — ECharts Depth campaign second wrapper.
  CalendarHeatmap,
  HeatmapChart,
  WaterfallChart,
  FunnelChart,
  SankeyChart,
  SunburstChart,
  // Faz 21.11 P1a-P1d 3D Extension Pack — design-lab preview support.
  // Boot's `echarts-gl` lazy chunk on first mount; degrades to a
  // "WebGL unavailable" banner if WebGL is missing.
  Scatter3D,
  Surface3D,
  Lines3D,
  Globe,
  // PR-X campaign live playground (Codex 019e22b6 follow-up):
  // wire the 6 wrappers into ChartPreviewLive so design-lab Playground
  // tab renders real instances instead of the "yakında" fallback.
  BoxPlotChart,
  CandlestickChart,
  PictorialBarChart,
  ParallelCoordinatesChart,
  GraphChart,
  GeoMap,
  ensureGeoMapRegistered,
  KPICard,
  SparklineChart,
  ChartDashboard,
  ChartContainer,
  ChartToolbar,
  useChartInteractions,
  useAnomalyOverlay,
  useResponsiveBreakpoint,
  // Faz 21.9 PR3a: shared chart-size contract — replaces the local
  // CHART_CANVAS_HEIGHT mirror that used to live in this file.
  CHART_CANVAS_HEIGHT as SHARED_CHART_CANVAS_HEIGHT,
} from '@mfe/x-charts';
import CrossFilterDemoLive from './CrossFilterDemoLive';
import CrossFilterGridDemoLive from './CrossFilterGridDemoLive';
// Faz 21.11 PR-A2c-adopt — scatter brush + AG Grid mock filter
// model demo. Lives next to the existing bar→grid wiring so the
// design-lab tester can compare click-driven vs brush-driven
// cross-filter pipelines side by side under the same chart-id.
import ScatterBrushGridDemoLive from './ScatterBrushGridDemoLive';
import DrillDownDemoLive from './DrillDownDemoLive';
import FeatureDemoLive, { type FeatureId } from './FeatureDemoLive';
import AiHookDemoLive, { type AiHookId } from './AiHookDemoLive';
import PerfUtilityDemoLive, { type PerfUtilityId } from './PerfUtilityDemoLive';
import {
  getBool,
  getCallbackPreset,
  getColorsPreset,
  getDecal,
  getEnum,
  getNum,
  getOptNum,
  getOptStr,
  getPreviewSurfaceStyle,
  getStr,
  getThresholdsPreset,
  getValueFormatterPreset,
  type PlaygroundState,
} from './chartPlaygroundModel';

const categories = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran'];
const values1 = [320, 332, 301, 334, 390, 330];
const values2 = [220, 182, 191, 234, 290, 330];

// Faz 21.11 3D Extension Pack — STABLE module-scope fixtures for
// the 3D wrappers' live preview. Live cluster smoke 2026-05-12
// surfaced that JSX-inline fixtures (data arrays + dataShape tuples
// + path coords) generate fresh references on every render, which
// triggers Surface3D / Lines3D / Globe useMemo deps to recompute
// each tick → setOption flood → ECharts canvas init silently
// stalls and the wrapper container stays empty.
//
// Hoisting the fixtures here keeps the JSX call sites referentially
// stable across re-renders. Scatter3D was renderng correctly even
// before this hoist because its data array is small + its option
// memo doesn't observe dataShape; the other three need this fix to
// reach the canvas mount path.
const SCATTER_3D_FIXTURE: ReadonlyArray<{
  x: number;
  y: number;
  z: number;
  label?: string;
}> = [
  { x: 0, y: 0, z: 0, label: 'origin' },
  { x: 1, y: 2, z: 1, label: 'p1' },
  { x: 2, y: 1, z: 3, label: 'p2' },
  { x: 3, y: 3, z: 2, label: 'p3' },
  { x: 4, y: 2, z: 4, label: 'p4' },
  { x: 5, y: 4, z: 3, label: 'p5' },
  { x: 2, y: 5, z: 5, label: 'p6' },
  { x: 4, y: 5, z: 1, label: 'p7' },
];

const SURFACE_3D_ROWS = 6;
const SURFACE_3D_COLS = 6;
const SURFACE_3D_FIXTURE: ReadonlyArray<{ x: number; y: number; z: number }> = (() => {
  const out: Array<{ x: number; y: number; z: number }> = [];
  for (let r = 0; r < SURFACE_3D_ROWS; r++) {
    for (let c = 0; c < SURFACE_3D_COLS; c++) {
      out.push({ x: c, y: r, z: Math.sin(c / 1.5) + Math.cos(r / 1.5) });
    }
  }
  return out;
})();
const SURFACE_3D_SHAPE: readonly [number, number] = [SURFACE_3D_ROWS, SURFACE_3D_COLS];

const LINES_3D_PATH_A: ReadonlyArray<readonly [number, number, number]> = Array.from(
  { length: 24 },
  (_, i) => [Math.cos(i / 3) * 3, Math.sin(i / 3) * 3, i / 3] as const,
);
const LINES_3D_PATH_B: ReadonlyArray<readonly [number, number, number]> = Array.from(
  { length: 24 },
  (_, i) => [Math.cos(i / 4) * 2, Math.sin(i / 4) * 2, i / 6] as const,
);
const LINES_3D_FIXTURE = [
  { label: 'Helix', coords: LINES_3D_PATH_A },
  { label: 'Swirl', coords: LINES_3D_PATH_B },
] as const;

const GLOBE_FIXTURE_DATA = [
  { lon: 28.978, lat: 41.008, label: 'Istanbul', value: 100 },
  { lon: 32.866, lat: 39.925, label: 'Ankara', value: 80 },
  { lon: 27.142, lat: 38.423, label: 'Izmir', value: 65 },
  { lon: -73.935, lat: 40.73, label: 'New York', value: 120 },
  { lon: -0.128, lat: 51.507, label: 'London', value: 110 },
  { lon: 139.692, lat: 35.689, label: 'Tokyo', value: 130 },
] as const;
const GLOBE_FIXTURE_LAYERS = [
  {
    type: 'scatter3D' as const,
    name: 'Cities',
    data: GLOBE_FIXTURE_DATA,
  },
] as const;

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

/* ------------------------------------------------------------------ */
/*  PR-X campaign: GeoMap playground inner                             */
/* ------------------------------------------------------------------ */

/**
 * Synthetic placeholder GeoJSON for the design-lab `GeoMap` preview.
 *
 * Three single-polygon "regions" so the wrapper renders a non-empty
 * canvas without bundling a real TR provinces (or world) asset — that
 * licensed payload belongs to the HR adoption PR, not the design-lab
 * playground.
 */
const GEO_MAP_PLAYGROUND_GEOJSON = {
  type: 'FeatureCollection' as const,
  features: [
    {
      type: 'Feature' as const,
      properties: { name: 'İstanbul' },
      geometry: {
        type: 'Polygon' as const,
        coordinates: [
          [
            [28.5, 41.0],
            [29.5, 41.0],
            [29.5, 41.4],
            [28.5, 41.4],
            [28.5, 41.0],
          ],
        ],
      },
    },
    {
      type: 'Feature' as const,
      properties: { name: 'Ankara' },
      geometry: {
        type: 'Polygon' as const,
        coordinates: [
          [
            [32.5, 39.7],
            [33.3, 39.7],
            [33.3, 40.2],
            [32.5, 40.2],
            [32.5, 39.7],
          ],
        ],
      },
    },
    {
      type: 'Feature' as const,
      properties: { name: 'İzmir' },
      geometry: {
        type: 'Polygon' as const,
        coordinates: [
          [
            [26.8, 38.2],
            [27.6, 38.2],
            [27.6, 38.7],
            [26.8, 38.7],
            [26.8, 38.2],
          ],
        ],
      },
    },
  ],
};

/**
 * Wraps `<GeoMap>` with an idempotent `ensureGeoMapRegistered` mount
 * effect so the design-lab playground can render the map without
 * crashing on "map not registered" dev warning. The promise resolves
 * synchronously here (loader returns the stub literal), so the wrapper
 * is registered before the next render tick.
 */
type GeoMapPlaygroundInnerProps = Omit<React.ComponentProps<typeof GeoMap>, 'data' | 'mapName'> & {
  mapName?: string;
};

/**
 * Internal map name reserved for the design-lab GeoMap preview only.
 *
 * Codex 019e22ea iter-2 absorb: the previous draft defaulted to `'TR'`
 * which is ALSO the canonical map name shown in `sampleCode` /
 * Generated Code (the consumer-facing example). Since `ensureGeoMapRegistered`
 * is idempotent — second call with the same name reuses the first
 * loader's result — Design Lab fixture could collide with a real HR
 * consumer route at runtime: whichever module mounts first wins.
 *
 * Workaround: design-lab uses an internal namespaced map name so the
 * synthetic 3-polygon fixture never touches the global `'TR'` slot.
 * Generated Code / sampleCode keeps `'TR'` as the canonical example for
 * consumers; only the preview itself swaps to the internal name.
 */
const DESIGN_LAB_GEO_MAP_NAME = '__design_lab_TR_stub__';

const GeoMapPlaygroundInner: React.FC<GeoMapPlaygroundInnerProps> = ({
  mapName = DESIGN_LAB_GEO_MAP_NAME,
  ...rest
}) => {
  // Codex 019e22ea iter-1 absorb #3: track readiness PER mapName so a
  // live edit (user switches the registered map name in the playground
  // editor) re-enters the loading state until the new map registers.
  // Previously `ready` stayed `true` after first registration and a new
  // mapName could render before its map was registered.
  const [readyMapName, setReadyMapName] = React.useState<string | null>(null);
  React.useEffect(() => {
    let alive = true;
    setReadyMapName(null);
    ensureGeoMapRegistered(mapName, () => GEO_MAP_PLAYGROUND_GEOJSON)
      .then(() => {
        if (alive) setReadyMapName(mapName);
      })
      .catch(() => {
        // Loader is synchronous here so this branch should never fire,
        // but the catch guards against future loader swaps + keeps the
        // promise chain settled.
        if (alive) setReadyMapName(mapName);
      });
    return () => {
      alive = false;
    };
  }, [mapName]);
  if (readyMapName !== mapName) {
    return (
      <div
        className="flex h-full w-full items-center justify-center text-sm opacity-60"
        role="status"
        aria-live="polite"
      >
        Loading map fixture…
      </div>
    );
  }
  return (
    <GeoMap
      mapName={mapName}
      data={[
        { name: 'İstanbul', value: 5000 },
        { name: 'Ankara', value: 3000 },
        { name: 'İzmir', value: 2200 },
      ]}
      visualMap={{ min: 0, max: 6000 }}
      {...rest}
    />
  );
};

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
            colors={getColorsPreset(getEnum(toggles, 'colors', 'default'))}
            valueFormatter={getValueFormatterPreset(getEnum(toggles, 'valueFormatter', 'raw'))}
            onDataPointClick={getCallbackPreset(getEnum(toggles, 'onDataPointClick', 'noop'))}
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
            description={getOptStr(toggles, 'description')}
            className={getOptStr(toggles, 'className')}
            size={sizeFor('lg')}
            showDots={isOn(toggles, 'showDots', true)}
            showGrid={isOn(toggles, 'showGrid', true)}
            showLegend={isOn(toggles, 'showLegend', true)}
            curved={isOn(toggles, 'curved', false)}
            showArea={isOn(toggles, 'showArea', false)}
            animate={isOn(toggles, 'animate', true)}
            valueFormatter={getValueFormatterPreset(getEnum(toggles, 'valueFormatter', 'raw'))}
            onDataPointClick={getCallbackPreset(getEnum(toggles, 'onDataPointClick', 'noop'))}
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
            description={getOptStr(toggles, 'description')}
            className={getOptStr(toggles, 'className')}
            size={sizeFor('lg')}
            stacked={isOn(toggles, 'stacked', true)}
            showLegend={isOn(toggles, 'showLegend', true)}
            showGrid={isOn(toggles, 'showGrid', true)}
            showDots={isOn(toggles, 'showDots', false)}
            gradient={isOn(toggles, 'gradient', true)}
            curved={isOn(toggles, 'curved', true)}
            animate={isOn(toggles, 'animate', true)}
            valueFormatter={getValueFormatterPreset(getEnum(toggles, 'valueFormatter', 'raw'))}
            onDataPointClick={getCallbackPreset(getEnum(toggles, 'onDataPointClick', 'noop'))}
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
            description={getOptStr(toggles, 'description')}
            className={getOptStr(toggles, 'className')}
            size={sizeFor('lg')}
            donut={isOn(toggles, 'donut', true)}
            showLabels={isOn(toggles, 'showLabels', true)}
            showLegend={isOn(toggles, 'showLegend', false)}
            showPercentage={isOn(toggles, 'showPercentage', true)}
            animate={isOn(toggles, 'animate', true)}
            valueFormatter={getValueFormatterPreset(getEnum(toggles, 'valueFormatter', 'raw'))}
            onDataPointClick={getCallbackPreset(getEnum(toggles, 'onDataPointClick', 'noop'))}
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

    case 'scatter-chart': {
      const themeOverride = getEnum(toggles, 'theme', 'auto');
      const surfaceStyle = getPreviewSurfaceStyle(themeOverride);
      // PR-A2b-ui (Codex thread `019e0fbf` iter-1): the anomaly
      // overlay hook MUST live in its own component, not inside this
      // switch case — calling `useAnomalyOverlay` directly here
      // would conditionally fire a hook depending on the chart id
      // and trip React's "Rules of Hooks". The child component
      // `ScatterAnomalyDemoChart` (defined below the switch) takes
      // every existing prop and the new `showAnomalyPills` toggle.
      return (
        <PreviewBox
          ref={containerRef}
          testId={testId}
          height={finalHeight}
          surfaceStyle={surfaceStyle}
        >
          <ScatterAnomalyDemoChart
            data={values1.map((v, i) => ({ x: v, y: values2[i], label: categories[i] }))}
            title={getStr(toggles, 'title', chartName)}
            description={getOptStr(toggles, 'description')}
            className={getOptStr(toggles, 'className')}
            xLabel={getStr(toggles, 'xLabel', 'Seri A')}
            yLabel={getStr(toggles, 'yLabel', 'Seri B')}
            size={sizeFor('lg')}
            showGrid={isOn(toggles, 'showGrid', true)}
            showLegend={isOn(toggles, 'showLegend', false)}
            bubble={isOn(toggles, 'bubble', false)}
            noDataText={getStr(toggles, 'noDataText', 'Veri yok')}
            animate={isOn(toggles, 'animate', true)}
            colors={getColorsPreset(getEnum(toggles, 'colors', 'default'))}
            valueFormatter={getValueFormatterPreset(getEnum(toggles, 'valueFormatter', 'raw'))}
            onDataPointClick={getCallbackPreset(getEnum(toggles, 'onDataPointClick', 'noop'))}
            theme={themeOverride}
            decal={getDecal(toggles, 'decal', 'auto')}
            density={getEnum(toggles, 'density', 'auto')}
            accent={getEnum(toggles, 'accent', 'auto')}
            access={getEnum(toggles, 'access', 'full')}
            accessReason={getOptStr(toggles, 'accessReason')}
            showAnomalyPills={isOn(toggles, 'showAnomalyPills', true)}
            enableBrush={isOn(toggles, 'enableBrush', false)}
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
            description={getOptStr(toggles, 'description')}
            className={getOptStr(toggles, 'className')}
            thresholds={getThresholdsPreset(getEnum(toggles, 'thresholds', 'traffic-light'))}
            size={sizeFor('lg')}
            startAngle={getNum(toggles, 'startAngle', 225)}
            endAngle={getNum(toggles, 'endAngle', -45)}
            showProgress={isOn(toggles, 'showProgress', false)}
            splitNumber={getNum(toggles, 'splitNumber', 10)}
            showAxisLabel={isOn(toggles, 'showAxisLabel', true)}
            animate={isOn(toggles, 'animate', true)}
            valueFormatter={getValueFormatterPreset(getEnum(toggles, 'valueFormatter', 'raw'))}
            onDataPointClick={getCallbackPreset(getEnum(toggles, 'onDataPointClick', 'noop'))}
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

    case 'radar-chart': {
      const themeOverride = getEnum(toggles, 'theme', 'auto');
      const surfaceStyle = getPreviewSurfaceStyle(themeOverride);
      return (
        <PreviewBox
          ref={containerRef}
          testId={testId}
          height={finalHeight}
          surfaceStyle={surfaceStyle}
        >
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
            title={getStr(toggles, 'title', chartName)}
            description={getOptStr(toggles, 'description')}
            className={getOptStr(toggles, 'className')}
            shape={getEnum(toggles, 'shape', 'polygon')}
            showArea={isOn(toggles, 'showArea', true)}
            showLabels={isOn(toggles, 'showLabels', true)}
            showLegend={isOn(toggles, 'showLegend', true)}
            splitNumber={getNum(toggles, 'splitNumber', 5)}
            animate={isOn(toggles, 'animate', true)}
            valueFormatter={getValueFormatterPreset(getEnum(toggles, 'valueFormatter', 'raw'))}
            onDataPointClick={getCallbackPreset(getEnum(toggles, 'onDataPointClick', 'noop'))}
            size={sizeFor('lg')}
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

    case 'treemap-chart': {
      const themeOverride = getEnum(toggles, 'theme', 'auto');
      const surfaceStyle = getPreviewSurfaceStyle(themeOverride);
      return (
        <PreviewBox
          ref={containerRef}
          testId={testId}
          height={finalHeight}
          surfaceStyle={surfaceStyle}
        >
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
            title={getStr(toggles, 'title', chartName)}
            description={getOptStr(toggles, 'description')}
            className={getOptStr(toggles, 'className')}
            size={sizeFor('lg')}
            showLegend={isOn(toggles, 'showLegend', true)}
            showBreadcrumb={isOn(toggles, 'showBreadcrumb', true)}
            leafDepth={getNum(toggles, 'leafDepth', 1)}
            visibleMin={getNum(toggles, 'visibleMin', 300)}
            animate={isOn(toggles, 'animate', true)}
            valueFormatter={getValueFormatterPreset(getEnum(toggles, 'valueFormatter', 'raw'))}
            onDataPointClick={getCallbackPreset(getEnum(toggles, 'onDataPointClick', 'noop'))}
            onNodeClick={getCallbackPreset(getEnum(toggles, 'onNodeClick', 'noop'))}
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

    // PR-X16a (Codex thread 019e32da AGREE): hierarchical node-link
    // tree — ECharts Depth campaign. Org-chart sample: a leadership
    // hierarchy with departman → unvan structure.
    case 'tree-chart': {
      const themeOverride = getEnum(toggles, 'theme', 'auto');
      const surfaceStyle = getPreviewSurfaceStyle(themeOverride);
      return (
        <PreviewBox
          ref={containerRef}
          testId={testId}
          height={finalHeight}
          surfaceStyle={surfaceStyle}
        >
          <TreeChart
            data={[
              {
                name: 'Genel Müdür',
                children: [
                  {
                    name: 'İK Direktörü',
                    children: [
                      { name: 'İşe Alım Uzmanı', value: 8 },
                      { name: 'İK Operasyon Uzmanı', value: 12 },
                      { name: 'Bordro Uzmanı', value: 5 },
                    ],
                  },
                  {
                    name: 'Mühendislik Direktörü',
                    children: [
                      { name: 'Frontend Ekibi', value: 20 },
                      { name: 'Backend Ekibi', value: 25 },
                      { name: 'DevOps Ekibi', value: 9 },
                    ],
                  },
                  {
                    name: 'Finans Direktörü',
                    children: [
                      { name: 'Muhasebe', value: 14 },
                      { name: 'Bütçe Planlama', value: 6 },
                    ],
                  },
                ],
              },
            ]}
            title={getStr(toggles, 'title', chartName)}
            description={getOptStr(toggles, 'description')}
            className={getOptStr(toggles, 'className')}
            size={sizeFor('lg')}
            layout={getEnum(toggles, 'layout', 'orthogonal')}
            orient={getEnum(toggles, 'orient', 'LR')}
            initialTreeDepth={getNum(toggles, 'initialTreeDepth', 2)}
            expandAndCollapse={isOn(toggles, 'expandAndCollapse', true)}
            roam={isOn(toggles, 'roam', false)}
            symbolSize={getNum(toggles, 'symbolSize', 10)}
            showLabels={isOn(toggles, 'showLabels', true)}
            animate={isOn(toggles, 'animate', true)}
            valueFormatter={getValueFormatterPreset(getEnum(toggles, 'valueFormatter', 'raw'))}
            valueColumnHeader={getStr(toggles, 'valueColumnHeader', 'Personel')}
            onDataPointClick={getCallbackPreset(getEnum(toggles, 'onDataPointClick', 'noop'))}
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

    // PR-X16b (Codex thread 019e33a9 AGREE): GitHub-contributions-style
    // daily calendar heatmap — ECharts Depth campaign. Sample dataset:
    // ~50 daily activity points spanning Jan→Apr 2026.
    case 'calendar-heatmap': {
      const themeOverride = getEnum(toggles, 'theme', 'auto');
      const surfaceStyle = getPreviewSurfaceStyle(themeOverride);
      return (
        <PreviewBox
          ref={containerRef}
          testId={testId}
          height={finalHeight}
          surfaceStyle={surfaceStyle}
        >
          <CalendarHeatmap
            data={[
              { date: '2026-01-02', value: 4 },
              { date: '2026-01-05', value: 9 },
              { date: '2026-01-06', value: 12 },
              { date: '2026-01-09', value: 3 },
              { date: '2026-01-13', value: 7 },
              { date: '2026-01-15', value: 15 },
              { date: '2026-01-19', value: 6 },
              { date: '2026-01-22', value: 11 },
              { date: '2026-01-26', value: 2 },
              { date: '2026-01-28', value: 8 },
              { date: '2026-01-30', value: 14 },
              { date: '2026-02-02', value: 5 },
              { date: '2026-02-04', value: 18 },
              { date: '2026-02-06', value: 10 },
              { date: '2026-02-09', value: 7 },
              { date: '2026-02-11', value: 13 },
              { date: '2026-02-13', value: 1 },
              { date: '2026-02-16', value: 9 },
              { date: '2026-02-18', value: 16 },
              { date: '2026-02-20', value: 4 },
              { date: '2026-02-23', value: 12 },
              { date: '2026-02-25', value: 6 },
              { date: '2026-02-27', value: 19 },
              { date: '2026-03-02', value: 8 },
              { date: '2026-03-04', value: 3 },
              { date: '2026-03-06', value: 11 },
              { date: '2026-03-09', value: 14 },
              { date: '2026-03-11', value: 5 },
              { date: '2026-03-13', value: 17 },
              { date: '2026-03-16', value: 7 },
              { date: '2026-03-18', value: 10 },
              { date: '2026-03-20', value: 2 },
              { date: '2026-03-23', value: 13 },
              { date: '2026-03-25', value: 9 },
              { date: '2026-03-27', value: 20 },
              { date: '2026-03-30', value: 6 },
              { date: '2026-04-01', value: 11 },
              { date: '2026-04-03', value: 4 },
              { date: '2026-04-06', value: 15 },
              { date: '2026-04-08', value: 8 },
              { date: '2026-04-10', value: 12 },
              { date: '2026-04-13', value: 3 },
              { date: '2026-04-15', value: 16 },
              { date: '2026-04-17', value: 7 },
              { date: '2026-04-20', value: 10 },
              { date: '2026-04-22', value: 5 },
              { date: '2026-04-24', value: 18 },
              { date: '2026-04-27', value: 9 },
              { date: '2026-04-29', value: 13 },
            ]}
            range="2026"
            title={getStr(toggles, 'title', chartName)}
            description={getOptStr(toggles, 'description')}
            className={getOptStr(toggles, 'className')}
            orient={getEnum(toggles, 'orient', 'horizontal')}
            startOfWeek={getEnum(toggles, 'startOfWeek', 'monday')}
            min={getOptNum(toggles, 'min')}
            max={getOptNum(toggles, 'max')}
            colors={
              getColorsPreset(getEnum(toggles, 'colors', 'default')) as [string, string] | undefined
            }
            showValues={isOn(toggles, 'showValues', false)}
            showVisualMap={isOn(toggles, 'showVisualMap', true)}
            animate={isOn(toggles, 'animate', true)}
            valueFormatter={getValueFormatterPreset(getEnum(toggles, 'valueFormatter', 'raw'))}
            onDataPointClick={getCallbackPreset(getEnum(toggles, 'onDataPointClick', 'noop'))}
            size={sizeFor('lg')}
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

    case 'heatmap-chart': {
      const themeOverride = getEnum(toggles, 'theme', 'auto');
      const surfaceStyle = getPreviewSurfaceStyle(themeOverride);
      return (
        <PreviewBox
          ref={containerRef}
          testId={testId}
          height={finalHeight}
          surfaceStyle={surfaceStyle}
        >
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
            title={getStr(toggles, 'title', chartName)}
            description={getOptStr(toggles, 'description')}
            className={getOptStr(toggles, 'className')}
            min={getOptNum(toggles, 'min')}
            max={getOptNum(toggles, 'max')}
            colors={
              getColorsPreset(getEnum(toggles, 'colors', 'default')) as [string, string] | undefined
            }
            showValues={isOn(toggles, 'showValues', true)}
            showLegend={isOn(toggles, 'showLegend', true)}
            animate={isOn(toggles, 'animate', true)}
            valueFormatter={getValueFormatterPreset(getEnum(toggles, 'valueFormatter', 'raw'))}
            onDataPointClick={getCallbackPreset(getEnum(toggles, 'onDataPointClick', 'noop'))}
            onCellClick={getCallbackPreset(getEnum(toggles, 'onCellClick', 'noop'))}
            size={sizeFor('lg')}
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

    case 'waterfall-chart': {
      const themeOverride = getEnum(toggles, 'theme', 'auto');
      const surfaceStyle = getPreviewSurfaceStyle(themeOverride);
      return (
        <PreviewBox
          ref={containerRef}
          testId={testId}
          height={finalHeight}
          surfaceStyle={surfaceStyle}
        >
          <WaterfallChart
            data={[
              { label: 'Başlangıç', value: 1000 },
              { label: 'Gelir', value: 300 },
              { label: 'Hizmet', value: 200 },
              { label: 'Gider', value: -150 },
              { label: 'Vergi', value: -100 },
              { label: 'Sonuç', value: 1250 },
            ]}
            title={getStr(toggles, 'title', chartName)}
            description={getOptStr(toggles, 'description')}
            className={getOptStr(toggles, 'className')}
            showValues={isOn(toggles, 'showValues', true)}
            showConnector={isOn(toggles, 'showConnector', true)}
            orientation={getEnum(toggles, 'orientation', 'vertical')}
            showLegend={isOn(toggles, 'showLegend', false)}
            animate={isOn(toggles, 'animate', true)}
            valueFormatter={getValueFormatterPreset(getEnum(toggles, 'valueFormatter', 'raw'))}
            onDataPointClick={getCallbackPreset(getEnum(toggles, 'onDataPointClick', 'noop'))}
            size={sizeFor('lg')}
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

    case 'funnel-chart': {
      const themeOverride = getEnum(toggles, 'theme', 'auto');
      const surfaceStyle = getPreviewSurfaceStyle(themeOverride);
      return (
        <PreviewBox
          ref={containerRef}
          testId={testId}
          height={finalHeight}
          surfaceStyle={surfaceStyle}
        >
          <FunnelChart
            data={[
              { name: 'Ziyaret', value: 5000 },
              { name: 'Kayıt', value: 3000 },
              { name: 'Deneme', value: 1500 },
              { name: 'Satın Alma', value: 500 },
            ]}
            title={getStr(toggles, 'title', chartName)}
            description={getOptStr(toggles, 'description')}
            className={getOptStr(toggles, 'className')}
            sort={getEnum(toggles, 'sort', 'descending')}
            gap={getNum(toggles, 'gap', 2)}
            showLabels={isOn(toggles, 'showLabels', true)}
            labelPosition={getEnum(toggles, 'labelPosition', 'inside')}
            showConversion={isOn(toggles, 'showConversion', true)}
            orientation={getEnum(toggles, 'orientation', 'vertical')}
            funnelAlign={getEnum(toggles, 'funnelAlign', 'center')}
            showLegend={isOn(toggles, 'showLegend', false)}
            animate={isOn(toggles, 'animate', true)}
            valueFormatter={getValueFormatterPreset(getEnum(toggles, 'valueFormatter', 'raw'))}
            onDataPointClick={getCallbackPreset(getEnum(toggles, 'onDataPointClick', 'noop'))}
            size={sizeFor('lg')}
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

    case 'sankey-chart': {
      const themeOverride = getEnum(toggles, 'theme', 'auto');
      const surfaceStyle = getPreviewSurfaceStyle(themeOverride);
      return (
        <PreviewBox
          ref={containerRef}
          testId={testId}
          height={finalHeight}
          surfaceStyle={surfaceStyle}
        >
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
            title={getStr(toggles, 'title', chartName)}
            description={getOptStr(toggles, 'description')}
            className={getOptStr(toggles, 'className')}
            orient={getEnum(toggles, 'orient', 'horizontal')}
            nodeWidth={getNum(toggles, 'nodeWidth', 20)}
            nodeGap={getNum(toggles, 'nodeGap', 8)}
            draggable={isOn(toggles, 'draggable', true)}
            lineStyle={getEnum(toggles, 'lineStyle', 'gradient')}
            showLegend={isOn(toggles, 'showLegend', false)}
            animate={isOn(toggles, 'animate', true)}
            valueFormatter={getValueFormatterPreset(getEnum(toggles, 'valueFormatter', 'raw'))}
            onDataPointClick={getCallbackPreset(getEnum(toggles, 'onDataPointClick', 'noop'))}
            onNodeClick={getCallbackPreset(getEnum(toggles, 'onNodeClick', 'noop'))}
            size={sizeFor('lg')}
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

    case 'sunburst-chart': {
      const themeOverride = getEnum(toggles, 'theme', 'auto');
      const surfaceStyle = getPreviewSurfaceStyle(themeOverride);
      return (
        <PreviewBox
          ref={containerRef}
          testId={testId}
          height={finalHeight}
          surfaceStyle={surfaceStyle}
        >
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
            title={getStr(toggles, 'title', chartName)}
            description={getOptStr(toggles, 'description')}
            className={getOptStr(toggles, 'className')}
            sort={getEnum(toggles, 'sort', 'desc')}
            highlightPolicy={getEnum(toggles, 'highlightPolicy', 'descendant')}
            showLegend={isOn(toggles, 'showLegend', false)}
            animate={isOn(toggles, 'animate', true)}
            valueFormatter={getValueFormatterPreset(getEnum(toggles, 'valueFormatter', 'raw'))}
            onDataPointClick={getCallbackPreset(getEnum(toggles, 'onDataPointClick', 'noop'))}
            onNodeClick={getCallbackPreset(getEnum(toggles, 'onNodeClick', 'noop'))}
            size={sizeFor('lg')}
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

    // ──────────────────────────────────────────────────────────────
    // Faz 21.11 P1a-P1d 3D Extension Pack — live preview support.
    // Each wrapper lazy-loads `echarts-gl`; if WebGL is missing the
    // wrapper degrades to its own "WebGL unavailable" banner so the
    // preview surface stays graceful instead of crashing the page.
    // Data fixtures kept compact (4-8 points) for fast initial paint.
    // ──────────────────────────────────────────────────────────────
    case 'scatter-3d-chart': {
      const themeOverride = getEnum(toggles, 'theme', 'auto');
      const surfaceStyle = getPreviewSurfaceStyle(themeOverride);
      return (
        <PreviewBox
          ref={containerRef}
          testId={testId}
          height={finalHeight}
          surfaceStyle={surfaceStyle}
        >
          <Scatter3D
            // Stable module-scope fixture — keeps reference identity
            // across PlaygroundTab re-renders so the wrapper's option
            // memo deps don't flap and trigger a setOption flood.
            data={
              SCATTER_3D_FIXTURE as unknown as Array<{
                x: number;
                y: number;
                z: number;
                label?: string;
              }>
            }
            title={getStr(toggles, 'title', chartName)}
            description={getOptStr(toggles, 'description')}
            className={getOptStr(toggles, 'className')}
            animate={isOn(toggles, 'animate', true)}
            size={sizeFor('lg')}
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

    case 'surface-3d-chart': {
      const themeOverride = getEnum(toggles, 'theme', 'auto');
      const surfaceStyle = getPreviewSurfaceStyle(themeOverride);
      // Stable 6×6 surface mesh (z = sin(c/1.5) + cos(r/1.5)) hoisted
      // to module scope so dataShape + data references stay identical
      // across re-renders. JSX-inline arrays here previously triggered
      // the wrapper's option memo to recompute every tick which left
      // the canvas in an unmount-mount limbo (live cluster smoke
      // 2026-05-12 confirmed an empty container in that path).
      return (
        <PreviewBox
          ref={containerRef}
          testId={testId}
          height={finalHeight}
          surfaceStyle={surfaceStyle}
        >
          <Surface3D
            data={SURFACE_3D_FIXTURE as unknown as Array<{ x: number; y: number; z: number }>}
            dataShape={SURFACE_3D_SHAPE}
            title={getStr(toggles, 'title', chartName)}
            description={getOptStr(toggles, 'description')}
            className={getOptStr(toggles, 'className')}
            animate={isOn(toggles, 'animate', true)}
            size={sizeFor('lg')}
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

    case 'lines-3d-chart': {
      const themeOverride = getEnum(toggles, 'theme', 'auto');
      const surfaceStyle = getPreviewSurfaceStyle(themeOverride);
      // Stable two-path helix + swirl fixture hoisted to module
      // scope (live cluster smoke 2026-05-12: JSX-inline coords
      // recomputed on every render → option memo flood → empty
      // canvas).
      return (
        <PreviewBox
          ref={containerRef}
          testId={testId}
          height={finalHeight}
          surfaceStyle={surfaceStyle}
        >
          <Lines3D
            data={
              LINES_3D_FIXTURE as unknown as Array<{
                label: string;
                coords: ReadonlyArray<readonly [number, number, number]>;
              }>
            }
            title={getStr(toggles, 'title', chartName)}
            description={getOptStr(toggles, 'description')}
            className={getOptStr(toggles, 'className')}
            lineWidth={getNum(toggles, 'lineWidth', 2)}
            animate={isOn(toggles, 'animate', true)}
            size={sizeFor('lg')}
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

    case 'globe-chart': {
      const themeOverride = getEnum(toggles, 'theme', 'auto');
      const surfaceStyle = getPreviewSurfaceStyle(themeOverride);
      // Stable layers + cities fixture hoisted to module scope
      // (live cluster smoke 2026-05-12: JSX-inline layers array
      // recomputed every render → Globe option memo recompute
      // flood → echarts-gl canvas mount stalled).
      return (
        <PreviewBox
          ref={containerRef}
          testId={testId}
          height={finalHeight}
          surfaceStyle={surfaceStyle}
        >
          <Globe
            layers={
              GLOBE_FIXTURE_LAYERS as unknown as Array<{
                type: 'scatter3D';
                name?: string;
                data: Array<{ lon: number; lat: number; label?: string; value?: number }>;
              }>
            }
            title={getStr(toggles, 'title', chartName)}
            description={getOptStr(toggles, 'description')}
            className={getOptStr(toggles, 'className')}
            animate={isOn(toggles, 'animate', true)}
            size={sizeFor('lg')}
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

    // ─────────────────────────────────────────────────────────────────
    // PR-X campaign live previews (Codex 019e22b6 follow-up): 6 new
    // wrappers wired into the design-lab playground. Each case mirrors
    // the canonical pattern (PreviewBox + chart instance + toggles
    // forwarded from PlaygroundState). Sample data inline so the
    // preview never depends on remote fixtures.
    // ─────────────────────────────────────────────────────────────────

    case 'box-plot-chart': {
      const themeOverride = getEnum(toggles, 'theme', 'auto');
      const surfaceStyle = getPreviewSurfaceStyle(themeOverride);
      return (
        <PreviewBox
          ref={containerRef}
          testId={testId}
          height={finalHeight}
          surfaceStyle={surfaceStyle}
        >
          <BoxPlotChart
            data={[
              { category: 'Q1', quartiles: [10, 22, 30, 38, 50] },
              { category: 'Q2', quartiles: [12, 25, 34, 42, 55] },
              { category: 'Q3', quartiles: [14, 28, 36, 44, 58], outliers: [8, 62] },
              { category: 'Q4', quartiles: [16, 30, 40, 48, 60] },
            ]}
            title={getStr(toggles, 'title', chartName)}
            description={getOptStr(toggles, 'description')}
            className={getOptStr(toggles, 'className')}
            orientation={getEnum(toggles, 'orientation', 'vertical') as 'vertical' | 'horizontal'}
            showGrid={isOn(toggles, 'showGrid', true)}
            showLegend={isOn(toggles, 'showLegend', false)}
            showOutliers={isOn(toggles, 'showOutliers', true)}
            animate={isOn(toggles, 'animate', true)}
            size={sizeFor('lg')}
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

    case 'candlestick-chart': {
      const themeOverride = getEnum(toggles, 'theme', 'auto');
      const surfaceStyle = getPreviewSurfaceStyle(themeOverride);
      return (
        <PreviewBox
          ref={containerRef}
          testId={testId}
          height={finalHeight}
          surfaceStyle={surfaceStyle}
        >
          <CandlestickChart
            data={[
              { label: '2026-05-10', open: 100, close: 110, low: 95, high: 115 },
              { label: '2026-05-11', open: 110, close: 105, low: 102, high: 112 },
              { label: '2026-05-12', open: 105, close: 118, low: 104, high: 120 },
              { label: '2026-05-13', open: 118, close: 124, low: 116, high: 128 },
              { label: '2026-05-14', open: 124, close: 119, low: 117, high: 126 },
            ]}
            title={getStr(toggles, 'title', chartName)}
            description={getOptStr(toggles, 'description')}
            className={getOptStr(toggles, 'className')}
            // Codex 019e22ea iter-1 absorb: bullish/bearish colour
            // overrides are real public props on the wrapper; wire
            // them through so the playground editor can edit them
            // live (matches the LIVE_PROP_SUPPORT entry).
            bullishColor={getOptStr(toggles, 'bullishColor')}
            bearishColor={getOptStr(toggles, 'bearishColor')}
            showGrid={isOn(toggles, 'showGrid', true)}
            showLegend={isOn(toggles, 'showLegend', false)}
            animate={isOn(toggles, 'animate', true)}
            size={sizeFor('lg')}
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

    case 'pictorial-bar-chart': {
      const themeOverride = getEnum(toggles, 'theme', 'auto');
      const surfaceStyle = getPreviewSurfaceStyle(themeOverride);
      return (
        <PreviewBox
          ref={containerRef}
          testId={testId}
          height={finalHeight}
          surfaceStyle={surfaceStyle}
        >
          <PictorialBarChart
            data={[
              { label: 'Eng', value: 12 },
              { label: 'Sales', value: 8 },
              { label: 'HR', value: 5 },
              { label: 'Ops', value: 6 },
              { label: 'Marketing', value: 4 },
            ]}
            title={getStr(toggles, 'title', chartName)}
            description={getOptStr(toggles, 'description')}
            className={getOptStr(toggles, 'className')}
            orientation={getEnum(toggles, 'orientation', 'vertical') as 'vertical' | 'horizontal'}
            symbol={getStr(toggles, 'symbol', 'circle')}
            symbolRepeat={isOn(toggles, 'symbolRepeat', true)}
            // Codex 019e22ea iter-1 absorb: showGrid wired so the
            // playground editor can toggle it (matches BarChart
            // pattern). Wrapper default is `true`.
            showGrid={isOn(toggles, 'showGrid', true)}
            showLegend={isOn(toggles, 'showLegend', false)}
            animate={isOn(toggles, 'animate', true)}
            size={sizeFor('lg')}
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

    case 'parallel-coordinates-chart': {
      const themeOverride = getEnum(toggles, 'theme', 'auto');
      const surfaceStyle = getPreviewSurfaceStyle(themeOverride);
      const groupByVal = getStr(toggles, 'groupBy', 'dept');
      return (
        <PreviewBox
          ref={containerRef}
          testId={testId}
          height={finalHeight}
          surfaceStyle={surfaceStyle}
        >
          <ParallelCoordinatesChart
            data={[
              { dept: 'Eng', salary: 85000, tenure: 5, satisfaction: 8 },
              { dept: 'Eng', salary: 92000, tenure: 7, satisfaction: 9 },
              { dept: 'Sales', salary: 62000, tenure: 3, satisfaction: 6 },
              { dept: 'Sales', salary: 70000, tenure: 4, satisfaction: 7 },
              { dept: 'HR', salary: 55000, tenure: 8, satisfaction: 8 },
              { dept: 'HR', salary: 60000, tenure: 6, satisfaction: 7 },
              { dept: 'Ops', salary: 68000, tenure: 5, satisfaction: 6 },
            ]}
            axes={[
              { field: 'dept', name: 'Department', type: 'category' as const },
              { field: 'salary', name: 'Salary', type: 'value' as const, min: 50000, max: 100000 },
              { field: 'tenure', name: 'Tenure (yr)', type: 'value' as const, min: 0, max: 10 },
              {
                field: 'satisfaction',
                name: 'Satisfaction',
                type: 'value' as const,
                min: 0,
                max: 10,
              },
            ]}
            groupBy={groupByVal === '' ? undefined : groupByVal}
            lineOpacity={getOptNum(toggles, 'lineOpacity') ?? 0.35}
            lineWidth={getOptNum(toggles, 'lineWidth') ?? 1.5}
            showLegend={isOn(toggles, 'showLegend', false)}
            title={getStr(toggles, 'title', chartName)}
            description={getOptStr(toggles, 'description')}
            className={getOptStr(toggles, 'className')}
            animate={isOn(toggles, 'animate', true)}
            size={sizeFor('lg')}
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

    case 'graph-chart': {
      const themeOverride = getEnum(toggles, 'theme', 'auto');
      const surfaceStyle = getPreviewSurfaceStyle(themeOverride);
      return (
        <PreviewBox
          ref={containerRef}
          testId={testId}
          height={finalHeight}
          surfaceStyle={surfaceStyle}
        >
          <GraphChart
            nodes={[
              { id: 'a', name: 'Doc A', value: 8, category: 0 },
              { id: 'b', name: 'Doc B', value: 6, category: 0 },
              { id: 'c', name: 'Doc C', value: 4, category: 0 },
              { id: 'd', name: 'Orphan', value: 1, category: 1 },
              { id: 'e', name: 'Circular', value: 3, category: 2 },
              { id: 'f', name: 'Hub', value: 12, category: 0 },
            ]}
            edges={[
              { source: 'a', target: 'b', value: 2 },
              { source: 'b', target: 'c', value: 1 },
              { source: 'f', target: 'a', value: 3 },
              { source: 'f', target: 'b', value: 2 },
              { source: 'f', target: 'c', value: 2 },
              { source: 'e', target: 'f', value: 1 },
              { source: 'f', target: 'e', value: 1 },
            ]}
            categories={[
              { name: 'Active', color: '#3b82f6' },
              { name: 'Orphan', color: '#f59e0b' },
              { name: 'Cyclic', color: '#ef4444' },
            ]}
            layout={getEnum(toggles, 'layout', 'force') as 'force' | 'circular' | 'none'}
            directed={isOn(toggles, 'directed', true)}
            roam={isOn(toggles, 'roam', true)}
            forceRepulsion={getOptNum(toggles, 'forceRepulsion') ?? 100}
            forceGravity={getOptNum(toggles, 'forceGravity') ?? 0.1}
            forceEdgeLength={getOptNum(toggles, 'forceEdgeLength') ?? 50}
            defaultSymbolSize={getOptNum(toggles, 'defaultSymbolSize') ?? 30}
            // Codex 019e22ea iter-1 absorb: default node symbol shape
            // wired so the playground editor can switch between
            // 'circle' / 'rect' / 'roundRect' / 'diamond' etc.
            symbol={getStr(toggles, 'symbol', 'circle')}
            showLegend={isOn(toggles, 'showLegend', true)}
            title={getStr(toggles, 'title', chartName)}
            description={getOptStr(toggles, 'description')}
            className={getOptStr(toggles, 'className')}
            animate={isOn(toggles, 'animate', true)}
            size={sizeFor('lg')}
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

    case 'geo-map': {
      const themeOverride = getEnum(toggles, 'theme', 'auto');
      const surfaceStyle = getPreviewSurfaceStyle(themeOverride);
      // Codex 019e22ea iter-3 absorb: ALWAYS use the internal namespaced
      // alias — never read `mapName` from the editor. An admin editing
      // the field could type `'TR'` (the canonical consumer slot) and
      // cause the preview's 3-polygon fixture to register under that
      // global ECharts map name, polluting the registry the HR adoption
      // PR (and other consumer routes) try to load real TR provinces
      // into. `mapName` is also removed from `LIVE_PROP_SUPPORT['geo-
      // map']` so the editor doesn't surface it. Generated Code /
      // sampleCode keep teaching `mapName="TR"` as the consumer
      // pattern; only the live preview's internal stub uses the alias.
      const mapName = DESIGN_LAB_GEO_MAP_NAME;
      // Codex 019e22ea iter-1 absorb #6: `selectedMode` wrapper contract
      // is `boolean | 'single' | 'multiple'`. The toggle store returns
      // the literal string `'false'` / `'true'` from the enum control,
      // so we decode it back to the canonical boolean | enum union
      // before handing it to the wrapper. Without this coercion, string
      // `'false'` is truthy in JS and ECharts treats the chart as
      // single-select on every render.
      const selectedModeRaw = getEnum(toggles, 'selectedMode', 'false');
      const selectedMode: boolean | 'single' | 'multiple' =
        selectedModeRaw === 'false'
          ? false
          : selectedModeRaw === 'true'
            ? true
            : (selectedModeRaw as 'single' | 'multiple');
      // Inner component encapsulates the map registration side-effect.
      // The stub GeoJSON is intentionally a 3-feature placeholder so the
      // preview renders shapes (instead of "map not registered" dev
      // warning) without bundling a real TR provinces asset — HR
      // adoption is a separate PR with the licensed Natural Earth
      // payload.
      return (
        <PreviewBox
          ref={containerRef}
          testId={testId}
          height={finalHeight}
          surfaceStyle={surfaceStyle}
        >
          <GeoMapPlaygroundInner
            mapName={mapName}
            nameProperty={getStr(toggles, 'nameProperty', 'name')}
            title={getStr(toggles, 'title', chartName)}
            description={getOptStr(toggles, 'description')}
            className={getOptStr(toggles, 'className')}
            showLabels={isOn(toggles, 'showLabels', false)}
            roam={isOn(toggles, 'roam', true)}
            selectedMode={selectedMode}
            animate={isOn(toggles, 'animate', true)}
            size={sizeFor('lg')}
            theme={themeOverride}
            decal={getDecal(toggles, 'decal', 'auto')}
            density={getEnum(toggles, 'density', 'auto')}
            accent={getEnum(toggles, 'accent', 'auto')}
            access={getEnum(toggles, 'access', 'full')}
            accessReason={getOptStr(toggles, 'accessReason')}
            // PR-X13a (Codex 019e25a2 iter-1 #12): overlay layer
            // demonstration. Toggle ON via Playground `showBubbleOverlay`
            // to surface the bubble overlay on top of the choropleth.
            // 3 HQ points use the same İstanbul/Ankara/İzmir cities so
            // the visual narrative is consistent with the base map.
            overlays={(() => {
              // PR-X13a + PR-X13b: layered overlays demo for design-lab.
              // `showBubbleOverlay` toggle adds a bubble (silent scatter,
              // sqrt-scale symbolSize). `showEffectScatterOverlay` toggle
              // adds an animated pulse layer for critical alert points.
              const layers: import('@mfe/x-charts').GeoOverlay[] = [];
              if (isOn(toggles, 'showBubbleOverlay', false)) {
                layers.push({
                  type: 'bubble',
                  name: 'HQ Headcount',
                  data: [
                    { name: 'İstanbul HQ', coordinates: [29.0, 41.0], value: 1200 },
                    { name: 'Ankara HQ', coordinates: [32.85, 39.93], value: 800 },
                    { name: 'İzmir Ofis', coordinates: [27.14, 38.42], value: 450 },
                  ],
                  symbol: 'circle',
                  opacity: 0.7,
                  showLabels: true,
                  color: '#dc2626',
                });
              }
              if (isOn(toggles, 'showEffectScatterOverlay', false)) {
                layers.push({
                  type: 'effectScatter',
                  name: 'Critical Alerts',
                  data: [
                    { name: 'Bursa Hub', coordinates: [29.06, 40.18], value: 9 },
                    { name: 'Adana Site', coordinates: [35.32, 37.0], value: 7 },
                  ],
                  symbol: 'pin',
                  symbolSize: 18,
                  ripplePeriod: 3,
                  rippleScale: 3,
                  color: '#f59e0b',
                  showLabels: true,
                });
              }
              // PR-X13c (Codex 019e25d4 iter-2 AGREE): flow overlay
              // demonstrates origin-destination edges via ECharts `lines`
              // series. Demo edges stay within the placeholder GeoJSON
              // viewport (İstanbul/Ankara/İzmir) so the curves remain
              // visible on the synthetic 3-feature map.
              if (isOn(toggles, 'showFlowOverlay', false)) {
                layers.push({
                  type: 'flow',
                  name: 'Logistics Flow',
                  data: [
                    {
                      fromName: 'İstanbul',
                      toName: 'Ankara',
                      from: [29.0, 41.0],
                      to: [32.85, 39.93],
                      value: 800,
                    },
                    {
                      fromName: 'İstanbul',
                      toName: 'İzmir',
                      from: [29.0, 41.0],
                      to: [27.14, 38.42],
                      value: 600,
                    },
                    {
                      fromName: 'Ankara',
                      toName: 'İzmir',
                      from: [32.85, 39.93],
                      to: [27.14, 38.42],
                      value: 400,
                    },
                  ],
                  color: '#2563eb',
                  curveness: 0.25,
                  minWidth: 1.5,
                  maxWidth: 6,
                  showEffect: true,
                });
              }
              // PR-X13d (Codex 019e25ee iter-3 AGREE): heatmap density
              // overlay. Demo points cluster around the 3 placeholder
              // GeoJSON cities so the density blob renders inside the
              // visible viewport. Each point's `value` represents an
              // event count; ECharts renders a smoothed blob via
              // pointSize + blurSize and color-codes via the dedicated
              // heatmap visualMap (separate from the base choropleth).
              if (isOn(toggles, 'showHeatmapOverlay', false)) {
                layers.push({
                  type: 'heatmap',
                  name: 'Events Density',
                  data: [
                    // İstanbul cluster (high density)
                    { coordinates: [29.0, 41.0], value: 95 },
                    { coordinates: [29.05, 41.02], value: 80 },
                    { coordinates: [28.95, 40.98], value: 70 },
                    { coordinates: [29.1, 41.05], value: 65 },
                    // Ankara cluster (medium density)
                    { coordinates: [32.85, 39.93], value: 55 },
                    { coordinates: [32.9, 39.95], value: 40 },
                    { coordinates: [32.8, 39.9], value: 35 },
                    // İzmir cluster (low density)
                    { coordinates: [27.14, 38.42], value: 30 },
                    { coordinates: [27.2, 38.45], value: 25 },
                    { coordinates: [27.1, 38.4], value: 20 },
                  ],
                  pointSize: 25,
                  blurSize: 35,
                  maxOpacity: 0.7,
                });
              }
              // PR-X13e (Codex 019e2614 plan-time AGREE): marker
              // overlay demonstrates declarative SVG/icon points.
              // Demo uses both built-in `pin` preset (default) and a
              // per-datum `diamond` override + custom `path://` SVG
              // override to exercise the safe-symbol validation path.
              if (isOn(toggles, 'showMarkerOverlay', false)) {
                layers.push({
                  type: 'marker',
                  name: 'Branch Locations',
                  data: [
                    {
                      name: 'İstanbul HQ',
                      coordinates: [29.0, 41.0],
                      value: 1500,
                      symbol: 'diamond',
                      symbolSize: 22,
                      color: '#7c3aed',
                    },
                    {
                      name: 'Ankara Office',
                      coordinates: [32.85, 39.93],
                      value: 800,
                      // default 'pin' (layer-level)
                    },
                    {
                      name: 'İzmir Branch',
                      coordinates: [27.14, 38.42],
                      value: 450,
                      // Custom SVG path: simple star shape
                      symbol:
                        'path://M12,2 L15,9 L22,9 L17,14 L19,21 L12,17 L5,21 L7,14 L2,9 L9,9 Z',
                      symbolSize: 24,
                      color: '#f59e0b',
                    },
                  ],
                  symbol: 'pin',
                  symbolSize: 18,
                  color: '#0ea5e9',
                  showLabels: true,
                });
              }
              return layers.length > 0 ? layers : undefined;
            })()}
          />
        </PreviewBox>
      );
    }

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
      // Faz 21.11 PR-A2c-adopt: stacked the new scatter brush
      // demo underneath so both adoption paths share a single
      // chart-id without duplicating navigation. The bar/grid
      // demo proves click-driven cross-filter (legacy); the
      // scatter/grid demo proves brush-driven cross-filter
      // (PR-A2c helper layer + PR-A2c-wire ScatterChart prop +
      // PR-A2c-adopt useGridCrossFilter brush merge).
      return (
        <div
          data-testid={testId}
          style={{ width: '100%', maxWidth: 720, background: 'var(--surface-canvas, #ffffff)' }}
        >
          <CrossFilterGridDemoLive />
          <div
            style={{
              marginTop: 24,
              paddingTop: 16,
              borderTop: '1px solid var(--border-subtle, #e5e7eb)',
            }}
          >
            <ScatterBrushGridDemoLive />
          </div>
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

/* ------------------------------------------------------------------ */
/*  PR-A2b-ui — Scatter explanation pill demo child                    */
/*                                                                     */
/*  Codex thread `019e0fbf` iter-1 explicitly required hoisting the    */
/*  hook out of the switch case so React's "Rules of Hooks" stays      */
/*  honoured (the switch picks a chart per render, calling the hook    */
/*  conditionally would split between renders).                        */
/*                                                                     */
/*  `showAnomalyPills` defaults to ON so the design-lab scatter        */
/*  route surfaces the new anomaly explanation pill on first load —    */
/*  Codex thread `019e0fcb` iter-2 RED #2/#3 caught that the demo      */
/*  was previously invisible (no toggle wiring + flat sample data).    */
/*  When the flag is on, the IQR-detected anomalies surface as         */
/*  warning-tinted "Outlier: y=…" pills on top of the existing         */
/*  scatter data points; click flows through the chart's standard      */
/*  `onMarkupClick` (still wired by the switch above) so consumers     */
/*  decide whether to open a modal, a sidebar, or just log.            */
/* ------------------------------------------------------------------ */

interface ScatterAnomalyDemoChartProps extends React.ComponentProps<typeof ScatterChart> {
  showAnomalyPills?: boolean;
}

/**
 * Inject one obvious high-side outlier so the IQR fence has
 * something to flag. The mock scatter dataset that ships with
 * `ChartPreviewLive` is too flat (Codex iter-2 RED #3 — vanilla y
 * series sits inside the fence) and would otherwise leave the
 * overlay invisible. We add a single `(maxX + 1, max(y) * 4)`
 * point so the demo shows BOTH the marker and the warning-tinted
 * pill without changing the rest of the playground sample.
 */
function injectDemoOutlier<T extends { x: number; y: number; label?: string }>(data: T[]): T[] {
  if (data.length === 0) return data;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const d of data) {
    if (typeof d.x === 'number' && d.x > maxX) maxX = d.x;
    if (typeof d.y === 'number' && d.y > maxY) maxY = d.y;
  }
  const outlier = {
    x: Number.isFinite(maxX) ? maxX + 1 : data.length,
    y: Number.isFinite(maxY) ? Math.max(maxY * 4, maxY + 100) : 100,
    label: 'Anomaly demo spike',
  } as T;
  return [...data, outlier];
}

const ScatterAnomalyDemoChart: React.FC<ScatterAnomalyDemoChartProps> = ({
  showAnomalyPills = true,
  enableBrush = false,
  data,
  valueFormatter,
  onBrushSelection,
  ...rest
}) => {
  // When the demo toggle is on we extend the dataset with a guaranteed
  // outlier so the overlay actually has something to highlight; the
  // augmented array is what we feed BOTH the chart and the hook.
  const augmentedData = React.useMemo(
    () => (showAnomalyPills ? injectDemoOutlier(data) : data),
    [data, showAnomalyPills],
  );
  const overlayInput = React.useMemo(
    () =>
      showAnomalyPills
        ? augmentedData.map((d) => ({ x: d.x, y: d.y }))
        : ([] as ReadonlyArray<{ x: number; y: number }>),
    [augmentedData, showAnomalyPills],
  );
  const anomalyMarkups = useAnomalyOverlay({
    data: overlayInput as { x: number; y: number }[],
    labelVariant: 'pill',
    maxPills: 20,
    idPrefix: 'scatter-demo-anomaly',
    valueFormatter,
  });

  // PR-A2c-wire demo: status pill that reflects the most recent brush
  // selection. Lets the design-lab tester SEE that the brush wiring
  // is alive without an AG Grid mounted on top (that lands in
  // PR-A2c-adopt). Falls back to a neutral hint when brush is off.
  const [brushStatus, setBrushStatus] = React.useState<string>(
    enableBrush ? 'Henüz seçim yok' : 'Brush kapalı',
  );
  React.useEffect(() => {
    setBrushStatus(enableBrush ? 'Henüz seçim yok' : 'Brush kapalı');
  }, [enableBrush]);

  const handleBrushSelection = React.useCallback<NonNullable<typeof onBrushSelection>>(
    (selection) => {
      if (selection === null) {
        setBrushStatus('Seçim temizlendi');
      } else {
        const fromX = selection.from.x ?? '·';
        const fromY = selection.from.y ?? '·';
        const toX = selection.to.x ?? '·';
        const toY = selection.to.y ?? '·';
        setBrushStatus(
          `${selection.indices.length} satır · x:[${fromX}, ${toX}] · y:[${fromY}, ${toY}]`,
        );
      }
      onBrushSelection?.(selection);
    },
    [onBrushSelection],
  );

  return (
    <div
      data-testid="scatter-anomaly-demo-shell"
      style={enableBrush ? { position: 'relative', height: '100%' } : undefined}
    >
      <ScatterChart
        {...rest}
        data={augmentedData}
        valueFormatter={valueFormatter}
        markups={showAnomalyPills ? anomalyMarkups : undefined}
        enableBrush={enableBrush}
        onBrushSelection={enableBrush ? handleBrushSelection : undefined}
      />
      {enableBrush && (
        // Codex iter-3 PR-A2c-wire §1: PreviewBox is `overflow:
        // hidden` with a fixed height, so a normal-flow status pill
        // below the chart gets clipped. Render as an absolute
        // overlay anchored to the lower-right corner with a low
        // z-index so the brush rectangle stays interactive over
        // the chart canvas.
        <div
          data-testid="scatter-anomaly-demo-brush-status"
          style={{
            position: 'absolute',
            right: 8,
            bottom: 8,
            zIndex: 1,
            padding: '4px 8px',
            borderRadius: 4,
            background: 'var(--surface-muted, #f3f4f6)',
            color: 'var(--text-primary, #111827)',
            fontSize: 12,
            fontFamily: 'var(--font-family-mono, ui-monospace, monospace)',
            pointerEvents: 'none',
            maxWidth: 'calc(100% - 16px)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            boxShadow: 'var(--shadow-sm, 0 1px 2px var(--shadow-color, transparent))',
          }}
        >
          Brush: {brushStatus}
        </div>
      )}
    </div>
  );
};

export default ChartPreviewLive;
