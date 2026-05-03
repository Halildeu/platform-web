'use client';

/**
 * SunburstChart -- ECharts-powered hierarchical sunburst chart
 *
 * Renders a hierarchical ring visualization where each concentric ring
 * represents a level in the data tree. Supports configurable radius,
 * sorting, per-level styling, and descendant/ancestor highlighting.
 *
 * Uses the centralized useEChartsRenderer hook for lifecycle management.
 *
 * @migration AG Charts -> ECharts (P3)
 */
import React, { useMemo, useCallback } from 'react';
import type { AccessControlledProps } from '@mfe/shared-types';
import { resolveAccessState } from '@mfe/shared-types';
import { ChartAccessGate } from './access/ChartAccessGate';
import { guardChartCallback } from './access/guardChartCallback';
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
import { scaleFontSize, scaleSpacing } from './theme/density-helpers';
import { CHART_CANVAS_HEIGHT } from './chartSize';
import { formatCompact } from './utils/formatters';
import type { EChartsOption } from './renderers/echarts-imports';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface SunburstNode {
  /** Display name for this node. */
  name: string;
  /** Leaf value. For branches, ECharts aggregates children automatically. */
  value?: number;
  /** Child nodes forming the next ring outward. */
  children?: SunburstNode[];
  /** Optional per-node style overrides. */
  itemStyle?: { color?: string; [key: string]: unknown };
}

export interface SunburstLevelConfig {
  /** Inner radius for this level (e.g. "15%"). */
  r0?: string;
  /** Outer radius for this level (e.g. "35%"). */
  r1?: string;
  /** Item style overrides for this level. */
  itemStyle?: Record<string, unknown>;
  /** Label overrides for this level. */
  label?: Record<string, unknown>;
}

export type SunburstHighlightPolicy = 'descendant' | 'ancestor' | 'self' | 'none';

