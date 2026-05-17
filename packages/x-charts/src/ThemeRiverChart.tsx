'use client';

/**
 * ThemeRiverChart — ECharts `themeRiver` series (stream graph) on a
 * `singleAxis` time coordinate system.
 *
 * A stream graph: each category is a flowing band whose thickness over
 * time encodes its value; the bands stack into a "river" that makes
 * relative composition-over-time legible at a glance. Use-case:
 * category volume / share evolving across a time series (traffic by
 * channel, tickets by type, spend by department).
 *
 * SCOPE (v1) — the single axis is always `type: 'time'`; the data
 * contract is one `{ date, value, category }` observation per cell.
 * `normalizeThemeRiverData` collapses the input into a deterministic
 * DENSE `date × category` matrix (missing cells = 0, duplicate
 * `(date, category)` pairs summed), so the array handed to ECharts is
 * exactly what its internal `themeRiver` `fixData()` sparse-expansion
 * would produce — keeping the data wrapper-owned. A `value`/`category`
 * single axis is a different data contract, deferred.
 *
 * The `themeRiver` series + the `singleAxis` coordinate system are NOT
 * in the eager ECharts register (CONTRACT §8 bundle headroom). They are
 * lazy-registered together on first non-empty mount via a two-module
 * loader in `renderers/registerEChartsFeature.ts`.
 *
 * @see PR-X16d — Codex thread 019e3615 plan-time AGREE (ECharts Depth
 *   campaign, fourth of 5: Tree → Calendar → Polar → ThemeRiver → Gantt).
 */
import React, { useMemo, useCallback, useRef } from 'react';
import type { AccessControlledProps } from '@mfe/shared-types';
import { resolveAccessState } from '@mfe/shared-types';
import { ChartAccessGate } from './access/ChartAccessGate';
import { guardChartCallback } from './access/guardChartCallback';
import { cn } from './utils/cn';
import { useEChartsRenderer, useRequiredEChartsFeature } from './renderers';
import { useResponsiveBreakpoint } from './useResponsiveChart';
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
import { sanitizeNumber } from './utils/data-validation';
import type { EChartsOption } from './renderers/echarts-imports';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ChartSize = 'sm' | 'md' | 'lg';

export type { ChartClickEvent } from './types';
import type { ChartClickEvent as ChartClickEventCanonical } from './types';
type ChartClickEvent = ChartClickEventCanonical;

/**
 * One `(date, category, value)` observation for the stream graph. The
 * normalized form is a dense `date × category` matrix — see
 * {@link normalizeThemeRiverData}.
 */
export type ThemeRiverDataPoint = {
  /**
   * Time key — a parseable date string (ISO `YYYY-MM-DD` recommended).
   * Rows whose `date` does not parse are dropped.
   */
  date: string;
  /** Numeric band thickness at that time. Negative values clamp to 0. */
  value: number;
  /** Category name — one flowing band of the stream graph. */
  category: string;
};

