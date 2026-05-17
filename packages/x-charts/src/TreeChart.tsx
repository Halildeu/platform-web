'use client';

/**
 * TreeChart — ECharts-powered hierarchical node-link tree.
 *
 * The expand/collapse node-link form of a hierarchy. Distinct from the
 * other hierarchy wrappers in @mfe/x-charts:
 *   - `TreemapChart` — area-partition (nested rectangles)
 *   - `SunburstChart` — radial-partition (concentric rings)
 *   - `GraphChart` — free-form network (no strict parent-child)
 *   - `TreeChart` (this) — node-link with parent→child edges,
 *     expand/collapse, orthogonal or radial layout
 *
 * Primary use-case: organisation charts (departman → unvan → personel),
 * any strict hierarchy where the parent-child edge itself carries
 * meaning.
 *
 * @see PR-X16a — Codex thread 019e32da plan-time AGREE (ECharts Depth
 *   campaign, first of 5: Tree → Calendar → Polar → ThemeRiver → Gantt).
 */
import React, { useMemo, useCallback, useRef } from 'react';
import type { AccessControlledProps } from '@mfe/shared-types';
import { resolveAccessState } from '@mfe/shared-types';
import { ChartAccessGate } from './access/ChartAccessGate';
import { guardChartCallback } from './access/guardChartCallback';
import { cn } from './utils/cn';
import { useEChartsRenderer, useRequiredEChartsFeature } from './renderers';
import { useResponsiveBreakpoint } from './useResponsiveChart';
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

export type { ChartClickEvent } from './types';
import type { ChartClickEvent as ChartClickEventCanonical } from './types';
type ChartClickEvent = ChartClickEventCanonical;

/**
 * Layout of the node-link tree.
 * - `orthogonal` — classic top-down / left-right tree (edges are
 *   right-angled). `orient` controls the direction.
 * - `radial` — root at centre, descendants on concentric rings.
 *   `orient` is ignored for radial (ECharts native behaviour).
 */
export type TreeLayout = 'orthogonal' | 'radial';

/**
 * Direction of an orthogonal tree. Ignored when `layout='radial'`.
 * - `LR` — root left, grows right (default; best for org charts)
 * - `RL` — root right, grows left
 * - `TB` — root top, grows down
 * - `BT` — root bottom, grows up
 */
export type TreeOrient = 'LR' | 'RL' | 'TB' | 'BT';

/**
 * A single tree node. Mirrors the `TreemapNode` / `SunburstNode`
 * shape so consumers can reuse hierarchy data across wrappers.
 */
export type TreeNode = {
  /** Display name for the node. */
  name: string;
  /** Optional numeric value (e.g. headcount for an org unit). */
  value?: number;
  /** Nested children. Leaf nodes omit this or pass `[]`. */
  children?: TreeNode[];
  /**
   * Per-node style override. Deliberately narrow — only `color` is
   * exposed in v1 (Codex 019e32da iter-2 nit: no raw ECharts node
   * passthrough — `label`, `emphasis`, `lineStyle` stay internal).
   */
  itemStyle?: { color?: string };
};

