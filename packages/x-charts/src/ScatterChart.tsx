'use client';

/**
 * ScatterChart — ECharts-powered scatter/bubble chart with Design Lab integration
 *
 * Backwards-compatible with the AG Charts API surface.
 * Uses the centralized useEChartsRenderer hook for lifecycle management.
 *
 * @migration AG Charts → ECharts (P1, chart-viz-engine-selection D-001)
 */
import React, { useMemo, useCallback, useRef } from 'react';
import type { AccessControlledProps } from '@mfe/shared-types';
import { resolveAccessState } from '@mfe/shared-types';
import { guardChartCallback } from './access/guardChartCallback';
import { ChartAccessGate } from './access/ChartAccessGate';
import { cn } from './utils/cn';
import {
  chooseRenderer,
  detectWebGLCapability,
  type RendererFallbackEvent,
  type RendererMode,
  useEChartsRenderer,
} from './renderers';
import { isEChartsGLRegistered, registerEChartsGL } from './renderers/gl';
import { ChartA11yShell, useChartA11y } from './a11y';
import { useChartTheme } from './theme/useChartTheme';
import type {
  ChartThemePreference,
  ChartDecalPreference,
  ChartDensityPreference,
  ChartAccentPreference,
} from './theme/useChartTheme';
import { scaleFontSize, scaleSpacing, scalePadding } from './theme/density-helpers';
import { CHART_CANVAS_HEIGHT } from './chartSize';
import { formatCompact } from './utils/formatters';
import { sanitizeNumber } from './utils/data-validation';
import type { EChartsOption } from './renderers/echarts-imports';
import type { EChartsRendererOptions } from './renderers/echarts-renderer';
import { useResponsiveBreakpoint } from './useResponsiveChart';
import { buildResponsiveLegend, buildResponsiveGrid } from './responsive';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ScatterDataPoint = {
  x: number;
  y: number;
  size?: number;
  label?: string;
  color?: string;
};

export type ChartSize = 'sm' | 'md' | 'lg';

// Cross-filter rollout sweep — Codex thread 019e0c25 absorb. Re-export
// the canonical `ChartClickEvent` so the cross-filter wrapper sees the
// same shape across all 13 charts.
export type { ChartClickEvent } from './types';
import type { ChartClickEvent as ChartClickEventCanonical } from './types';
type ChartClickEvent = ChartClickEventCanonical;

// Markup overlay (Codex thread 019e0df1).
export type { ChartMarkup, ChartMarkupClickEvent } from './types';
import type { ChartMarkup, ChartMarkupClickEvent } from './types';
import { useMarkupAdapter } from './annotations/useMarkupAdapter';
import { mergeMarkupPatches } from './annotations/mergeMarkupPatches';

// PR-A2c-wire: brush selection wiring. Helper contracts live in
// `cross-filter/`; this component just forwards the normalised
// payload to the consumer's `onBrushSelection`.
import { normalizeBrushSelection } from './cross-filter/brushSelection';
import type { BrushSelection } from './cross-filter/brushSelection';
export type { BrushSelection } from './cross-filter/brushSelection';

// PR-A2b-a11y — anomaly summary for SR announcements. Codex
// thread `019e1027` iter-1 §7: scatter accepts an EXPLICIT
// `anomalySummary` prop instead of walking `markups` (markup
// shape doesn't carry severity/direction; pill mode would
// double-count). The summary list is forwarded to
// `ChartA11yShell` which mounts the live region.
import type { AnomalySummary } from './annotations/computeAnomalyOverlay';
import type { AnomalyAnnouncementFormatter } from './a11y/ChartAriaLive';

