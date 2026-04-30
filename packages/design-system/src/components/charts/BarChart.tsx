import React from 'react';
import { BarChart as XBarChart, type BarChartProps as XBarChartProps } from '@mfe/x-charts';
import { cn } from '../../utils/cn';
import { resolveAccessState, type AccessControlledProps } from '../../internal/access-controller';
import { warnDeprecatedChartOnce } from './deprecation';
import type { ChartDataPoint, ChartLocaleText, ChartClickEvent } from './types';

/* ------------------------------------------------------------------ */
/*  BarChart — deprecated shim around `@mfe/x-charts/BarChart`.        */
/*                                                                     */
/*  Faz 21.6 PR-C1: rendering ownership moved to `@mfe/x-charts`.      */
/*  This module now exists as a backward-compatible shim that          */
/*  preserves the design-system access-control surface                 */
/*  (`access`, `accessReason`) and the legacy DS chart prop types      */
/*  (`ChartDataPoint`, `ChartClickEvent`, `ChartLocaleText`).          */
/*                                                                     */
/*  Will be removed in Faz 21.7. New code should import directly       */
/*  from `@mfe/x-charts`.                                              */
/* ------------------------------------------------------------------ */

export interface BarChartProps
  extends
    Omit<XBarChartProps, 'data' | 'onDataPointClick' | 'theme' | 'decal' | 'density' | 'accent'>,
    AccessControlledProps {
  data: ChartDataPoint[];
  localeText?: ChartLocaleText;
  onDataPointClick?: (event: ChartClickEvent) => void;
  theme?: XBarChartProps['theme'];
  decal?: XBarChartProps['decal'];
  density?: XBarChartProps['density'];
  accent?: XBarChartProps['accent'];
}

/**
 * @deprecated Use `BarChart` from `@mfe/x-charts` instead. This entry
 * is preserved as a backward-compatible shim during the Faz 21.6
 * PR-C1 migration and will be removed in Faz 21.7.
 */
export const BarChart = React.forwardRef<HTMLDivElement, BarChartProps>(function BarChart(
  {
    access = 'full',
    accessReason,
    // localeText is intentionally accepted for backward compatibility
    // but not forwarded to x-charts (known limitation: x-charts empty
    // state text is not currently overridable via prop).
    localeText: _localeText,
    className,
    data,
    ...rest
  },
  ref,
) {
  warnDeprecatedChartOnce('BarChart');

  const accessState = resolveAccessState(access);
  if (accessState.isHidden) return null;

  return (
    <div
      ref={ref}
      className={cn('w-full', accessState.isDisabled && 'opacity-50', className)}
      title={accessReason}
      data-access-state={accessState.state}
    >
      <XBarChart data={data ?? []} {...(rest as XBarChartProps)} />
    </div>
  );
});

BarChart.displayName = 'BarChart';
export default BarChart;
