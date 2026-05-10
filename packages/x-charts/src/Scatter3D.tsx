'use client';

/**
 * Scatter3D — Faz 21.11 P1a (3D Extension Pack foundation wrapper).
 *
 * Renders a 3D point cloud via ECharts' `scatter3D` series. The wrapper
 * gates its render on `useRequiredEChartsGL` so a host without WebGL
 * surfaces a graceful unsupported state instead of dispatching a
 * malformed canvas option (Codex thread `019e10ab` iter-1: 3D wrappers
 * never fall back to canvas; there is no 2D substitute).
 *
 * Design constraints:
 *
 *   - Bundle: `echarts-gl` is dynamically imported via the shared
 *     `registerEChartsGL` helper. Static imports are forbidden by
 *     `bundle-guard.test.ts` — this wrapper only depends on the
 *     `useRequiredEChartsGL` lifecycle hook.
 *
 *   - Markups: PR-A2b-ui's `ChartMarkup` overlay is 2D-only (line/area/
 *     point on the cartesian grid). For P1a we accept the prop for API
 *     consistency but do NOT thread it through the option memo —
 *     surfacing fake 3D markups would be worse than no support. A
 *     dedicated 3D markup adapter is out of scope and tracked under a
 *     follow-up PR.
 *
 *   - A11y: the canvas is opaque to screen readers, but `useChartA11y`
 *     emits a hidden data table mapping `(x, y, z)` triplets to their
 *     value. The shell also supports the PR-A2b-a11y `anomalySummary`
 *     pass-through; consumer-provided summaries can use a Mahalanobis
 *     detector if they have one (no built-in 3D detector ships with
 *     this PR — that's tracked under the batch3 contract evolution
 *     thread `019e10a5`).
 *
 *   - Renderer: ECharts init renderer stays `'canvas'`. WebGL here is
 *     the `echarts-gl` series-registration layer, NOT the ECharts init
 *     renderer (Codex iter-1 caught the conceptual confusion in the
 *     plan). The DOM uses a plain canvas; `scatter3D` series
 *     internally creates a WebGL layer once registered.
 *
 * @see useRequiredEChartsGL — the lazy load + capability gate.
 * @see ScatterChart — 2D peer with opportunistic WebGL fallback.
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
// Tooltip strings include consumer-supplied labels — sanitize per the
// pattern every other 2D wrapper uses (Codex thread `019e10ab` iter-2
// caught the missing escape; consumer label could XSS otherwise).
const escapeHtml = (t: string): string =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
import { ChartA11yShell, useChartA11y } from './a11y';
import type { AnomalyAnnouncementFormatter } from './a11y/ChartAriaLive';
import type { AnomalySummary } from './annotations/computeAnomalyOverlay';
import type { EChartsOption } from './renderers/echarts-imports';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ChartSize = 'sm' | 'md' | 'lg';

export type { ChartClickEvent } from './types';
import type { ChartClickEvent as ChartClickEventCanonical } from './types';
type ChartClickEvent = ChartClickEventCanonical;

// Markup overlay re-export for type parity with the 2D wrappers.
// NOTE: P1a accepts the prop but does not thread it through the option
// memo — see header rationale.
export type { ChartMarkup, ChartMarkupClickEvent } from './types';
import type { ChartMarkup, ChartMarkupClickEvent } from './types';

/** Single point in 3D space. */
export interface Scatter3DDataPoint {
  /** X-axis coordinate. */
  x: number;
  /** Y-axis coordinate. */
  y: number;
  /** Z-axis coordinate. */
  z: number;
  /**
   * Optional 4th-channel value (mapped to point colour via the
   * visualMap). Defaults to `z` when omitted so the chart still
   * renders sensibly with a height-based colour scale.
   */
  value?: number;
  /** Optional display label (used in tooltip + a11y data table). */
  label?: string;
  /** Optional per-point colour override (skips the visualMap). */
  color?: string;
  /** Optional per-point symbol size. */
  size?: number;
}

