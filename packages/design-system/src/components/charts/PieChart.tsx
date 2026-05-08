import React from 'react';
import { PieChart as XPieChart, type PieChartProps as XPieChartProps } from '@mfe/x-charts';
import { cn } from '../../utils/cn';
import { resolveAccessState, type AccessControlledProps } from '../../internal/access-controller';
import { warnDeprecatedChartOnce } from './deprecation';
import type { ChartDataPoint, ChartLocaleText, ChartClickEvent } from './types';

/* ------------------------------------------------------------------ */
/*  PieChart — deprecated shim around `@mfe/x-charts/PieChart`.        */
/*                                                                     */
/*  See BarChart shim header for the migration story.                  */
/* ------------------------------------------------------------------ */

export interface PieChartProps
  extends
    Omit<XPieChartProps, 'data' | 'onDataPointClick' | 'theme' | 'decal' | 'density' | 'accent'>,
    AccessControlledProps {
  data: ChartDataPoint[];
  localeText?: ChartLocaleText;
  onDataPointClick?: (event: ChartClickEvent) => void;
  theme?: XPieChartProps['theme'];
  decal?: XPieChartProps['decal'];
  density?: XPieChartProps['density'];
  accent?: XPieChartProps['accent'];
}

/**
 * @deprecated Use `PieChart` from `@mfe/x-charts` instead. This entry
 * is preserved as a backward-compatible shim during the Faz 21.6
 * PR-C1 migration and will be removed in Faz 21.7.
 */
export const PieChart = React.forwardRef<HTMLDivElement, PieChartProps>(function PieChart(
  { access = 'full', accessReason, localeText: _localeText, className, data, ...rest },
  ref,
) {
  warnDeprecatedChartOnce('PieChart');

  const accessState = resolveAccessState(access);
  if (accessState.isHidden) return null;

  return (
    <div
      ref={ref}
      className={cn('w-full', accessState.isDisabled && 'opacity-50', className)}
      title={accessReason}
      data-access-state={accessState.state}
    >
      {/* Spread first; explicit `data` last (see AreaChart for context). */}
      <XPieChart {...(rest as XPieChartProps)} data={data ?? []} />
    </div>
  );
});

PieChart.displayName = 'PieChart';
export default PieChart;
