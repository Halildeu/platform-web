/* ------------------------------------------------------------------ */
/*  @mfe/x-charts — Barrel export                                     */
/*  ALL chart components owned by x-charts (ECharts engine)            */
/* ------------------------------------------------------------------ */

/* Core charts (ECharts native — P1) */
export { BarChart } from './BarChart';
export type { BarChartProps } from './BarChart';
export { LineChart } from './LineChart';
export type { LineChartProps } from './LineChart';
export { AreaChart } from './AreaChart';
export type { AreaChartProps } from './AreaChart';
export { PieChart } from './PieChart';
export type { PieChartProps } from './PieChart';
export { ScatterChart } from './ScatterChart';
export type { ScatterChartProps } from './ScatterChart';

/* 3D Extension Pack (Faz 21.11 P1 — lazy `echarts-gl`) */
export { Scatter3D } from './Scatter3D';
export type { Scatter3DProps, Scatter3DDataPoint } from './Scatter3D';
// Faz 21.11 P1b — Surface3D + Lines3D wrappers. Lines3D internally
// emits one ECharts `'line3D'` (singular) series per path on shared
// cartesian3D/grid3D; the official `'lines3D'` (geo/globe) family
// is deferred. Codex thread `019e10d7` iter-2.
export { Surface3D } from './Surface3D';
export type { Surface3DProps, Surface3DDataPoint, Surface3DShading } from './Surface3D';
export { Lines3D } from './Lines3D';
export type { Lines3DProps, Lines3DPath } from './Lines3D';
// Faz 21.11 P1c — Globe wrapper. Multi-layer geo sphere; layer types
// are scatter3D / lines3D / bar3D on `coordinateSystem: 'globe'`.
// `baseTexture` / `heightTexture` / `environment` are CONSUMER-supplied
// (no defaults bundled). Codex thread `019e10f8` iter-1.
export { Globe } from './Globe';
export type {
  GlobeProps,
  GlobeLayer,
  GlobeScatterDatum,
  GlobeLineDatum,
  GlobeRegion,
} from './Globe';
// Note: `buildScatter3DOption` / `buildSurface3DOption` /
// `buildLines3DOption` (and their `Build*Input` types) are intentionally
// NOT re-exported here — they're internal test seams (option builders
// lifted out so Vitest can lock the `series.type` contract without
// React mount + lazy GL gate races). Promoting them to the public API
// would commit us to a stable contract for `palette` / `fmt` / ECharts-
// shape inputs that aren't ready for consumer use. Codex thread
// `019e10ab` iter-4 disipline (P1a precedent).
export {
  useRequiredEChartsGL,
  describeEChartsGLReason,
  type EChartsGLStatus,
  type EChartsGLUnsupportedReason,
  type UseRequiredEChartsGLOptions,
  type UseRequiredEChartsGLResult,
} from './renderers/gl';

/* Enterprise charts (ECharts native — P3-A) */
export { RadarChart } from './RadarChart';
export type { RadarChartProps } from './RadarChart';
export { TreemapChart } from './TreemapChart';
export type { TreemapChartProps } from './TreemapChart';
export { HeatmapChart } from './HeatmapChart';
export type { HeatmapChartProps } from './HeatmapChart';
export { GaugeChart } from './GaugeChart';
export type { GaugeChartProps } from './GaugeChart';
export { WaterfallChart } from './WaterfallChart';
export type { WaterfallChartProps } from './WaterfallChart';
export { FunnelChart } from './FunnelChart';
export type { FunnelChartProps } from './FunnelChart';
export { SankeyChart } from './SankeyChart';
export type { SankeyChartProps } from './SankeyChart';
export { SunburstChart } from './SunburstChart';
export type { SunburstChartProps } from './SunburstChart';
// PR-X6 (Codex thread 019e1e30 AGREE): statistical box-and-whisker chart.
export { BoxPlotChart } from './BoxPlotChart';
export type { BoxPlotChartProps, BoxPlotDataPoint } from './BoxPlotChart';
// PR-X7 (Codex thread 019e1e30 AGREE): financial OHLC chart.
export { CandlestickChart } from './CandlestickChart';
export type { CandlestickChartProps, CandlestickDataPoint } from './CandlestickChart';
// PR-X10 (Codex thread 019e1e30 AGREE): decorative pictogram bar chart.
export { PictorialBarChart } from './PictorialBarChart';
export type { PictorialBarChartProps, PictorialBarDataPoint } from './PictorialBarChart';
// PR-X12a (Codex thread 019e2119 AGREE): multi-dim parallel-coordinates plot.
export { ParallelCoordinatesChart } from './ParallelCoordinatesChart';
export type { ParallelCoordinatesChartProps, ParallelAxisDef } from './ParallelCoordinatesChart';
// PR-X12c (Codex thread 019e2254 AGREE): geographic choropleth map.
export { GeoMap } from './GeoMap';
export type { GeoMapProps, GeoMapDatum, GeoMapVisualMap } from './GeoMap';
export {
  ensureGeoMapRegistered,
  isGeoMapRegistered,
  type GeoJsonFeatureCollection,
  type GeoMapLoader,
} from './geo/registerGeoMap';

