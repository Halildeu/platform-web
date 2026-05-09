'use client';

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

// Cross-filter rollout sweep — Codex thread 019e0c25 absorb. Re-export
// the canonical `ChartClickEvent`. Sankey is the only chart with two
// click target categories: `node` and `edge`. The new
// `onDataPointClick` covers BOTH (cross-filter wrapper can route both
// through the bus); the legacy `onNodeClick` keeps firing on node
// clicks only and remains the canonical surface for non-cross-filter
// consumers (Codex iter-2: do NOT deprecate in this sweep).
export type { ChartClickEvent } from './types';
import type { ChartClickEvent as ChartClickEventCanonical } from './types';
type ChartClickEvent = ChartClickEventCanonical;

// Markup overlay (Codex thread 019e0df1) — Sankey is NO-OP (network
// chart, no x/y axis semantics).
export type { ChartMarkup, ChartMarkupClickEvent } from './types';
import type { ChartMarkup, ChartMarkupClickEvent } from './types';
import { useMarkupAdapter } from './annotations/useMarkupAdapter';

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

export interface SankeyChartProps extends AccessControlledProps {
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
  /**
   * Legacy callback fired when a NODE is clicked (not edges). Coexists
   * with the new `onDataPointClick`; when both are supplied,
   * `onDataPointClick` fires FIRST and `onNodeClick` fires second so
   * cross-filter forwarding never blocks the legacy handler. Edges
   * never trigger this callback. Codex iter-2 thread 019e0c25 absorb.
   */
  onNodeClick?: (params: { name: string; data: unknown }) => void;
  /**
   * Canonical cross-filter callback. Emits a `ChartClickEvent` for
   * BOTH node clicks and edge clicks. Datum shape varies:
   * - node: `{ dataType: 'node', name, label: name, value: flowThrough }`
   * - edge: `{ dataType: 'edge', source, target, value, label: 'source → target' }`
   * `value` for nodes is ECharts' computed flow-through; for edges it
   * is the link `value` (volume of flow). The cross-filter wrapper
   * can pick `name` (node) or `source`/`target` (edge) as canonical
   * filter fields.
   */
  onDataPointClick?: (event: ChartClickEvent) => void;
  /** Visual overlay markups — NO-OP on Sankey (Codex 019e0df1). */
  markups?: ChartMarkup[];
  /** Callback fired when a markup overlay is clicked (no-op on Sankey). */
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

/**
 * SankeyChart inner — original hook-bearing body. The outer `SankeyChart`
 * wrapper below adds the `access` / `accessReason` gate without touching
 * hook order (Faz 21.4 PR-E2). Accepting `Omit<SankeyChartProps, 'access' |
 * 'accessReason'>` keeps the inner contract honest: access is resolved
 * exactly once, in the outer wrapper, never re-read inside the hooks.
 */
const SankeyChartInner = React.forwardRef<
  HTMLDivElement,
  Omit<SankeyChartProps, 'access' | 'accessReason'>
>(function SankeyChartInner(
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
    onDataPointClick,
    markups,
    onMarkupClick: _onMarkupClick,
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
  const isEmpty = !nodes || nodes.length === 0 || !links || links.length === 0;

  // Markup overlay adapter — Codex 019e0df1. NO-OP on Sankey.
  useMarkupAdapter(markups, { chartType: 'sankey' });

  // Faz 21.9 PR3d: container ref + breakpoint for responsive sankey.
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

    /* -- Assign default colors to nodes without explicit color -- */
    const palette = effectivePalette ?? DEFAULT_PALETTE;
    const coloredNodes = nodes.map((n, i) => ({
      ...n,
      itemStyle: {
        color: n.itemStyle?.color ?? palette[i % palette.length],
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
        ...buildResponsiveLegend({
          breakpoint,
          showLegend,
          hasMultiSeries: false,
          seriesCount: coloredNodes.length,
          densitySpacingMultiplier,
          densityFontMultiplier,
          icon: 'roundRect',
          truncateAt: breakpoint === 'mobile' ? 12 : 18,
        }),
        // Sankey legend lists all node names — preserve the explicit
        // data list so ECharts renders entries even when many nodes share
        // a colour palette index.
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
            // Mobile shrinks the sankey envelope; node labels then collide
            // with neighbouring nodes. Suppress on mobile when there are
            // too many nodes to fit; tooltip + a11y still expose names.
            show: !(breakpoint === 'mobile' && coloredNodes.length > 6),
            position: orient === 'horizontal' ? 'right' : 'bottom',
            fontSize:
              breakpoint === 'mobile'
                ? Math.max(9, Math.round(11 * 0.9))
                : scaleFontSize(11, densityFontMultiplier),
            color: 'inherit',
          },
          itemStyle: {
            borderWidth: 1,
            borderColor: 'var(--bg-surface, #ffffff)',
          },
          // Cursor reflects clickability through EITHER callback so that
          // consumers wrapping the chart in `CrossFilterChart` (which
          // injects only `onDataPointClick`) still see a pointer
          // affordance. Codex iter-2 thread 019e0c25 P3 absorb.
          cursor: onNodeClick || onDataPointClick ? 'pointer' : 'default',
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
    onDataPointClick,
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
      const p = params as {
        dataType: string;
        name?: string;
        value?: number;
        data?: unknown;
        // ECharts edge params expose these
        sourceType?: string;
        targetType?: string;
        source?: string;
        target?: string;
      };

      // Cross-filter wrapper sees BOTH node and edge clicks. Codex
      // iter-2 thread 019e0c25 absorb: emit `onDataPointClick` first
      // so the bus receives the event before legacy side effects.
      if (p.dataType === 'node') {
        if (onDataPointClick) {
          const name = typeof p.name === 'string' ? p.name : '';
          const value = typeof p.value === 'number' ? p.value : 0;
          onDataPointClick({
            datum: {
              dataType: 'node',
              name,
              label: name,
              value,
            },
            value,
            label: name,
          });
        }
        if (onNodeClick) {
          onNodeClick({ name: p.name ?? '', data: p.data });
        }
        return;
      }

      if (p.dataType === 'edge') {
        // Edges are surfaced ONLY through the new cross-filter
        // callback — legacy `onNodeClick` is node-only by contract.
        if (onDataPointClick) {
          // ECharts edge `data` is the original SankeyLink with
          // source/target. Some configs put source/target directly
          // on params; prefer those.
          const linkData =
            typeof p.data === 'object' && p.data !== null ? (p.data as Partial<SankeyLink>) : null;
          const source = (typeof p.source === 'string' ? p.source : linkData?.source) ?? '';
          const target = (typeof p.target === 'string' ? p.target : linkData?.target) ?? '';
          const value = typeof p.value === 'number' ? p.value : (linkData?.value ?? 0);
          const label = `${source} → ${target}`;
          onDataPointClick({
            datum: {
              dataType: 'edge',
              source,
              target,
              value,
              label,
            },
            value,
            label,
          });
        }
        return;
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

SankeyChartInner.displayName = 'SankeyChartInner';

/**
 * SankeyChart — public wrapper. Accepts `access` + `accessReason`
 * (`AccessControlledProps`) and forwards everything else to
 * `SankeyChartInner`. Faz 21.4 PR-E2 wiring; default `access === undefined`
 * follows the identity-transform path through `ChartAccessGate`.
 */
export const SankeyChart = React.forwardRef<HTMLDivElement, SankeyChartProps>(function SankeyChart(
  { access, accessReason, onNodeClick, onDataPointClick, onMarkupClick, ...rest },
  ref,
) {
  const { state } = resolveAccessState(access);
  return (
    <ChartAccessGate access={access} accessReason={accessReason}>
      <SankeyChartInner
        ref={ref}
        {...rest}
        onNodeClick={guardChartCallback(state, onNodeClick)}
        onDataPointClick={guardChartCallback(state, onDataPointClick)}
        onMarkupClick={guardChartCallback(state, onMarkupClick)}
      />
    </ChartAccessGate>
  );
});
SankeyChart.displayName = 'SankeyChart';

export default SankeyChart;
