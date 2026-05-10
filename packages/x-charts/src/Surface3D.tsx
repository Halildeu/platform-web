'use client';

/**
 * Surface3D — Faz 21.11 P1b (3D Extension Pack — surface plot).
 *
 * Renders a row-major rectangular Surface plot via ECharts'
 * `'surface'` series (singular — `'surface3D'` is not an
 * echarts-gl name). The wrapper gates its render on
 * `useRequiredEChartsGL` so a host without WebGL surfaces a
 * graceful unsupported state.
 *
 * Codex thread `019e10d7` iter-2:
 *   - `dataShape: [rows, columns]` is REQUIRED (no silent
 *     `Math.sqrt` inference; 100×400 vs 200×200 ambiguity).
 *   - A11y data table goes through `sampleSurfaceGridA11y` +
 *     `buildSampledCaption` so screen-reader users get a
 *     stratified sample with the real sample count surfaced.
 *   - Equation/parametric input modes are deferred to v2; this
 *     wrapper takes a flat data-first input.
 *   - `markups` accepted but currently a NO-OP (3D markup
 *     adapter is a follow-up PR).
 *
 * @see Scatter3D — 1D peer (P1a) using the same lifecycle helper.
 * @see useRequiredEChartsGL — 4-state lifecycle for `echarts-gl`.
 */
import React, { useCallback, useMemo, useRef } from 'react';
import type { AccessControlledProps } from '@mfe/shared-types';
import { resolveAccessState } from '@mfe/shared-types';
import { cn } from './utils/cn';
import { ChartAccessGate } from './access/ChartAccessGate';
import { guardChartCallback } from './access/guardChartCallback';
import { useEChartsRenderer } from './renderers';
import { useRequiredEChartsGL } from './renderers/gl';
import { useChartTheme } from './theme/useChartTheme';
import type {
  ChartThemePreference,
  ChartDecalPreference,
  ChartDensityPreference,
  ChartAccentPreference,
} from './theme/useChartTheme';
import { CHART_CANVAS_HEIGHT } from './chartSize';
import { formatCompact } from './utils/formatters';
const escapeHtml = (t: string): string =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
import { ChartA11yShell, useChartA11y } from './a11y';
import type { AnomalyAnnouncementFormatter } from './a11y/ChartAriaLive';
import type { AnomalySummary } from './annotations/computeAnomalyOverlay';
import { sampleSurfaceGridA11y, buildSampledCaption } from './a11y/sampling';
import type { EChartsOption } from './renderers/echarts-imports';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ChartSize = 'sm' | 'md' | 'lg';

export type { ChartClickEvent } from './types';
import type { ChartClickEvent as ChartClickEventCanonical } from './types';
type ChartClickEvent = ChartClickEventCanonical;

export type { ChartMarkup, ChartMarkupClickEvent } from './types';
import type { ChartMarkup, ChartMarkupClickEvent } from './types';

/** Single point on a row-major rectangular Surface3D grid. */
export interface Surface3DDataPoint {
  x: number;
  y: number;
  z: number;
}

/** ECharts surface shading mode. Defaults to `'lambert'`. */
export type Surface3DShading = 'color' | 'lambert' | 'realistic' | 'colorMaterial';