/* Composition */
export { ChartContainer } from './ChartContainer';
export type { ChartContainerProps } from './ChartContainer';
export { ChartDashboard } from './ChartDashboard';
export type { ChartDashboardProps, ChartDashboardItemProps } from './ChartDashboard';
export { SparklineChart } from './SparklineChart';
export type { SparklineChartProps } from './SparklineChart';
export { MiniChart } from './MiniChart';
export type { MiniChartProps, MiniChartDataPoint } from './MiniChart';
export { KPICard } from './KPICard';
export type { KPICardProps, KPICardTrend } from './KPICard';
export { StatWidget } from './StatWidget';
export type { StatWidgetProps } from './StatWidget';
export { ChartLegend } from './ChartLegend';
export type { ChartLegendProps, ChartLegendItem } from './ChartLegend';

/* Interactions */
export { useChartInteractions } from './useChartInteractions';
export type {
  ChartInteractionState,
  ChartInteractionOptions,
  ChartInteractionHandlers,
} from './useChartInteractions';
export { ChartToolbar } from './ChartToolbar';
export type { ChartToolbarProps } from './ChartToolbar';
export { useChartResize } from './useChartResize';
export type { ChartResizeState, UseChartResizeOptions } from './useChartResize';
export { useRealTimeData } from './useRealTimeData';
export type {
  RealTimeDataOptions,
  RealTimeDataOptionsBase,
  RealTimeDataOptionsAutoTick,
  RealTimeDataState,
} from './useRealTimeData';
export { useDashboardComposition } from './composition/useDashboardComposition';
export type {
  DateRange,
  UseDashboardCompositionOptions,
  UseDashboardCompositionReturn,
} from './composition/useDashboardComposition';
export { useChartVariants } from './useChartVariants';
export type { ChartConfig, ChartVariant, UseChartVariantsReturn } from './useChartVariants';
export { useResponsiveBreakpoint, useResponsiveChartConfig } from './useResponsiveChart';
export type { Breakpoint, ResponsiveChartConfig } from './useResponsiveChart';

// Faz 21.9 PR3a: shared chart-size contract — runtime constant + ordered
// axis + ChartSize re-export. Replaces the SIZE_HEIGHT mirrors that used
// to live inside every wrapper.
export { CHART_CANVAS_HEIGHT, CHART_SIZE_ORDER } from './chartSize';
export type { ChartSize } from './chartSize';

/* ------------------------------------------------------------------ */
/*  ECharts Foundation (P1)                                           */
/* ------------------------------------------------------------------ */

export { registerECharts, echarts } from './renderers/echarts-imports';
export { useEChartsRenderer } from './renderers/echarts-renderer';
export type {
  EChartsRendererOptions,
  EChartsRendererState,
  EChartsRenderSettledEvent,
} from './renderers/echarts-renderer';

/* Big-data renderer router — Faz 21.11 PR-A0 / PR-A1 / PR-A1.5.
 * Surface the router types here so chart consumers (and the
 * design-lab benchmark route) can wire `onRendererFallback` without
 * deep-importing from `@mfe/x-charts/renderers/types`. */
