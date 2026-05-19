'use client';

/**
 * CalendarHeatmap — ECharts `heatmap` series on a `calendar` coordinate
 * system.
 *
 * The GitHub-contributions-style chart: one cell per day, color-mapped by
 * value, laid out as a month/week grid. Distinct from `HeatmapChart`
 * (arbitrary X/Y category matrix) — CalendarHeatmap's coordinate system is
 * always a date calendar.
 *
 * Primary use-case: activity-over-time density (login frequency, ticket
 * volume, commit count) where the day-of-week / week-of-year structure is
 * itself meaningful.
 *
 * @see PR-X16b — Codex thread 019e33a9 plan-time AGREE (ECharts Depth
 *   campaign, second of 5: Tree → Calendar → Polar → ThemeRiver → Gantt).
 */
import React, { useMemo, useCallback, useRef } from 'react';
import type { AccessControlledProps } from '@mfe/shared-types';
import { resolveAccessState } from '@mfe/shared-types';
import { ChartAccessGate } from './access/ChartAccessGate';
import { guardChartCallback } from './access/guardChartCallback';
import { cn } from './utils/cn';
import { resolveCssVarColor } from './utils/resolveCssVarColor';
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

/** Calendar layout direction. */
export type CalendarHeatmapOrient = 'horizontal' | 'vertical';

/** First day of the week. */
export type CalendarWeekStart = 'monday' | 'sunday';

/** One day's value in the calendar. */
export type CalendarHeatmapDataPoint = {
  /** ISO date string `YYYY-MM-DD`. */
  date: string;
  /** Numeric value for that day — drives the cell color. */
  value: number;
};

/**
 * ECharts `calendar.cellSize`. A scalar sizes both axes; a tuple sizes
 * width/height independently; `'auto'` fits to the container.
 */
export type CalendarHeatmapCellSize = number | 'auto' | [number | 'auto', number | 'auto'];

