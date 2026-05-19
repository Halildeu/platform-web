'use client';

/**
 * BarChart -- ECharts-powered bar chart
 *
 * Backwards-compatible with the design-system BarChart props API.
 * Uses the centralized useEChartsRenderer hook for lifecycle management.
 *
 * @migration AG Charts -> ECharts (P3)
 */
import React, { useMemo, useCallback, useRef } from 'react';
import type { AccessControlledProps } from '@mfe/shared-types';
import { resolveAccessState } from '@mfe/shared-types';
import { cn } from './utils/cn';
import { resolveCssVarColor, resolveCssVarColors } from './utils/resolveCssVarColor';
import { ChartAccessGate } from './access/ChartAccessGate';
import { guardChartCallback } from './access/guardChartCallback';
import { useEChartsRenderer } from './renderers';
import { useChartTheme } from './theme/useChartTheme';
import type {
  ChartThemePreference,
  ChartDecalPreference,
  ChartDensityPreference,
  ChartAccentPreference,
} from './theme/useChartTheme';
import { scaleFontSize, scalePadding } from './theme/density-helpers';
import { CHART_CANVAS_HEIGHT } from './chartSize';
import { useResponsiveBreakpoint } from './useResponsiveChart';
import {
  buildResponsiveAxisLabel,
  buildResponsiveLegend,
  buildResponsiveGrid,
  buildResponsiveDataZoom,
} from './responsive';
import { formatCompact } from './utils/formatters';
import { sanitizeDataPoints } from './utils/data-validation';
import { ChartA11yShell, useChartA11y } from './a11y';
import type { AnomalyAnnouncementFormatter } from './a11y/ChartAriaLive';
import type { AnomalySummary } from './annotations/computeAnomalyOverlay';
import type { EChartsOption } from './renderers/echarts-imports';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ChartSize = 'sm' | 'md' | 'lg';

export type ChartDataPoint = {
  label: string;
  value: number;
  color?: string;
};

// Re-exported for backward compatibility — canonical definition lives in
// `./types` so every chart adapter shares the same `ChartClickEvent`
// shape (Codex iter-2 thread 019e0c25 review absorb: cross-filter
// adapters across 13 charts must agree on a single type).
export type { ChartClickEvent } from './types';
import type { ChartClickEvent as ChartClickEventCanonical } from './types';
type ChartClickEvent = ChartClickEventCanonical;

// Markup overlay types (Highcharts annotation parity, Codex thread
// 019e0df1 iter-3 AGREE). Re-exported so consumers can import
// `ChartMarkup` from either the chart shim or `@mfe/x-charts` root.
export type { ChartMarkup, ChartMarkupClickEvent } from './types';
import type { ChartMarkup, ChartMarkupClickEvent } from './types';
import { useMarkupAdapter } from './annotations/useMarkupAdapter';
import { mergeMarkupPatches } from './annotations/mergeMarkupPatches';

