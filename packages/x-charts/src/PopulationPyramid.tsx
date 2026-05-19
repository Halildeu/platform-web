'use client';

/**
 * PopulationPyramid — ECharts-powered demographic pyramid chart.
 *
 * The classic HR age × gender chart: age bands as category rows, two
 * diverging horizontal bars per row (e.g. male left, female right) on a
 * shared symmetric value axis.
 *
 * Structurally a diverging horizontal bar. Built as a standalone wrapper
 * (not a `BarChart` mode) because the public data shape — age-band rows
 * with two gendered measures — and the negate/abs render semantics would
 * bloat the BarChart API (Codex plan thread `019e3f75`).
 *
 * Render contract: `left` / `right` are UNSIGNED in the public API. The
 * left series is negated internally so ECharts paints it left of zero;
 * tooltips, axis labels, bar labels, the a11y data table and the click
 * payload always surface the raw POSITIVE value.
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
import { CHART_CANVAS_HEIGHT } from './chartSize';
import { useResponsiveBreakpoint } from './useResponsiveChart';
import { buildResponsiveLegend, buildResponsiveGrid } from './responsive';
import { formatCompact } from './utils/formatters';
import { ChartA11yShell, useChartA11y } from './a11y';
import type { AnomalyAnnouncementFormatter } from './a11y/ChartAriaLive';
import type { AnomalySummary } from './annotations/computeAnomalyOverlay';
import type { EChartsOption } from './renderers/echarts-imports';
// Re-exported so consumers can import these from the wrapper or the
// `@mfe/x-charts` root — mirrors the per-wrapper convention (BarChart,
// the PR-X16 depth wrappers).
export type { ChartClickEvent, ChartMarkup, ChartMarkupClickEvent } from './types';
import type { ChartClickEvent, ChartMarkup, ChartMarkupClickEvent } from './types';
import { useMarkupAdapter } from './annotations/useMarkupAdapter';
import { mergeMarkupPatches } from './annotations/mergeMarkupPatches';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ChartSize = 'sm' | 'md' | 'lg';

/** One age-band row of the pyramid. `left` / `right` are unsigned. */
export type PopulationPyramidDatum = {
  /** Optional stable id (cross-filter / React key). */
  id?: string;
  /** Age band label, e.g. `"25-34"`. The category-axis row. */
  ageBand: string;
  /** Left-side measure (unsigned, e.g. male headcount). */
  left: number;
  /** Right-side measure (unsigned, e.g. female headcount). */
  right: number;
};

