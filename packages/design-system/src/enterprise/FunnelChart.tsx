import React from 'react';
import {
  FunnelChart as XFunnelChart,
  type FunnelChartProps as XFunnelChartProps,
} from '@mfe/x-charts';
import { cn } from '../utils/cn';
import {
  resolveAccessState,
  accessStyles,
  type AccessControlledProps,
} from '../internal/access-controller';
import { warnDeprecatedChartOnce } from '../components/charts/deprecation';
import { toValueFormatter } from './_chart-adapter-helpers';
import type { FormatOptions } from './types';

/* ------------------------------------------------------------------ */
/*  FunnelChart — deprecated shim around `@mfe/x-charts/FunnelChart`.  */
/*                                                                     */
/*  Faz 21.6 PR-C2: rendering ownership moved to `@mfe/x-charts`.      */
/*  The DS surface (`stages`, `animated`, `formatOptions`,             */
/*  `onStageClick`, `access`/`accessReason`) is preserved as a         */
/*  backward-compatible wrapper. Will be removed in Faz 21.7.          */
/* ------------------------------------------------------------------ */

export interface FunnelStage {
  id: string;
  label: string;
  value: number;
  color?: string;
}

export interface FunnelChartProps extends AccessControlledProps {
  /** Ordered funnel stages — preserved as-is in the rendered output. */
  stages: FunnelStage[];
  /** Layout direction. @default "vertical" */
  orientation?: 'vertical' | 'horizontal';
  /** Animate on mount. @default true */
  animated?: boolean;
  /** Number formatting options for stage values. */
  formatOptions?: FormatOptions;
  /** Click handler — receives the original DS stage object. */
  onStageClick?: (stage: FunnelStage) => void;
  /** Additional CSS class names for the wrapper element. */
  className?: string;
}

type XFunnelData = XFunnelChartProps['data'];

function adaptStagesToData(stages: FunnelStage[]): XFunnelData {
  return stages.map((s) => ({
    id: s.id,
    name: s.label,
    value: s.value,
    color: s.color,
  })) as XFunnelData;
}

function adaptStageClick(
  onStageClick: ((stage: FunnelStage) => void) | undefined,
  stages: FunnelStage[],
): ((params: unknown) => void) | undefined {
  if (!onStageClick) return undefined;
  return (params: unknown) => {
    const e = params as { dataIndex?: number; name?: string };
    const stage =
      typeof e.dataIndex === 'number' && stages[e.dataIndex]
        ? stages[e.dataIndex]
        : stages.find((s) => s.label === e.name);
    if (stage) onStageClick(stage);
  };
}

/**
 * @deprecated Use `FunnelChart` from `@mfe/x-charts` instead. PR-C2 shim.
 */
export const FunnelChart: React.FC<FunnelChartProps> = ({
  stages,
  orientation = 'vertical',
  animated = true,
  formatOptions,
  onStageClick,
  className,
  access,
  accessReason,
}) => {
  warnDeprecatedChartOnce('FunnelChart');

  const accessState = resolveAccessState(access);
  if (accessState.isHidden) return null;

  return (
    <div
      className={cn('w-full', accessStyles(accessState.state), className)}
      data-component="funnel-chart"
      data-access-state={accessState.state}
      title={accessReason}
    >
      <XFunnelChart
        data={adaptStagesToData(stages ?? [])}
        // KRITIKAL: x-charts default sort='descending' fakat DS verilen sirayi korur.
        sort="none"
        orientation={orientation}
        animate={animated}
        valueFormatter={toValueFormatter(formatOptions)}
        onDataPointClick={adaptStageClick(onStageClick, stages ?? [])}
      />
    </div>
  );
};

FunnelChart.displayName = 'FunnelChart';
export default FunnelChart;
