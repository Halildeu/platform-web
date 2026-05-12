'use client';

/**
 * Globe — Faz 21.11 P1c (3D Extension Pack — geo sphere with layers).
 *
 * Renders an ECharts `globe` component (a 3D sphere) with one or
 * more `coordinateSystem: 'globe'` series layers (scatter3D /
 * lines3D / bar3D). The wrapper gates its render on
 * `useRequiredEChartsGL` so a host without WebGL surfaces a
 * graceful unsupported state.
 *
 * Codex thread `019e10f8` iter-1 absorbed:
 *   - Public data API is `layers: GlobeLayer[]` ONLY. No convenience
 *     `points?` / `lines?` / `bars?` top-level props (would create
 *     ordering/precedence ambiguity with the layer-aware click /
 *     a11y contract).
 *   - No default `baseTexture`. Wrapper does not bundle world
 *     textures or HDR environments — consumer supplies URLs / canvases.
 *   - No wrapper-owned `echarts.registerMap('world', ...)` call.
 *     `regions[]` is passthrough; named country styling needs
 *     consumer-side map data registration.
 *   - `displacementScale` is only emitted when `heightTexture` is set
 *     (no-op otherwise).
 *   - A11y data table goes through `sampleGlobeLayersA11y` (layer-
 *     aware: scatter/bar `(lon=…, lat=…)`, lines `from → to`).
 *   - Click payload routes everything through `datum.{layerIndex,
 *     layerType, lon, lat, ...}`; top-level `value` only when a real
 *     numeric metric exists.
 *   - `markups` accepted but NO-OP on Globe.
 *
 * @see Scatter3D / Surface3D / Lines3D — peers using the same
 *   lifecycle helper.
 */
import React, { useCallback, useMemo, useRef } from 'react';
import type { AccessControlledProps } from '@mfe/shared-types';
import { resolveAccessState } from '@mfe/shared-types';
import { cn } from './utils/cn';
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
import {
  sampleGlobeLayersA11y,
  buildSampledCaption,
  type GlobeSamplerLayer,
} from './a11y/sampling';
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

/** Single point datum on a Globe scatter or bar layer. */
export interface GlobeScatterDatum {
  /** Longitude (-180 to 180). */
  lon: number;
  /** Latitude (-90 to 90). */
  lat: number;
  /** Optional metric (visualMap dimension; tooltip + a11y row). */
  value?: number;
  /** Optional display label. */
  label?: string;
  /** Optional per-point colour override. */
  color?: string;
  /** Optional per-point symbol size (scatter) or bar height (bar). */
  size?: number;
}

/** Single arc / great-circle path on a Globe lines layer. */
export interface GlobeLineDatum {
  /** Origin `[lon, lat]`. */
  from: readonly [number, number];
  /** Destination `[lon, lat]`. */
  to: readonly [number, number];
  /** Optional metric (tooltip + a11y row). */
  value?: number;
  /** Optional display label (e.g. flight code). */
  label?: string;
  /** Optional pre-resolved endpoint city / station name. */
  fromLabel?: string;
  /** Optional pre-resolved endpoint city / station name. */
  toLabel?: string;
  /** Optional per-line colour override. */
  color?: string;
}

/** Discriminated union for Globe layer entries. */
export type GlobeLayer =
  | {
      id?: string;
      name?: string;
      type: 'scatter3D';
      data: GlobeScatterDatum[];
      symbolSize?: number;
    }
  | {
      id?: string;
      name?: string;
      type: 'bar3D';
      data: GlobeScatterDatum[];
      barSize?: number;
    }
  | {
      id?: string;
      name?: string;
      type: 'lines3D';
      data: GlobeLineDatum[];
      lineWidth?: number;
    };

/** Country / region style override (passthrough). */
export interface GlobeRegion {
  name: string;
  itemStyle?: { color?: string; opacity?: number };
}

