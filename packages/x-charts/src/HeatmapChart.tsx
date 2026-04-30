/**
 * HeatmapChart -- ECharts-powered heatmap grid
 *
 * Supports both tuple and object data formats, auto-detected min/max,
 * continuous visual mapping, value labels, and custom cell sizing.
 * Uses the centralized useEChartsRenderer hook for lifecycle management.
 *
 * @migration AG Charts -> ECharts (P3)
 */
import React, { useMemo, useCallback } from 'react';
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
import { scaleFontSize, scalePadding } from './theme/density-helpers';
import { formatCompact } from './utils/formatters';
import { sanitizeNumber } from './utils/data-validation';
import type { EChartsOption } from './renderers/echarts-imports';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ChartSize = 'sm' | 'md' | 'lg';

export type HeatmapTupleData = [number, number, number];

export type HeatmapObjectData = {
  x: number | string;
  y: number | string;
  value: number;
};

export interface HeatmapChartProps {
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
  /** Callback fired when a cell is clicked. */
  onCellClick?: (params: { x: number; y: number; value: number }) => void;
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

const SIZE_HEIGHT: Record<ChartSize, number> = { sm: 200, md: 300, lg: 400 };

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

export const HeatmapChart = React.forwardRef<HTMLDivElement, HeatmapChartProps>(
  function HeatmapChart(
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
      className,
      theme: themePreference = 'auto',
      decal: decalPreference = 'auto',
      density: densityPreference = 'auto',
      accent: accentPreference = 'auto',
      ...rest
    },
    forwardedRef,
  ) {
    const height = SIZE_HEIGHT[size];
    const isEmpty = !data || data.length === 0;
    const fmt = valueFormatter ?? formatCompact;

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

    const option = useMemo((): EChartsOption | null => {
      if (isEmpty) return null;

      const { normalized, xCats, yCats, dataMin, dataMax } = normalizeData(data, xLabels, yLabels);

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
        grid: {
          top: title
            ? scalePadding(56, densityPaddingMultiplier)
            : scalePadding(20, densityPaddingMultiplier),
          right: showLegend
            ? scalePadding(80, densityPaddingMultiplier)
            : scalePadding(16, densityPaddingMultiplier),
          bottom: scalePadding(24, densityPaddingMultiplier),
          left: scalePadding(16, densityPaddingMultiplier),
          containLabel: true,
        },
        xAxis: {
          type: 'category' as const,
          data: xCats,
          splitArea: { show: true },
          axisLabel: { fontSize: scaleFontSize(11, densityFontMultiplier) },
          axisTick: { alignWithLabel: true },
        },
        yAxis: {
          type: 'category' as const,
          data: yCats,
          splitArea: { show: true },
          axisLabel: { fontSize: scaleFontSize(11, densityFontMultiplier) },
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
        series: [
          {
            type: 'heatmap' as const,
            data: normalized,
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
    ]);

    const handleClick = useCallback(
      (params: unknown) => {
        if (!onCellClick) return;
        const p = params as { data: [number, number, number] };
        if (Array.isArray(p.data) && p.data.length >= 3) {
          onCellClick({
            x: p.data[0],
            y: p.data[1],
            value: p.data[2],
          });
        }
      },
      [onCellClick],
    );

    const { containerRef, instance } = useEChartsRenderer({
      option: option ?? ({} as EChartsOption),
      theme: themeObject,
      respectReducedMotion: true,
      onClick: onCellClick ? handleClick : undefined,
    });

    // Faz 21.5-B PR-B2: default-on a11y. Heatmap is a 2D matrix —
    // flatten each cell to "(xCat, yCat) → value". Order preserves
    // ECharts' visualization order (left-to-right, top-to-bottom).
    const a11yData = useMemo(() => {
      if (isEmpty) return [];
      try {
        const norm = normalizeData(data, xLabels, yLabels);
        const { normalized, xCats, yCats } = norm;
        return normalized.map(([xi, yi, v]) => ({
          label: `(${xCats[xi] ?? xi}, ${yCats[yi] ?? yi})`,
          value: v,
        }));
      } catch {
        return [];
      }
    }, [data, xLabels, yLabels, isEmpty]);
    const a11y = useChartA11y({
      chartType: 'heatmap',
      data: a11yData,
      title,
      valueFormatter: fmt,
      echartsInstance: instance,
    });

    const setRefs = useCallback(
      (node: HTMLDivElement | null) => {
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
  },
);

HeatmapChart.displayName = 'HeatmapChart';

export default HeatmapChart;
