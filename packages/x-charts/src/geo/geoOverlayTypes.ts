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
/*  Layer: Flow (origin-destination lines on geo — PR-X13c)            */
/* ------------------------------------------------------------------ */

/**
 * Single OD edge — origin → destination with optional metric.
 *
 * Coordinates are `[lng, lat]` (WGS84). `fromName` / `toName` improve
 * tooltip + a11y labels; absent names fall back to coordinate
 * formatting (`"29.00, 41.00"`).
 */
export interface GeoFlowDatum {
  /** Origin point coordinates `[longitude, latitude]`. */
  from: [number, number];
  /** Destination point coordinates `[longitude, latitude]`. */
  to: [number, number];
  /** Origin label (for tooltip + a11y). */
  fromName?: string;
  /** Destination label. */
  toName?: string;
  /**
   * Numeric metric driving `lineStyle.width` via clamped scale
   * (linear by default; sqrt opt-in for outlier control).
   */
  value?: number;
  /** Optional category bucket. */
  category?: string | number;
  /** Per-edge color override. */
  color?: string;
}

/**
 * Flow layer — origin-destination edges drawn over the geo map.
 *
 * Maps to ECharts `lines` series with `coordinateSystem: 'geo'` and
 * `polyline: false` (single segment per datum). Use case: logistics
 * routes, migration flows, financial transfers, network topology
 * across geographic endpoints.
 *
 * Encoding:
 *   - `value` → `lineStyle.width` (linear scale, clamped to
 *     `[minWidth, maxWidth]`). Linear because stroke width is a
 *     one-dimensional channel (unlike bubble area which needs sqrt
 *     for perceptual correctness).
 *   - `category` → optional consumer-driven grouping (not visually
 *     encoded by the wrapper; passed through for click/a11y).
 *
 * Animation: opt-in via `showEffect: true`. The trailing pulse along
 * each line is purely decorative — disable for accessibility-critical
 * dashboards or when the consumer detects `prefers-reduced-motion`
 * (set `respectReducedMotion: true`).
 *
 * @see PR-X13c Codex 019e25d4 plan-time AGREE
 */
export interface GeoFlowLayer {
  type: 'flow';
  /** Layer name (legend label, a11y prefix). */
  name?: string;
  /** OD edge data. */
  data: GeoFlowDatum[];
  /** Per-layer color override (per-edge `color` still wins). */
  color?: string;
  /**
   * Line opacity. Recommended < 1 for dense flow maps so overlapping
   * edges remain readable.
   * @default 0.6
   */
  opacity?: number;
  /**
   * `lineStyle.curveness` in `[0, 1]`. Higher = more pronounced arc;
   * a small curve (0.2) helps visually separate counter-flow edges.
   * @default 0.2
   */
  curveness?: number;
  /**
   * Constant line width fallback when datum has no `value`.
   * @default 2
   */
  width?: number;
  /**
   * Minimum line width for value-driven scale (lowest value clamps here).
   * @default 1
   */
  minWidth?: number;
  /**
   * Maximum line width for value-driven scale (highest value clamps here).
   * @default 6
   */
  maxWidth?: number;
  /**
   * Width scale. `'linear'` (default) is the most honest encoding for
   * stroke width — a 2× metric reads as 2× thickness. `'sqrt'` is
   * available for outlier control (long-tailed distributions where
   * the largest edges would otherwise dominate).
   * @default 'linear'
   */
  widthScale?: 'linear' | 'sqrt';
  /**
   * Show animated trail along each line (ECharts `effect`).
   * Opt-in (default off) since the animation can be distracting on
   * dense flow maps.
   * @default false
   */
  showEffect?: boolean;
  /**
   * Period of the trail animation in seconds.
   * @default 6
   */
  effectPeriod?: number;
  /**
   * Trail length as a fraction of the line `[0, 1]`. Higher = longer
   * comet tail.
   * @default 0.3
   */
  effectTrailLength?: number;
  /**
   * Symbol drawn at the head of each trail.
   * @default 'arrow'
   */
  effectSymbol?: string;
  /**
   * Trail symbol pixel size.
   * @default 8
   */
  effectSymbolSize?: number;
  /**
   * When `true`, the wrapper disables the trail effect entirely
   * (`effect.show: false`) regardless of `showEffect`. Consumers
   * should set this to mirror OS-level `prefers-reduced-motion: reduce`.
   * @default false
   */
  respectReducedMotion?: boolean;
  /**
   * Show edge labels at the middle of each line (label = synthesized
   * `"<fromName> → <toName>"` or coordinate fallback).
   * @default false
   */
  showLabels?: boolean;
  /**
   * Z-index relative to other overlays.
   * @default 5
   */
  z?: number;
}

/* ------------------------------------------------------------------ */
/*  Internal `_overlay` metadata — typed for tooltip/click/a11y       */
/* ------------------------------------------------------------------ */

/**
 * Internal discriminated metadata namespace stamped onto every
 * overlay datum so the wrapper's tooltip/click/a11y branches can
 * narrow without `any` casts.
 *
 * NOT a public API — consumer-facing payload is the
 * `onDataPointClick({ datum })` shape (see `GeoMap.tsx`). This type
 * is exported for internal package use (`buildGeoOverlaySeries` ↔
 * `GeoMap`) but not re-exported from `packages/x-charts/src/index.ts`
 * to prevent the `_overlay` shape becoming part of the public surface.
 *
 * @internal
 */
export type GeoOverlayMeta =
  | {
      type: 'bubble' | 'effectScatter';
      layerName: string;
      coordinates: [number, number];
      value?: number;
      category?: string | number;
    }
  | {
      type: 'flow';
      layerName: string;
      from: [number, number];
      to: [number, number];
      fromName?: string;
      toName?: string;
      value?: number;
      category?: string | number;
    };

/* ------------------------------------------------------------------ */
/*  Discriminated union — append future layer types here               */
/* ------------------------------------------------------------------ */

/**
 * Discriminated union of all geo overlay types.
 *
 * Past iters:
 * - PR-X13a: `'bubble'` (silent scatter, value→symbolSize sqrt scale)
 * - PR-X13b: `'effectScatter'` (animated pulse for highlights)
 * - PR-X13c (this PR): `'flow'` (origin-destination lines, linear width)
 *
 * Future:
 * - PR-X13d: `'heatmap'` (density on geo)
 * - PR-X13e: `'marker'` (declarative SVG/icon markers)
 *
 * Wrappers pattern-match on `type` and dispatch to the right ECharts
 * series builder. Adding a new variant is a non-breaking change for
 * consumers since they pass only the variants they need.
 */
export type GeoOverlay = GeoBubbleLayer | GeoEffectScatterLayer | GeoFlowLayer;
// Future:
// | GeoHeatmapLayer
// | GeoMarkerLayer;