export interface PopulationPyramidProps extends AccessControlledProps {
  /** Age-band rows. `left` / `right` are unsigned; negation is internal. */
  data: PopulationPyramidDatum[];
  /** Left-side series name (e.g. `"Erkek"`). @default "Sol" */
  leftLabel?: string;
  /** Right-side series name (e.g. `"Kadın"`). @default "Sağ" */
  rightLabel?: string;
  /** Visual size variant. @default "md" */
  size?: ChartSize;
  /** Show value labels on the bars (raw positive). @default false */
  showValues?: boolean;
  /** Show value-axis grid lines. @default true */
  showGrid?: boolean;
  /** Show the left/right legend. @default true */
  showLegend?: boolean;
  /** Custom value formatter (always receives the raw positive value). */
  valueFormatter?: (value: number) => string;
  /** Explicit `[left, right]` series colors. Overrides the accent palette. */
  colors?: [string, string];
  /**
   * Explicit symmetric axis maximum. Without it the axis auto-scales to
   * the largest `left`/`right` across all rows. The value axis is always
   * symmetric (`[-max, max]`) so the two sides stay visually comparable.
   */
  maxValue?: number;
  /** Animate bars on mount. @default true */
  animate?: boolean;
  /** Chart title. */
  title?: string;
  /** Accessible description. */
  description?: string;
  /** Additional class name. */
  className?: string;
  /** Callback fired when a bar segment is clicked (raw positive value). */
  onDataPointClick?: (event: ChartClickEvent) => void;
  /**
   * Visual overlay markups — threshold lines, highlight bands, KPI
   * labels. NB: markup `x` values are in the signed render domain — a
   * left-side threshold uses a negative `x`. Use explicit-coordinate
   * anchors (`LineMarkup` / `AreaMarkup` `axis` + `value`, `LabelMarkup`
   * `{ x, y }`); the `LabelMarkup` `{ dataIndex }` anchor is NOT reliable
   * on this chart (v1 limitation — the generic cartesian resolver assumes
   * a category-x / value-y layout, the opposite of a pyramid).
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

/**
 * Final-fallback `[left, right]` colors when neither an explicit
 * `colors` prop nor the resolved accent palette is available.
 */
const DEFAULT_PYRAMID_COLORS: [string, string] = ['#3b82f6', '#ec4899'];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const escapeHtml = (t: string): string =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Clamp a public input value to a finite, non-negative number. */
const sanitizeMeasure = (v: number): number => (Number.isFinite(v) ? Math.max(0, v) : 0);

/** Internal normalized row — every field guaranteed safe. */
type SafeRow = { id?: string; ageBand: string; left: number; right: number };

const normalizeRows = (data: PopulationPyramidDatum[]): SafeRow[] =>
  (Array.isArray(data) ? data : [])
    .filter((d): d is PopulationPyramidDatum => !!d && typeof d.ageBand === 'string')
    .map((d) => ({
      id: d.id,
      ageBand: d.ageBand,
      left: sanitizeMeasure(d.left),
      right: sanitizeMeasure(d.right),
    }));

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * PopulationPyramid inner — hook-bearing body. The outer wrapper adds the
 * `access` / `accessReason` gate without touching hook order (Faz 21.4
 * PR-E2 pattern, mirrors `BarChart`).
 */
const PopulationPyramidInner = React.forwardRef<
  HTMLDivElement,
  Omit<PopulationPyramidProps, 'access' | 'accessReason'>
>(function PopulationPyramidInner(
  {
    data,
    leftLabel = 'Sol',
    rightLabel = 'Sağ',
    size = 'md',
    showValues = false,
    showGrid = true,
    showLegend = true,
    valueFormatter,
    colors,
    maxValue,
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
  const safeRows = useMemo(() => normalizeRows(data), [data]);
  const isEmpty = safeRows.length === 0;
  const fmt = valueFormatter ?? formatCompact;

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

  // Markup overlay adapter — pure (no ECharts instance). The dataContext
  // labels are the age bands; the "series" axis is the signed value axis.
  const markupResult = useMarkupAdapter(markups, {
    chartType: 'bar',
    orientation: 'horizontal',
    dataContext: {
      labels: safeRows.map((d) => d.ageBand),
      series: [{ data: safeRows.map((d) => d.right) }],
    },
  });

  const option = useMemo((): EChartsOption | null => {
    if (isEmpty) return null;

    // Codex iter-13 fallback chain: explicit `colors` prop >
    // effectivePalette (accent / HC-Print theme builder) > inline default.
    // PopulationPyramid is accent-driven — no accent-immune carve-out.
    const palette: [string, string] = colors ?? [
      effectivePalette?.[0] ?? DEFAULT_PYRAMID_COLORS[0],
      effectivePalette?.[1] ?? DEFAULT_PYRAMID_COLORS[1],
    ];

    // Symmetric value domain — both sides must share `[-max, max]` so the
    // two halves are visually comparable (Codex pitfall C).
    const maxAbs =
      Number.isFinite(maxValue) && (maxValue as number) > 0
        ? (maxValue as number)
        : Math.max(...safeRows.flatMap((d) => [d.left, d.right]), 1);

    const labelFontSize = scaleFontSize(11, densityFontMultiplier);

    const categoryAxis = {
      type: 'category' as const,
      data: safeRows.map((d) => d.ageBand),
      axisTick: { alignWithLabel: true },
      axisLabel: { fontSize: labelFontSize, hideOverlap: true },
    };

    const valueAxis = {
      type: 'value' as const,
      min: -maxAbs,
      max: maxAbs,
      axisLabel: {
        fontSize: labelFontSize,
        hideOverlap: true,
        // Render coordinate is signed; the label always shows abs.
        formatter: (v: number) => fmt(Math.abs(v)),
      },
      splitLine: { show: showGrid, lineStyle: { type: 'dashed' as const } },
    };

    const responsiveLegend = buildResponsiveLegend({
      breakpoint,
      showLegend,
      hasMultiSeries: true,
      seriesCount: 2,
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

    // Two bar series sharing ONE stack id so each age band renders as a
    // single diverging bar (opposite-sign halves) instead of two grouped
    // bars (Codex pitfall C). `value` is the signed render coordinate;
    // `rawValue` / `side` / `ageBand` carry the un-negated semantics for
    // tooltip / label / click payload.
    const STACK = 'population-pyramid';
    const barLabel = (position: 'left' | 'right') =>
      showValues
        ? {
            show: true,
            position,
            fontSize: labelFontSize,
            formatter: (p: { data?: { rawValue?: number } }) => fmt(p.data?.rawValue ?? 0),
          }
        : { show: false as const };

    const echartsSeriesList = [
      {
        type: 'bar' as const,
        name: leftLabel,
        stack: STACK,
        itemStyle: { color: palette[0] },
        label: barLabel('left'),
        cursor: onDataPointClick ? 'pointer' : 'default',
        data: safeRows.map((d) => ({
          value: -d.left,
          rawValue: d.left,
          side: 'left' as const,
          ageBand: d.ageBand,
        })),
      },
      {
        type: 'bar' as const,
        name: rightLabel,
        stack: STACK,
        itemStyle: { color: palette[1] },
        label: barLabel('right'),
        cursor: onDataPointClick ? 'pointer' : 'default',
        data: safeRows.map((d) => ({
          value: d.right,
          rawValue: d.right,
          side: 'right' as const,
          ageBand: d.ageBand,
        })),
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
        // Un-negate: the left series feeds a negative render value.
        valueFormatter: (v: unknown) => fmt(Math.abs(v as number)),
      },
      legend: responsiveLegend,
      grid: responsiveGrid,
      xAxis: valueAxis,
      yAxis: categoryAxis,
      series: mergeMarkupPatches(echartsSeriesList, markupResult.seriesPatches),
      aria: {
        enabled: true,
        label: {
          description: description
            ? escapeHtml(description)
            : title
              ? `Population pyramid: ${escapeHtml(title)}`
              : 'Population pyramid chart',
        },
        ...(decalEnabled ? { decal: { show: true, decals: decalPatterns } } : {}),
      },
    } as EChartsOption;
  }, [
    isEmpty,
    safeRows,
    leftLabel,
    rightLabel,
    showValues,
    showGrid,
    showLegend,
    colors,
    maxValue,
    animate,
    title,
    description,
    onDataPointClick,
    fmt,
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
        data?: unknown;
        name?: string;
        value?: number;
        dataIndex?: number;
        seriesIndex?: number;
        seriesName?: string;
      };
      // Markup overlay click — early-return so `onDataPointClick` does
      // NOT fire on the same event (mirrors BarChart).
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
            chartType: 'populationPyramid',
            seriesIndex: p.seriesIndex,
            dataIndex: p.dataIndex,
            nativeParams: params,
          });
        }
        return;
      }

      if (!onDataPointClick) return;
      const raw =
        typeof p.data === 'object' && p.data !== null ? (p.data as Record<string, unknown>) : {};
      // Always emit the raw POSITIVE value — never the negated render
      // coordinate. `datum` carries `side` / `ageBand` for cross-filter.
      const rawValue =
        typeof raw.rawValue === 'number'
          ? raw.rawValue
          : Math.abs(typeof p.value === 'number' ? p.value : 0);
      const ageBand = typeof raw.ageBand === 'string' ? raw.ageBand : (p.name ?? '');
      onDataPointClick({
        // Canonical payload — `label` + `value` live INSIDE `datum` too
        // so `CrossFilterChart` (which forwards only `event.datum`) can
        // resolve `emitFields: ['label']` / `['value']`. Mirrors BarChart.
        datum: { ...raw, label: ageBand, value: rawValue, seriesName: p.seriesName },
        value: rawValue,
        label: ageBand,
      });
    },
    [onDataPointClick, onMarkupClick, markupResult],
  );