export interface Scatter3DProps extends AccessControlledProps {
  /** 3D point cloud data. */
  data: Scatter3DDataPoint[];
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
  /** Callback fired when a data point is clicked. */
  onDataPointClick?: (event: ChartClickEvent) => void;
  /**
   * Visual overlay markups. Accepted for API parity with the 2D
   * wrappers but currently a NO-OP on Scatter3D — surfacing fake
   * 3D markups would be worse than none. A 3D markup adapter is
   * tracked as a follow-up PR.
   */
  markups?: ChartMarkup[];
  /** Callback fired when a markup overlay is clicked (no-op on Scatter3D). */
  onMarkupClick?: (event: ChartMarkupClickEvent) => void;
  /**
   * Theme override.
   * @default "auto" — follows documentElement signals
   */
  theme?: ChartThemePreference;
  /**
   * Decal pattern override.
   * @default "auto" — enabled for high-contrast and print themes
   * @remarks Decals on a 3D point cloud have no semantic meaning;
   *   accepted for API consistency with the 2D wrappers.
   */
  decal?: ChartDecalPreference;
  /** Density override. @default "auto" */
  density?: ChartDensityPreference;
  /** Accent palette override. @default "auto" */
  accent?: ChartAccentPreference;
  /**
   * Faz 21.11 PR-A2b-a11y — anomaly summary list. The wrapper forwards
   * the consumer-provided summary to `ChartA11yShell` so screen
   * readers receive a polite, debounced outlier announcement. No
   * built-in 3D detector ships with this PR; consumers should pair
   * with their own Mahalanobis-style detector or wait for the
   * batch3 contract evolution (Codex thread `019e10a5`) which adds
   * `kind?: '3d'` discriminator to `AnomalySummary`.
   */
  anomalySummary?: AnomalySummary[];
  /**
   * Optional override of the anomaly announcement template.
   * Forwarded to `ChartAriaLive.formatAnomalyAnnouncement`.
   */
  formatAnomalyAnnouncement?: AnomalyAnnouncementFormatter;
  /**
   * Native ECharts `viewControl` override (camera position, auto-rotate,
   * etc.). Accepted as a passthrough — wrapper does not pre-process it.
   * @see https://echarts.apache.org/en/option-gl.html#globe.viewControl
   */
  viewControl?: Record<string, unknown>;
  /**
   * Native ECharts `grid3D` override (axis ticks, label colours,
   * environment lighting). Passthrough — wrapper merges it into the
   * default grid3D base shape.
   */
  grid3D?: Record<string, unknown>;
  /**
   * Native ECharts `light` override (main / ambient / direction).
   * Passthrough — wrapper merges it into the default light base shape.
   */
  light?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const Scatter3DInner = React.forwardRef<
  HTMLDivElement,
  Omit<Scatter3DProps, 'access' | 'accessReason'>
>(function Scatter3DInner(
  {
    data,
    size = 'md',
    valueFormatter,
    animate = true,
    title,
    description,
    className,
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

  // Lazy-load `echarts-gl` + WebGL capability gate. While `status !==
  // 'ready'` we deliberately skip the option memo so ECharts never
  // tries to render an unknown `'scatter3D'` series type.
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
    const seriesData = data.map((p) => {
      const v = p.value ?? p.z;
      const item: Record<string, unknown> = {
        // ECharts scatter3D `data` items: [x, y, z, value, ...]
        value: [p.x, p.y, p.z, v],
      };
      if (p.label !== undefined) item.name = p.label;
      if (p.color !== undefined) item.itemStyle = { color: p.color };
      if (p.size !== undefined) item.symbolSize = p.size;
      return item;
    });

    // Compute z-range for the visualMap so the colour scale stays
    // tight around the actual data (otherwise ECharts widens to
    // [0, 1] which makes constant-z datasets render as a flat tone).
    const values = data.map((p) => p.value ?? p.z);
    const min = Math.min(...values);
    const max = Math.max(...values);

    return {
      tooltip: {
        formatter: (params: { value?: number[]; name?: string }) => {
          const [x, y, z, v] = params.value ?? [];
          const labelLine = params.name ? `<b>${escapeHtml(params.name)}</b><br/>` : '';
          return `${labelLine}x: ${escapeHtml(String(x))}<br/>y: ${escapeHtml(String(y))}<br/>z: ${escapeHtml(String(z))}<br/>value: ${escapeHtml(fmt(v ?? 0))}`;
        },
      },
      visualMap: {
        show: false,
        dimension: 3,
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
          type: 'scatter3D',
          data: seriesData,
          symbolSize: 8,
        },
      ],
    } as EChartsOption;
  }, [data, isEmpty, glReady, effectivePalette, fmt, viewControl, grid3D, light, animate]);

