/**
 * SSR Subpath — `@mfe/x-charts/ssr`
 *
 * Server-safe re-exports — types and pure helpers only. Anything that
 * imports ECharts, touches the DOM, or uses React hooks is intentionally
 * routed through `@mfe/x-charts/client` instead.
 *
 * Faz 21.8 PR-X2: previously this file used `'use client'` and re-exported
 * ChartContainer + ChartDashboard, which is the opposite of what an SSR
 * boundary should be. Those components now live in `./client` (still
 * `'use client'`-marked at the file level), and this barrel is reserved
 * for genuinely server-safe public types.
 *
 * Usage in RSC context:
 * ```tsx
 * // server component / RSC
 * import type { ChartSpec, BarChartProps } from '@mfe/x-charts/ssr';
 * // client component
 * import { BarChart } from '@mfe/x-charts/client';
 * ```
 *
 * @see R-004 risk: ECharts SSR incompatibility
 * @see PR #174 (reality-parity plan)
 */

/* ------------------------------------------------------------------ */
/*  Public type re-exports (no runtime, no DOM)                        */
/* ------------------------------------------------------------------ */

// Chart wrapper prop types — re-exported as types only so consumers in
// server components can declare props without pulling in ECharts.
export type { AreaChartProps } from '../AreaChart';
export type { BarChartProps } from '../BarChart';
export type { FunnelChartProps } from '../FunnelChart';
export type { GaugeChartProps } from '../GaugeChart';
export type { HeatmapChartProps } from '../HeatmapChart';
export type { LineChartProps } from '../LineChart';
export type { PieChartProps } from '../PieChart';
export type { RadarChartProps } from '../RadarChart';
export type { SankeyChartProps } from '../SankeyChart';
export type { ScatterChartProps } from '../ScatterChart';
// Codex thread 019e425b AGREE: standalone effectScatter wrapper public
// type surface (RSC consumers declare props without pulling ECharts).
export type {
  EffectScatterChartProps,
  EffectScatterDataPoint,
  EffectScatterRippleEffect,
} from '../EffectScatterChart';
// Codex thread 019e4277 AGREE: standalone cartesian3D bar3D wrapper.
export type { Bar3DChartProps, Bar3DDataPoint, Bar3DShading } from '../Bar3DChart';
// Faz 21.11 P1a — 3D Extension Pack public type surface (no runtime).
// P1c adds GlobeProps.
export type { Scatter3DProps, Scatter3DDataPoint } from '../Scatter3D';
// Faz 21.11 P1b — Surface3D + Lines3D type-only public surface.
export type { Surface3DProps, Surface3DDataPoint, Surface3DShading } from '../Surface3D';
export type { Lines3DProps, Lines3DPath } from '../Lines3D';
// Faz 21.11 P1c — Globe type-only surface.
export type {
  GlobeProps,
  GlobeLayer,
  GlobeScatterDatum,
  GlobeLineDatum,
  GlobeRegion,
} from '../Globe';
export type { SunburstChartProps } from '../SunburstChart';
export type { TreemapChartProps } from '../TreemapChart';
export type { WaterfallChartProps } from '../WaterfallChart';

