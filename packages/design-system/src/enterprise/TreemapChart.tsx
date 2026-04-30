import React from 'react';
import {
  TreemapChart as XTreemapChart,
  type TreemapChartProps as XTreemapChartProps,
} from '@mfe/x-charts';
import { cn } from '../utils/cn';
import {
  resolveAccessState,
  accessStyles,
  type AccessControlledProps,
} from '../internal/access-controller';
import { warnDeprecatedChartOnce } from '../components/charts/deprecation';
import { toChartSizeFromPx, toValueFormatter } from './_chart-adapter-helpers';
import type { FormatOptions } from './types';

/* ------------------------------------------------------------------ */
/*  TreemapChart — deprecated shim around `@mfe/x-charts/TreemapChart`.*/
/*                                                                     */
/*  Faz 21.6 PR-C2: rendering ownership moved to `@mfe/x-charts`.      */
/*  See FunnelChart shim header for the migration story.               */
/* ------------------------------------------------------------------ */

export interface TreemapItem {
  id: string;
  label: string;
  value: number;
  color?: string;
  children?: TreemapItem[];
}

export interface TreemapChartProps extends AccessControlledProps {
  items: TreemapItem[];
  /** Chart width (px, legacy). Mapped to `@mfe/x-charts` size variant. */
  width?: number;
  /** Chart height (px, legacy). Mapped to `@mfe/x-charts` size variant. */
  height?: number;
  /** Number formatting. */
  formatOptions?: FormatOptions;
  /** Click handler — receives the original DS item. */
  onItemClick?: (item: TreemapItem) => void;
  /** Color palette for items without explicit color. */
  palette?: string[];
  /** Additional class names. */
  className?: string;
}

type XTreemapNode = XTreemapChartProps['data'][number] & {
  __dsId?: string;
  children?: XTreemapNode[];
};

const DEFAULT_PALETTE = [
  'var(--action-primary)',
  'var(--state-info-text)',
  'var(--state-success-text)',
  'var(--state-warning-text)',
  'var(--state-error-text)',
  'var(--chart-purple)',
  'var(--chart-pink)',
  'var(--chart-cyan)',
  'var(--chart-amber)',
  'var(--chart-emerald)',
];

function adaptItemsToData(items: TreemapItem[], palette: string[]): XTreemapNode[] {
  return items.map((it, i) => ({
    name: it.label,
    value: it.value,
    itemStyle: { color: it.color ?? palette[i % palette.length] },
    children: it.children ? adaptItemsToData(it.children, palette) : undefined,
    __dsId: it.id,
  })) as XTreemapNode[];
}

function findItemRecursive(
  items: TreemapItem[],
  predicate: (it: TreemapItem) => boolean,
): TreemapItem | undefined {
  for (const it of items) {
    if (predicate(it)) return it;
    if (it.children) {
      const child = findItemRecursive(it.children, predicate);
      if (child) return child;
    }
  }
  return undefined;
}

function adaptItemClick(
  onItemClick: ((item: TreemapItem) => void) | undefined,
  items: TreemapItem[],
): XTreemapChartProps['onNodeClick'] {
  if (!onItemClick) return undefined;
  return (params) => {
    const data = params?.data as { __dsId?: string } | undefined;
    const id = data?.__dsId;
    const found =
      id !== undefined
        ? findItemRecursive(items, (it) => it.id === id)
        : findItemRecursive(items, (it) => it.label === params?.name);
    if (found) onItemClick(found);
  };
}

/**
 * @deprecated Use `TreemapChart` from `@mfe/x-charts` instead. PR-C2 shim.
 */
export const TreemapChart: React.FC<TreemapChartProps> = ({
  items,
  width,
  height,
  formatOptions,
  onItemClick,
  palette = DEFAULT_PALETTE,
  className,
  access,
  accessReason,
}) => {
  warnDeprecatedChartOnce('TreemapChart');

  const accessState = resolveAccessState(access);
  if (accessState.isHidden) return null;

  // Prefer width when both supplied (legacy DS box was width-driven).
  const sizeFromPx = toChartSizeFromPx(width ?? height);

  return (
    <div
      className={cn(
        'border border-border-default rounded-lg bg-surface-default p-2 overflow-hidden',
        accessStyles(accessState.state),
        className,
      )}
      data-component="treemap-chart"
      data-access-state={accessState.state}
      title={accessReason}
    >
      <XTreemapChart
        data={adaptItemsToData(items ?? [], palette)}
        size={sizeFromPx}
        valueFormatter={toValueFormatter(formatOptions)}
        onNodeClick={adaptItemClick(onItemClick, items ?? [])}
      />
    </div>
  );
};

TreemapChart.displayName = 'TreemapChart';
export default TreemapChart;
