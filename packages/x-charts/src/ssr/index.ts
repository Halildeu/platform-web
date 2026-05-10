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
// Faz 21.11 P1a — 3D Extension Pack public type surface (no runtime).
// P1b adds Surface3DProps + Lines3DProps; P1c adds GlobeProps.
export type { Scatter3DProps, Scatter3DDataPoint } from '../Scatter3D';
export type { SunburstChartProps } from '../SunburstChart';
export type { TreemapChartProps } from '../TreemapChart';
export type { WaterfallChartProps } from '../WaterfallChart';

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
