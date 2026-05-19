/**
 * Pure ECharts series builder for `GeoOverlay[]`.
 *
 * Test seam: lifted out of `GeoMap.tsx` so option-shape tests can
 * assert builder output without React mount + ECharts canvas
 * lifecycle. Mirrors the `buildScatter3DOption` / `buildSurface3DOption`
 * pattern from the 3D Extension Pack (Codex thread `019e10ab`
 * iter-4 disipline).
 *
 * Layer types shipped (PR-X13 campaign closed):
 *   - PR-X13a (Codex `019e2254`): `'bubble'` — scatter on
 *     `coordinateSystem: 'geo'`, sqrt-scaled symbolSize.
 *   - PR-X13b (Codex `019e25a2`): `'effectScatter'` — animated pulse
 *     for highlighted lokasyonlar. Reduced-motion via
 *     `rippleEffect.number = 0`.
 *   - PR-X13c (Codex `019e25d4`): `'flow'` — origin-destination
 *     `lines` with linear width scale (sqrt opt-in). Reduced-motion
 *     via `effect.show: false`.
 *   - PR-X13d (Codex `019e25ee`): `'heatmap'` — density blobs on geo
 *     coord system. Emits a dedicated visualMap entry pinned to the
 *     overlay series (`dimension: 2`). VisualMap helper exported for
 *     wrapper integration (`buildGeoOverlayVisualMaps`).
 *   - PR-X13e (Codex `019e2614`): `'marker'` — declarative SVG/icon
 *     markers via `scatter` + curated symbol whitelist + `path://`
 *     SVG strings. External image URLs (`image://`, `http(s)://`,
 *     `data:`) rejected at runtime via `safeGeoMarkerSymbol`.
 */
import type {
  GeoOverlay,
  GeoBubbleLayer,
  GeoEffectScatterLayer,
  GeoFlowLayer,
  GeoFlowDatum,
  GeoHeatmapLayer,
  GeoHeatmapDatum,
  GeoMarkerLayer,
  GeoMarkerDatum,
  GeoMarkerSymbol,
  GeoPointDatum,
} from './geoOverlayTypes';
import { resolveCssVarColor, resolveCssVarColors } from '../utils/resolveCssVarColor';

/* ------------------------------------------------------------------ */
/*  Output type                                                        */
/* ------------------------------------------------------------------ */

/**
 * One ECharts series spec emitted per overlay layer. The wrapper
 * spreads these into `option.series` after the base choropleth series.
 *
 * `Record<string, unknown>` keeps the type loose — option-shape tests
 * read specific keys; the actual ECharts schema is too dynamic to
 * pin in a strict TS type without sacrificing maintenance overhead.
 */
export type GeoOverlaySeriesSpec = Record<string, unknown>;

/* ------------------------------------------------------------------ */
/*  CSS-var color normalization (single entry point)                  */
/* ------------------------------------------------------------------ */

/**
 * Resolve every consumer-supplied `var(--token)` color in an overlay tree
 * BEFORE the colors reach an ECharts color field. The geo canvas renderer
 * cannot read CSS custom properties — an un-normalized `var(--…)` would
 * render as an undifferentiated dark fallback with no console error.
 *
 * Covers every consumer color surface across all five overlay layer types:
 *   - `layer.color` (bubble / effectScatter / flow / marker per-layer override)
 *   - `layer.colors` (heatmap density ramp — array)
 *   - per-datum `.color` (`GeoPointDatum`, `GeoFlowDatum`, `GeoMarkerDatum`)
 *
 * Non-mutating: every layer and datum is shallow-cloned, so the consumer's
 * input array is never touched. Called once at the GeoMap entry and the
 * result is fed to BOTH `buildGeoOverlaySeries` and
 * `buildGeoOverlayVisualMaps`, so neither helper has to re-normalize.
 *
 * @param overlays Overlay array (may be undefined/empty → returned as-is).
 */
