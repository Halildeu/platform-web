'use client';

/**
 * GaugeChart -- ECharts-powered gauge with threshold zones
 *
 * Supports configurable thresholds, pointer styling, progress arcs,
 * and custom value formatting. Uses the centralized useEChartsRenderer
 * hook for lifecycle management.
 *
 * @migration SVG -> ECharts (P3)
 */
import React, { useMemo, useCallback, useRef } from 'react';
import type { AccessControlledProps } from '@mfe/shared-types';
import { resolveAccessState } from '@mfe/shared-types';
import { guardChartCallback } from './access/guardChartCallback';
import { ChartAccessGate } from './access/ChartAccessGate';
import { cn } from './utils/cn';
import { resolveCssVarColor } from './utils/resolveCssVarColor';
import { useEChartsRenderer } from './renderers';
import { useResponsiveBreakpoint } from './useResponsiveChart';
import { ChartA11yShell, useChartA11y } from './a11y';
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

export type GaugeThreshold = {
  /** Threshold boundary value. */
  value: number;
  /** Color for the zone up to this value. */
  color: string;
  /** Optional label for the zone. */
  label?: string;
};

// Cross-filter rollout sweep — Codex thread 019e0c25 absorb. Re-export
// the canonical `ChartClickEvent`. Gauge is a single-value chart, so
// the datum surfaces the dial label, the value, and the configured
// `min`/`max` bounds (no synthetic `target` field — Codex iter-1
// blocker).
export type { ChartClickEvent } from './types';
import type { ChartClickEvent as ChartClickEventCanonical } from './types';
type ChartClickEvent = ChartClickEventCanonical;

// Markup overlay (Codex thread 019e0df1) — Gauge is NO-OP.
export type { ChartMarkup, ChartMarkupClickEvent } from './types';
import type { ChartMarkup, ChartMarkupClickEvent } from './types';
import { useMarkupAdapter } from './annotations/useMarkupAdapter';

