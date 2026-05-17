'use client';

/**
 * GanttChart — an ECharts `custom` (renderItem-driven) series rendering
 * a project / schedule timeline.
 *
 * Each task is a horizontal bar: it spans `[start, end]` on a `time`
 * x-axis and sits on its lane's row of a `category` y-axis. Use-case:
 * project schedules, release timelines, resource booking — anything
 * with named work items that occupy a span of time.
 *
 * SCOPE (v1) — the x-axis is always `type: 'time'`; the data contract
 * is one `{ name, start, end, category? }` task per bar.
 *   - `category` is the lane key. Omit it and the task's own `name`
 *     becomes the lane, so distinct task names each get their own row
 *     and two tasks that share a `name` with no `category` DELIBERATELY
 *     land on the same lane (a swimlane).
 *   - A task needs a strictly positive span (`end` after `start`);
 *     zero-duration milestones are intentionally deferred.
 *   - The bar carries no on-bar text label — the y-axis lane label, the
 *     tooltip and the a11y table carry the task name. On-bar labels are
 *     a future enhancement (Codex thread 019e365b iter-1).
 *
 * The `custom` series is NOT in the eager ECharts register (CONTRACT §8
 * bundle headroom). It is lazy-registered on first non-empty mount via
 * `renderers/registerEChartsFeature.ts`; the cartesian grid + the time /
 * category axes it draws into stay eager (the `GridComponent`).
 *
 * @see PR-X16e — Codex thread 019e365b plan-time AGREE (ECharts Depth
 *   campaign, fifth and FINAL of 5: Tree → Calendar → Polar →
 *   ThemeRiver → Gantt).
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
import type { EChartsOption } from './renderers/echarts-imports';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ChartSize = 'sm' | 'md' | 'lg';

export type { ChartClickEvent } from './types';
import type { ChartClickEvent as ChartClickEventCanonical } from './types';
type ChartClickEvent = ChartClickEventCanonical;

/**
 * One scheduled task — a single bar on the Gantt timeline.
 */
export type GanttTask = {
  /** Optional stable id — forwarded verbatim in the click payload. */
  id?: string;
  /** Task label — shown in the tooltip and the a11y data table. */
  name: string;
  /**
   * Lane / row key. Tasks sharing a resolved `category` stack on ONE
   * y-axis row (a swimlane). Omit it and the task's own `name` becomes
   * the lane — so by default every distinct task name is its own row,
   * and two tasks that share a `name` with no `category` DELIBERATELY
   * land on the same lane.
   */
  category?: string;
  /** Start time — a parseable date string (ISO `YYYY-MM-DD` recommended). */
  start: string;
  /** End time — a parseable date string. Must be strictly after `start`. */
  end: string;
};

/**
 * A task after {@link normalizeGanttData}: `start` / `end` resolved to
 * epoch-millisecond numbers, `category` resolved to its lane, `name`
 * and `category` trimmed.
 */
export interface NormalizedGanttTask {
  /** Stable id — present only when the input task carried a non-empty one. */
  id?: string;
  /** Trimmed task label. */
  name: string;
  /** Trimmed lane key (the `category`, or the `name` when omitted). */
  category: string;
  /** Start time in epoch milliseconds. */
  startMs: number;
  /** End time in epoch milliseconds (always `> startMs`). */
  endMs: number;
}

