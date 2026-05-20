'use client';

/**
 * WordCloudChart — Faz 21.11 Campaign 5 (Codex thread 019e4351 AGREE
 * WITH_REVISIONS).
 *
 * Renders ECharts `'wordCloud'` series for text frequency
 * visualisation — each datum is a `{ name, value }` pair where `name`
 * is the word and `value` drives the font size. Lazy-loaded via the
 * dedicated `useRequiredEChartsWordCloud` gate so the
 * `echarts-wordcloud` chunk only downloads when the first
 * WordCloudChart instance mounts. The 34th @mfe/x-charts wrapper.
 *
 * Use cases: job title frequency, skill cloud, comment/theme cloud.
 *
 * Codex iter-1 design constraints:
 *
 *   - Public `data` is `WordCloudDatum[]` (object-shape; raw arrays
 *     not exposed).
 *   - Normalization: `name.trim()` empty → drop, `value` non-finite or
 *     `<= 0` → drop. Desc sort + `maxWords` cap applied.
 *   - `shape` closed enum (7 ECharts wordCloud shapes; SVG path
 *     strings + `maskImage` deliberately omitted V1 for security /
 *     SSR / asset surface).
 *   - V1 does NOT expose `markups`/`onMarkupClick` — no coordinate
 *     axis. Adding no-op props would inflate §4f denominator.
 *   - `colors` MUST be deterministic (not random) — wrapper cycles
 *     `palette[dataIndex % palette.length]` so screenshots /
 *     comparisons stay stable.
 *   - V1 does NOT expose `fontWeight` — `'normal' | 'bold' | number`
 *     union maps to `complex` in the Design Lab playground, and the
 *     wrapper default (`normal`) covers the dominant use case.
 *
 * @see useRequiredEChartsWordCloud — lazy load + state machine.
 */
import React, { useCallback, useMemo, useRef } from 'react';
import type { AccessControlledProps } from '@mfe/shared-types';
import { resolveAccessState } from '@mfe/shared-types';
import { cn } from './utils/cn';
import { resolveCssVarColors } from './utils/resolveCssVarColor';
import { ChartAccessGate } from './access/ChartAccessGate';
import { guardChartCallback } from './access/guardChartCallback';
import { useEChartsRenderer } from './renderers';
import { useRequiredEChartsWordCloud, describeEChartsWordCloudReason } from './renderers/wordcloud';
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
 * Closed shape enum (Codex iter-1: path strings + maskImage
 * deliberately omitted V1 — keep playground surface small and avoid
 * arbitrary-SVG / asset-loading concerns).
 */
export type WordCloudShape =
  | 'circle'
  | 'cardioid'
  | 'diamond'
  | 'triangle-forward'
  | 'triangle'
  | 'pentagon'
  | 'star';

/** Single word + frequency pair. */
export interface WordCloudDatum {
  /** Display word. Empty / whitespace-only entries drop in normalize. */
  name: string;
  /** Frequency / weight (drives font size). Non-finite or <= 0 drop. */
  value: number;
}