export interface SunburstChartProps extends AccessControlledProps {
  /** Hierarchical data tree (top-level children form the inner ring). */
  data: SunburstNode[];
  /** Visual size variant. @default "md" */
  size?: 'sm' | 'md' | 'lg';
  /** Chart title. */
  title?: string;
  /** Per-level ring configuration. Auto-generated from data depth when omitted. */
  levels?: SunburstLevelConfig[];
  /** Sort order for sibling nodes. @default "desc" */
  sort?: 'desc' | 'asc' | null;
  /** Sunburst inner/outer radius range. @default ["0%", "90%"] */
  radius?: [string, string];
  /** Which nodes to highlight on hover. @default "descendant" */
  highlightPolicy?: SunburstHighlightPolicy;
  /** Show legend below the chart. @default false */
  showLegend?: boolean;
  /** Custom value formatter for labels and tooltip. */
  valueFormatter?: (v: number) => string;
  /** Animate on mount. @default true */
  animate?: boolean;
  /** Callback fired when a node is clicked. */
  onNodeClick?: (params: { name: string; value: number; data: unknown }) => void;
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
 * Compute the maximum depth of a sunburst tree by DFS traversal.
 * Root level (the passed-in array) = depth 0.
 */
function computeMaxDepth(nodes: SunburstNode[], current = 0): number {
  let max = current;
  for (const node of nodes) {
    if (node.children && node.children.length > 0) {
      const childDepth = computeMaxDepth(node.children, current + 1);
      if (childDepth > max) max = childDepth;
    }
  }
  return max;
}

/**
 * Auto-generate level configs based on the data tree depth.
 * Distributes the available radius range evenly across levels.
 * Deeper levels get smaller labels to reduce visual clutter.
 *
 * Codex iter-9 fix: deep-level fontSize must respect MIN_FONT_SIZE_PX (10).
 * Old `Math.max(9, 12 - i)` violated a11y minimum at i=3+. We now clamp via
 * scaleFontSize which guarantees >=10, and apply density multiplier so
 * compact mode shrinks the base proportionally.
 */
function autoLevels(
  maxDepth: number,
  radius: [string, string],
  densityFontMultiplier: number,
): SunburstLevelConfig[] {
  const totalLevels = maxDepth + 1;
  const innerPct = parseFloat(radius[0]) || 0;
  const outerPct = parseFloat(radius[1]) || 90;
  const range = outerPct - innerPct;
  const step = range / totalLevels;

  const levels: SunburstLevelConfig[] = [];
  for (let i = 0; i < totalLevels; i++) {
    const r0 = innerPct + step * i;
    const r1 = innerPct + step * (i + 1);
    // Base font size 12 at root, gradually shrink for deeper levels (12, 11, 10, 10, ...)
    // scaleFontSize automatically clamps below MIN_FONT_SIZE_PX (10).
    const baseFontSize = Math.max(10, 12 - i);
    levels.push({
      r0: `${r0.toFixed(1)}%`,
      r1: `${r1.toFixed(1)}%`,
      itemStyle: {
        borderWidth: 2,
        borderColor: 'var(--bg-surface, #ffffff)',
      },
      label: {
        show: i < 3,
        fontSize: scaleFontSize(baseFontSize, densityFontMultiplier),
        rotate: i === 0 ? 0 : 'tangential',
      },
    });
  }
  return levels;
}

/**
 * Map highlightPolicy prop to the ECharts emphasis.focus value.
 */
function resolveHighlightFocus(policy: SunburstHighlightPolicy): string | undefined {
  switch (policy) {
    case 'descendant':
      return 'descendant';
    case 'ancestor':
      return 'ancestor';
    case 'self':
      return 'self';
    case 'none':
      return undefined;
    default:
      return 'descendant';
  }
}

/**
 * Assign palette colors to top-level nodes that lack an explicit
 * itemStyle.color. Codex iter-13: prefer effectivePalette (accent-aware) when
 * provided, fallback to legacy DEFAULT_PALETTE.
 */
function colorizeTopLevel(data: SunburstNode[], palette: string[]): SunburstNode[] {
  return data.map((node, i) => {
    if (node.itemStyle?.color) return node;
    return {
      ...node,
      itemStyle: {
        ...node.itemStyle,
        color: palette[i % palette.length],
      },
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * SunburstChart inner — original hook-bearing body. The outer `SunburstChart`
 * wrapper below adds the `access` / `accessReason` gate without touching
 * hook order (Faz 21.4 PR-E2). Accepting `Omit<SunburstChartProps, 'access' |
 * 'accessReason'>` keeps the inner contract honest: access is resolved
 * exactly once, in the outer wrapper, never re-read inside the hooks.
 */
const SunburstChartInner = React.forwardRef<
  HTMLDivElement,
  Omit<SunburstChartProps, 'access' | 'accessReason'>
>(function SunburstChartInner(
  {
    data,
    size = 'md',
    title,
    levels: levelsProp,
    sort = 'desc',
    radius = ['0%', '90%'],
    highlightPolicy = 'descendant',
    showLegend = false,
    valueFormatter,
    animate = true,
    onNodeClick,
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
    const coloredData = colorizeTopLevel(data, palette);
    const maxDepth = computeMaxDepth(coloredData);
    const levels = levelsProp ?? autoLevels(maxDepth, radius, densityFontMultiplier);
    const focusValue = resolveHighlightFocus(highlightPolicy);

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
          const p = params as {
            name: string;
            value: number;
            treePathInfo: Array<{ name: string }>;
          };
          const path = p.treePathInfo
            ? p.treePathInfo
                .map((n) => n.name)
                .filter(Boolean)
                .join(' > ')
            : p.name;
          return `<b>${escapeHtml(path)}</b><br/>${fmt(p.value)}`;
        },
      },
      legend: {
        show: showLegend,
        bottom: 0,
        icon: 'roundRect',
        itemWidth: scaleSpacing(12, densitySpacingMultiplier),
        itemHeight: scaleSpacing(8, densitySpacingMultiplier),
        textStyle: { fontSize: scaleFontSize(12, densityFontMultiplier) },
        data: coloredData.map((n) => n.name),
      },
      series: [
        {
          type: 'sunburst' as const,
          data: coloredData,
          radius,
          sort: sort === null ? undefined : sort,
          levels: levels.map((lvl) => ({
            r0: lvl.r0,
            r1: lvl.r1,
            itemStyle: lvl.itemStyle ?? {
              borderWidth: 2,
              borderColor: 'var(--bg-surface, #ffffff)',
            },
            label: lvl.label ?? { show: true, fontSize: 11 },
          })),
          label: {
            show: true,
            formatter: (params: { name: string; value: number }) => {
              if (!params.name) return '';
              return `${params.name}\n${fmt(params.value)}`;
            },
            fontSize: scaleFontSize(11, densityFontMultiplier),
          },
          emphasis: {
            focus: focusValue,
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.2)',
            },
          },
          itemStyle: {
            borderWidth: 2,
            borderColor: 'var(--bg-surface, #ffffff)',
          },
          cursor: onNodeClick ? 'pointer' : 'default',
        },
      ],
      aria: {
        enabled: true,
        label: {
          description: title ? `Sunburst chart: ${escapeHtml(title)}` : 'Sunburst chart',
        },
        ...(decalEnabled ? { decal: { show: true, decals: decalPatterns } } : {}),
      },
    } as EChartsOption;
  }, [
    data,
    size,
    title,
    levelsProp,
    sort,
    radius,
    highlightPolicy,
    showLegend,
    fmt,
    animate,
    onNodeClick,
    isEmpty,
    decalEnabled,
    decalPatterns,
    densityFontMultiplier,
    densitySpacingMultiplier,
    effectivePalette,
  ]);

