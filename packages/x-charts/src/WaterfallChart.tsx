'use client';

/**
 * WaterfallChart -- ECharts-powered waterfall chart
 *
 * Implements the waterfall pattern using stacked bars: an invisible "base"
 * series holds the running total offset, and a visible "value" series
 * renders each segment colored by type (increase / decrease / total).
 *
 * Uses the centralized useEChartsRenderer hook for lifecycle management.
 *
 * @migration AG Charts -> ECharts (P3)
 */
import React, { useMemo, useCallback, useRef } from 'react';
import type { AccessControlledProps } from '@mfe/shared-types';
import { resolveAccessState } from '@mfe/shared-types';
import { ChartAccessGate } from './access/ChartAccessGate';
import { guardChartCallback } from './access/guardChartCallback';
import { cn } from './utils/cn';
import { useEChartsRenderer } from './renderers';
import { useResponsiveBreakpoint } from './useResponsiveChart';
import {
  buildResponsiveAxisLabel,
  buildResponsiveLegend,
  buildResponsiveGrid,
  buildResponsiveDataZoom,
} from './responsive';
import { ChartA11yShell, useChartA11y } from './a11y';
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
import { sanitizeDataPoints } from './utils/data-validation';
import type { EChartsOption } from './renderers/echarts-imports';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type WaterfallItemType = 'increase' | 'decrease' | 'total';

export interface WaterfallDataPoint {
  /** Category label displayed on the axis. */
  label: string;
  /** Numeric value. Positive = increase, negative = decrease. */
  value: number;
  /** Explicit type override. Auto-detected when omitted. */
  type?: WaterfallItemType;
}