  const handleClick = useCallback(
    (params: unknown) => {
      if (!onDataPointClick) return;
      const p = params as { value?: number[]; name?: string; dataIndex?: number };
      const [x, y, z, v] = p.value ?? [];
      const point = data[p.dataIndex ?? -1];
      // Canonical `ChartClickEvent` shape: { datum, value?, label? }
      // Codex thread `019e10ab` iter-2 caught the original payload's
      // top-level `chartType`/`seriesIndex`/`dataIndex` fields which
      // are NOT in the `ChartClickEvent` type — they belonged on
      // `datum`. Cross-filter wrapper reads from `datum` exclusively.
      onDataPointClick({
        datum: {
          x,
          y,
          z,
          value: v ?? 0,
          label: point?.label,
          dataIndex: p.dataIndex ?? -1,
          chartType: 'scatter3d',
          seriesName: 'Scatter3D',
        },
        value: v ?? 0,
        label: point?.label,
      });
    },
    [onDataPointClick, data],
  );

  const { containerRef, instance } = useEChartsRenderer({
    option,
    theme: themeObject,
    onClick: onDataPointClick ? handleClick : undefined,
  });

  // a11y data: each row "(x=…, y=…, z=…)" → value. Capped at 1000
  // rows because Scatter3D targets the 100K soft / 1M hard tier — a
  // hidden table with that many <tr>s would defeat the WebGL claim
  // (DOM teardown cost). Codex iter-2 flagged the unbounded shell
  // table risk; the cap keeps SR navigation tractable while still
  // exposing a representative sample. The chart title prefix tells
  // SR users when sampling is in effect.
  const A11Y_TABLE_CAP = 1000;
  const a11yData = useMemo(
    () =>
      data.slice(0, A11Y_TABLE_CAP).map((p, i) => ({
        label: p.label ?? `Point ${i + 1} (x=${p.x}, y=${p.y}, z=${p.z})`,
        value: p.value ?? p.z,
      })),
    [data],
  );
  const a11yTitle = useMemo(() => {
    if (data.length <= A11Y_TABLE_CAP) return title;
    const sampleNote = `(showing first ${A11Y_TABLE_CAP} of ${data.length} points)`;
    return title ? `${title} ${sampleNote}` : sampleNote;
  }, [title, data.length]);
  const a11y = useChartA11y({
    chartType: 'scatter3d',
    data: a11yData,
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

  /* ---- empty / unsupported states ---- */
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
        data-testid="scatter3d-chart-empty"
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
        data-testid="scatter3d-chart-unsupported"
        data-reason={gl.reason ?? 'webgl-unavailable'}
        {...rest}
      >
        3D rendering requires WebGL, which is not available in this environment.
      </div>
    );
  }

  if (gl.status !== 'ready') {
    // Loading state — chart canvas is reserved but the GL chunk is
    // still in flight. Once `ready` flips, the option memo recomputes
    // and the canvas mounts.
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
        data-testid="scatter3d-chart-loading"
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
      testId="scatter3d-chart"
      setRefs={setRefs}
      anomalySummary={anomalySummary}
      formatAnomalyAnnouncement={formatAnomalyAnnouncement}
      {...rest}
    />
  );
});

Scatter3DInner.displayName = 'Scatter3DInner';

/**
 * Scatter3D — public wrapper. Accepts `access` + `accessReason`
 * (`AccessControlledProps`) and forwards everything else to
 * `Scatter3DInner`. Faz 21.4 PR-E2 wiring; default `access === undefined`
 * follows the identity-transform path through `ChartAccessGate`.
 */
export const Scatter3D = React.forwardRef<HTMLDivElement, Scatter3DProps>(function Scatter3D(
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
      <Scatter3DInner
        ref={ref}
        {...rest}
        onDataPointClick={guardChartCallback(state, onDataPointClick)}
        onMarkupClick={guardChartCallback(state, onMarkupClick)}
        // P1a: anomaly summary + formatter forwarded through unchanged
        // — these aren't user-facing callbacks the access gate would block.
        anomalySummary={anomalySummary}
        formatAnomalyAnnouncement={formatAnomalyAnnouncement}
      />
    </ChartAccessGate>
  );
});
Scatter3D.displayName = 'Scatter3D';

export default Scatter3D;