  const handleClick = useCallback(
    (params: unknown) => {
      if (!onNodeClick) return;
      const p = params as { name: string; value: number; data: unknown };
      onNodeClick({ name: p.name, value: p.value, data: p.data });
    },
    [onNodeClick],
  );

  const { containerRef, instance } = useEChartsRenderer({
    option: option ?? ({} as EChartsOption),
    theme: themeObject,
    respectReducedMotion: true,
    onClick: onNodeClick ? handleClick : undefined,
  });

  // Faz 21.5-B PR-B2: default-on a11y. Sunburst is hierarchical;
  // surface top-level segments only (Treemap-pattern).
  const a11yData = useMemo(
    () =>
      (data ?? []).map((node) => ({
        label: node.name,
        value: node.value ?? 0,
      })),
    [data],
  );
  const a11y = useChartA11y({
    chartType: 'sunburst',
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
        data-testid="sunburst-chart-empty"
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
      testId="sunburst-chart"
      setRefs={setRefs}
      {...rest}
    />
  );
});

SunburstChartInner.displayName = 'SunburstChartInner';

/**
 * SunburstChart — public wrapper. Accepts `access` + `accessReason`
 * (`AccessControlledProps`) and forwards everything else to
 * `SunburstChartInner`. Faz 21.4 PR-E2 wiring; default `access === undefined`
 * follows the identity-transform path through `ChartAccessGate`.
 */
export const SunburstChart = React.forwardRef<HTMLDivElement, SunburstChartProps>(
  function SunburstChart({ access, accessReason, onNodeClick, ...rest }, ref) {
    const { state } = resolveAccessState(access);
    return (
      <ChartAccessGate access={access} accessReason={accessReason}>
        <SunburstChartInner
          ref={ref}
          {...rest}
          onNodeClick={guardChartCallback(state, onNodeClick)}
        />
      </ChartAccessGate>
    );
  },
);
SunburstChart.displayName = 'SunburstChart';

export default SunburstChart;
