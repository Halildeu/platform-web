'use client';

/**
 * RadarChart -- ECharts-powered radar / spider chart
 *
 * Supports multiple series overlays, polygon or circle shapes,
 * area fills, and custom axis indicators. Uses the centralized
 * useEChartsRenderer hook for lifecycle management.
 *
 * @migration SVG -> ECharts (P3)
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
import type { EChartsOption } from './renderers/echarts-imports';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ChartSize = 'sm' | 'md' | 'lg';

// Cross-filter rollout sweep — Codex thread 019e0c25 absorb. Re-export
// canonical `ChartClickEvent`. Radar's ECharts click event is
// polygon-level (a series item with all values), not per-indicator;
// indicator-level emission was punted to v2 backlog (Codex iter-2
// blocker — would require synthetic hit mapping).
export type { ChartClickEvent } from './types';
import type { ChartClickEvent as ChartClickEventCanonical } from './types';
type ChartClickEvent = ChartClickEventCanonical;

export type RadarIndicator = {
  /** Axis name displayed at the spoke end. */
  name: string;
  /** Maximum value for this axis. */
  max: number;
};

export type RadarSeriesItem = {
  /** Series legend name. */
  name: string;
  /** Data values matching indicator order. */
  data: number[];
  /** Override color for this series. */
  color?: string;
  /** Per-series area style override. */
  areaStyle?: { opacity?: number };
};

