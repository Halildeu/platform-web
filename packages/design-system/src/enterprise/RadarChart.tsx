import React from 'react';
import { RadarChart as XRadarChart, type RadarChartProps as XRadarChartProps } from '@mfe/x-charts';
import { cn } from '../utils/cn';
import {
  resolveAccessState,
  accessStyles,
  type AccessControlledProps,
} from '../internal/access-controller';
import { warnDeprecatedChartOnce } from '../components/charts/deprecation';
import { toChartSizeFromPx } from './_chart-adapter-helpers';

/* ------------------------------------------------------------------ */
/*  RadarChart — deprecated shim around `@mfe/x-charts/RadarChart`.    */
/*                                                                     */
/*  Faz 21.6 PR-C2: rendering ownership moved to `@mfe/x-charts`.      */
/*  See FunnelChart shim header for the migration story.               */
/* ------------------------------------------------------------------ */

export interface RadarAxis {
  key: string;
  label: string;
  /** Max value for this axis (default uses global max) */
  max?: number;
}

export interface RadarSeries {
  id: string;
  label: string;
  /** Values keyed by axis key */
  values: Record<string, number>;
  color?: string;
  fillOpacity?: number;
}

export interface RadarChartProps extends AccessControlledProps {
  axes: RadarAxis[];
  series: RadarSeries[];
  /** Chart size in px (legacy). Mapped to `@mfe/x-charts` size variant
   *  (sm <= 250, md <= 350, lg > 350). @default 300 */
  size?: number;
  /** Number of concentric grid levels (mapped to `splitNumber`). @default 5 */
  levels?: number;
  /** Show axis labels. @default true */
  showLabels?: boolean;
  /** Show legend below chart. @default true */
  showLegend?: boolean;
  /** Show value tooltip on hover. NO-OP in shim — `@mfe/x-charts` always
   *  renders ECharts default tooltip. Kept for type compatibility. */
  showTooltip?: boolean;
  /** Color palette for series without explicit color. */
  palette?: string[];
  /** Additional class names. */
  className?: string;
}

type XRadarSeries = XRadarChartProps['series'];

const DEFAULT_PALETTE = [
  'var(--action-primary)',
  'var(--state-info-text)',
  'var(--state-success-text)',
  'var(--state-warning-text)',
  'var(--state-error-text)',
  'var(--chart-purple)',
  'var(--chart-pink)',
  'var(--chart-cyan)',
];

function adaptAxesToIndicators(axes: RadarAxis[]): XRadarChartProps['indicators'] {
  return axes.map((a) => ({
    name: a.label,
    max: a.max,
  })) as XRadarChartProps['indicators'];
}

function adaptSeries(series: RadarSeries[], axes: RadarAxis[], palette: string[]): XRadarSeries {
  return series.map((s, i) => ({
    name: s.label,
    data: axes.map((a) => s.values[a.key] ?? 0),
    color: s.color ?? palette[i % palette.length],
    areaStyle: s.fillOpacity != null ? { opacity: s.fillOpacity } : undefined,
  })) as XRadarSeries;
}

/**
 * @deprecated Use `RadarChart` from `@mfe/x-charts` instead. PR-C2 shim.
 */
export const RadarChart: React.FC<RadarChartProps> = ({
  axes,
  series,
  size,
  levels,
  showLabels = true,
  showLegend = true,
  // showTooltip is intentionally NOT forwarded — see prop docstring.
  showTooltip: _showTooltip,
  palette = DEFAULT_PALETTE,
  className,
  access,
  accessReason,
}) => {
  warnDeprecatedChartOnce('RadarChart');

  const accessState = resolveAccessState(access);
  if (accessState.isHidden) return null;

  return (
    <div
      className={cn(
        'inline-flex flex-col items-center',
        accessStyles(accessState.state),
        className,
      )}
      data-component="radar-chart"
      data-access-state={accessState.state}
      title={accessReason}
    >
      <XRadarChart
        indicators={adaptAxesToIndicators(axes ?? [])}
        series={adaptSeries(series ?? [], axes ?? [], palette)}
        size={toChartSizeFromPx(size)}
        splitNumber={levels}
        showLabels={showLabels}
        showLegend={showLegend}
      />
    </div>
  );
};

RadarChart.displayName = 'RadarChart';
export default RadarChart;
