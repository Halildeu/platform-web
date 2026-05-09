'use client';

/**
 * ScatterChart — ECharts-powered scatter/bubble chart with Design Lab integration
 *
 * Backwards-compatible with the AG Charts API surface.
 * Uses the centralized useEChartsRenderer hook for lifecycle management.
 *
 * @migration AG Charts → ECharts (P1, chart-viz-engine-selection D-001)
 */
import React, { useMemo, useCallback, useRef } from 'react';
import type { AccessControlledProps } from '@mfe/shared-types';
import { resolveAccessState } from '@mfe/shared-types';
import { guardChartCallback } from './access/guardChartCallback';
import { ChartAccessGate } from './access/ChartAccessGate';
import { cn } from './utils/cn';
import { useEChartsRenderer } from './renderers';
import { ChartA11yShell, useChartA11y } from './a11y';
import { useChartTheme } from './theme/useChartTheme';
import type {
  ChartThemePreference,
  ChartDecalPreference,
  ChartDensityPreference,
  ChartAccentPreference,
} from './theme/useChartTheme';
import { scaleFontSize, scaleSpacing, scalePadding } from './theme/density-helpers';
import { CHART_CANVAS_HEIGHT } from './chartSize';
import { formatCompact } from './utils/formatters';
import { sanitizeNumber } from './utils/data-validation';
import type { EChartsOption } from './renderers/echarts-imports';
import { useResponsiveBreakpoint } from './useResponsiveChart';
import { buildResponsiveLegend, buildResponsiveGrid } from './responsive';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ScatterDataPoint = {
  x: number;
  y: number;
  size?: number;
  label?: string;
  color?: string;
};

export type ChartSize = 'sm' | 'md' | 'lg';

// Cross-filter rollout sweep — Codex thread 019e0c25 absorb. Re-export
// the canonical `ChartClickEvent` so the cross-filter wrapper sees the
// same shape across all 13 charts.
export type { ChartClickEvent } from './types';
import type { ChartClickEvent as ChartClickEventCanonical } from './types';
type ChartClickEvent = ChartClickEventCanonical;

