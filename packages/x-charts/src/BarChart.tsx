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

export type ChartClickEvent = {
  datum: Record<string, unknown>;
  value?: number;
  label?: string;
};

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
  /** Callback fired when a data point (bar) is clicked. */
  onDataPointClick?: (event: ChartClickEvent) => void;
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
    onDataPointClick,
    theme: themePreference = 'auto',
    decal: decalPreference = 'auto',
    density: densityPreference = 'auto',
    accent: accentPreference = 'auto',
    ...rest
  },
  forwardedRef,
) {
  const height = SIZE_HEIGHT[size];
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

  const option = useMemo((): EChartsOption | null => {
    if (isEmpty) return null;

    // Codex iter-13 fallback chain: explicit `colors` prop > effectivePalette
    // (accent or HC/Print theme builder) > inline DEFAULT_PALETTE.
    const palette = colors ?? effectivePalette ?? DEFAULT_PALETTE;

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

    const echartsSeriesList = hasMultiSeries
      ? seriesDef!.map((s, i) => ({
          type: 'bar' as const,
          name: s.name,
          data: safeData.map((d) => ((d as Record<string, unknown>)[s.field] as number) ?? 0),
          itemStyle: { color: s.color ?? palette[i % palette.length] },
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
            data: safeData.map((d, i) => ({
              value: d.value,
              itemStyle: { color: d.color ?? palette[i % palette.length] },
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
      series: echartsSeriesList,
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
  ]);

  const handleClick = useCallback(
    (params: unknown) => {
      if (!onDataPointClick) return;
      const p = params as { data: unknown; name: string; value: number; dataIndex: number };
      const raw =
        typeof p.data === 'object' && p.data !== null ? (p.data as Record<string, unknown>) : {};
      onDataPointClick({
        datum: { ...raw, label: p.name, value: p.value },
        value: typeof p.value === 'number' ? p.value : (raw.value as number),
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
  { access, accessReason, onDataPointClick, ...rest },
  ref,
) {
  const { state } = resolveAccessState(access);
  return (
    <ChartAccessGate access={access} accessReason={accessReason}>
      <BarChartInner
        ref={ref}
        {...rest}
        onDataPointClick={guardChartCallback(state, onDataPointClick)}
      />
    </ChartAccessGate>
  );
});
BarChart.displayName = 'BarChart';

export default BarChart;
