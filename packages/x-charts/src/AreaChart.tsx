/**
 * AreaChart -- ECharts-powered area chart
 *
 * Backwards-compatible with the design-system AreaChart props API.
 * Uses the centralized useEChartsRenderer hook for lifecycle management.
 *
 * @migration AG Charts -> ECharts (P3)
 */
import React, { useMemo, useCallback } from 'react';
import type { AccessControlledProps } from '@mfe/shared-types';
import { ChartAccessGate } from './access/ChartAccessGate';
import { cn } from './utils/cn';
import { useEChartsRenderer } from './renderers';
import { ChartA11yShell, useChartA11y } from './a11y';
import { useChartTheme } from './theme/useChartTheme';
import type {
  ChartThemePreference,
  ChartDecalPreference,
  ChartDensityPreference,
  ChartAccentPreference,
} from './theme/useChartTheme';
import { scaleFontSize, scaleSpacing, scalePadding } from './theme/density-helpers';
import { formatCompact } from './utils/formatters';
import { sanitizeSeries } from './utils/data-validation';
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

export interface AreaChartProps extends AccessControlledProps {
  /** Series to render as filled areas. */
  series: ChartSeries[];
  /** X-axis labels. */
  labels: string[];
  /** Visual size variant. @default "md" */
  size?: ChartSize;
  /** Stack areas on top of each other. @default false */
  stacked?: boolean;
  /** Show dot markers at data points. @default true */
  showDots?: boolean;
  /** Show grid lines. @default true */
  showGrid?: boolean;
  /** Show legend below the chart. @default false */
  showLegend?: boolean;
  /** Use gradient fills instead of flat color. @default true */
  gradient?: boolean;
  /** Use bezier curves instead of straight lines. @default false */
  curved?: boolean;
  /** Custom value formatter. */
  valueFormatter?: (value: number) => string;
  /** Animate on mount. @default true */
  animate?: boolean;
  /** Chart title. */
  title?: string;
  /** Accessible description. */
  description?: string;
  /** Additional class name. */
  className?: string;
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
   * @default "auto"
   */
  density?: ChartDensityPreference;
  /** Accent palette override. @default "auto" */
  accent?: ChartAccentPreference;
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

/**
 * Build a linear gradient definition for ECharts area fills.
 * Goes from `opacity` at the top to 0 at the bottom.
 */
const makeGradient = (color: string, opacity: number) => ({
  type: 'linear' as const,
  x: 0,
  y: 0,
  x2: 0,
  y2: 1,
  colorStops: [
    {
      offset: 0,
      color: `${color}${Math.round(opacity * 255)
        .toString(16)
        .padStart(2, '0')}`,
    },
    { offset: 1, color: `${color}00` },
  ],
});

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * AreaChart inner — original hook-bearing body. The outer `AreaChart`
 * wrapper below adds the `access` / `accessReason` gate without touching
 * hook order (Faz 21.4 PR-E2). Accepting `Omit<AreaChartProps, 'access' |
 * 'accessReason'>` keeps the inner contract honest: access is resolved
 * exactly once, in the outer wrapper, never re-read inside the hooks.
 */
const AreaChartInner = React.forwardRef<
  HTMLDivElement,
  Omit<AreaChartProps, 'access' | 'accessReason'>
>(function AreaChartInner(
  {
    series: seriesData,
    labels,
    size = 'md',
    stacked = false,
    showDots = true,
    showGrid = true,
    showLegend = false,
    gradient = true,
    curved = false,
    valueFormatter,
    animate = true,
    title,
    description,
    className,
    theme: themePreference = 'auto',
    decal: decalPreference = 'auto',
    density: densityPreference = 'auto',
    accent: accentPreference = 'auto',
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

    const echartsSeriesList = safeSeries.map((s, i) => {
      const color = s.color ?? palette[i % palette.length];
      return {
        type: 'line' as const,
        name: s.name,
        data: s.data,
        smooth: curved,
        stack: stacked ? 'total' : undefined,
        symbol: showDots ? 'circle' : 'none',
        symbolSize: showDots ? 5 : 0,
        lineStyle: { color, width: 2 },
        itemStyle: { color },
        areaStyle: gradient ? { color: makeGradient(color, 0.35) } : { color, opacity: 0.6 },
        emphasis: {
          focus: 'series' as const,
          itemStyle: { borderWidth: 2 },
        },
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
              ? `Area chart: ${escapeHtml(title)}`
              : 'Area chart',
        },
        ...(decalEnabled ? { decal: { show: true, decals: decalPatterns } } : {}),
      },
    } as EChartsOption;
  }, [
    seriesData,
    labels,
    stacked,
    showDots,
    showGrid,
    showLegend,
    gradient,
    curved,
    valueFormatter,
    animate,
    title,
    description,
    isEmpty,
    decalEnabled,
    decalPatterns,
    densityFontMultiplier,
    densitySpacingMultiplier,
    densityPaddingMultiplier,
    effectivePalette,
  ]);

  const { containerRef, instance } = useEChartsRenderer({
    option: option ?? ({} as EChartsOption),
    theme: themeObject,
    respectReducedMotion: true,
  });

  // Faz 21.5-B PR-B2: default-on a11y (same series→flat mapping as
  // LineChart — primary trend's value at each x-axis label).
  const a11yData = useMemo(
    () =>
      labels.map((label, i) => ({
        label,
        value: safeSeries[0]?.data[i] ?? 0,
      })),
    [labels, safeSeries],
  );
  const a11y = useChartA11y({
    chartType: 'area',
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
        data-testid="area-chart-empty"
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
      testId="area-chart"
      setRefs={setRefs}
      {...rest}
    />
  );
});

AreaChartInner.displayName = 'AreaChartInner';

/**
 * AreaChart — public wrapper. Accepts `access` + `accessReason`
 * (`AccessControlledProps`) and forwards everything else to
 * `AreaChartInner`. Faz 21.4 PR-E2 wiring; default `access === undefined`
 * follows the identity-transform path through `ChartAccessGate`.
 */
export const AreaChart = React.forwardRef<HTMLDivElement, AreaChartProps>(function AreaChart(
  { access, accessReason, ...rest },
  ref,
) {
  return (
    <ChartAccessGate access={access} accessReason={accessReason}>
      <AreaChartInner ref={ref} {...rest} />
    </ChartAccessGate>
  );
});
AreaChart.displayName = 'AreaChart';

export default AreaChart;
