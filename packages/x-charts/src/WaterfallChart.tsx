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
import { resolveCssVarColor } from './utils/resolveCssVarColor';
import { useEChartsRenderer } from './renderers';
import { useResponsiveBreakpoint } from './useResponsiveChart';
import {
  buildResponsiveAxisLabel,
  buildResponsiveLegend,
  buildResponsiveGrid,
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
import { sanitizeDataPoints } from './utils/data-validation';
import type { EChartsOption } from './renderers/echarts-imports';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

// Cross-filter rollout sweep — Codex thread 019e0c25 absorb. Re-export
// canonical `ChartClickEvent`. Waterfall datum exposes both the
// chart-displayed cumulative value and the raw input value, plus the
// resolved item type ('increase' / 'decrease' / 'total') so consumers
// can filter by category meaning.
export type { ChartClickEvent } from './types';
import type { ChartClickEvent as ChartClickEventCanonical } from './types';
type ChartClickEvent = ChartClickEventCanonical;

// Markup overlay (Codex thread 019e0df1). Waterfall is partial: the
// `mergeMarkupPatches` helper APPENDS to the existing markLine on the
// visible value series (used for connector lines between bars), so
// new threshold lines coexist with the connectors without clobbering.
// Base series (`__waterfall_base__`) is left untouched.
export type { ChartMarkup, ChartMarkupClickEvent } from './types';
import type { ChartMarkup, ChartMarkupClickEvent } from './types';
import { useMarkupAdapter } from './annotations/useMarkupAdapter';
import { mergeMarkupPatches } from './annotations/mergeMarkupPatches';

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
  /** Accessible description. */
  description?: string;
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
  /**
   * Callback fired when a visible bar is clicked. Emits a canonical
   * `ChartClickEvent` with `datum: { label, value: displayedValue,
   * rawValue, type }` — `displayedValue` is what ECharts renders
   * (cumulative for 'total' bars, signed delta for inc/dec); `rawValue`
   * is the original `WaterfallDataPoint.value` from props; `type` is
   * the resolved `WaterfallItemType`. Hidden base-stack series clicks
   * are filtered out (they aren't user-meaningful).
   */
  onDataPointClick?: (event: ChartClickEvent) => void;
  /**
   * Visual overlay markups (Codex thread 019e0df1). Partial support:
   * line + area patches MERGE with the existing connector markLine on
   * the visible value series; base series (`__waterfall_base__`) is
   * untouched. Use `target.seriesName: 'Waterfall'` for explicit
   * routing if needed.
   */
  markups?: ChartMarkup[];
  /** Callback fired when a markup overlay is clicked. */
  onMarkupClick?: (event: ChartMarkupClickEvent) => void;
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
  /**
   * Faz 21.11 PR-A2b-a11y-other-batch2 — anomaly summary list. When
   * the chart is rendered with anomaly markers (pair with
   * `useAnomalySummary({ data })` at the consumer layer), forwards
   * the summary to `ChartA11yShell` for a polite, debounced
   * screen-reader announcement summarising the unusual steps.
   * `anomalySummary.x` is typically the step label (e.g. "Q1
   * expense"); `formattedY` the raw step value.
   */
  anomalySummary?: AnomalySummary[];
  /**
   * Optional override of the anomaly announcement template.
   * Forwarded to `ChartAriaLive.formatAnomalyAnnouncement`.
   * Default: small EN/TR formatter ("3 outliers detected, ...").
   */
  formatAnomalyAnnouncement?: AnomalyAnnouncementFormatter;
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
    description,
    colors: colorsProp,
    showConnector = true,
    showValues = true,
    valueFormatter,
    orientation = 'vertical',
    showLegend = false,
    animate = true,
    onDataPointClick,
    markups,
    onMarkupClick,
    className,
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
  const safeData = useMemo(
    () => sanitizeDataPoints(data as never) as unknown as WaterfallDataPoint[],
    [data],
  );
  const fmt = valueFormatter ?? formatCompact;

  // Markup overlay adapter — Codex thread 019e0df1. dataContext from
  // safeData (label = item.label, value = item.value).
  const markupResult = useMarkupAdapter(markups, {
    chartType: 'waterfall',
    orientation,
    dataContext: {
      labels: safeData.map((d) => d.label),
      series: [{ data: safeData.map((d) => d.value) }],
    },
  });

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
  // Consumer `colors.{increase,decrease,total}` are run through the CSS-var
  // resolver so `var(--token)` values become concrete — the canvas renderer
  // cannot read CSS custom properties. DEFAULT_COLORS / accentPrimary are
  // already resolved hex.
  const palette = useMemo(
    () => ({
      increase: resolveCssVarColor(colorsProp?.increase) ?? DEFAULT_COLORS.increase,
      decrease: resolveCssVarColor(colorsProp?.decrease) ?? DEFAULT_COLORS.decrease,
      total: resolveCssVarColor(colorsProp?.total) ?? accentPrimary,
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
              // Codex post-impl review iter-2 (P1): connector entries
              // are 2-element ARRAYS (`[{xAxis,yAxis}, {xAxis,yAxis}]`)
              // describing segment endpoints. Spreading the pair
              // (`{...pair, silent: true}`) would convert it to a
              // numeric-keyed object and BREAK ECharts' segment
              // rendering. Preserve the array shape and inject
              // `silent: true` on EACH endpoint so the connector
              // stays non-interactive when `mergeMarkupPatches`
              // appends user-supplied markup line/segment entries.
              data: markLineData.map(([endpointA, endpointB]) => [
                { ...endpointA, silent: true },
                { ...endpointB, silent: true },
              ]),
              label: { show: false },
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
      // mergeMarkupPatches ROUTES to first series by default (no
      // target). To keep the base stack untouched and merge into the
      // value series, we pre-route via target=seriesIndex:1 in the
      // adapter call... but Waterfall users won't always set target.
      // Solution: merge into [baseSeries, valueSeries] and force
      // patches without target to land on valueSeries (index 1) by
      // pre-mapping. mergeMarkupPatches default targets index 0,
      // which is __waterfall_base__ — not what we want for connector
      // merge. Pre-map default patches to seriesIndex: 1.
      series: mergeMarkupPatches(
        [baseSeries, valueSeries],
        markupResult.seriesPatches.map((p) =>
          p.seriesIndex === undefined && p.seriesName === undefined ? { ...p, seriesIndex: 1 } : p,
        ),
      ),
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
    // Markup patches drive series.markLine / markArea / markPoint
    // (Codex thread 019e0df1).
    markupResult,
  ]);

  const handleClick = useCallback(
    (params: unknown) => {
      const pAny = params as {
        componentType?: string;
        name?: string;
        seriesIndex?: number;
        dataIndex?: number;
      };
      // Markup overlay click — Codex thread 019e0df1 absorb. Early
      // return so onDataPointClick (and the base-series filter) does
      // NOT fire for an overlay event.
      if (
        pAny.componentType === 'markLine' ||
        pAny.componentType === 'markArea' ||
        pAny.componentType === 'markPoint'
      ) {
        if (!onMarkupClick) return;
        const lookupName = typeof pAny.name === 'string' ? pAny.name : undefined;
        const markup = lookupName ? markupResult.markupLookup.get(lookupName) : undefined;
        if (markup) {
          onMarkupClick({
            markup,
            chartType: 'waterfall',
            seriesIndex: pAny.seriesIndex,
            dataIndex: pAny.dataIndex,
            nativeParams: params,
          });
        }
        return;
      }

      if (!onDataPointClick) return;
      const p = params as {
        seriesName?: string;
        name?: string;
        value?: number;
        dataIndex?: number;
      };
      // Drop hidden base-stack series clicks — they are an
      // implementation detail of the floating-bar effect, not a
      // user-meaningful waterfall step.
      if (p.seriesName === '__waterfall_base__') return;

      const idx = typeof p.dataIndex === 'number' ? p.dataIndex : -1;
      const item = idx >= 0 && idx < data.length ? data[idx] : undefined;
      if (!item) return;

      const displayedValue = typeof p.value === 'number' ? p.value : item.value;
      const rawValue = item.value;
      const itemType = resolveType(item, idx, data.length);

      onDataPointClick({
        datum: {
          label: item.label,
          value: displayedValue,
          rawValue,
          type: itemType,
        },
        value: displayedValue,
        label: item.label,
      });
    },
    [onDataPointClick, onMarkupClick, markupResult, data],
  );

  const { containerRef, instance } = useEChartsRenderer({
    option: option ?? ({} as EChartsOption),
    theme: themeObject,
    respectReducedMotion: true,
    onClick: onDataPointClick || onMarkupClick ? handleClick : undefined,
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
    description,
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
      anomalySummary={anomalySummary}
      formatAnomalyAnnouncement={formatAnomalyAnnouncement}
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
  function WaterfallChart(
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
        <WaterfallChartInner
          ref={ref}
          {...rest}
          onDataPointClick={guardChartCallback(state, onDataPointClick)}
          onMarkupClick={guardChartCallback(state, onMarkupClick)}
          // PR-A2b-a11y-other-batch2: anomaly summary + formatter
          // forwarded through unchanged — these aren't user-facing
          // callbacks that the access gate would block.
          anomalySummary={anomalySummary}
          formatAnomalyAnnouncement={formatAnomalyAnnouncement}
        />
      </ChartAccessGate>
    );
  },
);
WaterfallChart.displayName = 'WaterfallChart';

export default WaterfallChart;
