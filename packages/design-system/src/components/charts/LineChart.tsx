import React from 'react';
import { LineChart as XLineChart, type LineChartProps as XLineChartProps } from '@mfe/x-charts';
import { cn } from '../../utils/cn';
import { resolveAccessState, type AccessControlledProps } from '../../internal/access-controller';
import { warnDeprecatedChartOnce } from './deprecation';
import type { ChartSeries, ChartLocaleText, ChartClickEvent } from './types';

/* ------------------------------------------------------------------ */
/*  LineChart — deprecated shim around `@mfe/x-charts/LineChart`.      */
/*                                                                     */
/*  See BarChart shim header for the migration story.                  */
/* ------------------------------------------------------------------ */

export interface LineChartProps
  extends
    Omit<
      XLineChartProps,
      'series' | 'labels' | 'onDataPointClick' | 'theme' | 'decal' | 'density' | 'accent'
    >,
    AccessControlledProps {
  series: ChartSeries[];
  labels: string[];
  localeText?: ChartLocaleText;
  onDataPointClick?: (event: ChartClickEvent) => void;
  theme?: XLineChartProps['theme'];
  decal?: XLineChartProps['decal'];
  density?: XLineChartProps['density'];
  accent?: XLineChartProps['accent'];
}

/**
 * @deprecated Use `LineChart` from `@mfe/x-charts` instead. This entry
 * is preserved as a backward-compatible shim during the Faz 21.6
 * PR-C1 migration and will be removed in Faz 21.7.
 */
export const LineChart = React.forwardRef<HTMLDivElement, LineChartProps>(function LineChart(
  { access = 'full', accessReason, localeText: _localeText, className, series, labels, ...rest },
  ref,
) {
  warnDeprecatedChartOnce('LineChart');

  const accessState = resolveAccessState(access);
  if (accessState.isHidden) return null;

  return (
    <div
      ref={ref}
      className={cn('w-full', accessState.isDisabled && 'opacity-50', className)}
      title={accessReason}
      data-access-state={accessState.state}
    >
      {/* Spread first; explicit `series`/`labels` last (see AreaChart for context). */}
      <XLineChart {...(rest as XLineChartProps)} series={series ?? []} labels={labels ?? []} />
    </div>
  );
});

LineChart.displayName = 'LineChart';
export default LineChart;
