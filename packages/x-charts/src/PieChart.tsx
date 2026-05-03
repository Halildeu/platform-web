'use client';

/**
 * PieChart -- ECharts-powered pie/donut chart
 *
 * Backwards-compatible with the design-system PieChart props API.
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
import { ChartA11yShell, useChartA11y } from './a11y';
import { useChartTheme } from './theme/useChartTheme';
import type {
  ChartThemePreference,
  ChartDecalPreference,
  ChartDensityPreference,
  ChartAccentPreference,
} from './theme/useChartTheme';
import { scaleFontSize } from './theme/density-helpers';
import { formatCompact } from './utils/formatters';
import { sanitizeDataPoints } from './utils/data-validation';
import type { EChartsOption } from './renderers/echarts-imports';
import { useResponsiveBreakpoint } from './useResponsiveChart';
import { buildResponsiveLegend } from './responsive';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ChartSize = 'sm' | 'md' | 'lg';

export type ChartDataPoint = {
  label: string;
  value: number;
  color?: string;
};

export type ChartClickEvent = {
  datum: Record<string, unknown>;
  value?: number;
  label?: string;
};

export interface PieChartProps extends AccessControlledProps {
  /** Data points to render as slices. */
  data: ChartDataPoint[];
  /** Visual size variant. @default "md" */
  size?: ChartSize;
  /** Donut mode (ring instead of filled). @default false */
  donut?: boolean;
  /** Show labels beside slices. @default false */
  showLabels?: boolean;
  /** Show legend below the chart. @default false */
  showLegend?: boolean;
  /** Show percentage on slices. @default false */
  showPercentage?: boolean;
  /** Custom value formatter. */
  valueFormatter?: (value: number) => string;
  /** Center content for donut mode. */
  innerLabel?: React.ReactNode;
  /** Animate slices on mount. @default true */
  animate?: boolean;
  /** Chart title. */
  title?: string;
  /** Accessible description. */
  description?: string;
  /** Additional class name. */
  className?: string;
  /** Callback fired when a data point (slice) is clicked. */
  onDataPointClick?: (event: ChartClickEvent) => void;
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

const SIZE_HEIGHT: Record<ChartSize, number> = { sm: 200, md: 300, lg: 400 };

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
 * PieChart inner — original hook-bearing body. The outer `PieChart`
 * wrapper below adds the `access` / `accessReason` gate without touching
 * hook order (Faz 21.4 PR-E2). Accepting `Omit<PieChartProps, 'access' |
 * 'accessReason'>` keeps the inner contract honest: access is resolved
 * exactly once, in the outer wrapper, never re-read inside the hooks.
 */
const PieChartInner = React.forwardRef<
  HTMLDivElement,
  Omit<PieChartProps, 'access' | 'accessReason'>