export interface ThemeRiverChartProps extends AccessControlledProps {
  /**
   * Per-`(date, category)` observations. Order is irrelevant — the data
   * is normalized into a dense, date-sorted `date × category` matrix;
   * duplicate `(date, category)` pairs are summed.
   */
  data: ThemeRiverDataPoint[];
  /** Show the category-name label on each flow band. @default true */
  showLabel?: boolean;
  /** Visual size variant. @default "md" */
  size?: ChartSize;
  /** Animate on mount. @default true */
  animate?: boolean;
  /** Chart title. */
  title?: string;
  /** Accessible description. */
  description?: string;
  /** Additional class name. */
  className?: string;
  /** Custom formatter for displayed values (tooltip + a11y table). */
  valueFormatter?: (v: number) => string;
  /**
   * Canonical cross-filter click callback. ThemeRiver click resolves to
   * the CATEGORY band (`kind: 'theme-river-category'`) — ECharts only
   * surfaces a layer-level click on a stream band, not a single
   * `(date, value)` point.
   */
  onDataPointClick?: (event: ChartClickEvent) => void;
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
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/**
 * Fallback categorical palette — used when the theme resolves no accent
 * palette. One colour per stream band. Mirrors RadarChart / PolarChart.
 */
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

/**
 * Stable empty option dispatched while the lazy `themeRiver` /
 * `singleAxis` modules are still loading — a module constant (not an
 * inline `{}`) so the renderer's option-update effect does not thrash
 * before {@link useRequiredEChartsFeature} reports ready.
 */
const EMPTY_THEMERIVER_OPTION: EChartsOption = {};

/* ------------------------------------------------------------------ */
/*  Helpers (exported for unit tests)                                  */
/* ------------------------------------------------------------------ */

const escapeHtml = (t: string): string =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Normalize the input into ONE deterministic dense `date × category`
 * matrix:
 *
 *   1. Drop rows with a missing / non-string / empty (or unparseable)
 *      `date`, or a missing / empty `category`.
 *   2. Clamp each `value` to `Math.max(0, sanitizeNumber(value))` — a
 *      stream band thickness is non-negative.
 *   3. Sum duplicate `(date, category)` pairs (stream / volume
 *      semantics).
 *   4. Emit a dense matrix: distinct dates ascending (by parsed
 *      timestamp) × distinct categories (first-appearance order), every
 *      missing cell filled `value: 0`.
 *
 * Feeding this dense matrix as `series.data` means ECharts' internal
 * `themeRiver` `fixData()` sparse-expansion is a no-op, so the array
 * ECharts indexes is exactly this one — the a11y table and the tooltip
 * stay wrapper-owned (Codex thread 019e3615).
 */
export function normalizeThemeRiverData(data: ThemeRiverDataPoint[]): ThemeRiverDataPoint[] {
  // Nested map `date -> (category -> summed value)` — a structured key,
  // so no separator char is needed and a `(date, category)` pair can
  // never collide regardless of what characters either string contains.
  const cells = new Map<string, Map<string, number>>();
  const dates: string[] = [];
  const categories: string[] = [];
  const catSeen = new Set<string>();

  for (const d of data ?? []) {
    if (!d || typeof d.date !== 'string' || typeof d.category !== 'string') continue;
    const date = d.date.trim();
    const category = d.category.trim();
    if (date.length === 0 || category.length === 0) continue;
    if (Number.isNaN(Date.parse(date))) continue;

    let row = cells.get(date);
    if (!row) {
      row = new Map<string, number>();
      cells.set(date, row);
      dates.push(date);
    }
    if (!catSeen.has(category)) {
      catSeen.add(category);
      categories.push(category);
    }
    const value = Math.max(0, sanitizeNumber(d.value));
    row.set(category, (row.get(category) ?? 0) + value);
  }

  // Dates ascending by PARSED timestamp (not string compare — tolerates
  // non-ISO-normalized but parseable date strings). Categories keep
  // first-appearance order.
  dates.sort((a, b) => Date.parse(a) - Date.parse(b));

  const dense: ThemeRiverDataPoint[] = [];
  for (const date of dates) {
    const row = cells.get(date);
    for (const category of categories) {
      dense.push({ date, value: row?.get(category) ?? 0, category });
    }
  }
  return dense;
}

/** Single flat row for the screen-reader data table. */
export interface ThemeRiverA11yRow {
  /** `"<date> · <category>"` label. */
  label: string;
  /** Numeric value for that cell. */
  value: number;
}

/**
 * Flatten the (already dense) normalized matrix into flat
 * `{label, value}[]` rows for the `useChartA11y` screen-reader table —
 * one row per `date × category` cell, in matrix order.
 *
 * @param dense Output of {@link normalizeThemeRiverData}.
 */
export function linearizeThemeRiverForA11y(dense: ThemeRiverDataPoint[]): ThemeRiverA11yRow[] {
  return dense.map((d) => ({ label: `${d.date} · ${d.category}`, value: d.value }));
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const ThemeRiverChartInner = React.forwardRef<
  HTMLDivElement,
  Omit<ThemeRiverChartProps, 'access' | 'accessReason'>
>(function ThemeRiverChartInner(
  {
    data,
    showLabel = true,
    size = 'md',
    animate = true,
    title,
    description,
    className,
    valueFormatter,
    onDataPointClick,
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
  const fmt = valueFormatter ?? formatCompact;

  const ownContainerRef = useRef<HTMLDivElement | null>(null);
  const breakpoint = useResponsiveBreakpoint(ownContainerRef);

  // ONE dense `date × category` matrix — drives `series.data` and the
  // a11y table. `isEmpty` is derived from it: no valid rows, OR every
  // cell is 0 (all-zero / all-negative-clamped input), so the lazy
  // `themeRiver` chunk is never fetched for an unrenderable dataset
  // (Codex thread 019e3615 iter-2).
  const dense = useMemo(() => normalizeThemeRiverData(data), [data]);
  const isEmpty = dense.length === 0 || dense.every((d) => d.value === 0);

  // PR-X16d: the `themeRiver` series + `singleAxis` coordinate system
  // are NOT eager-registered. Lazy-register both on first non-empty
  // mount; the option is held back (`null`) until the feature reports
  // `ready`, and the renderer is gated so `echarts.init()` waits for the
  // layout handlers the two modules install (Codex thread 019e337e).
  const themeRiverFeature = useRequiredEChartsFeature('themeRiver', { enabled: !isEmpty });
  const themeRiverFeatureReady = themeRiverFeature.status === 'ready';

  const { themeObject, decalEnabled, decalPatterns, densityFontMultiplier, effectivePalette } =
    useChartTheme({
      theme: themePreference,
      decal: decalPreference,
      density: densityPreference,
      accent: accentPreference,
    });

  // Distinct category band names (first-appearance order) — the click
  // handler validates the clicked band against this set.
  const categories = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const d of dense) {
      if (!seen.has(d.category)) {
        seen.add(d.category);
        out.push(d.category);
      }
    }
    return out;
  }, [dense]);

  const option = useMemo((): EChartsOption | null => {
    // Hold the option until BOTH renderable data exists AND the lazy
    // `themeRiver` / `singleAxis` modules have registered.
    if (isEmpty || !themeRiverFeatureReady) return null;

    const palette = effectivePalette ?? DEFAULT_PALETTE;
    // ECharts themeRiver wire format: [dateString, value, category].
    const seriesData: [string, number, string][] = dense.map((d) => [d.date, d.value, d.category]);

    return {
      animation: animate,
      animationDuration: animate ? 500 : 0,
      animationEasing: 'cubicOut',
      // themeRiver paints one band per category from the option palette.
      color: palette,
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
        // `axis` is the natural ThemeRiver tooltip mode — it shows every
        // band's value at the hovered time. The formatter reads each
        // param's `value` tuple (reliable: the fed matrix is dense, so
        // ECharts' `fixData()` does not re-index) — Codex thread 019e3615.
        trigger: 'axis',
        confine: true,
        formatter: (params: unknown) => {
          const rows = (Array.isArray(params) ? params : [params]) as Array<{
            value?: unknown;
            marker?: string;
          }>;
          const lines: string[] = [];
          let date = '';
          for (const r of rows) {
            const v = r.value;
            if (!Array.isArray(v) || v.length < 3) continue;
            if (date === '') date = String(v[0]);
            const marker = typeof r.marker === 'string' ? r.marker : '';
            lines.push(
              `${marker}${escapeHtml(String(v[2]))}: <strong>${escapeHtml(
                fmt(sanitizeNumber(v[1] as number)),
              )}</strong>`,
            );
          }
          if (lines.length === 0) return '';
          return `${escapeHtml(date)}<br/>${lines.join('<br/>')}`;
        },
      },
      singleAxis: {
        type: 'time',
        top: title ? 64 : 40,
        bottom: 40,
        left: breakpoint === 'mobile' ? 38 : 50,
        right: 40,
        axisLabel: {
          fontSize: scaleFontSize(11, densityFontMultiplier),
          color: 'var(--text-secondary, #666)',
        },
        axisLine: { lineStyle: { color: 'var(--border-subtle, #d1d5db)' } },
        axisPointer: {
          show: true,
          type: 'line',
          lineStyle: { color: 'var(--border-strong, #9ca3af)', opacity: 0.6 },
          label: { show: false },
        },
      },
      series: [
        {
          type: 'themeRiver',
          coordinateSystem: 'singleAxis',
          data: seriesData,
          label: {
            show: showLabel,
            fontSize: scaleFontSize(11, densityFontMultiplier),
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 12,
              shadowColor: 'rgba(0,0,0,0.3)',
            },
          },
          cursor: onDataPointClick ? 'pointer' : 'default',
        },
      ],
      aria: {
        enabled: true,
        label: {
          description: title ? `Stream graph: ${escapeHtml(title)}` : 'Stream graph',
        },
        ...(decalEnabled ? { decal: { show: true, decals: decalPatterns } } : {}),
      },
    } as EChartsOption;
  }, [
    dense,
    isEmpty,
    themeRiverFeatureReady,
    effectivePalette,
    animate,
    title,
    description,
    showLabel,
    fmt,
    densityFontMultiplier,
    decalEnabled,
    decalPatterns,
    breakpoint,
    onDataPointClick,
  ]);

  const handleClick = useCallback(
    (params: unknown) => {
      if (!onDataPointClick) return;
      // ThemeRiver surfaces a click at the CATEGORY band (layer) level,
      // not a single `(date, value)` point — emitting a point-level
      // datum would be misleading (Codex thread 019e3615 iter-1). Resolve
      // the band name from `params.name`, falling back to the data
      // tuple's category slot, and validate it against the known bands.
      const p = params as { name?: unknown; value?: unknown };
      let category: string | undefined;
      if (typeof p.name === 'string' && categories.includes(p.name)) {
        category = p.name;
      } else if (
        Array.isArray(p.value) &&
        typeof p.value[2] === 'string' &&
        categories.includes(p.value[2])
      ) {
        category = p.value[2];
      }
      if (!category) return;
      onDataPointClick({
        datum: { kind: 'theme-river-category', category, label: category },
        label: category,
      });
    },
    [onDataPointClick, categories],
  );

  const { containerRef, instance } = useEChartsRenderer({
    // Gate echarts.init() until the lazy `themeRiver` + `singleAxis`
    // modules have registered — ECharts snapshots its layout handler
    // list at init.
    enabled: themeRiverFeatureReady,
    option: option ?? EMPTY_THEMERIVER_OPTION,
    theme: themeObject,
    respectReducedMotion: true,
    onClick: onDataPointClick ? handleClick : undefined,
  });

  // A11y — one row per dense `date × category` cell, matrix order.
  const a11yData = useMemo(() => linearizeThemeRiverForA11y(dense), [dense]);
  const a11y = useChartA11y({
    chartType: 'themeRiver',
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
        data-testid="theme-river-chart-empty"
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
      testId="theme-river-chart"
      setRefs={setRefs}
      anomalySummary={anomalySummary}
      formatAnomalyAnnouncement={formatAnomalyAnnouncement}
      {...rest}
    />
  );
});

ThemeRiverChartInner.displayName = 'ThemeRiverChartInner';

/**
 * ThemeRiverChart — public wrapper. Accepts `access` / `accessReason`
 * (`AccessControlledProps`) and forwards everything else to
 * `ThemeRiverChartInner`. Mirrors the canonical BarChart / PolarChart
 * access-gate wiring: `resolveAccessState` resolves once, the click
 * callback is guarded with `guardChartCallback(state, ...)`.
 */
export const ThemeRiverChart = React.forwardRef<HTMLDivElement, ThemeRiverChartProps>(
  function ThemeRiverChart(
    { access, accessReason, onDataPointClick, anomalySummary, formatAnomalyAnnouncement, ...rest },
    ref,
  ) {
    const { state } = resolveAccessState(access);
    return (
      <ChartAccessGate access={access} accessReason={accessReason}>
        <ThemeRiverChartInner
          ref={ref}
          {...rest}
          onDataPointClick={guardChartCallback(state, onDataPointClick)}
          anomalySummary={anomalySummary}
          formatAnomalyAnnouncement={formatAnomalyAnnouncement}
        />
      </ChartAccessGate>
    );
  },
);
ThemeRiverChart.displayName = 'ThemeRiverChart';

export default ThemeRiverChart;
