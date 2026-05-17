'use client';

/**
 * CandlestickChart — ECharts-powered OHLC (Open / High / Low / Close)
 * financial chart.
 *
 * Renders a series of candlesticks where the body length encodes the
 * open-close range and the wick encodes the full high-low spread.
 * Bullish candles (close > open) and bearish candles (close < open)
 * use distinct colors so direction is visible at a glance.
 *
 * @migration ECharts candlestick series — PR-X7 of the @mfe/x-charts
 * native-feature parity campaign (Codex thread 019e1e30).
 */
import React, { useMemo, useCallback, useRef } from 'react';
import type { AccessControlledProps } from '@mfe/shared-types';
import { resolveAccessState } from '@mfe/shared-types';
import { ChartAccessGate } from './access/ChartAccessGate';
import { guardChartCallback } from './access/guardChartCallback';
import { cn } from './utils/cn';
import { useEChartsRenderer, useRequiredEChartsFeature } from './renderers';
import { useResponsiveBreakpoint } from './useResponsiveChart';
import {
  buildResponsiveLegend,
  buildResponsiveGrid,
  buildResponsiveAxisLabel,
  buildResponsiveDataZoom,
} from './responsive';
import { ChartA11yShell, useChartA11y } from './a11y';
import type { AnomalyAnnouncementFormatter } from './a11y/ChartAriaLive';
import type { AnomalySummary } from './annotations/computeAnomalyOverlay';
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
import type { EChartsOption } from './renderers/echarts-imports';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ChartSize = 'sm' | 'md' | 'lg';

/**
 * Single OHLC bar. `label` is the time-axis category (typically a date
 * or period like `'2026-05-01'` or `'Q1'`). The `[open, close, low,
 * high]` tuple matches ECharts' wire format — DO NOT reorder.
 */
export type CandlestickDataPoint = {
  label: string;
  open: number;
  close: number;
  low: number;
  high: number;
};

// Cross-filter compatibility — re-export the canonical click event.
export type { ChartClickEvent } from './types';
import type { ChartClickEvent as ChartClickEventCanonical } from './types';
type ChartClickEvent = ChartClickEventCanonical;

// Markup overlay — NO-OP on Candlestick v1. Future PR can wire markLine
// for support/resistance bands.
export type { ChartMarkup, ChartMarkupClickEvent } from './types';
import type { ChartMarkup, ChartMarkupClickEvent } from './types';
import { useMarkupAdapter } from './annotations/useMarkupAdapter';

