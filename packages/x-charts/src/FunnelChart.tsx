'use client';

/**
 * FunnelChart -- ECharts-powered funnel chart
 *
 * Renders a funnel/pyramid visualization with optional conversion rate
 * display between stages. Supports vertical/horizontal orientation,
 * configurable label positioning, and sort order.
 *
 * Uses the centralized useEChartsRenderer hook for lifecycle management.
 *
 * @migration AG Charts -> ECharts (P3)
 */
import React, { useMemo, useCallback, useRef } from 'react';
import type { AccessControlledProps } from '@mfe/shared-types';
import { resolveAccessState } from '@mfe/shared-types';
import { ChartAccessGate } from './access/ChartAccessGate';
import { guardChartCallback } from './access/guardChartCallback';
import { cn } from './utils/cn';
import { useEChartsRenderer } from './renderers';
import { useResponsiveBreakpoint } from './useResponsiveChart';
import { buildResponsiveLegend } from './responsive';
import { ChartA11yShell, useChartA11y } from './a11y';
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
import { sanitizeDataPoints } from './utils/data-validation';
import type { EChartsOption } from './renderers/echarts-imports';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface FunnelDataPoint {
  /** Stage name displayed in labels and tooltip. */
  name: string;
  /** Numeric value determining the width of the stage. */
  value: number;
  /** Optional per-stage color override. */
  color?: string;
}