export interface Surface3DProps extends AccessControlledProps {
  /** Row-major rectangular Surface3D data (`rows * columns === data.length`). */
  data: Surface3DDataPoint[];
  /**
   * Required topology — `[rows, columns]`. Codex thread `019e10d7`
   * iter-2: silent `Math.sqrt(data.length)` inference is unsafe (a
   * 100×400 grid would read as 200×200). The helper enforces
   * `rows * columns === data.length`.
   */
  dataShape: readonly [rows: number, columns: number];
  /** Visual size variant. @default "md" */
  size?: ChartSize;
  /** Custom value formatter (used in tooltip + a11y data table). */
  valueFormatter?: (value: number) => string;
  /** Animate on mount. @default true */
  animate?: boolean;
  /** Chart title. */
  title?: string;
  /** Accessible description. */
  description?: string;
  /** Additional class name. */
  className?: string;
  /** Surface shading mode. @default "lambert" */
  shading?: Surface3DShading;
  /** Callback fired when a data point is clicked. */
  onDataPointClick?: (event: ChartClickEvent) => void;
  /** Visual overlay markups — accepted but NO-OP on Surface3D. */
  markups?: ChartMarkup[];
  /** Callback fired when a markup overlay is clicked (no-op on Surface3D). */
  onMarkupClick?: (event: ChartMarkupClickEvent) => void;
  /** Theme override. @default "auto" */
  theme?: ChartThemePreference;
  /** Decal pattern override. @default "auto" */
  decal?: ChartDecalPreference;
  /** Density override. @default "auto" */
  density?: ChartDensityPreference;
  /** Accent palette override. @default "auto" */
  accent?: ChartAccentPreference;
  /** Anomaly summary forward (consumer-provided; no built-in 3D detector). */
  anomalySummary?: AnomalySummary[];
  /** Optional override of the anomaly announcement template. */
  formatAnomalyAnnouncement?: AnomalyAnnouncementFormatter;
  /** Native ECharts `viewControl` passthrough (camera / auto-rotate). */
  viewControl?: Record<string, unknown>;
  /** Native ECharts `grid3D` passthrough. */
  grid3D?: Record<string, unknown>;
  /** Native ECharts `light` passthrough. */
  light?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/*  Pure option builder (Codex thread 019e10d7 iter-2 extraction)      */
/* ------------------------------------------------------------------ */

/** Pure-function input for {@link buildSurface3DOption}. */
export interface BuildSurface3DOptionInput {
  data: Surface3DDataPoint[];
  dataShape: readonly [rows: number, columns: number];
  palette: readonly string[];
  fmt: (value: number) => string;
  animate: boolean;
  shading: Surface3DShading;
  viewControl?: Record<string, unknown>;
  grid3D?: Record<string, unknown>;
  light?: Record<string, unknown>;
}

/**
 * Build the ECharts option dispatched by `Surface3D`. Pure function:
 * given the data + style overrides, returns the exact option object
 * the wrapper sends to `setOption` once GL is ready. Mirrors the
 * P1a `buildScatter3DOption` precedent so the option contract can
 * be unit-tested without React mount + lazy GL gate races.
 *
 * Throws if `dataShape` doesn't match `data.length`.
 */
export function buildSurface3DOption(input: BuildSurface3DOptionInput): EChartsOption {
  const { data, dataShape, palette, fmt, animate, shading, viewControl, grid3D, light } = input;
  const [rows, cols] = dataShape;
  if (rows * cols !== data.length) {
    throw new Error(
      `buildSurface3DOption: dataShape [${rows}, ${cols}] (= ${rows * cols}) ` +
        `does not match data.length ${data.length}.`,
    );
  }

  const seriesData = data.map((p) => [p.x, p.y, p.z]);

  // Single-pass z-range so the visualMap colour scale stays tight on
  // the actual data (and so 1M-point datasets don't blow the V8
  // function-arg limit on `Math.min(...arr)` — Codex iter-3 P1a).
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const p of data) {
    if (p.z < min) min = p.z;
    if (p.z > max) max = p.z;
  }

