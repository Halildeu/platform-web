import React from 'react';
import { AreaChart as XAreaChart, type AreaChartProps as XAreaChartProps } from '@mfe/x-charts';
import { cn } from '../../utils/cn';
import { resolveAccessState, type AccessControlledProps } from '../../internal/access-controller';
import { warnDeprecatedChartOnce } from './deprecation';
import type { ChartSeries, ChartLocaleText } from './types';

/* ------------------------------------------------------------------ */
/*  AreaChart — deprecated shim around `@mfe/x-charts/AreaChart`.      */
/*                                                                     */
/*  See BarChart shim header for the migration story.                  */
/* ------------------------------------------------------------------ */

export interface AreaChartProps
  extends
    Omit<XAreaChartProps, 'series' | 'labels' | 'theme' | 'decal' | 'density' | 'accent'>,
    AccessControlledProps {
  series: ChartSeries[];
  labels: string[];
  localeText?: ChartLocaleText;
  theme?: XAreaChartProps['theme'];
  decal?: XAreaChartProps['decal'];
  density?: XAreaChartProps['density'];
  accent?: XAreaChartProps['accent'];
}

/**
 * @deprecated Use `AreaChart` from `@mfe/x-charts` instead. This entry
 * is preserved as a backward-compatible shim during the Faz 21.6
 * PR-C1 migration and will be removed in Faz 21.7.
 */
export const AreaChart = React.forwardRef<HTMLDivElement, AreaChartProps>(function AreaChart(
  { access = 'full', accessReason, localeText: _localeText, className, series, labels, ...rest },
  ref,
) {
  warnDeprecatedChartOnce('AreaChart');

  const accessState = resolveAccessState(access);
  if (accessState.isHidden) return null;

  return (
    <div
      ref={ref}
      className={cn('w-full', accessState.isDisabled && 'opacity-50', className)}
      title={accessReason}
      data-access-state={accessState.state}
    >
      <XAreaChart series={series ?? []} labels={labels ?? []} {...(rest as XAreaChartProps)} />
    </div>
  );
});

AreaChart.displayName = 'AreaChart';
export default AreaChart;