export interface GanttChartProps extends AccessControlledProps {
  /**
   * Scheduled tasks. Order is preserved after invalid rows are dropped;
   * a surviving task's filtered index is its `dataIndex`.
   */
  data: GanttTask[];
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
  /**
   * Custom formatter for the displayed task duration (tooltip + a11y
   * table). Receives the duration in DAYS.
   */
  valueFormatter?: (v: number) => string;
  /**
   * Canonical cross-filter click callback. A Gantt click resolves to
   * the task bar (`kind: 'gantt-task'`) — each bar is one data point.
   * The `dataIndex` is the index into the NORMALIZED task list (after
   * invalid rows are dropped), NOT the original input array.
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
 * palette. One colour per lane. Mirrors PolarChart / ThemeRiverChart.
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
 * Stable empty option dispatched while the lazy `custom` series module
 * is still loading — a module constant (not an inline `{}`) so the
 * renderer's option-update effect does not thrash before
 * {@link useRequiredEChartsFeature} reports ready.
 */
const EMPTY_GANTT_OPTION: EChartsOption = {};

/** Bar height as a fraction of one category-row's pixel height. */
const BAR_HEIGHT_RATIO = 0.6;
/** Minimum rendered bar width (px) so a very short task stays visible. */
const MIN_BAR_WIDTH_PX = 3;
/** Bar corner radius (px). */
const BAR_CORNER_RADIUS = 2;
/** Milliseconds in one day — task duration is reported in days. */
const MS_PER_DAY = 86_400_000;

/* ------------------------------------------------------------------ */
/*  Helpers (exported for unit tests)                                  */
/* ------------------------------------------------------------------ */

const escapeHtml = (t: string): string =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Epoch milliseconds → `YYYY-MM-DD` for tooltip display. */
const formatDate = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/**
 * Normalize raw tasks into ONE deterministic `NormalizedGanttTask[]`:
 *
 *   1. Drop a row that is not an object, has a missing / non-string /
 *      blank `name`, or a `start` / `end` that is not a parseable date
 *      string.
 *   2. Resolve `start` / `end` to epoch milliseconds (`Date.parse`).
 *   3. Drop a row whose span is not strictly positive (`endMs <= startMs`)
 *      — a zero-duration milestone is intentionally out of v1 scope.
 *   4. Resolve the lane: the trimmed `category` when non-blank, else the
 *      trimmed `name`.
 *
 * Filtered INPUT ORDER is preserved — a surviving task's index is its
 * `dataIndex`, shared by `series.data`, the click payload and the a11y
 * table (dataIndex parity).
 */
export function normalizeGanttData(data: GanttTask[]): NormalizedGanttTask[] {
  const out: NormalizedGanttTask[] = [];
  for (const t of data ?? []) {
    if (!t || typeof t.name !== 'string') continue;
    const name = t.name.trim();
    if (name.length === 0) continue;
    if (typeof t.start !== 'string' || typeof t.end !== 'string') continue;
    const startMs = Date.parse(t.start);
    const endMs = Date.parse(t.end);
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) continue;
    if (endMs <= startMs) continue;
    const category =
      typeof t.category === 'string' && t.category.trim().length > 0 ? t.category.trim() : name;
    out.push({
      ...(typeof t.id === 'string' && t.id.length > 0 ? { id: t.id } : {}),
      name,
      category,
      startMs,
      endMs,
    });
  }
  return out;
}

/**
 * Distinct lane names in first-appearance order — the y-axis category
 * list. A task's bar sits on `ganttCategories(tasks).indexOf(category)`.
 *
 * @param tasks Output of {@link normalizeGanttData}.
 */
export function ganttCategories(tasks: NormalizedGanttTask[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tasks) {
    if (!seen.has(t.category)) {
      seen.add(t.category);
      out.push(t.category);
    }
  }
  return out;
}

/** Single flat row for the screen-reader data table. */
export interface GanttA11yRow {
  /** Task label — `"<lane> · <name>"` when the lane differs from name. */
  label: string;
  /** Task duration in days. */
  value: number;
}

/**
 * Flatten the normalized tasks into flat `{label, value}[]` rows for the
 * `useChartA11y` screen-reader table — one row per task, in `dataIndex`
 * order. `value` is the task duration in days.
 *
 * @param tasks Output of {@link normalizeGanttData}.
 */
export function linearizeGanttForA11y(tasks: NormalizedGanttTask[]): GanttA11yRow[] {
  return tasks.map((t) => ({
    label: t.category === t.name ? t.name : `${t.category} · ${t.name}`,
    value: (t.endMs - t.startMs) / MS_PER_DAY,
  }));
}