  return {
    tooltip: {
      formatter: (params: { value?: number[]; name?: string }) => {
        const [x, y, z] = params.value ?? [];
        return `x: ${escapeHtml(String(x))}<br/>y: ${escapeHtml(String(y))}<br/>z: ${escapeHtml(fmt(z ?? 0))}`;
      },
    },
    visualMap: {
      show: false,
      // Surface3D `data` items are `[x, y, z]` so dimension 2 = z.
      dimension: 2,
      min,
      max,
      inRange: { color: [palette[0], palette[palette.length - 1] ?? palette[0]] },
    },
    xAxis3D: { type: 'value' },
    yAxis3D: { type: 'value' },
    zAxis3D: { type: 'value' },
    grid3D: {
      viewControl: viewControl ?? { autoRotate: false, distance: 200 },
      light: light ?? {
        main: { intensity: 1.2, shadow: false },
        ambient: { intensity: 0.3 },
      },
      ...(grid3D ?? {}),
    },
    animation: animate,
    series: [
      {
        type: 'surface',
        data: seriesData,
        shading,
      },
    ],
  } as EChartsOption;
}

/* ------------------------------------------------------------------ */
/*  Pure click-event factory (Faz 21.11 P1d unification)               */
/* ------------------------------------------------------------------ */

/** Raw ECharts click params subset for {@link buildSurface3DClickEvent}. */
export interface Surface3DRawClickParams {
  value?: number[];
  dataIndex?: number;
}

/**
 * Build the canonical `ChartClickEvent` for a Surface3D click. Pure
 * function: derives `value` (z-axis) from `data[dataIndex]` —
 * source-of-truth (avoids the ECharts `params.value[2]` zero-fallback
 * regression Globe iter-2 hit). Returns `null` when `dataIndex` is
 * out-of-bounds (defensive).
 *
 * Lifted out of `Surface3DInner.handleClick` (P1d) so the click
 * contract can be unit-tested without React mount.
 */
