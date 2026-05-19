'use client';

/**
 * ParallelCoordinatesChart — ECharts-powered parallel-coordinates plot
 * for multi-dimensional data comparison.
 *
 * Each row in `data` becomes a polyline that traverses every axis. Power-
 * user analytical view: compare N dimensions (e.g. department, gender,
 * education, tenure, salary, employer cost) in a single plot to surface
 * outliers and cohort patterns that flat bar charts hide.
 *
 * Use case: HR compensation equity analysis — cinsiyet/eğitim/kıdem/
 * ücret/maliyet ekseninde grup karşılaştırma + outlier tespiti.
 *
 * @migration ECharts parallel series + ParallelComponent — PR-X12a of
 * the @mfe/x-charts native-feature parity campaign (Codex thread
 * 019e2119 AGREE).
 */
import React, { useMemo, useCallback, useRef } from 'react';
import type { AccessControlledProps } from '@mfe/shared-types';
import { resolveAccessState } from '@mfe/shared-types';
import { ChartAccessGate } from './access/ChartAccessGate';
import { guardChartCallback } from './access/guardChartCallback';
import { cn } from './utils/cn';
import { resolveCssVarColors } from './utils/resolveCssVarColor';
import { useEChartsRenderer, useRequiredEChartsFeature } from './renderers';
import { useResponsiveBreakpoint } from './useResponsiveChart';
import { buildResponsiveLegend } from './responsive';
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
import { scaleFontSize } from './theme/density-helpers';
import { CHART_CANVAS_HEIGHT } from './chartSize';
import { formatCompact } from './utils/formatters';
import type { EChartsOption } from './renderers/echarts-imports';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ChartSize = 'sm' | 'md' | 'lg';

/**
 * Axis definition. The order of `axes` in the array determines the
 * visual order from left to right.
 *
 * - `'value'` axes show numeric range; pass `min`/`max` to pin scale.
 * - `'category'` axes show discrete labels; pass `categories` for the
 *   set of valid values (otherwise inferred from data).
 */
export type ParallelAxisDef =
  | {
      field: string;
      name: string;
      type: 'value';
      min?: number;
      max?: number;
      inverse?: boolean;
    }
  | {
      field: string;
      name: string;
      type: 'category';
      categories?: string[];
      inverse?: boolean;
    };

/** Cross-filter compatibility — canonical click event. */
export type { ChartClickEvent } from './types';
import type { ChartClickEvent as ChartClickEventCanonical } from './types';
type ChartClickEvent = ChartClickEventCanonical;

// Markup overlay — NO-OP on parallel v1. Future PR could wire markLine
// for "median" / "target" axes.
export type { ChartMarkup, ChartMarkupClickEvent } from './types';
import type { ChartMarkup, ChartMarkupClickEvent } from './types';
import { useMarkupAdapter } from './annotations/useMarkupAdapter';

