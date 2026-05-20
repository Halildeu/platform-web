'use client';

/**
 * LiquidFillChart — Faz 21.11 Campaign 4 (Codex thread 019e4301 AGREE
 * WITH_REVISIONS).
 *
 * Renders ECharts `'liquidFill'` series for KPI gauges — a single
 * fillRatio (0-1) visualised as a water-level container with optional
 * multi-layer support waves. Lazy-loaded via the dedicated
 * `useRequiredEChartsLiquidFill` gate so the `echarts-liquidfill`
 * chunk only downloads when the first LiquidFillChart mounts.
 *
 * Distinct from {@link GaugeChart}: GaugeChart shows a needle / arc
 * gauge with explicit min/max scale; LiquidFillChart shows a single
 * 0-1 percentage with continuous wave animation — better for
 * "completion %" or "satisfaction score" KPIs where the threshold is
 * implicit and the visual metaphor is "how full is the container".
 *
 * Codex iter-1 design constraints:
 *
 *   - Public `value` is strictly 0-1 normalised (fillRatio). Wrapper
 *     clamps non-finite / out-of-range inputs.
 *   - `secondaryValues` is optional; when omitted the wrapper renders
 *     a single layer. When provided each entry is appended after the
 *     primary value (multi-wave overlay).
 *   - `shape` is a closed enum — `path` strings deliberately omitted
 *     to keep playground surface small and avoid security/perf
 *     surprises from arbitrary SVG path input.
 *   - V1 does NOT expose `markups`/`onMarkupClick` — there is no
 *     coordinate axis to anchor markups against. Adding no-op props
 *     would inflate §4f denominator and ship a misleading API.
 *   - `prefers-reduced-motion: reduce` (or explicit `waveAnimation =
 *     false`) suppresses the continuous wave loop — vestibular safety.
 *     Static fill remains.
 *
 * @see useRequiredEChartsLiquidFill — lazy load + state machine.
 */
import React, { useCallback, useMemo, useRef } from 'react';
import type { AccessControlledProps } from '@mfe/shared-types';
import { resolveAccessState } from '@mfe/shared-types';
import { cn } from './utils/cn';
import { resolveCssVarColor, resolveCssVarColors } from './utils/resolveCssVarColor';
import { ChartAccessGate } from './access/ChartAccessGate';
import { guardChartCallback } from './access/guardChartCallback';
import { useEChartsRenderer } from './renderers';
import {
  useRequiredEChartsLiquidFill,
  describeEChartsLiquidFillReason,
} from './renderers/liquidfill';
import { useChartTheme } from './theme/useChartTheme';
import type {
  ChartThemePreference,
  ChartDecalPreference,
  ChartDensityPreference,
  ChartAccentPreference,
} from './theme/useChartTheme';
import { CHART_CANVAS_HEIGHT } from './chartSize';
import { sanitizeNumber } from './utils/data-validation';
import { ChartA11yShell, useChartA11y } from './a11y';
import type { AnomalyAnnouncementFormatter } from './a11y/ChartAriaLive';
import type { AnomalySummary } from './annotations/computeAnomalyOverlay';
import type { EChartsOption } from './renderers/echarts-imports';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ChartSize = 'sm' | 'md' | 'lg';

export type { ChartClickEvent } from './types';
import type { ChartClickEvent as ChartClickEventCanonical } from './types';
type ChartClickEvent = ChartClickEventCanonical;

/**
 * Closed shape enum (Codex iter-1: `path` strings deliberately omitted
 * for V1 — keep playground surface small and avoid arbitrary-SVG
 * security/perf surprises).
 */
export type LiquidFillShape =
  | 'circle'
  | 'rect'
  | 'roundRect'
  | 'triangle'
  | 'diamond'
  | 'pin'
  | 'arrow';