export interface CalendarHeatmapProps extends AccessControlledProps {
  /** Per-day values. Each `date` is an ISO `YYYY-MM-DD` string. */
  data: CalendarHeatmapDataPoint[];
  /**
   * Calendar range — a single year (`'2026'`) or an explicit
   * `[startDate, endDate]` pair. When omitted, the range is derived from
   * the earliest / latest `date` in `data`.
   * @default undefined
   */
  range?: string | [string, string];
  /**
   * Cell size in pixels. `'auto'` fits each cell to the container; a
   * tuple sizes width / height independently.
   * @default 'auto'
   */
  cellSize?: CalendarHeatmapCellSize;
  /**
   * Calendar layout direction.
   * @default 'horizontal'
   */
  orient?: CalendarHeatmapOrient;
  /**
   * First day of the week — `'monday'` or `'sunday'`.
   * @default 'monday'
   */
  startOfWeek?: CalendarWeekStart;
  /**
   * Color gradient endpoints `[low, high]` for the visual map.
   * @default ['#ebedf0', '#3b82f6']
   */
  colors?: [string, string];
  /** Minimum value for the color scale. Auto-detected when omitted. */
  min?: number;
  /** Maximum value for the color scale. Auto-detected when omitted. */
  max?: number;
  /** Show the numeric value inside each cell. @default false */
  showValues?: boolean;
  /** Show the visual-map legend. @default true */
  showVisualMap?: boolean;
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
  /** Canonical cross-filter click callback. */
  onDataPointClick?: (event: ChartClickEvent) => void;
  /** Theme override. @default "auto" */
  theme?: ChartThemePreference;
  /** Decal pattern override. @default "auto" */
  decal?: ChartDecalPreference;
  /** Density override. @default "auto" */
  density?: ChartDensityPreference;
  /**
   * Accent palette override. @default "auto"
   * @remarks CalendarHeatmap's `colors` (low/high gradient) is SEMANTIC
   *   and NOT changed by accent. The prop is accepted for API
   *   consistency; to change the gradient use the `colors` prop.
   */
  accent?: ChartAccentPreference;
  /** Anomaly summary list for SR announcement. */
  anomalySummary?: AnomalySummary[];
  /** Custom anomaly announcement formatter. */
  formatAnomalyAnnouncement?: AnomalyAnnouncementFormatter;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Default GitHub-contributions-style low→high gradient. */
const DEFAULT_COLORS: [string, string] = ['#ebedf0', '#3b82f6'];

/**
 * Stable empty option dispatched while the lazy `calendar` component
 * module is still loading — a module constant (not an inline `{}`) so
 * the renderer's option-update effect does not thrash before
 * {@link useRequiredEChartsFeature} reports ready.
 */
const EMPTY_CALENDAR_OPTION: EChartsOption = {};

/* ------------------------------------------------------------------ */
/*  Helpers (exported for unit tests)                                  */
/* ------------------------------------------------------------------ */

const escapeHtml = (t: string): string =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Normalize the day values into ONE date-sorted array. Both the ECharts
 * `series.data` and the screen-reader a11y table are derived from this
 * single array, so a click event's `dataIndex` maps to the same row in
 * both (dataIndex parity — Codex 019e33a9 must-have).
 *
 * Entries with a missing / non-string `date` are dropped.
 */
export function normalizeCalendarData(
  data: CalendarHeatmapDataPoint[],
): CalendarHeatmapDataPoint[] {
  return [...(data ?? [])]
    .filter(
      (d): d is CalendarHeatmapDataPoint => !!d && typeof d.date === 'string' && d.date.length > 0,
    )
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Single flat row for the screen-reader data table. */
export interface CalendarA11yRow {
  /** ISO date label. */
  label: string;
  /** Numeric value for that day. */
  value: number;
}

/**
 * Flatten the (already date-sorted) calendar data into flat
 * `{label, value}[]` rows for the `useChartA11y` screen-reader table.
 * Order matches `series.data` exactly so the table reads chronologically.
 *
 * @param sorted Output of {@link normalizeCalendarData}.
 */
export function linearizeCalendarForA11y(sorted: CalendarHeatmapDataPoint[]): CalendarA11yRow[] {
  return sorted.map((d) => ({ label: d.date, value: sanitizeNumber(d.value) }));
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const CalendarHeatmapInner = React.forwardRef<
  HTMLDivElement,
  Omit<CalendarHeatmapProps, 'access' | 'accessReason'>
>(function CalendarHeatmapInner(
  {
    data,
    range,
    cellSize = 'auto',
    orient = 'horizontal',
    startOfWeek = 'monday',
    colors = DEFAULT_COLORS,
    min: minProp,
    max: maxProp,
    showValues = false,
    showVisualMap = true,
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
  const isEmpty = !data || data.length === 0;
  const fmt = valueFormatter ?? formatCompact;

  // PR-X16b: the `calendar` coordinate-system component is NOT in the
  // eager ECharts register (bundle headroom — PR-X16b-prep). Lazy-
  // register it on first non-empty mount; the option is held back
  // (`null`) until the feature reports `ready`, and the renderer is
  // gated so `echarts.init()` waits for the layout handlers the
  // `calendar` install registers (Codex thread 019e337e).
  const calendarFeature = useRequiredEChartsFeature('calendar', { enabled: !isEmpty });
  const calendarFeatureReady = calendarFeature.status === 'ready';

  const ownContainerRef = useRef<HTMLDivElement | null>(null);
  const breakpoint = useResponsiveBreakpoint(ownContainerRef);

  // CalendarHeatmap accent-IMMUNE — gradient `colors` are semantic;
  // accent prop accepted for API consistency. effectivePalette ignored.
  const { themeObject, decalEnabled, decalPatterns, densityFontMultiplier } = useChartTheme({
    theme: themePreference,
    decal: decalPreference,
    density: densityPreference,
    accent: accentPreference,
  });

  // ONE date-sorted array — shared by `series.data` and `a11yData` so
  // click `dataIndex` lines up across both (Codex 019e33a9 must-have).
  const normalized = useMemo(() => (isEmpty ? [] : normalizeCalendarData(data)), [data, isEmpty]);

  const option = useMemo((): EChartsOption | null => {
    // Hold the option until BOTH data exists AND the lazy `calendar`
    // component has registered (see `calendarFeature` above).
    if (isEmpty || !calendarFeatureReady || normalized.length === 0) return null;

    const values = normalized.map((d) => sanitizeNumber(d.value));
    const dataMin = minProp ?? Math.min(...values);
    const dataMax = maxProp ?? Math.max(...values);

    // Resolve a consumer `var(--token)` gradient color to a concrete value —
    // the canvas renderer cannot read CSS custom properties. DEFAULT_COLORS
    // is already hex, so this is a no-op for the default.
    const gradientColors: [string, string] = [
      resolveCssVarColor(colors[0]),
      resolveCssVarColor(colors[1]),
    ];

    // `range` is optional — derive a safe [start, end] from the data
    // span when the consumer omits it (Codex 019e33a9 must-have).
    const effectiveRange: string | [string, string] = range ?? [
      normalized[0].date,
      normalized[normalized.length - 1].date,
    ];

    // ECharts calendar-heatmap wire format: [dateString, value].
    const seriesData: [string, number][] = normalized.map((d) => [d.date, sanitizeNumber(d.value)]);

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
          }
        : undefined,
      tooltip: {
        trigger: 'item',
        confine: true,
        formatter: (params: { data?: [string, number] }) => {
          const cell = params.data;
          if (!Array.isArray(cell) || cell.length < 2) return '';
          const [date, val] = cell;
          return `${escapeHtml(String(date))}<br/><strong>${escapeHtml(
            fmt(sanitizeNumber(val)),
          )}</strong>`;
        },
      },
      calendar: {
        range: effectiveRange,
        cellSize,
        orient,
        // Generous margins so month / day labels and the visualMap don't
        // collide with the calendar grid.
        top: title ? 70 : 40,
        left: 40,
        right: 40,
        bottom: showVisualMap ? 56 : 24,
        dayLabel: {
          // ECharts `firstDay`: 0 = Sunday, 1 = Monday.
          firstDay: startOfWeek === 'monday' ? 1 : 0,
          fontSize: scaleFontSize(11, densityFontMultiplier),
        },
        monthLabel: {
          fontSize: scaleFontSize(11, densityFontMultiplier),
        },
        yearLabel: { show: false },
        splitLine: {
          show: true,
          lineStyle: { color: 'var(--border-subtle, #d1d5db)', width: 1 },
        },
        itemStyle: {
          borderColor: 'var(--surface-canvas, #ffffff)',
          borderWidth: 1,
        },
      },
      visualMap: {
        // visualMap is a MANDATORY render contract for a `heatmap`
        // series — ECharts dev mode throws without it. When the legend
        // is hidden the component still exists, only `show` is false.
        min: dataMin,
        max: dataMax,
        calculable: true,
        show: showVisualMap,
        orient: 'horizontal' as const,
        left: 'center',
        bottom: 12,
        inRange: { color: gradientColors },
        textStyle: { fontSize: scaleFontSize(11, densityFontMultiplier) },
      },
      series: [
        {
          type: 'heatmap' as const,
          coordinateSystem: 'calendar' as const,
          data: seriesData,
          label: {
            show: showValues,
            fontSize: scaleFontSize(9, densityFontMultiplier),
            formatter: (params: { value: [string, number] }) =>
              escapeHtml(fmt(sanitizeNumber(params.value[1]))),
          },
          emphasis: {
            itemStyle: {
              borderColor: '#333',
              borderWidth: 1.5,
              shadowBlur: 6,
              shadowColor: 'rgba(0,0,0,0.25)',
            },
          },
          cursor: onDataPointClick ? 'pointer' : 'default',
        },
      ],
      aria: {
        enabled: true,
        label: {
          description: title ? `Calendar heatmap: ${escapeHtml(title)}` : 'Calendar heatmap',
        },
        ...(decalEnabled ? { decal: { show: true, decals: decalPatterns } } : {}),
      },
    } as EChartsOption;
  }, [
    normalized,
    range,
    cellSize,
    orient,
    startOfWeek,
    colors,
    minProp,
    maxProp,
    showValues,
    showVisualMap,
    animate,
    title,
    description,
    fmt,
    isEmpty,
    calendarFeatureReady,
    decalEnabled,
    decalPatterns,
    densityFontMultiplier,
    breakpoint,
    onDataPointClick,
  ]);

  const handleClick = useCallback(
    (params: unknown) => {
      if (!onDataPointClick) return;
      const p = params as { data?: [string, number]; dataIndex?: number };
      if (!Array.isArray(p.data) || p.data.length < 2) return;
      const [date, value] = p.data;
      const numericValue = typeof value === 'number' && Number.isFinite(value) ? value : 0;
      onDataPointClick({
        datum: {
          kind: 'calendar-cell',
          date: String(date),
          value: numericValue,
          label: String(date),
        },
        value: numericValue,
        label: String(date),
      });
    },
    [onDataPointClick],
  );

  const { containerRef, instance } = useEChartsRenderer({
    // Gate echarts.init() until the lazy `calendar` component has
    // registered — ECharts snapshots its layout handler list at init.
    enabled: calendarFeatureReady,
    option: option ?? EMPTY_CALENDAR_OPTION,
    theme: themeObject,
    respectReducedMotion: true,
    onClick: onDataPointClick ? handleClick : undefined,
  });

  // A11y — chronological day rows from the SAME normalized array as
  // `series.data` (dataIndex parity).
  const a11yData = useMemo(() => linearizeCalendarForA11y(normalized), [normalized]);
  const a11y = useChartA11y({
    chartType: 'heatmap',
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
        data-testid="calendar-heatmap-empty"
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
      testId="calendar-heatmap"
      setRefs={setRefs}
      anomalySummary={anomalySummary}
      formatAnomalyAnnouncement={formatAnomalyAnnouncement}
      {...rest}
    />
  );
});

CalendarHeatmapInner.displayName = 'CalendarHeatmapInner';

/**
 * CalendarHeatmap — public wrapper. Accepts `access` / `accessReason`
 * (`AccessControlledProps`) and forwards everything else to
 * `CalendarHeatmapInner`. Mirrors the canonical BarChart / GraphChart
 * access-gate wiring: `resolveAccessState` resolves once, the click
 * callback is guarded with `guardChartCallback(state, ...)`.
 */
export const CalendarHeatmap = React.forwardRef<HTMLDivElement, CalendarHeatmapProps>(
  function CalendarHeatmap(
    { access, accessReason, onDataPointClick, anomalySummary, formatAnomalyAnnouncement, ...rest },
    ref,
  ) {
    const { state } = resolveAccessState(access);
    return (
      <ChartAccessGate access={access} accessReason={accessReason}>
        <CalendarHeatmapInner
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
CalendarHeatmap.displayName = 'CalendarHeatmap';

export default CalendarHeatmap;