export function normalizeGeoOverlayColors(
  overlays: GeoOverlay[] | undefined,
): GeoOverlay[] | undefined {
  if (!overlays || overlays.length === 0) return overlays;
  return overlays.map((layer): GeoOverlay => {
    switch (layer.type) {
      case 'bubble':
      case 'effectScatter':
        return {
          ...layer,
          color: resolveCssVarColor(layer.color),
          data: layer.data.map((d) => ({ ...d, color: resolveCssVarColor(d.color) })),
        };
      case 'flow':
        return {
          ...layer,
          color: resolveCssVarColor(layer.color),
          data: layer.data.map((d) => ({ ...d, color: resolveCssVarColor(d.color) })),
        };
      case 'marker':
        return {
          ...layer,
          color: resolveCssVarColor(layer.color),
          data: layer.data.map((d) => ({ ...d, color: resolveCssVarColor(d.color) })),
        };
      case 'heatmap':
        // Heatmap datums carry no per-point `color`; only the layer-level
        // `colors` density ramp is consumer-supplied.
        return { ...layer, colors: resolveCssVarColors(layer.colors) };
      default: {
        const _exhaustive: never = layer;
        return _exhaustive;
      }
    }
  });
}

/* ------------------------------------------------------------------ */
/*  Bubble (scatter on geo) — value → symbolSize scale                */
/* ------------------------------------------------------------------ */

/**
 * Clamped sqrt scale: maps `value ∈ [minValue, maxValue]` to
 * `symbolSize ∈ [minSize, maxSize]`. Sqrt is the canonical perceptual
 * scale for bubble maps — area is proportional to the metric so the
 * visual footprint matches human perception (linear radius would
 * exaggerate large values quadratically).
 *
 * Edge cases:
 *   - all values equal → returns midpoint of [minSize, maxSize]
 *   - value < minValue (off-scale low) → returns minSize
 *   - value > maxValue (off-scale high) → returns maxSize
 *   - non-finite value → returns minSize (defensive default)
 */
function bubbleSymbolSize(
  value: number,
  minValue: number,
  maxValue: number,
  minSize: number,
  maxSize: number,
): number {
  // Codex 019e25a2 iter-1 must-fix #4: defensive non-negative floor.
  // Sqrt of a negative is NaN — so any negative value or negative
  // input range would corrupt the scale. The bubble metric domain is
  // semantically non-negative (count, magnitude, intensity) so floor
  // at 0; consumers passing negatives get treated as 0 (smallest
  // bubble) rather than rendering invalid sizes.
  if (Number.isNaN(value)) return minSize;
  const safeValue = value < 0 ? 0 : value;
  const safeMin = minValue < 0 ? 0 : minValue;
  const safeMax = maxValue < 0 ? 0 : maxValue;
  if (safeMax === safeMin) return (minSize + maxSize) / 2;
  const clamped = Math.max(safeMin, Math.min(safeMax, safeValue));
  // Sqrt scale: area ~ value
  const sqrtMin = Math.sqrt(safeMin);
  const sqrtMax = Math.sqrt(safeMax);
  const sqrtVal = Math.sqrt(clamped);
  const t = (sqrtVal - sqrtMin) / (sqrtMax - sqrtMin);
  return minSize + t * (maxSize - minSize);
}

/**
 * Build a single bubble layer spec.
 *
 * Wrapper passes the layer + the geo coordinate system index (from
 * `option.geo` array — usually 0 because GeoMap registers a single
 * geo coord system).
 */
