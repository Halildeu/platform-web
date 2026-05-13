'use client';

/**
 * GraphChart — ECharts-powered network/relationship topology.
 *
 * Renders an entity-edge graph (nodes + links) with optional force-
 * directed layout. The single most-requested missing chart for our
 * Context Health dashboard, where `DocGraphBar` historically counted
 * "broken / orphan / placeholder / ambiguity" issues without revealing
 * WHICH nodes were involved or HOW they connected.
 *
 * Use cases:
 *   - Doc / module dependency network (Context Health)
 *   - Permission cascade tree (auth-permission-user-service)
 *   - Module-Federation host/remote topology
 *   - Org / decision tree (when hierarchy data is available)
 *
 * @migration ECharts graph series — PR-X12b of the @mfe/x-charts
 * native-feature parity campaign (Codex thread 019e2119 AGREE).
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

/** Graph node — an entity in the network. */
export type GraphNode = {
  /** Stable identifier — referenced by edges. */
  id: string;
  /** Display label (defaults to `id`). */
  name?: string;
  /** Numeric value — drives default symbolSize when `symbolSize` unset. */
  value?: number;
  /** Category index (matches `categories[]` for color grouping). */
  category?: number | string;
  /** Explicit symbol size in pixels. Overrides value-based sizing. */
  symbolSize?: number;
  /** Pin node to explicit x/y (force layout will not move it). */
  x?: number;
  y?: number;
  /** Override default symbol shape. */
  symbol?: string;
  /** Override per-node colour. */
  color?: string;
};

/** Graph edge — directed link between two nodes. */
export type GraphEdge = {
  /** Source node `id`. */
  source: string;
  /** Target node `id`. */
  target: string;
  /** Edge weight — drives default line width when `lineStyle.width` unset. */
  value?: number;
  /** Edge label (rendered on the line). */
  label?: string;
  /** Override edge color. */
  color?: string;
};

/** Category descriptor — used to color/group nodes by `node.category`. */
export type GraphCategory = {
  name: string;
  color?: string;
};

export type GraphLayoutMode = 'force' | 'circular' | 'none';

/** Cross-filter compatibility — canonical click event. */
export type { ChartClickEvent } from './types';
import type { ChartClickEvent as ChartClickEventCanonical } from './types';
type ChartClickEvent = ChartClickEventCanonical;

// Markup overlay — NO-OP on graph v1.
export type { ChartMarkup, ChartMarkupClickEvent } from './types';
import type { ChartMarkup, ChartMarkupClickEvent } from './types';
import { useMarkupAdapter } from './annotations/useMarkupAdapter';

