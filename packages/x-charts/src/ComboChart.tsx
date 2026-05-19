'use client';

/**
 * ComboChart — ECharts-powered dual-axis composite chart.
 *
 * Renders bar series and line series together on one shared category
 * x-axis with two independent y-axes (primary left / secondary right).
 * The canonical "combination chart": a volume / count metric drawn as
 * bars + a rate / ratio / average metric drawn as a line, each measured
 * against its own axis scale so two incompatible units stay readable on
 * one canvas.
 *
 * Built as a standalone wrapper (not a `BarChart` / `LineChart` mode)
 * because mixed series types + a second y-axis cannot be expressed by
 * either single-type wrapper (Codex plan thread `019e41cd` AGREE).
 *
 * Render contract:
 *   - `series[].type` is REQUIRED ('bar' | 'line') — the mix defines the
 *     chart; a malformed series is dropped by `normalizeSeries`.
 *   - `series[].axis` ('primary' | 'secondary', default 'primary')
 *     selects the y-axis. The secondary y-axis is rendered ONLY when at
 *     least one series targets it; otherwise every series binds to the
 *     single primary axis (a `yAxisIndex: 1` would dangle).
 *   - `valueFormatter` / `secondaryValueFormatter` format the primary /
 *     secondary axis independently — no cross-leak (a currency primary
 *     formatter never reaches a count secondary series).
 *   - A y-axis `LineMarkup` anchors to the PRIMARY y-axis by default; an
 *     explicit markup `target` routing it to a secondary series makes
 *     ECharts use that series' axis.
 */
import React, { useMemo, useCallback, useRef } from 'react';
import type { AccessControlledProps } from '@mfe/shared-types';
import { resolveAccessState } from '@mfe/shared-types';
import { cn } from './utils/cn';
import { resolveCssVarColor, resolveCssVarColors } from './utils/resolveCssVarColor';
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
import { useResponsiveBreakpoint } from './useResponsiveChart';
import {
  buildResponsiveAxisLabel,
  buildResponsiveLegend,
  buildResponsiveGrid,
  buildResponsiveDataZoom,
} from './responsive';
import { formatCompact } from './utils/formatters';
import { ChartA11yShell, useChartA11y } from './a11y';
import type { AnomalyAnnouncementFormatter } from './a11y/ChartAriaLive';
import type { AnomalySummary } from './annotations/computeAnomalyOverlay';
import type { EChartsOption } from './renderers/echarts-imports';
// Re-exported so consumers can import these from the wrapper or the
// `@mfe/x-charts` root — mirrors the per-wrapper convention.
export type { ChartClickEvent, ChartMarkup, ChartMarkupClickEvent } from './types';
import type { ChartClickEvent, ChartMarkup, ChartMarkupClickEvent } from './types';
import { useMarkupAdapter } from './annotations/useMarkupAdapter';
import { mergeMarkupPatches } from './annotations/mergeMarkupPatches';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ChartSize = 'sm' | 'md' | 'lg';

/** Render kind for a single combo series. */
export type ComboSeriesType = 'bar' | 'line';

/** Which y-axis a combo series is measured against. */
export type ComboAxisId = 'primary' | 'secondary';

/** One series of a combo chart. `type` is required — the mix is the chart. */
export interface ComboChartSeries {
  /** Series display name — legend + tooltip row. */
  name: string;
  /**
   * Numeric values, positionally aligned with `labels`. A shorter array
   * is zero-padded and a longer array truncated to `labels.length`, so
   * tooltip / a11y / click indices always line up with the x-axis.
   */
  data: number[];
  /** Render this series as bars or as a line. */
  type: ComboSeriesType;
  /** Which y-axis the series binds to. @default "primary" */
  axis?: ComboAxisId;
  /** Explicit series color — overrides the palette slot. */
  color?: string;
  /** (line series) draw a bezier-smoothed curve. @default false */
  smooth?: boolean;
  /** (line series) fill the area under the line. @default false */
  area?: boolean;
  /** (bar series) shared stack id — bar series with the same id stack. */
  stack?: string;
}