// PR-X6 / X7 / X10 / X12 / X16 campaign wrapper prop types (type-only).
export type { TreeChartProps, TreeNode, TreeLayout, TreeOrient } from '../TreeChart';
export type {
  CalendarHeatmapProps,
  CalendarHeatmapDataPoint,
  CalendarHeatmapOrient,
  CalendarHeatmapCellSize,
  CalendarWeekStart,
} from '../CalendarHeatmap';
export type { PolarChartProps, PolarChartDataPoint, PolarSeriesType } from '../PolarChart';
export type { ThemeRiverChartProps, ThemeRiverDataPoint } from '../ThemeRiverChart';
export type { GanttChartProps, GanttTask } from '../GanttChart';
export type { BoxPlotChartProps, BoxPlotDataPoint } from '../BoxPlotChart';
export type { CandlestickChartProps, CandlestickDataPoint } from '../CandlestickChart';
export type { PictorialBarChartProps, PictorialBarDataPoint } from '../PictorialBarChart';
export type { ParallelCoordinatesChartProps, ParallelAxisDef } from '../ParallelCoordinatesChart';
export type {
  GraphChartProps,
  GraphNode,
  GraphEdge,
  GraphCategory,
  GraphLayoutMode,
} from '../GraphChart';
export type { GeoMapProps, GeoMapDatum, GeoMapVisualMap } from '../GeoMap';
// GeoMap loader + overlay prop type surface (type-only — `export type`
// erases the import, so the ECharts-runtime `registerGeoMap` module is
// never pulled into this server-safe barrel).
export type { GeoJsonFeatureCollection, GeoMapLoader } from '../geo/registerGeoMap';
export type {
  GeoOverlay,
  GeoBubbleLayer,
  GeoEffectScatterLayer,
  GeoFlowLayer,
  GeoFlowDatum,
  GeoHeatmapLayer,
  GeoHeatmapDatum,
  GeoMarkerLayer,
  GeoMarkerDatum,
  GeoMarkerSymbol,
  GeoMarkerPresetSymbol,
  GeoPointDatum,
} from '../geo/geoOverlayTypes';

// Composite types
export type { ChartContainerProps } from '../ChartContainer';
export type { ChartDashboardProps } from '../ChartDashboard';
export type { ChartLegendProps } from '../ChartLegend';
export type { ChartToolbarProps } from '../ChartToolbar';
export type { KPICardProps } from '../KPICard';
export type { MiniChartProps } from '../MiniChart';
export type { SparklineChartProps } from '../SparklineChart';
export type { StatWidgetProps } from '../StatWidget';

// Cross-filter / drill-down types
export type {
  CrossFilterEntry,
  DrillLevel,
  HistoryEntry,
  Bookmark,
  CrossFilterState,
  CrossFilterActions,
  CrossFilterStore,
  CrossFilterEventType,
  CrossFilterEvent,
  CrossFilterEventListener,
  FilterOperator,
} from '../cross-filter/types';

// AccessControlledProps + access vocabulary (shared-types)
export type { AccessLevel, AccessControlledProps } from '@mfe/shared-types';

// ChartSpec types — declared in §1 of CONTRACT.md and referenced by the
// RSC import example above. Codex iter-1 PR-X2 review: the example
// promised `ChartSpec` but the barrel only re-exported wrapper props;
// callers following the documented import would fail to resolve.
export type {
  ChartType,
  ChartSpec,
  ChartChannel,
  ChartEncoding,
  ChartTransform,
  ChartDataSpec,
  FieldType,
  AggregateType,
  DataSourceType,
  DrillDownLevel,
  ContextMenuItem,
  ChartAccessibilitySpec,
  ChartStatesSpec,
  ChartAnimationSpec,
  ChartLocaleSpec,
  ChartSecuritySpec,
  ChartPerformanceSpec,
  ChartAnnotation,
  ChartResponsiveSpec,
  ChartExportSpec,
} from '../spec/ChartSpec';

/* ------------------------------------------------------------------ */
/*  Pure runtime constants (no DOM, no React)                          */
/* ------------------------------------------------------------------ */

/**
 * Faz 21.9 PR3a (Codex thread `019defa5`): RSC consumers that pre-compute
 * layout space for a chart card need the canvas-height contract without
 * pulling the entire root barrel (which drags ECharts in). `chartSize.ts`
 * is React-free, so it's safe to expose through this SSR boundary.
 *
 * Usage in RSC context:
 * ```tsx
 * import { CHART_CANVAS_HEIGHT } from '@mfe/x-charts/ssr';
 * const cardHeight = CHART_CANVAS_HEIGHT.md + 48; // chart + header
 * ```
 */
export { CHART_CANVAS_HEIGHT, CHART_SIZE_ORDER } from '../chartSize';
export type { ChartSize as ChartSizeAxis } from '../chartSize';