export interface BarChartProps extends AccessControlledProps {
  /** Data points to render as bars. */
  data: ChartDataPoint[];
  /** Bar orientation. @default "vertical" */
  orientation?: 'vertical' | 'horizontal';
  /** Visual size variant. @default "md" */
  size?: ChartSize;
  /** Show value labels on bars. @default false */
  showValues?: boolean;
  /** Show grid lines. @default true */
  showGrid?: boolean;
  /** Show legend below the chart. @default false */
  showLegend?: boolean;
  /** Custom value formatter. */
  valueFormatter?: (value: number) => string;
  /** Animate bars on mount. @default true */
  animate?: boolean;
  /** Override default chart colors. */
  colors?: string[];
  /** Chart title. */
  title?: string;
  /** Accessible description. */
  description?: string;
  /** Additional class name. */
  className?: string;
  /** Multi-series: grouped bars by field. */
  series?: { field: string; name: string; color?: string }[];
  /**
   * Stack multi-series bars on top of each other (or side-by-side when
   * `orientation="horizontal"`). When `true` and `series` has 2+ entries,
   * all series share a single stack identifier so ECharts paints them as
   * a contiguous bar instead of grouped bars. For single-series data
   * (no `series` prop) this option is a no-op.
   *
   * Mirrors the existing `stacked` prop on `AreaChart` and the
   * `stack: 'waterfall'` pattern in `WaterfallChart`. Required for
   * stacked-distribution widgets like the HR Nesil Dağılımı top stripe.
   *
   * @default false
   */
  stacked?: boolean;
  /**
   * Show a faint "track" background bar behind each data point — useful
   * for progress / KPI-style widgets where the empty portion of the bar
   * should still be visually represented. Maps directly to ECharts
   * `series.showBackground`.
   *
   * @default false
   */
  showBackground?: boolean;
  /**
   * Style overrides for the background track when `showBackground` is
   * `true`. Forwarded verbatim to ECharts `series.backgroundStyle`
   * (color, borderRadius, borderColor, borderWidth, shadow*, opacity).
   * Defaults to a translucent surface-muted fill when omitted.
   */
  backgroundStyle?: {
    color?: string;
    borderRadius?: number | number[];
    borderColor?: string;
    borderWidth?: number;
    opacity?: number;
  };
  /**
   * Fixed bar width in pixels (overrides ECharts auto-sizing). Useful
   * for keeping bullet/progress bars visually thin. Maps to
   * ECharts `series.barWidth`.
   */
  barWidth?: number | string;
  /**
   * Gap between bars within the same category (multi-series only).
   * Accepts a CSS-like percentage string (e.g. `"30%"`) or `'-100%'`
   * to overlap bars completely (used for the "background track" hack
   * when `showBackground` isn't enough). Maps to ECharts `series.barGap`.
   */
  barGap?: string;
  /**
   * Gap between categories (% of category width). Smaller values
   * pack bars tighter. Maps to ECharts `series.barCategoryGap`.
   */
  barCategoryGap?: string;
  /**
   * Explicit value-axis maximum. Without this the axis auto-scales to
   * the data range — fine for most cases. Use when each BarChart needs
   * to pin its OWN axis max (e.g. a bullet-style widget where the bar
   * fills `actual / max` of its own track regardless of the data
   * point's magnitude). Each chart instance owns its own axis range —
   * this prop does NOT synchronise scales across multiple sibling
   * charts; for that, render all data in a single multi-series chart.
   * Maps to ECharts `xAxis.max` (horizontal) or `yAxis.max` (vertical).
   */
  valueAxisMax?: number;
  /**
   * Explicit value-axis minimum. Defaults to 0 for ECharts bar charts;
   * override when negative-value pyramids or signed deltas need a
   * symmetric domain (e.g. `[-300, 300]` for population pyramid).
   * Maps to ECharts `xAxis.min` (horizontal) or `yAxis.min` (vertical).
   */
  valueAxisMin?: number;
  /** Callback fired when a data point (bar) is clicked. */
  onDataPointClick?: (event: ChartClickEvent) => void;
  /**
   * Visual overlay markups — threshold lines, highlight bands, anomaly
   * markers, KPI labels. Renders on top of the bars without affecting
   * the data series. See `ChartMarkup` type docs for variant details.
   */
  markups?: ChartMarkup[];
  /** Callback fired when a markup overlay is clicked. */
  onMarkupClick?: (event: ChartMarkupClickEvent) => void;
  /**
   * Theme override.
   * @default "auto" — follows documentElement signals (data-appearance / data-theme / media)
   */
  theme?: ChartThemePreference;
  /**
   * Decal pattern override (visual differentiation beyond color).
   * @default "auto" — enabled for high-contrast and print themes
   */
  decal?: ChartDecalPreference;
  /**
   * Density override (compact vs comfortable).
   * @default "auto" — follows documentElement `data-density` (mfe-shell theme axis)
   */
  density?: ChartDensityPreference;
  /**
   * Accent palette override (light/emerald/ocean/violet/sunset/graphite/dark).
   * @default "auto" — follows documentElement `data-accent` (mfe-shell theme axis)
   */
  accent?: ChartAccentPreference;
  /**
   * Faz 21.11 PR-A2b-a11y-other — anomaly summary list. When the chart
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
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_PALETTE = [
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#06b6d4',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#6366f1',
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const escapeHtml = (t: string): string =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * BarChart inner — original hook-bearing body. The outer `BarChart`
 * wrapper below adds the `access` / `accessReason` gate without touching
 * hook order (Faz 21.4 PR-E2). Accepting `Omit<BarChartProps, 'access' |
 * 'accessReason'>` keeps the inner contract honest: access is resolved
 * exactly once, in the outer wrapper, never re-read inside the hooks.
 */
const BarChartInner = React.forwardRef<
  HTMLDivElement,
  Omit<BarChartProps, 'access' | 'accessReason'>
>(function BarChartInner(
  {
    data,
    orientation = 'vertical',
    size = 'md',
    showValues = false,
    showGrid = true,
    showLegend = false,
    valueFormatter,
    animate = true,
    colors,
    title,
    description,
    className,
    series: seriesDef,
    stacked = false,
    showBackground = false,
    backgroundStyle,
    barWidth,
    barGap,
    barCategoryGap,
    valueAxisMax,
    valueAxisMin,
    onDataPointClick,
    markups,
    onMarkupClick,
    theme: themePreference = 'auto',
    decal: decalPreference = 'auto',
    density: densityPreference = 'auto',
    accent: accentPreference = 'auto',
    anomalySummary,
    formatAnomalyAnnouncement,
    ...rest
  },
  forwardedRef,
) {
  const height = CHART_CANVAS_HEIGHT[size];
  const safeData = useMemo(() => sanitizeDataPoints(data), [data]);
  const isEmpty = safeData.length === 0;
  const isHorizontal = orientation === 'horizontal';
  const hasMultiSeries = seriesDef && seriesDef.length > 0;
  const fmt = valueFormatter ?? formatCompact;

  // Own container ref so we can drive useResponsiveBreakpoint BEFORE
  // useEChartsRenderer (whose containerRef is only available after that
  // hook runs). The ref is shared with the renderer via `setRefs` below so
  // both ResizeObservers (chart resize + breakpoint detection) observe the
  // same DOM node — no extra wrapper element is added.
  const ownContainerRef = useRef<HTMLDivElement | null>(null);
  const breakpoint = useResponsiveBreakpoint(ownContainerRef);

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

  // Markup overlay adapter — Codex thread 019e0df1 absorb. dataContext
  // built from props for `LabelMarkup.anchor: { dataIndex }` resolution
  // (pure adapter — no ECharts instance needed).
  const markupResult = useMarkupAdapter(markups, {
    chartType: 'bar',
    orientation,
    dataContext: {
      labels: safeData.map((d) => d.label),
      series: [{ data: safeData.map((d) => d.value) }],
    },
  });

  const option = useMemo((): EChartsOption | null => {
    if (isEmpty) return null;

    // Codex iter-13 fallback chain: explicit `colors` prop > effectivePalette
    // (accent or HC/Print theme builder) > inline DEFAULT_PALETTE.
    // Consumer-supplied `colors` are resolved through resolveCssVarColors so
    // `var(--token)` strings become concrete values — the canvas renderer
    // cannot read CSS custom properties. effectivePalette / DEFAULT_PALETTE
    // are already resolved hex, so the resolver is a no-op for them.
    const palette = resolveCssVarColors(colors) ?? effectivePalette ?? DEFAULT_PALETTE;

    const labelFontSize = scaleFontSize(11, densityFontMultiplier);

    // Responsive axis label config — collision-aware (Codex 019defa5):
    // hideOverlap, interval driven by labelCount, mobile rotation only when
    // labels are dense enough to overlap.
    const responsiveAxisLabel = buildResponsiveAxisLabel({
      breakpoint,
      labelCount: safeData.length,
      densityFontMultiplier,
      baseFontSize: 11,
    });

    const categoryAxis = {
      type: 'category' as const,
      data: safeData.map((d) => d.label),
      axisLabel: responsiveAxisLabel,
      axisTick: { alignWithLabel: true },
    };

    const valueAxis = {
      type: 'value' as const,
      // PR-X11 (Codex thread 019e1e30): expose explicit min/max so
      // bullet-style widgets sharing a column can fix the axis range
      // (`actual/max` ratios stay comparable across rows) and pyramid
      // layouts can request a symmetric domain.
      ...(valueAxisMin !== undefined ? { min: valueAxisMin } : {}),
      ...(valueAxisMax !== undefined ? { max: valueAxisMax } : {}),
      axisLabel: {
        // Value axis keeps its formatter; just inherit responsive font size +
        // hideOverlap from the helper so wide value ranges (like 100k–1M)
        // don't pile labels on top of each other.
        fontSize: responsiveAxisLabel.fontSize,
        hideOverlap: true,
        formatter: (v: number) => fmt(v),
      },
      splitLine: {
        show: showGrid,
        lineStyle: { type: 'dashed' as const },
      },
    };

    // Responsive legend / grid / dataZoom — collision-aware (Codex 019defa5).
    // The legend stays bottom-horizontal on tablet/desktop but flips to a
    // vertical right-aligned scroll strip on mobile when many series would
    // otherwise wrap into 3+ rows; `buildResponsiveGrid` then leaves room on
    // the right side instead of the bottom.
    const responsiveLegend = buildResponsiveLegend({
      breakpoint,
      showLegend,
      hasMultiSeries: !!hasMultiSeries,
      seriesCount: hasMultiSeries ? seriesDef!.length : 1,
      densitySpacingMultiplier,
      densityFontMultiplier,
      icon: 'roundRect',
    });

    const responsiveGrid = buildResponsiveGrid({
      breakpoint,
      hasTitle: !!title,
      hasBottomLegend: responsiveLegend.show && responsiveLegend.orient === 'horizontal',
      hasRightLegend: responsiveLegend.show && responsiveLegend.orient === 'vertical',
      density: {
        titleTop: scalePadding(60, densityPaddingMultiplier),
        contentTop: scalePadding(24, densityPaddingMultiplier),
        sidePadding: scalePadding(16, densityPaddingMultiplier),
        legendBottom: scalePadding(48, densityPaddingMultiplier),
        plainBottom: scalePadding(24, densityPaddingMultiplier),
      },
    });

    // dataZoom only kicks in for category-axis charts above 30 labels on
    // tablet/mobile — keeps small charts uncluttered while still giving
    // power users a way to scrub through long datasets.
    const responsiveDataZoom = buildResponsiveDataZoom({
      breakpoint,
      labelCount: safeData.length,
      horizontal: isHorizontal,
    });

    // ECharts series shared fields — stacked, showBackground, and bar-sizing
    // options apply uniformly to every series in the chart. Only stacking
    // is gated on the multi-series path: single-series stacking is a no-op
    // (one bar can't stack on itself), so we keep the `stack` field
    // unconditional in single-series mode but force it `undefined` to
    // avoid leaking the prop into ECharts' option diff.
    const stackKey = stacked && hasMultiSeries ? 'bar-stack' : undefined;
    const backgroundOptions = showBackground
      ? {
          showBackground: true,
          backgroundStyle: {
            // `backgroundStyle` is a public prop — its `color` / `borderColor`
            // are consumer-supplied and may be `var(--token)` strings the
            // canvas renderer cannot read. Resolve both before they reach
            // ECharts; the translucent default fill stays intact when the
            // consumer omits `color`.
            color: resolveCssVarColor(backgroundStyle?.color) ?? 'rgba(180, 180, 180, 0.12)',
            borderRadius: backgroundStyle?.borderRadius ?? 4,
            borderColor: resolveCssVarColor(backgroundStyle?.borderColor),
            borderWidth: backgroundStyle?.borderWidth,
            opacity: backgroundStyle?.opacity,
          },
        }
      : {};
    const barSizeOptions = {
      ...(barWidth !== undefined ? { barWidth } : {}),
      ...(barGap !== undefined ? { barGap } : {}),
      ...(barCategoryGap !== undefined ? { barCategoryGap } : {}),
    };

    const echartsSeriesList = hasMultiSeries
      ? seriesDef!.map((s, i) => ({
          type: 'bar' as const,
          name: s.name,
          stack: stackKey,
          ...backgroundOptions,
          ...barSizeOptions,
          data: safeData.map((d) => ((d as Record<string, unknown>)[s.field] as number) ?? 0),
          itemStyle: { color: resolveCssVarColor(s.color) ?? palette[i % palette.length] },
          label: showValues
            ? {
                show: true,
                position: isHorizontal ? 'right' : ('top' as const),
                formatter: valueFormatter ? (p: { value: number }) => fmt(p.value) : undefined,
                fontSize: labelFontSize,
              }
            : { show: false },
          cursor: onDataPointClick ? 'pointer' : 'default',
        }))
      : [
          {
            type: 'bar' as const,
            name: title ?? 'Value',
            ...backgroundOptions,
            ...barSizeOptions,
            data: safeData.map((d, i) => ({
              value: d.value,
              itemStyle: { color: resolveCssVarColor(d.color) ?? palette[i % palette.length] },
            })),
            label: showValues
              ? {
                  show: true,
                  position: isHorizontal ? ('right' as const) : ('top' as const),
                  formatter: valueFormatter ? (p: { value: number }) => fmt(p.value) : undefined,
                  fontSize: labelFontSize,
                }
              : { show: false },
            cursor: onDataPointClick ? 'pointer' : 'default',
          },
        ];

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
              fontSize: scaleFontSize(16, densityFontMultiplier),
              fontWeight: 600,
            },
            subtextStyle: { fontSize: scaleFontSize(13, densityFontMultiplier) },
          }
        : undefined,
      tooltip: {
        trigger: 'axis',
        confine: true,
        axisPointer: { type: 'shadow' },
        valueFormatter: (v: unknown) => fmt(v as number),
      },
      legend: responsiveLegend,
      grid: responsiveGrid,
      ...(responsiveDataZoom ? { dataZoom: responsiveDataZoom } : {}),
      xAxis: isHorizontal ? valueAxis : categoryAxis,
      yAxis: isHorizontal ? categoryAxis : valueAxis,
      series: mergeMarkupPatches(echartsSeriesList, markupResult.seriesPatches),
      aria: {
        enabled: true,
        label: {
          description: description
            ? escapeHtml(description)
            : title
              ? `Bar chart: ${escapeHtml(title)}`
              : 'Bar chart',
        },
        ...(decalEnabled ? { decal: { show: true, decals: decalPatterns } } : {}),
      },
    } as EChartsOption;
  }, [
    data,
    orientation,
    showValues,
    showGrid,
    showLegend,
    valueFormatter,
    animate,
    colors,
    title,
    description,
    seriesDef,
    // PR-X1 BarChart wrapper extensions (Codex thread 019e1e30 AGREE):
    // stacked + showBackground + backgroundStyle + bar sizing options.
    stacked,
    showBackground,
    backgroundStyle,
    barWidth,
    barGap,
    barCategoryGap,
    // PR-X11: explicit value-axis range (Codex thread 019e1e30) — bullet
    // widgets sharing a column need fixed max; pyramid wants symmetric
    // min/max around zero.
    valueAxisMax,
    valueAxisMin,
    onDataPointClick,
    isEmpty,
    isHorizontal,
    hasMultiSeries,
    safeData,
    fmt,
    decalEnabled,
    decalPatterns,
    densityFontMultiplier,
    densitySpacingMultiplier,
    densityPaddingMultiplier,
    effectivePalette,
    // Breakpoint drives axisLabel rotation/interval, legend orientation,
    // grid padding, and dataZoom enablement (Codex 019defa5).
    breakpoint,
    // Markup patches drive series.markLine / markArea / markPoint
    // (Codex thread 019e0df1).
    markupResult,
  ]);

  const handleClick = useCallback(
    (params: unknown) => {
      // Markup overlay click dispatch — Codex thread 019e0df1 iter-3
      // absorb. ECharts surfaces `componentType: 'markLine' |
      // 'markArea' | 'markPoint'` for overlay events; we early-return
      // so `onDataPointClick` does NOT fire on the same event.
      const p = params as {
        componentType?: string;
        data?: unknown;
        name?: string;
        value?: number;
        dataIndex?: number;
        seriesIndex?: number;
      };
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
            chartType: 'bar',
            seriesIndex: p.seriesIndex,
            dataIndex: p.dataIndex,
            nativeParams: params,
          });
        }
        return;
      }

      if (!onDataPointClick) return;
      const raw =
        typeof p.data === 'object' && p.data !== null ? (p.data as Record<string, unknown>) : {};
      onDataPointClick({
        datum: { ...raw, label: p.name, value: p.value },
        value: typeof p.value === 'number' ? p.value : (raw.value as number),
        label: p.name ?? '',
      });
    },
    [onDataPointClick, onMarkupClick, markupResult],
  );

  const { containerRef, instance } = useEChartsRenderer({
    option: option ?? ({} as EChartsOption),
    theme: themeObject,
    respectReducedMotion: true,
    onClick: onDataPointClick || onMarkupClick ? handleClick : undefined,
  });

  // Faz 21.5-B PR-B1 (Codex iter-7): default-on a11y composer.
  // Wraps the chart with role="region", keyboard navigation
  // (Tab/Arrow/Home/End/Enter/Escape), live announcements, and a
  // visually-hidden data table fallback so screen readers can read
  // the data even when ECharts canvas is opaque.
  const a11yData = useMemo(
    () => safeData.map((d) => ({ label: d.label, value: d.value })),
    [safeData],
  );
  const a11y = useChartA11y({
    chartType: 'bar',
    data: a11yData,
    title,
    description,
    valueFormatter: fmt,
    echartsInstance: instance,
  });

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      // Bind the same DOM node to: (1) our own ref so useResponsiveBreakpoint
      // can observe it, (2) the renderer's ref so ECharts knows where to
      // render, (3) the user-supplied forwardedRef.
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
        data-testid="bar-chart-empty"
        {...rest}
      >
        Veri yok
      </div>
    );
  }

  return (
    <ChartA11yShell
      a11y={a11y}
      className={className}
      height={height}
      testId="bar-chart"
      setRefs={setRefs}
      anomalySummary={anomalySummary}
      formatAnomalyAnnouncement={formatAnomalyAnnouncement}
      {...rest}
    />
  );
});