export interface TreeChartProps extends AccessControlledProps {
  /**
   * Hierarchical tree data. ECharts `tree` accepts an array of roots;
   * most org charts pass a single-element array.
   */
  data: TreeNode[];
  /**
   * Layout form.
   * @default 'orthogonal'
   */
  layout?: TreeLayout;
  /**
   * Direction for orthogonal layout. Ignored when `layout='radial'`.
   * @default 'LR'
   */
  orient?: TreeOrient;
  /**
   * Depth at which nodes start collapsed. `2` shows the root + its
   * direct children, deeper levels collapsed behind expand handles.
   * @default 2
   */
  initialTreeDepth?: number;
  /**
   * Allow click-to-expand / collapse on nodes with children.
   * @default true
   */
  expandAndCollapse?: boolean;
  /**
   * Pan / zoom mode.
   * @default false
   */
  roam?: boolean | 'scale' | 'move';
  /**
   * Node symbol pixel size.
   * @default 10
   */
  symbolSize?: number;
  /**
   * Show the node-name label next to each node.
   * @default true
   */
  showLabels?: boolean;
  /** Visual size variant. @default "md" */
  size?: ChartSize;
  /** Animate on mount. @default true */
  animate?: boolean;
  /** Chart title. */
  title?: string;
  /** Accessible description. */
  description?: string;
  /** Additional class name. */
  className?: string;
  /** Custom formatter for displayed values (tooltip + a11y table). */
  valueFormatter?: (v: number) => string;
  /**
   * Header for the value column in the screen-reader data table.
   * Codex 019e32da iter-2 nit: do not hard-code an HR-specific noun.
   * When nodes carry `value` the consumer might mean "Personel",
   * "Bütçe", etc.; when they don't, the fallback is descendant count.
   * @default 'Değer'
   */
  valueColumnHeader?: string;
  /** Canonical cross-filter click callback. */
  onDataPointClick?: (event: ChartClickEvent) => void;
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

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_PALETTE = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6'];

/**
 * Stable empty option dispatched while the lazy `tree` series module is
 * still loading. A module constant (not an inline `{}`) so the
 * renderer's option-update effect does not thrash across the brief
 * loading window before {@link useRequiredEChartsFeature} reports ready.
 */
const EMPTY_TREE_OPTION: EChartsOption = {};

/* ------------------------------------------------------------------ */
/*  Helpers (exported for unit tests)                                  */
/* ------------------------------------------------------------------ */

const escapeHtml = (t: string): string =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Count all descendants (children + their children, recursively) of a
 * node. Used as the screen-reader value fallback when a node carries
 * no explicit numeric `value` — a branch's "size" is then its sub-tree
 * node count.
 */
export function countDescendants(node: TreeNode): number {
  if (!node.children || node.children.length === 0) return 0;
  let total = node.children.length;
  for (const child of node.children) {
    total += countDescendants(child);
  }
  return total;
}

/**
 * Single flat row for the screen-reader data table.
 */
export interface TreeA11yRow {
  /** DFS path label, e.g. `"Liderlik > İK > İK Operasyon"`. */
  label: string;
  /**
   * Numeric value. `node.value` when finite; otherwise the descendant
   * count fallback (see `countDescendants`).
   */
  value: number;
}

/**
 * Flatten a node-link tree into a flat `{label, value}[]` list for the
 * `useChartA11y` screen-reader data table.
 *
 * Codex 019e32da iter-1 must-fix #4: `useChartA11y` keeps its flat
 * two-column model; each chart supplies its own `linearize*ForA11y`.
 * Tree linearization is a depth-first walk producing a breadcrumb-style
 * path label so a screen-reader user can hear the hierarchy position
 * without a 2-D widget.
 *
 * @param roots The tree root array (`TreeChartProps.data`).
 * @returns One row per node, in DFS pre-order.
 */
export function linearizeTreeForA11y(roots: TreeNode[]): TreeA11yRow[] {
  const rows: TreeA11yRow[] = [];

  const walk = (node: TreeNode, ancestry: string[]): void => {
    const path = [...ancestry, node.name];
    const value =
      typeof node.value === 'number' && Number.isFinite(node.value)
        ? node.value
        : countDescendants(node);
    rows.push({ label: path.join(' > '), value });
    if (node.children) {
      for (const child of node.children) {
        walk(child, path);
      }
    }
  };

  for (const root of roots ?? []) {
    walk(root, []);
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const TreeChartInner = React.forwardRef<
  HTMLDivElement,
  Omit<TreeChartProps, 'access' | 'accessReason'>
>(function TreeChartInner(
  {
    data,
    layout = 'orthogonal',
    orient = 'LR',
    initialTreeDepth = 2,
    expandAndCollapse = true,
    roam = false,
    symbolSize = 10,
    showLabels = true,
    size = 'md',
    animate = true,
    title,
    description,
    className,
    valueFormatter,
    valueColumnHeader = 'Değer',
    onDataPointClick,
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
  const isEmpty = !data || data.length === 0;

  // PR-X16a: the `tree` series is NOT in the eager ECharts register
  // (it would push the CONTRACT §8 bundle over the 350 KB gzip cap).
  // Lazy-register it on first non-empty mount; the option below is held
  // back (`null`) until the feature reports `ready`, so we never
  // dispatch `series.type='tree'` before ECharts knows that type.
  const treeFeature = useRequiredEChartsFeature('tree', { enabled: !isEmpty });
  const treeFeatureReady = treeFeature.status === 'ready';

  const ownContainerRef = useRef<HTMLDivElement | null>(null);
  const breakpoint = useResponsiveBreakpoint(ownContainerRef);
  const fmt = valueFormatter ?? formatCompact;

  const { themeObject, decalEnabled, decalPatterns, densityFontMultiplier, effectivePalette } =
    useChartTheme({
      theme: themePreference,
      decal: decalPreference,
      density: densityPreference,
      accent: accentPreference,
    });

  const option = useMemo((): EChartsOption | null => {
    // Hold the option back until BOTH (a) data exists and (b) the lazy
    // `tree` series module has registered — see `treeFeature` above.
    if (isEmpty || !treeFeatureReady) return null;

    // Radial layout ignores `orient` (ECharts native). Orthogonal
    // honours it. Keeping the prop on the wrapper but dropping it from
    // the option for radial avoids a misleading no-op in DevTools.
    const isRadial = layout === 'radial';

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
              fontSize: scaleFontSize(16, densityFontMultiplier),
              fontWeight: 600,
            },
          }
        : undefined,
      tooltip: {
        trigger: 'item',
        triggerOn: 'mousemove',
        confine: true,
        formatter: (params: { name?: string; value?: number | unknown }) => {
          const name = escapeHtml(params.name ?? '');
          const v =
            typeof params.value === 'number' && Number.isFinite(params.value)
              ? `<br/>${escapeHtml(fmt(params.value))}`
              : '';
          return `<strong>${name}</strong>${v}`;
        },
      },
      series: [
        {
          type: 'tree' as const,
          data,
          // `layout` drives orthogonal vs radial; `orient` only
          // meaningful for orthogonal (Codex iter-1 must-fix #2).
          layout,
          ...(isRadial ? {} : { orient }),
          initialTreeDepth,
          expandAndCollapse,
          roam,
          symbolSize,
          // Generous canvas margins so deep trees don't clip; ECharts
          // tree default top/bottom 1%/1% crowds org charts.
          top: '6%',
          bottom: '6%',
          left: isRadial ? '12%' : '8%',
          right: isRadial ? '12%' : '20%',
          label: {
            show: showLabels,
            // Orthogonal LR/RL: labels sit beside the node; TB/BT and
            // radial: rotate/anchor handled by ECharts defaults.
            position: layout === 'orthogonal' && orient === 'LR' ? 'left' : 'top',
            verticalAlign: 'middle',
            align: layout === 'orthogonal' && orient === 'LR' ? 'right' : 'center',
            fontSize: scaleFontSize(11, densityFontMultiplier),
          },
          leaves: {
            label: {
              show: showLabels,
              position: layout === 'orthogonal' && orient === 'LR' ? 'right' : 'bottom',
              verticalAlign: 'middle',
              align: layout === 'orthogonal' && orient === 'LR' ? 'left' : 'center',
            },
          },
          emphasis: {
            focus: 'descendant',
          },
          lineStyle: {
            width: 1.5,
            curveness: isRadial ? 0 : 0.5,
          },
        },
      ],
      color: effectivePalette ?? DEFAULT_PALETTE,
      aria: {
        enabled: true,
        label: {
          description: title ? `Tree chart: ${escapeHtml(title)}` : 'Tree chart',
        },
        ...(decalEnabled ? { decal: { show: true, decals: decalPatterns } } : {}),
      },
    } as EChartsOption;
  }, [
    data,
    layout,
    orient,
    initialTreeDepth,
    expandAndCollapse,
    roam,
    symbolSize,
    showLabels,
    title,
    description,
    fmt,
    animate,
    isEmpty,
    treeFeatureReady,
    decalEnabled,
    decalPatterns,
    densityFontMultiplier,
    effectivePalette,
    breakpoint,
  ]);

  const handleClick = useCallback(
    (params: unknown) => {
      if (!onDataPointClick) return;
      const p = params as {
        name?: string;
        value?: number;
        data?: unknown;
        treeAncestors?: Array<{ name: string }>;
      };
      const name = typeof p.name === 'string' ? p.name : '';
      const value = typeof p.value === 'number' ? p.value : 0;
      // ECharts tree click params expose `treeAncestors` (root→node).
      const ancestors = Array.isArray(p.treeAncestors)
        ? p.treeAncestors.map((a) => a.name).filter(Boolean)
        : undefined;
      const path = ancestors ? ancestors.join(' > ') : name;
      onDataPointClick({
        datum: {
          kind: 'tree-node',
          name,
          label: name,
          path,
          depth: ancestors ? Math.max(0, ancestors.length - 1) : 0,
          data: p.data,
        },
        value,
        label: name,
      });
    },
    [onDataPointClick],
  );

  const { containerRef, instance } = useEChartsRenderer({
    // Gate echarts.init() until the lazy `tree` series module has
    // registered. ECharts snapshots its layout/visual handler list at
    // init time, so an instance created before `registerLayout(treeLayout)`
    // runs renders the tree with no `layoutInfo` and crashes TreeView
    // (Codex thread 019e337e).
    enabled: treeFeatureReady,
    option: option ?? EMPTY_TREE_OPTION,
    theme: themeObject,
    respectReducedMotion: true,
    onClick: onDataPointClick ? handleClick : undefined,
  });

  // A11y — DFS-linearized hierarchy rows. Codex 019e32da iter-1
  // must-fix #4: chart-specific linearization feeding the flat
  // useChartA11y model.
  const a11yData = useMemo(() => linearizeTreeForA11y(data ?? []), [data]);
  const a11y = useChartA11y({
    chartType: 'tree',
    data: a11yData,
    title,
    description,
    valueFormatter: fmt,
    valueColumnHeader,
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
        data-testid="tree-chart-empty"
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
      testId="tree-chart"
      setRefs={setRefs}
      anomalySummary={anomalySummary}
      formatAnomalyAnnouncement={formatAnomalyAnnouncement}
      {...rest}
    />
  );
});

TreeChartInner.displayName = 'TreeChartInner';

/**
 * TreeChart — public wrapper. Accepts `access` / `accessReason`
 * (`AccessControlledProps`) and forwards everything else to
 * `TreeChartInner`. Mirrors the access-gate wiring of every other
 * @mfe/x-charts wrapper (Faz 21.4 PR-E2).
 */
export const TreeChart = React.forwardRef<HTMLDivElement, TreeChartProps>(function TreeChart(
  { access, accessReason, onDataPointClick, anomalySummary, formatAnomalyAnnouncement, ...rest },
  ref,
) {
  const { state } = resolveAccessState(access);
  return (
    <ChartAccessGate access={access} accessReason={accessReason}>
      <TreeChartInner
        ref={ref}
        {...rest}
        onDataPointClick={guardChartCallback(state, onDataPointClick)}
        anomalySummary={anomalySummary}
        formatAnomalyAnnouncement={formatAnomalyAnnouncement}
      />
    </ChartAccessGate>
  );
});
TreeChart.displayName = 'TreeChart';

export default TreeChart;