export interface GraphChartProps extends AccessControlledProps {
  /** Nodes in the network. */
  nodes: GraphNode[];
  /** Edges between nodes (referenced by `source` / `target` id). */
  edges: GraphEdge[];
  /**
   * Categories for color-grouping nodes. Each `node.category` references
   * an index (or name) in this array. Legend lists each category.
   */
  categories?: GraphCategory[];
  /**
   * Layout algorithm.
   * - `'force'` (default): force-directed; nodes find positions iteratively
   * - `'circular'`: nodes arranged on a circle (good for ring topologies)
   * - `'none'`: caller supplies `node.x` / `node.y` explicitly
   *
   * @default 'force'
   */
  layout?: GraphLayoutMode;
  /**
   * Force-layout repulsion (only when `layout='force'`). Higher = nodes
   * push apart harder. Defaults to a balanced value; tune for dense graphs.
   *
   * @default 100
   */
  forceRepulsion?: number;
  /** Force-layout gravity (pulls nodes toward center). @default 0.1 */
  forceGravity?: number;
  /** Force-layout edge length. Number or [min, max] range. @default 50 */
  forceEdgeLength?: number | [number, number];
  /**
   * Whether edges are directional (renders arrow head at target).
   * @default true
   */
  directed?: boolean;
  /** Show legend for categories. @default true (if `categories` set) */
  showLegend?: boolean;
  /** Allow user to drag nodes. @default true */
  roam?: boolean | 'scale' | 'move';
  /** Default symbol shape. @default 'circle' */
  symbol?: string;
  /** Default symbol size when nodes lack explicit value/size. @default 30 */
  defaultSymbolSize?: number;
  /** Visual size variant. @default "md" */
  size?: ChartSize;
  /** Animate layout on mount. @default true */
  animate?: boolean;
  /** Override default palette (one color per category). */
  colors?: string[];
  /** Chart title. */
  title?: string;
  /** Accessible description. */
  description?: string;
  /** Additional class name. */
  className?: string;
  /** Callback fired when a node or edge is clicked. */
  onDataPointClick?: (event: ChartClickEvent) => void;
  /** Visual overlay markups — NO-OP on v1, dev warning surfaces. */
  markups?: ChartMarkup[];
  /** Callback fired when a markup overlay is clicked (NO-OP on v1). */
  onMarkupClick?: (event: ChartMarkupClickEvent) => void;
  /** Custom value formatter (used in a11y data table). */
  valueFormatter?: (value: number) => string;
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

const escapeHtml = (t: string): string =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const GraphChartInner = React.forwardRef<
  HTMLDivElement,
  Omit<GraphChartProps, 'access' | 'accessReason'>
>(function GraphChartInner(
  {
    nodes,
    edges,
    categories,
    layout = 'force',
    forceRepulsion = 100,
    forceGravity = 0.1,
    forceEdgeLength = 50,
    directed = true,
    showLegend,
    roam = true,
    symbol = 'circle',
    defaultSymbolSize = 30,
    size = 'md',
    animate = true,
    colors,
    title,
    description,
    className,
    onDataPointClick,
    markups,
    onMarkupClick: _onMarkupClick,
    valueFormatter,
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
  const isEmpty = !nodes || nodes.length === 0;
  const fmt = valueFormatter ?? formatCompact;

  const ownContainerRef = useRef<HTMLDivElement | null>(null);
  const breakpoint = useResponsiveBreakpoint(ownContainerRef);

  const {
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

  // Markup adapter NO-OP on graph — surfaces dev warning.
  useMarkupAdapter(markups, {
    chartType: 'bar',
    orientation: 'vertical',
    dataContext: { labels: nodes.map((n) => n.name ?? n.id), series: [{ data: [] }] },
  });

  const option = useMemo((): EChartsOption | null => {
    if (isEmpty) return null;

    const palette = colors ?? effectivePalette ?? DEFAULT_PALETTE;

    // Transform nodes + edges into ECharts wire format.
    const echartsNodes = nodes.map((n) => ({
      id: n.id,
      name: n.name ?? n.id,
      value: n.value,
      category: n.category,
      x: n.x,
      y: n.y,
      symbol: n.symbol ?? symbol,
      symbolSize:
        n.symbolSize ??
        (typeof n.value === 'number'
          ? Math.max(10, Math.min(80, Math.sqrt(n.value) * 6))
          : defaultSymbolSize),
      itemStyle: n.color ? { color: n.color } : undefined,
      label: {
        show: true,
        fontSize: scaleFontSize(11, densityFontMultiplier),
      },
    }));

    const echartsEdges = edges.map((e) => ({
      source: e.source,
      target: e.target,
      value: e.value,
      lineStyle: {
        color: e.color,
        width: typeof e.value === 'number' ? Math.max(1, Math.min(8, Math.sqrt(e.value) / 2)) : 1.5,
        curveness: 0,
      },
      label: e.label
        ? {
            show: true,
            formatter: escapeHtml(e.label),
            fontSize: scaleFontSize(10, densityFontMultiplier),
          }
        : { show: false },
    }));

    const echartsCategories = categories?.map((c, i) => ({
      name: c.name,
      itemStyle: { color: c.color ?? palette[i % palette.length] },
    }));

    const legendShow = showLegend ?? !!categories;
    const responsiveLegend = buildResponsiveLegend({
      breakpoint,
      showLegend: legendShow,
      hasMultiSeries: !!categories && categories.length > 1,
      seriesCount: categories?.length ?? 1,
      densitySpacingMultiplier,
      densityFontMultiplier,
      icon: 'circle',
    });

    // Force-layout config — only emitted when layout='force'.
    const forceConfig =
      layout === 'force'
        ? {
            force: {
              repulsion: forceRepulsion,
              gravity: forceGravity,
              edgeLength: forceEdgeLength,
              layoutAnimation: animate,
            },
          }
        : {};

    return {
      animation: animate,
      animationDuration: animate ? 500 : 0,
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
        formatter: (p: {
          dataType: 'node' | 'edge';
          name?: string;
          value?: number;
          data: Record<string, unknown>;
        }) => {
          if (p.dataType === 'edge') {
            const data = p.data as { source: string; target: string; value?: number };
            return [
              `<b>Edge</b>`,
              `${escapeHtml(String(data.source))} → ${escapeHtml(String(data.target))}`,
              data.value != null ? `Weight: ${fmt(data.value)}` : '',
            ]
              .filter(Boolean)
              .join('<br/>');
          }
          const name = p.name ?? '';
          return [`<b>${escapeHtml(name)}</b>`, p.value != null ? `Value: ${fmt(p.value)}` : '']
            .filter(Boolean)
            .join('<br/>');
        },
      },
      legend: legendShow ? responsiveLegend : { show: false },
      series: [
        {
          type: 'graph' as const,
          name: title ?? 'Network',
          layout,
          data: echartsNodes,
          links: echartsEdges,
          categories: echartsCategories,
          roam,
          edgeSymbol: directed ? ['none', 'arrow'] : ['none', 'none'],
          edgeSymbolSize: directed ? [0, 8] : [0, 0],
          lineStyle: {
            opacity: 0.7,
          },
          emphasis: {
            focus: 'adjacency' as const,
            lineStyle: { width: 3, opacity: 1 },
            label: { show: true, fontWeight: 'bold' as const },
          },
          cursor: onDataPointClick ? 'pointer' : 'default',
          ...forceConfig,
        },
      ],
      aria: {
        enabled: true,
        label: {
          description: description
            ? escapeHtml(description)
            : title
              ? `Network graph: ${escapeHtml(title)}`
              : 'Network graph',
        },
        ...(decalEnabled ? { decal: { show: true, decals: decalPatterns } } : {}),
      },
    } as EChartsOption;
  }, [
    nodes,
    edges,
    categories,
    layout,
    forceRepulsion,
    forceGravity,
    forceEdgeLength,
    directed,
    roam,
    symbol,
    defaultSymbolSize,
    isEmpty,
    showLegend,
    animate,
    colors,
    title,
    description,
    onDataPointClick,
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
      const p = params as {
        dataType?: 'node' | 'edge';
        dataIndex?: number;
        data?: Record<string, unknown>;
        name?: string;
        value?: number;
      };
      onDataPointClick({
        seriesName: title ?? 'Network',
        seriesIndex: 0,
        dataIndex: p.dataIndex ?? 0,
        label: p.name ?? '',
        value: p.value ?? 0,
        datum: {
          kind: p.dataType ?? 'node',
          ...(p.data ?? {}),
        },
      });
    },
    [onDataPointClick, title],
  );

  const a11yData = useMemo(
    () =>
      nodes.map((n) => ({
        label: n.name ?? n.id,
        value: n.value ?? 0,
      })),
    [nodes],
  );

  const a11yState = useChartA11y({
    chartType: 'graph',
    title,
    description,
    data: a11yData,
    valueFormatter: fmt,
    anomalySummary,
    formatAnomalyAnnouncement,
  });

  const { containerRef, instance: _instance } = useEChartsRenderer({
    option: option ?? ({} as EChartsOption),
    respectReducedMotion: true,
    onClick: guardChartCallback(handleClick, true),
  });

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      ownContainerRef.current = node;
      (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [containerRef, forwardedRef],
  );

  return (
    <ChartA11yShell
      a11y={a11yState}
      className={cn('mfe-graph-chart-shell', className)}
      height={height}
      testId="graph-chart"
      setRefs={setRefs}
      anomalySummary={anomalySummary}
      formatAnomalyAnnouncement={formatAnomalyAnnouncement}
      {...rest}
    />
  );
});

GraphChartInner.displayName = 'GraphChartInner';

export const GraphChart = React.forwardRef<HTMLDivElement, GraphChartProps>(function GraphChart(
  { access, accessReason, ...rest },
  ref,
) {
  const accessState = resolveAccessState(access);
  return (
    <ChartAccessGate accessState={accessState} accessReason={accessReason}>
      <GraphChartInner ref={ref} {...rest} />
    </ChartAccessGate>
  );
});
GraphChart.displayName = 'GraphChart';