export interface ScatterChartProps extends AccessControlledProps {
  /** Data points for the scatter plot. */
  data: ScatterDataPoint[];
  /** Visual size variant. @default "md" */
  size?: ChartSize;
  /** Show grid lines. @default true */
  showGrid?: boolean;
  /** Show legend below the chart. @default false */
  showLegend?: boolean;
  /** Chart title. */
  title?: string;
  /** Accessible description. */
  description?: string;
  /** Override default chart colors. */
  colors?: string[];
  /** Custom value formatter for axis labels. */
  valueFormatter?: (value: number) => string;
  /** Animate on mount. @default true */
  animate?: boolean;
  /** Additional class name. */
  className?: string;
  /** X-axis label. */
  xLabel?: string;
  /** Y-axis label. */
  yLabel?: string;
  /** Enable bubble mode — sizes markers by the `size` field. @default false */
  bubble?: boolean;
  /** Text shown when data is empty. @default "Veri yok" */
  noDataText?: string;
  /**
   * Callback fired when a data point is clicked. The emitted
   * `ChartClickEvent` exposes a datum compatible with the cross-filter
   * wrapper: `{ x, y, size, label, dataIndex }`. `value` mirrors `y`
   * (the primary measure) and `label` falls back to `Point N (x, y)`
   * when no explicit label is set.
   */
  onDataPointClick?: (event: ChartClickEvent) => void;
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
  /** Accent palette override. @default "auto" */
  accent?: ChartAccentPreference;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const getCSSVar = (v: string, fb: string): string => {
  if (typeof document === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || fb;
};

const escapeHtml = (t: string): string =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const getDefaultPalette = (): string[] => [
  getCSSVar('--action-primary', '#3b82f6'),
  getCSSVar('--state-success-text', '#22c55e'),
  getCSSVar('--state-warning-text', '#f59e0b'),
  getCSSVar('--state-error-text', '#ef4444'),
  getCSSVar('--state-info-text', '#06b6d4'),
  getCSSVar('--action-secondary', '#8b5cf6'),
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#6366f1',
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * ScatterChart inner — original hook-bearing body. The outer `ScatterChart`
 * wrapper below adds the `access` / `accessReason` gate without touching
 * hook order (Faz 21.4 PR-E2). Accepting `Omit<ScatterChartProps, 'access' |
 * 'accessReason'>` keeps the inner contract honest: access is resolved
 * exactly once, in the outer wrapper, never re-read inside the hooks.
 */
const ScatterChartInner = React.forwardRef<
  HTMLDivElement,
  Omit<ScatterChartProps, 'access' | 'accessReason'>
>(function ScatterChartInner(
  {
    data,
    size = 'md',
    showGrid = true,
    showLegend = false,
    title,
    description,
    colors,
    valueFormatter,
    animate = true,
    className,
    xLabel,
    yLabel,
    bubble = false,
    noDataText = 'Veri yok',
    onDataPointClick,
    theme: themePreference = 'auto',
    decal: decalPreference = 'auto',
    density: densityPreference = 'auto',
    accent: accentPreference = 'auto',
    ...rest
  },
  forwardedRef,
) {
  const height = CHART_CANVAS_HEIGHT[size];
  const safeData = useMemo(
    () =>
      (data ?? []).map((d) => ({
        ...d,
        x: sanitizeNumber(d.x),
        y: sanitizeNumber(d.y),
        size: d.size != null ? sanitizeNumber(d.size) : undefined,
      })),
    [data],
  );
  const isEmpty = safeData.length === 0;
  const fmt = valueFormatter ?? formatCompact;

  // Same DOM node feeds breakpoint observer and ECharts renderer.
  const ownContainerRef = useRef<HTMLDivElement | null>(null);
  const breakpoint = useResponsiveBreakpoint(ownContainerRef);

  // Codex iter-1 madde 6: ScatterChart önceden theme'i renderer'a hiç vermiyordu;
  // theme switch'te option memo recompute olsun diye themeObject ve decal*'ı
  // dependency olarak option useMemo'ya iletiyoruz.
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

  const option = useMemo((): EChartsOption | null => {
    if (isEmpty) return null;

    const palette = colors ?? effectivePalette ?? getDefaultPalette();
    const fontFamily = getCSSVar('--font-family-sans', 'Inter, system-ui, sans-serif');
    const textPrimary = getCSSVar('--text-primary', '#1a1a2e');
    const textSecondary = getCSSVar('--text-secondary', '#6b7280');
    const borderDefault = getCSSVar('--border-default', '#e5e7eb');
    const bgMuted = getCSSVar('--bg-muted', '#f9fafb');

    // Transform data: [x, y, size?, label?, color?]
    const scatterData = safeData.map((d, i) => ({
      value: bubble && d.size != null ? [d.x, d.y, d.size] : [d.x, d.y],
      name: d.label ?? `Point ${i + 1}`,
      itemStyle: d.color ? { color: d.color } : undefined,
    }));

    // Bubble: symbolSize maps size field to visual radius
    const symbolSizeFn = bubble
      ? (val: number[]) => {
          const raw = val[2] ?? 10;
          return Math.max(6, Math.min(60, Math.sqrt(raw) * 4));
        }
      : 8;

    // Resolve legend before returning so the grid helper can read its
    // `show` / `orient` (Codex 019defa5 PARTIAL).
    const responsiveLegend = buildResponsiveLegend({
      breakpoint,
      showLegend,
      // Scatter is single-series at the legend level (one symbol type).
      hasMultiSeries: false,
      seriesCount: 1,
      densitySpacingMultiplier,
      densityFontMultiplier,
      icon: 'circle',
    });

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
              fontFamily,
              color: textPrimary,
              fontSize: scaleFontSize(16, densityFontMultiplier),
              fontWeight: 600,
            },
            subtextStyle: {
              fontFamily,
              color: textSecondary,
              fontSize: scaleFontSize(13, densityFontMultiplier),
            },
          }
        : undefined,
      tooltip: {
        trigger: 'item',
        confine: true,
        textStyle: { fontFamily, fontSize: scaleFontSize(13, densityFontMultiplier) },
        formatter: (params: unknown) => {
          const p = params as { value: number[]; name: string };
          const xVal = fmt(p.value[0]);
          const yVal = fmt(p.value[1]);
          const label = p.name && !p.name.startsWith('Point ') ? ` — ${escapeHtml(p.name)}` : '';
          return `(${escapeHtml(xVal)}, ${escapeHtml(yVal)})${label}`;
        },
      },
      legend: {
        ...responsiveLegend,
        // Preserve the explicit text style so the scatter chart keeps its
        // CSS-var-driven palette even when the helper's textStyle wins.
        textStyle: {
          fontFamily,
          color: textPrimary,
          fontSize: scaleFontSize(12, densityFontMultiplier),
        },
      },
      grid: buildResponsiveGrid({
        breakpoint,
        hasTitle: !!title,
        // Codex 019defa5 PARTIAL fix: derive padding from the resolved
        // legend's orient so mobile bottom legends don't overlap axes.
        hasBottomLegend: responsiveLegend.show && responsiveLegend.orient === 'horizontal',
        hasRightLegend: responsiveLegend.show && responsiveLegend.orient === 'vertical',
        density: {
          titleTop: scalePadding(60, densityPaddingMultiplier),
          contentTop: scalePadding(24, densityPaddingMultiplier),
          sidePadding: scalePadding(16, densityPaddingMultiplier),
          legendBottom: scalePadding(48, densityPaddingMultiplier),
          plainBottom: scalePadding(24, densityPaddingMultiplier),
        },
      }),
      xAxis: {
        type: 'value',
        name: xLabel,
        nameLocation: 'center',
        nameGap: scaleSpacing(28, densitySpacingMultiplier),
        nameTextStyle: {
          fontFamily,
          color: textSecondary,
          fontSize: scaleFontSize(12, densityFontMultiplier),
        },
        axisLine: { lineStyle: { color: borderDefault } },
        axisTick: { lineStyle: { color: borderDefault } },
        axisLabel: {
          color: textSecondary,
          fontFamily,
          fontSize: scaleFontSize(11, densityFontMultiplier),
          // Value axes need hideOverlap too — wide ranges (1k–1M) pile up
          // tick labels otherwise (Codex 019defa5 collision defaults).
          hideOverlap: true,
          formatter: (v: number) => fmt(v),
        },
        splitLine: {
          show: showGrid,
          lineStyle: { color: bgMuted, type: 'dashed' as const },
        },
      },
      yAxis: {
        type: 'value',
        name: yLabel,
        nameLocation: 'center',
        nameGap: scaleSpacing(40, densitySpacingMultiplier),
        nameTextStyle: {
          fontFamily,
          color: textSecondary,
          fontSize: scaleFontSize(12, densityFontMultiplier),
        },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: textSecondary,
          fontFamily,
          fontSize: scaleFontSize(11, densityFontMultiplier),
          hideOverlap: true,
          formatter: (v: number) => fmt(v),
        },
        splitLine: {
          show: showGrid,
          lineStyle: { color: bgMuted, type: 'dashed' as const },
        },
      },
      series: [
        {
          type: 'scatter',
          data: scatterData,
          symbolSize: symbolSizeFn,
          itemStyle: {
            color: palette[0],
          },
          emphasis: {
            focus: 'self',
            itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.2)' },
          },
        },
      ],
      aria: {
        enabled: true,
        label: {
          description: description
            ? escapeHtml(description)
            : title
              ? `Scatter chart: ${escapeHtml(title)}`
              : 'Scatter chart',
        },
        ...(decalEnabled ? { decal: { show: true, decals: decalPatterns } } : {}),
      },
    } as EChartsOption;
  }, [
    data,
    safeData,
    showGrid,
    showLegend,
    valueFormatter,
    animate,
    colors,
    title,
    description,
    xLabel,
    yLabel,
    bubble,
    isEmpty,
    fmt,
    themeObject,
    decalEnabled,
    decalPatterns,
    densityFontMultiplier,
    densitySpacingMultiplier,
    densityPaddingMultiplier,
    effectivePalette,
    breakpoint,
  ]);

  // Cross-filter adapter — Codex thread 019e0c25 absorb. ECharts scatter
  // emits `params.value = [x, y]` or `[x, y, size]` (bubble). Some
  // configurations also expose `params.data` as the original
  // `ScatterDataPoint`. Build a structured datum so the cross-filter
  // wrapper can emit fields like `label`, `x`, `y`, `size`, or
  // `dataIndex`.
  const handleClick = useCallback(
    (params: unknown) => {
      if (!onDataPointClick) return;
      const p = params as {
        data?: unknown;
        value?: unknown;
        name?: string;
        dataIndex?: number;
      };
      const valueArr = Array.isArray(p.value) ? (p.value as number[]) : null;
      const x = valueArr?.[0];
      const y = valueArr?.[1];
      const sz = valueArr?.[2];
      const raw =
        typeof p.data === 'object' && p.data !== null ? (p.data as Record<string, unknown>) : {};
      const label =
        (typeof raw.label === 'string' ? (raw.label as string) : undefined) ??
        (p.name && p.name.length > 0 ? p.name : undefined) ??
        (typeof x === 'number' && typeof y === 'number' ? `(${x}, ${y})` : undefined);
      onDataPointClick({
        datum: {
          x,
          y,
          size: typeof sz === 'number' ? sz : undefined,
          label,
          dataIndex: typeof p.dataIndex === 'number' ? p.dataIndex : undefined,
        },
        value: typeof y === 'number' ? y : undefined,
        label,
      });
    },
    [onDataPointClick],
  );

  // Use centralized renderer hook
  const { containerRef, instance } = useEChartsRenderer({
    option: option ?? ({} as EChartsOption),
    theme: themeObject,
    respectReducedMotion: true,
    onClick: onDataPointClick ? handleClick : undefined,
  });

  // Faz 21.5-B PR-B2: default-on a11y. ScatterChart is 2D — flatten
  // each point to {label: explicit-label-or-coordinate, value: y}
  // for SR consumption. The hidden table shows label + y-value;
  // x-coordinates surface only via tooltip (ECharts handles them).
  const a11yData = useMemo(
    () =>
      safeData.map((d, i) => ({
        label: d.label ?? `Point ${i + 1} (${d.x}, ${d.y})`,
        value: d.y,
      })),
    [safeData],
  );
  const a11y = useChartA11y({
    chartType: 'scatter',
    data: a11yData,
    title,
    description,
    valueFormatter: fmt,
    echartsInstance: instance,
  });

  // Merge refs
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
        data-testid="scatter-chart-empty"
        {...rest}
      >
        {noDataText}
      </div>
    );
  }

  return (
    <ChartA11yShell
      a11y={a11y}
      className={className}
      height={height}
      testId="scatter-chart"
      setRefs={setRefs}
      {...rest}
    />
  );
});

ScatterChartInner.displayName = 'ScatterChartInner';

/**
 * ScatterChart — public wrapper. Accepts `access` + `accessReason`
 * (`AccessControlledProps`) and forwards everything else to
 * `ScatterChartInner`. Faz 21.4 PR-E2 wiring; default `access === undefined`
 * follows the identity-transform path through `ChartAccessGate`.
 */
export const ScatterChart = React.forwardRef<HTMLDivElement, ScatterChartProps>(
  function ScatterChart({ access, accessReason, onDataPointClick, ...rest }, ref) {
    // Access-aware callback gating — Codex iter-2 absorb.
    const { state } = resolveAccessState(access);
    return (
      <ChartAccessGate access={access} accessReason={accessReason}>
        <ScatterChartInner
          ref={ref}
          {...rest}
          onDataPointClick={guardChartCallback(state, onDataPointClick)}
        />
      </ChartAccessGate>
    );
  },
);
ScatterChart.displayName = 'ScatterChart';

export default ScatterChart;
