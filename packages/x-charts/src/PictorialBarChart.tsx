'use client';

/**
 * PictorialBarChart — ECharts pictorialBar wrapper for infographic-style
 * bar charts where each bar is rendered as a tiled symbol (icon) instead
 * of a flat rectangle. Common use cases: HR pictograms (one icon = N
 * employees), volume comparisons with branded icons, environmental
 * stats (one tree icon = N hectares), etc.
 *
 * @migration ECharts pictorialBar series — PR-X10 of the @mfe/x-charts
 * native-feature parity campaign (Codex thread 019e1e30).
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

/** Pictogram data point — `value` is the bar height (count of icons). */
export type PictorialBarDataPoint = {
  label: string;
  value: number;
  /** Optional per-bar color override. */
  color?: string;
  /** Optional per-bar symbol override (e.g. `'image://icon-url'`). */
  symbol?: string;
};

// Cross-filter compatibility — re-export the canonical click event.
export type { ChartClickEvent } from './types';
import type { ChartClickEvent as ChartClickEventCanonical } from './types';
type ChartClickEvent = ChartClickEventCanonical;

// Markup overlay — NO-OP on PictorialBar v1.
export type { ChartMarkup, ChartMarkupClickEvent } from './types';
import type { ChartMarkup, ChartMarkupClickEvent } from './types';
import { useMarkupAdapter } from './annotations/useMarkupAdapter';

export interface PictorialBarChartProps extends AccessControlledProps {
  /** Pictogram data points. */
  data: PictorialBarDataPoint[];
  /**
   * Default symbol for every bar — overridden per-point by
   * `data[i].symbol`. Accepts ECharts symbol strings (`'circle'`,
   * `'rect'`, `'roundRect'`, `'triangle'`, `'diamond'`, `'pin'`,
   * `'arrow'`, `'image://...'`, `'path://...'`).
   *
   * @default 'circle'
   */
  symbol?: string;
  /**
   * Whether each bar is repeated (`'fixed'`: single big symbol stretched;
   * `true`: tiled symbols filling the bar; numeric: explicit repeat count).
   * Maps to ECharts `series.symbolRepeat`.
   *
   * @default true (tiled)
   */
  symbolRepeat?: boolean | 'fixed' | number;
  /**
   * Symbol size. A scalar applies the same width+height in pixels; a
   * tuple `[w, h]` sets each axis independently. Accepts strings like
   * `'80%'` to size relative to the bar.
   *
   * @default 'auto'
   */
  symbolSize?: number | string | [number | string, number | string];
  /** Visual size variant. @default "md" */
  size?: ChartSize;
  /** Bar orientation. @default "vertical" */
  orientation?: 'vertical' | 'horizontal';
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
  /** Callback fired when a bar is clicked. */
  onDataPointClick?: (event: ChartClickEvent) => void;
  /** Visual overlay markups — NO-OP on v1. */
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

const escapeHtml = (t: string): string =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const PictorialBarChartInner = React.forwardRef<
  HTMLDivElement,
  Omit<PictorialBarChartProps, 'access' | 'accessReason'>
>(function PictorialBarChartInner(
  {
    data,
    symbol = 'circle',
    symbolRepeat = true,
    symbolSize,
    size = 'md',
    orientation = 'vertical',
    showGrid = true,
    showLegend = false,
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

  useMarkupAdapter(markups, {
    chartType: 'bar',
    orientation,
    dataContext: { labels: data.map((d) => d.label), series: [{ data: data.map((d) => d.value) }] },
  });

  const option = useMemo((): EChartsOption | null => {
    if (isEmpty) return null;

    const palette = colors ?? effectivePalette ?? DEFAULT_PALETTE;
    const categories = data.map((d) => d.label);

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
        valueFormatter: (v: unknown) => fmt(v as number),
      },
      legend: responsiveLegend,
      grid: responsiveGrid,
      xAxis: isHorizontal ? valueAxis : categoryAxis,
      yAxis: isHorizontal ? categoryAxis : valueAxis,
      series: [
        {
          type: 'pictorialBar' as const,
          name: title ?? 'Pictogram',
          symbol,
          symbolRepeat,
          ...(symbolSize !== undefined ? { symbolSize } : {}),
          data: data.map((d, i) => ({
            value: d.value,
            symbol: d.symbol ?? symbol,
            itemStyle: { color: d.color ?? palette[i % palette.length] },
          })),
          cursor: onDataPointClick ? 'pointer' : 'default',
        },
      ],
      aria: {
        enabled: true,
        label: {
          description: description
            ? escapeHtml(description)
            : title
              ? `Pictorial bar chart: ${escapeHtml(title)}`
              : 'Pictorial bar chart',
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
    symbol,
    symbolRepeat,
    symbolSize,
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
      const p = params as { dataIndex?: number; data?: { value?: number }; name?: string };
      const idx = p.dataIndex ?? 0;
      const entry = data[idx];
      onDataPointClick({
        seriesName: title ?? 'Pictogram',
        seriesIndex: 0,
        dataIndex: idx,
        label: entry?.label ?? p.name ?? '',
        value: entry?.value ?? p.data?.value ?? 0,
        datum: entry ?? undefined,
      });
    },
    [data, onDataPointClick, title],
  );

  const a11yState = useChartA11y({
    chartType: 'pictorialBar',
    title,
    description,
    data: data.map((d) => ({ label: d.label, value: d.value })),
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
      className={cn('mfe-pictorial-bar-chart-shell', className)}
      height={height}
      testId="pictorial-bar-chart"
      setRefs={setRefs}
      anomalySummary={anomalySummary}
      formatAnomalyAnnouncement={formatAnomalyAnnouncement}
      {...rest}
    />
  );
});

PictorialBarChartInner.displayName = 'PictorialBarChartInner';

export const PictorialBarChart = React.forwardRef<HTMLDivElement, PictorialBarChartProps>(
  function PictorialBarChart({ access, accessReason, ...rest }, ref) {
    const accessState = resolveAccessState(access);
    return (
      <ChartAccessGate accessState={accessState} accessReason={accessReason}>
        <PictorialBarChartInner ref={ref} {...rest} />
      </ChartAccessGate>
    );
  },
);
PictorialBarChart.displayName = 'PictorialBarChart';