export interface LiquidFillChartProps extends AccessControlledProps {
  /**
   * Primary fill ratio — strictly 0-1 normalised. Non-finite / out-of-
   * range inputs clamp to `[0, 1]` (NaN/Infinity → 0).
   */
  value: number;
  /**
   * Optional support wave overlays — each entry appended after the
   * primary value (multi-layer wave model). Clamped to `[0, 1]` per
   * entry; non-array / undefined renders a single-layer chart.
   */
  secondaryValues?: number[];
  /** Container shape. @default "circle" */
  shape?: LiquidFillShape;
  /** Container radius. @default "50%" */
  radius?: string | number;
  /** Chart title. */
  title?: string;
  /** Accessible description. */
  description?: string;
  /** Additional class name. */
  className?: string;
  /** Label / tooltip value formatter. */
  valueFormatter?: (value: number) => string;
  /** Override gradient palette. Accepts `var(--token)` strings. */
  colors?: string[];
  /** Wave amplitude. @default "8%" */
  amplitude?: string | number;
  /** Wave length. @default "80%" */
  waveLength?: string | number;
  /**
   * Continuous wave loop. `prefers-reduced-motion: reduce` forces this
   * to `false` at render time regardless of the prop value (vestibular
   * safety). @default true
   */
  waveAnimation?: boolean;
  /** Show outline ring around the container. @default true */
  showOutline?: boolean;
  /** Outline color override. Accepts `var(--token)`. */
  outlineColor?: string;
  /** Visual size variant. @default "md" */
  size?: ChartSize;
  /** Top-level mount animation. @default true */
  animate?: boolean;
  /** Theme override. @default "auto" */
  theme?: ChartThemePreference;
  /** Decal pattern override. @default "auto" */
  decal?: ChartDecalPreference;
  /** Density override. @default "auto" */
  density?: ChartDensityPreference;
  /** Accent palette override. @default "auto" */
  accent?: ChartAccentPreference;
  /** Click callback (single-point KPI; payload carries the fillRatio). */
  onDataPointClick?: (event: ChartClickEvent) => void;
  /** Anomaly summary list forwarded to ChartA11yShell SR announcer. */
  anomalySummary?: AnomalySummary[];
  /** Optional override of the anomaly announcement template. */
  formatAnomalyAnnouncement?: AnomalyAnnouncementFormatter;
}

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
  getCSSVar('--state-info-text', '#06b6d4'),
];

const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

/**
 * Clamp a fill ratio to `[0, 1]`. Non-finite inputs (NaN, Infinity)
 * collapse to `0`. Exported for unit tests + reuse in pure helpers.
 */
