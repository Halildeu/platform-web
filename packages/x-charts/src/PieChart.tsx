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
import type { AnomalyAnnouncementFormatter } from './a11y/ChartAriaLive';
import type { AnomalySummary } from './annotations/computeAnomalyOverlay';
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

// Re-exported for backward compatibility — canonical definition lives in
// `./types` so every chart adapter shares the same `ChartClickEvent`
// shape (Codex iter-2 thread 019e0c25 review absorb).
export type { ChartClickEvent } from './types';
import type { ChartClickEvent as ChartClickEventCanonical } from './types';
type ChartClickEvent = ChartClickEventCanonical;

// Markup overlay (Codex thread 019e0df1) — Pie is NO-OP per the
// support matrix. Prop accepted for API consistency across all 13
// charts; dev warning surfaces when a markup is supplied.
export type { ChartMarkup, ChartMarkupClickEvent } from './types';
import type { ChartMarkup, ChartMarkupClickEvent } from './types';
import { useMarkupAdapter } from './annotations/useMarkupAdapter';

export interface PieChartProps extends AccessControlledProps {
  /** Data points to render as slices. */
  data: ChartDataPoint[];
  /** Visual size variant. @default "md" */
  size?: ChartSize;
  /** Donut mode (ring instead of filled). @default false */
  donut?: boolean;
  /**
   * Explicit radius envelope `[innerRadius, outerRadius]` for fine-grained
   * donut hole control. Each value can be a CSS-like percentage (e.g.
   * `'45%'`) or a pixel number. When set, this OVERRIDES the implicit
   * radius driven by `donut` + size + breakpoint.
   *
   * Use cases:
   *  - Tighter donut ring (`['72%', '88%']`)
   *  - Big-number-inside-pie KPI (`['62%', '100%']`)
   *  - Nightingale rose mode (`[0, '90%']` plus `roseType="area"`)
   *
   * Maps directly to ECharts `series.radius`.
   *
   * @default undefined (legacy donut/breakpoint heuristic kept)
   */
  radius?: [number | string, number | string];
  /**
   * Nightingale rose chart mode — slices grow outward from the center
   * proportional to their value instead of using equal-arc widths.
   * - `'radius'`: slice arc width follows value; outer radius is the
   *   per-slice variable
   * - `'area'`: slice area is proportional to value (perceptually fairer)
   *
   * Maps to ECharts `series.roseType`.
   *
   * @default undefined (regular pie / donut)
   */
  roseType?: 'radius' | 'area';
  /**
   * Allow slice selection. ECharts pulls the selected slice slightly
   * outward from the center (controlled by `selectedOffset`, default 10px).
   *
   * - `'single'`: only one slice may be selected at a time
   * - `'multiple'`: any subset may be selected
   * - `false`: selection disabled (default — matches legacy behavior)
   *
   * Use case: drill-down dashboards where the legend / detail panel
   * mirrors the pulled slice. Pair with `onDataPointClick` for state.
   *
   * Maps to ECharts `series.selectedMode`.
   *
   * @default undefined (no selection — slices are visual-only)
   */
  selectedMode?: 'single' | 'multiple' | false;
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
   * Visual overlay markups (Codex thread 019e0df1) — NO-OP on Pie.
   * Prop accepted for API consistency; dev warning surfaces when
   * markups are supplied (label/threshold semantics need v2 native
   * series-label patches).
   */
  markups?: ChartMarkup[];
  /** Callback fired when a markup overlay is clicked (no-op on Pie). */
  onMarkupClick?: (event: ChartMarkupClickEvent) => void;
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
  /**
   * Faz 21.11 PR-A2b-a11y-other-batch2 — anomaly summary list. When
   * supplied, the wrapper forwards the consumer-provided summary to
   * `ChartA11yShell` so screen readers receive a polite, debounced
   * outlier announcement. PieChart's `ChartMarkup` overlay is
   * currently a NO-OP, so the SR announcement is the consumer's
   * primary anomaly channel — pair it with whichever detector
   * (e.g. `useAnomalySummary` from `@mfe/x-charts`) you trust at
   * the dashboard layer; no built-in recipe is implied for slice
   * distributions.
   */
  anomalySummary?: AnomalySummary[];
  /**
   * Optional override of the anomaly announcement template.
   * Forwarded to `ChartAriaLive.formatAnomalyAnnouncement`.
   */
  formatAnomalyAnnouncement?: AnomalyAnnouncementFormatter;
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
    radius: radiusOverride,
    roseType,
    selectedMode,
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
    markups,
    onMarkupClick: _onMarkupClick,
    theme: themePreference = 'auto',
    decal: decalPreference = 'auto',
    density: densityPreference = 'auto',
    accent: accentPreference = 'auto',
    anomalySummary,
    formatAnomalyAnnouncement,
    ...rest
  },
  forwardedRef,
) {
  const height = CHART_CANVAS_HEIGHT[size];

  // Markup overlay adapter — Codex thread 019e0df1. Pie is NO-OP per
  // the support matrix; we still call the adapter so dev warnings
  // surface when the consumer supplies markups (helps catch
  // misconfiguration during development).
  useMarkupAdapter(markups, { chartType: 'pie' });

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
          // PR-X3: explicit `radius` prop overrides the breakpoint+donut
          // heuristic. When the caller supplies a radius tuple, they take
          // responsibility for sizing across breakpoints. When omitted we
          // keep the legacy behavior so existing call sites stay pixel-
          // identical.
          // Mobile shrinks the radius envelope so the legend strip on the
          // bottom (or vertical right when slice-count > 5) has room
          // without forcing the pie body to render outside the canvas.
          radius:
            radiusOverride ??
            (breakpoint === 'mobile'
              ? donut
                ? ['38%', '60%']
                : ['0%', '60%']
              : donut
                ? ['45%', '70%']
                : ['0%', '70%']),
          // PR-X3: opt-in rose / nightingale mode (slices grow outward
          // proportional to value instead of using equal arc widths).
          ...(roseType ? { roseType } : {}),
          // PR-X3: opt-in slice selection — ECharts pulls the selected
          // slice slightly outward (default offset 10px). Useful for
          // drill-down dashboards.
          ...(selectedMode !== undefined ? { selectedMode } : {}),
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
    // PR-X3 (Codex thread 019e1e30): explicit radius envelope, rose /
    // nightingale mode, and opt-in slice selection. Defaults preserve
    // legacy behavior; new state-doc work flag this as a v2 API surface.
    radiusOverride,
    roseType,
    selectedMode,
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
      anomalySummary={anomalySummary}
      formatAnomalyAnnouncement={formatAnomalyAnnouncement}
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
  {
    access,
    accessReason,
    onDataPointClick,
    onMarkupClick,
    anomalySummary,
    formatAnomalyAnnouncement,
    ...rest
  },
  ref,
) {
  const { state } = resolveAccessState(access);
  return (
    <ChartAccessGate access={access} accessReason={accessReason}>
      <PieChartInner
        ref={ref}
        {...rest}
        onDataPointClick={guardChartCallback(state, onDataPointClick)}
        onMarkupClick={guardChartCallback(state, onMarkupClick)}
        // PR-A2b-a11y-other-batch2: anomaly summary + formatter
        // forwarded through unchanged — these aren't user-facing
        // callbacks that the access gate would block.
        anomalySummary={anomalySummary}
        formatAnomalyAnnouncement={formatAnomalyAnnouncement}
      />
    </ChartAccessGate>
  );
});
PieChart.displayName = 'PieChart';

export default PieChart;