/* ------------------------------------------------------------------ */
/*  renderItem — the `custom` series bar painter                       */
/* ------------------------------------------------------------------ */

/**
 * ECharts `custom` series `renderItem` API — a minimal structural
 * subset of ECharts' `CustomSeriesRenderItemAPI`, declared locally so
 * the wrapper does not deep-import ECharts' internal type surface.
 */
interface GanttRenderItemApi {
  /** Raw numeric value at the given data dimension of the current item. */
  value(dimension: number): number;
  /** Convert `[xValue, yValue]` data coords to `[xPx, yPx]` pixels. */
  coord(point: [number, number]): [number, number];
  /** Pixel size of a `[xSpan, ySpan]` data span. */
  size(span: [number, number]): [number, number];
  /** Resolved item style (carries the per-item `itemStyle.color` fill). */
  style(): Record<string, unknown>;
}

/** The `rect` graphic element {@link renderGanttBar} returns. */
export interface GanttRectElement {
  type: 'rect';
  shape: { x: number; y: number; width: number; height: number; r: number };
  style: Record<string, unknown>;
}

/**
 * `custom` series `renderItem` — paints ONE Gantt task bar.
 *
 * A task's data item is `value: [categoryIndex, startMs, endMs]`. The
 * bar spans `[startMs, endMs]` on the `time` x-axis and is vertically
 * centred on its category row:
 *   - `api.coord([ms, categoryIndex])` resolves the pixel anchor.
 *   - `api.size([0, 1])[1]` is one category row's pixel height; the bar
 *     takes {@link BAR_HEIGHT_RATIO} of it.
 *   - `Math.min` / `Math.abs` keep the rect well-formed even if the two
 *     pixel x-coords come back reversed (defensive — v1 never inverts
 *     the x-axis).
 *   - {@link MIN_BAR_WIDTH_PX} keeps a very short task visible; the
 *     series sets `clip: true`, so a min-width bar at the right edge is
 *     clipped to the grid instead of overflowing (Codex thread
 *     019e365b iter-1).
 *
 * Exported as a PURE function so a unit test can drive it with a fake
 * `api` — NOT re-exported from the package barrel (internal test seam,
 * mirroring the 3D `buildScatter3DOption` discipline).
 */