export function buildBubbleLayerSeries(
  layer: GeoBubbleLayer,
  geoIndex: number,
): GeoOverlaySeriesSpec {
  const data = layer.data ?? [];
  const numericValues = data.map((d) => d.value).filter((v): v is number => Number.isFinite(v));
  const minValue = numericValues.length > 0 ? Math.min(...numericValues) : 0;
  const maxValue = numericValues.length > 0 ? Math.max(...numericValues) : 1;
  const minSize = layer.minSymbolSize ?? 8;
  const maxSize = layer.maxSymbolSize ?? 60;

  const seriesData = data.map((d: GeoPointDatum) => ({
    // ECharts geo scatter expects `[lng, lat, ...payload]`. Trailing
    // payload keys (name, value) are read back via `params.data` in
    // the click handler / tooltip formatter.
    value: [d.coordinates[0], d.coordinates[1], d.value ?? 0],
    name: d.name,
    itemStyle: d.color ? { color: d.color } : undefined,
    // Codex 019e25a2 iter-1 must-fix #11: namespaced overlay metadata
    // so the click handler / tooltip / a11y can discriminate overlay
    // datums from base map datums and emit a stable canonical payload.
    // Single underscore-prefixed object keeps ECharts datum schema
    // clean while giving wrapper code a typed surface.
    _overlay: {
      type: layer.type as 'bubble',
      layerName: layer.name ?? 'Bubble overlay',
      coordinates: d.coordinates,
      value: d.value,
      category: d.category,
    },
  }));

  return {
    type: 'scatter',
    coordinateSystem: 'geo',
    geoIndex,
    name: layer.name ?? 'Bubble overlay',
    data: seriesData,
    symbol: layer.symbol ?? 'circle',
    symbolSize: (val: number[] | number): number => {
      // ECharts passes raw datum (`value` array). Index 2 is the metric.
      const v = Array.isArray(val) ? Number(val[2] ?? 0) : Number(val);
      return bubbleSymbolSize(v, minValue, maxValue, minSize, maxSize);
    },
    itemStyle: {
      color: layer.color,
      opacity: layer.opacity ?? 0.7,
    },
    label: layer.showLabels
      ? {
          show: true,
          position: 'right',
          formatter: '{b}',
          fontSize: 11,
        }
      : { show: false },
    emphasis: {
      focus: 'self',
      label: { show: true, fontWeight: 'bold' },
      itemStyle: { opacity: 1 },
    },
    z: layer.z ?? 5,
  };
}

/* ------------------------------------------------------------------ */
/*  EffectScatter (animated pulse on geo) — PR-X13b                    */
/* ------------------------------------------------------------------ */

/**
 * Build an effectScatter layer spec.
 *
 * Unlike bubble, effectScatter uses a constant `symbolSize` (not
 * value-driven) — the pulse animation IS the encoding. Layered on top
 * of choropleth, it draws the eye to a small set of priority points.
 * Wrapper stays declarative; ECharts owns the animation lifecycle.
 *
 * Reduced-motion: when `respectReducedMotion: true`, the wrapper
 * short-circuits to a plain scatter (effect skipped) so users with
 * `prefers-reduced-motion: reduce` aren't subjected to the pulse.
 */
export function buildEffectScatterLayerSeries(
  layer: GeoEffectScatterLayer,
  geoIndex: number,
): GeoOverlaySeriesSpec {
  const data = layer.data ?? [];
  const seriesData = data.map((d: GeoPointDatum) => ({
    value: [d.coordinates[0], d.coordinates[1], d.value ?? 0],
    name: d.name,
    itemStyle: d.color ? { color: d.color } : undefined,
    // Same `_overlay` namespace as bubble — click handler / tooltip
    // / a11y all key on `data._overlay.type` to discriminate.
    _overlay: {
      type: layer.type as 'effectScatter',
      layerName: layer.name ?? 'EffectScatter overlay',
      coordinates: d.coordinates,
      value: d.value,
      category: d.category,
    },
  }));

  // Reduced-motion: keep the `effectScatter` type so callers see
  // consistent option shape, but emit zero ripple paths via
  // `rippleEffect.number = 0`. Codex 019e25a2 iter-1 medium-fix:
  // ECharts `EffectSymbol.startEffectAnimation` has no `period > 0`
  // guard (unlike `EffectLine`), so `period: 0` would still construct
  // a zero-duration animator/path loop. `number: 0` suppresses ripple
  // emission entirely while leaving period/scale in valid ranges.
  const reduced = layer.respectReducedMotion === true;

  return {
    type: 'effectScatter',
    coordinateSystem: 'geo',
    geoIndex,
    name: layer.name ?? 'EffectScatter overlay',
    data: seriesData,
    symbol: layer.symbol ?? 'pin',
    symbolSize: layer.symbolSize ?? 14,
    rippleEffect: reduced
      ? // Reduced-motion: zero ripple paths (`number: 0`) — the
        // property block stays present so option-shape tests can
        // still assert layer presence; period/scale stay in valid
        // ranges so ECharts doesn't construct zero-duration loops.
        {
          number: 0,
          period: layer.ripplePeriod ?? 4,
          scale: layer.rippleScale ?? 2.5,
          brushType: layer.rippleBrush ?? 'stroke',
        }
      : {
          period: layer.ripplePeriod ?? 4,
          scale: layer.rippleScale ?? 2.5,
          brushType: layer.rippleBrush ?? 'stroke',
        },
    showEffectOn: layer.showEffectOn ?? 'render',
    itemStyle: {
      color: layer.color,
      opacity: layer.opacity ?? 0.9,
    },
    label:
      (layer.showLabels ?? true)
        ? {
            show: true,
            position: 'right',
            formatter: '{b}',
            fontSize: 11,
          }
        : { show: false },
    emphasis: {
      focus: 'self',
      label: { show: true, fontWeight: 'bold' },
      itemStyle: { opacity: 1 },
    },
    z: layer.z ?? 5,
  };
}

