'use client';

/**
 * Bar3DChart — Faz 21.11 P1d (3D Extension Pack — standalone bar3D wrapper).
 *
 * Renders ECharts `bar3D` series on `coordinateSystem: 'cartesian3D'` with
 * a categorical x-axis × categorical y-axis grid plus a value z-axis. Each
 * data point becomes a single 3D bar; the height is the value, the colour
 * follows the wrapper's visualMap (or per-point `color` override).
 *
 * Distinct from the bar3D layer inside {@link Globe}: that runs on
 * `coordinateSystem: 'globe'` (geographic sphere). This wrapper is the
 * standalone cartesian3D bar chart for `category × category × metric`
 * pivots.
 *
 * Codex thread `019e4277` plan-iter REVISE (`ready_for_impl=true`):
 *
 *   - Public `data` API is object-shape `Bar3DDataPoint[]`, NOT raw
 *     `number[][]` tuples. Wrapper normalises to ECharts' `[xIdx, yIdx, z]`
 *     internally so click payload / tooltip / a11y stay anchored to the
 *     source labels.
 *   - V1 does NOT expose `markups` / `onMarkupClick`. The 2D markup
 *     adapter is cartesian-2d-only; a 3D markup surface would have to
 *     reason about planes / volumes / category cells which is out of
 *     scope. Adding no-op props would inflate §4f denominator and ship
 *     a misleading API.
 *   - `useGLSeriesType` (the ScatterChart opportunistic-WebGL flip) is
 *     WRONG for Bar3D — there is no canvas fallback for `bar3D`.
 *     Suppress the option entirely until GL is ready
 *     ({@link useRequiredEChartsGL}); render an unsupported banner if
 *     WebGL is unavailable.
 *   - `large` mode and per-point markup also intentionally omitted.
 *     5×5 → 30×30 grids are the sweet spot; 50×50 = 2500 bars works
 *     technically but the wrapper warns at `> 900` cells in dev mode.
 *
 * @see useRequiredEChartsGL — the lazy load + capability gate.
 * @see Scatter3D — sibling 3D wrapper (`scatter3D` point cloud).
 * @see Globe — multi-layer bar3D on `coordinateSystem: 'globe'`.
 */
import React, { useCallback, useMemo, useRef } from 'react';
import type { AccessControlledProps } from '@mfe/shared-types';
import { resolveAccessState } from '@mfe/shared-types';
import { cn } from './utils/cn';
import { resolveCssVarColor, resolveCssVarColors } from './utils/resolveCssVarColor';
import { ChartAccessGate } from './access/ChartAccessGate';
import { guardChartCallback } from './access/guardChartCallback';
import { useEChartsRenderer } from './renderers';
import { useRequiredEChartsGL, describeEChartsGLReason } from './renderers/gl';
import { useChartTheme } from './theme/useChartTheme';
import type {
  ChartThemePreference,
  ChartDecalPreference,
  ChartDensityPreference,
  ChartAccentPreference,
} from './theme/useChartTheme';
import { CHART_CANVAS_HEIGHT } from './chartSize';
import { formatCompact } from './utils/formatters';
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

/** Per-point shading for the 3D bar surface. */
export type Bar3DShading = 'color' | 'lambert' | 'realistic';

/** Single 3D bar at a `(x, y)` category cell with a numeric `z` height. */
export interface Bar3DDataPoint {
  /** X-category label (string | number). */
  x: string | number;
  /** Y-category label (string | number). */
  y: string | number;
  /** Numeric bar height. */
  z: number;
  /** Optional per-point color override. Accepts `var(--token)`. */
  color?: string;
  /** Optional display name (defaults to `"<x> × <y>"`). */
  name?: string;
}

