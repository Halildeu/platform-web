/**
 * SankeyChart -- ECharts-powered Sankey flow diagram
 *
 * Renders a flow diagram where node widths and link widths are
 * proportional to values. Supports horizontal/vertical orientation,
 * interactive node dragging, and adjacency-based focus highlighting.
 *
 * Uses the centralized useEChartsRenderer hook for lifecycle management.
 *
 * @migration AG Charts -> ECharts (P3)
 */
import React, { useMemo, useCallback } from 'react';
import { cn } from '@mfe/design-system';
import { useEChartsRenderer } from './renderers';
import { ChartA11yShell, useChartA11y } from './a11y';
import { useChartTheme } from './theme/useChartTheme';
import type {
  ChartThemePreference,
  ChartDecalPreference,
  ChartDensityPreference,
} from './theme/useChartTheme';
import { scaleFontSize, scaleSpacing } from './theme/density-helpers';
import { formatCompact } from './utils/formatters';
import type { EChartsOption } from './renderers/echarts-imports';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface SankeyNode {
  /** Unique node name (used as identifier in links). */
  name: string;
  /** Optional node style overrides. */
  itemStyle?: { color?: string; [key: string]: unknown };
}

export interface SankeyLink {
  /** Source node name. */
  source: string;
  /** Target node name. */
  target: string;
  /** Flow value determining link width. */
  value: number;
}

export type SankeyFocusMode = boolean | 'allEdges' | 'outEdges' | 'inEdges';

export interface SankeyChartProps {
  /** Node definitions. */
  nodes: SankeyNode[];
  /** Link definitions connecting source to target with a value. */
  links: SankeyLink[];
  /** Visual size variant. @default "md" */
  size?: 'sm' | 'md' | 'lg';
  /** Chart title. */
  title?: string;
  /** Layout orientation. @default "horizontal" */
  orient?: 'horizontal' | 'vertical';
  /** Width of each node in pixels. @default 20 */
  nodeWidth?: number;
  /** Vertical gap between nodes in the same column. @default 8 */
  nodeGap?: number;
  /** Allow interactive node dragging. @default true */
  draggable?: boolean;
  /** Emphasis focus behaviour on hover. @default "allEdges" */
  focusNodeAdjacency?: SankeyFocusMode;
  /** Link line coloring strategy. @default "gradient" */
  lineStyle?: 'gradient' | 'source' | 'target';
  /** Show legend below the chart. @default false */
  showLegend?: boolean;
  /** Custom value formatter for tooltip. */
  valueFormatter?: (v: number) => string;
  /** Animate on mount. @default true */
  animate?: boolean;
  /** Callback fired when a node is clicked. */
  onNodeClick?: (params: { name: string; data: unknown }) => void;
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
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SIZE_HEIGHT: Record<'sm' | 'md' | 'lg', number> = { sm: 200, md: 300, lg: 400 };

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
 * Map the focusNodeAdjacency prop to the ECharts emphasis.focus value.
 * ECharts Sankey supports "adjacency" for highlighting connected edges.
 */
function resolveFocusMode(mode: SankeyFocusMode): string | undefined {
  if (mode === false) return undefined;
  // All truthy values map to adjacency (ECharts Sankey focus)
  return 'adjacency';
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const SankeyChart = React.forwardRef<HTMLDivElement, SankeyChartProps>(function SankeyChart(
  {
    nodes,
    links,
    size = 'md',
    title,
    orient = 'horizontal',
    nodeWidth = 20,
    nodeGap = 8,
    draggable = true,
    focusNodeAdjacency = 'allEdges',
    lineStyle = 'gradient',
    showLegend = false,
    valueFormatter,
    animate = true,
    onNodeClick,
    className,
    theme: themePreference = 'auto',
    decal: decalPreference = 'auto',
    density: densityPreference = 'auto',
    ...rest
  },
  forwardedRef,
) {
  const height = SIZE_HEIGHT[size];
  const isEmpty = !nodes || nodes.length === 0 || !links || links.length === 0;
  const fmt = valueFormatter ?? formatCompact;

  const {
    themeObject,
    decalEnabled,
    decalPatterns,
    densityFontMultiplier,
    densitySpacingMultiplier,
  } = useChartTheme({
    theme: themePreference,
    decal: decalPreference,
    density: densityPreference,
  });

  const option = useMemo((): EChartsOption | null => {
    if (isEmpty) return null;

    /* -- Assign default colors to nodes without explicit color -- */
    const coloredNodes = nodes.map((n, i) => ({
      ...n,
      itemStyle: {
        color: n.itemStyle?.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length],
        ...n.itemStyle,
      },
    }));

    /* -- Resolve link line color strategy -- */
    let linkLineColor: string;
    if (lineStyle === 'source') linkLineColor = 'source';
    else if (lineStyle === 'target') linkLineColor = 'target';
    else linkLineColor = 'gradient';

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
        triggerOn: 'mousemove',
        formatter: (params: unknown) => {
          const p = params as {
            dataType: string;
            name: string;
            data: { source?: string; target?: string; value?: number };
            value: number;
          };
          if (p.dataType === 'edge') {
            const src = p.data.source ?? '';
            const tgt = p.data.target ?? '';
            return `${escapeHtml(src)} → ${escapeHtml(tgt)}<br/>${fmt(p.value)}`;
          }
          return `<b>${escapeHtml(p.name)}</b>`;
        },
      },
      legend: {
        show: showLegend,
        bottom: 0,
        icon: 'roundRect',
        itemWidth: scaleSpacing(12, densitySpacingMultiplier),
        itemHeight: scaleSpacing(8, densitySpacingMultiplier),
        textStyle: { fontSize: scaleFontSize(12, densityFontMultiplier) },
        data: coloredNodes.map((n) => n.name),
      },
      series: [
        {
          type: 'sankey' as const,
          layout: 'none',
          orient,
          nodeWidth,
          nodeGap,
          draggable,
          left: '5%',
          right: '5%',
          top: title ? 48 : 24,
          bottom: showLegend ? 48 : 24,
          data: coloredNodes,
          links: links.map((l) => ({ ...l })),
          emphasis: {
            focus: resolveFocusMode(focusNodeAdjacency),
          },
          lineStyle: {
            color: linkLineColor,
            opacity: 0.4,
            curveness: 0.5,
          },
          label: {
            show: true,
            position: orient === 'horizontal' ? 'right' : 'bottom',
            fontSize: scaleFontSize(11, densityFontMultiplier),
            color: 'inherit',
          },
          itemStyle: {
            borderWidth: 1,
            borderColor: 'var(--bg-surface, #ffffff)',
          },
          cursor: onNodeClick ? 'pointer' : 'default',
        },
      ],
      aria: {
        enabled: true,
        label: {
          description: title ? `Sankey diagram: ${escapeHtml(title)}` : 'Sankey diagram',
        },
        ...(decalEnabled ? { decal: { show: true, decals: decalPatterns } } : {}),
      },
    } as EChartsOption;
  }, [
    nodes,
    links,
    size,
    title,
    orient,
    nodeWidth,
    nodeGap,
    draggable,
    focusNodeAdjacency,
    lineStyle,
    showLegend,
    fmt,
    animate,
    onNodeClick,
    isEmpty,
    decalEnabled,
    decalPatterns,
    densityFontMultiplier,
    densitySpacingMultiplier,
  ]);