/* ------------------------------------------------------------------ */
/*  Flow (lines on geo) — value → lineStyle.width scale                */
/* ------------------------------------------------------------------ */

/**
 * Clamped width scale for flow lines. Default `'linear'` because
 * stroke width is a one-dimensional channel — a 2× metric reads as
 * 2× thickness, which matches user intuition. `'sqrt'` is available
 * as an outlier-control opt-in (long-tailed distributions where the
 * largest edges would otherwise visually dominate).
 *
 * Edge cases mirror `bubbleSymbolSize`:
 *   - non-finite value → returns minW
 *   - negative value or negative domain → floored to 0 (defensive)
 *   - all values equal → returns midpoint of [minW, maxW]
 *   - value outside [minValue, maxValue] → clamped to nearest bound
 */
function flowLineWidth(
  value: number,
  minValue: number,
  maxValue: number,
  minW: number,
  maxW: number,
  scale: 'linear' | 'sqrt' = 'linear',
): number {
  if (!Number.isFinite(value)) return minW;
  const safeValue = value < 0 ? 0 : value;
  const safeMin = minValue < 0 ? 0 : minValue;
  const safeMax = maxValue < 0 ? 0 : maxValue;
  if (safeMax === safeMin) return (minW + maxW) / 2;
  const clamped = Math.max(safeMin, Math.min(safeMax, safeValue));
  const t =
    scale === 'sqrt'
      ? // Sqrt branch: outlier control. `safeMax === safeMin` guard
        // above already protects from division-by-zero here.
        (Math.sqrt(clamped) - Math.sqrt(safeMin)) / (Math.sqrt(safeMax) - Math.sqrt(safeMin))
      : (clamped - safeMin) / (safeMax - safeMin);
  return minW + t * (maxW - minW);
}

/**
 * Synthesize a stable display name for a flow edge (used by the
 * `label.formatter: '{b}'` path + tooltip + a11y SR linearization).
 * Prefers `fromName`/`toName` when present; falls back to coordinate
 * formatting.
 */
function flowEdgeName(d: GeoFlowDatum): string {
  const from = d.fromName ?? `${d.from[0].toFixed(2)},${d.from[1].toFixed(2)}`;
  const to = d.toName ?? `${d.to[0].toFixed(2)},${d.to[1].toFixed(2)}`;
  return `${from} → ${to}`;
}

/**
 * Build a single flow layer spec.
 *
 * Maps to ECharts `lines` series (`polyline: false`, single segment
 * per datum). Wrapper passes the layer + the geo coordinate system
 * index (shared with the base map, default 0).
 *
 * Reduced-motion: when `respectReducedMotion: true`, the trail
 * animation is suppressed (`effect.show: false`) regardless of
 * `showEffect`. The series type stays `'lines'` so option-shape tests
 * and consumer code see a consistent contract.
 */
