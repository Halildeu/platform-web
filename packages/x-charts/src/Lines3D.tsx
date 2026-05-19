'use client';

/**
 * Lines3D — Faz 21.11 P1b (3D Extension Pack — multi-path xyz lines).
 *
 * Renders multiple xyz polylines on a shared `cartesian3D / grid3D`
 * via ECharts `'line3D'` series (singular — `'lines3D'` is reserved
 * for the globe / geo family in echarts-gl, deferred to a separate
 * follow-up wrapper). Each path in the consumer-provided `data`
 * array becomes one `'line3D'` series in the dispatched option.
 *
 * Codex thread `019e10d7` iter-2:
 *   - Wrapper public name stays `Lines3D` (plural intent; multi-path
 *     consumer API). JSDoc explicitly notes the series type is the
 *     singular `'line3D'`. Globe / geo `'lines3D'` is deferred.
 *   - A11y data table goes through `sampleLines3DA11y` +
 *     `buildSampledCaption` so screen-reader users get a per-path
 *     stride sample (first + last preserved per path while the cap
 *     budget allows; high-path-count cases prioritise the cap to
 *     keep the hidden table under the contract — Codex iter-3/iter-4).
 *   - Tooltip formatter resolves the path through `params.seriesIndex
 *     -> data[seriesIndex]` so the consumer-provided label survives.
 *   - `markups` accepted but currently a NO-OP.
 *
 * @see Scatter3D / Surface3D — peers using the same lifecycle.
 * @see useRequiredEChartsGL — 4-state lifecycle for `echarts-gl`.
 */
import React, { useCallback, useMemo, useRef } from 'react';
import type { AccessControlledProps } from '@mfe/shared-types';
import { resolveAccessState } from '@mfe/shared-types';
import { cn } from './utils/cn';
import { resolveCssVarColor } from './utils/resolveCssVarColor';
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
const escapeHtml = (t: string): string =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
import { ChartA11yShell, useChartA11y } from './a11y';
import type { AnomalyAnnouncementFormatter } from './a11y/ChartAriaLive';
import type { AnomalySummary } from './annotations/computeAnomalyOverlay';
import { sampleLines3DA11y, buildSampledCaption } from './a11y/sampling';
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

/** A single xyz path in the multi-path Lines3D wrapper. */
export interface Lines3DPath {
  /**
   * Ordered xyz coordinates that make up the polyline. Each entry is
   * a `[x, y, z]` tuple. ECharts `line3D` consumes this directly.
   */
  coords: ReadonlyArray<readonly [number, number, number]>;
  /** Optional path label (used in tooltip + a11y data table). */
  label?: string;
  /** Optional per-path colour override. Falls through to the palette otherwise. */
  color?: string;
  // NOTE: a `value?: number` field was considered for "path-level
  // metric" semantics but rejected for P1b — Codex thread
  // `019e10d7` iter-3 flagged the inconsistency (used only by the
  // a11y sampler's start/end rows; ignored by middle rows, the
  // tooltip, and the click payload). A future PR can introduce it
  // with end-to-end wiring (a11y row + tooltip + click datum +
  // option metadata). For now Lines3D consumers route per-coord
  // metrics through the z dimension.
}

export interface Lines3DProps extends AccessControlledProps {
  /** Multi-path xyz data — each entry becomes one `line3D` series. */
  data: Lines3DPath[];
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
  /** Line width in pixels. @default 2 */
  lineWidth?: number;
  /** Callback fired when a data point is clicked. */
  onDataPointClick?: (event: ChartClickEvent) => void;
  /** Visual overlay markups — accepted but NO-OP on Lines3D. */
  markups?: ChartMarkup[];
  /** Callback fired when a markup overlay is clicked (no-op on Lines3D). */
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

/** Pure-function input for {@link buildLines3DOption}. */
export interface BuildLines3DOptionInput {
  paths: Lines3DPath[];
  palette: readonly string[];
  fmt: (value: number) => string;
  animate: boolean;
  lineWidth: number;
  viewControl?: Record<string, unknown>;
  grid3D?: Record<string, unknown>;
  light?: Record<string, unknown>;
}

/**
 * Build the ECharts option for `Lines3D`. Each path becomes one
 * `'line3D'` series (singular — `'lines3D'` is geo / globe).
 * Tooltip formatter resolves the path label via `params.seriesIndex
 * → paths[seriesIndex]` so the consumer-supplied label survives.
 */
export function buildLines3DOption(input: BuildLines3DOptionInput): EChartsOption {
  const { paths, palette, fmt, animate, lineWidth, viewControl, grid3D, light } = input;

  // Single-pass z-range across every coord of every path. Avoids
  // `Math.min(...)` spread arg-limit risk for the 10K-segment hard tier.
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const path of paths) {
    for (const c of path.coords) {
      const z = c[2];
      if (z < min) min = z;
      if (z > max) max = z;
    }
  }