  const handleClick = useCallback(
    (params: unknown) => {
      if (!onNodeClick) return;
      const p = params as { dataType: string; name: string; data: unknown };
      // Only fire for node clicks, not edge clicks
      if (p.dataType !== 'node') return;
      onNodeClick({ name: p.name, data: p.data });
    },
    [onNodeClick],
  );

  const { containerRef, instance } = useEChartsRenderer({
    option: option ?? ({} as EChartsOption),
    theme: themeObject,
    respectReducedMotion: true,
    onClick: onNodeClick ? handleClick : undefined,
  });

  // Faz 21.5-B PR-B2: default-on a11y. Sankey nodes have no value
  // field; compute each node's flow-through as the sum of outgoing
  // (or incoming if no outgoing) link values. SR users hear "Node X:
  // <total flow>" — meaningful for funnel-like Sankey graphs.
  const a11yData = useMemo(() => {
    const safeNodes = nodes ?? [];
    const safeLinks = links ?? [];
    return safeNodes.map((n) => {
      const outFlow = safeLinks
        .filter((l) => l.source === n.name)
        .reduce((sum, l) => sum + l.value, 0);
      const inFlow = safeLinks
        .filter((l) => l.target === n.name)
        .reduce((sum, l) => sum + l.value, 0);
      return {
        label: n.name,
        value: outFlow > 0 ? outFlow : inFlow,
      };
    });
  }, [nodes, links]);
  const a11y = useChartA11y({
    chartType: 'sankey',
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
        data-testid="sankey-chart-empty"
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
      testId="sankey-chart"
      setRefs={setRefs}
      {...rest}
    />
  );
});

SankeyChart.displayName = 'SankeyChart';

export default SankeyChart;