export function buildFlowLayerSeries(layer: GeoFlowLayer, geoIndex: number): GeoOverlaySeriesSpec {
  const data = layer.data ?? [];
  const numericValues = data.map((d) => d.value).filter((v): v is number => Number.isFinite(v));
  const minValue = numericValues.length > 0 ? Math.min(...numericValues) : 0;
  const maxValue = numericValues.length > 0 ? Math.max(...numericValues) : 1;
  const minW = layer.minWidth ?? 1;
  const maxW = layer.maxWidth ?? 6;
  const baseWidth = layer.width ?? 2;
  const widthScale = layer.widthScale ?? 'linear';
  // Curveness clamp: default 0.2 (subtle arc that separates
  // counter-flow edges). Non-finite or out-of-range values fall back
  // to the default rather than corrupting the line render.
  const curveness =
    typeof layer.curveness === 'number' && Number.isFinite(layer.curveness)
      ? Math.max(0, Math.min(1, layer.curveness))
      : 0.2;
  const reduced = layer.respectReducedMotion === true;
  const effectOn = layer.showEffect === true && !reduced;

  const seriesData = data.map((d: GeoFlowDatum) => {
    // Per-edge width: value-driven scale when value is finite, else
    // fall back to the layer's constant `width` (default 2).
    const width =
      typeof d.value === 'number' && Number.isFinite(d.value)
        ? flowLineWidth(d.value, minValue, maxValue, minW, maxW, widthScale)
        : baseWidth;
    return {
      // ECharts geo `lines` datum: `coords: [[lng, lat], [lng, lat]]`.
      // `name` populates the `'{b}'` label token + click `params.name`
      // — Codex 019e25d4 iter-2 nit: without it the label formatter
      // would emit an empty string.
      name: flowEdgeName(d),
      coords: [d.from, d.to],
      lineStyle: {
        width,
        color: d.color,
        opacity: layer.opacity ?? 0.6,
        curveness,
      },
      // Same `_overlay` namespace convention as bubble + effectScatter,
      // but with `type: 'flow'` discriminator + from/to instead of
      // coordinates. Wrapper-side tooltip/click/a11y switches on
      // `_overlay.type` to narrow this shape.
      _overlay: {
        type: layer.type as 'flow',
        layerName: layer.name ?? 'Flow overlay',
        from: d.from,
        to: d.to,
        fromName: d.fromName,
        toName: d.toName,
        value: d.value,
        category: d.category,
      },
    };
  });

  return {
    type: 'lines',
    coordinateSystem: 'geo',
    geoIndex,
    name: layer.name ?? 'Flow overlay',
    data: seriesData,
    // OD-only (single segment per datum). Multi-waypoint routes
    // (`polyline: true`) are out of scope for PR-X13c — Codex
    // 019e25d4 iter-2 explicit deferral.
    polyline: false,
    effect: effectOn
      ? {
          show: true,
          period: layer.effectPeriod ?? 6,
          trailLength: layer.effectTrailLength ?? 0.3,
          symbol: layer.effectSymbol ?? 'arrow',
          symbolSize: layer.effectSymbolSize ?? 8,
        }
      : {
          // Codex 019e25d4 iter-2: reduced-motion → `effect.show: false`
          // (plain line render). `lines` has no `rippleEffect.number`
          // analogue — `show: false` is the canonical opt-out.
          show: false,
        },
    lineStyle: {
      color: layer.color,
      opacity: layer.opacity ?? 0.6,
      curveness,
    },
    label: layer.showLabels
      ? {
          show: true,
          position: 'middle',
          formatter: '{b}',
          fontSize: 11,
        }
      : { show: false },
    emphasis: {
      focus: 'self',
      lineStyle: { opacity: 1, width: maxW + 1 },
    },
    z: layer.z ?? 5,
  };
}

/* ------------------------------------------------------------------ */
/*  Heatmap (density on geo) — PR-X13d                                 */
/* ------------------------------------------------------------------ */

/**
 * Sanitize a heatmap intensity value. Non-finite or negative inputs
 * floor to 0. Every downstream consumer (series data tuple,
 * `_overlay.value` metadata, visualMap domain, a11y intensity range)
 * MUST go through this helper so the "visual 0, payload -5" drift
 * flagged by Codex 019e25ee iter-2 cannot occur.
 *
 * Single source of truth — exported for direct unit testing.
 */
export function safeHeatmapIntensity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value;
}

/** Default 5-stop density colour ramp (blue → yellow → red). */
const HEATMAP_DEFAULT_COLORS = ['#313695', '#74add1', '#ffffbf', '#f46d43', '#a50026'];

/**
 * Build a single heatmap layer spec.
 *
 * Wrapper passes the layer + the geo coordinate system index (shared
 * with the base map, default 0). The ECharts `heatmap` series here
 * uses `coordinateSystem: 'geo'` so it pans/zooms with the base.
 *
 * Data shape is object-form (`{ value: [lng, lat, intensity], name,
 * _overlay }`) rather than raw arrays — Codex 019e25ee iter-1 must-fix:
 * raw arrays would lose the `_overlay` metadata namespace and break
 * tooltip/click/a11y discrimination downstream.
 */
