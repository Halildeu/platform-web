import React from 'react';
import { GaugeChart as XGaugeChart, type GaugeChartProps as XGaugeChartProps } from '@mfe/x-charts';
import { cn } from '../utils/cn';
import {
  resolveAccessState,
  accessStyles,
  type AccessControlledProps,
} from '../internal/access-controller';
import { warnDeprecatedChartOnce } from '../components/charts/deprecation';

/* ------------------------------------------------------------------ */
/*  GaugeChart — deprecated shim around `@mfe/x-charts/GaugeChart`.    */
/*                                                                     */
/*  Faz 21.6 PR-C2: rendering ownership moved to `@mfe/x-charts`.      */
/*  Known limitation: `showValue=false` has no faithful equivalent in  */
/*  `@mfe/x-charts/GaugeChart`. We drop the prop without forwarding —  */
/*  the canonical gauge always renders the value. Use the canonical    */
/*  import directly for consumers that genuinely need to hide the      */
/*  central value.                                                     */
/* ------------------------------------------------------------------ */

export interface GaugeThreshold {
  value: number;
  color: string;
  label?: string;
}

export interface GaugeChartProps extends AccessControlledProps {
  value: number;
  /** @default 0 */
  min?: number;
  /** @default 100 */
  max?: number;
  /** Bottom label. Mapped to `@mfe/x-charts` `title` (only when
   *  `showLabel` is not explicitly false). */
  label?: string;
  /** Unit suffix (e.g. "%"). Composed into a `valueFormatter` callback. */
  unit?: string;
  /** Color threshold zones. Defaults to the legacy DS thresholds for
   *  backward compatibility. */
  thresholds?: GaugeThreshold[];
  /** @default "md" */
  size?: 'sm' | 'md' | 'lg';
  /** No-op in this shim. The canonical gauge always renders the value. */
  showValue?: boolean;
  /** When false, the bottom title is suppressed. @default true */
  showLabel?: boolean;
  /** @default true */
  animate?: boolean;
  /** Additional class names. */
  className?: string;
}

const DS_DEFAULT_THRESHOLDS: GaugeThreshold[] = [
  { value: 33, color: 'var(--state-danger-text)', label: 'Low' },
  { value: 66, color: 'var(--state-warning-text)', label: 'Medium' },
  { value: 100, color: 'var(--state-success-text)', label: 'High' },
];

function buildUnitFormatter(unit: string | undefined): ((v: number) => string) | undefined {
  if (!unit) return undefined;
  return (v: number) => `${v}${unit}`;
}

/**
 * @deprecated Use `GaugeChart` from `@mfe/x-charts` instead. PR-C2 shim.
 */
export const GaugeChart: React.FC<GaugeChartProps> = ({
  value,
  min = 0,
  max = 100,
  label,
  unit,
  thresholds,
  size = 'md',
  // No faithful x-charts equivalent for showValue=false; documented
  // limitation. We accept the prop for API compatibility but ignore it.
  showValue: _showValue,
  showLabel = true,
  animate = true,
  className,
  access,
  accessReason,
}) => {
  warnDeprecatedChartOnce('GaugeChart');

  const accessState = resolveAccessState(access);
  if (accessState.isHidden) return null;

  const resolvedTitle = showLabel ? label : undefined;
  const valueFormatter = buildUnitFormatter(unit);

  return (
    <div
      className={cn(
        'gauge-chart-root inline-flex flex-col items-center',
        accessStyles(accessState.state),
        className,
      )}
      data-component="gauge-chart"
      data-access-state={accessState.state}
      title={accessReason}
    >
      <XGaugeChart
        value={value}
        min={min}
        max={max}
        title={resolvedTitle}
        size={size}
        thresholds={thresholds ?? DS_DEFAULT_THRESHOLDS}
        animate={animate}
        {...(valueFormatter
          ? ({ valueFormatter } as Pick<XGaugeChartProps, 'valueFormatter'>)
          : {})}
      />
    </div>
  );
};

GaugeChart.displayName = 'GaugeChart';
export default GaugeChart;