export interface RadarChartProps extends AccessControlledProps {
  /** Axis indicators defining the radar shape. */
  indicators: RadarIndicator[];
  /** Data series to plot on the radar. */
  series: RadarSeriesItem[];
  /** Visual size variant. @default "md" */
  size?: ChartSize;
  /** Radar shape. @default "polygon" */
  shape?: 'polygon' | 'circle';
  /** Fill the area under each series line. @default false */
  showArea?: boolean;
  /** Show axis name labels. @default true */
  showLabels?: boolean;
  /** Show legend below the chart. @default false */
  showLegend?: boolean;
  /** Number of concentric split rings. @default 5 */
  splitNumber?: number;
  /** Chart title. */
  title?: string;
  /** Animate on mount. @default true */
  animate?: boolean;
  /** Custom value formatter for tooltip. */
  valueFormatter?: (v: number) => string;
  /**
   * Callback fired when a series polygon is clicked. Emits a canonical
   * `ChartClickEvent` with `datum: { seriesName, label: seriesName,
   * values, indicators }` — polygon-level (whole series), not
   * per-indicator. Indicator-level emission requires custom hit
   * mapping and is tracked as v2 follow-up (Codex iter-2 blocker).
   */
  onDataPointClick?: (event: ChartClickEvent) => void;
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

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * RadarChart inner — original hook-bearing body. The outer `RadarChart`
 * wrapper below adds the `access` / `accessReason` gate without touching
 * hook order (Faz 21.4 PR-E2). Accepting `Omit<RadarChartProps, 'access' |
 * 'accessReason'>` keeps the inner contract honest: access is resolved
 * exactly once, in the outer wrapper, never re-read inside the hooks.
 */
const RadarChartInner = React.forwardRef<
  HTMLDivElement,
  Omit<RadarChartProps, 'access' | 'accessReason'>
>(function RadarChartInner(
  {
    indicators,
    series,
    size = 'md',
    shape = 'polygon',
    showArea = false,
    showLabels = true,
    showLegend = false,
    splitNumber = 5,
    title,
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
  const isEmpty = !indicators || indicators.length === 0 || !series || series.length === 0;
  const fmt = valueFormatter ?? formatCompact;

  // Faz 21.9 PR3c: container ref + breakpoint for responsive radar.
  // Radar has no grid/dataZoom; we drive the legend + indicator-axis font
  // size from breakpoint and shrink the radar radius on mobile.
  const ownContainerRef = useRef<HTMLDivElement | null>(null);
  const breakpoint = useResponsiveBreakpoint(ownContainerRef);

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

    const palette = effectivePalette ?? DEFAULT_PALETTE;
    const radarData = series.map((s, idx) => {
      const seriesColor = s.color ?? palette[idx % palette.length];

      // Determine area style: per-series override > global showArea > none
      let areaConfig: { color: string; opacity: number } | undefined;
      if (s.areaStyle) {
        areaConfig = {
          color: seriesColor,
          opacity: s.areaStyle.opacity ?? 0.2,
        };
      } else if (showArea) {
        areaConfig = {
          color: seriesColor,
          opacity: 0.15,
        };
      }

      return {
        value: s.data,
        name: s.name,
        lineStyle: { color: seriesColor, width: 2 },
        itemStyle: { color: seriesColor },
        areaStyle: areaConfig,
      };
    });

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
          const p = params as { name: string; value: number[] };
          const header = `<b>${escapeHtml(p.name)}</b>`;
          const lines = indicators.map((ind, i) => {
            const val = p.value?.[i] ?? 0;
            return `${escapeHtml(ind.name)}: ${fmt(val)}`;
          });
          return `${header}<br/>${lines.join('<br/>')}`;
        },
      },
      legend: buildResponsiveLegend({
        breakpoint,
        showLegend,
        hasMultiSeries: series.length > 1,
        seriesCount: series.length,
        densitySpacingMultiplier,
        densityFontMultiplier,
        icon: 'roundRect',
      }),
      radar: {
        // Mobile shrinks the radar envelope so the indicator labels don't
        // collide with the chart edges or the legend strip below.
        radius: breakpoint === 'mobile' ? '60%' : breakpoint === 'tablet' ? '68%' : '75%',
        indicator: indicators.map((ind) => ({
          name: ind.name,
          max: ind.max,
        })),
        shape,
        splitNumber,
        axisName: {
          // Codex 019defa5 PR3c PARTIAL: only suppress indicator names
          // on mobile when the radar is dense enough for them to collide
          // (>4 indicators on a 60% radius envelope). With 3-4 indicators
          // the names still fit and the user benefits from seeing them.
          // Tooltip formatter + a11y table always preserve the names.
          show: showLabels && !(breakpoint === 'mobile' && indicators.length > 4),
          fontSize:
            breakpoint === 'mobile'
              ? Math.max(9, Math.round(11 * 0.9))
              : scaleFontSize(11, densityFontMultiplier),
          color: 'var(--text-secondary, #666)',
        },
        splitArea: {
          show: true,
          areaStyle: {
            color: ['rgba(0,0,0,0.02)', 'rgba(0,0,0,0.04)'],
          },
        },
        splitLine: {
          lineStyle: { color: 'rgba(0,0,0,0.1)' },
        },
        axisLine: {
          lineStyle: { color: 'rgba(0,0,0,0.1)' },
        },
      },
      series: [
        {
          type: 'radar' as const,
          data: radarData,
          emphasis: {
            lineStyle: { width: 3 },
          },
        },
      ],
      aria: {
        enabled: true,
        label: {
          description: title ? `Radar chart: ${escapeHtml(title)}` : 'Radar chart',
        },
        ...(decalEnabled ? { decal: { show: true, decals: decalPatterns } } : {}),
      },
    } as EChartsOption;
  }, [
    indicators,
    series,
    shape,
    showArea,
    showLabels,
    showLegend,
    splitNumber,
    title,
    animate,
    isEmpty,
    fmt,
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
      // ECharts radar click params shape: `{ name?, value: number[],
      // seriesName?, dataIndex?, data: { name, value } }`. We surface
      // a polygon-level datum that includes the indicator NAMES so a
      // cross-filter wrapper can emit, say, `seriesName` as the
      // canonical filter field.
      const p = params as {
        seriesName?: string;
        name?: string;
        value?: unknown;
        dataIndex?: number;
        data?: unknown;
      };
      const valuesArr = Array.isArray(p.value) ? (p.value as number[]) : [];
      const seriesName =
        (typeof p.seriesName === 'string' ? p.seriesName : undefined) ??
        (typeof p.name === 'string' ? p.name : '');
      const indicatorNames = indicators.map((ind) => ind.name);
      onDataPointClick({
        datum: {
          seriesName,
          label: seriesName,
          values: valuesArr,
          indicators: indicatorNames,
        },
        value: typeof valuesArr[0] === 'number' ? valuesArr[0] : undefined,
        label: seriesName,
      });
    },
    [onDataPointClick, indicators],
  );

  const { containerRef, instance } = useEChartsRenderer({
    option: option ?? ({} as EChartsOption),
    theme: themeObject,
    respectReducedMotion: true,
    onClick: onDataPointClick ? handleClick : undefined,
  });

  // Faz 21.5-B PR-B2: default-on a11y. Radar shows multiple axes
  // per series — flatten the FIRST series' values aligned with each
  // indicator name so SR users hear the dominant trend.
  const a11yData = useMemo(
    () =>
      indicators.map((ind, i) => ({
        label: ind.name,
        value: series[0]?.data?.[i] ?? 0,
      })),
    [indicators, series],
  );
  const a11y = useChartA11y({
    chartType: 'radar',
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
        data-testid="radar-chart-empty"
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
      testId="radar-chart"
      setRefs={setRefs}
      {...rest}
    />
  );
});

RadarChartInner.displayName = 'RadarChartInner';

/**
 * RadarChart — public wrapper. Accepts `access` + `accessReason`
 * (`AccessControlledProps`) and forwards everything else to
 * `RadarChartInner`. Faz 21.4 PR-E2 wiring; default `access === undefined`
 * follows the identity-transform path through `ChartAccessGate`.
 */
export const RadarChart = React.forwardRef<HTMLDivElement, RadarChartProps>(function RadarChart(
  { access, accessReason, onDataPointClick, ...rest },
  ref,
) {
  const { state } = resolveAccessState(access);
  return (
    <ChartAccessGate access={access} accessReason={accessReason}>
      <RadarChartInner
        ref={ref}
        {...rest}
        onDataPointClick={guardChartCallback(state, onDataPointClick)}
      />
    </ChartAccessGate>
  );
});
RadarChart.displayName = 'RadarChart';

export default RadarChart;