export function buildSurface3DClickEvent(
  data: Surface3DDataPoint[],
  params: Surface3DRawClickParams,
): ChartClickEvent | null {
  const dataIndex = params.dataIndex ?? -1;
  if (dataIndex < 0 || dataIndex >= data.length) return null;
  const point = data[dataIndex];
  return {
    datum: {
      x: point.x,
      y: point.y,
      z: point.z,
      value: point.z,
      dataIndex,
      chartType: 'surface3d',
      seriesName: 'Surface3D',
    },
    value: point.z,
  };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const Surface3DInner = React.forwardRef<
  HTMLDivElement,
  Omit<Surface3DProps, 'access' | 'accessReason'>
>(function Surface3DInner(
  {
    data,
    dataShape,
    size = 'md',
    valueFormatter,
    animate = true,
    title,
    description,
    className,
    shading = 'lambert',
    onDataPointClick,
    markups: _markups,
    onMarkupClick: _onMarkupClick,
    theme: themePreference = 'auto',
    decal: decalPreference = 'auto',
    density: densityPreference = 'auto',
    accent: accentPreference = 'auto',
    anomalySummary,
    formatAnomalyAnnouncement,
    viewControl,
    grid3D,
    light,
    ...rest
  },
  forwardedRef,
) {
  const height = CHART_CANVAS_HEIGHT[size];
  const isEmpty = !data || data.length === 0;
  const fmt = valueFormatter ?? formatCompact;

  const gl = useRequiredEChartsGL({ enabled: !isEmpty });
  const glReady = gl.status === 'ready';

  const ownContainerRef = useRef<HTMLDivElement | null>(null);

  const { themeObject, effectivePalette } = useChartTheme({
    theme: themePreference,
    decal: decalPreference,
    density: densityPreference,
    accent: accentPreference,
  });

  const option = useMemo((): EChartsOption | null => {
    if (isEmpty || !glReady) return null;
    const palette = effectivePalette ?? ['#3b82f6'];
    return buildSurface3DOption({
      data,
      dataShape,
      palette,
      fmt,
      animate,
      shading,
      viewControl,
      grid3D,
      light,
    });
  }, [
    data,
    dataShape,
    isEmpty,
    glReady,
    effectivePalette,
    fmt,
    animate,
    shading,
    viewControl,
    grid3D,
    light,
  ]);

  const handleClick = useCallback(
    (params: unknown) => {
      if (!onDataPointClick) return;
      // P1d: delegate to the pure factory (Globe iter-4 / Scatter3D
      // P1d precedent — thin React adapter over the factory).
      const event = buildSurface3DClickEvent(data, params as Surface3DRawClickParams);
      if (event) onDataPointClick(event);
    },
    [onDataPointClick, data],
  );

  const { containerRef, instance } = useEChartsRenderer({
    option: option ?? ({} as EChartsOption),
    theme: themeObject,
    onClick: onDataPointClick ? handleClick : undefined,
  });

  // Stratified row × column sample for the hidden a11y data table
  // (40K vertex grid would defeat the WebGL claim with 40K <tr>s).
  // Codex thread `019e10d7` iter-3: gate the sampler on `isEmpty`
  // because `sampleSurfaceGridA11y` enforces the
  // `rows * cols === data.length` invariant — a stale `dataShape`
  // (e.g. `[2, 2]` left over after `data` cleared) would throw
  // before the empty-state branch could render.
  const a11ySample = useMemo(
    () =>
      isEmpty
        ? { samples: [], sourceCount: 0, sampledCount: 0 }
        : sampleSurfaceGridA11y(data, dataShape, 1000),
    [data, dataShape, isEmpty],
  );
  const a11yTitle = useMemo(
    () =>
      buildSampledCaption(title, {
        sourceCount: a11ySample.sourceCount,
        sampledCount: a11ySample.sampledCount,
        unit: 'vertices',
      }),
    [title, a11ySample.sourceCount, a11ySample.sampledCount],
  );
  const a11y = useChartA11y({
    chartType: 'surface3d',
    data: a11ySample.samples,
    title: a11yTitle,
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
        data-testid="surface3d-chart-empty"
        {...rest}
      >
        Veri yok
      </div>
    );
  }

  if (gl.status === 'unsupported') {
    return (
      <div
        ref={forwardedRef}
        className={cn(
          'inline-flex items-center justify-center text-sm text-[var(--text-secondary)]',
          className,
        )}
        style={{ height }}
        role="img"
        aria-label={`${a11y.ariaLabel} — WebGL unavailable`}
        data-testid="surface3d-chart-unsupported"
        data-reason={gl.reason ?? 'webgl-unavailable'}
        {...rest}
      >
        3D rendering requires WebGL, which is not available in this environment.
      </div>
    );
  }

  if (gl.status !== 'ready') {
    return (
      <div
        ref={forwardedRef}
        className={cn(
          'inline-flex items-center justify-center text-sm text-[var(--text-secondary)]',
          className,
        )}
        style={{ height }}
        role="img"
        aria-label={`${a11y.ariaLabel} — loading`}
        data-testid="surface3d-chart-loading"
        {...rest}
      >
        Loading 3D renderer…
      </div>
    );
  }

  return (
    <ChartA11yShell
      a11y={a11y}
      className={className}
      height={height}
      testId="surface3d-chart"
      setRefs={setRefs}
      anomalySummary={anomalySummary}
      formatAnomalyAnnouncement={formatAnomalyAnnouncement}
      {...rest}
    />
  );
});

Surface3DInner.displayName = 'Surface3DInner';

/**
 * Surface3D — public wrapper. Accepts `access` + `accessReason`
 * (`AccessControlledProps`) and forwards everything else to
 * `Surface3DInner`. Faz 21.4 PR-E2 wiring.
 */
export const Surface3D = React.forwardRef<HTMLDivElement, Surface3DProps>(function Surface3D(
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
      <Surface3DInner
        ref={ref}
        {...rest}
        onDataPointClick={guardChartCallback(state, onDataPointClick)}
        onMarkupClick={guardChartCallback(state, onMarkupClick)}
        anomalySummary={anomalySummary}
        formatAnomalyAnnouncement={formatAnomalyAnnouncement}
      />
    </ChartAccessGate>
  );
});
Surface3D.displayName = 'Surface3D';

export default Surface3D;
