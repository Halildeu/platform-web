/**
 * GaugeChart -- ECharts-powered gauge with threshold zones
 *
 * Supports configurable thresholds, pointer styling, progress arcs,
 * and custom value formatting. Uses the centralized useEChartsRenderer
 * hook for lifecycle management.
 *
 * @migration SVG -> ECharts (P3)
 */
import React, { useMemo, useCallback } from 'react';
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
import { scaleFontSize } from './theme/density-helpers';
import { formatCompact } from './utils/formatters';
import { sanitizeNumber } from './utils/data-validation';
import type { EChartsOption } from './renderers/echarts-imports';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ChartSize = 'sm' | 'md' | 'lg';

export type GaugeThreshold = {
  /** Threshold boundary value. */
  value: number;
  /** Color for the zone up to this value. */
  color: string;
  /** Optional label for the zone. */
  label?: string;
};

export interface GaugeChartProps {
  /** Current gauge value. */
  value: number;
  /** Minimum scale value. @default 0 */
  min?: number;
  /** Maximum scale value. @default 100 */
  max?: number;
  /** Title displayed above the gauge. */
  title?: string;
  /** Visual size variant. @default "md" */
  size?: ChartSize;
  /** Threshold zones for colored arc segments. */
  thresholds?: GaugeThreshold[];
  /** Start angle in degrees. @default 225 */
  startAngle?: number;
  /** End angle in degrees. @default -45 */
  endAngle?: number;
  /** Show a progress arc from min to current value. @default false */
  showProgress?: boolean;
  /** Pointer configuration. */
  pointer?: {
    length?: string;
    width?: number;
    color?: string;
  };
  /** Number of segments on the axis. @default 10 */
  splitNumber?: number;
  /** Show numeric axis labels. @default true */
  showAxisLabel?: boolean;
  /** Custom formatter for the center value display. */
  valueFormatter?: (v: number) => string;
  /** Animate on mount and value changes. @default true */
  animate?: boolean;
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
  /** Density override. @default "auto" */
  density?: ChartDensityPreference;
  /**
   * Accent palette override.
   * @default "auto"
   * @remarks GaugeChart's `thresholds` defaults are SEMANTIC (success/warning/danger)
   *   and NOT changed by accent. The accent prop is accepted for API consistency
   *   across all 13 charts but does not affect gauge color rendering.
   *   To change threshold colors, override the `thresholds` prop directly.
   */
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
 * Normalize threshold values into ECharts axisLine color stops (0-1 range).
 * Each entry is [normalizedPosition, color].
 */
function buildAxisLineColors(
  thresholds: GaugeThreshold[],
  min: number,
  max: number,
): [number, string][] {
  const range = max - min;
  if (range <= 0) return [[1, DEFAULT_PALETTE[0]]];

  const sorted = [...thresholds].sort((a, b) => a.value - b.value);
  return sorted.map((t) => [Math.min(Math.max((t.value - min) / range, 0), 1), t.color]);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const GaugeChart = React.forwardRef<HTMLDivElement, GaugeChartProps>(function GaugeChart(
  {
    value,
    min = 0,
    max = 100,
    title,
    size = 'md',
    thresholds,
    startAngle = 225,
    endAngle = -45,
    showProgress = false,
    pointer,
    splitNumber = 10,
    showAxisLabel = true,
    valueFormatter,
    animate = true,
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
  const isEmpty = value == null;
  const safeValue = sanitizeNumber(value);
  const fmt = valueFormatter ?? formatCompact;

  // GaugeChart accent-IMMUNE — accent prop accepted for API consistency
  // but theme builder defaults (semantic success/warning/danger thresholds)
  // are intentionally preserved. effectivePalette ignored.
  const { themeObject, decalEnabled, decalPatterns, densityFontMultiplier } = useChartTheme({
    theme: themePreference,
    decal: decalPreference,
    density: densityPreference,
    accent: accentPreference,
  });

  const option = useMemo((): EChartsOption | null => {
    if (isEmpty) return null;

    const axisLineColors = thresholds?.length
      ? buildAxisLineColors(thresholds, min, max)
      : ([
          [0.6, '#22c55e'],
          [0.8, '#f59e0b'],
          [1, '#ef4444'],
        ] as [number, string][]);

    return {
      animation: animate,
      animationDuration: animate ? 500 : 0,
      animationEasing: 'cubicOut',
      series: [
        {
          type: 'gauge' as const,
          min,
          max,
          startAngle,
          endAngle,
          splitNumber,
          data: [{ value: safeValue, name: title ?? '' }],
          progress: {
            show: showProgress,
            width: 12,
          },
          axisLine: {
            lineStyle: {
              width: 16,
              color: axisLineColors,
            },
          },
          pointer: {
            length: pointer?.length ?? '60%',
            width: pointer?.width ?? 5,
            itemStyle: pointer?.color ? { color: pointer.color } : undefined,
          },
          axisTick: {
            show: true,
            distance: -20,
            length: 6,
            lineStyle: { color: '#999', width: 1 },
          },
          splitLine: {
            show: true,
            distance: -24,
            length: 12,
            lineStyle: { color: '#999', width: 2 },
          },
          axisLabel: {
            show: showAxisLabel,
            distance: 30,
            fontSize: scaleFontSize(11, densityFontMultiplier),
            formatter: (v: number) => escapeHtml(fmt(v)),
          },
          detail: {
            valueAnimation: animate,
            formatter: (v: number) => escapeHtml(fmt(v)),
            // height-relative fontSize already adapts; multiply by density factor
            fontSize: scaleFontSize(Math.round(height * 0.08), densityFontMultiplier),
            fontWeight: 600,
            offsetCenter: [0, '40%'],
            color: 'inherit',
          },
          title: title
            ? {
                show: true,
                offsetCenter: [0, '60%'],
                fontSize: scaleFontSize(13, densityFontMultiplier),
                color: 'var(--text-secondary, #666)',
              }
            : { show: false },
        },
      ],
      aria: {
        enabled: true,
        label: {
          description: title ? `Gauge chart: ${escapeHtml(title)}` : 'Gauge chart',
        },
        ...(decalEnabled ? { decal: { show: true, decals: decalPatterns } } : {}),
      },
    } as EChartsOption;
  }, [
    value,
    min,
    max,
    title,
    thresholds,
    startAngle,
    endAngle,
    showProgress,
    pointer,
    splitNumber,
    showAxisLabel,
    fmt,
    animate,
    height,
    isEmpty,
    decalEnabled,
    decalPatterns,
    densityFontMultiplier,
  ]);

  const { containerRef, instance } = useEChartsRenderer({
    option: option ?? ({} as EChartsOption),
    theme: themeObject,
    respectReducedMotion: true,
  });

  // Faz 21.5-B PR-B2: default-on a11y. Gauge has a single value
  // (no series) → emit one virtual data point for the SR data table.
  const a11yData = useMemo(
    () => (isEmpty ? [] : [{ label: title ?? 'Value', value: safeValue }]),
    [isEmpty, title, safeValue],
  );
  const a11y = useChartA11y({
    chartType: 'gauge',
    data: a11yData,
    title,
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
        data-testid="gauge-chart-empty"
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
      testId="gauge-chart"
      setRefs={setRefs}
      {...rest}
    />
  );
});

GaugeChart.displayName = 'GaugeChart';

export default GaugeChart;