export type {
  RendererMode,
  RendererBackend,
  RendererDecision,
  RendererFallbackEvent,
  WebGLCapability,
  CrossFilterCapability,
  CrossFilterCapabilityEvent,
} from './renderers/types';
export { chartSpecToEChartsOption } from './spec/chartSpecToEChartsOption';
export { validateChartSpec } from './spec/validateChartSpec';
export type { ChartSpec, ChartType, ChartChannel, ChartEncoding } from './spec/ChartSpec';

/* Theme (P1 + P3-B) */
export { buildDesignLabEChartsTheme } from './theme/DesignLabEChartsTheme';
export type { DesignLabThemeOptions } from './theme/DesignLabEChartsTheme';
export { buildDesignLabEChartsDarkTheme, isDarkMode } from './theme/DesignLabEChartsDarkTheme';
export { buildDesignLabEChartsHighContrastTheme } from './theme/DesignLabEChartsHighContrastTheme';
export { buildDesignLabEChartsPrintTheme } from './theme/DesignLabEChartsPrintTheme';
export { COLORBLIND_PALETTES } from './theme/colorblind-palettes';
export { DECAL_PATTERNS } from './theme/decal-patterns';

/* Security */
export {
  sanitizeChartText,
  sanitizeChartData,
  validateStreamUrl,
} from './security/sanitizeChartText';

/* A11y */
export { ChartKeyboardNav } from './a11y/ChartKeyboardNav';
export type { ChartKeyboardNavProps } from './a11y/ChartKeyboardNav';
export { ChartDataTable } from './a11y/ChartDataTable';
export type { ChartDataTableProps, ChartDataTableColumn } from './a11y/ChartDataTable';
export { ChartAriaLive } from './a11y/ChartAriaLive';
export type { ChartAriaLiveProps } from './a11y/ChartAriaLive';
export { useReducedMotion } from './a11y/useReducedMotion';

/* States */
export { ChartLoadingState } from './states/ChartLoadingState';
export type { ChartLoadingStateProps } from './states/ChartLoadingState';
export { ChartEmptyState } from './states/ChartEmptyState';
export type { ChartEmptyStateProps } from './states/ChartEmptyState';
export { ChartErrorState } from './states/ChartErrorState';
export type { ChartErrorStateProps } from './states/ChartErrorState';
export { ChartErrorBoundary } from './states/ChartErrorBoundary';
export type { ChartErrorBoundaryProps } from './states/ChartErrorBoundary';

/* ------------------------------------------------------------------ */
/*  Cross-Filter Bus (P2)                                             */
/* ------------------------------------------------------------------ */

export { CrossFilterChart } from './cross-filter/CrossFilterChart';
export type { CrossFilterChartProps } from './cross-filter/CrossFilterChart';
export { createCrossFilterStore } from './cross-filter/createCrossFilterStore';
export {
  CrossFilterProvider,
  useCrossFilter,
  useCrossFilterStoreApi,
} from './cross-filter/useCrossFilterStore';
export { useChartCrossFilter } from './cross-filter/useChartCrossFilter';
export { useGridCrossFilter, brushFilterKey } from './cross-filter/useGridCrossFilter';
export type { BrushFilterValue } from './cross-filter/useGridCrossFilter';
export { createEventBridge } from './cross-filter/eventBridge';
export {
  filtersByGroup,
  filtersForChart,
  activeFilterCount,
  canUndo,
  canRedo,
} from './cross-filter/selectors';
export { useQueryCancellation } from './cross-filter/useQueryCancellation';
export type { CrossFilterEntry, DrillLevel, HistoryEntry } from './cross-filter/types';
// PR-A2c — Cross-filter rectangle brush parity helpers (pure;
// no React, no ECharts runtime). Adoption inside `ScatterChart`
// lives in PR-A2c-wire (separate PR per Codex iter-1 §8).
export {
  normalizeBrushSelection,
  brushToAgGridFilterModel,
  mergeBrushFilterModel,
  applyBrushFilterModel,
} from './cross-filter';
export type {
  BrushBound,
  BrushPoint,
  BrushSelection,
  EChartsBrushArea,
  EChartsBrushSelectedSeries,
  EChartsBrushSelectedEvent,
  NormalizeBrushSelectionOptions,
  AgGridNumberFilterEntry,
  AgGridBrushFilterModel,
  BrushToAgGridFilterOptions,
} from './cross-filter';
export { useDrillDown } from './drill-down/useDrillDown';
export { DrillDownBreadcrumb } from './drill-down/DrillDownBreadcrumb';
export { useChartAnimation } from './animation/useChartAnimation';
export { useTouchGestures } from './touch/useTouchGestures';
export { MobileTooltip } from './touch/MobileTooltip';
export { DataVolumeIndicator } from './components/DataVolumeIndicator';

