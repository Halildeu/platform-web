'use client';

/**
 * TreemapChart -- ECharts-powered hierarchical treemap
 *
 * Supports nested data structures with drill-down, breadcrumb navigation,
 * color saturation mapping, and custom value formatting. Uses the
 * centralized useEChartsRenderer hook for lifecycle management.
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
import { buildResponsiveLegend } from './responsive';
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

// Markup overlay (Codex thread 019e0df1) — Treemap is NO-OP
// (hierarchical chart, no x/y axis semantics).
export type { ChartMarkup, ChartMarkupClickEvent } from './types';
import type { ChartMarkup, ChartMarkupClickEvent } from './types';
import { useMarkupAdapter } from './annotations/useMarkupAdapter';

export type TreemapNode = {
  /** Display name for the node. */
  name: string;
  /** Numeric value determining node area. */
  value?: number;
  /** Nested children for hierarchical data. */
  children?: TreemapNode[];
  /** Per-node style override. */
  itemStyle?: { color?: string };
};

export interface TreemapChartProps extends AccessControlledProps {
  /** Hierarchical tree data. */
  data: TreemapNode[];
  /** Visual size variant. @default "md" */
  size?: ChartSize;
  /** Chart title. */
  title?: string;
  /** Show legend below the chart. @default false */
  showLegend?: boolean;
  /** Show breadcrumb navigation on drill-down. @default true */
  showBreadcrumb?: boolean;
  /** Maximum visible depth (1 = only root children). @default 1 */
  leafDepth?: number;
  /** Pan/zoom mode. @default false */
  roam?: boolean | 'move' | 'scale';
  /** Saturation range for color mapping. @default [0.35, 0.5] */
  colorSaturation?: [number, number];
  /** Minimum area (px^2) to render a label. @default 300 */
  visibleMin?: number;
  /** Custom formatter for displayed values. */
  valueFormatter?: (v: number) => string;
  /**
   * Legacy callback fired when a node is clicked. Receives a tight
   * `{ name, value, data }` shape and remains the canonical surface
   * for non-cross-filter consumers. Coexists with the new
   * `onDataPointClick` (canonical `ChartClickEvent`); when both are
   * supplied, `onDataPointClick` fires FIRST and `onNodeClick` fires
   * second so cross-filter forwarding never blocks the legacy
   * handler. Codex iter-2 thread 019e0c25 absorb.
   */
  onNodeClick?: (params: { name: string; value: number; data: unknown }) => void;
  /**
   * Canonical cross-filter callback. Emits a `ChartClickEvent` with
   * `datum: { name, label: name, value, treePathInfo, path, depth,
   * data }`. `depth` is derived from `treePathInfo.length - 1` and
   * defaults to `0` when ECharts doesn't surface the breadcrumb.
   */
  onDataPointClick?: (event: ChartClickEvent) => void;
  /** Visual overlay markups — NO-OP on Treemap (Codex 019e0df1). */
  markups?: ChartMarkup[];
  /** Callback fired when a markup overlay is clicked (no-op on Treemap). */
  onMarkupClick?: (event: ChartMarkupClickEvent) => void;
  /** Animate on mount. @default true */
  animate?: boolean;
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
 * Compute the maximum depth of the tree to generate the right number
 * of levels configuration (dynamic, not hardcoded).
 */
function getMaxDepth(nodes: TreemapNode[], current = 1): number {
  let maxD = current;
  for (const node of nodes) {
    if (node.children && node.children.length > 0) {
      maxD = Math.max(maxD, getMaxDepth(node.children, current + 1));
    }
  }
  return maxD;
}

/**
 * Build ECharts levels array dynamically based on tree depth.
 * Level 0 = invisible root, levels 1..N = visible depth layers.
 */
function buildLevels(depth: number, colorSaturation: [number, number]): Record<string, unknown>[] {
  const levels: Record<string, unknown>[] = [];

  // Level 0 — invisible root
  levels.push({
    itemStyle: {
      borderColor: '#fff',
      borderWidth: 2,
      gapWidth: 2,
    },
  });

  for (let i = 1; i <= depth; i++) {
    const isLeaf = i === depth;
    levels.push({
      colorSaturation,
      itemStyle: {
        borderColor: '#fff',
        borderWidth: isLeaf ? 1 : 2,
        gapWidth: isLeaf ? 1 : 2,
        borderColorSaturation: 0.6,
      },
      upperLabel: {
        show: !isLeaf,
        height: 14,
        fontSize: 10,
        color: '#333',
        padding: [2, 4, 0, 4],
      },
    });
  }

  return levels;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * TreemapChart inner — original hook-bearing body. The outer `TreemapChart`
 * wrapper below adds the `access` / `accessReason` gate without touching
 * hook order (Faz 21.4 PR-E2). Accepting `Omit<TreemapChartProps, 'access' |
 * 'accessReason'>` keeps the inner contract honest: access is resolved
 * exactly once, in the outer wrapper, never re-read inside the hooks.
 */
const TreemapChartInner = React.forwardRef<
  HTMLDivElement,
  Omit<TreemapChartProps, 'access' | 'accessReason'>
>(function TreemapChartInner(
  {
    data,
    size = 'md',
    title,
    showLegend = false,
    showBreadcrumb = true,
    leafDepth = 1,
    roam = false,
    colorSaturation = [0.35, 0.5],
    visibleMin = 300,
    valueFormatter,
    onNodeClick,
    onDataPointClick,
    markups,
    onMarkupClick: _onMarkupClick,
    animate = true,
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

  // Markup overlay adapter — Codex 019e0df1. NO-OP on Treemap.
  useMarkupAdapter(markups, { chartType: 'treemap' });

  // Faz 21.9 PR3d: container ref + breakpoint for responsive treemap.
  const ownContainerRef = useRef<HTMLDivElement | null>(null);
  const breakpoint = useResponsiveBreakpoint(ownContainerRef);
  const fmt = valueFormatter ?? formatCompact;

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

    const maxDepth = getMaxDepth(data);
    const levels = buildLevels(maxDepth, colorSaturation);

    const labelFormatter = (params: { name: string; value: number }) => {
      const formatted = fmt(params.value);
      return `${escapeHtml(params.name)}\n${escapeHtml(formatted)}`;
    };

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
        formatter: (params: { name: string; value: number }) => {
          const val = escapeHtml(fmt(params.value));
          return `<strong>${escapeHtml(params.name)}</strong><br/>${val}`;
        },
      },
      legend: buildResponsiveLegend({
        breakpoint,
        showLegend,
        hasMultiSeries: false,
        seriesCount: 1,
        densitySpacingMultiplier,
        densityFontMultiplier,
        icon: 'roundRect',
        truncateAt: breakpoint === 'mobile' ? 12 : 18,
      }),
      series: [
        {
          type: 'treemap' as const,
          data,
          leafDepth,
          roam,
          visibleMin,
          label: {
            show: true,
            formatter: labelFormatter,
            fontSize: scaleFontSize(12, densityFontMultiplier),
            ellipsis: true,
          },
          upperLabel: {
            show: true,
            height: 16,
            fontSize: scaleFontSize(11, densityFontMultiplier),
            color: '#333',
            padding: [2, 4, 0, 4],
          },
          breadcrumb: {
            show: showBreadcrumb,
            left: 'center',
            bottom: showLegend ? 28 : 4,
            itemStyle: {
              textStyle: { fontSize: scaleFontSize(11, densityFontMultiplier) },
            },
          },
          levels,
          itemStyle: {
            borderColor: '#fff',
            borderWidth: 1,
            gapWidth: 1,
          },
          colorMappingBy: 'id',
          emphasis: {
            itemStyle: {
              borderColor: '#333',
              borderWidth: 1,
            },
          },
        },
      ],
      color: effectivePalette ?? DEFAULT_PALETTE,
      aria: {
        enabled: true,
        label: {
          description: title ? `Treemap chart: ${escapeHtml(title)}` : 'Treemap chart',
        },
        ...(decalEnabled ? { decal: { show: true, decals: decalPatterns } } : {}),
      },
    } as EChartsOption;
  }, [
    data,
    title,
    showLegend,
    showBreadcrumb,
    leafDepth,
    roam,
    colorSaturation,
    visibleMin,
    fmt,
    animate,
    isEmpty,
    decalEnabled,
    decalPatterns,
    densityFontMultiplier,
    densitySpacingMultiplier,
    effectivePalette,
    breakpoint,
  ]);