export interface ScatterChartProps extends AccessControlledProps {
  /** Data points for the scatter plot. */
  data: ScatterDataPoint[];
  /** Visual size variant. @default "md" */
  size?: ChartSize;
  /** Show grid lines. @default true */
  showGrid?: boolean;
  /** Show legend below the chart. @default false */
  showLegend?: boolean;
  /** Chart title. */
  title?: string;
  /** Accessible description. */
  description?: string;
  /** Override default chart colors. */
  colors?: string[];
  /** Custom value formatter for axis labels. */
  valueFormatter?: (value: number) => string;
  /** Animate on mount. @default true */
  animate?: boolean;
  /** Additional class name. */
  className?: string;
  /** X-axis label. */
  xLabel?: string;
  /** Y-axis label. */
  yLabel?: string;
  /** Enable bubble mode — sizes markers by the `size` field. @default false */
  bubble?: boolean;
  /**
   * Enable ECharts' `large` mode — a Canvas-batching optimization that
   * collapses individual symbol draws into a single shape per series.
   * Visible interactions (hover highlight, click) are coarser in large
   * mode, but render time drops dramatically for 5K–50K point datasets.
   *
   * Use case: dense scatter plots where individual point hover isn't
   * needed (overview / brushing dashboards). The existing renderer
   * router still escalates to WebGL above 100K points; this prop fills
   * the 5K–50K gap on Canvas. Maps to ECharts `series.large` +
   * `largeThreshold` (we expose the threshold at the wrapper level so
   * callers can tune the cutoff without forking the renderer).
   *
   * @default false
   */
  large?: boolean;
  /**
   * Point-count threshold above which `large` mode kicks in. Ignored
   * unless `large` is `true`. Maps to ECharts `series.largeThreshold`.
   *
   * @default 2000
   */
  largeThreshold?: number;
  /**
   * Custom function to compute marker size from a `ScatterDataPoint`.
   * Receives `{ x, y, size, label }` and returns a pixel radius.
   * Overrides both the default constant radius and the `bubble`-mode
   * `Math.sqrt(size)` formula. Maps to ECharts `series.symbolSize`
   * function variant.
   *
   * Use case: encoding a third dimension (revenue, severity, importance)
   * with a custom scale (logarithmic, quantile-bucketed) instead of the
   * default linear sqrt.
   *
   * @default undefined (constant 8 px, or bubble-mode sqrt(size))
   */
  symbolSize?: (datum: ScatterDataPoint) => number;
  /** Text shown when data is empty. @default "Veri yok" */
  noDataText?: string;
  /**
   * Callback fired when a data point is clicked. The emitted
   * `ChartClickEvent` exposes a datum compatible with the cross-filter
   * wrapper: `{ x, y, size, label, dataIndex }`. `value` mirrors `y`
   * (the primary measure) and `label` falls back to `Point N (x, y)`
   * when no explicit label is set.
   */
  onDataPointClick?: (event: ChartClickEvent) => void;
  /** Visual overlay markups (Codex thread 019e0df1). */
  markups?: ChartMarkup[];
  /** Callback fired when a markup overlay is clicked. */
  onMarkupClick?: (event: ChartMarkupClickEvent) => void;
  /**
   * Theme override.
   * @default "auto" — follows documentElement signals
   */
  theme?: ChartThemePreference;
  /**
   * Decal pattern override.
   * @default "auto" — enabled for high-contrast and print themes
   */
  decal?: ChartDecalPreference;
  /** Density override. @default "auto" */
  density?: ChartDensityPreference;
  /** Accent palette override. @default "auto" */
  accent?: ChartAccentPreference;
  /**
   * Renderer mode — Faz 21.11 PR-A1.5 (Big Data Renderer Router).
   * `'auto'` (default) routes by point count: <50K Canvas raw,
   * 50K..100K Canvas (LTTB sampling lands in PR-A2), ≥100K WebGL
   * (lazy `echarts-gl`). Force a
   * specific backend with `'canvas' | 'svg' | 'webgl'`. WebGL falls
   * back to Canvas when unsupported and fires `onRendererFallback`.
   * @default "auto"
   */
  renderer?: RendererMode;
  /**
   * Callback fired when the requested renderer was downgraded (e.g.
   * `renderer='webgl'` but the browser does not support WebGL, so the
   * router routed to Canvas). Lets dashboards surface a banner without
   * polling the router decision themselves.
   */
  onRendererFallback?: (event: RendererFallbackEvent) => void;
  /**
   * Hard cross-filter requirement — when true the router will NEVER
   * upgrade to WebGL above the cross-filter ceiling (default 500K).
   * Use for trading dashboards where losing click → drilldown is
   * unacceptable. @default false
   */
  crossFilterRequired?: boolean;
  /**
   * Faz 21.11 PR-A2c-wire — opt-in ECharts toolbox brush feature.
   * When `true` the chart renders a toolbox button + enables top-level
   * `option.brush` so the user can drag a rectangle (or click clear)
   * over the scatter. Selections fire `onBrushSelection` with a
   * normalised `BrushSelection` (PR-A2c). Also flips the renderer
   * router into the cross-filter-required path so big-data datasets
   * never silently route to WebGL above the cross-filter ceiling
   * (where brush parity becomes unreliable).
   *
   * Default `false` — backwards compat. ECharts toolbox/brush bundle
   * is paid only when a shim opts in; no shim that omits this flag
   * triggers the brush UI.
   *
   * @default false
   */
  enableBrush?: boolean;
  /**
   * Faz 21.11 PR-A2b-a11y — anomaly summary list. When the chart
   * is rendered with anomaly markups (PR-A2b-ui via
   * `useAnomalyOverlay({ labelVariant: 'pill' })`), passing the
   * matching `AnomalySummary[]` (from `useAnomalySummary()` /
   * `computeAnomalySummary()`) here lets `ChartA11yShell` fire a
   * polite, debounced screen-reader announcement summarising the
   * outliers. Default `undefined` = no anomaly announcement
   * (backwards compat).
   *
   * Pair with `useAnomalySummary({ data, k, idPrefix })` —
   * shares the same detector internals as `useAnomalyOverlay` so
   * the visual markup and the SR summary stay aligned.
   */
  anomalySummary?: AnomalySummary[];
  /**
   * Optional override of the anomaly announcement template.
   * Forwarded to `ChartAriaLive.formatAnomalyAnnouncement`.
   * Default: small EN/TR formatter ("3 outliers detected, ...").
   */
  formatAnomalyAnnouncement?: AnomalyAnnouncementFormatter;
  /**
   * Faz 21.11 PR-A2c-wire — fires when the user drags a rectangle on
   * the chart (or clears one). Receives a normalised `BrushSelection`
   * with `from`/`to` in data-space coordinates and source-row
   * `indices` (resolved via `originalIndex` when the chart was drawn
   * from PR-A2a downsampled data). `null` means the user cleared the
   * brush. Pair with `brushToAgGridFilterModel` +
   * `mergeBrushFilterModel` (both from `@mfe/x-charts`) to wire into
   * an AG Grid SSRM datasource without losing existing column
   * filters.
   *
   * Renderer-agnostic — works the same in canvas / lttb / webgl
   * router branches because the helper normalises ECharts'
   * `brushselected` payload upstream of the renderer pipeline.
   */
  onBrushSelection?: (selection: BrushSelection | null) => void;
  /**
   * @internal benchmark telemetry — passthrough for the
   * `unstable_onRenderSettled` callback exposed by
   * {@link useEChartsRenderer}. Fires once a `setOption` has been
   * acknowledged by ECharts' `finished` event AND committed to a
   * paint (two `requestAnimationFrame` ticks later). The callback
   * identity is captured via a ref inside the hook so this prop can
   * change without re-running `setOption`.
   *
   * NOT a stable consumer API — only the design-lab benchmark route
   * (`/admin/design-lab/benchmark`) consumes this. Production code
   * should ignore this surface.
   */
  unstable_onRenderSettled?: EChartsRendererOptions['unstable_onRenderSettled'];
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const getCSSVar = (v: string, fb: string): string => {
  if (typeof document === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || fb;
};

const escapeHtml = (t: string): string =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const getDefaultPalette = (): string[] => [
  getCSSVar('--action-primary', '#3b82f6'),
  getCSSVar('--state-success-text', '#22c55e'),
  getCSSVar('--state-warning-text', '#f59e0b'),
  getCSSVar('--state-error-text', '#ef4444'),
  getCSSVar('--state-info-text', '#06b6d4'),
  getCSSVar('--action-secondary', '#8b5cf6'),
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#6366f1',
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * ScatterChart inner — original hook-bearing body. The outer `ScatterChart`
 * wrapper below adds the `access` / `accessReason` gate without touching
 * hook order (Faz 21.4 PR-E2). Accepting `Omit<ScatterChartProps, 'access' |
 * 'accessReason'>` keeps the inner contract honest: access is resolved
 * exactly once, in the outer wrapper, never re-read inside the hooks.
 */
const ScatterChartInner = React.forwardRef<
  HTMLDivElement,
  Omit<ScatterChartProps, 'access' | 'accessReason'>
>(function ScatterChartInner(
  {
    data,
    size = 'md',
    showGrid = true,
    showLegend = false,
    title,
    description,
    colors,
    valueFormatter,
    animate = true,
    className,
    xLabel,
    yLabel,
    bubble = false,
    large = false,
    largeThreshold = 2000,
    symbolSize: symbolSizeFnProp,
    noDataText = 'Veri yok',
    onDataPointClick,
    markups,
    onMarkupClick,
    theme: themePreference = 'auto',
    decal: decalPreference = 'auto',
    density: densityPreference = 'auto',
    accent: accentPreference = 'auto',
    renderer: rendererMode = 'auto',
    onRendererFallback,
    crossFilterRequired = false,
    enableBrush = false,
    onBrushSelection,
    anomalySummary,
    formatAnomalyAnnouncement,
    unstable_onRenderSettled,
    ...rest
  },
  forwardedRef,
) {
  const height = CHART_CANVAS_HEIGHT[size];

  // Faz 21.11 PR-A1.5 — Big Data Renderer Router decision. Routes
  // Canvas / SVG / WebGL based on point count, browser capability
  // and the cross-filter requirement flag. WebGL chunk (`echarts-gl`)
  // is registered lazily on first use; if the browser does not
  // support WebGL the router transparently falls back to Canvas
  // (LTTB / anomaly-aware sampling lands in PR-A2)
  // and fires `onRendererFallback`.
  const rendererDecision = useMemo(
    () =>
      chooseRenderer({
        requestedMode: rendererMode,
        pointCount: data?.length ?? 0,
        webgl: detectWebGLCapability(),
        // PR-A2c-wire: brush parity needs the cross-filter ceiling
        // honoured. WebGL above the ceiling silently drops brush
        // event support, so opting into `enableBrush` should also
        // promote the cross-filter requirement.
        crossFilterRequired: crossFilterRequired || enableBrush,
        hasInteraction: !!onDataPointClick || enableBrush,
      }),
    [rendererMode, data?.length, crossFilterRequired, onDataPointClick, enableBrush],
  );

  // Lazy-load `echarts-gl` the first time the router picks the WebGL
  // backend, and gate the `'scatterGL'` series.type on the registration
  // promise actually resolving (Codex iter-A1.5 race-fix).
  //
  // Without `glReady`, the option memo would emit `series.type='scatterGL'`
  // immediately on render — but `useEChartsRenderer.setOption` runs in
  // a commit-phase effect that may execute before the lazy `import()`
  // resolves. ECharts then sees an unknown series type and either skips
  // the series or throws (engine-version dependent). Holding the GL
  // series type back until `glReady===true` lets the chart render the
  // canvas series first; once registration completes the option memo
  // recomputes and the renderer swaps to GL on the next setOption.
  const wantsWebGL = rendererDecision.backend === 'webgl';
  const [glReady, setGlReady] = React.useState<boolean>(() => isEChartsGLRegistered());
  React.useEffect(() => {
    if (!wantsWebGL) return;
    if (isEChartsGLRegistered()) {
      setGlReady(true);
      return;
    }
    let cancelled = false;
    setGlReady(false);
    registerEChartsGL()
      .then(() => {
        if (!cancelled) setGlReady(true);
      })
      .catch(() => {
        // Registration failure leaves the chart on the empty option
        // briefly until next data refresh — no throw, no blank chart
        // poison. Telemetry could be surfaced via a future
        // `onRendererFallback` extension.
        if (!cancelled) setGlReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, [wantsWebGL]);
  const useGLSeriesType = wantsWebGL && glReady;
  // Codex iter-A1.5b BLOCKER 1 — when WebGL is the chosen backend but
  // the lazy `echarts-gl` chunk has not yet resolved, suppress the
  // entire option so ECharts does NOT first paint the canvas
  // `scatter` series with 1M points (which would defeat the WebGL
  // ceiling claim). The empty option briefly displays the no-data
  // path; the option memo recomputes once `glReady` flips and the
  // GL series type lights up.
  const webGLPending = wantsWebGL && !glReady;

  // Surface the fallback advisory to dashboards that asked for
  // a specific renderer but ended up on a different one.
  React.useEffect(() => {
    if (
      onRendererFallback &&
      rendererDecision.requestedMode !== 'auto' &&
      rendererDecision.requestedMode !== rendererDecision.backend
    ) {
      onRendererFallback({
        requested: rendererDecision.requestedMode,
        actual: rendererDecision.backend,
        reason: rendererDecision.reason,
      });
    }
  }, [
    rendererDecision.backend,
    rendererDecision.requestedMode,
    rendererDecision.reason,
    onRendererFallback,
  ]);

  // Markup overlay adapter — Codex thread 019e0df1. Scatter has no
  // category labels; dataContext omitted (LabelMarkup must use
  // explicit {x, y} anchor).
  const markupResult = useMarkupAdapter(markups, {
    chartType: 'scatter',
  });
  const safeData = useMemo(
    () =>
      (data ?? []).map((d) => ({
        ...d,
        x: sanitizeNumber(d.x),
        y: sanitizeNumber(d.y),
        size: d.size != null ? sanitizeNumber(d.size) : undefined,
      })),
    [data],
  );
  const isEmpty = safeData.length === 0;
  const fmt = valueFormatter ?? formatCompact;

  // Same DOM node feeds breakpoint observer and ECharts renderer.
  const ownContainerRef = useRef<HTMLDivElement | null>(null);
  const breakpoint = useResponsiveBreakpoint(ownContainerRef);

  // Codex iter-1 madde 6: ScatterChart önceden theme'i renderer'a hiç vermiyordu;
  // theme switch'te option memo recompute olsun diye themeObject ve decal*'ı
  // dependency olarak option useMemo'ya iletiyoruz.
  const {
    themeObject,
    decalEnabled,
    decalPatterns,
    densityFontMultiplier,
    densitySpacingMultiplier,
    densityPaddingMultiplier,
    effectivePalette,
  } = useChartTheme({
    theme: themePreference,
    decal: decalPreference,
    density: densityPreference,
    accent: accentPreference,
  });

  const option = useMemo((): EChartsOption | null => {
    // Codex iter-A1.5b BLOCKER 1 — `webGLPending` suppresses the
    // option entirely while `echarts-gl` is still loading. This
    // prevents the canvas `scatter` series from rendering 1M points
    // before the GL chunk arrives (which would defeat the WebGL
    // ceiling claim).
    if (isEmpty || webGLPending) return null;

    const palette = colors ?? effectivePalette ?? getDefaultPalette();
    const fontFamily = getCSSVar('--font-family-sans', 'Inter, system-ui, sans-serif');
    const textPrimary = getCSSVar('--text-primary', '#1a1a2e');
    const textSecondary = getCSSVar('--text-secondary', '#6b7280');
    const borderDefault = getCSSVar('--border-default', '#e5e7eb');
    const bgMuted = getCSSVar('--bg-muted', '#f9fafb');

    // Transform data: [x, y, size?, label?, color?]
    const scatterData = safeData.map((d, i) => ({
      value: bubble && d.size != null ? [d.x, d.y, d.size] : [d.x, d.y],
      name: d.label ?? `Point ${i + 1}`,
      itemStyle: d.color ? { color: d.color } : undefined,
    }));

    // Bubble: symbolSize maps size field to visual radius.
    // PR-X4: caller-supplied `symbolSize` function takes precedence over
    // both the bubble formula and the constant default. The function
    // receives a `ScatterDataPoint`-shaped object (we reconstruct from
    // the `[x, y, size?]` numeric array ECharts passes through to keep
    // the public API ergonomic — callers don't have to remember array
    // index positions).
    const symbolSizeFn = symbolSizeFnProp
      ? (val: number[], params: { dataIndex: number }) => {
          const datum = safeData[params.dataIndex];
          return symbolSizeFnProp(datum ?? { x: val[0] ?? 0, y: val[1] ?? 0, size: val[2] });
        }
      : bubble
        ? (val: number[]) => {
            const raw = val[2] ?? 10;
            return Math.max(6, Math.min(60, Math.sqrt(raw) * 4));
          }
        : 8;

    // Resolve legend before returning so the grid helper can read its
    // `show` / `orient` (Codex 019defa5 PARTIAL).
    const responsiveLegend = buildResponsiveLegend({
      breakpoint,
      showLegend,
      // Scatter is single-series at the legend level (one symbol type).
      hasMultiSeries: false,
      seriesCount: 1,
      densitySpacingMultiplier,
      densityFontMultiplier,
      icon: 'circle',
    });

    return {
      animation: animate,
      animationDuration: animate ? 500 : 0,
      animationEasing: 'cubicOut',
      title: title
        ? {
            text: escapeHtml(title),
            subtext: description ? escapeHtml(description) : undefined,
            left: 'center',
            textStyle: {
              fontFamily,
              color: textPrimary,
              fontSize: scaleFontSize(16, densityFontMultiplier),
              fontWeight: 600,
            },
            subtextStyle: {
              fontFamily,
              color: textSecondary,
              fontSize: scaleFontSize(13, densityFontMultiplier),
            },
          }
        : undefined,
      tooltip: {
        trigger: 'item',
        confine: true,
        textStyle: { fontFamily, fontSize: scaleFontSize(13, densityFontMultiplier) },
        formatter: (params: unknown) => {
          const p = params as { value: number[]; name: string };
          const xVal = fmt(p.value[0]);
          const yVal = fmt(p.value[1]);
          const label = p.name && !p.name.startsWith('Point ') ? ` — ${escapeHtml(p.name)}` : '';
          return `(${escapeHtml(xVal)}, ${escapeHtml(yVal)})${label}`;
        },
      },
      legend: {
        ...responsiveLegend,
        // Preserve the explicit text style so the scatter chart keeps its
        // CSS-var-driven palette even when the helper's textStyle wins.
        textStyle: {
          fontFamily,
          color: textPrimary,
          fontSize: scaleFontSize(12, densityFontMultiplier),
        },
      },
      grid: buildResponsiveGrid({
        breakpoint,
        hasTitle: !!title,
        // Codex 019defa5 PARTIAL fix: derive padding from the resolved
        // legend's orient so mobile bottom legends don't overlap axes.
        hasBottomLegend: responsiveLegend.show && responsiveLegend.orient === 'horizontal',
        hasRightLegend: responsiveLegend.show && responsiveLegend.orient === 'vertical',
        density: {
          titleTop: scalePadding(60, densityPaddingMultiplier),
          contentTop: scalePadding(24, densityPaddingMultiplier),
          sidePadding: scalePadding(16, densityPaddingMultiplier),
          legendBottom: scalePadding(48, densityPaddingMultiplier),
          plainBottom: scalePadding(24, densityPaddingMultiplier),
        },
      }),
      xAxis: {
        type: 'value',
        name: xLabel,
        nameLocation: 'center',
        nameGap: scaleSpacing(28, densitySpacingMultiplier),
        nameTextStyle: {
          fontFamily,
          color: textSecondary,
          fontSize: scaleFontSize(12, densityFontMultiplier),
        },
        axisLine: { lineStyle: { color: borderDefault } },
        axisTick: { lineStyle: { color: borderDefault } },
        axisLabel: {
          color: textSecondary,
          fontFamily,
          fontSize: scaleFontSize(11, densityFontMultiplier),
          // Value axes need hideOverlap too — wide ranges (1k–1M) pile up
          // tick labels otherwise (Codex 019defa5 collision defaults).
          hideOverlap: true,
          formatter: (v: number) => fmt(v),
        },
        splitLine: {
          show: showGrid,
          lineStyle: { color: bgMuted, type: 'dashed' as const },
        },
      },
      yAxis: {
        type: 'value',
        name: yLabel,
        nameLocation: 'center',
        nameGap: scaleSpacing(40, densitySpacingMultiplier),
        nameTextStyle: {
          fontFamily,
          color: textSecondary,
          fontSize: scaleFontSize(12, densityFontMultiplier),
        },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: textSecondary,
          fontFamily,
          fontSize: scaleFontSize(11, densityFontMultiplier),
          hideOverlap: true,
          formatter: (v: number) => fmt(v),
        },
        splitLine: {
          show: showGrid,
          lineStyle: { color: bgMuted, type: 'dashed' as const },
        },
      },
      series: mergeMarkupPatches(
        [
          {
            // Faz 21.11 PR-A1.5 — swap to `scatterGL` when the router
            // routed to the WebGL backend AND the lazy `echarts-gl`
            // registration has actually resolved (`useGLSeriesType`).
            // Until then we render the canvas `scatter` series so
            // there is no race window where ECharts sees an unknown
            // series.type. Codex iter-A1.5 race-fix.
            type: useGLSeriesType ? 'scatterGL' : 'scatter',
            data: scatterData,
            symbolSize: symbolSizeFn,
            // PR-X4 (Codex thread 019e1e30): expose ECharts `large`
            // mode for 5K–50K Canvas point batches. `scatterGL` already
            // has its own batching, so `large` is only honored when we
            // are NOT in WebGL mode — passing it on `scatterGL` is a
            // no-op but we keep the option explicit so option diffs
            // stay snapshot-deterministic.
            ...(large ? { large: true, largeThreshold } : {}),
            itemStyle: {
              color: palette[0],
            },
            emphasis: {
              focus: 'self',
              itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.2)' },
            },
          },
        ],
        markupResult.seriesPatches,
      ),
      aria: {
        enabled: true,
        label: {
          description: description
            ? escapeHtml(description)
            : title
              ? `Scatter chart: ${escapeHtml(title)}`
              : 'Scatter chart',
        },
        ...(decalEnabled ? { decal: { show: true, decals: decalPatterns } } : {}),
      },
      // PR-A2c-wire: opt-in brush UI. Codex iter-1 said both
      // top-level `brush` config AND `toolbox.feature.brush` are
      // required — the former gates the brush primitives ECharts
      // accepts, the latter renders the visible toolbox button.
      // We restrict to `rect` + `clear` for PR-A2c parity (polygon
      // / lineX / lineY are out of scope); the helper rejects them
      // even if a future toolbox addition lets them slip through.
      ...(enableBrush
        ? {
            toolbox: {
              right: scaleSpacing(12, densitySpacingMultiplier),
              top: scaleSpacing(8, densitySpacingMultiplier),
              feature: {
                brush: {
                  type: ['rect', 'clear'],
                },
              },
            },
            brush: {
              brushMode: 'single',
              xAxisIndex: 0,
              yAxisIndex: 0,
              toolbox: ['rect', 'clear'],
              throttleType: 'debounce',
              throttleDelay: 50,
            },
          }
        : {}),
    } as EChartsOption;
  }, [
    data,
    safeData,
    showGrid,
    showLegend,
    valueFormatter,
    animate,
    colors,
    title,
    description,
    xLabel,
    yLabel,
    bubble,
    // PR-X4 (Codex thread 019e1e30): large-mode Canvas batching + custom
    // symbolSize function for non-bubble custom radius encoding.
    large,
    largeThreshold,
    symbolSizeFnProp,
    isEmpty,
    fmt,
    themeObject,
    decalEnabled,
    decalPatterns,
    densityFontMultiplier,
    densitySpacingMultiplier,
    densityPaddingMultiplier,
    effectivePalette,
    breakpoint,
    // Markup patches drive series.markLine / markArea / markPoint.
    markupResult,
    // Faz 21.11 PR-A1.5 — recompute when the router decides to swap
    // between `scatter` and `scatterGL` series types. The `useGLSeriesType`
    // flag is true only when the router wants WebGL AND the lazy
    // registration has resolved (Codex iter-A1.5 race-fix gate).
    useGLSeriesType,
    // Codex iter-A1.5b — `webGLPending` short-circuits the option to
    // null while `echarts-gl` is still loading.
    webGLPending,
    // PR-A2c-wire: toolbox/brush block changes shape when the
    // consumer toggles `enableBrush`. Dep is required so the option
    // memo recomputes (and `useEChartsRenderer.setOption` re-applies
    // the toolbox/brush config) when the prop flips.
    enableBrush,
  ]);

  // PR-A2c-wire: brush index data — what the chart actually rendered
  // in `safeData` order, with `originalIndex` preserved when the
  // upstream supplied PR-A2a downsampled output. The
  // `normalizeBrushSelection` helper walks this array using ECharts'
  // rendered `dataIndex` to lift it back to source rows. We MUST
  // build this off `safeData` (not the raw `data` prop) so guard
  // ordering matches what ECharts saw.
  const brushIndexData = useMemo(() => {
    return safeData.map((d, i) => {
      const candidate = (d as ScatterDataPoint & { originalIndex?: number }).originalIndex;
      return {
        x: d.x,
        y: d.y,
        originalIndex: typeof candidate === 'number' ? candidate : i,
      };
    });
  }, [safeData]);

  // PR-A2c-wire: persistent brush listener — fires each rectangle
  // drag and each toolbox-clear. The renderer hook owns the
  // ECharts subscription lifecycle; we just normalise the payload
  // and forward to the consumer. `null` is forwarded when ECharts
  // emits a clear (`batch[0].areas` empty / `selected.dataIndex`
  // empty AND no usable bounds — the helper handles the
  // discrimination).
  const handleBrushSelected = useCallback(
    (event: unknown) => {
      if (!onBrushSelection) return;
      // The renderer already typed this as `EChartsBrushSelectedRawEvent`
      // structurally, but our normaliser owns the canonical shape.
      const selection = normalizeBrushSelection(
        event as Parameters<typeof normalizeBrushSelection>[0],
        { data: brushIndexData },
      );
      onBrushSelection(selection);
    },
    [onBrushSelection, brushIndexData],
  );

  // Cross-filter adapter — Codex thread 019e0c25 absorb. ECharts scatter
  // emits `params.value = [x, y]` or `[x, y, size]` (bubble). Some
  // configurations also expose `params.data` as the original
  // `ScatterDataPoint`. Build a structured datum so the cross-filter
  // wrapper can emit fields like `label`, `x`, `y`, `size`, or
  // `dataIndex`.
  const handleClick = useCallback(
    (params: unknown) => {
      const p = params as {
        componentType?: string;
        data?: unknown;
        value?: unknown;
        name?: string;
        dataIndex?: number;
        seriesIndex?: number;
      };
      // Markup overlay click — Codex thread 019e0df1 absorb.
      if (
        p.componentType === 'markLine' ||
        p.componentType === 'markArea' ||
        p.componentType === 'markPoint'
      ) {
        if (!onMarkupClick) return;
        const lookupName = typeof p.name === 'string' ? p.name : undefined;
        const markup = lookupName ? markupResult.markupLookup.get(lookupName) : undefined;
        if (markup) {
          onMarkupClick({
            markup,
            chartType: 'scatter',
            seriesIndex: p.seriesIndex,
            dataIndex: p.dataIndex,
            nativeParams: params,
          });
        }
        return;
      }

      if (!onDataPointClick) return;
      const valueArr = Array.isArray(p.value) ? (p.value as number[]) : null;
      const x = valueArr?.[0];
      const y = valueArr?.[1];
      const sz = valueArr?.[2];
      const raw =
        typeof p.data === 'object' && p.data !== null ? (p.data as Record<string, unknown>) : {};
      const label =
        (typeof raw.label === 'string' ? (raw.label as string) : undefined) ??
        (p.name && p.name.length > 0 ? p.name : undefined) ??
        (typeof x === 'number' && typeof y === 'number' ? `(${x}, ${y})` : undefined);
      onDataPointClick({
        datum: {
          x,
          y,
          size: typeof sz === 'number' ? sz : undefined,
          label,
          dataIndex: typeof p.dataIndex === 'number' ? p.dataIndex : undefined,
        },
        value: typeof y === 'number' ? y : undefined,
        label,
      });
    },
    [onDataPointClick, onMarkupClick, markupResult],
  );

  // Use centralized renderer hook
  const { containerRef, instance } = useEChartsRenderer({
    option: option ?? ({} as EChartsOption),
    theme: themeObject,
    respectReducedMotion: true,
    onClick: onDataPointClick || onMarkupClick ? handleClick : undefined,
    unstable_onRenderSettled,
    // PR-A2c-wire: brush listener subscription is gated on
    // BOTH `enableBrush=true` AND a consumer callback being
    // supplied. Either flag missing → no subscription, no
    // ECharts event-bus traffic.
    unstable_onBrushSelected: enableBrush && onBrushSelection ? handleBrushSelected : undefined,
  });

  // Faz 21.5-B PR-B2: default-on a11y. ScatterChart is 2D — flatten
  // each point to {label: explicit-label-or-coordinate, value: y}
  // for SR consumption. The hidden table shows label + y-value;
  // x-coordinates surface only via tooltip (ECharts handles them).
  //
  // Codex iter-A1.5b BLOCKER 2 — cap the hidden a11y table at
  // {@link A11Y_BIG_DATA_ROW_LIMIT} rows when the dataset would
  // otherwise blow the DOM up to 1M `<tr>` elements (the WebGL
  // ceiling claim is meaningless if the screen-reader fallback table
  // hits 1M rows). PR-A2 will replace this with anomaly-aware
  // sampled rows that preserve outliers.
  const a11yData = useMemo(() => {
    const A11Y_BIG_DATA_ROW_LIMIT = 1_000;
    const source =
      safeData.length > A11Y_BIG_DATA_ROW_LIMIT
        ? safeData.slice(0, A11Y_BIG_DATA_ROW_LIMIT)
        : safeData;
    return source.map((d, i) => ({
      label: d.label ?? `Point ${i + 1} (${d.x}, ${d.y})`,
      value: d.y,
    }));
  }, [safeData]);
  const a11y = useChartA11y({
    chartType: 'scatter',
    data: a11yData,
    title,
    description,
    valueFormatter: fmt,
    echartsInstance: instance,
  });

  // Merge refs
  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      ownContainerRef.current = node;
      (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef)
        (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    },
    [forwardedRef, containerRef],
  );

  /* ---- empty state ---- */
  if (isEmpty) {
    return (
      <div
        ref={forwardedRef}
        className={cn(
          'inline-flex items-center justify-center text-sm text-[var(--text-secondary)]',
          className,
        )}
        style={{ height }}
        role="img"
        aria-label={a11y.ariaLabel}
        data-testid="scatter-chart-empty"
        {...rest}
      >
        {noDataText}
      </div>
    );
  }

  return (
    <ChartA11yShell
      a11y={a11y}
      className={className}
      height={height}
      testId="scatter-chart"
      setRefs={setRefs}
      anomalySummary={anomalySummary}
      formatAnomalyAnnouncement={formatAnomalyAnnouncement}
      {...rest}
    />
  );
});

ScatterChartInner.displayName = 'ScatterChartInner';

/**
 * ScatterChart — public wrapper. Accepts `access` + `accessReason`
 * (`AccessControlledProps`) and forwards everything else to
 * `ScatterChartInner`. Faz 21.4 PR-E2 wiring; default `access === undefined`
 * follows the identity-transform path through `ChartAccessGate`.
 */
export const ScatterChart = React.forwardRef<HTMLDivElement, ScatterChartProps>(
  function ScatterChart(
    {
      access,
      accessReason,
      onDataPointClick,
      onMarkupClick,
      onBrushSelection,
      anomalySummary,
      formatAnomalyAnnouncement,
      ...rest
    },
    ref,
  ) {
    // Access-aware callback gating — Codex iter-2 absorb.
    const { state } = resolveAccessState(access);
    return (
      <ChartAccessGate access={access} accessReason={accessReason}>
        <ScatterChartInner
          ref={ref}
          {...rest}
          onDataPointClick={guardChartCallback(state, onDataPointClick)}
          onMarkupClick={guardChartCallback(state, onMarkupClick)}
          // PR-A2c-wire: brush selection follows the same access
          // gate. `readonly` / `disabled` strips the callback so
          // the toolbox button still appears (option contains
          // toolbox config) but the dispatch never reaches the
          // consumer. The renderer's `unstable_onBrushSelected`
          // subscription is gated on the callback presence inside
          // `ScatterChartInner`, so a stripped callback also
          // detaches the ECharts event listener — no leak.
          onBrushSelection={guardChartCallback(state, onBrushSelection)}
          // PR-A2b-a11y: anomaly summary + formatter forwarded
          // through unchanged — these aren't user-facing
          // callbacks that the access gate would block.
          anomalySummary={anomalySummary}
          formatAnomalyAnnouncement={formatAnomalyAnnouncement}
        />
      </ChartAccessGate>
    );
  },
);
ScatterChart.displayName = 'ScatterChart';

export default ScatterChart;
