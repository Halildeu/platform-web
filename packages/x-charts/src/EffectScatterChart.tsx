'use client';

/**
 * EffectScatterChart — ECharts `effectScatter` standalone wrapper.
 *
 * Renders a single ripple-animated scatter series on `coordinateSystem:
 * 'cartesian2d'`. Distinct from {@link ScatterChart}: this wrapper has
 * NO big-data renderer router, NO `large` mode batching, NO WebGL gate,
 * NO brush parity surface. The use case is low- / mid-cardinality
 * emphasis points (outliers, live metrics, KPI markers) where the
 * ripple animation is the differentiator. For dense scatter / bubble
 * dashboards, brush-driven cross-filter, or 5K+ point datasets keep
 * using {@link ScatterChart}.
 *
 * Codex thread `019e425b` AGREE (ready_for_impl=true) — plan-time
 * confirmation that the standalone wrapper follows the ComboChart
 * pattern (forwardRef inner + access-gate outer + canonical hook
 * order) and pins the ripple defaults: `period=4`, `scale=2.5`,
 * `brushType='stroke'`. Reduced motion suppresses the ripple via
 * `rippleEffect.number=0` so screen-reader users do not get a
 * vestibular animation just because the chart fell back to a
 * Canvas / SVG renderer that honors `prefers-reduced-motion`.
 */
import React, { useMemo, useCallback, useRef } from 'react';
import type { AccessControlledProps } from '@mfe/shared-types';
import { resolveAccessState } from '@mfe/shared-types';
import { ChartAccessGate } from './access/ChartAccessGate';
import { guardChartCallback } from './access/guardChartCallback';
import { cn } from './utils/cn';
import { resolveCssVarColor, resolveCssVarColors } from './utils/resolveCssVarColor';
import { useEChartsRenderer } from './renderers';
import { ChartA11yShell, useChartA11y } from './a11y';
import { useChartTheme } from './theme/useChartTheme';
import type {
  ChartThemePreference,
  ChartDecalPreference,
  ChartDensityPreference,
  ChartAccentPreference,
} from './theme/useChartTheme';
import { scaleFontSize, scaleSpacing, scalePadding } from './theme/density-helpers';
import { CHART_CANVAS_HEIGHT } from './chartSize';
import { formatCompact } from './utils/formatters';
import { sanitizeNumber } from './utils/data-validation';
import type { EChartsOption } from './renderers/echarts-imports';
import { useResponsiveBreakpoint } from './useResponsiveChart';
import { buildResponsiveLegend, buildResponsiveGrid } from './responsive';
// Re-exported so consumers can import these from the wrapper or the
// `@mfe/x-charts` root — mirrors the per-wrapper convention.
export type { ChartClickEvent, ChartMarkup, ChartMarkupClickEvent } from './types';
import type { ChartClickEvent, ChartMarkup, ChartMarkupClickEvent } from './types';
import { useMarkupAdapter } from './annotations/useMarkupAdapter';
import { mergeMarkupPatches } from './annotations/mergeMarkupPatches';
import type { AnomalySummary } from './annotations/computeAnomalyOverlay';
import type { AnomalyAnnouncementFormatter } from './a11y/ChartAriaLive';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ChartSize = 'sm' | 'md' | 'lg';

/** One data point on the effectScatter plane. */
export type EffectScatterDataPoint = {
  /** X-axis numeric position. */
  x: number;
  /** Y-axis numeric position. */
  y: number;
  /**
   * Optional size override — when defined and `symbolSize` is left as
   * the default routing, this is used directly as the pixel radius of
   * the point (with the ripple expanding outward from it).
   */
  size?: number;
  /** Optional display name — shown in tooltip / a11y row label. */
  name?: string;
  /**
   * Optional explicit per-point color — overrides the palette slot.
   * Accepts `var(--token)` strings; the canvas renderer cannot read CSS
   * custom properties so we resolve via {@link resolveCssVarColor}.
   */
  color?: string;
};

/** Ripple animation override knob. */
export type EffectScatterRippleEffect = {
  /** Ripple expansion scale relative to symbol radius. @default 2.5 */
  scale?: number;
  /** Ripple animation period in seconds. @default 4 */
  period?: number;
  /** Ripple stroke vs filled body. @default 'stroke' */
  brushType?: 'stroke' | 'fill';
  /**
   * Ripple color override — defaults to the series item color. Accepts
   * `var(--token)` strings (resolved via {@link resolveCssVarColor}).
   */
  color?: string;
};