  const handleClick = useCallback(
    (params: unknown) => {
      // Coexistence — Codex iter-2 thread 019e0c25 absorb: cross-filter
      // wrapper requires the new `ChartClickEvent` shape, but legacy
      // consumers still rely on the tighter `{name,value,data}` callback.
      // Fire `onDataPointClick` FIRST so the cross-filter bus sees the
      // event before any side-effects of the legacy handler; then fire
      // `onNodeClick` for backward compatibility.
      const p = params as {
        name?: string;
        value?: number;
        data?: unknown;
        treePathInfo?: Array<{ name: string; value: number; dataIndex: number }>;
      };
      const value = typeof p.value === 'number' ? p.value : 0;
      const name = typeof p.name === 'string' ? p.name : '';

      if (onDataPointClick) {
        const treePathInfo = Array.isArray(p.treePathInfo) ? p.treePathInfo : undefined;
        const path = treePathInfo ? treePathInfo.map((t) => t.name).join(' > ') : undefined;
        // depth = treePathInfo.length - 1 (root counted), 0 fallback when
        // ECharts doesn't surface the breadcrumb.
        const depth = treePathInfo && treePathInfo.length > 0 ? treePathInfo.length - 1 : 0;
        onDataPointClick({
          datum: {
            name,
            label: name,
            value,
            treePathInfo,
            path,
            depth,
            data: p.data,
          },
          value,
          label: name,
        });
      }

      if (onNodeClick) {
        onNodeClick({ name, value, data: p.data });
      }
    },
    [onNodeClick, onDataPointClick],
  );

