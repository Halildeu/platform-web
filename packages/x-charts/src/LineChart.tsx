'use client';

/**
 * LineChart -- ECharts-powered line chart
 *
 * Backwards-compatible with the design-system LineChart props API.
 * Uses the centralized useEChartsRenderer hook for lifecycle management.
 *
 * @migration AG Charts -> ECharts (P3)
 */
import React, { useMemo, useCallback, useRef } from 'react';
import type { AccessControlledProps } from '@mfe/shared-types';
import { resolveAccessState } from '@mfe/shared-types';
import { cn } from './utils/cn';
import { resolveCssVarColor } from './utils/resolveCssVarColor';
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
import { formatCompact } from './utils/formatters';
import { sanitizeSeries } from './utils/data-validation';
import { ChartA11yShell, useChartA11y } from './a11y';
import type { AnomalyAnnouncementFormatter } from './a11y/ChartAriaLive';
import type { AnomalySummary } from './annotations/computeAnomalyOverlay';
import type { EChartsOption } from './renderers/echarts-imports';
import { useResponsiveBreakpoint } from './useResponsiveChart';
import {
  buildResponsiveAxisLabel,
  buildResponsiveLegend,
  buildResponsiveGrid,
  buildResponsiveDataZoom,
} from './responsive';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ChartSize = 'sm' | 'md' | 'lg';

export type ChartSeries = {
  name: string;
  data: number[];
  color?: string;
};

// Re-exported for backward compatibility — canonical definition lives in
// `./types` so every chart adapter shares the same `ChartClickEvent`
// shape (Codex iter-2 thread 019e0c25 review absorb).
export type { ChartClickEvent } from './types';
import type { ChartClickEvent as ChartClickEventCanonical } from './types';
type ChartClickEvent = ChartClickEventCanonical;

// Markup overlay types (Highcharts annotation parity, Codex thread
// 019e0df1 iter-3 AGREE).
export type { ChartMarkup, ChartMarkupClickEvent } from './types';
import type { ChartMarkup, ChartMarkupClickEvent } from './types';
import { useMarkupAdapter } from './annotations/useMarkupAdapter';
import { mergeMarkupPatches } from './annotations/mergeMarkupPatches';

