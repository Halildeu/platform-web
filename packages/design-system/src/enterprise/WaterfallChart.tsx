import React from 'react';
import {
  WaterfallChart as XWaterfallChart,
  type WaterfallChartProps as XWaterfallChartProps,
} from '@mfe/x-charts';
import { cn } from '../utils/cn';
import {
  resolveAccessState,
  accessStyles,
  type AccessControlledProps,
} from '../internal/access-controller';
import { warnDeprecatedChartOnce } from '../components/charts/deprecation';
import { toChartSizeFromPx } from './_chart-adapter-helpers';

/* ------------------------------------------------------------------ */
/*  WaterfallChart — deprecated shim around                            */
/*  `@mfe/x-charts/WaterfallChart`.                                    */
/*                                                                     */
/*  Faz 21.6 PR-C2: rendering ownership moved to `@mfe/x-charts`.      */
/*  Per-item color override (DS `WaterfallItem.color`) is best-effort: */
/*  x-charts only accepts type-level `colors`, so we collect the first */
/*  custom color seen for each type and forward that.                  */
/* ------------------------------------------------------------------ */

export interface WaterfallItem {
  id: string;
  label: string;
  value: number;
  type: 'increase' | 'decrease' | 'total';
  color?: string;
}

export interface WaterfallChartProps extends AccessControlledProps {
  items: WaterfallItem[];
  /** Chart height (legacy, px or CSS string). Mapped to `@mfe/x-charts`
   *  size variant. String values not understood as px fall back to "md". */
  height?: number | string;
  /** Show value labels. @default true */
  showValues?: boolean;
  /** Show dashed connector lines between bars. @default true */
  showConnectors?: boolean;
  /** Custom value formatter. */
  format?: (value: number) => string;
  /** Click handler — receives the original DS item. */
  onItemClick?: (item: WaterfallItem) => void;
  /** Additional class names. */
  className?: string;
}

type XWaterfallData = XWaterfallChartProps['data'];

function adaptItemsToData(items: WaterfallItem[]): XWaterfallData {
  return items.map((it) => ({
    id: it.id,
    name: it.label,
    value: it.value,
    type: it.type,
  })) as XWaterfallData;
}

function collectTypeColors(items: WaterfallItem[]): XWaterfallChartProps['colors'] | undefined {
  const acc: { increase?: string; decrease?: string; total?: string } = {};
  for (const it of items) {
    if (it.color && !acc[it.type]) {
      acc[it.type] = it.color;
    }
  }
  return Object.keys(acc).length > 0 ? acc : undefined;
}

function parseHeight(height?: number | string): number | undefined {
  if (height == null) return undefined;
  if (typeof height === 'number') return height;
  // Try to parse a leading numeric prefix (e.g. "300px").
  const match = /^(\d+(?:\.\d+)?)/.exec(height);
  return match ? Number(match[1]) : undefined;
}

function adaptItemClick(
  onItemClick: ((item: WaterfallItem) => void) | undefined,
  items: WaterfallItem[],
): ((params: unknown) => void) | undefined {
  if (!onItemClick) return undefined;
  return (params: unknown) => {
    const e = params as { dataIndex?: number; name?: string };
    const item =
      typeof e.dataIndex === 'number' && items[e.dataIndex]
        ? items[e.dataIndex]
        : items.find((it) => it.label === e.name);
    if (item) onItemClick(item);
  };
}

/**
 * @deprecated Use `WaterfallChart` from `@mfe/x-charts` instead. PR-C2 shim.
 */
export const WaterfallChart: React.FC<WaterfallChartProps> = ({
  items,
  height,
  showValues = true,
  showConnectors = true,
  format,
  onItemClick,
  className,
  access,
  accessReason,
}) => {
  warnDeprecatedChartOnce('WaterfallChart');

  const accessState = resolveAccessState(access);
  if (accessState.isHidden) return null;

  return (
    <div
      className={cn(
        'border border-border-default rounded-lg bg-surface-default p-4',
        accessStyles(accessState.state),
        className,
      )}
      data-component="waterfall-chart"
      data-access-state={accessState.state}
      title={accessReason}
    >
      <XWaterfallChart
        data={adaptItemsToData(items ?? [])}
        size={toChartSizeFromPx(parseHeight(height))}
        showValues={showValues}
        showConnector={showConnectors}
        valueFormatter={format}
        colors={collectTypeColors(items ?? [])}
        onDataPointClick={adaptItemClick(onItemClick, items ?? [])}
      />
    </div>
  );
};

WaterfallChart.displayName = 'WaterfallChart';
export default WaterfallChart;
