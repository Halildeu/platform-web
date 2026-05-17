'use client';

/**
 * PolarChart — ECharts `bar` / `line` / `scatter` series on a `polar`
 * coordinate system.
 *
 * A categorical radial chart: each datum is a category placed around
 * the polar angle axis, with its `value` plotted as the radial
 * distance from the center. With `seriesType="bar"` this is the classic
 * polar-bar / "nightingale rose"; `"line"` draws a radial line through
 * the categories; `"scatter"` places one point per category.
 *
 * SCOPE (v1) — this is a *categorical* polar chart: the angle axis is
 * always `type: 'category'` and the data contract is one
 * `{ name, value }` per angle slot. A numeric-angle polar plot (a
 * scatter over a `value`-type angle axis) is a different data contract
 * and is intentionally deferred to a future discriminated API rather
 * than overloading this prop surface.
 *
 * The `polar` coordinate-system component is NOT in the eager ECharts
 * register (CONTRACT §8 bundle headroom — PR-X16b-prep). It is lazy-
 * registered on first non-empty mount via
 * `renderers/registerEChartsFeature.ts`; the `bar` / `line` / `scatter`
 * series themselves stay eager.
 *
 * @see PR-X16c — Codex thread 019e35b3 plan-time AGREE (ECharts Depth
 *   campaign, third of 5: Tree → Calendar → Polar → ThemeRiver → Gantt).
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

/** Series render type on the polar coordinate system. */
export type PolarSeriesType = 'bar' | 'line' | 'scatter';

/**
 * One category on the polar angle axis. The categories render around
 * the circle in array order — that order is meaningful and is
 * preserved (unlike CalendarHeatmap, which date-sorts its input).
 */
export type PolarChartDataPoint = {
  /** Category label — one angle slot on the polar axis. */
  name: string;
  /** Numeric value — the radial distance from the center. */
  value: number;
};