export interface CandlestickChartProps extends AccessControlledProps {
  /** OHLC data points — one bar per `label` time slot. */
  data: CandlestickDataPoint[];
  /** Visual size variant. @default "md" */
  size?: ChartSize;
  /** Show grid lines. @default true */
  showGrid?: boolean;
  /** Show legend below the chart. @default false */
  showLegend?: boolean;
  /**
   * Color for bullish candles (close ≥ open). Defaults to a green token.
   */
  bullishColor?: string;
  /**
   * Color for bearish candles (close < open). Defaults to a red token.
   */
  bearishColor?: string;
  /** Custom value formatter for axis labels + tooltip. */
  valueFormatter?: (value: number) => string;
  /** Animate candles on mount. @default true */
  animate?: boolean;
  /** Chart title. */
  title?: string;
  /** Accessible description. */
  description?: string;
  /** Additional class name. */
  className?: string;
  /** Callback fired when a candle is clicked. */
  onDataPointClick?: (event: ChartClickEvent) => void;
  /** Visual overlay markups — NO-OP on v1, dev warning surfaces. */
  markups?: ChartMarkup[];
  /** Callback fired when a markup overlay is clicked (NO-OP on v1). */
  onMarkupClick?: (event: ChartMarkupClickEvent) => void;
  /** Theme override. @default "auto" */
  theme?: ChartThemePreference;
  /** Decal pattern override. @default "auto" */
  decal?: ChartDecalPreference;
  /** Density override. @default "auto" */
  density?: ChartDensityPreference;
  /** Accent palette override. @default "auto" */
  accent?: ChartAccentPreference;
  /** Anomaly summary list for SR announcement. */
  anomalySummary?: AnomalySummary[];
  /** Custom anomaly announcement formatter. */
  formatAnomalyAnnouncement?: AnomalyAnnouncementFormatter;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const escapeHtml = (t: string): string =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * Stable empty option dispatched while the lazy `candlestick` series
 * module is still loading — a module constant (not an inline `{}`) so
 * the renderer's option-update effect does not thrash before
 * {@link useRequiredEChartsFeature} reports ready.
 */
const EMPTY_CANDLESTICK_OPTION: EChartsOption = {};

const CandlestickChartInner = React.forwardRef<
  HTMLDivElement,
  Omit<CandlestickChartProps, 'access' | 'accessReason'>
>(function CandlestickChartInner(
  {
    data,
    size = 'md',
    showGrid = true,
    showLegend = false,
    bullishColor,
    bearishColor,
    valueFormatter,
    animate = true,
    title,
    description,
    className,
    onDataPointClick,
    markups,
    onMarkupClick: _onMarkupClick,
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
  const isEmpty = !data || data.length === 0;
  const fmt = valueFormatter ?? formatCompact;

  // PR-X16b-prep: `candlestick` is lazy-registered (bundle headroom), so
  // hold the option back until ready and gate `echarts.init()` — ECharts
  // snapshots layout/visual handlers at init time (Codex 019e337e).
  const candlestickFeature = useRequiredEChartsFeature('candlestick', { enabled: !isEmpty });
  const candlestickFeatureReady = candlestickFeature.status === 'ready';

  const ownContainerRef = useRef<HTMLDivElement | null>(null);
  const breakpoint = useResponsiveBreakpoint(ownContainerRef);

  const {
    decalEnabled,
    decalPatterns,
    densityFontMultiplier,
    densityPaddingMultiplier,
    effectivePalette,
  } = useChartTheme({
    theme: themePreference,
    decal: decalPreference,
    density: densityPreference,
    accent: accentPreference,
  });

  // Markup adapter — surfaces dev warning if consumer supplies markups
  // (NO-OP on Candlestick v1; future PR may wire markLine for S/R).
  useMarkupAdapter(markups, {
    chartType: 'bar',
    orientation: 'vertical',
    dataContext: { labels: data.map((d) => d.label), series: [{ data: [] }] },
  });

  const option = useMemo((): EChartsOption | null => {
    // Hold the option until BOTH data exists AND the lazy `candlestick`
    // module has registered (see `candlestickFeature` above).
    if (isEmpty || !candlestickFeatureReady) return null;

    const palette = effectivePalette ?? ['#22c55e', '#ef4444'];
    const upColor = bullishColor ?? palette[0] ?? '#22c55e';
    const downColor = bearishColor ?? palette[1] ?? '#ef4444';

    // ECharts candlestick wire format: [open, close, low, high].
    const candlestickData: number[][] = data.map((d) => [d.open, d.close, d.low, d.high]);
    const categories = data.map((d) => d.label);

    const responsiveAxisLabel = buildResponsiveAxisLabel({
      breakpoint,
      labelCount: categories.length,
      isHorizontal: false,
      densityFontMultiplier,
    });

    const responsiveLegend = buildResponsiveLegend({
      breakpoint,
      showLegend,
      hasMultiSeries: false,
      seriesCount: 1,
      densitySpacingMultiplier: 1,
      densityFontMultiplier,
      icon: 'roundRect',
    });

    const responsiveGrid = buildResponsiveGrid({
      breakpoint,
      showLegend: responsiveLegend.show,
      legendOrient: responsiveLegend.orient,
      hasTitle: !!title,
      hasBottomLegend: responsiveLegend.show && responsiveLegend.orient === 'horizontal',
      hasRightLegend: responsiveLegend.show && responsiveLegend.orient === 'vertical',
      density: {
        titleTop: scalePadding(60, densityPaddingMultiplier),
        contentTop: scalePadding(24, densityPaddingMultiplier),
        sidePadding: scalePadding(24, densityPaddingMultiplier),
        legendBottom: scalePadding(48, densityPaddingMultiplier),
        plainBottom: scalePadding(24, densityPaddingMultiplier),
      },
    });

    // Long financial series benefit from dataZoom by default; defer to
    // the responsive helper for cadence (matches BarChart pattern).
    const responsiveDataZoom = buildResponsiveDataZoom({
      breakpoint,
      labelCount: categories.length,
      horizontal: false,
    });

    return {
      animation: animate,
      animationDuration: animate ? 500 : 0,
      title: title
        ? {
            text: escapeHtml(title),
            subtext: description ? escapeHtml(description) : undefined,
            left: 'center',
            textStyle: {
              fontSize: scaleFontSize(16, densityFontMultiplier),
              fontWeight: 600,
            },
          }
        : undefined,
      tooltip: {
        trigger: 'axis',
        confine: true,
        axisPointer: { type: 'cross' },
        formatter: (
          params:
            | Array<{ dataIndex: number; data: number[] }>
            | { dataIndex: number; data: number[] },
        ) => {
          // ECharts axis trigger passes an array; item trigger passes
          // a single object. Coerce to array.
          const arr = Array.isArray(params) ? params : [params];
          const p = arr[0];
          if (!p) return '';
          const cat = categories[p.dataIndex] ?? '';
          // Wire format reminder: [open, close, low, high].
          // The `params.data` first cell often carries the category
          // index when ECharts forwards through a category axis; the
          // numeric tuple lives in indices 1..4. We probe length to
          // tolerate both shapes (axis trigger and item trigger).
          const start = p.data.length === 5 ? 1 : 0;
          const o = p.data[start];
          const c = p.data[start + 1];
          const l = p.data[start + 2];
          const h = p.data[start + 3];
          return [
            `<b>${escapeHtml(cat)}</b>`,
            `Open: ${fmt(o ?? 0)}`,
            `Close: ${fmt(c ?? 0)}`,
            `Low: ${fmt(l ?? 0)}`,
            `High: ${fmt(h ?? 0)}`,
          ].join('<br/>');
        },
      },
      legend: responsiveLegend,
      grid: responsiveGrid,
      ...(responsiveDataZoom ? { dataZoom: responsiveDataZoom } : {}),
      xAxis: {
        type: 'category',
        data: categories,
        boundaryGap: true,
        axisLabel: responsiveAxisLabel,
      },
      yAxis: {
        type: 'value',
        scale: true, // financial charts NEED scale=true; ECharts default false would clip range
        axisLabel: { formatter: (v: number) => fmt(v) },
        splitLine: { show: showGrid },
      },
      series: [
        {
          type: 'candlestick' as const,
          name: title ?? 'OHLC',
          data: candlestickData,
          itemStyle: {
            color: upColor, // bullish (close ≥ open)
            color0: downColor, // bearish (close < open)
            borderColor: upColor,
            borderColor0: downColor,
          },
          cursor: onDataPointClick ? 'pointer' : 'default',
        },
      ],
      aria: {
        enabled: true,
        label: {
          description: description
            ? escapeHtml(description)
            : title
              ? `Candlestick chart: ${escapeHtml(title)}`
              : 'Candlestick chart',
        },
        ...(decalEnabled ? { decal: { show: true, decals: decalPatterns } } : {}),
      },
    } as EChartsOption;
  }, [
    data,
    isEmpty,
    candlestickFeatureReady,
    showGrid,
    showLegend,
    bullishColor,
    bearishColor,
    animate,
    title,
    description,
    onDataPointClick,
    fmt,
    decalEnabled,
    decalPatterns,
    densityFontMultiplier,
    densityPaddingMultiplier,
    effectivePalette,
    breakpoint,
  ]);

  const handleClick = useCallback(
    (params: unknown) => {
      if (!onDataPointClick) return;
      const p = params as { dataIndex?: number; data?: number[]; name?: string };
      const idx = p.dataIndex ?? 0;
      const entry = data[idx];
      onDataPointClick({
        seriesName: title ?? 'OHLC',
        seriesIndex: 0,
        dataIndex: idx,
        label: entry?.label ?? p.name ?? '',
        // Use `close` as the headline value — matches the convention used
        // by financial dashboards that need a single primary measure.
        value: entry?.close ?? 0,
        datum: entry ?? undefined,
      });
    },
    [data, onDataPointClick, title],
  );

  const a11yState = useChartA11y({
    chartType: 'candlestick',
    title,
    description,
    // Use the close value as the a11y "value" for the hidden data table.
    // This is the most common headline figure for OHLC bars.
    data: data.map((d) => ({ label: d.label, value: d.close })),
    valueFormatter: fmt,
    anomalySummary,
    formatAnomalyAnnouncement,
  });

  const { containerRef, instance: _instance } = useEChartsRenderer({
    // Gate echarts.init() until the lazy `candlestick` module has
    // registered — ECharts snapshots layout/visual handlers at init.
    enabled: candlestickFeatureReady,
    option: option ?? EMPTY_CANDLESTICK_OPTION,
    respectReducedMotion: true,
    onClick: onDataPointClick ? handleClick : undefined,
  });

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      ownContainerRef.current = node;
      (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [containerRef, forwardedRef],
  );

  return (
    <ChartA11yShell
      a11y={a11yState}
      className={cn('mfe-candlestick-chart-shell', className)}
      height={height}
      testId="candlestick-chart"
      setRefs={setRefs}
      anomalySummary={anomalySummary}
      formatAnomalyAnnouncement={formatAnomalyAnnouncement}
      {...rest}
    />
  );
});

CandlestickChartInner.displayName = 'CandlestickChartInner';

/**
 * CandlestickChart — public wrapper. Adds the standard `access` /
 * `accessReason` gate without touching hook order.
 */
export const CandlestickChart = React.forwardRef<HTMLDivElement, CandlestickChartProps>(
  function CandlestickChart({ access, accessReason, onDataPointClick, ...rest }, ref) {
    const { state } = resolveAccessState(access);
    return (
      <ChartAccessGate access={access} accessReason={accessReason}>
        <CandlestickChartInner
          ref={ref}
          {...rest}
          onDataPointClick={guardChartCallback(state, onDataPointClick)}
        />
      </ChartAccessGate>
    );
  },
);
CandlestickChart.displayName = 'CandlestickChart';