export function buildHeatmapLayerSeries(
  layer: GeoHeatmapLayer,
  geoIndex: number,
): GeoOverlaySeriesSpec {
  const data = layer.data ?? [];
  const seriesData = data.map((d: GeoHeatmapDatum) => {
    // Single sanitized value flows through series + _overlay alike —
    // Codex iter-2 must-fix #2 (no visual/payload drift).
    const sanitized = safeHeatmapIntensity(d.value);
    return {
      value: [d.coordinates[0], d.coordinates[1], sanitized],
      name: d.name,
      _overlay: {
        type: layer.type as 'heatmap',
        layerName: layer.name ?? 'Density overlay',
        coordinates: d.coordinates,
        value: sanitized,
        category: d.category,
      },
    };
  });

  return {
    type: 'heatmap',
    coordinateSystem: 'geo',
    geoIndex,
    name: layer.name ?? 'Density overlay',
    data: seriesData,
    // ECharts canonical defaults (Codex 019e25ee iter-1 verified vs
    // echarts@5.6.0 source). `pointSize` is the per-datum spread
    // radius; `blurSize` smooths transitions between datums.
    pointSize: layer.pointSize ?? 20,
    blurSize: layer.blurSize ?? 30,
    // Alpha lives on the series (Codex iter-2 must-fix #3): ECharts
    // geo heatmap reads `minOpacity`/`maxOpacity` from the series,
    // NOT from `visualMap.inRange.opacity`. `maxOpacity` capped <1 so
    // the base choropleth shines through.
    minOpacity: layer.minOpacity ?? 0,
    maxOpacity: layer.maxOpacity ?? 0.8,
    z: layer.z ?? 5,
  };
}

/**
 * Build the visualMap entries needed by heatmap overlay series.
 *
 * Codex 019e25ee plan-time + iter-2 absorb:
 * - Returns an empty array when no heatmap overlay is present
 *   (callers spread it — empty spread is a no-op).
 * - Each heatmap layer emits one visualMap entry pinned to its own
 *   series via `seriesIndex` (the overlay's slot in the series array
 *   relative to the base map). `dimension: 2` reads intensity from
 *   `data[i].value[2]`.
 * - Legend visibility defaults to hidden (`show: false`) — heatmap
 *   colour-coding is usually documented externally and stacking
 *   multiple legends clutters dense maps. Consumers opt in per-layer
 *   via `showLegend: true`.
 *
 * @param overlays Overlay array (may be undefined/empty).
 * @param firstOverlaySeriesIndex Series index of the FIRST overlay —
 *   defaults to 1 because the base map sits at `series[0]`.
 * @returns Zero or more visualMap spec objects (one per heatmap layer).
 */
export function buildGeoOverlayVisualMaps(
  overlays: GeoOverlay[] | undefined,
  firstOverlaySeriesIndex = 1,
): GeoOverlaySeriesSpec[] {
  if (!overlays || overlays.length === 0) return [];
  const visualMaps: GeoOverlaySeriesSpec[] = [];
  overlays.forEach((layer, idx) => {
    if (layer.type !== 'heatmap') return;
    const seriesIndex = firstOverlaySeriesIndex + idx;
    const sanitizedValues = layer.data.map((d) => safeHeatmapIntensity(d.value));
    const min =
      layer.minIntensity ?? (sanitizedValues.length > 0 ? Math.min(...sanitizedValues) : 0);
    const max =
      layer.maxIntensity ?? (sanitizedValues.length > 0 ? Math.max(...sanitizedValues) : 1);
    // Legend layout: position-driven (top/bottom/left/right). When
    // hidden, the position fields are still set so toggling
    // `showLegend: true` doesn't require a re-render shape change.
    const position = layer.legendPosition;
    visualMaps.push({
      type: 'continuous',
      seriesIndex,
      // intensity is the third element of `[lng, lat, intensity]`
      dimension: 2,
      min,
      max,
      calculable: false,
      show: layer.showLegend ?? false,
      text: layer.legendText ?? ['Density (high)', 'Density (low)'],
      orient: position === 'left' || position === 'right' ? 'vertical' : 'horizontal',
      left: position === 'left' ? 10 : undefined,
      right: position === 'right' ? 10 : undefined,
      top:
        position === 'top'
          ? 10
          : position === 'left' || position === 'right'
            ? 'middle'
            : undefined,
      bottom: position === 'bottom' ? 10 : undefined,
      inRange: {
        // Alpha intentionally NOT set here — series-level
        // minOpacity/maxOpacity own that channel for geo heatmap
        // (Codex iter-2 must-fix #3).
        color: layer.colors ?? HEATMAP_DEFAULT_COLORS,
      },
    });
  });
  return visualMaps;
}