>(function PieChartInner(
  {
    data,
    size = 'md',
    donut = false,
    showLabels = false,
    showLegend = false,
    showPercentage = false,
    valueFormatter,
    innerLabel,
    animate = true,
    title,
    description,
    className,
    onDataPointClick,
    theme: themePreference = 'auto',
    decal: decalPreference = 'auto',
    density: densityPreference = 'auto',
    accent: accentPreference = 'auto',
    ...rest
  },
  forwardedRef,
) {
  const height = SIZE_HEIGHT[size];

  const safeData = useMemo(() => sanitizeDataPoints(data), [data]);
  const validData = useMemo(() => safeData.filter((d) => d.value > 0), [safeData]);

  const isEmpty = validData.length === 0;
  const fmt = valueFormatter ?? formatCompact;

  // Same DOM node feeds breakpoint observer and ECharts renderer.
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

    const pieData = validData.map((d, i) => ({
      name: d.label,
      value: d.value,
      itemStyle: { color: d.color ?? palette[i % palette.length] },
    }));

    const total = validData.reduce((sum, d) => sum + d.value, 0);

    return {
      animation: animate,
      animationDuration: animate ? 500 : 0,
      animationEasing: 'cubicOut',
      title: title
        ? {
            text: escapeHtml(title),
            subtext: description ? escapeHtml(description) : undefined,
            left: 'center',
            textStyle: {
              fontSize: scaleFontSize(16, densityFontMultiplier),
              fontWeight: 600,
            },
            subtextStyle: { fontSize: scaleFontSize(13, densityFontMultiplier) },
          }
        : undefined,
      tooltip: {
        trigger: 'item',
        confine: true,
        formatter: (params: unknown) => {
          const p = params as { name: string; value: number; percent: number };
          const formatted = fmt(p.value);
          return `${escapeHtml(p.name)}: ${escapeHtml(formatted)} (${p.percent}%)`;
        },
      },
      // Codex 019defa5 PARTIAL fix: when mobile suppresses outer slice
      // labels (collision avoidance), force the legend on so users still
      // see slice names / percentages — otherwise the chart renders pure
      // colour swatches with no textual context.
      legend: buildResponsiveLegend({
        breakpoint,
        showLegend: showLegend || (breakpoint === 'mobile' && (showLabels || showPercentage)),
        // Pie's "series" is one but legend entries = slice count.
        hasMultiSeries: false,
        seriesCount: validData.length,
        densitySpacingMultiplier,
        densityFontMultiplier,
        icon: 'circle',
        // Truncate long slice names to 16 chars on tablet, 12 on mobile so
        // the legend strip doesn't push the pie offscreen. Tooltip + a11y
        // still receive the original name.
        truncateAt: breakpoint === 'mobile' ? 12 : 16,
      }),
      series: [
        {
          type: 'pie',
          // Mobile shrinks the radius envelope so the legend strip on the
          // bottom (or vertical right when slice-count > 5) has room
          // without forcing the pie body to render outside the canvas.
          radius:
            breakpoint === 'mobile'
              ? donut
                ? ['38%', '60%']
                : ['0%', '60%']
              : donut
                ? ['45%', '70%']
                : ['0%', '70%'],
          center: ['50%', title ? '55%' : '50%'],
          data: pieData,
          label: {
            // On mobile we hide outer slice labels regardless of prop —
            // they're the #1 collision source (overlapping text in the
            // 4-screenshot bug report). Legend covers the same info.
            show: breakpoint !== 'mobile' && (showLabels || showPercentage),
            formatter: showPercentage
              ? (p: { name: string; value: number }) =>
                  `${escapeHtml(p.name)} ${total > 0 ? Math.round((p.value / total) * 100) : 0}%`
              : showLabels
                ? (p: { name: string }) => escapeHtml(p.name)
                : undefined,
            fontSize: scaleFontSize(12, densityFontMultiplier),
          },
          // labelLine length shrinks on tablet so leader lines don't stab
          // through neighbouring slices.
          labelLine: {
            show: breakpoint !== 'mobile' && (showLabels || showPercentage),
            length: breakpoint === 'tablet' ? 8 : 14,
            length2: breakpoint === 'tablet' ? 8 : 14,
          },
          // Codex 019defa5: hide overlapping outer slice labels rather
          // than letting them stack on top of each other.
          labelLayout: { hideOverlap: true },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0,0,0,0.15)',
              shadowOffsetX: 0,
            },
          },
          cursor: onDataPointClick ? 'pointer' : 'default',
        },
      ],
      aria: {
        enabled: true,
        label: {
          description: description
            ? escapeHtml(description)
            : title
              ? `Pie chart: ${escapeHtml(title)}`
              : 'Pie chart',
        },
        ...(decalEnabled ? { decal: { show: true, decals: decalPatterns } } : {}),
      },
    } as EChartsOption;
  }, [
    validData,
    donut,
    showLabels,
    showLegend,
    showPercentage,
    valueFormatter,
    animate,
    title,
    description,
    onDataPointClick,
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
      const p = params as { name: string; value: number; data: Record<string, unknown> };
      onDataPointClick({
        datum: { ...p.data, label: p.name, value: p.value },
        value: p.value,
        label: p.name,
      });
    },
    [onDataPointClick],
  );

  const { containerRef, instance } = useEChartsRenderer({
    option: option ?? ({} as EChartsOption),
    theme: themeObject,
    respectReducedMotion: true,
    onClick: onDataPointClick ? handleClick : undefined,
  });

  // Faz 21.5-B PR-B2: default-on a11y (PieChart's data shape is
  // already {label, value} — direct map, filter zero-value slices).
  const a11yData = useMemo(
    () => validData.map((d) => ({ label: d.label, value: d.value })),
    [validData],
  );
  const a11y = useChartA11y({
    chartType: 'pie',
    data: a11yData,
    title,
    description,
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
        data-testid="pie-chart-empty"
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
      testId="pie-chart"
      setRefs={setRefs}
      {...rest}
    >
      {donut && innerLabel ? (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          data-testid="pie-chart-inner-label"
        >
          {innerLabel}
        </div>
      ) : null}
    </ChartA11yShell>
  );
});

PieChartInner.displayName = 'PieChartInner';

/**
 * PieChart — public wrapper. Accepts `access` + `accessReason`
 * (`AccessControlledProps`) and forwards everything else to
 * `PieChartInner`. Faz 21.4 PR-E2 wiring; default `access === undefined`
 * follows the identity-transform path through `ChartAccessGate`.
 */
export const PieChart = React.forwardRef<HTMLDivElement, PieChartProps>(function PieChart(
  { access, accessReason, onDataPointClick, ...rest },
  ref,
) {
  const { state } = resolveAccessState(access);
  return (
    <ChartAccessGate access={access} accessReason={accessReason}>
      <PieChartInner
        ref={ref}
        {...rest}
        onDataPointClick={guardChartCallback(state, onDataPointClick)}
      />
    </ChartAccessGate>
  );
});
PieChart.displayName = 'PieChart';

export default PieChart;