export interface WaterfallChartProps extends AccessControlledProps {
  /** Data points to render as waterfall bars. */
  data: WaterfallDataPoint[];
  /** Visual size variant. @default "md" */
  size?: 'sm' | 'md' | 'lg';
  /** Chart title. */
  title?: string;
  /** Colors per waterfall segment type. */
  colors?: {
    increase?: string;
    decrease?: string;
    total?: string;
  };
  /** Draw dashed connector lines between adjacent bars. @default true */
  showConnector?: boolean;
  /** Show value labels on bars. @default true */
  showValues?: boolean;
  /** Custom value formatter for labels and tooltip. */
  valueFormatter?: (v: number) => string;
  /** Bar orientation. @default "vertical" */
  orientation?: 'vertical' | 'horizontal';
  /** Show legend below the chart. @default false */
  showLegend?: boolean;
  /** Animate bars on mount. @default true */
  animate?: boolean;
  /** Callback fired when a bar is clicked. */
  onDataPointClick?: (params: unknown) => void;
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
   * Density override.
   * @default "auto"
   */
  density?: ChartDensityPreference;
  /**
   * Accent palette override.
   * @default "auto"
   * @remarks Codex iter-13: WaterfallChart `increase` (success) and `decrease`
   *   (danger) colors are SEMANTIC and NOT changed by accent. Only the `total`
   *   color binds to accent[0] (primary tint) when not overridden via `colors.total`.
   */
  accent?: ChartAccentPreference;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_COLORS = {
  increase: '#22c55e',
  decrease: '#ef4444',
  total: '#3b82f6',
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const escapeHtml = (t: string): string =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Resolve explicit or auto-detected type for each data point.
 * Last item defaults to "total"; positive values default to "increase";
 * negative values default to "decrease".
 */
function resolveType(item: WaterfallDataPoint, index: number, total: number): WaterfallItemType {
  if (item.type) return item.type;
  if (index === total - 1) return 'total';
  return item.value >= 0 ? 'increase' : 'decrease';
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * WaterfallChart inner — original hook-bearing body. The outer `WaterfallChart`
 * wrapper below adds the `access` / `accessReason` gate without touching
 * hook order (Faz 21.4 PR-E2). Accepting `Omit<WaterfallChartProps, 'access' |
 * 'accessReason'>` keeps the inner contract honest: access is resolved
 * exactly once, in the outer wrapper, never re-read inside the hooks.
 */
const WaterfallChartInner = React.forwardRef<
  HTMLDivElement,
  Omit<WaterfallChartProps, 'access' | 'accessReason'>
>(function WaterfallChartInner(
  {
    data,
    size = 'md',
    title,
    colors: colorsProp,
    showConnector = true,
    showValues = true,
    valueFormatter,
    orientation = 'vertical',
    showLegend = false,
    animate = true,
    onDataPointClick,
    className,
    theme: themePreference = 'auto',
    decal: decalPreference = 'auto',
    density: densityPreference = 'auto',
    accent: accentPreference = 'auto',
    ...rest
  },
  forwardedRef,
) {
  const height = CHART_CANVAS_HEIGHT[size];
  const isEmpty = !data || data.length === 0;
  const isHorizontal = orientation === 'horizontal';
  const safeData = useMemo(
    () => sanitizeDataPoints(data as never) as unknown as WaterfallDataPoint[],
    [data],
  );
  const fmt = valueFormatter ?? formatCompact;

  // Faz 21.9 PR3c: same DOM node feeds breakpoint observer + ECharts renderer.
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

  // Codex iter-13 semantic preservation: increase/decrease are SEMANTIC
  // (success/danger) — never replaced by accent. Only `total` binds to
  // accent primary (effectivePalette[0]) when no explicit override.
  const accentPrimary = effectivePalette?.[0] ?? DEFAULT_COLORS.total;
  const palette = useMemo(
    () => ({
      increase: colorsProp?.increase ?? DEFAULT_COLORS.increase,
      decrease: colorsProp?.decrease ?? DEFAULT_COLORS.decrease,
      total: colorsProp?.total ?? accentPrimary,
    }),
    [colorsProp, accentPrimary],
  );

  const option = useMemo((): EChartsOption | null => {
    if (isEmpty) return null;

    const len = safeData.length;
    const types = safeData.map((d, i) => resolveType(d, i, len));

    /* -- Running total & base offset calculation -- */
    const baseValues: number[] = [];
    const displayValues: number[] = [];
    let runningTotal = 0;

    for (let i = 0; i < len; i++) {
      const t = types[i];
      if (t === 'total') {
        baseValues.push(0);
        displayValues.push(runningTotal);
      } else {
        const val = safeData[i].value;
        if (val >= 0) {
          baseValues.push(runningTotal);
          displayValues.push(val);
          runningTotal += val;
        } else {
          runningTotal += val;
          baseValues.push(runningTotal);
          displayValues.push(Math.abs(val));
        }
      }
    }

    const labels = safeData.map((d) => d.label);
    const barColors = types.map((t) => palette[t]);

    /* -- Connector markLines between adjacent bars -- */
    const markLineData: Array<Record<string, unknown>[]> = [];
    if (showConnector) {
      for (let i = 0; i < len - 1; i++) {
        const topValue = baseValues[i] + displayValues[i];
        const coord = isHorizontal
          ? [
              { yAxis: i, xAxis: topValue },
              { yAxis: i + 1, xAxis: topValue },
            ]
          : [
              { xAxis: i, yAxis: topValue },
              { xAxis: i + 1, yAxis: topValue },
            ];
        markLineData.push(coord as Array<Record<string, unknown>>);
      }
    }

    const responsiveAxisLabel = buildResponsiveAxisLabel({
      breakpoint,
      labelCount: labels.length,
      densityFontMultiplier,
      baseFontSize: 11,
    });

    const categoryAxis = {
      type: 'category' as const,
      data: labels,
      axisLabel: responsiveAxisLabel,
      axisTick: { alignWithLabel: true },
    };

    const valueAxis = {
      type: 'value' as const,
      axisLabel: {
        fontSize: responsiveAxisLabel.fontSize,
        hideOverlap: true,
        formatter: (v: number) => fmt(v),
      },
      splitLine: { show: true, lineStyle: { type: 'dashed' as const } },
    };

    const responsiveLegend = buildResponsiveLegend({
      breakpoint,
      showLegend,
      hasMultiSeries: false,
      seriesCount: 1,
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
        titleTop: scalePadding(48, densityPaddingMultiplier),
        contentTop: scalePadding(24, densityPaddingMultiplier),
        sidePadding: scalePadding(16, densityPaddingMultiplier),
        legendBottom: scalePadding(48, densityPaddingMultiplier),
        plainBottom: scalePadding(24, densityPaddingMultiplier),
      },
    });

    const dataZoom = buildResponsiveDataZoom({
      breakpoint,
      labelCount: labels.length,
      horizontal: isHorizontal,
    });

    /* -- Invisible base series (stacked underneath) -- */
    const baseSeries = {
      type: 'bar' as const,
      name: '__waterfall_base__',
      stack: 'waterfall',
      data: baseValues,
      itemStyle: { color: 'transparent' },
      emphasis: { itemStyle: { color: 'transparent' } },
      tooltip: { show: false },
      cursor: 'default' as const,
    };

    /* -- Visible value series -- */
    // Capture final running total for "total" type label display
    const finalRunningTotal = runningTotal;
    const valueSeries = {
      type: 'bar' as const,
      name: title ?? 'Value',
      stack: 'waterfall',
      data: displayValues.map((v, i) => ({
        value: v,
        itemStyle: { color: barColors[i] },
      })),
      label: showValues
        ? {
            show: true,
            position: isHorizontal ? ('right' as const) : ('top' as const),
            formatter: (p: { dataIndex: number }) => {
              const t = types[p.dataIndex];
              const originalVal = safeData[p.dataIndex].value;
              if (t === 'total') return fmt(finalRunningTotal);
              return fmt(originalVal);
            },
            fontSize: scaleFontSize(11, densityFontMultiplier),
          }
        : { show: false },
      markLine:
        showConnector && markLineData.length > 0
          ? {
              symbol: 'none',
              lineStyle: { color: '#94a3b8', type: 'dashed' as const, width: 1 },
              data: markLineData,
              label: { show: false },
              silent: true,
            }
          : undefined,
      cursor: onDataPointClick ? 'pointer' : ('default' as const),
    };

    return {
      animation: animate,
      animationDuration: animate ? 500 : 0,
      animationEasing: 'cubicOut',
      title: title
        ? {
            text: escapeHtml(title),
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
        axisPointer: { type: 'shadow' },
        formatter: (params: unknown) => {
          const list = Array.isArray(params) ? params : [params];
          const visible = list.find(
            (p: Record<string, unknown>) =>
              (p as { seriesName: string }).seriesName !== '__waterfall_base__',
          ) as { dataIndex: number; name: string } | undefined;
          if (!visible) return '';
          const idx = visible.dataIndex;
          const t = types[idx];
          const originalVal = safeData[idx].value;
          const prefix = t === 'total' ? 'Total: ' : t === 'increase' ? '+' : '';
          const displayVal = t === 'total' ? finalRunningTotal : originalVal;
          return `<b>${escapeHtml(visible.name)}</b><br/>${prefix}${fmt(displayVal)}`;
        },
      },
      legend: { ...responsiveLegend, data: [title ?? 'Value'] },
      grid: responsiveGrid,
      ...(dataZoom ? { dataZoom } : {}),
      xAxis: isHorizontal ? valueAxis : categoryAxis,
      yAxis: isHorizontal ? categoryAxis : valueAxis,
      series: [baseSeries, valueSeries],
      aria: {
        enabled: true,
        label: {
          description: title ? `Waterfall chart: ${escapeHtml(title)}` : 'Waterfall chart',
        },
        ...(decalEnabled ? { decal: { show: true, decals: decalPatterns } } : {}),
      },
    } as EChartsOption;
  }, [
    safeData,
    size,
    title,
    palette,
    showConnector,
    showValues,
    fmt,
    orientation,
    showLegend,
    animate,
    onDataPointClick,
    isEmpty,
    isHorizontal,
    decalEnabled,
    decalPatterns,
    densityFontMultiplier,
    densitySpacingMultiplier,
    densityPaddingMultiplier,
    breakpoint,
  ]);

  const handleClick = useCallback(
    (params: unknown) => {
      if (!onDataPointClick) return;
      const p = params as { seriesName: string };
      if (p.seriesName === '__waterfall_base__') return;
      onDataPointClick(params);
    },
    [onDataPointClick],
  );

  const { containerRef, instance } = useEChartsRenderer({
    option: option ?? ({} as EChartsOption),
    theme: themeObject,
    respectReducedMotion: true,
    onClick: onDataPointClick ? handleClick : undefined,
  });

  // Faz 21.5-B PR-B2: default-on a11y. WaterfallChart's data is
  // already {label, value} (with a `type` field for visual semantics
  // we don't surface to SR); direct flat map.
  const a11yData = useMemo(
    () => safeData.map((d) => ({ label: d.label, value: d.value })),
    [safeData],
  );
  const a11y = useChartA11y({
    chartType: 'waterfall',
    data: a11yData,
    title,
    valueFormatter: fmt,
    echartsInstance: instance,
  });

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
        data-testid="waterfall-chart-empty"
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
      testId="waterfall-chart"
      setRefs={setRefs}
      {...rest}
    />
  );
});

WaterfallChartInner.displayName = 'WaterfallChartInner';

/**
 * WaterfallChart — public wrapper. Accepts `access` + `accessReason`
 * (`AccessControlledProps`) and forwards everything else to
 * `WaterfallChartInner`. Faz 21.4 PR-E2 wiring; default `access === undefined`
 * follows the identity-transform path through `ChartAccessGate`.
 */
export const WaterfallChart = React.forwardRef<HTMLDivElement, WaterfallChartProps>(
  function WaterfallChart({ access, accessReason, onDataPointClick, ...rest }, ref) {
    const { state } = resolveAccessState(access);
    return (
      <ChartAccessGate access={access} accessReason={accessReason}>
        <WaterfallChartInner
          ref={ref}
          {...rest}
          onDataPointClick={guardChartCallback(state, onDataPointClick)}
        />
      </ChartAccessGate>
    );
  },
);
WaterfallChart.displayName = 'WaterfallChart';

export default WaterfallChart;
