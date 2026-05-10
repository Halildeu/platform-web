'use client';

/**
 * RadarChart -- ECharts-powered radar / spider chart
 *
 * Supports multiple series overlays, polygon or circle shapes,
 * area fills, and custom axis indicators. Uses the centralized
 * useEChartsRenderer hook for lifecycle management.
 *
 * @migration SVG -> ECharts (P3)
 */
import React, { useMemo, useCallback, useRef } from 'react';
import type { AccessControlledProps } from '@mfe/shared-types';
import { resolveAccessState } from '@mfe/shared-types';
import { ChartAccessGate } from './access/ChartAccessGate';
import { guardChartCallback } from './access/guardChartCallback';
import { cn } from './utils/cn';
import { useEChartsRenderer } from './renderers';
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

// Cross-filter rollout sweep — Codex thread 019e0c25 absorb. Re-export
// canonical `ChartClickEvent`. Radar's ECharts click event is
// polygon-level (a series item with all values), not per-indicator.
// PR #345 added v2 indicator-level enrichment via click-coordinate
// + container-geometry angle math (`resolveIndicatorAtClick` below)
// — additive only: v1 polygon fields stay stable, new
// `indicator`/`indicatorIndex`/`indicatorValue` fields surface
// alongside them when the click resolves to a specific axis.
export type { ChartClickEvent } from './types';
import type { ChartClickEvent as ChartClickEventCanonical } from './types';
type ChartClickEvent = ChartClickEventCanonical;

// Markup overlay (Codex thread 019e0df1) — Radar is NO-OP. Indicator-
// anchor markups planned for v2 (matches Radar v2 cross-filter
// indicator-level pattern from PR #345).
export type { ChartMarkup, ChartMarkupClickEvent } from './types';
import type { ChartMarkup, ChartMarkupClickEvent } from './types';
import { useMarkupAdapter } from './annotations/useMarkupAdapter';

export type RadarIndicator = {
  /** Axis name displayed at the spoke end. */
  name: string;
  /** Maximum value for this axis. */
  max: number;
  /**
   * Optional unit suffix for SR / tooltip text (e.g. `'ms'`, `'%'`).
   * Forwarded into `AnomalySummary.axisUnit` when paired with
   * `computeRadarAnomalySummary` so the announcement template can
   * print `Latency=240 ms` instead of bare `Latency=240`. Codex
   * thread `019e10a5` PR-Radar plan iter-1.
   */
  unit?: string;
};

export type RadarSeriesItem = {
  /** Series legend name. */
  name: string;
  /** Data values matching indicator order. */
  data: number[];
  /** Override color for this series. */
  color?: string;
  /** Per-series area style override. */
  areaStyle?: { opacity?: number };
};

