'use client';

/**
 * BoxPlotChart — ECharts-powered statistical box-and-whisker chart.
 *
 * Renders a five-number summary (min, Q1, median, Q3, max) per category
 * with optional outlier scatter overlay. Accepts EITHER raw value arrays
 * (the wrapper computes quartiles via ECharts' built-in `boxplot`
 * transform) OR pre-computed quartile tuples (for callers that already
 * aggregated server-side).
 *
 * @migration ECharts boxplot series — first wrapper of the PR-X new-chart
 * family (Codex thread 019e1e30 plan, PR-X6).
 */
import React, { useMemo, useCallback, useRef } from 'react';
import type { AccessControlledProps } from '@mfe/shared-types';
import { resolveAccessState } from '@mfe/shared-types';
import { ChartAccessGate } from './access/ChartAccessGate';
import { guardChartCallback } from './access/guardChartCallback';
import { cn } from './utils/cn';
import { useEChartsRenderer } from './renderers';
import { useResponsiveBreakpoint } from './useResponsiveChart';
import { buildResponsiveLegend, buildResponsiveGrid, buildResponsiveAxisLabel } from './responsive';
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
 * Box-plot data point. EITHER provide `values` (raw array — the wrapper
 * computes Q1/median/Q3/min/max via ECharts' transform) OR provide a
 * `quartiles` tuple `[min, Q1, median, Q3, max]` (skip the transform).
 *
 * Mixing raw and pre-computed entries in the same `data` array is NOT
 * supported — the wrapper picks one path based on the first entry.
 */
export type BoxPlotDataPoint =
  | { category: string; values: number[]; quartiles?: undefined }
  | {
      category: string;
      values?: undefined;
      quartiles: [min: number, q1: number, median: number, q3: number, max: number];
      outliers?: number[];
    };

// Cross-filter compatibility — re-export the canonical click event so
// the cross-filter wrapper stays uniform across all chart adapters.
export type { ChartClickEvent } from './types';
import type { ChartClickEvent as ChartClickEventCanonical } from './types';
type ChartClickEvent = ChartClickEventCanonical;

// Markup overlay — NO-OP on BoxPlot for v1 (matches Pie/Gauge/Radar
// pattern). Future PR can wire markLine for threshold bands.
export type { ChartMarkup, ChartMarkupClickEvent } from './types';
import type { ChartMarkup, ChartMarkupClickEvent } from './types';
import { useMarkupAdapter } from './annotations/useMarkupAdapter';

export interface BoxPlotChartProps extends AccessControlledProps {
  /** Box-plot data points. */
  data: BoxPlotDataPoint[];
  /** Visual size variant. @default "md" */
  size?: ChartSize;
  /** Bar orientation. @default "vertical" */
  orientation?: 'vertical' | 'horizontal';
  /** Show grid lines. @default true */
  showGrid?: boolean;
  /** Show legend below the chart. @default false */
  showLegend?: boolean;
  /** Show outlier scatter overlay. @default true */
  showOutliers?: boolean;
  /**
   * Box width as a percentage of category width (e.g. `'30%'`). Pass-
   * through to ECharts `series.boxWidth`.
   *
   * @default ['7%', '50%']
   */
  boxWidth?: [string | number, string | number];
  /** Custom value formatter for axis labels + tooltip. */
  valueFormatter?: (value: number) => string;
  /** Animate box draw on mount. @default true */
  animate?: boolean;
  /** Override default chart colors (box stroke, outlier dots). */
  colors?: { box?: string; outlier?: string };
  /** Chart title. */
  title?: string;
  /** Accessible description. */
  description?: string;
  /** Additional class name. */
  className?: string;
  /** Callback fired when a box (category) is clicked. */
  onDataPointClick?: (event: ChartClickEvent) => void;
  /** Visual overlay markups — NO-OP on v1, forwarded to dev warning. */
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

/**
 * Compute the five-number summary `[min, Q1, median, Q3, max]` from a
 * raw value array. We use the standard "exclusive" quartile method so
 * results match ECharts' own `boxplot` transform (R-7 / linear
 * interpolation).
 */
function computeQuartiles(raw: number[]): [number, number, number, number, number] | null {
  if (!raw || raw.length === 0) return null;
  const sorted = [...raw].filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;

  const quantile = (q: number): number => {
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    const next = sorted[base + 1];
    if (next === undefined) return sorted[base] ?? 0;
    return (sorted[base] ?? 0) + rest * (next - (sorted[base] ?? 0));
  };

  return [
    sorted[0] ?? 0,
    quantile(0.25),
    quantile(0.5),
    quantile(0.75),
    sorted[sorted.length - 1] ?? 0,
  ];
}

/**
 * Compute outliers using the 1.5 × IQR rule (Tukey fence). Returns
 * raw values that fall outside `[Q1 - 1.5*IQR, Q3 + 1.5*IQR]`.
 */
function computeOutliers(raw: number[], q1: number, q3: number): number[] {
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;
  return raw.filter((v) => v < lower || v > upper);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const BoxPlotChartInner = React.forwardRef<
  HTMLDivElement,
  Omit<BoxPlotChartProps, 'access' | 'accessReason'>
>(function BoxPlotChartInner(
  {
    data,
    size = 'md',
    orientation = 'vertical',
    showGrid = true,
    showLegend = false,
    showOutliers = true,
    boxWidth,
    valueFormatter,
    animate = true,
    colors,
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
  const isHorizontal = orientation === 'horizontal';
  const fmt = valueFormatter ?? formatCompact;

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
  // (NO-OP on BoxPlot v1; future PR may wire markLine for thresholds).
  useMarkupAdapter(markups, {
    chartType: 'bar', // closest cartesian analog for adapter type-routing
    orientation,
    dataContext: { labels: data.map((d) => d.category), series: [{ data: [] }] },
  });

  const option = useMemo((): EChartsOption | null => {
    if (isEmpty) return null;

    const palette = effectivePalette ?? ['#3b82f6'];
    const boxColor = colors?.box ?? palette[0] ?? '#3b82f6';
    const outlierColor = colors?.outlier ?? 'var(--state-warning-text, #f59e0b)';

    // Two paths: raw values → compute quartiles ourselves; quartiles
    // already supplied → pass through. Selected per-entry; mixing modes
    // in the same data array is supported.
    const boxData: Array<[number, number, number, number, number]> = [];
    const outlierData: Array<[number, number]> = [];
    const categories: string[] = [];

    data.forEach((entry, i) => {
      categories.push(entry.category);
      if (entry.values) {
        const q = computeQuartiles(entry.values);
        if (q) {
          boxData.push(q);
          if (showOutliers) {
            const outliers = computeOutliers(entry.values, q[1], q[3]);
            outliers.forEach((v) => {
              outlierData.push(isHorizontal ? [v, i] : [i, v]);
            });
          }
        } else {
          boxData.push([0, 0, 0, 0, 0]);
        }
      } else if (entry.quartiles) {
        boxData.push(entry.quartiles);
        if (showOutliers && entry.outliers) {
          entry.outliers.forEach((v) => {
            outlierData.push(isHorizontal ? [v, i] : [i, v]);
          });
        }
      }
    });

    const responsiveAxisLabel = buildResponsiveAxisLabel({
      breakpoint,
      labelCount: categories.length,
      isHorizontal,
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

    const categoryAxis = {
      type: 'category' as const,
      data: categories,
      boundaryGap: true,
      axisLabel: responsiveAxisLabel,
    };
    const valueAxis = {
      type: 'value' as const,
      axisLabel: { formatter: (v: number) => fmt(v) },
      splitLine: { show: showGrid },
    };

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
        trigger: 'item',
        confine: true,
        formatter: (p: { dataIndex: number; data: number[] | (number | undefined)[] }) => {
          // ECharts boxplot tooltip — show the 5-number summary.
          const d = p.data;
          if (!Array.isArray(d) || d.length < 5) return '';
          // ECharts inserts the category index/name as d[0] when using a
          // category axis with array data; the actual quartile tuple
          // lives in d[1..5]. Detect by length.
          const startIdx = d.length === 6 ? 1 : 0;
          const cat = categories[p.dataIndex] ?? '';
          const fmtVal = (v: number | undefined) => (v != null ? fmt(v) : '–');
          return [
            `<b>${escapeHtml(cat)}</b>`,
            `Min: ${fmtVal(d[startIdx])}`,
            `Q1: ${fmtVal(d[startIdx + 1])}`,
            `Median: ${fmtVal(d[startIdx + 2])}`,
            `Q3: ${fmtVal(d[startIdx + 3])}`,
            `Max: ${fmtVal(d[startIdx + 4])}`,
          ].join('<br/>');
        },
      },
      legend: responsiveLegend,
      grid: responsiveGrid,
      xAxis: isHorizontal ? valueAxis : categoryAxis,
      yAxis: isHorizontal ? categoryAxis : valueAxis,
      series: [
        {
          type: 'boxplot' as const,
          name: title ?? 'Distribution',
          data: boxData,
          ...(boxWidth ? { boxWidth } : {}),
          itemStyle: { color: boxColor, borderColor: boxColor },
          cursor: onDataPointClick ? 'pointer' : 'default',
        },
        ...(showOutliers && outlierData.length > 0
          ? [
              {
                type: 'scatter' as const,
                name: 'Outliers',
                data: outlierData,
                itemStyle: { color: outlierColor },
                symbolSize: 6,
              },
            ]
          : []),
      ],
      aria: {
        enabled: true,
        label: {
          description: description
            ? escapeHtml(description)
            : title
              ? `Box plot: ${escapeHtml(title)}`
              : 'Box plot',
        },
        ...(decalEnabled ? { decal: { show: true, decals: decalPatterns } } : {}),
      },
    } as EChartsOption;
  }, [
    data,
    isEmpty,
    isHorizontal,
    showGrid,
    showLegend,
    showOutliers,
    boxWidth,
    animate,
    colors,
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
      const median =
        entry?.quartiles?.[2] ??
        (entry?.values ? computeQuartiles(entry.values)?.[2] : undefined) ??
        0;
      onDataPointClick({
        seriesName: title ?? 'Distribution',
        seriesIndex: 0,
        dataIndex: idx,
        label: entry?.category ?? p.name ?? '',
        value: median,
        datum: { category: entry?.category, median },
      });
    },
    [data, onDataPointClick, title],
  );

  const a11yState = useChartA11y({
    chartType: 'boxplot',
    title,
    description,
    data: data.map((d) => ({
      label: d.category,
      value: d.values ? (computeQuartiles(d.values)?.[2] ?? 0) : (d.quartiles?.[2] ?? 0),
    })),
    valueFormatter: fmt,
    anomalySummary,
    formatAnomalyAnnouncement,
  });

  const { containerRef, instance: _instance } = useEChartsRenderer({
    option: option ?? ({} as EChartsOption),
    respectReducedMotion: true,
    onClick: guardChartCallback(handleClick, true),
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
      className={cn('mfe-boxplot-chart-shell', className)}
      height={height}
      testId="boxplot-chart"
      setRefs={setRefs}
      anomalySummary={anomalySummary}
      formatAnomalyAnnouncement={formatAnomalyAnnouncement}
      {...rest}
    />
  );
});

BoxPlotChartInner.displayName = 'BoxPlotChartInner';

/**
 * BoxPlotChart — public wrapper. Adds the standard `access` /
 * `accessReason` gate without touching hook order.
 */
export const BoxPlotChart = React.forwardRef<HTMLDivElement, BoxPlotChartProps>(
  function BoxPlotChart({ access, accessReason, ...rest }, ref) {
    const accessState = resolveAccessState(access);
    return (
      <ChartAccessGate accessState={accessState} accessReason={accessReason}>
        <BoxPlotChartInner ref={ref} {...rest} />
      </ChartAccessGate>
    );
  },
);
BoxPlotChart.displayName = 'BoxPlotChart';