export interface GaugeChartProps extends AccessControlledProps {
  /** Current gauge value. */
  value: number;
  /** Minimum scale value. @default 0 */
  min?: number;
  /** Maximum scale value. @default 100 */
  max?: number;
  /** Title displayed above the gauge. */
  title?: string;
  /** Accessible description. */
  description?: string;
  /** Visual size variant. @default "md" */
  size?: ChartSize;
  /** Threshold zones for colored arc segments. */
  thresholds?: GaugeThreshold[];
  /** Start angle in degrees. @default 225 */
  startAngle?: number;
  /** End angle in degrees. @default -45 */
  endAngle?: number;
  /** Show a progress arc from min to current value. @default false */
  showProgress?: boolean;
  /** Pointer configuration. */
  pointer?: {
    length?: string;
    width?: number;
    color?: string;
  };
  /** Number of segments on the axis. @default 10 */
  splitNumber?: number;
  /** Show numeric axis labels. @default true */
  showAxisLabel?: boolean;
  /** Custom formatter for the center value display. */
  valueFormatter?: (v: number) => string;
  /** Animate on mount and value changes. @default true */
  animate?: boolean;
  /** Additional class name. */
  className?: string;
  /**
   * Callback fired when the gauge dial is clicked. Emits a
   * `ChartClickEvent` with `datum: { label, name, value, min, max }`
   * — `target` is intentionally NOT included (it isn't a
   * `GaugeChartProps` field; Codex iter-2 thread 019e0c25 blocker).
   */
  onDataPointClick?: (event: ChartClickEvent) => void;
  /** Visual overlay markups — NO-OP on Gauge (Codex 019e0df1). */
  markups?: ChartMarkup[];
  /** Callback fired when a markup overlay is clicked (no-op on Gauge). */
  onMarkupClick?: (event: ChartMarkupClickEvent) => void;
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
   * Accent palette override.
   * @default "auto"
   * @remarks GaugeChart's `thresholds` defaults are SEMANTIC (success/warning/danger)
   *   and NOT changed by accent. The accent prop is accepted for API consistency
   *   across all 13 charts but does not affect gauge color rendering.
   *   To change threshold colors, override the `thresholds` prop directly.
   */
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
 * Normalize threshold values into ECharts axisLine color stops (0-1 range).
 * Each entry is [normalizedPosition, color].
 */
function buildAxisLineColors(
  thresholds: GaugeThreshold[],
  min: number,
  max: number,
): [number, string][] {
  const range = max - min;
  if (range <= 0) return [[1, DEFAULT_PALETTE[0]]];

  const sorted = [...thresholds].sort((a, b) => a.value - b.value);
  // Resolve a consumer `var(--token)` threshold color to a concrete value —
  // the canvas renderer cannot read CSS custom properties.
  return sorted.map((t) => [
    Math.min(Math.max((t.value - min) / range, 0), 1),
    resolveCssVarColor(t.color),
  ]);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * GaugeChart inner — original hook-bearing body. The outer `GaugeChart`
 * wrapper below adds the `access` / `accessReason` gate without touching
 * hook order (Faz 21.4 PR-E2). Accepting `Omit<GaugeChartProps, 'access' |
 * 'accessReason'>` keeps the inner contract honest: access is resolved
 * exactly once, in the outer wrapper, never re-read inside the hooks.
 */
const GaugeChartInner = React.forwardRef<
  HTMLDivElement,
  Omit<GaugeChartProps, 'access' | 'accessReason'>
>(function GaugeChartInner(
  {
    value,
    min = 0,
    max = 100,
    title,
    description,
    size = 'md',
    thresholds,
    startAngle = 225,
    endAngle = -45,
    showProgress = false,
    pointer,
    splitNumber = 10,
    showAxisLabel = true,
    valueFormatter,
    animate = true,
    className,
    onDataPointClick,
    markups,
    onMarkupClick: _onMarkupClick,
    theme: themePreference = 'auto',
    decal: decalPreference = 'auto',
    density: densityPreference = 'auto',
    accent: accentPreference = 'auto',
    ...rest
  },
  forwardedRef,
) {
  const height = CHART_CANVAS_HEIGHT[size];
  const isEmpty = value == null;
  const safeValue = sanitizeNumber(value);

  // Markup overlay adapter — Codex 019e0df1. NO-OP on Gauge; called
  // for dev warnings when markups supplied.
  useMarkupAdapter(markups, { chartType: 'gauge' });
  const fmt = valueFormatter ?? formatCompact;

  // Faz 21.9 PR3c: container ref + breakpoint for responsive gauge.
  // Gauge has no grid/legend/dataZoom; we drive only the axisLabel
  // visibility/font on mobile so the tick numbers don't crowd the dial.
  const ownContainerRef = useRef<HTMLDivElement | null>(null);
  const breakpoint = useResponsiveBreakpoint(ownContainerRef);

  // GaugeChart accent-IMMUNE — accent prop accepted for API consistency
  // but theme builder defaults (semantic success/warning/danger thresholds)
  // are intentionally preserved. effectivePalette ignored.
  const { themeObject, decalEnabled, decalPatterns, densityFontMultiplier } = useChartTheme({
    theme: themePreference,
    decal: decalPreference,
    density: densityPreference,
    accent: accentPreference,
  });

  const option = useMemo((): EChartsOption | null => {
    if (isEmpty) return null;

    const axisLineColors = thresholds?.length
      ? buildAxisLineColors(thresholds, min, max)
      : ([
          [0.6, '#22c55e'],
          [0.8, '#f59e0b'],
          [1, '#ef4444'],
        ] as [number, string][]);

    return {
      animation: animate,
      animationDuration: animate ? 500 : 0,
      animationEasing: 'cubicOut',
      series: [
        {
          type: 'gauge' as const,
          min,
          max,
          startAngle,
          endAngle,
          splitNumber,
          data: [{ value: safeValue, name: title ?? '' }],
          progress: {
            show: showProgress,
            width: 12,
          },
          axisLine: {
            lineStyle: {
              width: 16,
              color: axisLineColors,
            },
          },
          pointer: {
            length: pointer?.length ?? '60%',
            width: pointer?.width ?? 5,
            itemStyle: pointer?.color ? { color: resolveCssVarColor(pointer.color) } : undefined,
          },
          axisTick: {
            show: true,
            distance: -20,
            length: 6,
            lineStyle: { color: '#999', width: 1 },
          },
          splitLine: {
            show: true,
            distance: -24,
            length: 12,
            lineStyle: { color: '#999', width: 2 },
          },
          axisLabel: {
            // Mobile suppresses gauge axis labels — they collide with the
            // shrunken dial. Tick marks remain so the scale is still
            // readable. Tablet/desktop respect the consumer's preference.
            show: showAxisLabel && breakpoint !== 'mobile',
            distance: 30,
            fontSize:
              breakpoint === 'mobile'
                ? Math.max(9, Math.round(11 * 0.9))
                : scaleFontSize(11, densityFontMultiplier),
            formatter: (v: number) => escapeHtml(fmt(v)),
          },
          detail: {
            valueAnimation: animate,
            formatter: (v: number) => escapeHtml(fmt(v)),
            // height-relative fontSize already adapts; multiply by density factor
            fontSize: scaleFontSize(Math.round(height * 0.08), densityFontMultiplier),
            fontWeight: 600,
            offsetCenter: [0, '40%'],
            color: 'inherit',
          },
          title: title
            ? {
                show: true,
                offsetCenter: [0, '60%'],
                fontSize: scaleFontSize(13, densityFontMultiplier),
                color: 'var(--text-secondary, #666)',
              }
            : { show: false },
        },
      ],
      aria: {
        enabled: true,
        label: {
          description: title ? `Gauge chart: ${escapeHtml(title)}` : 'Gauge chart',
        },
        ...(decalEnabled ? { decal: { show: true, decals: decalPatterns } } : {}),
      },
    } as EChartsOption;
  }, [
    value,
    min,
    max,
    title,
    thresholds,
    startAngle,
    endAngle,
    showProgress,
    pointer,
    splitNumber,
    showAxisLabel,
    fmt,
    animate,
    height,
    isEmpty,
    decalEnabled,
    decalPatterns,
    densityFontMultiplier,
    breakpoint,
  ]);

  // Cross-filter adapter — Codex thread 019e0c25 absorb. ECharts gauge
  // emits `params.value` as the numeric reading and `params.name` as
  // the gauge title (carried via `data: [{ value, name }]`). We surface
  // a structured datum that the cross-filter wrapper can emit on
  // canonical fields like `label` or `name`. `target` is intentionally
  // NOT in the datum — it isn't a Gauge prop (Codex iter-1 blocker).
  const handleClick = useCallback(
    (params: unknown) => {
      if (!onDataPointClick) return;
      const p = params as { value?: number; name?: string };
      const v = typeof p.value === 'number' ? p.value : safeValue;
      const label = title ?? p.name ?? 'Value';
      onDataPointClick({
        datum: {
          label,
          name: label,
          value: v,
          min,
          max,
        },
        value: v,
        label,
      });
    },
    [onDataPointClick, safeValue, title, min, max],
  );

  const { containerRef, instance } = useEChartsRenderer({
    option: option ?? ({} as EChartsOption),
    theme: themeObject,
    respectReducedMotion: true,
    onClick: onDataPointClick ? handleClick : undefined,
  });

  // Faz 21.5-B PR-B2: default-on a11y. Gauge has a single value
  // (no series) → emit one virtual data point for the SR data table.
  const a11yData = useMemo(
    () => (isEmpty ? [] : [{ label: title ?? 'Value', value: safeValue }]),
    [isEmpty, title, safeValue],
  );
  const a11y = useChartA11y({
    chartType: 'gauge',
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
        data-testid="gauge-chart-empty"
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
      testId="gauge-chart"
      setRefs={setRefs}
      {...rest}
    />
  );
});

GaugeChartInner.displayName = 'GaugeChartInner';

/**
 * GaugeChart — public wrapper. Accepts `access` + `accessReason`
 * (`AccessControlledProps`) and forwards everything else to
 * `GaugeChartInner`. Faz 21.4 PR-E2 wiring; default `access === undefined`
 * follows the identity-transform path through `ChartAccessGate`.
 */
export const GaugeChart = React.forwardRef<HTMLDivElement, GaugeChartProps>(function GaugeChart(
  { access, accessReason, onDataPointClick, onMarkupClick, ...rest },
  ref,
) {
  // Access-aware callback gating — Codex iter-2 absorb.
  const { state } = resolveAccessState(access);
  return (
    <ChartAccessGate access={access} accessReason={accessReason}>
      <GaugeChartInner
        ref={ref}
        {...rest}
        onDataPointClick={guardChartCallback(state, onDataPointClick)}
        onMarkupClick={guardChartCallback(state, onMarkupClick)}
      />
    </ChartAccessGate>
  );
});
GaugeChart.displayName = 'GaugeChart';

export default GaugeChart;