export interface RadarChartProps extends AccessControlledProps {
  /** Axis indicators defining the radar shape. */
  indicators: RadarIndicator[];
  /** Data series to plot on the radar. */
  series: RadarSeriesItem[];
  /** Visual size variant. @default "md" */
  size?: ChartSize;
  /** Radar shape. @default "polygon" */
  shape?: 'polygon' | 'circle';
  /** Fill the area under each series line. @default false */
  showArea?: boolean;
  /** Show axis name labels. @default true */
  showLabels?: boolean;
  /** Show legend below the chart. @default false */
  showLegend?: boolean;
  /** Number of concentric split rings. @default 5 */
  splitNumber?: number;
  /** Chart title. */
  title?: string;
  /** Animate on mount. @default true */
  animate?: boolean;
  /** Custom value formatter for tooltip. */
  valueFormatter?: (v: number) => string;
  /**
   * Callback fired when the radar polygon is clicked. Emits a canonical
   * `ChartClickEvent`. v1 polygon-level fields stay stable across
   * versions; v2 enrichment is purely ADDITIVE.
   *
   * v1 fields (always present):
   * - `datum.seriesName`, `datum.label` (= seriesName), `datum.values`,
   *   `datum.indicators`
   * - top-level `event.label` = seriesName
   * - top-level `event.value` = `values[0]` when numeric
   *
   * v2 indicator-level enrichment (additive, fires only when click
   * coordinates resolve to a specific axis outside the 5% center
   * dead-zone):
   * - `datum.indicator` (axis name)
   * - `datum.indicatorIndex` (0-based axis position)
   * - `datum.indicatorValue` (numeric value at that axis for the
   *   clicked series)
   *
   * Cross-filter consumers wanting series-level filter:
   *   `<CrossFilterChart emitFields={['seriesName']}>` — v1 contract.
   * Cross-filter consumers wanting per-axis drill:
   *   `<CrossFilterChart emitFields={['indicator']}>` — v2 opt-in.
   * The two surfaces never overwrite each other.
   */
  onDataPointClick?: (event: ChartClickEvent) => void;
  /** Visual overlay markups — NO-OP on Radar (Codex 019e0df1; v2 backlog). */
  markups?: ChartMarkup[];
  /** Callback fired when a markup overlay is clicked (no-op on Radar). */
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
  /** Density override. @default "auto" */
  density?: ChartDensityPreference;
  /**
   * Faz 21.11 batch3 PR-Radar — anomaly summary list. When supplied,
   * forwarded to `ChartA11yShell` so screen readers receive a polite,
   * debounced outlier announcement using the radar-aware default
   * formatter (`X radar indicator anomalies. Most extreme: <series>,
   * <indicator>=<value> <unit>`). Pair with
   * `computeRadarAnomalySummary({ indicators, series })` —
   * per-indicator IQR detector with normalised severity ranking.
   */
  anomalySummary?: AnomalySummary[];
  /**
   * Optional override of the anomaly announcement template.
   * Forwarded to `ChartAriaLive.formatAnomalyAnnouncement`.
   */
  formatAnomalyAnnouncement?: AnomalyAnnouncementFormatter;
  /** Accent palette override. @default "auto" */
  accent?: ChartAccentPreference;
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

/**
 * Resolve which indicator is closest to a click on the radar polygon.
 *
 * ECharts radar lays out indicators clockwise starting at the top
 * (12 o'clock = `-π/2` in standard math angle). With N indicators,
 * indicator `i` sits at angle `i × (2π / N) - π/2`. Given a click's
 * `(offsetX, offsetY)` relative to the chart container we:
 *
 *   1. Translate to vector from container center.
 *   2. Skip clicks too close to the center (no meaningful indicator).
 *   3. Compute the click angle and snap to the nearest indicator slot.
 *
 * Returns `null` when the indicator can't be resolved (event missing
 * coordinates, click near center, container ref not yet measured).
 *
 * Indicator-level v2 (Codex thread 019e0c25 iter-1 backlog item):
 * polygon-level v1 only emitted whole-series datum; consumers asked
 * for per-indicator drill so the cross-filter wrapper could pin a
 * single dimension. The mapping is a heuristic — ECharts doesn't
 * surface per-indicator click as a native event — but the
 * approximation is stable enough for cross-filter emit when the
 * caller chooses `emitFields: ['indicator']`. Polygon-level fields
 * stay on the datum for backward-compat callers.
 */
function resolveIndicatorAtClick(
  offsetX: number | undefined,
  offsetY: number | undefined,
  containerRect: DOMRect | null,
  indicatorCount: number,
): number | null {
  if (typeof offsetX !== 'number' || typeof offsetY !== 'number') return null;
  if (containerRect == null) return null;
  if (indicatorCount <= 0) return null;

  // Container-relative center. ECharts default radius `'75%'` keeps
  // the polygon centred in the container; the exact center pixel is
  // good enough for nearest-angle snapping (we don't need radial
  // distance — only the angle).
  const cx = containerRect.width / 2;
  const cy = containerRect.height / 2;
  const dx = offsetX - cx;
  const dy = offsetY - cy;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Dead-zone near center: indicator inference is unreliable here, and
  // the click most likely lands on the polygon's interior rather than
  // a specific axis.
  const minRadius = Math.min(containerRect.width, containerRect.height) * 0.05;
  if (distance < minRadius) return null;

  // ECharts radar indicators start at top (-π/2) and go clockwise.
  // Standard `atan2(dy, dx)` returns angle measured counter-clockwise
  // from the +x axis; normalise so 0 = top, increasing clockwise.
  const rawAngle = Math.atan2(dy, dx);
  const TWO_PI = 2 * Math.PI;
  const normalised = (rawAngle + Math.PI / 2 + TWO_PI) % TWO_PI;
  const slot = normalised / (TWO_PI / indicatorCount);
  return Math.round(slot) % indicatorCount;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * RadarChart inner — original hook-bearing body. The outer `RadarChart`
 * wrapper below adds the `access` / `accessReason` gate without touching
 * hook order (Faz 21.4 PR-E2). Accepting `Omit<RadarChartProps, 'access' |
 * 'accessReason'>` keeps the inner contract honest: access is resolved
 * exactly once, in the outer wrapper, never re-read inside the hooks.
 */
const RadarChartInner = React.forwardRef<
  HTMLDivElement,
  Omit<RadarChartProps, 'access' | 'accessReason'>
>(function RadarChartInner(
  {
    indicators,
    series,
    size = 'md',
    shape = 'polygon',
    showArea = false,
    showLabels = true,
    showLegend = false,
    splitNumber = 5,
    title,
    valueFormatter,
    animate = true,
    onDataPointClick,
    markups,
    onMarkupClick: _onMarkupClick,
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
  const isEmpty = !indicators || indicators.length === 0 || !series || series.length === 0;

  // Markup overlay adapter — Codex 019e0df1. NO-OP on Radar.
  useMarkupAdapter(markups, { chartType: 'radar' });
  const fmt = valueFormatter ?? formatCompact;

  // Faz 21.9 PR3c: container ref + breakpoint for responsive radar.
  // Radar has no grid/dataZoom; we drive the legend + indicator-axis font
  // size from breakpoint and shrink the radar radius on mobile.
  const ownContainerRef = useRef<HTMLDivElement | null>(null);
  const breakpoint = useResponsiveBreakpoint(ownContainerRef);

  const {
    themeObject,
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

  const option = useMemo((): EChartsOption | null => {
    if (isEmpty) return null;

    const palette = effectivePalette ?? DEFAULT_PALETTE;
    const radarData = series.map((s, idx) => {
      const seriesColor = s.color ?? palette[idx % palette.length];

      // Determine area style: per-series override > global showArea > none
      let areaConfig: { color: string; opacity: number } | undefined;
      if (s.areaStyle) {
        areaConfig = {
          color: seriesColor,
          opacity: s.areaStyle.opacity ?? 0.2,
        };
      } else if (showArea) {
        areaConfig = {
          color: seriesColor,
          opacity: 0.15,
        };
      }

      return {
        value: s.data,
        name: s.name,
        lineStyle: { color: seriesColor, width: 2 },
        itemStyle: { color: seriesColor },
        areaStyle: areaConfig,
      };
    });

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
        trigger: 'item',
        confine: true,
        formatter: (params: unknown) => {
          const p = params as { name: string; value: number[] };
          const header = `<b>${escapeHtml(p.name)}</b>`;
          const lines = indicators.map((ind, i) => {
            const val = p.value?.[i] ?? 0;
            return `${escapeHtml(ind.name)}: ${fmt(val)}`;
          });
          return `${header}<br/>${lines.join('<br/>')}`;
        },
      },
      legend: buildResponsiveLegend({
        breakpoint,
        showLegend,
        hasMultiSeries: series.length > 1,
        seriesCount: series.length,
        densitySpacingMultiplier,
        densityFontMultiplier,
        icon: 'roundRect',
      }),
      radar: {
        // Mobile shrinks the radar envelope so the indicator labels don't
        // collide with the chart edges or the legend strip below.
        radius: breakpoint === 'mobile' ? '60%' : breakpoint === 'tablet' ? '68%' : '75%',
        indicator: indicators.map((ind) => ({
          name: ind.name,
          max: ind.max,
        })),
        shape,
        splitNumber,
        axisName: {
          // Codex 019defa5 PR3c PARTIAL: only suppress indicator names
          // on mobile when the radar is dense enough for them to collide
          // (>4 indicators on a 60% radius envelope). With 3-4 indicators
          // the names still fit and the user benefits from seeing them.
          // Tooltip formatter + a11y table always preserve the names.
          show: showLabels && !(breakpoint === 'mobile' && indicators.length > 4),
          fontSize:
            breakpoint === 'mobile'
              ? Math.max(9, Math.round(11 * 0.9))
              : scaleFontSize(11, densityFontMultiplier),
          color: 'var(--text-secondary, #666)',
        },
        splitArea: {
          show: true,
          areaStyle: {
            color: ['rgba(0,0,0,0.02)', 'rgba(0,0,0,0.04)'],
          },
        },
        splitLine: {
          lineStyle: { color: 'rgba(0,0,0,0.1)' },
        },
        axisLine: {
          lineStyle: { color: 'rgba(0,0,0,0.1)' },
        },
      },
      series: [
        {
          type: 'radar' as const,
          data: radarData,
          emphasis: {
            lineStyle: { width: 3 },
          },
        },
      ],
      aria: {
        enabled: true,
        label: {
          description: title ? `Radar chart: ${escapeHtml(title)}` : 'Radar chart',
        },
        ...(decalEnabled ? { decal: { show: true, decals: decalPatterns } } : {}),
      },
    } as EChartsOption;
  }, [
    indicators,
    series,
    shape,
    showArea,
    showLabels,
    showLegend,
    splitNumber,
    title,
    animate,
    isEmpty,
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
      // ECharts radar click params shape: `{ name?, value: number[],
      // seriesName?, dataIndex?, data: { name, value }, event: {
      // offsetX, offsetY } }`. We surface a polygon-level datum that
      // includes the indicator NAMES + values; v2 enrichment uses the
      // click coordinates (when present) to also identify the SINGLE
      // closest indicator so cross-filter consumers can emit
      // per-axis filters (`emitFields: ['indicator']`).
      const p = params as {
        seriesName?: string;
        name?: string;
        value?: unknown;
        dataIndex?: number;
        data?: unknown;
        event?: { offsetX?: number; offsetY?: number };
      };
      const valuesArr = Array.isArray(p.value) ? (p.value as number[]) : [];
      const seriesName =
        (typeof p.seriesName === 'string' ? p.seriesName : undefined) ??
        (typeof p.name === 'string' ? p.name : '');
      const indicatorNames = indicators.map((ind) => ind.name);

      // v2 indicator-level enrichment (Codex iter-1 backlog item).
      // Heuristic: snap the click angle to the closest indicator
      // axis (see `resolveIndicatorAtClick` above). Returns `null`
      // when coordinates aren't available (test environments, raw
      // ECharts events that omit `event.offsetX/Y`) or the click is
      // too close to the center to disambiguate.
      const containerRect = ownContainerRef.current?.getBoundingClientRect() ?? null;
      const indicatorIdx = resolveIndicatorAtClick(
        p.event?.offsetX,
        p.event?.offsetY,
        containerRect,
        indicators.length,
      );
      const indicator =
        indicatorIdx != null && indicatorIdx >= 0 && indicatorIdx < indicators.length
          ? indicators[indicatorIdx]
          : null;
      const indicatorValue =
        indicator != null && typeof valuesArr[indicatorIdx as number] === 'number'
          ? valuesArr[indicatorIdx as number]
          : undefined;

      // Backward-compat contract — Codex review absorb (PR #345 P1):
      // v1 alanları (`label`, top-level `label`, top-level `value`) v2
      // enrichment'a göre KAYMASI YOK. Mevcut consumer'lar
      // `emitFields: ['label']` veya `['value']` kullanıyorsa
      // browser event'leri series label/value'sunu görmeye devam
      // etmeli. Indicator-level drill için TAMAMEN AYRI yeni alanlar:
      // `indicator`, `indicatorIndex`, `indicatorValue`. Per-axis
      // filter isteyen consumer EXPLICIT olarak `emitFields:
      // ['indicator']` veya `['indicatorValue']` seçer.
      onDataPointClick({
        datum: {
          // v1 polygon-level fields (stable across versions):
          seriesName,
          label: seriesName,
          values: valuesArr,
          indicators: indicatorNames,
          // v2 indicator-level enrichment (undefined when click is in
          // the polygon dead-zone or coordinates are missing). These
          // are ADDITIVE — v1 fields above never reflect indicator
          // state.
          indicator: indicator?.name,
          indicatorIndex: indicatorIdx ?? undefined,
          indicatorValue,
        },
        // Top-level event fields stay v1 stable.
        value: typeof valuesArr[0] === 'number' ? valuesArr[0] : undefined,
        label: seriesName,
      });
    },
    [onDataPointClick, indicators],
  );

  const { containerRef, instance } = useEChartsRenderer({
    option: option ?? ({} as EChartsOption),
    theme: themeObject,
    respectReducedMotion: true,
    onClick: onDataPointClick ? handleClick : undefined,
  });

  // Faz 21.5-B PR-B2: default-on a11y. Radar shows multiple axes
  // per series — flatten the FIRST series' values aligned with each
  // indicator name so SR users hear the dominant trend.
  const a11yData = useMemo(
    () =>
      indicators.map((ind, i) => ({
        label: ind.name,
        value: series[0]?.data?.[i] ?? 0,
      })),
    [indicators, series],
  );
  const a11y = useChartA11y({
    chartType: 'radar',
    data: a11yData,
    title,
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
        data-testid="radar-chart-empty"
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
      testId="radar-chart"
      setRefs={setRefs}
      anomalySummary={anomalySummary}
      formatAnomalyAnnouncement={formatAnomalyAnnouncement}
      {...rest}
    />
  );
});

RadarChartInner.displayName = 'RadarChartInner';

/**
 * RadarChart — public wrapper. Accepts `access` + `accessReason`
 * (`AccessControlledProps`) and forwards everything else to
 * `RadarChartInner`. Faz 21.4 PR-E2 wiring; default `access === undefined`
 * follows the identity-transform path through `ChartAccessGate`.
 */
export const RadarChart = React.forwardRef<HTMLDivElement, RadarChartProps>(function RadarChart(
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
      <RadarChartInner
        ref={ref}
        {...rest}
        onDataPointClick={guardChartCallback(state, onDataPointClick)}
        onMarkupClick={guardChartCallback(state, onMarkupClick)}
        // PR-Radar: anomaly summary + formatter forwarded through
        // unchanged — these aren't user-facing callbacks the access
        // gate would block. Codex thread `019e10a5` PR-Radar plan iter-1.
        anomalySummary={anomalySummary}
        formatAnomalyAnnouncement={formatAnomalyAnnouncement}
      />
    </ChartAccessGate>
  );
});
RadarChart.displayName = 'RadarChart';

export default RadarChart;