/* ------------------------------------------------------------------ */
/*  Marker (icon/SVG points on geo) — PR-X13e                          */
/* ------------------------------------------------------------------ */

/** Whitelist of safe ECharts symbol presets accepted by marker layer. */
const MARKER_PRESET_SYMBOLS = new Set([
  'circle',
  'rect',
  'roundRect',
  'triangle',
  'diamond',
  'pin',
  'arrow',
]);

/**
 * Maximum allowed length for `path://` SVG strings. Defensive cap
 * against accidentally-huge consumer paths that could blow up the
 * canvas render loop or memory profile. 4 KB is generous — typical
 * icon paths are 100-500 chars; complex logos rarely exceed 2 KB.
 */
const MARKER_PATH_MAX_LENGTH = 4096;

/**
 * Sanitize a marker symbol string. Rejects external image URLs,
 * malformed `path://` payloads, and oversized paths. Returns `'pin'`
 * fallback so a single bad consumer datum cannot crash the entire
 * GeoMap render (Codex 019e2614 plan-time iter must-fix #2).
 *
 * Accepted:
 *   - Built-in presets: 'circle', 'rect', 'roundRect', 'triangle',
 *     'diamond', 'pin', 'arrow'
 *   - `path://...` SVG strings up to {@link MARKER_PATH_MAX_LENGTH}
 *     bytes that don't look like external URLs in disguise
 *
 * Rejected (→ `'pin'` fallback):
 *   - `image://...`, `http(s)://...`, `data:...` (out of scope —
 *     external resource fetch / privacy / CORS surface)
 *   - Empty strings, non-strings, paths > MAX_LENGTH
 *   - `path://` strings containing the rejected URL prefixes (defence
 *     in depth against `path://image://...` smuggling)
 *
 * Single source of truth for marker symbol validation — exported for
 * direct unit testing.
 */
export function safeGeoMarkerSymbol(
  symbol: unknown,
  fallback: GeoMarkerSymbol = 'pin',
): GeoMarkerSymbol {
  if (typeof symbol !== 'string' || symbol.length === 0) return fallback;
  // Reject external URL prefixes (defence in depth — also caught
  // even when smuggled inside `path://`).
  const lowered = symbol.toLowerCase();
  if (
    lowered.startsWith('image://') ||
    lowered.startsWith('http://') ||
    lowered.startsWith('https://') ||
    lowered.startsWith('data:')
  ) {
    return fallback;
  }
  // Built-in preset → accept verbatim.
  if (MARKER_PRESET_SYMBOLS.has(symbol)) return symbol as GeoMarkerSymbol;
  // Inline `path://` SVG → length-cap check.
  if (lowered.startsWith('path://')) {
    if (symbol.length > MARKER_PATH_MAX_LENGTH) return fallback;
    // Defence-in-depth: reject `path://image://...` smuggling.
    const inner = lowered.slice('path://'.length);
    if (
      inner.startsWith('image://') ||
      inner.startsWith('http://') ||
      inner.startsWith('https://') ||
      inner.startsWith('data:')
    ) {
      return fallback;
    }
    return symbol as GeoMarkerSymbol;
  }
  // Unknown shape — defensive fallback.
  return fallback;
}

/**
 * Build a single marker layer spec.
 *
 * Wrapper passes the layer + the geo coordinate system index (shared
 * with the base map, default 0). Marker uses `scatter` series with
 * constant `symbolSize` (NOT a function) — marker semantic is "show
 * this icon at this location", not "encode magnitude as area" — that's
 * the bubble overlay's job.
 *
 * One overlay = one series invariant preserved (Codex iter-1 must-fix
 * #5): heatmap visualMap helper computes `seriesIndex` from overlay
 * index, so adding multiple series per layer would drift the indexing.
 */
