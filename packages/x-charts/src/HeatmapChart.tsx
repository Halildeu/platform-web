'use client';

/**
 * HeatmapChart -- ECharts-powered heatmap grid
 *
 * Supports both tuple and object data formats, auto-detected min/max,
 * continuous visual mapping, value labels, and custom cell sizing.
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
import { useEChartsRenderer } from './renderers';
import { useResponsiveBreakpoint } from './useResponsiveChart';
import { buildResponsiveAxisLabel, buildResponsiveGrid } from './responsive';
import { ChartA11yShell, useChartA11y } from './a11y';
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
import { sanitizeNumber } from './utils/data-validation';
import type { EChartsOption } from './renderers/echarts-imports';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ChartSize = 'sm' | 'md' | 'lg';

// Cross-filter rollout sweep — Codex thread 019e0c25 absorb. Re-export
// the canonical `ChartClickEvent` so the cross-filter wrapper sees a
// single shape across all 13 chart adapters.
export type { ChartClickEvent } from './types';
import type { ChartClickEvent as ChartClickEventCanonical } from './types';
type ChartClickEvent = ChartClickEventCanonical;

// Markup overlay (Codex thread 019e0df1).
export type { ChartMarkup, ChartMarkupClickEvent } from './types';
import type { ChartMarkup, ChartMarkupClickEvent } from './types';
import { useMarkupAdapter } from './annotations/useMarkupAdapter';
import { mergeMarkupPatches } from './annotations/mergeMarkupPatches';

export type HeatmapTupleData = [number, number, number];

export type HeatmapObjectData = {
  x: number | string;
  y: number | string;
  value: number;
};

export interface HeatmapChartProps extends AccessControlledProps {
  /** Heatmap data in tuple [x, y, value] or object format. */
  data: HeatmapTupleData[] | HeatmapObjectData[];
  /** X-axis category labels. */
  xLabels?: string[];
  /** Y-axis category labels. */
  yLabels?: string[];
  /** Visual size variant. @default "md" */
  size?: ChartSize;
  /** Chart title. */
  title?: string;
  /** Minimum data value for color scale. Auto-detected if not provided. */
  min?: number;
  /** Maximum data value for color scale. Auto-detected if not provided. */
  max?: number;
  /** Color gradient endpoints [low, high]. @default ['#f5f5f5', '#3b82f6'] */
  colors?: [string, string];
  /** Show value text on each cell. @default false */
  showValues?: boolean;
  /** Custom formatter for cell value display. */
  valueFormatter?: (v: number) => string;
  /** Cell size override; "auto" fits to container. @default "auto" */
  cellSize?: number | 'auto';
  /** Show visual map legend. @default true */
  showLegend?: boolean;
  /** Animate on mount. @default true */
  animate?: boolean;
  /**
   * Legacy callback fired when a cell is clicked. Receives a tight
   * `{ x, y, value }` shape (numeric category indices). Coexists with
   * the new `onDataPointClick`; when both are supplied,
   * `onDataPointClick` fires FIRST and `onCellClick` fires second so
   * cross-filter forwarding never blocks the legacy handler. Codex
   * iter-2 thread 019e0c25 absorb.
   */
  onCellClick?: (params: { x: number; y: number; value: number }) => void;
  /**
   * Canonical cross-filter callback. Emits a `ChartClickEvent` with
   * `datum: { x, y, xLabel, yLabel, value, label: '${xLabel}/${yLabel}' }`
   * — `x`/`y` are numeric category indices; `xLabel`/`yLabel` are the
   * resolved category strings (which the cross-filter wrapper would
   * typically emit as filter values).
   */
  onDataPointClick?: (event: ChartClickEvent) => void;
  /** Visual overlay markups (Codex thread 019e0df1). */
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
  /** Density override. @default "auto" */
  density?: ChartDensityPreference;
  /**
   * Accent palette override.
   * @default "auto"
   * @remarks HeatmapChart's `colors` (low/high gradient) is SEMANTIC and NOT
   *   changed by accent. The accent prop is accepted for API consistency.
   *   To change gradient endpoints, use the `colors` prop directly.
   */
  accent?: ChartAccentPreference;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const _DEFAULT_PALETTE = [
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
 * Type guard: check if data items are object format (have 'x' key).
 */
function isObjectData(data: HeatmapTupleData[] | HeatmapObjectData[]): data is HeatmapObjectData[] {
  return (
    data.length > 0 && typeof data[0] === 'object' && !Array.isArray(data[0]) && 'x' in data[0]
  );
}

/**
 * Normalize heterogeneous input data into uniform [xIndex, yIndex, value] tuples,
 * and extract xLabels / yLabels when they are not explicitly provided.
 */
function normalizeData(
  data: HeatmapTupleData[] | HeatmapObjectData[],
  xLabels?: string[],
  yLabels?: string[],
): {
  normalized: [number, number, number][];
  xCats: string[];
  yCats: string[];
  dataMin: number;
  dataMax: number;
} {
  if (isObjectData(data)) {
    // Object format: extract unique labels if not provided
    const xSet = xLabels ?? [...new Set(data.map((d) => String(d.x)))];
    const ySet = yLabels ?? [...new Set(data.map((d) => String(d.y)))];

    const normalized: [number, number, number][] = data.map((d) => [
      xSet.indexOf(String(d.x)),
      ySet.indexOf(String(d.y)),
      d.value,
    ]);

    const values = data.map((d) => d.value);
    return {
      normalized,
      xCats: xSet,
      yCats: ySet,
      dataMin: Math.min(...values),
      dataMax: Math.max(...values),
    };
  }

  // Tuple format: [x, y, value] — use labels if provided
  const tuples = data as HeatmapTupleData[];
  const xCats = xLabels ?? [...new Set(tuples.map((t) => String(t[0])))];
  const yCats = yLabels ?? [...new Set(tuples.map((t) => String(t[1])))];
  const values = tuples.map((t) => t[2]);

  // If string labels were provided, remap numeric indices
  const normalized: [number, number, number][] = xLabels
    ? tuples.map((t) => [t[0], t[1], t[2]])
    : tuples;

  return {
    normalized,
    xCats,
    yCats,
    dataMin: Math.min(...values),
    dataMax: Math.max(...values),
  };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * HeatmapChart inner — original hook-bearing body. The outer `HeatmapChart`
 * wrapper below adds the `access` / `accessReason` gate without touching
 * hook order (Faz 21.4 PR-E2). Accepting `Omit<HeatmapChartProps, 'access' |
 * 'accessReason'>` keeps the inner contract honest: access is resolved
 * exactly once, in the outer wrapper, never re-read inside the hooks.
 */
const HeatmapChartInner = React.forwardRef<
  HTMLDivElement,
  Omit<HeatmapChartProps, 'access' | 'accessReason'>
>(function HeatmapChartInner(
  {
    data,
    xLabels,
    yLabels,
    size = 'md',
    title,
    min: minProp,
    max: maxProp,
    colors = ['#f5f5f5', '#3b82f6'],
    showValues = false,
    valueFormatter,
    cellSize = 'auto',
    showLegend = true,
    animate = true,
    onCellClick,
    onDataPointClick,
    markups,
    onMarkupClick,
    className,
    theme: themePreference = 'auto',
    decal: decalPreference = 'auto',
    density: densityPreference = 'auto',
    accent: accentPreference = 'auto',
    ...rest
  },
  forwardedRef,
) {
  const height = CHART_CANVAS_HEIGHT[size];
  const isEmpty = !data || data.length === 0;
  const fmt = valueFormatter ?? formatCompact;

  // Faz 21.9 PR3c: container ref + breakpoint for responsive heatmap.
  const ownContainerRef = useRef<HTMLDivElement | null>(null);
  const breakpoint = useResponsiveBreakpoint(ownContainerRef);

  // HeatmapChart accent-IMMUNE — gradient `colors` are semantic; accent
  // prop accepted for API consistency. effectivePalette ignored.
  const {
    themeObject,
    decalEnabled,
    decalPatterns,
    densityFontMultiplier,
    densityPaddingMultiplier,
  } = useChartTheme({
    theme: themePreference,
    decal: decalPreference,
    density: densityPreference,
    accent: accentPreference,
  });

  // Shared normalize — Codex iter-2 thread 019e0c25 absorb. Previously
  // `normalizeData(...)` was called twice (option + a11yData) and the
  // click handler had no access to category labels. Hoisting to a
  // shared `useMemo` lets `option`, `handleClick` and `a11yData` all
  // read from one source — and the cross-filter datum can include
  // `xLabel`/`yLabel` resolved from `xCats`/`yCats`.
  const normalized = useMemo(() => {
    if (isEmpty) return null;
    try {
      return normalizeData(data, xLabels, yLabels);
    } catch {
      return null;
    }
  }, [data, xLabels, yLabels, isEmpty]);

  // Markup overlay adapter — Codex thread 019e0df1. dataContext uses
  // resolved categorical xLabels/yLabels (normalized.xCats/yCats) so
  // LabelMarkup with `dataIndex` anchor still resolves.
  const markupResult = useMarkupAdapter(markups, {
    chartType: 'heatmap',
    dataContext: {
      xLabels: normalized?.xCats,
      yLabels: normalized?.yCats,
      labels: normalized?.xCats,
    },
  });

  const option = useMemo((): EChartsOption | null => {
    if (isEmpty || !normalized) return null;

    const { normalized: norm, xCats, yCats, dataMin, dataMax } = normalized;

    const effectiveMin = minProp ?? dataMin;
    const effectiveMax = maxProp ?? dataMax;

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
        formatter: (params: { data: [number, number, number] }) => {
          const [xi, yi, val] = params.data;
          const xLabel = xCats[xi] ?? String(xi);
          const yLabel = yCats[yi] ?? String(yi);
          const display = escapeHtml(fmt(sanitizeNumber(val)));
          return `${escapeHtml(xLabel)} / ${escapeHtml(yLabel)}<br/><strong>${display}</strong>`;
        },
      },
      grid: buildResponsiveGrid({
        breakpoint,
        hasTitle: !!title,
        // Heatmap uses a vertical visualMap on the right when showLegend
        // is on, not a bottom legend strip — route via hasRightLegend so
        // the grid leaves room on the right side instead of the bottom.
        hasBottomLegend: false,
        hasRightLegend: showLegend,
        density: {
          titleTop: scalePadding(56, densityPaddingMultiplier),
          contentTop: scalePadding(20, densityPaddingMultiplier),
          sidePadding: scalePadding(16, densityPaddingMultiplier),
          legendBottom: scalePadding(24, densityPaddingMultiplier),
          plainBottom: scalePadding(24, densityPaddingMultiplier),
        },
      }),
      xAxis: {
        type: 'category' as const,
        data: xCats,
        splitArea: { show: true },
        axisLabel: buildResponsiveAxisLabel({
          breakpoint,
          labelCount: xCats.length,
          densityFontMultiplier,
          baseFontSize: 11,
        }),
        axisTick: { alignWithLabel: true },
      },
      yAxis: {
        type: 'category' as const,
        data: yCats,
        splitArea: { show: true },
        axisLabel: {
          ...buildResponsiveAxisLabel({
            breakpoint,
            labelCount: yCats.length,
            densityFontMultiplier,
            baseFontSize: 11,
          }),
          // Codex 019defa5 PR3c PARTIAL: helper rotates labels on mobile
          // when there are >4 of them — that's the right call for a
          // *horizontal* axis, but on a vertical axis (heatmap y) it
          // increases the dead-letter footprint and clips into the left
          // padding. Force rotate=0 here.
          rotate: 0,
        },
      },
      visualMap: {
        min: effectiveMin,
        max: effectiveMax,
        calculable: true,
        show: showLegend,
        orient: 'vertical' as const,
        right: 0,
        top: 'center',
        inRange: {
          color: colors,
        },
        textStyle: { fontSize: scaleFontSize(11, densityFontMultiplier) },
      },
      series: mergeMarkupPatches(
        [
          {
            type: 'heatmap' as const,
            data: norm,
            label: {
              show: showValues,
              fontSize: scaleFontSize(10, densityFontMultiplier),
              formatter: (params: { value: [number, number, number] }) =>
                escapeHtml(fmt(sanitizeNumber(params.value[2]))),
            },
            emphasis: {
              itemStyle: {
                borderColor: '#333',
                borderWidth: 2,
                shadowBlur: 8,
                shadowColor: 'rgba(0,0,0,0.25)',
              },
            },
            ...(cellSize !== 'auto' ? { itemStyle: { width: cellSize, height: cellSize } } : {}),
          },
        ],
        markupResult.seriesPatches,
      ),
      aria: {
        enabled: true,
        label: {
          description: title ? `Heatmap chart: ${escapeHtml(title)}` : 'Heatmap chart',
        },
        ...(decalEnabled ? { decal: { show: true, decals: decalPatterns } } : {}),
      },
    } as EChartsOption;
  }, [
    data,
    xLabels,
    yLabels,
    title,
    minProp,
    maxProp,
    colors,
    showValues,
    fmt,
    cellSize,
    showLegend,
    animate,
    isEmpty,
    decalEnabled,
    decalPatterns,
    densityFontMultiplier,
    densityPaddingMultiplier,
    breakpoint,
  ]);

  const handleClick = useCallback(
    (params: unknown) => {
      // Markup overlay click — Codex thread 019e0df1 absorb. Early
      // return so neither cross-filter nor legacy onCellClick fires
      // for an overlay event.
      const pAny = params as {
        componentType?: string;
        name?: string;
        seriesIndex?: number;
        dataIndex?: number;
      };
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
            chartType: 'heatmap',
            seriesIndex: pAny.seriesIndex,
            dataIndex: pAny.dataIndex,
            nativeParams: params,
          });
        }
        return;
      }

      // Coexistence — Codex iter-2 thread 019e0c25 absorb: cross-filter
      // wrapper requires the canonical `ChartClickEvent` shape; legacy
      // consumers still rely on `onCellClick` with numeric indices.
      // Fire `onDataPointClick` FIRST so the cross-filter bus sees the
      // event before the legacy handler's side effects, then the
      // legacy callback for backward compatibility.
      const p = params as { data?: [number, number, number] };
      if (!Array.isArray(p.data) || p.data.length < 3) return;
      const [xi, yi, v] = p.data;

      if (onDataPointClick) {
        const xLabel = normalized?.xCats[xi] ?? String(xi);
        const yLabel = normalized?.yCats[yi] ?? String(yi);
        onDataPointClick({
          datum: {
            x: xi,
            y: yi,
            xLabel,
            yLabel,
            value: v,
            label: `${xLabel}/${yLabel}`,
          },
          value: v,
          label: `${xLabel}/${yLabel}`,
        });
      }

      if (onCellClick) {
        onCellClick({ x: xi, y: yi, value: v });
      }
    },
    [onCellClick, onDataPointClick, onMarkupClick, normalized, markupResult],
  );

  const { containerRef, instance } = useEChartsRenderer({
    option: option ?? ({} as EChartsOption),
    theme: themeObject,
    respectReducedMotion: true,
    onClick: onCellClick || onDataPointClick || onMarkupClick ? handleClick : undefined,
  });

  // Faz 21.5-B PR-B2: default-on a11y. Heatmap is a 2D matrix —
  // flatten each cell to "(xCat, yCat) → value". Order preserves
  // ECharts' visualization order (left-to-right, top-to-bottom).
  // Reads from the shared `normalized` memo (Codex iter-2 absorb).
  const a11yData = useMemo(() => {
    if (!normalized) return [];
    const { normalized: cells, xCats, yCats } = normalized;
    return cells.map(([xi, yi, v]) => ({
      label: `(${xCats[xi] ?? xi}, ${yCats[yi] ?? yi})`,
      value: v,
    }));
  }, [normalized]);
  const a11y = useChartA11y({
    chartType: 'heatmap',
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
        data-testid="heatmap-chart-empty"
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
      testId="heatmap-chart"
      setRefs={setRefs}
      {...rest}
    />
  );
});

HeatmapChartInner.displayName = 'HeatmapChartInner';

/**
 * HeatmapChart — public wrapper. Accepts `access` + `accessReason`
 * (`AccessControlledProps`) and forwards everything else to
 * `HeatmapChartInner`. Faz 21.4 PR-E2 wiring; default `access === undefined`
 * follows the identity-transform path through `ChartAccessGate`.
 */
export const HeatmapChart = React.forwardRef<HTMLDivElement, HeatmapChartProps>(
  function HeatmapChart(
    { access, accessReason, onCellClick, onDataPointClick, onMarkupClick, ...rest },
    ref,
  ) {
    const { state } = resolveAccessState(access);
    return (
      <ChartAccessGate access={access} accessReason={accessReason}>
        <HeatmapChartInner
          ref={ref}
          {...rest}
          onCellClick={guardChartCallback(state, onCellClick)}
          onDataPointClick={guardChartCallback(state, onDataPointClick)}
          onMarkupClick={guardChartCallback(state, onMarkupClick)}
        />
      </ChartAccessGate>
    );
  },
);
HeatmapChart.displayName = 'HeatmapChart';

export default HeatmapChart;