/* ------------------------------------------------------------------ */
/*  i18n + RTL (P3-C)                                                 */
/* ------------------------------------------------------------------ */

export { registerEChartsLocale, getEChartsLocale, ECHARTS_LOCALE_MAP } from './i18n/echarts-locale';
export { createNumberFormatter, createDateFormatter } from './i18n/formatters';
export { isRTL, isRTLLocale, applyRTLTransforms } from './i18n/rtl';

/* Cross-cutting Utils (P3-E) */
export {
  formatCompact,
  formatNumber,
  formatCurrency,
  formatPercent,
  useChartFormatter,
  sanitizeNumber,
  clampValue,
  sanitizeDataPoints,
  sanitizeSeries,
  sanitizeNumbers,
  validateDataPoints,
  validateSeries,
  DEFAULT_LOCALE,
  DEFAULT_TIMEZONE,
  DEFAULT_CURRENCY,
  DEFAULT_CURRENCY_SYMBOL,
  getChartLocale,
  setChartLocale,
  useChartLocale,
} from './utils';
export type { ChartFormatterOptions, ValidationResult, ChartLocaleConfig } from './utils';

/* Data Transforms (P3-C) */
export {
  movingAverage,
  percentile,
  standardDeviation,
  linearRegression,
} from './transforms/statistical';

/* Responsive (P3-D) */
export { useAutoGranularity, resolveGranularity } from './responsive/useAutoGranularity';
export { useResponsiveLegend } from './responsive/useResponsiveLegend';
export { useResponsiveChartType } from './responsive/useResponsiveChartType';

/* ------------------------------------------------------------------ */
/*  AI Integration (P5)                                                */
/* ------------------------------------------------------------------ */

export { nlToChartSpec } from './ai/nl-to-chart-spec';
export type { NLToChartSpecOptions, NLToChartSpecResult } from './ai/nl-to-chart-spec';
export { detectAnomalies, identifyTrends } from './ai/auto-insight';
export type { Anomaly, Trend, InsightResult } from './ai/auto-insight';
export { suggestChartType } from './ai/chart-type-suggestion';
export type { ChartTypeSuggestion, DataShapeAnalysis } from './ai/chart-type-suggestion';
export { generateChartDescription } from './ai/chart-description';

/* ------------------------------------------------------------------ */
/*  Grid Adapter (P4)                                                  */
/* ------------------------------------------------------------------ */

export { AGGridAdapter } from './grid-adapter/AGGridAdapter';
export { useChartGridLink, autoMapColumns } from './grid-adapter/useChartGridLink';
export type {
  GridAdapter,
  GridColumnDef,
  GridFilterEntry,
  GridSortEntry,
  GridSelectionEvent,
  ChartGridLinkConfig,
  ColumnChartMapping,
} from './grid-adapter/types';
export type { AGGridApi } from './grid-adapter/AGGridAdapter';
export type { ChartGridLinkState } from './grid-adapter/useChartGridLink';

/* ------------------------------------------------------------------ */
/*  Advanced Analytics (P8)                                            */
/* ------------------------------------------------------------------ */

export { chartPluginRegistry, registerChartPlugin } from './advanced/plugin-registry';
export type { ChartPlugin, ChartPluginConfig } from './advanced/plugin-registry';
export { renderDashboardFromConfig } from './advanced/dashboard-as-code';
export type { DashboardConfig, DashboardWidgetConfig } from './advanced/dashboard-as-code';
export { useWhatIfAnalysis } from './advanced/what-if';
export type { WhatIfParameter, WhatIfResult } from './advanced/what-if';

/* ------------------------------------------------------------------ */
/*  Collaboration & Offline (P7)                                       */
/* ------------------------------------------------------------------ */

