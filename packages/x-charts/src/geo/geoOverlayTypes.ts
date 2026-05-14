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

/* ------------------------------------------------------------------ */
/*  Layer: EffectScatter (animated pulse — PR-X13b)                    */
/* ------------------------------------------------------------------ */

/**
 * EffectScatter layer — discrete points with an animated ripple
 * effect to draw the eye to highlighted lokasyonlar.
 *
 * Maps to ECharts `effectScatter` series with `coordinateSystem: 'geo'`.
 * Use case: a small set of priority points (kritik şehirler, vurgu
 * gerektiren noktalar) where the pulse is meaningful — NOT a general
 * bubble overlay (use `GeoBubbleLayer` for that — silent scatter,
 * better for dense data).
 *
 * Reduced-motion respect: when consumer/runtime indicates
 * `prefers-reduced-motion: reduce`, wrappers should pass
 * `respectReducedMotion: true` so the wrapper short-circuits the
 * pulse effect at build time. The flag lives at the layer level so
 * consumers can opt out per-layer (e.g., compliance-critical
 * dashboards).
 */
export interface GeoEffectScatterLayer {
  type: 'effectScatter';
  /** Layer name (legend label, a11y prefix). */
  name?: string;
  /** Point data. */
  data: GeoPointDatum[];
  /**
   * Symbol shape (same vocabulary as bubble).
   * @default 'pin'
   */
  symbol?: string;
  /**
   * Symbol size (constant — value-based scale would compete visually
   * with the pulse animation; tightly-bounded for emphasis only).
   * @default 14
   */
  symbolSize?: number;
  /**
   * Period of the ripple animation in seconds. Lower = more frantic.
   * @default 4
   */
  ripplePeriod?: number;
  /**
   * Scale of the ripple effect relative to symbolSize. 2.5 means the
   * ripple grows to 2.5× the symbol radius before fading.
   * @default 2.5
   */
  rippleScale?: number;
  /**
   * Ripple visual style. `'stroke'` is the canonical "radar pulse"
   * look; `'fill'` is more aggressive (use only for a single critical
   * marker).
   * @default 'stroke'
   */
  rippleBrush?: 'stroke' | 'fill';
  /**
   * Trigger for the effect: always render or only on hover. `'render'`
   * is the default (constant pulse); `'emphasis'` reserves the effect
   * for hover (less visual noise on dense maps).
   * @default 'render'
   */
  showEffectOn?: 'render' | 'emphasis';
  /**
   * When `true`, the wrapper omits the ripple animation entirely.
   * Honour OS-level `prefers-reduced-motion: reduce` by setting this
   * to `true` from the consumer (the wrapper does NOT introspect the
   * media query directly to keep it server-renderable + testable).
   * @default false
   */
  respectReducedMotion?: boolean;
  /** Per-layer color override (per-point `color` still wins). */
  color?: string;
  /**
   * Layer opacity. EffectScatter ripples look better at full opacity
   * (the ripple itself fades over its lifecycle).
   * @default 0.9
   */
  opacity?: number;
  /**
   * Show data labels next to each point.
   * @default true (highlighted points usually deserve a label)
   */
  showLabels?: boolean;
  /**
   * Z-index. Default same as bubble (5) so layered overlays stack
   * by array order.
   * @default 5
   */
  z?: number;
}

/* ------------------------------------------------------------------ */
/*  Discriminated union — append future layer types here               */
/* ------------------------------------------------------------------ */

/**
 * Discriminated union of all geo overlay types.
 *
 * Past iters:
 * - PR-X13a: `'bubble'` (silent scatter, value→symbolSize sqrt scale)
 * - PR-X13b (this PR): `'effectScatter'` (animated pulse for highlights)
 *
 * Future:
 * - PR-X13c: `'flow'` (origin-destination lines)
 * - PR-X13d: `'heatmap'` (density on geo)
 * - PR-X13e: `'marker'` (declarative SVG/icon markers)
 *
 * Wrappers pattern-match on `type` and dispatch to the right ECharts
 * series builder. Adding a new variant is a non-breaking change for
 * consumers since they pass only the variants they need.
 */
export type GeoOverlay = GeoBubbleLayer | GeoEffectScatterLayer;
// Future:
// | GeoFlowLayer
// | GeoHeatmapLayer
// | GeoMarkerLayer;