export function clampFillRatio(raw: number): number {
  const v = sanitizeNumber(raw);
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/**
 * Build the layered data array: `[primary, ...clamped secondaries]`.
 * Pure — exported for unit tests.
 */
export function buildLiquidFillData(value: number, secondaryValues?: number[]): number[] {
  const primary = clampFillRatio(value);
  if (!Array.isArray(secondaryValues) || secondaryValues.length === 0) return [primary];
  return [primary, ...secondaryValues.map((v) => clampFillRatio(v))];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const LiquidFillChartInner = React.forwardRef<
  HTMLDivElement,
  Omit<LiquidFillChartProps, 'access' | 'accessReason'>
>(function LiquidFillChartInner(
  {
    value,
    secondaryValues,
    shape = 'circle',
    radius = '50%',
    title,
    description,
    className,
    valueFormatter,
    colors,
    amplitude = '8%',
    waveLength = '80%',
    waveAnimation = true,
    showOutline = true,
    outlineColor,
    size = 'md',
    animate = true,
    theme: themePreference = 'auto',
    decal: decalPreference = 'auto',
    density: densityPreference = 'auto',
    accent: accentPreference = 'auto',
    onDataPointClick,
    anomalySummary,
    formatAnomalyAnnouncement,
    ...rest
  },
  forwardedRef,
) {
  const height = CHART_CANVAS_HEIGHT[size];
  const fmt = valueFormatter ?? ((v: number) => `%${Math.round(v * 100)}`);
  const isEmpty = typeof value !== 'number' || !Number.isFinite(value);

  const ownContainerRef = useRef<HTMLDivElement | null>(null);

  // Lazy-load gate — Codex iter-1: there is no canvas fallback for
  // `liquidFill`, so the wrapper must surface unsupported/loading
  // branches instead of dispatching an option ECharts core can't honour.
  const liquidFill = useRequiredEChartsLiquidFill({ enabled: !isEmpty });

  const { themeObject, decalEnabled, decalPatterns, effectivePalette } = useChartTheme({
    theme: themePreference,
    decal: decalPreference,
    density: densityPreference,
    accent: accentPreference,
  });

  const safeData = useMemo(
    () => buildLiquidFillData(value, secondaryValues),
    [value, secondaryValues],
  );

  const option = useMemo((): EChartsOption | null => {
    if (isEmpty || liquidFill.status !== 'ready') return null;

    const explicitColors = resolveCssVarColors(colors);
    const palette =
      explicitColors && explicitColors.length > 0
        ? explicitColors
        : (effectivePalette ?? getDefaultPalette());

    // Codex iter-1 vestibular safety: prefers-reduced-motion → wave
    // loop OFF regardless of caller waveAnimation. Static fill remains.
    const reducedMotion = prefersReducedMotion();
    const effectiveWaveAnimation = waveAnimation && !reducedMotion;

    const resolvedOutlineColor = outlineColor
      ? (resolveCssVarColor(outlineColor) ?? outlineColor)
      : undefined;

    return {
      animation: animate,
      animationDuration: animate ? 500 : 0,
      title: title
        ? {
            // Codex iter-2 P3 fix: ECharts title.text / subtext render
            // as plain text in the canvas/svg layer, NOT HTML. Escaping
            // here would surface `R&amp;D &lt;Ops&gt;` to the user
            // instead of `R&D <Ops>`. Tooltip formatter stays escaped
            // because that branch returns an HTML string.
            text: title,
            subtext: description ?? undefined,
            left: 'center',
          }
        : undefined,
      tooltip: {
        confine: true,
        formatter: (params: unknown) => {
          const p = params as { value?: unknown; name?: string };
          const raw = typeof p.value === 'number' ? p.value : 0;
          return `${title ? `${escapeHtml(title)}<br/>` : ''}<strong>${escapeHtml(fmt(raw))}</strong>`;
        },
      },
      series: [
        {
          type: 'liquidFill' as const,
          data: safeData,
          shape,
          radius,
          color: palette,
          amplitude,
          waveLength,
          waveAnimation: effectiveWaveAnimation,
          label: {
            formatter: () => fmt(safeData[0]),
            fontSize: 28,
            fontWeight: 600 as const,
            color: getCSSVar('--text-primary', '#1a1a2e'),
          },
          outline: {
            show: showOutline,
            ...(resolvedOutlineColor ? { itemStyle: { borderColor: resolvedOutlineColor } } : {}),
          },
          backgroundStyle: {
            color: getCSSVar('--bg-muted', '#f9fafb'),
          },
        },
      ],
      aria: {
        enabled: true,
        label: {
          // Codex iter-2 P3 fix: `aria.label.description` is consumed
          // by screen readers verbatim — HTML escaping would garble
          // the spoken label.
          description: description
            ? description
            : title
              ? `Liquid fill gauge: ${title}`
              : 'Liquid fill gauge',
        },
        ...(decalEnabled ? { decal: { show: true, decals: decalPatterns } } : {}),
      },
    } as EChartsOption;
  }, [
    isEmpty,
    liquidFill.status,
    safeData,
    shape,
    radius,
    colors,
    effectivePalette,
    amplitude,
    waveLength,
    waveAnimation,
    showOutline,
    outlineColor,
    title,
    description,
    fmt,
    animate,
    decalEnabled,
    decalPatterns,
  ]);

  const handleClick = useCallback(
    (params: unknown) => {
      if (!onDataPointClick) return;
      const p = params as { value?: unknown; name?: string };
      const raw = typeof p.value === 'number' ? p.value : safeData[0];
      const fill = clampFillRatio(raw);
      const label = title ?? p.name ?? fmt(fill);
      onDataPointClick({
        datum: {
          value: fill,
          fillRatio: fill,
          label,
        },
        value: fill,
        label,
      });
    },
    [onDataPointClick, safeData, title, fmt],
  );

  // Codex iter-2 fix: useEChartsRenderer enabled gate honors lazy
  // import lifecycle so the renderer init effect re-runs cleanly when
  // the gate flips from loading → ready (Bar3D precedent).
  const { containerRef, instance } = useEChartsRenderer({
    option: option ?? ({} as EChartsOption),
    theme: themeObject,
    respectReducedMotion: true,
    enabled: liquidFill.status === 'ready',
    onClick: onDataPointClick ? handleClick : undefined,
  });

  const a11yData = useMemo(
    () => [
      {
        label: title ?? 'Liquid fill',
        value: safeData[0],
      },
    ],
    [title, safeData],
  );

  const a11y = useChartA11y({
    chartType: 'liquidFill',
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
        data-testid="liquidfill-chart-empty"
        {...rest}
      >
        Veri yok
      </div>
    );
  }

  /* ---- unsupported branch (echarts-liquidfill import failed) ---- */
  if (liquidFill.status === 'unsupported') {
    const banner = describeEChartsLiquidFillReason(liquidFill.reason);
    return (
      <div
        ref={forwardedRef}
        className={cn(
          'flex items-center justify-center text-sm text-[var(--text-secondary)] text-center p-4',
          className,
        )}
        style={{ height }}
        role="img"
        aria-label={`${a11y.ariaLabel} — ${banner}`}
        data-testid="liquidfill-chart-unsupported"
        data-reason={liquidFill.reason ?? 'liquidfill-import-failed'}
        {...rest}
      >
        {banner}
      </div>
    );
  }

  /* ---- loading branch (chunk in flight) ---- */
  if (liquidFill.status !== 'ready') {
    const loadingMessage = 'Sıvı doluluk grafiği yükleniyor';
    return (
      <div
        ref={forwardedRef}
        className={cn(
          'flex items-center justify-center text-sm text-[var(--text-secondary)]',
          className,
        )}
        style={{ height }}
        role="img"
        aria-label={`${a11y.ariaLabel} — ${loadingMessage}`}
        data-testid="liquidfill-chart-loading"
        {...rest}
      >
        {loadingMessage}…
      </div>
    );
  }

  return (
    <ChartA11yShell
      a11y={a11y}
      className={className}
      height={height}
      testId="liquidfill-chart"
      setRefs={setRefs}
      anomalySummary={anomalySummary}
      formatAnomalyAnnouncement={formatAnomalyAnnouncement}
      {...rest}
    />
  );
});

LiquidFillChartInner.displayName = 'LiquidFillChartInner';

/**
 * LiquidFillChart — public wrapper. Accepts `access` + `accessReason`
 * (`AccessControlledProps`) and forwards everything else to the inner
 * component. Mirrors the Bar3DChart access-gate pattern.
 */
export const LiquidFillChart = React.forwardRef<HTMLDivElement, LiquidFillChartProps>(
  function LiquidFillChart(
    { access, accessReason, onDataPointClick, anomalySummary, formatAnomalyAnnouncement, ...rest },
    ref,
  ) {
    const { state } = resolveAccessState(access);
    return (
      <ChartAccessGate access={access} accessReason={accessReason}>
        <LiquidFillChartInner
          ref={ref}
          {...rest}
          onDataPointClick={guardChartCallback(state, onDataPointClick)}
          anomalySummary={anomalySummary}
          formatAnomalyAnnouncement={formatAnomalyAnnouncement}
        />
      </ChartAccessGate>
    );
  },
);
LiquidFillChart.displayName = 'LiquidFillChart';

export default LiquidFillChart;