export interface LineChartProps extends AccessControlledProps {
  /** Series to render as lines. */
  series: ChartSeries[];
  /** X-axis labels. */
  labels: string[];
  /** Visual size variant. @default "md" */
  size?: ChartSize;
  /** Show dot markers at data points. @default true */
  showDots?: boolean;
  /** Show grid lines. @default true */
  showGrid?: boolean;
  /** Show legend below the chart. @default false */
  showLegend?: boolean;
  /** Fill area under the lines. @default false */
  showArea?: boolean;
  /** Use bezier curves instead of straight lines. @default false */
  curved?: boolean;
  /**
   * Render the line as a step function instead of a continuous slope.
   *
   * - `'start'` — vertical jump at the leading edge of each data point
   * - `'middle'` — jump in the middle of the segment (centred between two points)
   * - `'end'` — jump at the trailing edge
   *
   * Mutually exclusive with `curved` (ECharts ignores `smooth` when
   * `step` is set). Useful for status / state history charts where
   * a continuous slope would imply interpolation that doesn't exist
   * in the underlying data. Maps to ECharts `series.step`.
   *
   * @default undefined
   */
  step?: 'start' | 'middle' | 'end';
  /**
   * Connect data points across null / undefined values. By default
   * ECharts breaks the line at the gap (which is correct for "missing
   * data") but for some series (e.g. user-edited sparse manual entries)
   * a connected line communicates "trend" more clearly. Maps to
   * ECharts `series.connectNulls`.
   *
   * @default false
   */
  connectNulls?: boolean;
  /** Custom value formatter. */
  valueFormatter?: (value: number) => string;
  /** Animate line drawing on mount. @default true */
  animate?: boolean;
  /** Chart title. */
  title?: string;
  /** Accessible description. */
  description?: string;
  /** Additional class name. */
  className?: string;
  /** Callback fired when a data point (marker) is clicked. */
  onDataPointClick?: (event: ChartClickEvent) => void;
  /**
   * Visual overlay markups — threshold lines, highlight bands, anomaly
   * markers, KPI labels. Codex thread 019e0df1 iter-3 absorb.
   */
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
  /**
   * Density override (compact vs comfortable).
   * @default "auto" — follows documentElement `data-density`
   */
  density?: ChartDensityPreference;
  /** Accent palette override. @default "auto" */
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
 * LineChart inner — original hook-bearing body. The outer `LineChart`
 * wrapper below adds the `access` / `accessReason` gate without touching
 * hook order (Faz 21.4 PR-E2). Accepting `Omit<LineChartProps, 'access' |
 * 'accessReason'>` keeps the inner contract honest: access is resolved
 * exactly once, in the outer wrapper, never re-read inside the hooks.
 */
const LineChartInner = React.forwardRef<
  HTMLDivElement,
  Omit<LineChartProps, 'access' | 'accessReason'>
>(function LineChartInner(
  {
    series: seriesData,
    labels,
    size = 'md',
    showDots = true,
    showGrid = true,
    showLegend = false,
    showArea = false,
    curved = false,
    step,
    connectNulls = false,
    valueFormatter,
    animate = true,
    title,
    description,
    className,
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
  const safeSeries = useMemo(() => sanitizeSeries(seriesData), [seriesData]);
  const isEmpty = safeSeries.length === 0 || !labels || labels.length === 0;
  const fmt = valueFormatter ?? formatCompact;
  const hasMultiSeries = safeSeries.length > 1;

  // Markup overlay adapter — Codex thread 019e0df1.
  const markupResult = useMarkupAdapter(markups, {
    chartType: 'line',
    dataContext: {
      labels,
      series: safeSeries.map((s) => ({ name: s.name, data: s.data })),
    },
  });

  // Container ref shared with the renderer (via setRefs) so the same DOM node
  // drives both useResponsiveBreakpoint and useEChartsRenderer's resize loop.
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

  const option = useMemo((): EChartsOption | null => {
    if (isEmpty) return null;

    const palette = effectivePalette ?? DEFAULT_PALETTE;

    // Compute the responsive dataZoom once — option object spreads it
    // conditionally. Re-computing inside the spread would call the helper
    // twice per render.
    const dataZoom = buildResponsiveDataZoom({
      breakpoint,
      labelCount: labels.length,
    });

    // Resolve legend before grid so the grid helper can read its `show` /
    // `orient` to decide which side needs padding (Codex 019defa5 PARTIAL).
    const responsiveLegend = buildResponsiveLegend({
      breakpoint,
      showLegend,
      hasMultiSeries,
      seriesCount: safeSeries.length,
      densitySpacingMultiplier,
      densityFontMultiplier,
      icon: 'roundRect',
    });

    const echartsSeriesList = safeSeries.map((s, i) => {
      // Resolve a consumer `var(--token)` color once — the canvas renderer
      // cannot read CSS custom properties. `palette` is already resolved.
      const seriesColor = resolveCssVarColor(s.color) ?? palette[i % palette.length];
      return {
        type: 'line' as const,
        name: s.name,
        data: s.data,
        // ECharts ignores `smooth` when `step` is set, but we still pass
        // `false` explicitly for clarity. `step` takes precedence so a
        // caller that sets both gets step lines (matches the documented
        // mutual-exclusivity).
        smooth: step ? false : curved,
        step: step ?? false,
        connectNulls,
        symbol: showDots ? 'circle' : 'none',
        symbolSize: showDots ? 6 : 0,
        lineStyle: { color: seriesColor, width: 2 },
        itemStyle: { color: seriesColor },
        areaStyle: showArea ? { color: seriesColor, opacity: 0.18 } : undefined,
        emphasis: {
          focus: 'series' as const,
          itemStyle: { borderWidth: 2 },
        },
        cursor: onDataPointClick ? 'pointer' : 'default',
      };
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
              fontSize: scaleFontSize(16, densityFontMultiplier),
              fontWeight: 600,
            },
            subtextStyle: { fontSize: scaleFontSize(13, densityFontMultiplier) },
          }
        : undefined,
      tooltip: {
        trigger: 'axis',
        confine: true,
        valueFormatter: (v: unknown) => fmt(v as number),
      },
      legend: responsiveLegend,
      grid: buildResponsiveGrid({
        breakpoint,
        hasTitle: !!title,
        // Codex 019defa5 PARTIAL fix: derive bottom-legend padding from
        // the resolved legend's orient — earlier draft hardcoded
        // `breakpoint !== 'mobile'` which left mobile bottom legends
        // overlapping the x-axis when seriesCount <= 5.
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
      ...(dataZoom ? { dataZoom } : {}),
      xAxis: {
        type: 'category',
        data: labels,
        boundaryGap: false,
        axisLabel: buildResponsiveAxisLabel({
          breakpoint,
          labelCount: labels.length,
          densityFontMultiplier,
          baseFontSize: 11,
        }),
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          fontSize: scaleFontSize(11, densityFontMultiplier),
          hideOverlap: true,
          formatter: (v: number) => fmt(v),
        },
        splitLine: {
          show: showGrid,
          lineStyle: { type: 'dashed' as const },
        },
      },
      series: mergeMarkupPatches(echartsSeriesList, markupResult.seriesPatches),
      aria: {
        enabled: true,
        label: {
          description: description
            ? escapeHtml(description)
            : title
              ? `Line chart: ${escapeHtml(title)}`
              : 'Line chart',
        },
        ...(decalEnabled ? { decal: { show: true, decals: decalPatterns } } : {}),
      },
    } as EChartsOption;
  }, [
    safeSeries,
    seriesData,
    labels,
    showDots,
    showGrid,
    showLegend,
    showArea,
    curved,
    // PR-X2 (Codex thread 019e1e30): step + connectNulls exposed for
    // status/state-history charts that need stepped lines or gap-skipping
    // semantics. Mutually exclusive with `curved` — see series builder.
    step,
    connectNulls,
    valueFormatter,
    animate,
    title,
    description,
    onDataPointClick,
    isEmpty,
    hasMultiSeries,
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
    // Markup patches drive series.markLine / markArea / markPoint.
    markupResult,
  ]);

  const handleClick = useCallback(
    (params: unknown) => {
      const p = params as {
        componentType?: string;
        seriesName?: string;
        seriesIndex?: number;
        dataIndex?: number;
        name?: string;
        value?: number;
      };
      // Markup overlay click — Codex thread 019e0df1 absorb. Early
      // return so onDataPointClick does NOT fire on the same event.
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
            chartType: 'line',
            seriesIndex: p.seriesIndex,
            dataIndex: p.dataIndex,
            nativeParams: params,
          });
        }
        return;
      }

      if (!onDataPointClick) return;
      // Codex thread 019e0c25 post-impl review: align LineChart datum
      // with the canonical Area pattern. `dataIndex` and `seriesIndex`
      // were absent in the previous shape, which made the cross-filter
      // wrapper unable to surface those fields when emitFields included
      // them — and the contract test was asserting the truncated shape
      // rather than catching the drift.
      const value = typeof p.value === 'number' ? p.value : undefined;
      onDataPointClick({
        datum: {
          seriesName: p.seriesName ?? '',
          label: p.name ?? '',
          value,
          dataIndex: typeof p.dataIndex === 'number' ? p.dataIndex : undefined,
          seriesIndex: typeof p.seriesIndex === 'number' ? p.seriesIndex : undefined,
        },
        value,
        label: p.name,
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

  // Faz 21.5-B PR-B2: default-on a11y. Adapt LineChart's series-based
  // shape (multiple series × N points) into the hook's flat
  // {label, value} format. Picks the first series' values aligned
  // with x-axis labels — matches what a screen-reader user expects
  // when traversing the primary trend with arrow keys.
  const a11yData = useMemo(
    () =>
      labels.map((label, i) => ({
        label,
        value: safeSeries[0]?.data[i] ?? 0,
      })),
    [labels, safeSeries],
  );
  const a11y = useChartA11y({
    chartType: 'line',
    data: a11yData,
    title,
    description,
    valueFormatter: fmt,
    echartsInstance: instance,
  });

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      // Same DOM node feeds both the breakpoint observer (own ref) and the
      // ECharts renderer (containerRef from useEChartsRenderer).
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
        data-testid="line-chart-empty"
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
      testId="line-chart"
      setRefs={setRefs}
      anomalySummary={anomalySummary}
      formatAnomalyAnnouncement={formatAnomalyAnnouncement}
      {...rest}
    />
  );
});

LineChartInner.displayName = 'LineChartInner';

/**
 * LineChart — public wrapper. Accepts `access` + `accessReason`
 * (`AccessControlledProps`) and forwards everything else to
 * `LineChartInner`. Faz 21.4 PR-E2 wiring; default `access === undefined`
 * follows the identity-transform path through `ChartAccessGate`.
 */
export const LineChart = React.forwardRef<HTMLDivElement, LineChartProps>(function LineChart(
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
      <LineChartInner
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
LineChart.displayName = 'LineChart';

export default LineChart;
