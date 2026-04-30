/**
 * LineChart -- ECharts-powered line chart
 *
 * Backwards-compatible with the design-system LineChart props API.
 * Uses the centralized useEChartsRenderer hook for lifecycle management.
 *
 * @migration AG Charts -> ECharts (P3)
 */
import React, { useMemo, useCallback } from 'react';
import { cn } from '@mfe/design-system';
import { useEChartsRenderer } from './renderers';
import { useChartTheme } from './theme/useChartTheme';
import type {
  ChartThemePreference,
  ChartDecalPreference,
  ChartDensityPreference,
} from './theme/useChartTheme';
import { scaleFontSize, scaleSpacing, scalePadding } from './theme/density-helpers';
import { formatCompact } from './utils/formatters';
import { sanitizeSeries } from './utils/data-validation';
import { ChartA11yShell, useChartA11y } from './a11y';
import type { EChartsOption } from './renderers/echarts-imports';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ChartSize = 'sm' | 'md' | 'lg';

export type ChartSeries = {
  name: string;
  data: number[];
  color?: string;
};

export type ChartClickEvent = {
  datum: Record<string, unknown>;
  value?: number;
  label?: string;
};

export interface LineChartProps {
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
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SIZE_HEIGHT: Record<ChartSize, number> = { sm: 200, md: 300, lg: 400 };

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

export const LineChart = React.forwardRef<HTMLDivElement, LineChartProps>(function LineChart(
  {
    series: seriesData,
    labels,
    size = 'md',
    showDots = true,
    showGrid = true,
    showLegend = false,
    showArea = false,
    curved = false,
    valueFormatter,
    animate = true,
    title,
    description,
    className,
    onDataPointClick,
    theme: themePreference = 'auto',
    decal: decalPreference = 'auto',
    density: densityPreference = 'auto',
    ...rest
  },
  forwardedRef,
) {
  const height = SIZE_HEIGHT[size];
  const safeSeries = useMemo(() => sanitizeSeries(seriesData), [seriesData]);
  const isEmpty = safeSeries.length === 0 || !labels || labels.length === 0;
  const fmt = valueFormatter ?? formatCompact;

  const {
    themeObject,
    decalEnabled,
    decalPatterns,
    densityFontMultiplier,
    densitySpacingMultiplier,
    densityPaddingMultiplier,
  } = useChartTheme({
    theme: themePreference,
    decal: decalPreference,
    density: densityPreference,
  });

  const option = useMemo((): EChartsOption | null => {
    if (isEmpty) return null;

    const palette = DEFAULT_PALETTE;

    const echartsSeriesList = safeSeries.map((s, i) => ({
      type: 'line' as const,
      name: s.name,
      data: s.data,
      smooth: curved,
      symbol: showDots ? 'circle' : 'none',
      symbolSize: showDots ? 6 : 0,
      lineStyle: { color: s.color ?? palette[i % palette.length], width: 2 },
      itemStyle: { color: s.color ?? palette[i % palette.length] },
      areaStyle: showArea
        ? { color: s.color ?? palette[i % palette.length], opacity: 0.18 }
        : undefined,
      emphasis: {
        focus: 'series' as const,
        itemStyle: { borderWidth: 2 },
      },
      cursor: onDataPointClick ? 'pointer' : 'default',
    }));

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
      legend: {
        show: showLegend || safeSeries.length > 1,
        bottom: 0,
        icon: 'roundRect',
        itemWidth: scaleSpacing(12, densitySpacingMultiplier),
        itemHeight: scaleSpacing(8, densitySpacingMultiplier),
        textStyle: { fontSize: scaleFontSize(12, densityFontMultiplier) },
      },
      grid: {
        top: title
          ? scalePadding(60, densityPaddingMultiplier)
          : scalePadding(24, densityPaddingMultiplier),
        right: scalePadding(16, densityPaddingMultiplier),
        bottom:
          showLegend || safeSeries.length > 1
            ? scalePadding(48, densityPaddingMultiplier)
            : scalePadding(24, densityPaddingMultiplier),
        left: scalePadding(16, densityPaddingMultiplier),
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: labels,
        boundaryGap: false,
        axisLabel: { fontSize: scaleFontSize(11, densityFontMultiplier) },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          fontSize: scaleFontSize(11, densityFontMultiplier),
          formatter: (v: number) => fmt(v),
        },
        splitLine: {
          show: showGrid,
          lineStyle: { type: 'dashed' as const },
        },
      },
      series: echartsSeriesList,
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
    seriesData,
    labels,
    showDots,
    showGrid,
    showLegend,
    showArea,
    curved,
    valueFormatter,
    animate,
    title,
    description,
    onDataPointClick,
    isEmpty,
    decalEnabled,
    decalPatterns,
    densityFontMultiplier,
    densitySpacingMultiplier,
    densityPaddingMultiplier,
  ]);

  const handleClick = useCallback(
    (params: unknown) => {
      if (!onDataPointClick) return;
      const p = params as { seriesName: string; name: string; value: number; dataIndex: number };
      onDataPointClick({
        datum: { seriesName: p.seriesName, label: p.name, value: p.value },
        value: p.value,
        label: p.name,
      });
    },
    [onDataPointClick],
  );

  const { containerRef, instance } = useEChartsRenderer({
    option: option ?? ({} as EChartsOption),
    theme: themeObject,
    respectReducedMotion: true,
    onClick: onDataPointClick ? handleClick : undefined,
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
      {...rest}
    />
  );
});

LineChart.displayName = 'LineChart';

export default LineChart;