export interface GlobeProps extends AccessControlledProps {
  /** Multi-layer geo data (required). At least one non-empty layer to render. */
  layers: GlobeLayer[];
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
  /**
   * Globe surface texture URL or canvas. Wrapper has NO default —
   * consumer supplies. Codex thread `019e10f8` iter-1/iter-2: the
   * wrapper must not bundle world map / HDR assets. Type widened
   * to accept HTMLCanvasElement so consumers can render their own
   * texture (e.g. dynamically composed map) without round-tripping
   * through a data URL.
   */
  baseTexture?: string | HTMLCanvasElement;
  /** Optional terrain elevation texture (URL or canvas). */
  heightTexture?: string | HTMLCanvasElement;
  /**
   * Terrain displacement multiplier (only effective when
   * `heightTexture` is set; the helper omits the option otherwise).
   */
  displacementScale?: number;
  /** Optional environment / panorama URL (HDR). */
  environment?: string;
  /**
   * Country region styling (passthrough). Named country rendering
   * requires consumer-side `echarts.registerMap('world', geoJson)` —
   * the wrapper does NOT register maps to avoid global mutable state.
   */
  regions?: GlobeRegion[];
  /** Callback fired when a data point is clicked. */
  onDataPointClick?: (event: ChartClickEvent) => void;
  /** Visual overlay markups — accepted but NO-OP on Globe. */
  markups?: ChartMarkup[];
  /** Callback fired when a markup overlay is clicked (no-op on Globe). */
  onMarkupClick?: (event: ChartMarkupClickEvent) => void;
  /** Theme override. @default "auto" */
  theme?: ChartThemePreference;
  /** Decal pattern override. @default "auto" */
  decal?: ChartDecalPreference;
  /** Density override. @default "auto" */
  density?: ChartDensityPreference;
  /** Accent palette override. @default "auto" */
  accent?: ChartAccentPreference;
  /** Anomaly summary forward (consumer-provided). */
  anomalySummary?: AnomalySummary[];
  /** Optional override of the anomaly announcement template. */
  formatAnomalyAnnouncement?: AnomalyAnnouncementFormatter;
  /** Native ECharts `viewControl` passthrough (camera / auto-rotate). */
  viewControl?: Record<string, unknown>;
  /** Native ECharts `light` passthrough. */
  light?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/*  Pure option builder (Codex thread 019e10f8 iter-1 extraction)      */
/* ------------------------------------------------------------------ */

export interface BuildGlobeOptionInput {
  layers: GlobeLayer[];
  palette: readonly string[];
  fmt: (value: number) => string;
  animate: boolean;
  // Codex thread `019e10f8` iter-3: helper input must mirror
  // `GlobeProps.baseTexture` / `heightTexture` (string | canvas)
  // so typecheck doesn't fail at the wrapper call site.
  baseTexture?: string | HTMLCanvasElement;
  heightTexture?: string | HTMLCanvasElement;
  displacementScale?: number;
  environment?: string;
  regions?: GlobeRegion[];
  viewControl?: Record<string, unknown>;
  light?: Record<string, unknown>;
}

export function buildGlobeOption(input: BuildGlobeOptionInput): EChartsOption {
  const {
    layers,
    palette,
    fmt,
    animate,
    baseTexture,
    heightTexture,
    displacementScale,
    environment,
    regions,
    viewControl,
    light,
  } = input;

  // Build globe component config. `displacementScale` only emitted
  // when `heightTexture` is set (Codex iter-1: no standalone effect).
  const globeOption: Record<string, unknown> = {
    viewControl: viewControl ?? { autoRotate: false, distance: 200 },
    light: light ?? {
      main: { intensity: 1.2, shadow: false },
      ambient: { intensity: 0.3 },
    },
  };
  if (baseTexture !== undefined) globeOption.baseTexture = baseTexture;
  if (heightTexture !== undefined) {
    globeOption.heightTexture = heightTexture;
    if (displacementScale !== undefined) globeOption.displacementScale = displacementScale;
  }
  if (environment !== undefined) globeOption.environment = environment;
  if (regions !== undefined) globeOption.regions = regions;

  // Per-layer series. `coordinateSystem: 'globe'` is enforced by the
  // wrapper — consumer cannot override it (would break the geo
  // semantic and ECharts would refuse to render).
  //
  // Codex thread `019e10f8` iter-2/iter-3 hardening:
  //   - `numericSeriesIndexes` tracks layers that actually
  //     contribute a `value` field, so visualMap can scope itself
  //     to those series only (mixed globe must NOT spill the colour
  //     ramp onto lines / value-less bar series).
  //   - lines3D option items carry only `coords` / optional
  //     `lineStyle` / optional `name`. Tooltip + click resolve full
  //     metadata via `layers[sIdx].data[dataIndex]` directly (the
  //     earlier `__source` echo was dropped — iter-3 cleanup).
  let valueMin = Number.POSITIVE_INFINITY;
  let valueMax = Number.NEGATIVE_INFINITY;
  const numericSeriesIndexes: number[] = [];

  const series = layers.map((layer, i) => {
    const baseColor = palette[i % Math.max(1, palette.length)];
    const layerName = layer.name ?? `Layer ${i + 1}`;
    if (layer.type === 'scatter3D') {
      // ECharts globe scatter3D `data` items: [lon, lat, value, ...]
      let layerHasValue = false;
      const data = layer.data.map((d) => {
        const v = d.value ?? 0;
        if (d.value !== undefined) {
          if (v < valueMin) valueMin = v;
          if (v > valueMax) valueMax = v;
          layerHasValue = true;
        }
        const item: Record<string, unknown> = { value: [d.lon, d.lat, v] };
        if (d.label !== undefined) item.name = d.label;
        if (d.color !== undefined) item.itemStyle = { color: d.color };
        if (d.size !== undefined) item.symbolSize = d.size;
        return item;
      });
      if (layerHasValue) numericSeriesIndexes.push(i);
      return {
        name: layerName,
        type: 'scatter3D',
        coordinateSystem: 'globe',
        data,
        symbolSize: layer.symbolSize ?? 8,
        itemStyle: { color: baseColor },
      };
    }
    if (layer.type === 'bar3D') {
      let layerHasValue = false;
      const data = layer.data.map((d) => {
        const v = d.value ?? 0;
        if (d.value !== undefined) {
          if (v < valueMin) valueMin = v;
          if (v > valueMax) valueMax = v;
          layerHasValue = true;
        }
        const item: Record<string, unknown> = { value: [d.lon, d.lat, v] };
        if (d.label !== undefined) item.name = d.label;
        if (d.color !== undefined) item.itemStyle = { color: d.color };
        return item;
      });
      if (layerHasValue) numericSeriesIndexes.push(i);
      return {
        name: layerName,
        type: 'bar3D',
        coordinateSystem: 'globe',
        data,
        barSize: layer.barSize ?? 1,
        itemStyle: { color: baseColor },
      };
    }
    // lines3D layer — Codex iter-3 cleanup: lines option items
    // carry only `coords`, optional `lineStyle`, and `name`. Tooltip
    // and click resolve full metadata (label/value/from/to/
    // fromLabel/toLabel) via `layers[sIdx].data[dataIndex]` directly,
    // not via an echoed `__source` field on the option payload.
    const data = layer.data.map((d) => {
      const item: Record<string, unknown> = {
        coords: [
          [d.from[0], d.from[1]],
          [d.to[0], d.to[1]],
        ],
      };
      if (d.color !== undefined) item.lineStyle = { color: d.color };
      if (d.label !== undefined) item.name = d.label;
      return item;
    });
    return {
      name: layerName,
      type: 'lines3D',
      coordinateSystem: 'globe',
      data,
      lineStyle: { color: baseColor, width: layer.lineWidth ?? 1 },
    };
  });

  // visualMap only when at least one numeric scatter / bar layer
  // contributes values — lines-only globe should NOT show a colour
  // scale (Codex iter-1). Scoped via `seriesIndex` so mixed globes
  // don't apply the colour ramp to non-numeric layers (Codex iter-2).
  const visualMap =
    numericSeriesIndexes.length > 0
      ? {
          show: false,
          // Geo data tuples are [lon, lat, value]; dimension 2 = value.
          dimension: 2,
          min: Number.isFinite(valueMin) ? valueMin : 0,
          max: Number.isFinite(valueMax) ? valueMax : 1,
          seriesIndex: numericSeriesIndexes,
          inRange: { color: [palette[0], palette[palette.length - 1] ?? palette[0]] },
        }
      : undefined;

  const option: Record<string, unknown> = {
    globe: globeOption,
    tooltip: {
      formatter: (params: {
        value?: number[];
        name?: string;
        seriesIndex?: number;
        dataIndex?: number;
      }) => {
        const sIdx = params.seriesIndex ?? 0;
        const layer = layers[sIdx];
        const layerName = escapeHtml(layer?.name ?? `Layer ${sIdx + 1}`);
        // Codex iter-2: lines3D should resolve from the source datum
        // so the tooltip shows `from → to` (with optional labels)
        // instead of `lon: undefined / lat: undefined / value: 0`.
        if (layer && layer.type === 'lines3D') {
          const src = layer.data[params.dataIndex ?? -1];
          if (src) {
            const fromTxt = escapeHtml(src.fromLabel ?? `(lon=${src.from[0]}, lat=${src.from[1]})`);
            const toTxt = escapeHtml(src.toLabel ?? `(lon=${src.to[0]}, lat=${src.to[1]})`);
            const labelLine = src.label ? `<b>${escapeHtml(src.label)}</b><br/>` : '';
            const valueLine =
              src.value !== undefined ? `<br/>value: ${escapeHtml(fmt(src.value))}` : '';
            return `${labelLine}<i>${layerName}</i><br/>${fromTxt} → ${toTxt}${valueLine}`;
          }
        }
        const [a, b, c] = params.value ?? [];
        const labelLine = params.name ? `<b>${escapeHtml(params.name)}</b><br/>` : '';
        return `${labelLine}<i>${layerName}</i><br/>lon: ${escapeHtml(String(a))}<br/>lat: ${escapeHtml(String(b))}<br/>value: ${escapeHtml(fmt(c ?? 0))}`;
      },
    },
    animation: animate,
    series,
  };
  if (visualMap !== undefined) option.visualMap = visualMap;
  return option as EChartsOption;
}

/* ------------------------------------------------------------------ */
/*  Pure click-event factory (Codex thread 019e10f8 iter-4 extraction) */
/* ------------------------------------------------------------------ */

/**
 * Raw ECharts click params subset that {@link buildGlobeClickEvent}
 * cares about. ECharts ships a much wider type — narrowed here so
 * the helper can be unit-tested with synthetic input.
 */
export interface GlobeRawClickParams {
  value?: number[];
  name?: string;
  seriesIndex?: number;
  dataIndex?: number;
}

/**
 * Build the canonical `ChartClickEvent` payload for a Globe layer
 * click. Pure function: derives lon / lat / value / metadata from
 * the consumer-supplied `layers[seriesIndex].data[dataIndex]` —
 * source-of-truth (Codex thread `019e10f8` iter-2). Returns `null`
 * when the params reference an unknown layer OR an out-of-bounds
 * `dataIndex` (defensive guard; ECharts shouldn't dispatch one but
 * the wrapper accepts `params: unknown`).
 *
 * Lifted out of `GlobeInner.handleClick` (Codex iter-4) so the click
 * payload contract can be unit-tested without React mount + jsdom
 * mock cycle races.
 */
export function buildGlobeClickEvent(
  layers: GlobeLayer[],
  params: GlobeRawClickParams,
): ChartClickEvent | null {
  const sIdx = params.seriesIndex ?? 0;
  const layer = layers[sIdx];
  if (!layer) return null;
  const dataIndex = params.dataIndex ?? -1;
  // Codex iter-5 nit: also null-guard on missing data row so the
  // helper docstring's "unknown layer / dataIndex" claim holds.
  if (dataIndex < 0 || dataIndex >= layer.data.length) return null;

  let sourceValue: number | undefined;
  let sourceLabel: string | undefined;
  let lon: number | undefined;
  let lat: number | undefined;
  let extra: Record<string, unknown> = {};
  if (layer.type === 'lines3D') {
    const src = layer.data[dataIndex];
    if (src) {
      lon = src.from[0];
      lat = src.from[1];
      sourceValue = src.value;
      sourceLabel = src.label;
      extra = {
        from: src.from,
        to: src.to,
        fromLabel: src.fromLabel,
        toLabel: src.toLabel,
      };
    }
  } else {
    const src = (layer as { data: GlobeScatterDatum[] }).data[dataIndex];
    if (src) {
      lon = src.lon;
      lat = src.lat;
      sourceValue = src.value;
      sourceLabel = src.label;
    }
  }
  const hasNumericMetric = typeof sourceValue === 'number' && Number.isFinite(sourceValue);
  return {
    datum: {
      chartType: 'globe',
      layerId: layer.id,
      layerName: layer.name ?? `Layer ${sIdx + 1}`,
      layerIndex: sIdx,
      layerType: layer.type,
      dataIndex,
      lon,
      lat,
      value: hasNumericMetric ? sourceValue : undefined,
      label: sourceLabel ?? params.name,
      ...extra,
    },
    seriesId: layer.id,
    ...(hasNumericMetric ? { value: sourceValue } : {}),
    label: sourceLabel ?? params.name,
  };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const GlobeInner = React.forwardRef<HTMLDivElement, Omit<GlobeProps, 'access' | 'accessReason'>>(
  function GlobeInner(
    {
      layers,
      size = 'md',
      valueFormatter,
      animate = true,
      title,
      description,
      className,
      baseTexture,
      heightTexture,
      displacementScale,
      environment,
      regions,
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
      light,
      ...rest
    },
    forwardedRef,
  ) {
    const height = CHART_CANVAS_HEIGHT[size];
    // Codex iter-1 P1c: empty derivation includes total layer-data
    // count, mirroring the Lines3D fix.
    const totalData = useMemo(
      () => (layers ?? []).reduce((acc, l) => acc + l.data.length, 0),
      [layers],
    );
    const isEmpty = !layers || layers.length === 0 || totalData === 0;
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
      return buildGlobeOption({
        layers,
        palette,
        fmt,
        animate,
        baseTexture,
        heightTexture,
        displacementScale,
        environment,
        regions,
        viewControl,
        light,
      });
    }, [
      layers,
      isEmpty,
      glReady,
      effectivePalette,
      fmt,
      animate,
      baseTexture,
      heightTexture,
      displacementScale,
      environment,
      regions,
      viewControl,
      light,
    ]);

    const handleClick = useCallback(
      (params: unknown) => {
        if (!onDataPointClick) return;
        // Codex iter-4: delegate to the pure factory so the wrapper
        // stays tiny and the unit test can lock the contract without
        // React mount or jsdom mock races.
        const event = buildGlobeClickEvent(layers, params as GlobeRawClickParams);
        if (event) onDataPointClick(event);
      },
      [onDataPointClick, layers],
    );

    const { containerRef, instance } = useEChartsRenderer({
      option: option ?? ({} as EChartsOption),
      theme: themeObject,
      onClick: onDataPointClick ? handleClick : undefined,
    });

    // Layer-aware sample for the hidden a11y data table. Cap shared
    // across all layers to keep the table tractable.
    const a11ySamplerInput: GlobeSamplerLayer[] = useMemo(
      () =>
        (layers ?? []).map((l) => {
          if (l.type === 'lines3D') {
            return {
              type: 'lines3D' as const,
              name: l.name,
              data: l.data.map((d) => ({
                from: d.from,
                to: d.to,
                value: d.value,
                label: d.label,
                fromLabel: d.fromLabel,
                toLabel: d.toLabel,
              })),
            };
          }
          return {
            type: l.type,
            name: l.name,
            data: l.data.map((d) => ({ lon: d.lon, lat: d.lat, value: d.value, label: d.label })),
          };
        }),
      [layers],
    );
    const a11ySample = useMemo(
      () =>
        isEmpty
          ? { samples: [], sourceCount: 0, sampledCount: 0 }
          : sampleGlobeLayersA11y(a11ySamplerInput, 1000),
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
      chartType: 'globe',
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
          data-testid="globe-chart-empty"
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
          data-testid="globe-chart-unsupported"
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
          data-testid="globe-chart-loading"
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
        testId="globe-chart"
        setRefs={setRefs}
        anomalySummary={anomalySummary}
        formatAnomalyAnnouncement={formatAnomalyAnnouncement}
        {...rest}
      />
    );
  },
);

GlobeInner.displayName = 'GlobeInner';

/**
 * Globe — public wrapper. Accepts `access` + `accessReason`
 * (`AccessControlledProps`) and forwards everything else to
 * `GlobeInner`. Faz 21.4 PR-E2 wiring.
 */
export const Globe = React.forwardRef<HTMLDivElement, GlobeProps>(function Globe(
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
      <GlobeInner
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
Globe.displayName = 'Globe';

export default Globe;