export interface Bar3DChartProps extends AccessControlledProps {
  /** 3D bar cells. Each point is one bar at `(x, y)` with height `z`. */
  data: Bar3DDataPoint[];
  /**
   * Explicit x-axis category order. When omitted the wrapper derives
   * the order from the first occurrence of each `x` in `data`.
   */
  xCategories?: Array<string | number>;
  /**
   * Explicit y-axis category order. When omitted the wrapper derives
   * the order from the first occurrence of each `y` in `data`.
   */
  yCategories?: Array<string | number>;
  /** Visual size variant. @default "md" */
  size?: ChartSize;
  /** Chart title. */
  title?: string;
  /** Accessible description. */
  description?: string;
  /** Additional class name. */
  className?: string;
  /** X-axis label. */
  xLabel?: string;
  /** Y-axis label. */
  yLabel?: string;
  /** Z-axis label. */
  zLabel?: string;
  /** Value formatter for tooltip + value labels. */
  valueFormatter?: (value: number) => string;
  /** Override palette. Accepts `var(--token)` strings. */
  colors?: string[];
  /** Animate on mount. @default true */
  animate?: boolean;
  /** Show value labels on top of each bar. @default false */
  showValues?: boolean;
  /** Per-point shading mode. @default "lambert" */
  shading?: Bar3DShading;
  /** Bar width in axis units. @default 0.8 */
  barSize?: number;
  /**
   * Native ECharts `grid3D` override (camera, axes, environment).
   * Wrapper merges over a sensible default.
   */
  grid3D?: Record<string, unknown>;
  /**
   * Native ECharts `viewControl` override (autoRotate, distance, etc.).
   * Wrapper passes through verbatim onto `grid3D.viewControl`.
   */
  viewControl?: Record<string, unknown>;
  /**
   * Native ECharts `light` override (main / ambient / direction).
   * Wrapper passes through verbatim onto `grid3D.light`.
   */
  light?: Record<string, unknown>;
  /** Callback fired when a 3D bar is clicked. */
  onDataPointClick?: (event: ChartClickEvent) => void;
  /** Theme override. @default "auto" */
  theme?: ChartThemePreference;
  /** Decal pattern override. @default "auto" */
  decal?: ChartDecalPreference;
  /** Density override. @default "auto" */
  density?: ChartDensityPreference;
  /** Accent palette override. @default "auto" */
  accent?: ChartAccentPreference;
  /** Anomaly summary list forwarded to ChartA11yShell SR announcer. */
  anomalySummary?: AnomalySummary[];
  /** Optional override of the anomaly announcement template. */
  formatAnomalyAnnouncement?: AnomalyAnnouncementFormatter;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/**
 * Soft warning threshold for dev mode — at 30×30 = 900 cells the chart
 * is still legible; above that bar density gets cramped and the GL
 * scene becomes expensive. Caller can opt to silence the warning by
 * pre-aggregating their data.
 */
const A11Y_BIG_DATA_ROW_LIMIT = 1_000;
const DENSITY_WARN_THRESHOLD = 900;

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

/** Internal normalised representation — every cell has indices + clamp. */
interface NormalisedBar3DInput {
  xCategories: Array<string | number>;
  yCategories: Array<string | number>;
  items: Array<{
    xIndex: number;
    yIndex: number;
    z: number;
    color?: string;
    name?: string;
    source: Bar3DDataPoint;
  }>;
}

/**
 * Normalise the public `data` prop into render-safe rows.
 *
 *   - Derives category order from explicit `xCategories` / `yCategories`
 *     when provided; otherwise builds first-seen order from `data`.
 *   - Resolves each point to `[xIndex, yIndex, z]`; non-finite `z`
 *     clamps to 0 via {@link sanitizeNumber}.
 *   - Drops points whose `(x, y)` is not in the derived category set
 *     (defensive — only possible when caller passed explicit categories
 *     that don't cover the data).
 */
export function normalizeBar3DData(
  data: Bar3DDataPoint[],
  explicitX?: Array<string | number>,
  explicitY?: Array<string | number>,
): NormalisedBar3DInput {
  const safe = Array.isArray(data) ? data : [];
  const xCats: Array<string | number> = Array.isArray(explicitX) ? [...explicitX] : [];
  const yCats: Array<string | number> = Array.isArray(explicitY) ? [...explicitY] : [];
  const xIndex = new Map<string | number, number>(xCats.map((c, i) => [c, i]));
  const yIndex = new Map<string | number, number>(yCats.map((c, i) => [c, i]));

  for (const p of safe) {
    if (!explicitX && !xIndex.has(p.x)) {
      xIndex.set(p.x, xCats.length);
      xCats.push(p.x);
    }
    if (!explicitY && !yIndex.has(p.y)) {
      yIndex.set(p.y, yCats.length);
      yCats.push(p.y);
    }
  }

  const items = safe
    .map((p) => {
      const xi = xIndex.get(p.x);
      const yi = yIndex.get(p.y);
      if (xi == null || yi == null) return null;
      return {
        xIndex: xi,
        yIndex: yi,
        z: sanitizeNumber(p.z),
        color: typeof p.color === 'string' ? p.color : undefined,
        name: typeof p.name === 'string' ? p.name : undefined,
        source: p,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return { xCategories: xCats, yCategories: yCats, items };
}

/**
 * Build the ECharts option dispatched by `Bar3DChart`. Pure function —
 * exported so unit tests can lock the option shape without React mount
 * + GL gate races (Scatter3D / Surface3D precedent — Codex thread
 * `019e10ab` iter-4 discipline).
 */
export function buildBar3DOption(input: {
  normalized: NormalisedBar3DInput;
  xLabel?: string;
  yLabel?: string;
  zLabel?: string;
  fmt: (value: number) => string;
  palette: string[];
  animate: boolean;
  showValues: boolean;
  shading: Bar3DShading;
  barSize: number;
  title?: string;
  description?: string;
  grid3D?: Record<string, unknown>;
  viewControl?: Record<string, unknown>;
  light?: Record<string, unknown>;
  decalEnabled: boolean;
  decalPatterns: unknown;
}): EChartsOption {
  const {
    normalized,
    xLabel,
    yLabel,
    zLabel,
    fmt,
    palette,
    animate,
    showValues,
    shading,
    barSize,
    title,
    description,
    grid3D: gridOverride,
    viewControl,
    light,
    decalEnabled,
    decalPatterns,
  } = input;

  let zMin = Number.POSITIVE_INFINITY;
  let zMax = Number.NEGATIVE_INFINITY;
  const data = normalized.items.map((item) => {
    if (item.z < zMin) zMin = item.z;
    if (item.z > zMax) zMax = item.z;
    const itemStyle = item.color
      ? { color: resolveCssVarColor(item.color) ?? item.color }
      : undefined;
    return {
      value: [item.xIndex, item.yIndex, item.z],
      name:
        item.name ??
        `${String(normalized.xCategories[item.xIndex])} × ${String(normalized.yCategories[item.yIndex])}`,
      itemStyle,
    };
  });

  if (!Number.isFinite(zMin)) zMin = 0;
  if (!Number.isFinite(zMax)) zMax = 1;
  if (zMin === zMax) zMax = zMin + 1; // visualMap stripe degenerate otherwise

  const grid3DBase: Record<string, unknown> = {
    boxWidth: 100,
    boxDepth: 80,
    boxHeight: 80,
    light: light ?? {
      main: { intensity: 1.2, shadow: false },
      ambient: { intensity: 0.3 },
    },
    viewControl: viewControl ?? {
      alpha: 30,
      beta: 30,
      distance: 200,
    },
  };

  return {
    animation: animate,
    animationDuration: animate ? 500 : 0,
    title: title
      ? {
          text: escapeHtml(title),
          subtext: description ? escapeHtml(description) : undefined,
          left: 'center',
        }
      : undefined,
    tooltip: {
      trigger: 'item',
      confine: true,
      formatter: (params: unknown) => {
        const p = params as { value: number[]; name?: string };
        const [xi, yi, z] = p.value;
        const xLabelText = String(normalized.xCategories[xi] ?? '');
        const yLabelText = String(normalized.yCategories[yi] ?? '');
        const zText = fmt(z);
        const header = p.name ? `${escapeHtml(p.name)}<br/>` : '';
        return `${header}${escapeHtml(xLabelText)} × ${escapeHtml(yLabelText)}: <strong>${escapeHtml(zText)}</strong>`;
      },
    },
    visualMap: {
      show: false,
      dimension: 2,
      min: zMin,
      max: zMax,
      inRange: { color: palette },
    },
    xAxis3D: {
      type: 'category',
      name: xLabel,
      data: normalized.xCategories.map((c) => String(c)),
    },
    yAxis3D: {
      type: 'category',
      name: yLabel,
      data: normalized.yCategories.map((c) => String(c)),
    },
    zAxis3D: {
      type: 'value',
      name: zLabel,
    },
    grid3D: { ...grid3DBase, ...(gridOverride ?? {}) },
    series: [
      {
        type: 'bar3D' as const,
        coordinateSystem: 'cartesian3D',
        data,
        shading,
        bevelSize: 0,
        barSize: [barSize, barSize],
        label: {
          show: showValues,
          formatter: (p: { value?: unknown }) => {
            const arr = Array.isArray(p.value) ? (p.value as number[]) : [];
            const z = typeof arr[2] === 'number' ? arr[2] : 0;
            return fmt(z);
          },
        },
        emphasis: {
          itemStyle: { color: '#ffd166' },
        },
      },
    ],
    aria: {
      enabled: true,
      label: {
        description: description
          ? escapeHtml(description)
          : title
            ? `3D bar chart: ${escapeHtml(title)}`
            : '3D bar chart',
      },
      ...(decalEnabled ? { decal: { show: true, decals: decalPatterns } } : {}),
    },
  } as EChartsOption;
}

/**
 * Build the canonical ChartClickEvent payload from an ECharts `click`
 * event on the bar3D series. Pure — exported for unit tests.
 */
export function buildBar3DClickEvent(
  normalized: NormalisedBar3DInput,
  params: unknown,
): ChartClickEvent | null {
  const p = params as { value?: unknown; name?: string; dataIndex?: number };
  const valueArr = Array.isArray(p.value) ? (p.value as number[]) : null;
  if (!valueArr) return null;
  const [xi, yi, z] = valueArr;
  const xLabel = normalized.xCategories[xi];
  const yLabel = normalized.yCategories[yi];
  if (xLabel == null || yLabel == null) return null;
  const item = normalized.items[p.dataIndex ?? -1];
  const label = item?.name ?? `${String(xLabel)} × ${String(yLabel)}`;
  return {
    datum: {
      x: xLabel,
      y: yLabel,
      z,
      xIndex: xi,
      yIndex: yi,
      label,
      dataIndex: typeof p.dataIndex === 'number' ? p.dataIndex : undefined,
    },
    value: z,
    label,
  };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const Bar3DChartInner = React.forwardRef<
  HTMLDivElement,
  Omit<Bar3DChartProps, 'access' | 'accessReason'>
>(function Bar3DChartInner(
  {
    data,
    xCategories,
    yCategories,
    size = 'md',
    title,
    description,
    className,
    xLabel,
    yLabel,
    zLabel,
    valueFormatter,
    colors,
    animate = true,
    showValues = false,
    shading = 'lambert',
    barSize = 0.8,
    grid3D,
    viewControl,
    light,
    onDataPointClick,
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
  const safeData = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const isEmpty = safeData.length === 0;
  const fmt = valueFormatter ?? formatCompact;

  const ownContainerRef = useRef<HTMLDivElement | null>(null);

  // Density soft warning — Codex iter-1 risk note. 30×30=900 sweet
  // spot, 50×50=2500 borderline; consumer should pre-aggregate.
  if (
    process.env.NODE_ENV !== 'production' &&
    !isEmpty &&
    safeData.length > DENSITY_WARN_THRESHOLD
  ) {
    console.warn(
      `[Bar3DChart] ${safeData.length} cells exceeds the soft ${DENSITY_WARN_THRESHOLD}-cell threshold; consider pre-aggregating to keep the GL scene legible.`,
    );
  }

  // GL gate — Codex iter-1: Bar3D has no canvas fallback, so the
  // wrapper must surface unsupported / loading branches instead of
  // dispatching a malformed option.
  const gl = useRequiredEChartsGL({ enabled: !isEmpty });

  const { themeObject, decalEnabled, decalPatterns, effectivePalette } = useChartTheme({
    theme: themePreference,
    decal: decalPreference,
    density: densityPreference,
    accent: accentPreference,
  });

  const normalized = useMemo(
    () => normalizeBar3DData(safeData, xCategories, yCategories),
    [safeData, xCategories, yCategories],
  );

  const option = useMemo((): EChartsOption | null => {
    if (isEmpty || gl.status !== 'ready') return null;
    const explicitColors = resolveCssVarColors(colors);
    const palette =
      explicitColors && explicitColors.length > 0
        ? explicitColors
        : (effectivePalette ?? getDefaultPalette());
    return buildBar3DOption({
      normalized,
      xLabel,
      yLabel,
      zLabel,
      fmt,
      palette,
      animate,
      showValues,
      shading,
      barSize,
      title,
      description,
      grid3D,
      viewControl,
      light,
      decalEnabled,
      decalPatterns,
    });
  }, [
    isEmpty,
    gl.status,
    normalized,
    xLabel,
    yLabel,
    zLabel,
    fmt,
    colors,
    effectivePalette,
    animate,
    showValues,
    shading,
    barSize,
    title,
    description,
    grid3D,
    viewControl,
    light,
    decalEnabled,
    decalPatterns,
  ]);

  const handleClick = useCallback(
    (params: unknown) => {
      if (!onDataPointClick) return;
      const event = buildBar3DClickEvent(normalized, params);
      if (event) onDataPointClick(event);
    },
    [onDataPointClick, normalized],
  );

  const { containerRef, instance } = useEChartsRenderer({
    option: option ?? ({} as EChartsOption),
    theme: themeObject,
    respectReducedMotion: true,
    onClick: onDataPointClick ? handleClick : undefined,
  });

  // a11y data table — one row per bar (capped at A11Y_BIG_DATA_ROW_LIMIT).
  // Row label is "<x> × <y>", value is z. The hidden table reads
  // top-to-bottom across the grid.
  const a11yData = useMemo(() => {
    const source =
      normalized.items.length > A11Y_BIG_DATA_ROW_LIMIT
        ? normalized.items.slice(0, A11Y_BIG_DATA_ROW_LIMIT)
        : normalized.items;
    return source.map((item) => ({
      label:
        item.name ??
        `${String(normalized.xCategories[item.xIndex])} × ${String(normalized.yCategories[item.yIndex])}`,
      value: item.z,
    }));
  }, [normalized]);

  const a11y = useChartA11y({
    chartType: 'bar3d',
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
        data-testid="bar3d-chart-empty"
        {...rest}
      >
        Veri yok
      </div>
    );
  }

  /* ---- unsupported branch (WebGL missing or echarts-gl import failed) ---- */
  if (gl.status === 'unsupported') {
    return (
      <div
        ref={forwardedRef}
        className={cn(
          'flex items-center justify-center text-sm text-[var(--text-secondary)] text-center p-4',
          className,
        )}
        style={{ height }}
        role="img"
        aria-label={a11y.ariaLabel}
        data-testid="bar3d-chart-unsupported"
        data-reason={gl.reason}
        {...rest}
      >
        {describeEChartsGLReason(gl.reason)}
      </div>
    );
  }

  /* ---- loading branch (GL chunk in flight) ---- */
  if (gl.status !== 'ready') {
    return (
      <div
        ref={forwardedRef}
        className={cn(
          'flex items-center justify-center text-sm text-[var(--text-secondary)]',
          className,
        )}
        style={{ height }}
        role="img"
        aria-label={a11y.ariaLabel}
        data-testid="bar3d-chart-loading"
        {...rest}
      >
        3D çiziciyi yükleniyor…
      </div>
    );
  }

  return (
    <ChartA11yShell
      a11y={a11y}
      className={className}
      height={height}
      testId="bar3d-chart"
      setRefs={setRefs}
      anomalySummary={anomalySummary}
      formatAnomalyAnnouncement={formatAnomalyAnnouncement}
      {...rest}
    />
  );
});

Bar3DChartInner.displayName = 'Bar3DChartInner';

/**
 * Bar3DChart — public wrapper. Accepts `access` + `accessReason`
 * (`AccessControlledProps`) and forwards everything else to the inner
 * component. Mirrors the Scatter3D / Globe access-gate pattern.
 */
export const Bar3DChart = React.forwardRef<HTMLDivElement, Bar3DChartProps>(function Bar3DChart(
  { access, accessReason, onDataPointClick, anomalySummary, formatAnomalyAnnouncement, ...rest },
  ref,
) {
  const { state } = resolveAccessState(access);
  return (
    <ChartAccessGate access={access} accessReason={accessReason}>
      <Bar3DChartInner
        ref={ref}
        {...rest}
        onDataPointClick={guardChartCallback(state, onDataPointClick)}
        anomalySummary={anomalySummary}
        formatAnomalyAnnouncement={formatAnomalyAnnouncement}
      />
    </ChartAccessGate>
  );
});
Bar3DChart.displayName = 'Bar3DChart';

export default Bar3DChart;
