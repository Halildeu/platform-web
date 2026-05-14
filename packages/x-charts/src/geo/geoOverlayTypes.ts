/**
 * Geo overlay layer types — PR-X13 campaign discriminated union.
 *
 * Foundation for layered overlays on top of `GeoMap` choropleth.
 * Codex thread `019e2254` plan-time iter (PR-X13a kapsamı): bubble
 * overlay first, sonraki layer type'lar (effectScatter, flow, heatmap,
 * marker) bu union'a append edilir.
 *
 * Discriminated union over `type` field — wrapper pattern matches on
 * `layer.type` to dispatch the right ECharts series build path.
 *
 * Foundation principle (Codex AGREE):
 *   - Wrapper does NOT own city/province centroid lookup. Consumer
 *     supplies `[lng, lat]` coordinates explicitly.
 *   - All overlays share the same registered map name (consumer calls
 *     `ensureGeoMapRegistered(mapName, loader)` once).
 *   - Each layer is independently optional; consumer mixes-and-matches
 *     by passing only the overlay types they need.
 *   - Future layer types append to the union without breaking existing
 *     consumers (additive contract).
 */

/* ------------------------------------------------------------------ */
/*  Common shape — coordinate, label, tooltip                          */
/* ------------------------------------------------------------------ */

/** Single point datum (lng/lat). */
export interface GeoPointDatum {
  /** Display name (city, region, person, etc.). */
  name: string;
  /** `[longitude, latitude]` in WGS84. */
  coordinates: [number, number];
  /** Numeric metric driving symbolSize (or visualMap when configured). */
  value?: number;
  /** Per-point color override. */
  color?: string;
  /** Optional category bucket (legend grouping). */
  category?: string | number;
}

/* ------------------------------------------------------------------ */
/*  Layer: Bubble (scatter on coordinateSystem: 'geo')                 */
/* ------------------------------------------------------------------ */

/**
 * Bubble layer — discrete points on the map sized by metric.
 *
 * Maps to ECharts `scatter` series with `coordinateSystem: 'geo'`.
 * `symbolSize` driven by `value` via a clamped sqrt scale (consistent
 * with GraphChart node sizing pattern).
 *
 * @see PR-X13a Codex 019e2254 plan
 */
export interface GeoBubbleLayer {
  type: 'bubble';
  /** Layer name (legend label, a11y prefix). */
  name?: string;
  /** Point data with coordinates + value. */
  data: GeoPointDatum[];
  /**
   * Symbol shape. ECharts standard: `'circle'`, `'rect'`, `'roundRect'`,
   * `'triangle'`, `'diamond'`, `'pin'`, `'arrow'`, or `'path://...'`.
   * @default 'circle'
   */
  symbol?: string;
  /**
   * Min symbol pixel size (when value is the lowest in dataset).
   * @default 8
   */
  minSymbolSize?: number;
  /**
   * Max symbol pixel size (when value is the highest in dataset).
   * @default 60
   */
  maxSymbolSize?: number;
  /**
   * Symbol opacity. Recommended < 1 for dense maps so overlapping
   * bubbles remain readable.
   * @default 0.7
   */
  opacity?: number;
  /**
   * Override default color for the entire layer (per-point `color`
   * still wins).
   */
  color?: string;
  /**
   * Show data labels next to each bubble (label = `datum.name`).
   * @default false
   */
  showLabels?: boolean;
  /**
   * Z-index relative to other overlays. Higher renders on top.
   * @default 5
   */
  z?: number;
}

/* ------------------------------------------------------------------ */
/*  Discriminated union — append future layer types here               */
/* ------------------------------------------------------------------ */

/**
 * Discriminated union of all geo overlay types. PR-X13a ships only
 * `'bubble'`; future PRs append `'effectScatter'` (PR-X13b), `'flow'`
 * (PR-X13c), `'heatmap'` (PR-X13d), `'marker'` (PR-X13e).
 *
 * Wrappers pattern-match on `type` and dispatch to the right ECharts
 * series builder. Adding a new variant is a non-breaking change for
 * consumers since they pass only the variants they need.
 */
export type GeoOverlay = GeoBubbleLayer;
// Future:
// | GeoEffectScatterLayer
// | GeoFlowLayer
// | GeoHeatmapLayer
// | GeoMarkerLayer;