export interface FunnelChartProps extends AccessControlledProps {
  /** Data points to render as funnel stages. */
  data: FunnelDataPoint[];
  /** Visual size variant. @default "md" */
  size?: 'sm' | 'md' | 'lg';
  /** Chart title. */
  title?: string;
  /** Sort order for funnel stages. @default "descending" */
  sort?: 'descending' | 'ascending' | 'none';
  /** Pixel gap between funnel stages. @default 2 */
  gap?: number;
  /** Show labels on stages. @default true */
  showLabels?: boolean;
  /** Label placement. @default "inside" */
  labelPosition?: 'inside' | 'outside' | 'left' | 'right';
  /** Show conversion percentage between consecutive stages. @default false */
  showConversion?: boolean;
  /** Funnel layout direction. @default "vertical" */
  orientation?: 'vertical' | 'horizontal';
  /** Horizontal alignment of the funnel shape. @default "center" */
  funnelAlign?: 'left' | 'center' | 'right';
  /** Show legend below the chart. @default false */
  showLegend?: boolean;
  /** Custom value formatter for labels and tooltip. */
  valueFormatter?: (v: number) => string;
  /** Animate on mount. @default true */
  animate?: boolean;
  /** Callback fired when a stage is clicked. */
  onDataPointClick?: (params: unknown) => void;
  /** Additional class name. */
  className?: string;
  /**
   * Theme override.
   * @default "auto" — follows documentElement signals
   */
  theme?: ChartThemePreference;
  /**
   * Decal pattern override.
   * @default "auto" — enabled for high-contrast and print themes
   */
  decal?: ChartDecalPreference;
  /** Density override. @default "auto" */
  density?: ChartDensityPreference;
  /** Accent palette override. @default "auto" */
  accent?: ChartAccentPreference;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_PALETTE = [
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#06b6d4',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#6366f1',
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const escapeHtml = (t: string): string =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Build a conversion-rate map keyed by stage name.
 * The first stage (by sort order) is 100 %; subsequent stages show
 * the percentage relative to their immediate predecessor.
 */
function buildConversionMap(data: FunnelDataPoint[], sort: string): Map<string, number> {
  const sorted = [...data];
  if (sort === 'descending') sorted.sort((a, b) => b.value - a.value);
  else if (sort === 'ascending') sorted.sort((a, b) => a.value - b.value);
  // "none" keeps the original insertion order

  const map = new Map<string, number>();
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0) {
      map.set(sorted[i].name, 100);
    } else {
      const prev = sorted[i - 1].value;
      const pct = prev !== 0 ? (sorted[i].value / prev) * 100 : 0;
      map.set(sorted[i].name, pct);
    }
  }
  return map;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * FunnelChart inner — original hook-bearing body. The outer `FunnelChart`
 * wrapper below adds the `access` / `accessReason` gate without touching
 * hook order (Faz 21.4 PR-E2). Accepting `Omit<FunnelChartProps, 'access' |
 * 'accessReason'>` keeps the inner contract honest: access is resolved
 * exactly once, in the outer wrapper, never re-read inside the hooks.
 */
const FunnelChartInner = React.forwardRef<
  HTMLDivElement,
  Omit<FunnelChartProps, 'access' | 'accessReason'>
>(function FunnelChartInner(
  {
    data,
    size = 'md',
    title,
    sort = 'descending',
    gap = 2,
    showLabels = true,
    labelPosition = 'inside',
    showConversion = false,
    orientation = 'vertical',
    funnelAlign = 'center',
    showLegend = false,
    valueFormatter,
    animate = true,
    onDataPointClick,
    className,
    theme: themePreference = 'auto',
    decal: decalPreference = 'auto',
    density: densityPreference = 'auto',
    accent: accentPreference = 'auto',
    ...rest
  },
  forwardedRef,
) {
  const height = CHART_CANVAS_HEIGHT[size];
  const isEmpty = !data || data.length === 0;
  const safeData = useMemo(
    () => sanitizeDataPoints(data as never) as unknown as FunnelDataPoint[],
    [data],
  );

  // Faz 21.9 PR3d: container ref + breakpoint for responsive funnel.
  const ownContainerRef = useRef<HTMLDivElement | null>(null);
  const breakpoint = useResponsiveBreakpoint(ownContainerRef);
  const fmt = valueFormatter ?? formatCompact;

  const {
    themeObject,
    decalEnabled,
    decalPatterns,
    densityFontMultiplier,
    densitySpacingMultiplier,
    effectivePalette,
  } = useChartTheme({
    theme: themePreference,
    decal: decalPreference,
    density: densityPreference,
    accent: accentPreference,
  });

  const option = useMemo((): EChartsOption | null => {
    if (isEmpty) return null;

    const conversionMap = showConversion ? buildConversionMap(safeData, sort) : null;

    /* -- Prepare series data with per-stage colors -- */
    const palette = effectivePalette ?? DEFAULT_PALETTE;
    const seriesData = safeData.map((d, i) => ({
      name: d.name,
      value: d.value,
      itemStyle: {
        color: d.color ?? palette[i % palette.length],
      },
    }));

    /* -- Label formatter: optionally appends conversion % -- */
    const labelFormatter = (params: { name: string; value: number }) => {
      const base = `${params.name}: ${fmt(params.value)}`;
      if (!conversionMap) return base;
      const pct = conversionMap.get(params.name);
      if (pct === undefined || pct === 100) return base;
      return `${base}\n(${pct.toFixed(1)}%)`;
    };

    return {
      animation: animate,
      animationDuration: animate ? 500 : 0,
      animationEasing: 'cubicOut',
      title: title
        ? {
            text: escapeHtml(title),
            left: 'center',
            textStyle: {
              fontSize: scaleFontSize(16, densityFontMultiplier),
              fontWeight: 600,
            },
          }
        : undefined,
      tooltip: {
        trigger: 'item',
        confine: true,
        formatter: (params: unknown) => {
          const p = params as { name: string; value: number; percent: number };
          let tip = `<b>${escapeHtml(p.name)}</b><br/>${fmt(p.value)}`;
          if (conversionMap) {
            const pct = conversionMap.get(p.name);
            if (pct !== undefined && pct !== 100) {
              tip += `<br/>Conversion: ${pct.toFixed(1)}%`;
            }
          }
          return tip;
        },
      },
      legend: buildResponsiveLegend({
        breakpoint,
        showLegend,
        // Funnel is single-series at the legend level (one tier breakdown).
        hasMultiSeries: false,
        seriesCount: safeData.length,
        densitySpacingMultiplier,
        densityFontMultiplier,
        icon: 'roundRect',
        truncateAt: breakpoint === 'mobile' ? 12 : 18,
      }),
      series: [
        {
          type: 'funnel' as const,
          left: '10%',
          top: title ? 48 : 24,
          bottom: showLegend ? 48 : 24,
          width: '80%',
          sort: sort === 'none' ? ('none' as const) : sort,
          orient: orientation === 'horizontal' ? 'horizontal' : 'vertical',
          funnelAlign,
          gap,
          data: seriesData,
          label: showLabels
            ? {
                // Mobile suppresses outside labels — they collide with the
                // shrunken funnel envelope. Inside-position labels keep
                // showing (funnel slices have room internally even on
                // mobile).
                show: !(breakpoint === 'mobile' && labelPosition !== 'inside'),
                position: labelPosition,
                formatter: labelFormatter,
                fontSize:
                  breakpoint === 'mobile'
                    ? Math.max(10, Math.round(12 * 0.9))
                    : scaleFontSize(12, densityFontMultiplier),
              }
            : { show: false },
          emphasis: {
            label: {
              show: true,
              fontSize: scaleFontSize(14, densityFontMultiplier),
              fontWeight: 'bold' as const,
            },
          },
          itemStyle: {
            borderColor: 'var(--bg-surface, #ffffff)',
            borderWidth: 1,
          },
          cursor: onDataPointClick ? 'pointer' : 'default',
        },
      ],
      aria: {
        enabled: true,
        label: {
          description: title ? `Funnel chart: ${escapeHtml(title)}` : 'Funnel chart',
        },
        ...(decalEnabled ? { decal: { show: true, decals: decalPatterns } } : {}),
      },
    } as EChartsOption;
  }, [
    safeData,
    size,
    title,
    sort,
    gap,
    showLabels,
    labelPosition,
    showConversion,
    orientation,
    funnelAlign,
    showLegend,
    fmt,
    animate,
    onDataPointClick,
    isEmpty,
    decalEnabled,
    decalPatterns,
    densityFontMultiplier,
    densitySpacingMultiplier,
    effectivePalette,
    breakpoint,
  ]);

  const handleClick = useCallback(
    (params: unknown) => {
      if (!onDataPointClick) return;
      onDataPointClick(params);
    },
    [onDataPointClick],
  );

  const { containerRef, instance } = useEChartsRenderer({
    option: option ?? ({} as EChartsOption),
    theme: themeObject,
    respectReducedMotion: true,
    onClick: onDataPointClick ? handleClick : undefined,
  });

  // Faz 21.5-B PR-B2: default-on a11y. FunnelChart's data uses
  // `name` (not `label`) for the stage caption — adapt accordingly.
  const a11yData = useMemo(
    () => safeData.map((d) => ({ label: d.name, value: d.value })),
    [safeData],
  );
  const a11y = useChartA11y({
    chartType: 'funnel',
    data: a11yData,
    title,
    valueFormatter: fmt,
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
        data-testid="funnel-chart-empty"
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
      testId="funnel-chart"
      setRefs={setRefs}
      {...rest}
    />
  );
});

FunnelChartInner.displayName = 'FunnelChartInner';

/**
 * FunnelChart — public wrapper. Accepts `access` + `accessReason`
 * (`AccessControlledProps`) and forwards everything else to
 * `FunnelChartInner`. Faz 21.4 PR-E2 wiring; default `access === undefined`
 * follows the identity-transform path through `ChartAccessGate`.
 */
export const FunnelChart = React.forwardRef<HTMLDivElement, FunnelChartProps>(function FunnelChart(
  { access, accessReason, onDataPointClick, ...rest },
  ref,
) {
  const { state } = resolveAccessState(access);
  return (
    <ChartAccessGate access={access} accessReason={accessReason}>
      <FunnelChartInner
        ref={ref}
        {...rest}
        onDataPointClick={guardChartCallback(state, onDataPointClick)}
      />
    </ChartAccessGate>
  );
});
FunnelChart.displayName = 'FunnelChart';

export default FunnelChart;