export {
  useDashboardState,
  serializeState,
  deserializeState,
} from './collaboration/dashboard-state';
export { useChartExport } from './collaboration/chart-export';
export type { ExportFormat, ExportOptions } from './collaboration/chart-export';
export {
  useDashboardSharing,
  createShareUrl,
  parseShareUrl,
} from './collaboration/dashboard-sharing';
export { useChartAnnotations } from './collaboration/chart-annotations';
export type { Annotation, AnnotationType } from './collaboration/chart-annotations';
export { useOfflineCache } from './collaboration/offline-cache';

/* ------------------------------------------------------------------ */
/*  Performance (P6)                                                   */
/* ------------------------------------------------------------------ */

export { downsampleLTTB } from './performance/lttb';
// PR-A2a — anomaly-preserving LTTB. `unstable_*` prefix + JSDoc
// `@internal` advertise that production code should not depend on
// the symbol or its option shape. The only sanctioned caller today
// is the `evaluateBenchmarkCorrectness` test surface in
// `scripts/ci/benchmark-1m-enforcer.mjs`. The design-lab benchmark
// route still consumes vanilla `downsampleLTTB` for its
// `canvas-lttb` reference rail; PR-A2b/A2c will rewire it once the
// explanation-pill UI and brush-parity tests need the
// anomaly-aware variant.
export { unstable_downsampleAnomalyPreservingLTTB } from './performance/anomaly-lttb';
export type {
  AnomalyPoint,
  AnomalyDownsampleOptions,
  AnomalyDetector,
} from './performance/anomaly-lttb';
export { createWorkerBridge } from './performance/worker-bridge';
export type { WorkerBridge, WorkerTask } from './performance/worker-bridge';
export { useProgressiveRender } from './performance/progressive-render';
export { useLazyChart } from './performance/lazy-chart';
export { LRUCache } from './performance/lru-cache';
export { lazyChartImport } from './performance/code-split';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

// `ChartSize` is exported above (line 85) via the Faz 21.9 PR3a
// `chartSize.ts` re-export, which keeps the runtime `CHART_CANVAS_HEIGHT`
// + `CHART_SIZE_ORDER` constants and the type co-located. `chartSize.ts`
// itself imports `ChartSize` from `./types`, so the source-of-truth
// definition is unchanged — only the duplicate barrel-level export is
// removed here to clear `TS2300: Duplicate identifier 'ChartSize'`.
export type { ChartDataPoint, ChartSeries, ChartClickEvent, ChartLocaleText } from './types';

