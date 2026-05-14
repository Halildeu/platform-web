/**
 * Pure ECharts series builder for `GeoOverlay[]`.
 *
 * Test seam: lifted out of `GeoMap.tsx` so option-shape tests can
 * assert builder output without React mount + ECharts canvas
 * lifecycle. Mirrors the `buildScatter3DOption` / `buildSurface3DOption`
 * pattern from the 3D Extension Pack (Codex thread `019e10ab`
 * iter-4 disipline).
 *
 * PR-X13a (Codex thread `019e2254`): only `'bubble'` (scatter on
 * `coordinateSystem: 'geo'`). Future overlays append cases here.
 */
import type { GeoOverlay, GeoBubbleLayer, GeoPointDatum } from './geoOverlayTypes';

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
  // NaN is the only non-finite value we treat as "missing"; Infinity
  // clamps naturally to the maxValue (and becomes maxSize).
  if (Number.isNaN(value)) return minSize;
  if (maxValue === minValue) return (minSize + maxSize) / 2;
  const clamped = Math.max(minValue, Math.min(maxValue, value));
  // Sqrt scale: area ~ value
  const sqrtMin = Math.sqrt(minValue);
  const sqrtMax = Math.sqrt(maxValue);
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
    // Stash domain payload for tooltip + click events.
    _category: d.category,
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
      // Future: 'effectScatter' | 'flow' | 'heatmap' | 'marker'
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

// Re-export the size helper for unit tests.
export { bubbleSymbolSize };
