/**
 * Pure ECharts series builder for `GeoOverlay[]`.
 *
 * Test seam: lifted out of `GeoMap.tsx` so option-shape tests can
 * assert builder output without React mount + ECharts canvas
 * lifecycle. Mirrors the `buildScatter3DOption` / `buildSurface3DOption`
 * pattern from the 3D Extension Pack (Codex thread `019e10ab`
 * iter-4 disipline).
 *
 * Layer types shipped:
 *   - PR-X13a (Codex `019e2254`): `'bubble'` — scatter on
 *     `coordinateSystem: 'geo'`, sqrt-scaled symbolSize.
 *   - PR-X13b (Codex `019e25a2`): `'effectScatter'` — animated pulse
 *     for highlighted lokasyonlar. Reduced-motion via
 *     `rippleEffect.number = 0`.
 *   - PR-X13c (Codex `019e25d4`): `'flow'` — origin-destination
 *     `lines` with linear width scale (sqrt opt-in). Reduced-motion
 *     via `effect.show: false`.
 *
 * Future overlays (`'heatmap'`, `'marker'`) append cases below.
 */
import type {
  GeoOverlay,
  GeoBubbleLayer,
  GeoEffectScatterLayer,
  GeoFlowLayer,
  GeoFlowDatum,
  GeoPointDatum,
} from './geoOverlayTypes';

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
      // Future: 'heatmap' | 'marker'
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

// Re-export scale helpers for unit tests.
export { bubbleSymbolSize, flowLineWidth, flowEdgeName };