BarChartInner.displayName = 'BarChartInner';

/**
 * BarChart — public wrapper. Accepts `access` + `accessReason`
 * (`AccessControlledProps`) and forwards everything else to
 * `BarChartInner`. Faz 21.4 PR-E2 wiring; default `access === undefined`
 * follows the identity-transform path through `ChartAccessGate`.
 */
export const BarChart = React.forwardRef<HTMLDivElement, BarChartProps>(function BarChart(
  {
    access,
    accessReason,
    onDataPointClick,
    onMarkupClick,
    anomalySummary,
    formatAnomalyAnnouncement,
    ...rest
  },
  ref,
) {
  const { state } = resolveAccessState(access);
  return (
    <ChartAccessGate access={access} accessReason={accessReason}>
      <BarChartInner
        ref={ref}
        {...rest}
        onDataPointClick={guardChartCallback(state, onDataPointClick)}
        onMarkupClick={guardChartCallback(state, onMarkupClick)}
        // PR-A2b-a11y-other: anomaly summary + formatter forwarded
        // through unchanged — these aren't user-facing callbacks
        // that the access gate would block.
        anomalySummary={anomalySummary}
        formatAnomalyAnnouncement={formatAnomalyAnnouncement}
      />
    </ChartAccessGate>
  );
});
BarChart.displayName = 'BarChart';

export default BarChart;
