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
/*  Layer: Heatmap (density on geo — PR-X13d)                          */
/* ------------------------------------------------------------------ */

/**
 * Single heatmap datum — point with intensity. The wrapper sanitizes
 * non-finite / negative intensities to 0 via `safeHeatmapIntensity`
 * so series data, `_overlay` metadata, and visualMap domain all share
 * the same value (no "visual 0, payload NaN" drift).
 */
export interface GeoHeatmapDatum {
  /** Optional display name (tooltip/click fallback when coord-only). */
  name?: string;
  /** `[longitude, latitude]` in WGS84. */
  coordinates: [number, number];
  /** Density intensity — non-negative raw value. Sanitized at build. */
  value: number;
  /** Optional category bucket. */
  category?: string | number;
}

/**
 * Heatmap layer — density visualisation over the geo map. Each datum
 * is a point with an intensity value; ECharts renders a smoothed
 * density blob via `pointSize` + `blurSize` and colour-encodes via a
 * dedicated visualMap (separate from the base choropleth visualMap
 * so the two encodings stay isolated).
 *
 * Maps to ECharts `heatmap` series with `coordinateSystem: 'geo'`.
 *
 * **VisualMap architecture** (Codex 019e25ee plan-time AGREE):
 * - Base choropleth visualMap stays pinned to `seriesIndex: 0`.
 * - Each heatmap layer emits its own visualMap entry pinned to its
 *   own series index, with `dimension: 2` (intensity is the third
 *   element of the `[lng, lat, intensity]` data tuple).
 * - When at least one heatmap overlay is present, `option.visualMap`
 *   switches from a single object to an array. Otherwise the original
 *   single-object shape is preserved for backward compatibility.
 *
 * **Reduced motion**: heatmap is static — no animation to disable.
 * `respectReducedMotion` is not part of this layer's contract.
 *
 * @see PR-X13d Codex 019e25ee plan-time AGREE
 */
export interface GeoHeatmapLayer {
  type: 'heatmap';
  /** Layer name (used as visualMap legend title + a11y prefix). */
  name?: string;
  /** Density point data. */
  data: GeoHeatmapDatum[];
  /**
   * Point spread radius in pixels (ECharts canonical default 20).
   * Higher = each datum contributes to a wider area.
   * @default 20
   */
  pointSize?: number;
  /**
   * Blur radius in pixels (ECharts canonical default 30). Higher =
   * smoother density transitions between points.
   * @default 30
   */
  blurSize?: number;
  /**
   * Explicit intensity domain lower bound for the visualMap. Default
   * `min(sanitized values)` when data is non-empty, `0` otherwise.
   */
  minIntensity?: number;
  /**
   * Explicit intensity domain upper bound for the visualMap. Default
   * `max(sanitized values)` when data is non-empty, `1` otherwise.
   */
  maxIntensity?: number;
  /**
   * Min pixel opacity (0..1) — ECharts series-level alpha control.
   * Codex 019e25ee iter-2: alpha lives on the series, NOT in the
   * visualMap `inRange.opacity` (which ECharts geo heatmap ignores).
   * @default 0
   */
  minOpacity?: number;
  /**
   * Max pixel opacity (0..1). Capped below 1 by default so the base
   * choropleth still shines through; raise for emphasis-only density.
   * @default 0.8
   */
  maxOpacity?: number;
  /**
   * Colour gradient (low → high). Default is a 5-stop diverging ramp
   * (blue → yellow → red) distinct from the base choropleth blue
   * gradient so the two encodings remain visually separable.
   * @default ['#313695', '#74add1', '#ffffbf', '#f46d43', '#a50026']
   */
  colors?: string[];
  /**
   * Show a separate visualMap legend for the heatmap. Opt-in: when
   * `false` (default), the heatmap colour-encoding is implicit
   * (consumer can document it externally). Multiple heatmap legends
   * stacked tend to clutter the canvas.
   * @default false
   */
  showLegend?: boolean;
  /** Heatmap legend position (when `showLegend: true`). */
  legendPosition?: 'top' | 'bottom' | 'left' | 'right';
  /**
   * Legend labels for [high, low] ends. Default `['Density (high)',
   * 'Density (low)']` distinguishes the legend from the base
   * choropleth legend.
   */
  legendText?: [string, string];
  /**
   * Z-index relative to other overlays.
   * @default 5
   */
  z?: number;
}

/* ------------------------------------------------------------------ */
/*  Layer: Marker (icon/SVG points on geo — PR-X13e)                   */
/* ------------------------------------------------------------------ */

/**
 * Built-in marker symbol presets — ECharts canonical shapes.
 *
 * Distinct from bubble/effectScatter `symbol` (which accepts any
 * string ECharts knows): marker enforces a curated whitelist plus
 * `path://...` SVG strings to keep the API safe for consumer-supplied
 * shapes (Codex 019e2614 plan-time iter must-fix #2).
 */
export type GeoMarkerPresetSymbol =
  | 'circle'
  | 'rect'
  | 'roundRect'
  | 'triangle'
  | 'diamond'
  | 'pin'
  | 'arrow';

