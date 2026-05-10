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
/*  17 chart wrappers (13 2D echarts-backed + 4 3D echarts-gl-backed) */
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