export interface WordCloudChartProps extends AccessControlledProps {
  /** Word frequency pairs. */
  data: WordCloudDatum[];
  /** Cloud silhouette shape. @default "circle" */
  shape?: WordCloudShape;
  /**
   * Cap on the number of words rendered. Sorted desc by `value` then
   * the top N are kept. Clamped to `[1, 200]`. @default 100
   */
  maxWords?: number;
  /**
   * Font size pixel range `[min, max]`. Smallest word renders at
   * `min`, largest at `max`. @default [12, 60]
   */
  sizeRange?: [number, number];
  /**
   * Rotation degree range `[min, max]`. @default [-90, 90]
   */
  rotationRange?: [number, number];
  /** Rotation step between placement attempts (degrees). @default 45 */
  rotationStep?: number;
  /** Layout grid size (pixels). Smaller = denser layout. @default 8 */
  gridSize?: number;
  /** Allow words to render outside the canvas bounds. @default false */
  drawOutOfBound?: boolean;
  /** Auto-shrink font sizes if the layout overflows. @default true */
  shrinkToFit?: boolean;
  /**
   * Deterministic color palette — words colour-cycle via
   * `palette[dataIndex % palette.length]`. Accepts `var(--token)`
   * strings (resolved at runtime). Codex iter-1: NO random picking.
   */
  colors?: string[];
  /** Font family applied to every word. */
  fontFamily?: string;
  /** Chart title. */
  title?: string;
  /** Accessible description. */
  description?: string;
  /** Additional class name. */
  className?: string;
  /** Tooltip / a11y value formatter. */
  valueFormatter?: (value: number) => string;
  /** Animate on mount. @default true */
  animate?: boolean;
  /** Visual size variant. @default "md" */
  size?: ChartSize;
  /** Theme override. @default "auto" */
  theme?: ChartThemePreference;
  /** Decal pattern override. @default "auto" */
  decal?: ChartDecalPreference;
  /** Density override. @default "auto" */
  density?: ChartDensityPreference;
  /** Accent palette override. @default "auto" */
  accent?: ChartAccentPreference;
  /** Click callback — emits `{ word, value, label }`. */
  onDataPointClick?: (event: ChartClickEvent) => void;
  /** Anomaly summary list forwarded to ChartA11yShell SR announcer. */
  anomalySummary?: AnomalySummary[];
  /** Optional override of the anomaly announcement template. */
  formatAnomalyAnnouncement?: AnomalyAnnouncementFormatter;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_MAX_WORDS = 100;
const MAX_WORDS_CAP = 200;
const DEFAULT_SIZE_RANGE: [number, number] = [12, 60];
const DEFAULT_ROTATION_RANGE: [number, number] = [-90, 90];
const DEFAULT_ROTATION_STEP = 45;
const DEFAULT_GRID_SIZE = 8;

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

const clampInt = (raw: unknown, min: number, max: number, fallback: number): number => {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback;
  const v = Math.floor(raw);
  if (v < min) return min;
  if (v > max) return max;
  return v;
};

/**
 * Normalise the public `data` array — drop empty / non-finite /
 * non-positive entries, desc sort by `value`, cap at `maxWords`. Pure
 * — exported for unit tests + reuse in the wrapper.
 */
export function normalizeWordCloudData(
  data: WordCloudDatum[],
  maxWords: number = DEFAULT_MAX_WORDS,
): WordCloudDatum[] {
  const safe = Array.isArray(data) ? data : [];
  const cleaned: WordCloudDatum[] = [];
  for (const d of safe) {
    if (!d || typeof d.name !== 'string') continue;
    const name = d.name.trim();
    if (!name) continue;
    const value = sanitizeNumber(d.value);
    if (!Number.isFinite(value) || value <= 0) continue;
    cleaned.push({ name, value });
  }
  cleaned.sort((a, b) => b.value - a.value);
  const cap = clampInt(maxWords, 1, MAX_WORDS_CAP, DEFAULT_MAX_WORDS);
  return cleaned.slice(0, cap);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const WordCloudChartInner = React.forwardRef<
  HTMLDivElement,
  Omit<WordCloudChartProps, 'access' | 'accessReason'>
>(function WordCloudChartInner(
  {
    data,
    shape = 'circle',
    maxWords = DEFAULT_MAX_WORDS,
    sizeRange = DEFAULT_SIZE_RANGE,
    rotationRange = DEFAULT_ROTATION_RANGE,
    rotationStep = DEFAULT_ROTATION_STEP,
    gridSize = DEFAULT_GRID_SIZE,
    drawOutOfBound = false,
    shrinkToFit = true,
    colors,
    fontFamily,
    title,
    description,
    className,
    valueFormatter,
    animate = true,
    size = 'md',
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
  const fmt = valueFormatter ?? ((v: number) => String(v));

  const normalized = useMemo(() => normalizeWordCloudData(data, maxWords), [data, maxWords]);
  const isEmpty = normalized.length === 0;

  const ownContainerRef = useRef<HTMLDivElement | null>(null);

  const wordcloud = useRequiredEChartsWordCloud({ enabled: !isEmpty });

  const { themeObject, decalEnabled, decalPatterns, effectivePalette } = useChartTheme({
    theme: themePreference,
    decal: decalPreference,
    density: densityPreference,
    accent: accentPreference,
  });

  const option = useMemo((): EChartsOption | null => {
    if (isEmpty || wordcloud.status !== 'ready') return null;

    const explicitColors = resolveCssVarColors(colors);
    const palette =
      explicitColors && explicitColors.length > 0
        ? explicitColors
        : (effectivePalette ?? getDefaultPalette());

    return {
      animation: animate,
      animationDuration: animate ? 500 : 0,
      title: title
        ? {
            // ECharts title.text / subtext are plain text in the
            // canvas/svg layer (Codex iter-2 P3 echo from LiquidFill).
            text: title,
            subtext: description ?? undefined,
            left: 'center',
          }
        : undefined,
      tooltip: {
        confine: true,
        formatter: (params: unknown) => {
          const p = params as { name?: string; value?: unknown };
          const word = typeof p.name === 'string' ? p.name : '';
          const raw = typeof p.value === 'number' ? p.value : 0;
          return `<strong>${escapeHtml(word)}</strong>: ${escapeHtml(fmt(raw))}`;
        },
      },
      series: [
        {
          type: 'wordCloud' as const,
          shape,
          sizeRange,
          rotationRange,
          rotationStep,
          gridSize,
          drawOutOfBound,
          shrinkToFit,
          textStyle: {
            ...(fontFamily ? { fontFamily } : {}),
            // Codex iter-1: deterministic palette cycling (NOT random).
            // ECharts wordCloud accepts a function on textStyle.color
            // — params.dataIndex maps to a stable palette slot.
            color: (params: unknown) => {
              const p = params as { dataIndex?: number };
              const i = typeof p.dataIndex === 'number' ? p.dataIndex : 0;
              return palette[i % palette.length] ?? palette[0];
            },
          },
          emphasis: {
            focus: 'self',
            textStyle: {
              fontWeight: 'bold' as const,
            },
          },
          data: normalized.map((d) => ({ name: d.name, value: d.value })),
        },
      ],
      aria: {
        enabled: true,
        label: {
          // aria.label.description is consumed verbatim by screen
          // readers (Codex iter-2 P3 echo from LiquidFill).
          description: description
            ? description
            : title
              ? `Word cloud chart: ${title}`
              : 'Word cloud chart',
        },
        ...(decalEnabled ? { decal: { show: true, decals: decalPatterns } } : {}),
      },
    } as EChartsOption;
  }, [
    isEmpty,
    wordcloud.status,
    normalized,
    shape,
    sizeRange,
    rotationRange,
    rotationStep,
    gridSize,
    drawOutOfBound,
    shrinkToFit,
    colors,
    effectivePalette,
    fontFamily,
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
      const p = params as { name?: string; value?: unknown; dataIndex?: number };
      const word = typeof p.name === 'string' ? p.name : '';
      const value = typeof p.value === 'number' ? p.value : 0;
      onDataPointClick({
        datum: {
          word,
          value,
          label: word,
          dataIndex: typeof p.dataIndex === 'number' ? p.dataIndex : undefined,
        },
        value,
        label: word,
      });
    },
    [onDataPointClick],
  );

  const { containerRef, instance } = useEChartsRenderer({
    option: option ?? ({} as EChartsOption),
    theme: themeObject,
    respectReducedMotion: true,
    enabled: wordcloud.status === 'ready',
    onClick: onDataPointClick ? handleClick : undefined,
  });

  const a11yData = useMemo(
    () =>
      normalized.map((d) => ({
        label: d.name,
        value: d.value,
      })),
    [normalized],
  );

  const a11y = useChartA11y({
    chartType: 'wordCloud',
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
        data-testid="wordcloud-chart-empty"
        {...rest}
      >
        Veri yok
      </div>
    );
  }

  /* ---- unsupported branch ---- */
  if (wordcloud.status === 'unsupported') {
    const banner = describeEChartsWordCloudReason(wordcloud.reason);
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
        data-testid="wordcloud-chart-unsupported"
        data-reason={wordcloud.reason ?? 'wordcloud-import-failed'}
        {...rest}
      >
        {banner}
      </div>
    );
  }

  /* ---- loading branch ---- */
  if (wordcloud.status !== 'ready') {
    const loadingMessage = 'Kelime bulutu grafiği yükleniyor';
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
        data-testid="wordcloud-chart-loading"
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
      testId="wordcloud-chart"
      setRefs={setRefs}
      anomalySummary={anomalySummary}
      formatAnomalyAnnouncement={formatAnomalyAnnouncement}
      {...rest}
    />
  );
});

WordCloudChartInner.displayName = 'WordCloudChartInner';

/**
 * WordCloudChart — public wrapper. Accepts `access` + `accessReason`
 * and forwards everything else to the inner component (LiquidFill /
 * Bar3D access-gate pattern).
 */
export const WordCloudChart = React.forwardRef<HTMLDivElement, WordCloudChartProps>(
  function WordCloudChart(
    { access, accessReason, onDataPointClick, anomalySummary, formatAnomalyAnnouncement, ...rest },
    ref,
  ) {
    const { state } = resolveAccessState(access);
    return (
      <ChartAccessGate access={access} accessReason={accessReason}>
        <WordCloudChartInner
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
WordCloudChart.displayName = 'WordCloudChart';

export default WordCloudChart;