export interface PolarChartProps extends AccessControlledProps {
  /**
   * Per-category values plotted around the polar angle axis. Each
   * `name` is one angle slot; array order is the angular order and is
   * preserved. Entries with a missing / empty `name` are dropped.
   */
  data: PolarChartDataPoint[];
  /**
   * Series render type — `'bar'` (polar-bar / "nightingale rose"),
   * `'line'` (open radial line — NOT closed back to the first
   * category, since auto-closing would add a phantom data index and
   * break click / a11y `dataIndex` parity) or `'scatter'` (one point
   * per category).
   * @default 'bar'
   */
  seriesType?: PolarSeriesType;
  /**
   * Angle in degrees where the first category starts. ECharts measures
   * counter-clockwise; `90` places the first slot at the top.
   * @default 90
   */
  startAngle?: number;
  /** Show the angle-axis category labels. @default true */
  showAngleAxisLabel?: boolean;
  /** Show the radius-axis tick labels. @default true */
  showRadiusAxisLabel?: boolean;
  /**
   * Minimum value for the radius scale. When omitted, a `bar` series of
   * all-non-negative values pins the radius origin to `0` (bars grow
   * from the center); otherwise ECharts auto-scales.
   */
  min?: number;
  /** Maximum value for the radius scale. Auto-detected when omitted. */
  max?: number;
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
 * Fallback categorical palette — used when the theme resolves no
 * accent palette. Mirrors RadarChart's default sequence.
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
 * Stable empty option dispatched while the lazy `polar` component
 * module is still loading — a module constant (not an inline `{}`) so
 * the renderer's option-update effect does not thrash before
 * {@link useRequiredEChartsFeature} reports ready.
 */
const EMPTY_POLAR_OPTION: EChartsOption = {};

/* ------------------------------------------------------------------ */
/*  Helpers (exported for unit tests)                                  */
/* ------------------------------------------------------------------ */

const escapeHtml = (t: string): string =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Normalize the polar data into ONE array. Both `angleAxis.data` +
 * `series.data` and the screen-reader a11y table are derived from this
 * single array, so a click event's `dataIndex` maps to the same row in
 * all of them (dataIndex parity).
 *
 * Two passes in one: entries with a missing / non-string / empty
 * `name` are dropped, and every surviving `value` is run through
 * {@link sanitizeNumber} so the radius scale, the series data, the
 * a11y table and the click payload all observe the same finite value.
 *
 * Input order is PRESERVED — the array order is the angular order of
 * the categories around the polar axis.
 */
export function normalizePolarData(data: PolarChartDataPoint[]): PolarChartDataPoint[] {
  return (data ?? [])
    .filter((d): d is PolarChartDataPoint => !!d && typeof d.name === 'string' && d.name.length > 0)
    .map((d) => ({ name: d.name, value: sanitizeNumber(d.value) }));
}

/** Single flat row for the screen-reader data table. */
export interface PolarA11yRow {
  /** Category label. */
  label: string;
  /** Numeric value for that category. */
  value: number;
}

/**
 * Flatten the (already normalized) polar data into flat
 * `{label, value}[]` rows for the `useChartA11y` screen-reader table.
 * Order matches `angleAxis.data` / `series.data` exactly.
 *
 * @param normalized Output of {@link normalizePolarData}.
 */
export function linearizePolarForA11y(normalized: PolarChartDataPoint[]): PolarA11yRow[] {
  return normalized.map((d) => ({ label: d.name, value: d.value }));
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const PolarChartInner = React.forwardRef<
  HTMLDivElement,
  Omit<PolarChartProps, 'access' | 'accessReason'>
>(function PolarChartInner(
  {
    data,
    seriesType = 'bar',
    startAngle = 90,
    showAngleAxisLabel = true,
    showRadiusAxisLabel = true,
    min: minProp,
    max: maxProp,
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

  // ONE normalized array — drives `angleAxis.data`, `series.data` and
  // `a11yData` so a click's `dataIndex` maps to the same row across all
  // three. `isEmpty` is derived from the NORMALIZED length: an input
  // whose every entry has an invalid `name` collapses to empty here, so
  // the lazy `polar` chunk is never fetched for unrenderable data
  // (Codex thread 019e35b3 iter-2).
  const normalized = useMemo(() => normalizePolarData(data), [data]);
  const isEmpty = normalized.length === 0;

  // PR-X16c: the `polar` coordinate-system component is NOT in the
  // eager ECharts register (bundle headroom — PR-X16b-prep). Lazy-
  // register it on first non-empty mount; the option is held back
  // (`null`) until the feature reports `ready`, and the renderer is
  // gated so `echarts.init()` waits for the layout handlers the
  // `polar` install registers (Codex thread 019e337e).
  const polarFeature = useRequiredEChartsFeature('polar', { enabled: !isEmpty });
  const polarFeatureReady = polarFeature.status === 'ready';

  const { themeObject, decalEnabled, decalPatterns, densityFontMultiplier, effectivePalette } =
    useChartTheme({
      theme: themePreference,
      decal: decalPreference,
      density: densityPreference,
      accent: accentPreference,
    });

  const option = useMemo((): EChartsOption | null => {
    // Hold the option until BOTH renderable data exists AND the lazy
    // `polar` component has registered (see `polarFeature` above).
    if (isEmpty || !polarFeatureReady) return null;

    const palette = effectivePalette ?? DEFAULT_PALETTE;
    const categories = normalized.map((d) => d.name);
    const values = normalized.map((d) => d.value);
    const hasNegative = values.some((v) => v < 0);

    // A `bar` series of all-non-negative values reads best with the
    // radius pinned to a 0 origin (bars grow from the center). Negative
    // or mixed bars — and every line / scatter series — let ECharts
    // auto-scale the radial domain (Codex thread 019e35b3 iter-2).
    const radiusMin = minProp ?? (seriesType === 'bar' && !hasNegative ? 0 : undefined);

    return {
      animation: animate,
      animationDuration: animate ? 500 : 0,
      animationEasing: 'cubicOut',
      // `colorBy: 'data'` on the polar `bar` series paints each sector
      // its own palette color (the "rose" look); `line` / `scatter`
      // take a single series color.
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
          // Resolve via `dataIndex` into the normalized array — never
          // trust the raw `params.data` shape (Codex thread 019e35b3
          // iter-2). The wrapper is the source of truth for the
          // semantic label + value.
          const row =
            typeof params.dataIndex === 'number' ? normalized[params.dataIndex] : undefined;
          if (!row) return '';
          return `${escapeHtml(row.name)}<br/><strong>${escapeHtml(fmt(row.value))}</strong>`;
        },
      },
      polar: {
        radius: breakpoint === 'mobile' ? '62%' : breakpoint === 'tablet' ? '68%' : '72%',
        center: ['50%', title ? '54%' : '50%'],
      },
      angleAxis: {
        type: 'category',
        data: categories,
        startAngle,
        axisLabel: {
          show: showAngleAxisLabel,
          fontSize: scaleFontSize(11, densityFontMultiplier),
          color: 'var(--text-secondary, #666)',
        },
        axisLine: { lineStyle: { color: 'var(--border-subtle, #d1d5db)' } },
      },
      radiusAxis: {
        type: 'value',
        min: radiusMin,
        max: maxProp,
        axisLabel: {
          show: showRadiusAxisLabel,
          fontSize: scaleFontSize(10, densityFontMultiplier),
          color: 'var(--text-secondary, #666)',
        },
        axisLine: { show: false },
        splitLine: {
          show: true,
          lineStyle: { color: 'var(--border-subtle, #d1d5db)' },
        },
      },
      series: [
        {
          type: seriesType,
          coordinateSystem: 'polar',
          // bar → per-category palette colors; line / scatter → one
          // series color.
          colorBy: seriesType === 'bar' ? 'data' : 'series',
          data: values,
          symbolSize: seriesType === 'scatter' ? 12 : 6,
          lineStyle: { width: 2 },
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
          description: title ? `Polar chart: ${escapeHtml(title)}` : 'Polar chart',
        },
        ...(decalEnabled ? { decal: { show: true, decals: decalPatterns } } : {}),
      },
    } as EChartsOption;
  }, [
    normalized,
    seriesType,
    startAngle,
    showAngleAxisLabel,
    showRadiusAxisLabel,
    minProp,
    maxProp,
    animate,
    title,
    description,
    fmt,
    isEmpty,
    polarFeatureReady,
    effectivePalette,
    decalEnabled,
    decalPatterns,
    densityFontMultiplier,
    breakpoint,
    onDataPointClick,
  ]);

  const handleClick = useCallback(
    (params: unknown) => {
      if (!onDataPointClick) return;
      // Resolve the clicked datum via `dataIndex` into the normalized
      // array — the wrapper, not ECharts' raw `params.data`, is the
      // source of truth for the semantic label + value (Codex thread
      // 019e35b3 iter-2).
      const p = params as { dataIndex?: number };
      const idx = typeof p.dataIndex === 'number' ? p.dataIndex : -1;
      const datum = idx >= 0 ? normalized[idx] : undefined;
      if (!datum) return;
      onDataPointClick({
        datum: {
          kind: 'polar-point',
          name: datum.name,
          label: datum.name,
          value: datum.value,
          dataIndex: idx,
          seriesType,
        },
        value: datum.value,
        label: datum.name,
      });
    },
    [onDataPointClick, normalized, seriesType],
  );

  const { containerRef, instance } = useEChartsRenderer({
    // Gate echarts.init() until the lazy `polar` component has
    // registered — ECharts snapshots its layout handler list at init.
    enabled: polarFeatureReady,
    option: option ?? EMPTY_POLAR_OPTION,
    theme: themeObject,
    respectReducedMotion: true,
    onClick: onDataPointClick ? handleClick : undefined,
  });

  // A11y — one row per category from the SAME normalized array as
  // `series.data` (dataIndex parity).
  const a11yData = useMemo(() => linearizePolarForA11y(normalized), [normalized]);
  const a11y = useChartA11y({
    chartType: 'polar',
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
        data-testid="polar-chart-empty"
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
      testId="polar-chart"
      setRefs={setRefs}
      anomalySummary={anomalySummary}
      formatAnomalyAnnouncement={formatAnomalyAnnouncement}
      {...rest}
    />
  );
});

PolarChartInner.displayName = 'PolarChartInner';

/**
 * PolarChart — public wrapper. Accepts `access` / `accessReason`
 * (`AccessControlledProps`) and forwards everything else to
 * `PolarChartInner`. Mirrors the canonical BarChart / CalendarHeatmap
 * access-gate wiring: `resolveAccessState` resolves once, the click
 * callback is guarded with `guardChartCallback(state, ...)`.
 */
export const PolarChart = React.forwardRef<HTMLDivElement, PolarChartProps>(function PolarChart(
  { access, accessReason, onDataPointClick, anomalySummary, formatAnomalyAnnouncement, ...rest },
  ref,
) {
  const { state } = resolveAccessState(access);
  return (
    <ChartAccessGate access={access} accessReason={accessReason}>
      <PolarChartInner
        ref={ref}
        {...rest}
        onDataPointClick={guardChartCallback(state, onDataPointClick)}
        anomalySummary={anomalySummary}
        formatAnomalyAnnouncement={formatAnomalyAnnouncement}
      />
    </ChartAccessGate>
  );
});
PolarChart.displayName = 'PolarChart';

export default PolarChart;