  const { containerRef, instance } = useEChartsRenderer({
    option: option ?? ({} as EChartsOption),
    theme: themeObject,
    respectReducedMotion: true,
    onClick: onDataPointClick || onMarkupClick ? handleClick : undefined,
  });

  // a11y data table — one row per age band (Codex pitfall: `useChartA11y`
  // is `dataIndex`-based; a 2×ageBand table would overrun the keyboard
  // dispatch). The label carries BOTH sides as raw positive values; the
  // value is the band total so the SR summary stays meaningful.
  const a11yData = useMemo(
    () =>
      safeRows.map((d) => ({
        label: `${d.ageBand} — ${leftLabel}: ${fmt(d.left)}, ${rightLabel}: ${fmt(d.right)}`,
        value: d.left + d.right,
      })),
    [safeRows, leftLabel, rightLabel, fmt],
  );
  const a11y = useChartA11y({
    chartType: 'populationPyramid',
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
        data-testid="population-pyramid-empty"
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
      testId="population-pyramid"
      setRefs={setRefs}
      anomalySummary={anomalySummary}
      formatAnomalyAnnouncement={formatAnomalyAnnouncement}
      {...rest}
    />
  );
});

PopulationPyramidInner.displayName = 'PopulationPyramidInner';

/**
 * PopulationPyramid — public wrapper. Accepts `access` + `accessReason`
 * (`AccessControlledProps`) and forwards everything else to the inner
 * component. Mirrors the `BarChart` access-gate wiring (Faz 21.4 PR-E2).
 */
export const PopulationPyramid = React.forwardRef<HTMLDivElement, PopulationPyramidProps>(
  function PopulationPyramid(
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
        <PopulationPyramidInner
          ref={ref}
          {...rest}
          onDataPointClick={guardChartCallback(state, onDataPointClick)}
          onMarkupClick={guardChartCallback(state, onMarkupClick)}
          anomalySummary={anomalySummary}
          formatAnomalyAnnouncement={formatAnomalyAnnouncement}
        />
      </ChartAccessGate>
    );
  },
);
PopulationPyramid.displayName = 'PopulationPyramid';

export default PopulationPyramid;