export interface ComboChartProps extends AccessControlledProps {
  /** X-axis category labels. */
  labels: string[];
  /** Mixed bar / line series. */
  series: ComboChartSeries[];
  /** Visual size variant. @default "md" */
  size?: ChartSize;
  /** Show value labels on bars / line points. @default false */
  showValues?: boolean;
  /** Show value-axis grid lines. @default true */
  showGrid?: boolean;
  /** Show the series legend. @default true */
  showLegend?: boolean;
  /** Show dot markers on line series. @default true */
  showDots?: boolean;
  /** Primary (left) y-axis name. */
  primaryAxisLabel?: string;
  /** Secondary (right) y-axis name. */
  secondaryAxisLabel?: string;
  /** Value formatter for the primary y-axis and its series. */
  valueFormatter?: (value: number) => string;
  /** Value formatter for the secondary y-axis and its series. */
  secondaryValueFormatter?: (value: number) => string;
  /** Override the default color palette. */
  colors?: string[];
  /** Animate on mount. @default true */
  animate?: boolean;
  /** Chart title. */
  title?: string;
  /** Accessible description. */
  description?: string;
  /** Additional class name. */
  className?: string;
  /** Callback fired when a bar / line point is clicked. */
  onDataPointClick?: (event: ChartClickEvent) => void;
  /**
   * Visual overlay markups — threshold lines, highlight bands, KPI
   * labels. A y-axis `LineMarkup` anchors to the PRIMARY y-axis by
   * default; an explicit markup `target` routing it to a secondary
   * series makes ECharts use that series' axis.
   */
  markups?: ChartMarkup[];
  /** Callback fired when a markup overlay is clicked. */
  onMarkupClick?: (event: ChartMarkupClickEvent) => void;
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
   * @default "auto" — follows documentElement `data-density`
   */
  density?: ChartDensityPreference;
  /**
   * Accent palette override (light/emerald/ocean/violet/sunset/graphite/dark).
   * @default "auto" — follows documentElement `data-accent`
   */
  accent?: ChartAccentPreference;
  /**
   * Anomaly summary list — when supplied, `ChartA11yShell` fires a
   * polite, debounced screen-reader announcement summarising outliers.
   * Default `undefined` = no anomaly announcement (backwards compat).
   */
  anomalySummary?: AnomalySummary[];
  /** Optional override of the anomaly announcement template. */
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

/** Internal normalized series — every field guaranteed safe. */
type SafeSeries = {
  name: string;
  data: number[];
  type: ComboSeriesType;
  axis: ComboAxisId;
  color?: string;
  smooth: boolean;
  area: boolean;
  stack?: string;
};

/**
 * Normalize the public `series` prop into render-safe rows. Drops a
 * series whose `type` is not `'bar'` / `'line'` or whose `data` is not
 * an array; coerces `axis` to `'primary'` unless exactly `'secondary'`
 * and `name` to `''` when non-string; pads / truncates every `data`
 * array to `labelCount` (non-finite and missing values become `0`) so
 * every series index lines up with the x-axis labels.
 */
const normalizeSeries = (series: ComboChartSeries[], labelCount: number): SafeSeries[] =>
  (Array.isArray(series) ? series : [])
    .filter(
      (s): s is ComboChartSeries =>
        !!s && (s.type === 'bar' || s.type === 'line') && Array.isArray(s.data),
    )
    .map((s) => {
      const data: number[] = [];
      for (let i = 0; i < labelCount; i += 1) {
        const v = s.data[i];
        data.push(typeof v === 'number' && Number.isFinite(v) ? v : 0);
      }
      return {
        name: typeof s.name === 'string' ? s.name : '',
        data,
        type: s.type,
        axis: s.axis === 'secondary' ? 'secondary' : 'primary',
        color: typeof s.color === 'string' ? s.color : undefined,
        smooth: s.smooth === true,
        area: s.area === true,
        stack: typeof s.stack === 'string' ? s.stack : undefined,
      };
    });

/**
 * Normalize an ECharts callback `value` (number, `[x, y]` tuple, or
 * `{ value }` object) down to a single finite number.
 */
const readParamValue = (raw: unknown): number => {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  if (Array.isArray(raw)) {
    const last = raw[raw.length - 1];
    return typeof last === 'number' && Number.isFinite(last) ? last : 0;
  }
  if (raw && typeof raw === 'object' && 'value' in raw) {
    const v = (raw as { value?: unknown }).value;
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
  }
  return 0;
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * ComboChart inner — hook-bearing body. The outer wrapper adds the
 * `access` / `accessReason` gate without touching hook order (Faz 21.4
 * PR-E2 pattern, mirrors `BarChart`).
 */
const ComboChartInner = React.forwardRef<
  HTMLDivElement,
  Omit<ComboChartProps, 'access' | 'accessReason'>
>(function ComboChartInner(
  {
    labels,
    series,
    size = 'md',
    showValues = false,
    showGrid = true,
    showLegend = true,
    showDots = true,
    primaryAxisLabel,
    secondaryAxisLabel,
    valueFormatter,
    secondaryValueFormatter,
    colors,
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
  const safeLabels = useMemo(
    () => (Array.isArray(labels) ? labels.filter((l): l is string => typeof l === 'string') : []),
    [labels],
  );
  const safeSeries = useMemo(
    () => normalizeSeries(series, safeLabels.length),
    [series, safeLabels.length],
  );
  const isEmpty = safeSeries.length === 0 || safeLabels.length === 0;
  const primaryFmt = valueFormatter ?? formatCompact;
  const secondaryFmt = secondaryValueFormatter ?? formatCompact;
  const hasSecondary = useMemo(() => safeSeries.some((s) => s.axis === 'secondary'), [safeSeries]);

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

  // Markup overlay adapter — combo is a generic cartesian chart, so the
  // adapter runs in `line` mode (category-x / value-y). A y-axis markup
  // anchors to the primary axis unless an explicit `target` routes it.
  const markupResult = useMarkupAdapter(markups, {
    chartType: 'line',
    dataContext: {
      labels: safeLabels,
      series: safeSeries.map((s) => ({ name: s.name, data: s.data })),
    },
  });

  const option = useMemo((): EChartsOption | null => {
    if (isEmpty) return null;

    // Codex iter-2 fallback chain: explicit `colors` prop (resolved
    // through resolveCssVarColors so `var(--token)` becomes concrete —
    // the canvas renderer cannot read CSS custom properties) >
    // effectivePalette (accent / HC-Print theme builder) > DEFAULT_PALETTE.
    // An empty `colors` array is NOT "explicit" — it falls through.
    const explicitColors = resolveCssVarColors(colors);
    const palette =
      explicitColors && explicitColors.length > 0
        ? explicitColors
        : (effectivePalette ?? DEFAULT_PALETTE);

    const labelFontSize = scaleFontSize(11, densityFontMultiplier);

    const responsiveAxisLabel = buildResponsiveAxisLabel({
      breakpoint,
      labelCount: safeLabels.length,
      densityFontMultiplier,
      baseFontSize: 11,
    });

    const categoryAxis = {
      type: 'category' as const,
      data: safeLabels,
      // `boundaryGap: true` is mandatory for the bar series (a bar needs
      // a band, not a point); line series simply land at the band centre.
      boundaryGap: true,
      axisLabel: responsiveAxisLabel,
      axisTick: { alignWithLabel: true },
    };

    const buildValueAxis = (
      name: string | undefined,
      position: 'left' | 'right',
      fmt: (v: number) => string,
      gridLines: boolean,
    ) => ({
      type: 'value' as const,
      ...(name ? { name } : {}),
      position,
      axisLabel: {
        fontSize: responsiveAxisLabel.fontSize,
        hideOverlap: true,
        formatter: (v: number) => fmt(v),
      },
      splitLine: { show: gridLines, lineStyle: { type: 'dashed' as const } },
    });

    // The secondary axis is rendered ONLY when a series targets it —
    // otherwise every series binds to the single primary axis and a
    // `yAxisIndex: 1` would reference a non-existent axis.
    const yAxis = hasSecondary
      ? [
          buildValueAxis(primaryAxisLabel, 'left', primaryFmt, showGrid),
          // Secondary split lines OFF — two dashed grids would collide.
          buildValueAxis(secondaryAxisLabel, 'right', secondaryFmt, false),
        ]
      : [buildValueAxis(primaryAxisLabel, 'left', primaryFmt, showGrid)];

    const responsiveLegend = buildResponsiveLegend({
      breakpoint,
      showLegend,
      hasMultiSeries: safeSeries.length > 1,
      seriesCount: safeSeries.length,
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

    // dataZoom only kicks in for long category axes (>30 labels) on
    // tablet / mobile — keeps short combos uncluttered.
    const responsiveDataZoom = buildResponsiveDataZoom({
      breakpoint,
      labelCount: safeLabels.length,
      horizontal: false,
    });

    const echartsSeriesList = safeSeries.map((s, i) => {
      // Resolve a consumer `var(--token)` color once — the canvas
      // renderer cannot read CSS custom properties. `palette` is already
      // resolved (resolveCssVarColors / effectivePalette / DEFAULT).
      const seriesColor = resolveCssVarColor(s.color) ?? palette[i % palette.length];
      const yAxisIndex = hasSecondary && s.axis === 'secondary' ? 1 : 0;
      const seriesFmt = s.axis === 'secondary' ? secondaryFmt : primaryFmt;
      const valueLabel = showValues
        ? {
            show: true,
            position: 'top' as const,
            fontSize: labelFontSize,
            formatter: (p: { value?: unknown }) => seriesFmt(readParamValue(p.value)),
          }
        : { show: false as const };

      if (s.type === 'bar') {
        return {
          type: 'bar' as const,
          name: s.name,
          data: s.data,
          yAxisIndex,
          ...(s.stack ? { stack: s.stack } : {}),
          itemStyle: { color: seriesColor },
          label: valueLabel,
          cursor: onDataPointClick ? 'pointer' : 'default',
        };
      }
      return {
        type: 'line' as const,
        name: s.name,
        data: s.data,
        yAxisIndex,
        smooth: s.smooth,
        symbol: showDots ? 'circle' : 'none',
        symbolSize: showDots ? 6 : 0,
        lineStyle: { color: seriesColor, width: 2 },
        itemStyle: { color: seriesColor },
        areaStyle: s.area ? { color: seriesColor, opacity: 0.18 } : undefined,
        emphasis: { focus: 'series' as const, itemStyle: { borderWidth: 2 } },
        label: valueLabel,
        cursor: onDataPointClick ? 'pointer' : 'default',
      };
    });

    // Custom tooltip — a single `tooltip.valueFormatter` cannot express
    // two axis scales, so each row is routed through the formatter of
    // ITS series' axis, resolved by `seriesIndex` (NOT `seriesName` —
    // duplicate series names would otherwise mis-route). Every dynamic
    // string is HTML-escaped; `marker` is the ECharts-generated swatch.
    const tooltipFormatter = (params: unknown): string => {
      const list = Array.isArray(params) ? params : [params];
      if (list.length === 0) return '';
      const head = list[0] as { axisValueLabel?: unknown; axisValue?: unknown };
      const header = escapeHtml(String(head?.axisValueLabel ?? head?.axisValue ?? ''));
      const rows = list
        .map((entry) => {
          const p = entry as {
            seriesIndex?: number;
            seriesName?: unknown;
            marker?: unknown;
            value?: unknown;
          };
          const idx = typeof p.seriesIndex === 'number' ? p.seriesIndex : -1;
          const matched = idx >= 0 ? safeSeries[idx] : undefined;
          const fmt = matched?.axis === 'secondary' ? secondaryFmt : primaryFmt;
          const marker = typeof p.marker === 'string' ? p.marker : '';
          const name = escapeHtml(String(p.seriesName ?? matched?.name ?? ''));
          const value = escapeHtml(fmt(readParamValue(p.value)));
          return `${marker}${name}: <strong>${value}</strong>`;
        })
        .join('<br/>');
      return header ? `${header}<br/>${rows}` : rows;
    };

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
        formatter: tooltipFormatter,
      },
      legend: responsiveLegend,
      grid: responsiveGrid,
      ...(responsiveDataZoom ? { dataZoom: responsiveDataZoom } : {}),
      xAxis: categoryAxis,
      yAxis,
      series: mergeMarkupPatches(echartsSeriesList, markupResult.seriesPatches),
      aria: {
        enabled: true,
        label: {
          description: description
            ? escapeHtml(description)
            : title
              ? `Combination chart: ${escapeHtml(title)}`
              : 'Combination chart',
        },
        ...(decalEnabled ? { decal: { show: true, decals: decalPatterns } } : {}),
      },
    } as EChartsOption;
  }, [
    isEmpty,
    safeSeries,
    safeLabels,
    hasSecondary,
    colors,
    showValues,
    showGrid,
    showLegend,
    showDots,
    primaryAxisLabel,
    secondaryAxisLabel,
    primaryFmt,
    secondaryFmt,
    animate,
    title,
    description,
    onDataPointClick,
    decalEnabled,
    decalPatterns,
    densityFontMultiplier,
    densitySpacingMultiplier,
    densityPaddingMultiplier,
    effectivePalette,
    breakpoint,
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
        value?: unknown;
      };
      // Markup overlay click — early-return so `onDataPointClick` does
      // NOT fire on the same event (mirrors BarChart / LineChart).
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
            chartType: 'combo',
            seriesIndex: p.seriesIndex,
            dataIndex: p.dataIndex,
            nativeParams: params,
          });
        }
        return;
      }

      if (!onDataPointClick) return;
      const idx = typeof p.seriesIndex === 'number' ? p.seriesIndex : -1;
      const matched = idx >= 0 ? safeSeries[idx] : undefined;
      const value = readParamValue(p.value);
      const label = typeof p.name === 'string' ? p.name : '';
      onDataPointClick({
        // Canonical payload — `label` + `value` live INSIDE `datum` too
        // so `CrossFilterChart` (which forwards only `event.datum`) can
        // resolve `emitFields`. `axis` / `type` carry the combo-specific
        // series identity (which y-axis, bar vs line).
        datum: {
          seriesName: typeof p.seriesName === 'string' ? p.seriesName : (matched?.name ?? ''),
          seriesIndex: idx >= 0 ? idx : undefined,
          dataIndex: typeof p.dataIndex === 'number' ? p.dataIndex : undefined,
          axis: matched?.axis,
          type: matched?.type,
          label,
          value,
        },
        value,
        label,
      });
    },
    [onDataPointClick, onMarkupClick, markupResult, safeSeries],
  );

  const { containerRef, instance } = useEChartsRenderer({
    option: option ?? ({} as EChartsOption),
    theme: themeObject,
    respectReducedMotion: true,
    onClick: onDataPointClick || onMarkupClick ? handleClick : undefined,
  });

  // a11y data table — one row per x-axis label. The row label lists
  // EVERY series formatted by its OWN axis formatter; the row `value`
  // is the first PRIMARY-axis series' value (falls back to the first
  // series when none targets the primary axis) so the SR numeric
  // summary stays on a single, meaningful scale.
  const a11yPrimaryIndex = useMemo(() => {
    const i = safeSeries.findIndex((s) => s.axis === 'primary');
    return i >= 0 ? i : safeSeries.length > 0 ? 0 : -1;
  }, [safeSeries]);

  const a11yData = useMemo(
    () =>
      safeLabels.map((label, i) => {
        const parts = safeSeries.map((s) => {
          const fmt = s.axis === 'secondary' ? secondaryFmt : primaryFmt;
          return `${s.name}: ${fmt(s.data[i] ?? 0)}`;
        });
        const value = a11yPrimaryIndex >= 0 ? (safeSeries[a11yPrimaryIndex].data[i] ?? 0) : 0;
        return {
          label: parts.length > 0 ? `${label} — ${parts.join(', ')}` : label,
          value,
        };
      }),
    [safeLabels, safeSeries, primaryFmt, secondaryFmt, a11yPrimaryIndex],
  );

  const a11y = useChartA11y({
    chartType: 'combo',
    data: a11yData,
    title,
    description,
    valueFormatter: primaryFmt,
    // undefined → the hook falls back to its default 'Value' header.
    valueColumnHeader: primaryAxisLabel,
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
        data-testid="combo-chart-empty"
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
      testId="combo-chart"
      setRefs={setRefs}
      anomalySummary={anomalySummary}
      formatAnomalyAnnouncement={formatAnomalyAnnouncement}
      {...rest}
    />
  );
});

ComboChartInner.displayName = 'ComboChartInner';

/**
 * ComboChart — public wrapper. Accepts `access` + `accessReason`
 * (`AccessControlledProps`) and forwards everything else to the inner
 * component. Mirrors the `BarChart` access-gate wiring (Faz 21.4 PR-E2).
 */
export const ComboChart = React.forwardRef<HTMLDivElement, ComboChartProps>(function ComboChart(
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
      <ComboChartInner
        ref={ref}
        {...rest}
        onDataPointClick={guardChartCallback(state, onDataPointClick)}
        onMarkupClick={guardChartCallback(state, onMarkupClick)}
        anomalySummary={anomalySummary}
        formatAnomalyAnnouncement={formatAnomalyAnnouncement}
      />
    </ChartAccessGate>
  );
});
ComboChart.displayName = 'ComboChart';

export default ComboChart;