export interface EffectScatterChartProps extends AccessControlledProps {
  /** Data points to render. */
  data: EffectScatterDataPoint[];
  /** Visual size variant. @default "md" */
  size?: ChartSize;
  /** Show grid lines on both axes. @default true */
  showGrid?: boolean;
  /** Chart title. */
  title?: string;
  /** Accessible description (also feeds the chart's ARIA description). */
  description?: string;
  /** Override default palette. Accepts CSS `var(--token)` strings. */
  colors?: string[];
  /** Custom value formatter for axes + tooltip. */
  valueFormatter?: (value: number) => string;
  /** Animate on mount. @default true */
  animate?: boolean;
  /** Additional class name on the chart root container. */
  className?: string;
  /** X-axis label. */
  xLabel?: string;
  /** Y-axis label. */
  yLabel?: string;
  /**
   * Pixel radius for each point. Function form receives the original
   * {@link EffectScatterDataPoint} for per-point sizing. When omitted
   * the wrapper falls back to `point.size ?? 12`.
   */
  symbolSize?: number | ((point: EffectScatterDataPoint) => number);
  /**
   * Override the ripple animation parameters. Merged onto sensible
   * defaults (`scale=2.5`, `period=4`, `brushType='stroke'`); only the
   * fields you supply are overridden.
   */
  effect?: EffectScatterRippleEffect;
  /**
   * When the ripple animation runs. `'render'` (default) loops the
   * ripple from mount; `'emphasis'` only ripples while the point is
   * hovered / focused — useful for a "tap to reveal" interaction.
   * @default "render"
   */
  showEffectOn?: 'render' | 'emphasis';
  /** Callback fired when a data point is clicked. */
  onDataPointClick?: (event: ChartClickEvent) => void;
  /** Visual overlay markups — threshold lines / KPI bands. */
  markups?: ChartMarkup[];
  /** Callback fired when a markup overlay is clicked. */
  onMarkupClick?: (event: ChartMarkupClickEvent) => void;
  /** Theme override. @default "auto" — follows documentElement signals. */
  theme?: ChartThemePreference;
  /** Decal pattern override. @default "auto" — enabled for HC / print. */
  decal?: ChartDecalPreference;
  /** Density override. @default "auto" */
  density?: ChartDensityPreference;
  /** Accent palette override. @default "auto" */
  accent?: ChartAccentPreference;
  /**
   * Anomaly summary list — when supplied, `ChartA11yShell` fires a
   * polite, debounced screen-reader announcement summarising outliers.
   */
  anomalySummary?: AnomalySummary[];
  /** Optional override of the anomaly announcement template. */
  formatAnomalyAnnouncement?: AnomalyAnnouncementFormatter;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_RIPPLE: Required<Omit<EffectScatterRippleEffect, 'color'>> = {
  scale: 2.5,
  period: 4,
  brushType: 'stroke',
};

const DEFAULT_SYMBOL_SIZE = 12;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const escapeHtml = (t: string): string =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const getCSSVar = (v: string, fb: string): string => {
  if (typeof document === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || fb;
};

const getDefaultPalette = (): string[] => [
  getCSSVar('--action-primary', '#3b82f6'),
  getCSSVar('--state-success-text', '#22c55e'),
  getCSSVar('--state-warning-text', '#f59e0b'),
  getCSSVar('--state-error-text', '#ef4444'),
  getCSSVar('--state-info-text', '#06b6d4'),
  getCSSVar('--action-secondary', '#8b5cf6'),
];

const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * EffectScatterChart inner — hook-bearing body. The outer wrapper adds
 * the `access` / `accessReason` gate without touching hook order (Faz
 * 21.4 PR-E2 pattern, mirrors `ScatterChart` / `ComboChart`).
 */
const EffectScatterChartInner = React.forwardRef<
  HTMLDivElement,
  Omit<EffectScatterChartProps, 'access' | 'accessReason'>
>(function EffectScatterChartInner(
  {
    data,
    size = 'md',
    showGrid = true,
    title,
    description,
    colors,
    valueFormatter,
    animate = true,
    className,
    xLabel,
    yLabel,
    symbolSize,
    effect,
    showEffectOn = 'render',
    onDataPointClick,
    markups,
    onMarkupClick,
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
  const safeData = useMemo(
    () =>
      (data ?? []).map((d) => ({
        ...d,
        x: sanitizeNumber(d.x),
        y: sanitizeNumber(d.y),
        size: d.size != null ? sanitizeNumber(d.size) : undefined,
      })),
    [data],
  );
  const isEmpty = safeData.length === 0;
  const fmt = valueFormatter ?? formatCompact;

  const ownContainerRef = useRef<HTMLDivElement | null>(null);
  const breakpoint = useResponsiveBreakpoint(ownContainerRef);

  const {
    themeObject,
    decalEnabled,
    decalPatterns,
    densityFontMultiplier,
    densitySpacingMultiplier,
    densityPaddingMultiplier,
    effectivePalette,
  } = useChartTheme({
    theme: themePreference,
    decal: decalPreference,
    density: densityPreference,
    accent: accentPreference,
  });

  // Markup adapter: effectScatter is cartesian2d, scatter-shaped — the
  // adapter runs in 'scatter' mode (no category labels).
  const markupResult = useMarkupAdapter(markups, { chartType: 'scatter' });

  const option = useMemo((): EChartsOption | null => {
    if (isEmpty) return null;

    // Codex iter-1: explicit colors > effectivePalette > default. Empty
    // array is NOT explicit — falls through.
    const explicitColors = resolveCssVarColors(colors);
    const palette =
      explicitColors && explicitColors.length > 0
        ? explicitColors
        : (effectivePalette ?? getDefaultPalette());
    const fontFamily = getCSSVar('--font-family-sans', 'Inter, system-ui, sans-serif');
    const textPrimary = getCSSVar('--text-primary', '#1a1a2e');
    const textSecondary = getCSSVar('--text-secondary', '#6b7280');
    const borderDefault = getCSSVar('--border-default', '#e5e7eb');
    const bgMuted = getCSSVar('--bg-muted', '#f9fafb');

    // Codex iter-1: ripple defaults + per-field override merge + CSS-var
    // resolution on `effect.color` (canvas can't read `var(--token)`).
    const rippleEffect: Record<string, unknown> = {
      scale: effect?.scale ?? DEFAULT_RIPPLE.scale,
      period: effect?.period ?? DEFAULT_RIPPLE.period,
      brushType: effect?.brushType ?? DEFAULT_RIPPLE.brushType,
    };
    if (effect?.color) {
      rippleEffect.color = resolveCssVarColor(effect.color) ?? effect.color;
    }
    // Codex iter-1 Risk 2: top-level `animation=false` does NOT silence
    // an effectScatter ripple loop on its own (the ripple is a
    // separately driven graphic). Setting `rippleEffect.number = 0`
    // suppresses the ripple altogether — used both when
    // `prefers-reduced-motion: reduce` matches AND when the consumer
    // explicitly sets `animate={false}`, so the wrapper is vestibular-
    // safe in either path.
    const reducedMotion = prefersReducedMotion();
    if (!animate || reducedMotion) {
      rippleEffect.number = 0;
    }

    // Build ECharts series data — `value` is a tuple, `name` is the
    // tooltip / a11y label (falls back to a deterministic "Point N").
    const scatterData = safeData.map((d, i) => ({
      value: d.size != null ? [d.x, d.y, d.size] : [d.x, d.y],
      name: d.name ?? `Point ${i + 1}`,
      itemStyle: d.color ? { color: resolveCssVarColor(d.color) } : undefined,
    }));

    // symbolSize routing — caller function > caller number > default
    // routing that honours `point.size` when provided, else
    // {@link DEFAULT_SYMBOL_SIZE} px.
    let symbolSizeFn: number | ((val: number[], params: { dataIndex: number }) => number);
    if (typeof symbolSize === 'function') {
      const fn = symbolSize;
      symbolSizeFn = (val: number[], params: { dataIndex: number }) => {
        const datum = safeData[params.dataIndex];
        return fn(datum ?? { x: val[0] ?? 0, y: val[1] ?? 0, size: val[2] });
      };
    } else if (typeof symbolSize === 'number') {
      symbolSizeFn = symbolSize;
    } else {
      symbolSizeFn = (val: number[]) => {
        const sz = val[2];
        return typeof sz === 'number' && Number.isFinite(sz) ? sz : DEFAULT_SYMBOL_SIZE;
      };
    }

    // EffectScatter is single-series so the legend is suppressed. Still
    // run through the responsive helper so the grid padding stays
    // consistent with the other wrappers.
    const responsiveLegend = buildResponsiveLegend({
      breakpoint,
      showLegend: false,
      hasMultiSeries: false,
      seriesCount: 1,
      densitySpacingMultiplier,
      densityFontMultiplier,
      icon: 'circle',
    });

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
              fontFamily,
              color: textPrimary,
              fontSize: scaleFontSize(16, densityFontMultiplier),
              fontWeight: 600,
            },
            subtextStyle: {
              fontFamily,
              color: textSecondary,
              fontSize: scaleFontSize(13, densityFontMultiplier),
            },
          }
        : undefined,
      tooltip: {
        trigger: 'item',
        confine: true,
        textStyle: { fontFamily, fontSize: scaleFontSize(13, densityFontMultiplier) },
        formatter: (params: unknown) => {
          const p = params as { value: number[]; name: string };
          const xVal = fmt(p.value[0]);
          const yVal = fmt(p.value[1]);
          const label = p.name && !p.name.startsWith('Point ') ? ` — ${escapeHtml(p.name)}` : '';
          return `(${escapeHtml(xVal)}, ${escapeHtml(yVal)})${label}`;
        },
      },
      legend: {
        ...responsiveLegend,
        textStyle: {
          fontFamily,
          color: textPrimary,
          fontSize: scaleFontSize(12, densityFontMultiplier),
        },
      },
      grid: buildResponsiveGrid({
        breakpoint,
        hasTitle: !!title,
        hasBottomLegend: false,
        hasRightLegend: false,
        density: {
          titleTop: scalePadding(60, densityPaddingMultiplier),
          contentTop: scalePadding(24, densityPaddingMultiplier),
          sidePadding: scalePadding(16, densityPaddingMultiplier),
          legendBottom: scalePadding(48, densityPaddingMultiplier),
          plainBottom: scalePadding(24, densityPaddingMultiplier),
        },
      }),
      xAxis: {
        type: 'value',
        name: xLabel,
        nameLocation: 'center',
        nameGap: scaleSpacing(28, densitySpacingMultiplier),
        nameTextStyle: {
          fontFamily,
          color: textSecondary,
          fontSize: scaleFontSize(12, densityFontMultiplier),
        },
        axisLine: { lineStyle: { color: borderDefault } },
        axisTick: { lineStyle: { color: borderDefault } },
        axisLabel: {
          color: textSecondary,
          fontFamily,
          fontSize: scaleFontSize(11, densityFontMultiplier),
          hideOverlap: true,
          formatter: (v: number) => fmt(v),
        },
        splitLine: {
          show: showGrid,
          lineStyle: { color: bgMuted, type: 'dashed' as const },
        },
      },
      yAxis: {
        type: 'value',
        name: yLabel,
        nameLocation: 'center',
        nameGap: scaleSpacing(40, densitySpacingMultiplier),
        nameTextStyle: {
          fontFamily,
          color: textSecondary,
          fontSize: scaleFontSize(12, densityFontMultiplier),
        },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: textSecondary,
          fontFamily,
          fontSize: scaleFontSize(11, densityFontMultiplier),
          hideOverlap: true,
          formatter: (v: number) => fmt(v),
        },
        splitLine: {
          show: showGrid,
          lineStyle: { color: bgMuted, type: 'dashed' as const },
        },
      },
      series: mergeMarkupPatches(
        [
          {
            type: 'effectScatter' as const,
            coordinateSystem: 'cartesian2d',
            data: scatterData,
            symbolSize: symbolSizeFn,
            showEffectOn,
            rippleEffect,
            itemStyle: { color: palette[0] },
            emphasis: {
              focus: 'self',
              itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.2)' },
            },
          },
        ],
        markupResult.seriesPatches,
      ),
      aria: {
        enabled: true,
        label: {
          description: description
            ? escapeHtml(description)
            : title
              ? `Effect scatter chart: ${escapeHtml(title)}`
              : 'Effect scatter chart',
        },
        ...(decalEnabled ? { decal: { show: true, decals: decalPatterns } } : {}),
      },
    } as EChartsOption;
  }, [
    isEmpty,
    safeData,
    showGrid,
    valueFormatter,
    animate,
    colors,
    title,
    description,
    xLabel,
    yLabel,
    symbolSize,
    effect,
    showEffectOn,
    fmt,
    themeObject,
    decalEnabled,
    decalPatterns,
    densityFontMultiplier,
    densitySpacingMultiplier,
    densityPaddingMultiplier,
    effectivePalette,
    breakpoint,
    markupResult,
  ]);

  const handleClick = useCallback(
    (params: unknown) => {
      const p = params as {
        componentType?: string;
        data?: unknown;
        value?: unknown;
        name?: string;
        dataIndex?: number;
        seriesIndex?: number;
      };
      // Markup overlay click — early-return so `onDataPointClick` does
      // NOT fire on the same event (mirrors ScatterChart / ComboChart).
      if (
        p.componentType === 'markLine' ||
        p.componentType === 'markArea' ||
        p.componentType === 'markPoint'
      ) {
        if (!onMarkupClick) return;
        const lookupName = typeof p.name === 'string' ? p.name : undefined;
        const markup = lookupName ? markupResult.markupLookup.get(lookupName) : undefined;
        if (markup) {
          // Codex iter-2 fix: wrapper kimliğini doğru raporla. Adapter
          // support matrix `chartType: 'scatter'` modunda kalıyor (yukarı
          // useMarkupAdapter çağrısı) çünkü matrix `effectScatter`'ı
          // ayrıca tanımıyor; ama event payload tüketicisine wrapper'ın
          // EffectScatter olduğunu söylemesi gerek.
          onMarkupClick({
            markup,
            chartType: 'effectScatter',
            seriesIndex: p.seriesIndex,
            dataIndex: p.dataIndex,
            nativeParams: params,
          });
        }
        return;
      }

      if (!onDataPointClick) return;
      const valueArr = Array.isArray(p.value) ? (p.value as number[]) : null;
      const x = valueArr?.[0];
      const y = valueArr?.[1];
      const sz = valueArr?.[2];
      const explicitName =
        typeof p.name === 'string' && !p.name.startsWith('Point ') ? p.name : undefined;
      const label =
        explicitName ??
        (typeof x === 'number' && typeof y === 'number' ? `(${x}, ${y})` : undefined);
      onDataPointClick({
        datum: {
          x,
          y,
          size: typeof sz === 'number' ? sz : undefined,
          name: explicitName,
          label,
          dataIndex: typeof p.dataIndex === 'number' ? p.dataIndex : undefined,
        },
        value: typeof y === 'number' ? y : undefined,
        label,
      });
    },
    [onDataPointClick, onMarkupClick, markupResult],
  );

  const { containerRef, instance } = useEChartsRenderer({
    option: option ?? ({} as EChartsOption),
    theme: themeObject,
    respectReducedMotion: true,
    onClick: onDataPointClick || onMarkupClick ? handleClick : undefined,
  });

  // a11y data — single-axis row label: `name` or fallback coordinate.
  const a11yData = useMemo(
    () =>
      safeData.map((d, i) => ({
        label: d.name ?? `Point ${i + 1} (${d.x}, ${d.y})`,
        value: d.y,
      })),
    [safeData],
  );

  const a11y = useChartA11y({
    chartType: 'effectScatter',
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
        data-testid="effect-scatter-chart-empty"
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
      testId="effect-scatter-chart"
      setRefs={setRefs}
      anomalySummary={anomalySummary}
      formatAnomalyAnnouncement={formatAnomalyAnnouncement}
      {...rest}
    />
  );
});

EffectScatterChartInner.displayName = 'EffectScatterChartInner';

/**
 * EffectScatterChart — public wrapper. Accepts `access` + `accessReason`
 * (`AccessControlledProps`) and forwards everything else to the inner
 * component. Mirrors the `ScatterChart` / `ComboChart` access-gate
 * wiring (Faz 21.4 PR-E2).
 */
export const EffectScatterChart = React.forwardRef<HTMLDivElement, EffectScatterChartProps>(
  function EffectScatterChart(
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
        <EffectScatterChartInner
          ref={ref}
          {...rest}
          onDataPointClick={guardChartCallback(state, onDataPointClick)}
          onMarkupClick={guardChartCallback(state, onMarkupClick)}
          anomalySummary={anomalySummary}
          formatAnomalyAnnouncement={formatAnomalyAnnouncement}
        />
      </ChartAccessGate>
    );
  },
);
EffectScatterChart.displayName = 'EffectScatterChart';

export default EffectScatterChart;
