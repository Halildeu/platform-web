'use client';

/**
 * Client Subpath — `@mfe/x-charts/client`
 *
 * Aggregates every chart component that touches the DOM, ECharts, or React
 * hooks. Importing through this subpath gives RSC consumers (Next.js app
 * router, Remix server-side bundling) a clear "this is a client tree"
 * boundary; the file-level `'use client'` directive is preserved at every
 * leaf so individual imports stay safe too.
 *
 * Faz 21.8 PR-X2: complements the older `ssr/index.ts` re-export which only
 * covered ChartContainer + ChartDashboard. Public types and theme tokens
 * remain in `./ssr` for genuinely server-safe consumption.
 *
 * @see PR #174 (reality-parity plan)
 */

/* ------------------------------------------------------------------ */
/*  32 chart wrappers (27 2D echarts-backed + 5 3D echarts-gl-backed) */
/* ------------------------------------------------------------------ */

export { AreaChart } from '../AreaChart';
export type { AreaChartProps } from '../AreaChart';
export { BarChart } from '../BarChart';
export type { BarChartProps } from '../BarChart';
export { FunnelChart } from '../FunnelChart';
export type { FunnelChartProps } from '../FunnelChart';
export { GaugeChart } from '../GaugeChart';
export type { GaugeChartProps } from '../GaugeChart';
export { HeatmapChart } from '../HeatmapChart';
export type { HeatmapChartProps } from '../HeatmapChart';
export { LineChart } from '../LineChart';
export type { LineChartProps } from '../LineChart';
export { PieChart } from '../PieChart';
export type { PieChartProps } from '../PieChart';
export { RadarChart } from '../RadarChart';
export type { RadarChartProps } from '../RadarChart';
export { SankeyChart } from '../SankeyChart';
export type { SankeyChartProps } from '../SankeyChart';
export { ScatterChart } from '../ScatterChart';
export type { ScatterChartProps } from '../ScatterChart';
// Faz 21.11 P1a — 3D Extension Pack. P1c adds Globe. Each wrapper
// ships under the same client subpath so consumers don't need a
// separate bundle entry for 3D.
export { Scatter3D } from '../Scatter3D';
export type { Scatter3DProps, Scatter3DDataPoint } from '../Scatter3D';
// Faz 21.11 P1b — Surface3D + Lines3D wrappers. Codex thread
// `019e10d7` iter-2.
export { Surface3D } from '../Surface3D';
export type { Surface3DProps, Surface3DDataPoint, Surface3DShading } from '../Surface3D';
export { Lines3D } from '../Lines3D';
export type { Lines3DProps, Lines3DPath } from '../Lines3D';
// Faz 21.11 P1c — Globe wrapper. Multi-layer geo sphere. Codex
// thread `019e10f8` iter-1.
export { Globe } from '../Globe';
export type {
  GlobeProps,
  GlobeLayer,
  GlobeScatterDatum,
  GlobeLineDatum,
  GlobeRegion,
} from '../Globe';
export { SunburstChart } from '../SunburstChart';
export type { SunburstChartProps } from '../SunburstChart';
export { TreemapChart } from '../TreemapChart';
export type { TreemapChartProps } from '../TreemapChart';
export { WaterfallChart } from '../WaterfallChart';
export type { WaterfallChartProps } from '../WaterfallChart';

/* ------------------------------------------------------------------ */
/*  PR-X6 / X7 / X10 / X12 / X16 campaign wrappers                     */
/* ------------------------------------------------------------------ */

export { TreeChart } from '../TreeChart';
export type { TreeChartProps, TreeNode, TreeLayout, TreeOrient } from '../TreeChart';
export { CalendarHeatmap } from '../CalendarHeatmap';
export type {
  CalendarHeatmapProps,
  CalendarHeatmapDataPoint,
  CalendarHeatmapOrient,
  CalendarHeatmapCellSize,
  CalendarWeekStart,
} from '../CalendarHeatmap';
export { PolarChart } from '../PolarChart';
export type { PolarChartProps, PolarChartDataPoint, PolarSeriesType } from '../PolarChart';
export { ThemeRiverChart } from '../ThemeRiverChart';
export type { ThemeRiverChartProps, ThemeRiverDataPoint } from '../ThemeRiverChart';
export { GanttChart } from '../GanttChart';
export type { GanttChartProps, GanttTask } from '../GanttChart';
// Codex thread 019e3f75 AGREE: HR age × gender demographic pyramid.
export { PopulationPyramid } from '../PopulationPyramid';
export type { PopulationPyramidProps, PopulationPyramidDatum } from '../PopulationPyramid';
// Codex thread 019e41cd AGREE: dual-axis composite (bar + line) chart.
export { ComboChart } from '../ComboChart';
export type {
  ComboChartProps,
  ComboChartSeries,
  ComboSeriesType,
  ComboAxisId,
} from '../ComboChart';
// Codex thread 019e425b AGREE: standalone effectScatter wrapper.
export { EffectScatterChart } from '../EffectScatterChart';
export type {
  EffectScatterChartProps,
  EffectScatterDataPoint,
  EffectScatterRippleEffect,
} from '../EffectScatterChart';
// Codex thread 019e4277 AGREE: standalone cartesian3D bar3D wrapper.
export { Bar3DChart } from '../Bar3DChart';
export type { Bar3DChartProps, Bar3DDataPoint, Bar3DShading } from '../Bar3DChart';
export { BoxPlotChart } from '../BoxPlotChart';
export type { BoxPlotChartProps, BoxPlotDataPoint } from '../BoxPlotChart';
export { CandlestickChart } from '../CandlestickChart';
export type { CandlestickChartProps, CandlestickDataPoint } from '../CandlestickChart';
export { PictorialBarChart } from '../PictorialBarChart';
export type { PictorialBarChartProps, PictorialBarDataPoint } from '../PictorialBarChart';
export { ParallelCoordinatesChart } from '../ParallelCoordinatesChart';
export type { ParallelCoordinatesChartProps, ParallelAxisDef } from '../ParallelCoordinatesChart';
export { GraphChart } from '../GraphChart';
export type {
  GraphChartProps,
  GraphNode,
  GraphEdge,
  GraphCategory,
  GraphLayoutMode,
} from '../GraphChart';
export { GeoMap } from '../GeoMap';
export type { GeoMapProps, GeoMapDatum, GeoMapVisualMap } from '../GeoMap';
// GeoMap `overlays` prop type surface (type-only). Runtime registration
// helpers `ensureGeoMapRegistered` / `isGeoMapRegistered` stay root-only.
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

/* ------------------------------------------------------------------ */
/*  Composite / dashboard surfaces (also client-only)                  */
/* ------------------------------------------------------------------ */

export { ChartContainer } from '../ChartContainer';
export type { ChartContainerProps } from '../ChartContainer';
export { ChartDashboard } from '../ChartDashboard';
export type { ChartDashboardProps } from '../ChartDashboard';
export { ChartLegend } from '../ChartLegend';
export type { ChartLegendProps } from '../ChartLegend';
export { ChartToolbar } from '../ChartToolbar';
export type { ChartToolbarProps } from '../ChartToolbar';
export { KPICard } from '../KPICard';
export type { KPICardProps } from '../KPICard';
export { MiniChart } from '../MiniChart';
export type { MiniChartProps } from '../MiniChart';
export { SparklineChart } from '../SparklineChart';
export type { SparklineChartProps } from '../SparklineChart';
export { StatWidget } from '../StatWidget';
export type { StatWidgetProps } from '../StatWidget';