/**
 * Marker symbol — preset name OR inline SVG path string.
 *
 * **External image URLs (`image://`, `http(s)://`, `data:`) are
 * deliberately NOT in this type** (Codex 019e2614 plan-time iter
 * must-fix #1): the wrapper rejects them at runtime via
 * `safeGeoMarkerSymbol` to avoid CORS, tracking-pixel, and
 * arbitrary-URL render-bomb risks. External marker images are out of
 * scope for PR-X13e; a follow-up PR with explicit allowlist /
 * same-origin / imported-asset policy could add them.
 *
 * The template literal `\`path://${string}\`` provides ergonomics
 * (autocomplete + obvious intent) — runtime guard remains the
 * security boundary.
 */
export type GeoMarkerSymbol = GeoMarkerPresetSymbol | `path://${string}`;

/**
 * Single marker datum — point with an icon. Distinct from
 * `GeoPointDatum` (used by bubble + effectScatter) so marker-only
 * `symbol` / `symbolSize` overrides don't leak into the bubble +
 * effectScatter public surface (Codex iter-1 must-fix #3).
 */
export interface GeoMarkerDatum {
  /** Required name (tooltip + a11y label). */
  name: string;
  /** `[longitude, latitude]` in WGS84. */
  coordinates: [number, number];
  /** Optional metric (shown in tooltip; not used for sizing). */
  value?: number;
  /** Per-marker symbol override. */
  symbol?: GeoMarkerSymbol;
  /** Per-marker symbol pixel size override. */
  symbolSize?: number;
  /** Per-marker color override. */
  color?: string;
  /** Optional category bucket. */
  category?: string | number;
}

/**
 * Marker layer — declarative icon/SVG markers at geo coordinates.
 *
 * Maps to ECharts `scatter` series with `coordinateSystem: 'geo'`
 * and a constant `symbolSize` (NOT value-driven — marker semantic is
 * "show this icon at this location", not "encode magnitude as
 * symbol area" — that's the bubble overlay's job).
 *
 * Use case: branch locations, point-of-interest pins, custom-shape
 * highlights with consumer-supplied SVG paths. Marker is
 * point-clickable (uses the standard wrapper tooltip + click + a11y
 * point branch — no special handling needed at the wrapper layer).
 *
 * @see PR-X13e Codex 019e2614 plan-time AGREE
 */
export interface GeoMarkerLayer {
  type: 'marker';
  /** Layer name (legend label, a11y prefix). */
  name?: string;
  /** Marker data. */
  data: GeoMarkerDatum[];
  /**
   * Default symbol for the layer. Consumer-supplied `path://` strings
   * are validated; invalid input falls back to `'pin'` rather than
   * crashing the render (Codex iter-1 must-fix #2).
   * @default 'pin'
   */
  symbol?: GeoMarkerSymbol;
  /**
   * Default symbol pixel size. Marker is constant-size by design;
   * use bubble overlay for value-driven sizing.
   * @default 18
   */
  symbolSize?: number;
  /** Per-layer color (per-datum still wins). */
  color?: string;
  /**
   * Layer opacity.
   * @default 0.9
   */
  opacity?: number;
  /**
   * Show data labels next to each marker. Default OFF — map label
   * collision degrades fast on dense layers; consumer opts in for
   * sparse marker sets where each label fits.
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
      // Codex 019e2614 plan-time iter-1 must-fix #4: marker is point-
      // clickable (uses the same wrapper tooltip/click/a11y point
      // branch as bubble + effectScatter), so it joins the same union
      // arm rather than carrying its own variant.
      type: 'bubble' | 'effectScatter' | 'marker';
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
    }
  | {
      type: 'heatmap';
      layerName: string;
      coordinates: [number, number];
      /**
       * Sanitized intensity — `safeHeatmapIntensity` ensures this
       * matches the value stamped into ECharts series data + visualMap
       * domain + a11y summary range. No "visual 0, payload -5" drift.
       */
      value?: number;
      category?: string | number;
    };

/* ------------------------------------------------------------------ */
/*  Discriminated union — append future layer types here               */
/* ------------------------------------------------------------------ */

/**
 * Discriminated union of all geo overlay types.
 *
 * Layer types shipped (PR-X13 campaign):
 * - PR-X13a: `'bubble'` (silent scatter, value→symbolSize sqrt scale)
 * - PR-X13b: `'effectScatter'` (animated pulse for highlights)
 * - PR-X13c: `'flow'` (origin-destination lines, linear width)
 * - PR-X13d: `'heatmap'` (density on geo, dedicated visualMap)
 * - PR-X13e (this PR): `'marker'` (declarative SVG/icon markers)
 *
 * Wrappers pattern-match on `type` and dispatch to the right ECharts
 * series builder. Adding a new variant is a non-breaking change for
 * consumers since they pass only the variants they need.
 */
export type GeoOverlay =
  | GeoBubbleLayer
  | GeoEffectScatterLayer
  | GeoFlowLayer
  | GeoHeatmapLayer
  | GeoMarkerLayer;
// PR-X13 campaign closed — overlay layer family complete.