/* ------------------------------------------------------------------ */
/*  Markup overlay layer (Highcharts annotation parity)                */
/*                                                                     */
/*  Distinct from spec-level `ChartAnnotation` (`spec/ChartSpec.ts`)   */
/*  and collaboration-level `Annotation`                              */
/*  (`collaboration/chart-annotations.ts`). Codex thread 019e0df1     */
/*  iter-3 AGREE absorb: name collision avoided via `ChartMarkup`.    */
/* ------------------------------------------------------------------ */
export type {
  ChartMarkup,
  ChartMarkupClickEvent,
  BaseMarkup,
  LineMarkup,
  SegmentMarkup,
  AreaMarkup,
  PointMarkup,
  LabelMarkup,
} from './types';
export { adaptToEcharts, DEFAULT_SUPPORT_MATRIX } from './annotations/adaptToEcharts';
export type {
  AdaptOptions,
  AdaptResult,
  SeriesPatch,
  MarkupChartKind,
  MarkupTypeKey,
  MarkupSupport,
  MarkupSupportMatrix,
  MarkupDataContext,
} from './annotations/adaptToEcharts';
export { useMarkupAdapter } from './annotations/useMarkupAdapter';
export type { UseMarkupAdapterOptions } from './annotations/useMarkupAdapter';
export { mergeMarkupPatches } from './annotations/mergeMarkupPatches';
export {
  computeTrendOverlay,
  type ComputeTrendOverlayOptions,
  type TrendOverlayPoint,
} from './annotations/computeTrendOverlay';
export {
  computeAnomalyOverlay,
  computeAnomalySummary,
  type ComputeAnomalyOverlayOptions,
  type ComputeAnomalySummaryOptions,
  type AnomalyOverlayPoint,
  type AnomalySummary,
  type AnomalyDirection,
  type AnomalySeverityBucket,
  // Faz 21.11 batch3 contract — kind discriminator for domain-
  // specific a11y announcements (Codex thread `019e10a5` iter-2).
  type AnomalySummaryKind,
} from './annotations/computeAnomalyOverlay';
export { useTrendOverlay } from './annotations/useTrendOverlay';
export { useAnomalyOverlay, useAnomalySummary } from './annotations/useAnomalyOverlay';
// Faz 21.11 batch3 sequential PR-Radar — per-indicator IQR detector
// for multi-series radar charts. Emits AnomalySummary[] with kind='radar'
// + per-indicator metadata so the ChartAriaLive radar template fires.
// Codex thread `019e10a5` PR-Radar plan iter-1.
export {
  computeRadarAnomalySummary,
  type ComputeRadarAnomalySummaryOptions,
  type RadarAnomalyIndicator,
  type RadarAnomalySeries,
} from './annotations/computeRadarAnomalySummary';
// Faz 21.11 batch3 sequential PR-Hierarchical — tree-walking IQR
// detector for hierarchical charts (Treemap, Sunburst). Emits
// AnomalySummary[] with kind='hierarchical' + path[] + depth metadata
// so the ChartAriaLive hierarchy template fires. Codex thread
// `019e1100` PR-Hierarchical plan iter-1.
export {
  computeHierarchicalAnomalySummary,
  type ComputeHierarchicalAnomalySummaryOptions,
  type HierarchicalAnomalyNode,
} from './annotations/computeHierarchicalAnomalySummary';
// Faz 21.11 batch3 sequential PR-Sankey — dual-mode IQR detector for
// Sankey flow charts. Emits AnomalySummary[] with kind='sankey-edge'
// (default; per-link flow outliers) or kind='sankey-node' (per-node
// throughput outliers) + source/target/edgeId/nodeId/flowValue
// metadata so the ChartAriaLive sankey templates fire. Codex thread
// `019e1110` PR-Sankey plan iter-1.
export {
  computeSankeyAnomalySummary,
  type ComputeSankeyAnomalySummaryOptions,
  type SankeyAnomalyNode,
  type SankeyAnomalyLink,
} from './annotations/computeSankeyAnomalySummary';
// PR-A2b-a11y — anomaly announcement formatter type for consumers
// who want to override the default EN/TR template.
export type { AnomalyAnnouncementFormatter } from './a11y/ChartAriaLive';

/* ------------------------------------------------------------------ */
/*  i18n locale auto-bind (Faz 21.5-A1)                                */
/*                                                                     */
/*  registerEChartsLocale / getEChartsLocale / ECHARTS_LOCALE_MAP and  */
/*  createNumberFormatter / createDateFormatter are already exported   */
/*  earlier in this file from their dedicated modules. Only the new    */
/*  store-driven surface lands here.                                   */
/* ------------------------------------------------------------------ */

export {
  setChartsLocale,
  getCurrentChartsLocale,
  useChartsLocale,
  subscribeChartsLocale,
  __resetChartsLocaleStoreForTests,
  __getChartsLocaleListenerCountForTests,
} from './i18n/locale-store';
export type { NumberFormatOptions, DateFormatOptions } from './i18n/formatters';

/* ------------------------------------------------------------------ */
/*  Benchmark harness exports — Faz 21.11 PR-A1.6a                     */
/*                                                                     */
/*  Benchmark fixtures + the deterministic mulberry32 RNG are exposed  */
/*  via the dedicated `@mfe/x-charts/benchmark` subpath, NOT via this  */
/*  main barrel. Importing `<ScatterChart>` from the main barrel must  */
/*  not drag the fixture generators into the wrapper bundle (CONTRACT  */
/*  §7 / PR-F2 wrapperOnly observability).                             */
/*                                                                     */
/*  Consumers (e.g. design-lab benchmark route):                       */
/*    import {                                                         */
/*      generateUniformScatter, BENCHMARK_TIERS                        */
/*    } from '@mfe/x-charts/benchmark';                                */
/* ------------------------------------------------------------------ */