  const { containerRef, instance } = useEChartsRenderer({
    option: option ?? ({} as EChartsOption),
    theme: themeObject,
    respectReducedMotion: true,
    onClick: onNodeClick || onDataPointClick ? handleClick : undefined,
  });

  // Faz 21.5-B PR-B2: default-on a11y. Treemap is hierarchical —
  // flatten top-level nodes (recursive descent skipped to keep the
  // SR table digestible). Each node's name + value surfaces.
  const a11yData = useMemo(
    () =>
      (data ?? []).map((node) => ({
        label: node.name,
        value: node.value ?? 0,
      })),
    [data],
  );
  const a11y = useChartA11y({
    chartType: 'treemap',
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
        data-testid="treemap-chart-empty"
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
      testId="treemap-chart"
      setRefs={setRefs}
      {...rest}
    />
  );
});

TreemapChartInner.displayName = 'TreemapChartInner';

/**
 * TreemapChart — public wrapper. Accepts `access` + `accessReason`
 * (`AccessControlledProps`) and forwards everything else to
 * `TreemapChartInner`. Faz 21.4 PR-E2 wiring; default `access === undefined`
 * follows the identity-transform path through `ChartAccessGate`.
 */
export const TreemapChart = React.forwardRef<HTMLDivElement, TreemapChartProps>(
  function TreemapChart(
    { access, accessReason, onNodeClick, onDataPointClick, onMarkupClick, ...rest },
    ref,
  ) {
    const { state } = resolveAccessState(access);
    return (
      <ChartAccessGate access={access} accessReason={accessReason}>
        <TreemapChartInner
          ref={ref}
          {...rest}
          onNodeClick={guardChartCallback(state, onNodeClick)}
          onDataPointClick={guardChartCallback(state, onDataPointClick)}
          onMarkupClick={guardChartCallback(state, onMarkupClick)}
        />
      </ChartAccessGate>
    );
  },
);
TreemapChart.displayName = 'TreemapChart';

export default TreemapChart;