  // Map paths → ECharts `line3D` series. Each series carries the
  // raw consumer label as `name` so the tooltip formatter can read
  // it back via the resolved path index.
  const series = paths.map((path, i) => {
    // Resolve a consumer `var(--token)` color — the canvas/WebGL renderer
    // cannot read CSS custom properties. `palette` is already resolved.
    const seriesColor = resolveCssVarColor(path.color) ?? palette[i % Math.max(1, palette.length)];
    return {
      type: 'line3D' as const,
      name: path.label ?? `Path ${i + 1}`,
      data: path.coords.map((c) => [c[0], c[1], c[2]]),
      lineStyle: { color: seriesColor, width: lineWidth },
    };
  });

  return {
    tooltip: {
      formatter: (params: { value?: number[]; seriesIndex?: number; dataIndex?: number }) => {
        const sIdx = params.seriesIndex ?? 0;
        const path = paths[sIdx];
        const label = path?.label ?? `Path ${sIdx + 1}`;
        const [x, y, z] = params.value ?? [];
        return `<b>${escapeHtml(label)}</b><br/>x: ${escapeHtml(String(x))}<br/>y: ${escapeHtml(String(y))}<br/>z: ${escapeHtml(fmt(z ?? 0))}`;
      },
    },
    visualMap: {
      show: false,
      // line3D coords are [x, y, z]; dimension 2 = z so the colour
      // scale tracks elevation across all paths.
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
    series,
  } as EChartsOption;
}

/* ------------------------------------------------------------------ */
/*  Pure click-event factory (Faz 21.11 P1d unification)               */
/* ------------------------------------------------------------------ */

/** Raw ECharts click params subset for {@link buildLines3DClickEvent}. */
export interface Lines3DRawClickParams {
  value?: number[];
  seriesIndex?: number;
  dataIndex?: number;
}

/**
 * Build the canonical `ChartClickEvent` for a Lines3D click. Pure
 * function: resolves the path via `paths[seriesIndex]` and the
 * coord via `path.coords[dataIndex]` — source-of-truth. Returns
 * `null` when either index is out-of-bounds (defensive).
 *
 * Lifted out of `Lines3DInner.handleClick` (P1d) so the click
 * contract can be unit-tested without React mount.
 */
export function buildLines3DClickEvent(
  paths: Lines3DPath[],
  params: Lines3DRawClickParams,
): ChartClickEvent | null {
  const sIdx = params.seriesIndex ?? 0;
  const path = paths[sIdx];
  if (!path) return null;
  const dataIndex = params.dataIndex ?? -1;
  if (dataIndex < 0 || dataIndex >= path.coords.length) return null;
  const [x, y, z] = path.coords[dataIndex];
  return {
    datum: {
      x,
      y,
      z,
      value: z,
      pathIndex: sIdx,
      pathLabel: path.label,
      dataIndex,
      chartType: 'lines3d',
      seriesName: path.label ?? `Path ${sIdx + 1}`,
    },
    value: z,
    label: path.label,
  };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const Lines3DInner = React.forwardRef<
  HTMLDivElement,
  Omit<Lines3DProps, 'access' | 'accessReason'>
>(function Lines3DInner(
  {
    data,
    size = 'md',
    valueFormatter,
    animate = true,
    title,
    description,
    className,
    lineWidth = 2,
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
  // Codex thread `019e10d7` iter-3: emptiness must include total
  // coord count, not just `paths.length`. Otherwise `data=[{coords:
  // []}]` slips past the gate, the option builder runs, and
  // `min/max` end up `Infinity / -Infinity` — invalid visualMap
  // bounds.
  const totalCoords = useMemo(
    () => (data ?? []).reduce((acc, p) => acc + p.coords.length, 0),
    [data],
  );
  const isEmpty = !data || data.length === 0 || totalCoords === 0;
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
    const palette = effectivePalette ?? ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444'];
    return buildLines3DOption({
      paths: data,
      palette,
      fmt,
      animate,
      lineWidth,
      viewControl,
      grid3D,
      light,
    });
  }, [
    data,
    isEmpty,
    glReady,
    effectivePalette,
    fmt,
    animate,
    lineWidth,
    viewControl,
    grid3D,
    light,
  ]);

  const handleClick = useCallback(
    (params: unknown) => {
      if (!onDataPointClick) return;
      // P1d: delegate to the pure factory (Globe iter-4 precedent).
      const event = buildLines3DClickEvent(data, params as Lines3DRawClickParams);
      if (event) onDataPointClick(event);
    },
    [onDataPointClick, data],
  );

  const { containerRef, instance } = useEChartsRenderer({
    option: option ?? ({} as EChartsOption),
    theme: themeObject,
    onClick: onDataPointClick ? handleClick : undefined,
  });

  // Per-path stride sample for the hidden a11y data table (first /
  // last preserved per path; cap shared across all paths). Codex
  // iter-2: caption reports the real sample count, not the cap.
  // Codex iter-3: drop the `value` per-path field — `Lines3DPath.value`
  // was an inconsistent half-wired API and has been removed for P1b.
  const a11ySamplerInput = useMemo(
    () => (data ?? []).map((p) => ({ coords: p.coords, label: p.label })),
    [data],
  );
  // Gate the sampler on `isEmpty` so a `data=[{coords: []}]` payload
  // doesn't reach the option builder with a degenerate distribution.
  const a11ySample = useMemo(
    () =>
      isEmpty
        ? { samples: [], sourceCount: 0, sampledCount: 0 }
        : sampleLines3DA11y(a11ySamplerInput, 1000),
    [a11ySamplerInput, isEmpty],
  );
  const a11yTitle = useMemo(
    () =>
      buildSampledCaption(title, {
        sourceCount: a11ySample.sourceCount,
        sampledCount: a11ySample.sampledCount,
        unit: 'points',
      }),
    [title, a11ySample.sourceCount, a11ySample.sampledCount],
  );
  const a11y = useChartA11y({
    chartType: 'lines3d',
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
        data-testid="lines3d-chart-empty"
        {...rest}
      >
        Veri yok
      </div>
    );
  }

  if (gl.status === 'unsupported') {
    const banner = describeEChartsGLReason(gl.reason);
    return (
      <div
        ref={forwardedRef}
        className={cn(
          'flex items-center justify-center px-4 text-center text-sm text-[var(--text-secondary)]',
          className,
        )}
        style={{ height }}
        role="img"
        aria-label={`${a11y.ariaLabel} — ${banner}`}
        data-testid="lines3d-chart-unsupported"
        data-reason={gl.reason ?? 'webgl-unavailable'}
        {...rest}
      >
        {banner}
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
        data-testid="lines3d-chart-loading"
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
      testId="lines3d-chart"
      setRefs={setRefs}
      anomalySummary={anomalySummary}
      formatAnomalyAnnouncement={formatAnomalyAnnouncement}
      {...rest}
    />
  );
});

Lines3DInner.displayName = 'Lines3DInner';

/**
 * Lines3D — public wrapper. Multi-path xyz lines on shared
 * cartesian3D / grid3D. Internally emits one ECharts `'line3D'`
 * series per path; the official `'lines3D'` (geo / globe) wrapper
 * is deferred. Codex thread `019e10d7` iter-2.
 */
export const Lines3D = React.forwardRef<HTMLDivElement, Lines3DProps>(function Lines3D(
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
      <Lines3DInner
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
Lines3D.displayName = 'Lines3D';

export default Lines3D;