export function buildMarkerLayerSeries(
  layer: GeoMarkerLayer,
  geoIndex: number,
): GeoOverlaySeriesSpec {
  const data = layer.data ?? [];
  const layerSymbol = safeGeoMarkerSymbol(layer.symbol, 'pin');
  const layerSymbolSize =
    typeof layer.symbolSize === 'number' && Number.isFinite(layer.symbolSize)
      ? layer.symbolSize
      : 18;

  const seriesData = data.map((d: GeoMarkerDatum) => {
    // Per-datum overrides take precedence; invalid per-datum symbol
    // falls back to layer-level default (which itself is sanitized).
    const datumSymbol = d.symbol ? safeGeoMarkerSymbol(d.symbol, layerSymbol) : undefined;
    const datumSize =
      typeof d.symbolSize === 'number' && Number.isFinite(d.symbolSize) ? d.symbolSize : undefined;
    return {
      // Same `[lng, lat, value]` tuple as bubble + effectScatter so
      // tooltip/click reads consistently.
      value: [d.coordinates[0], d.coordinates[1], d.value ?? 0],
      name: d.name,
      // Symbol/size at datum level wins; absent → layer fallback via
      // the series-level `symbol` / `symbolSize` props below.
      symbol: datumSymbol,
      symbolSize: datumSize,
      itemStyle: d.color ? { color: d.color } : undefined,
      _overlay: {
        type: layer.type as 'marker',
        layerName: layer.name ?? 'Marker overlay',
        coordinates: d.coordinates,
        value: d.value,
        category: d.category,
      },
    };
  });

  return {
    type: 'scatter',
    coordinateSystem: 'geo',
    geoIndex,
    name: layer.name ?? 'Marker overlay',
    data: seriesData,
    symbol: layerSymbol,
    symbolSize: layerSymbolSize,
    itemStyle: {
      color: layer.color,
      opacity: layer.opacity ?? 0.9,
    },
    label: layer.showLabels
      ? {
          show: true,
          position: 'right',
          formatter: '{b}',
          fontSize: 11,
        }
      : { show: false },
    emphasis: {
      focus: 'self',
      label: { show: true, fontWeight: 'bold' },
      itemStyle: { opacity: 1 },
    },
    z: layer.z ?? 5,
  };
}

/* ------------------------------------------------------------------ */
/*  Dispatcher — consumers pass `overlays: GeoOverlay[]`               */
/* ------------------------------------------------------------------ */

/**
 * Build series specs for all overlay layers. Returns array (possibly
 * empty when `overlays` is undefined / empty).
 *
 * Wrapper splices these into `option.series` AFTER the base
 * choropleth `map` series so they render on top.
 */
export function buildGeoOverlaySeries(
  overlays: GeoOverlay[] | undefined,
  geoIndex = 0,
): GeoOverlaySeriesSpec[] {
  if (!overlays || overlays.length === 0) return [];
  const specs: GeoOverlaySeriesSpec[] = [];
  for (const layer of overlays) {
    switch (layer.type) {
      case 'bubble':
        specs.push(buildBubbleLayerSeries(layer, geoIndex));
        break;
      case 'effectScatter':
        specs.push(buildEffectScatterLayerSeries(layer, geoIndex));
        break;
      case 'flow':
        specs.push(buildFlowLayerSeries(layer, geoIndex));
        break;
      case 'heatmap':
        specs.push(buildHeatmapLayerSeries(layer, geoIndex));
        break;
      case 'marker':
        specs.push(buildMarkerLayerSeries(layer, geoIndex));
        break;
      // PR-X13 campaign closed — all 5 layer types implemented above.
      default: {
        // Exhaustiveness guard — TS narrows the union; at runtime an
        // unknown variant is silently dropped (consumer typo
        // protection without a hard crash on dynamic data).
        const _exhaustive: never = layer;
        void _exhaustive;
      }
    }
  }
  return specs;
}

// Re-export scale + sanitization helpers for unit tests.
export { bubbleSymbolSize, flowLineWidth, flowEdgeName };
export { MARKER_PATH_MAX_LENGTH };