export interface ParallelCoordinatesChartProps extends AccessControlledProps {
  /**
   * Data rows. Each row becomes a polyline. Keys must match the
   * `field` of each axis def.
   */
  data: Array<Record<string, number | string>>;
  /**
   * Axis definitions in visual order (left to right). Minimum 2 axes
   * required for a meaningful parallel plot.
   */
  axes: ParallelAxisDef[];
  /**
   * Categorical field used to group lines by color. When set, the
   * legend lists each distinct value with its color; mousing one
   * legend item highlights its lines while dimming others.
   *
   * @default undefined — single uniform color for all lines.
   */
  groupBy?: string;
  /**
   * Polyline opacity. Multi-line parallel plots tend to over-paint
   * (N >> 100). Lower opacity reveals density patterns. Range [0, 1].
   *
   * @default 0.35
   */
  lineOpacity?: number;
  /**
   * Polyline width.
   *
   * @default 1.5
   */
  lineWidth?: number;
  /** Visual size variant. @default "md" */
  size?: ChartSize;
  /** Show legend below the chart. @default false (true if `groupBy` set) */
  showLegend?: boolean;
  /** Custom value formatter for value-axis labels + tooltip. */
  valueFormatter?: (value: number) => string;
  /** Animate polylines on mount. @default true */
  animate?: boolean;
  /** Override default palette (used when `groupBy` set, one per group). */
  colors?: string[];
  /** Chart title. */
  title?: string;
  /** Accessible description. */
  description?: string;
  /** Additional class name. */
  className?: string;
  /** Callback fired when a polyline is clicked. */
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

/**
 * Stable empty option dispatched while the lazy `parallel` modules are
 * still loading — a module constant (not an inline `{}`) so the
 * renderer's option-update effect does not thrash before
 * {@link useRequiredEChartsFeature} reports ready.
 */
const EMPTY_PARALLEL_OPTION: EChartsOption = {};

const ParallelCoordinatesChartInner = React.forwardRef<
  HTMLDivElement,
  Omit<ParallelCoordinatesChartProps, 'access' | 'accessReason'>
>(function ParallelCoordinatesChartInner(
  {
    data,
    axes,
    groupBy,
    lineOpacity = 0.35,
    lineWidth = 1.5,
    size = 'md',
    showLegend,
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
  const isEmpty = !data || data.length === 0 || axes.length < 2;
  const fmt = valueFormatter ?? formatCompact;

  // PR-X16b-prep: the `parallel` series + coordinate-system component
  // are lazy-registered (bundle headroom), so hold the option back until
  // ready and gate `echarts.init()` — ECharts snapshots layout/visual
  // handlers at init time (Codex 019e337e).
  const parallelFeature = useRequiredEChartsFeature('parallel', { enabled: !isEmpty });
  const parallelFeatureReady = parallelFeature.status === 'ready';

  const ownContainerRef = useRef<HTMLDivElement | null>(null);
  const breakpoint = useResponsiveBreakpoint(ownContainerRef);

  const {
    decalEnabled,
    decalPatterns,
    densityFontMultiplier,
    densitySpacingMultiplier,
    effectivePalette,
  } = useChartTheme({
    theme: themePreference,
    decal: decalPreference,
    density: densityPreference,
    accent: accentPreference,
  });

  // Markup adapter NO-OP on parallel — surface dev warning if consumer
  // supplies markups.
  useMarkupAdapter(markups, {
    chartType: 'bar',
    orientation: 'vertical',
    dataContext: { labels: [], series: [{ data: [] }] },
  });

  const option = useMemo((): EChartsOption | null => {
    // Hold the option until BOTH data exists AND the lazy `parallel`
    // modules have registered (see `parallelFeature` above).
    if (isEmpty || !parallelFeatureReady) return null;

    // Consumer `colors` are run through the CSS-var resolver so `var(--token)`
    // strings become concrete values — the canvas renderer cannot read CSS
    // custom properties. effectivePalette / DEFAULT_PALETTE are already hex.
    const palette = resolveCssVarColors(colors) ?? effectivePalette ?? DEFAULT_PALETTE;

    // Build the parallel axis defs in visual order. Each gets an `dim`
    // index matching the order in the `axes` prop.
    const parallelAxis = axes.map((a, dim) => {
      if (a.type === 'category') {
        return {
          dim,
          name: a.name,
          type: 'category' as const,
          data: a.categories,
          inverse: a.inverse,
          nameTextStyle: {
            fontSize: scaleFontSize(11, densityFontMultiplier),
          },
        };
      }
      return {
        dim,
        name: a.name,
        type: 'value' as const,
        min: a.min,
        max: a.max,
        inverse: a.inverse,
        nameTextStyle: {
          fontSize: scaleFontSize(11, densityFontMultiplier),
        },
        axisLabel: {
          formatter: (v: number) => fmt(v),
          fontSize: scaleFontSize(10, densityFontMultiplier),
        },
      };
    });

    // If `groupBy` set, partition data by the group field — one ECharts
    // series per group so the legend / decal / a11y data table treat
    // each cohort separately.
    let series: Array<Record<string, unknown>>;
    let groupNames: string[] = [];
    if (groupBy) {
      const grouped = new Map<string, Array<Array<number | string>>>();
      for (const row of data) {
        const groupVal = String(row[groupBy] ?? 'Other');
        if (!grouped.has(groupVal)) grouped.set(groupVal, []);
        // Wire format: each polyline is [v0, v1, v2, ..., vN] in axis order.
        grouped.get(groupVal)!.push(axes.map((a) => row[a.field] ?? 0));
      }
      groupNames = Array.from(grouped.keys());
      series = groupNames.map((name, i) => ({
        type: 'parallel' as const,
        name,
        data: grouped.get(name)!,
        lineStyle: {
          color: palette[i % palette.length],
          opacity: lineOpacity,
          width: lineWidth,
        },
        emphasis: { lineStyle: { width: lineWidth + 1, opacity: 0.9 } },
        cursor: onDataPointClick ? 'pointer' : 'default',
      }));
    } else {
      // Single uniform-color series.
      series = [
        {
          type: 'parallel' as const,
          name: title ?? 'Distribution',
          data: data.map((row) => axes.map((a) => row[a.field] ?? 0)),
          lineStyle: {
            color: palette[0],
            opacity: lineOpacity,
            width: lineWidth,
          },
          emphasis: { lineStyle: { width: lineWidth + 1, opacity: 0.9 } },
          cursor: onDataPointClick ? 'pointer' : 'default',
        },
      ];
    }

    const legendShow = showLegend ?? !!groupBy;
    const responsiveLegend = buildResponsiveLegend({
      breakpoint,
      showLegend: legendShow,
      hasMultiSeries: !!groupBy && groupNames.length > 1,
      seriesCount: groupNames.length || 1,
      densitySpacingMultiplier,
      densityFontMultiplier,
      icon: 'roundRect',
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
        trigger: 'item',
        confine: true,
        formatter: (p: { dataIndex: number; data: Array<number | string>; seriesName: string }) => {
          const lines = [
            `<b>${escapeHtml(p.seriesName)}</b>`,
            ...axes.map((a, i) => {
              const raw = p.data[i];
              const display = typeof raw === 'number' ? fmt(raw) : escapeHtml(String(raw ?? '–'));
              return `${escapeHtml(a.name)}: ${display}`;
            }),
          ];
          return lines.join('<br/>');
        },
      },
      legend: responsiveLegend,
      parallel: {
        // Provide enough vertical padding for axis name labels at the top
        // and tick labels at the bottom. Density signal modulates these.
        top: title ? 60 : 40,
        bottom: legendShow ? 60 : 30,
        left: 40,
        right: 40,
        layout: 'horizontal',
        parallelAxisDefault: {
          axisLine: { lineStyle: { color: 'var(--text-secondary, #6b7280)' } },
          axisTick: { lineStyle: { color: 'var(--text-secondary, #6b7280)' } },
        },
      },
      parallelAxis,
      series,
      aria: {
        enabled: true,
        label: {
          description: description
            ? escapeHtml(description)
            : title
              ? `Parallel coordinates chart: ${escapeHtml(title)}`
              : 'Parallel coordinates chart',
        },
        ...(decalEnabled ? { decal: { show: true, decals: decalPatterns } } : {}),
      },
    } as EChartsOption;
  }, [
    data,
    axes,
    groupBy,
    lineOpacity,
    lineWidth,
    isEmpty,
    parallelFeatureReady,
    showLegend,
    animate,
    colors,
    title,
    description,
    onDataPointClick,
    fmt,
    decalEnabled,
    decalPatterns,
    densityFontMultiplier,
    densitySpacingMultiplier,
    effectivePalette,
    breakpoint,
  ]);

  const handleClick = useCallback(
    (params: unknown) => {
      if (!onDataPointClick) return;
      const p = params as {
        dataIndex?: number;
        data?: Array<number | string>;
        seriesName?: string;
      };
      onDataPointClick({
        datum: {
          seriesName: p.seriesName ?? title ?? 'Distribution',
          seriesIndex: 0,
          dataIndex: p.dataIndex ?? 0,
          row: data[p.dataIndex ?? 0],
          axisValues: p.data,
        },
        label: p.seriesName ?? '',
        // For parallel coordinates "value" is ambiguous (N dims); we use
        // the first numeric value as the headline measure.
        value: typeof p.data?.[0] === 'number' ? (p.data[0] as number) : 0,
      });
    },
    [data, onDataPointClick, title],
  );

  // A11y data table — use the first numeric axis as the "value" column.
  // Label is composed of all category axis values for context.
  const a11yData = useMemo(() => {
    const firstNumericAxis = axes.find((a) => a.type === 'value');
    const labelAxes = axes.filter((a) => a.type === 'category');
    return data.map((row) => {
      const labelParts = labelAxes.map((a) => `${a.name}: ${row[a.field]}`);
      const label = labelParts.length > 0 ? labelParts.join(', ') : `Row ${data.indexOf(row) + 1}`;
      const value = firstNumericAxis ? Number(row[firstNumericAxis.field] ?? 0) : 0;
      return { label, value };
    });
  }, [data, axes]);

  const a11yState = useChartA11y({
    chartType: 'parallel',
    title,
    description,
    data: a11yData,
    valueFormatter: fmt,
  });

  const { containerRef, instance: _instance } = useEChartsRenderer({
    // Gate echarts.init() until the lazy `parallel` modules have
    // registered — ECharts snapshots its layout/visual handlers at init.
    enabled: parallelFeatureReady,
    option: option ?? EMPTY_PARALLEL_OPTION,
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
      className={cn('mfe-parallel-coordinates-chart-shell', className)}
      height={height}
      testId="parallel-coordinates-chart"
      setRefs={setRefs}
      anomalySummary={anomalySummary}
      formatAnomalyAnnouncement={formatAnomalyAnnouncement}
      {...rest}
    />
  );
});

ParallelCoordinatesChartInner.displayName = 'ParallelCoordinatesChartInner';

export const ParallelCoordinatesChart = React.forwardRef<
  HTMLDivElement,
  ParallelCoordinatesChartProps
>(function ParallelCoordinatesChart({ access, accessReason, onDataPointClick, ...rest }, ref) {
  const { state } = resolveAccessState(access);
  return (
    <ChartAccessGate access={access} accessReason={accessReason}>
      <ParallelCoordinatesChartInner
        ref={ref}
        {...rest}
        onDataPointClick={guardChartCallback(state, onDataPointClick)}
      />
    </ChartAccessGate>
  );
});
ParallelCoordinatesChart.displayName = 'ParallelCoordinatesChart';