export function renderGanttBar(_params: unknown, api: GanttRenderItemApi): GanttRectElement {
  const categoryIndex = api.value(0);
  const startPx = api.coord([api.value(1), categoryIndex]);
  const endPx = api.coord([api.value(2), categoryIndex]);
  const barHeight = api.size([0, 1])[1] * BAR_HEIGHT_RATIO;
  const width = Math.max(Math.abs(endPx[0] - startPx[0]), MIN_BAR_WIDTH_PX);
  return {
    type: 'rect',
    shape: {
      x: Math.min(startPx[0], endPx[0]),
      y: startPx[1] - barHeight / 2,
      width,
      height: barHeight,
      r: BAR_CORNER_RADIUS,
    },
    style: api.style(),
  };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const GanttChartInner = React.forwardRef<
  HTMLDivElement,
  Omit<GanttChartProps, 'access' | 'accessReason'>
>(function GanttChartInner(
  {
    data,
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

  // ONE normalized task list — drives `series.data`, the a11y table and
  // the click payload (dataIndex parity). `isEmpty` is derived from it:
  // an input whose every row is invalid collapses to empty here, so the
  // lazy `custom` chunk is never fetched for unrenderable data.
  const tasks = useMemo(() => normalizeGanttData(data), [data]);
  const isEmpty = tasks.length === 0;

  // Distinct lane names (first-appearance order) — the y-axis category
  // list; a task's bar sits on `categories.indexOf(task.category)`.
  const categories = useMemo(() => ganttCategories(tasks), [tasks]);

  // PR-X16e: the `custom` series is NOT eager-registered (bundle
  // headroom). Lazy-register it on first non-empty mount; the option is
  // held back (`null`) until the feature reports `ready`, and the
  // renderer is gated so `echarts.init()` waits for the custom series
  // install (Codex thread 019e337e renderer-gate pattern).
  const customFeature = useRequiredEChartsFeature('custom', { enabled: !isEmpty });
  const customFeatureReady = customFeature.status === 'ready';

  const { themeObject, decalEnabled, decalPatterns, densityFontMultiplier, effectivePalette } =
    useChartTheme({
      theme: themePreference,
      decal: decalPreference,
      density: densityPreference,
      accent: accentPreference,
    });

  const option = useMemo((): EChartsOption | null => {
    // Hold the option until BOTH renderable data exists AND the lazy
    // `custom` series module has registered.
    if (isEmpty || !customFeatureReady) return null;

    const palette = effectivePalette ?? DEFAULT_PALETTE;

    // Tight time domain — the earliest start and the latest end across
    // every task (a plain loop, not `Math.min(...spread)`, so a large
    // task list never overflows the call stack).
    let minStartMs = Infinity;
    let maxEndMs = -Infinity;
    for (const t of tasks) {
      if (t.startMs < minStartMs) minStartMs = t.startMs;
      if (t.endMs > maxEndMs) maxEndMs = t.endMs;
    }

    // One custom-series data item per task:
    //   value:     [categoryIndex, startMs, endMs]  (renderItem dims)
    //   itemStyle: per-task fill, coloured by its lane index
    const seriesData = tasks.map((t) => {
      const categoryIndex = categories.indexOf(t.category);
      return {
        value: [categoryIndex, t.startMs, t.endMs],
        itemStyle: { color: palette[categoryIndex % palette.length] },
      };
    });

    return {
      animation: animate,
      animationDuration: animate ? 500 : 0,
      animationEasing: 'cubicOut',
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
        trigger: 'item',
        confine: true,
        formatter: (params: { dataIndex?: number }) => {
          // Resolve via `dataIndex` into the normalized task list — the
          // wrapper, not ECharts' raw `params`, owns the semantic task.
          const task = typeof params.dataIndex === 'number' ? tasks[params.dataIndex] : undefined;
          if (!task) return '';
          const lines = [`<strong>${escapeHtml(task.name)}</strong>`];
          if (task.category !== task.name) lines.push(escapeHtml(task.category));
          lines.push(
            `${escapeHtml(formatDate(task.startMs))} → ${escapeHtml(formatDate(task.endMs))}`,
          );
          lines.push(escapeHtml(fmt((task.endMs - task.startMs) / MS_PER_DAY)));
          return lines.join('<br/>');
        },
      },
      grid: {
        left: breakpoint === 'mobile' ? 8 : 16,
        right: breakpoint === 'mobile' ? 16 : 28,
        top: title ? 64 : 28,
        bottom: 32,
        // Auto-expand the grid so the lane (category) labels — which can
        // be long task names — are never clipped.
        containLabel: true,
      },
      xAxis: {
        type: 'time',
        min: minStartMs,
        max: maxEndMs,
        axisLabel: {
          fontSize: scaleFontSize(11, densityFontMultiplier),
          color: 'var(--text-secondary, #666)',
        },
        axisLine: { lineStyle: { color: 'var(--border-subtle, #d1d5db)' } },
        splitLine: {
          show: true,
          lineStyle: { color: 'var(--border-subtle, #d1d5db)' },
        },
      },
      yAxis: {
        type: 'category',
        data: categories,
        // First lane at the TOP — Gantt rows read top-to-bottom.
        inverse: true,
        axisLabel: {
          fontSize: scaleFontSize(11, densityFontMultiplier),
          color: 'var(--text-secondary, #666)',
        },
        axisLine: { lineStyle: { color: 'var(--border-subtle, #d1d5db)' } },
        axisTick: { show: false },
      },
      series: [
        {
          type: 'custom',
          // `custom` series default `clip: false` — turn it ON so a
          // MIN_BAR_WIDTH_PX bar at the right edge is clipped to the
          // grid rather than overflowing (Codex thread 019e365b iter-1).
          clip: true,
          renderItem: renderGanttBar,
          // Bind data dims 1 + 2 to the x-axis, dim 0 to the y-axis so
          // ECharts computes the axis extents + axis-pointer metadata.
          encode: { x: [1, 2], y: 0 },
          data: seriesData,
          emphasis: {
            itemStyle: {
              shadowBlur: 8,
              shadowColor: 'rgba(0,0,0,0.3)',
            },
          },
          cursor: onDataPointClick ? 'pointer' : 'default',
        },
      ],
      aria: {
        enabled: true,
        label: {
          description: title ? `Gantt chart: ${escapeHtml(title)}` : 'Gantt chart',
        },
        ...(decalEnabled ? { decal: { show: true, decals: decalPatterns } } : {}),
      },
    } as EChartsOption;
  }, [
    tasks,
    categories,
    isEmpty,
    customFeatureReady,
    effectivePalette,
    animate,
    title,
    description,
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
      // Resolve the clicked task via `dataIndex` into the normalized
      // list — each Gantt bar is one data point (point-level click).
      const p = params as { dataIndex?: number };
      const idx = typeof p.dataIndex === 'number' ? p.dataIndex : -1;
      const task = idx >= 0 ? tasks[idx] : undefined;
      if (!task) return;
      const durationDays = (task.endMs - task.startMs) / MS_PER_DAY;
      onDataPointClick({
        datum: {
          kind: 'gantt-task',
          ...(task.id !== undefined ? { id: task.id } : {}),
          name: task.name,
          label: task.name,
          category: task.category,
          dataIndex: idx,
          durationDays,
        },
        value: durationDays,
        label: task.name,
      });
    },
    [onDataPointClick, tasks],
  );

  const { containerRef, instance } = useEChartsRenderer({
    // Gate echarts.init() until the lazy `custom` series module has
    // registered — ECharts snapshots its series type list at init.
    enabled: customFeatureReady,
    option: option ?? EMPTY_GANTT_OPTION,
    theme: themeObject,
    respectReducedMotion: true,
    onClick: onDataPointClick ? handleClick : undefined,
  });

  // A11y — one row per task from the SAME normalized list as
  // `series.data` (dataIndex parity); `value` is the duration in days.
  const a11yData = useMemo(() => linearizeGanttForA11y(tasks), [tasks]);
  const a11y = useChartA11y({
    chartType: 'gantt',
    data: a11yData,
    title,
    description,
    valueFormatter: fmt,
    valueColumnHeader: 'Duration (days)',
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
        data-testid="gantt-chart-empty"
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
      testId="gantt-chart"
      setRefs={setRefs}
      anomalySummary={anomalySummary}
      formatAnomalyAnnouncement={formatAnomalyAnnouncement}
      {...rest}
    />
  );
});

GanttChartInner.displayName = 'GanttChartInner';

/**
 * GanttChart — public wrapper. Accepts `access` / `accessReason`
 * (`AccessControlledProps`) and forwards everything else to
 * `GanttChartInner`. Mirrors the canonical PolarChart / ThemeRiverChart
 * access-gate wiring: `resolveAccessState` resolves once, the click
 * callback is guarded with `guardChartCallback(state, ...)`.
 */
export const GanttChart = React.forwardRef<HTMLDivElement, GanttChartProps>(function GanttChart(
  { access, accessReason, onDataPointClick, anomalySummary, formatAnomalyAnnouncement, ...rest },
  ref,
) {
  const { state } = resolveAccessState(access);
  return (
    <ChartAccessGate access={access} accessReason={accessReason}>
      <GanttChartInner
        ref={ref}
        {...rest}
        onDataPointClick={guardChartCallback(state, onDataPointClick)}
        anomalySummary={anomalySummary}
        formatAnomalyAnnouncement={formatAnomalyAnnouncement}
      />
    </ChartAccessGate>
  );
});
GanttChart.displayName = 'GanttChart';

export default GanttChart;
