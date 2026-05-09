/**
 * Renderer router types — Faz 21.11 PR-A0 (Codex thread `019e0e7a`).
 *
 * The "Big Data Renderer Router" (PR-A program) routes chart rendering
 * across three engines based on data shape, browser capability, and
 * interaction intent:
 *
 *   - **Canvas** — default ECharts path, suitable for typical dashboards
 *     up to ~50K-100K points. Cross-filter / drill-down work natively.
 *   - **SVG** — accessibility / static / print path. Lower ceiling but
 *     better for export and screen readers.
 *   - **WebGL** — lazy-loaded `echarts-gl` chunk, suitable for 100K-1M+
 *     points. Activated automatically above the threshold OR opt-in by
 *     the consumer. Cross-filter parity is reported via capability flag.
 *
 * The contract here is intentionally **engine-agnostic**: a future
 * Deck.gl / WebGL2 adapter (P2) can implement the same `RendererDecision`
 * shape without breaking the public API.
 *
 * @see decisions/topics/big-data-renderer-router.v1.json (D-014, planned)
 * @see Codex consensus thread `019e0e7a` (3-iter ping-pong)
 */

/**
 * The set of public renderer modes a chart consumer may request. The
 * `'auto'` sentinel hands the decision to {@link chooseRenderer} — most
 * dashboards should leave this as the default.
 */
export type RendererMode = 'auto' | 'canvas' | 'svg' | 'webgl';

/**
 * Concrete rendering backend chosen by the router. Distinct from
 * {@link RendererMode} because `'auto'` is never a backend on its own —
 * it always resolves to one of the concrete options.
 */
export type RendererBackend = 'canvas' | 'svg' | 'webgl';

/**
 * WebGL probe result. A separate type from `RendererCapability` because
 * the probe runs once and is cached; the capability rolls in additional
 * runtime signals (cross-filter intent, point count, user override).
 */
export interface WebGLCapability {
  /** True when a working WebGL1 (or higher) context could be created. */
  supported: boolean;
  /** True when a WebGL2 context could be created (subset of `supported`). */
  webgl2: boolean;
  /**
   * Diagnostic reason when `supported === false`. Helpful for telemetry
   * and the design-lab "renderer pill" explanation panel.
   */
  reason?: 'ssr' | 'context-unavailable' | 'context-lost' | 'probe-failed';
}

/**
 * Cross-filter parity advisory for WebGL renders. The router never hard-
 * fails cross-filter; instead it raises this advisory so the consumer can
 * surface a tooltip ("WebGL: cross-filter limited at 1.2M points") or
 * decide to route the chart to Canvas when interactivity is critical.
 */
export type CrossFilterCapability =
  | 'on'
  /** Hit-testing works but is throttled or limited (e.g. above threshold). */
  | 'partial'
  /** Hit-testing unavailable for this renderer + chart combination. */
  | 'disabled';

/**
 * Inputs to {@link chooseRenderer}. Pure data — the router itself stays
 * deterministic and testable.
 */
export interface ChooseRendererInput {
  /** User-facing renderer mode prop. Defaults to `'auto'`. */
  requestedMode: RendererMode;
  /** Total source data point count (pre-downsample). */
  pointCount: number;
  /** Cached WebGL probe result. Pass {@link detectWebGLCapability} output. */
  webgl: WebGLCapability;
  /**
   * **Reserved for PR-A2** (chart-type-specific cross-filter parity).
   * The PR-A0 router does NOT yet branch on this signal — see the
   * Codex thread `019e0e7a` iter-4 review. PR-A2 will activate
   * `hasInteraction` once per-chart hit-test parity matrices land.
   * Currently accepted as input for forward-compatibility only;
   * passing it has no effect on the decision.
   */
  hasInteraction?: boolean;
  /**
   * Hard requirement flag: when true and WebGL would break cross-filter
   * parity, the router will NEVER upgrade to WebGL even above the point
   * threshold. Use for trading dashboards / forensic UIs where losing
   * click → drilldown is unacceptable.
   */
  crossFilterRequired?: boolean;
  /**
   * Threshold above which the router considers WebGL. Default
   * {@link AUTO_WEBGL_POINT_THRESHOLD}. Made configurable per chart so
   * benchmarks can tune per-chart sweet spots.
   */
  autoWebGLThreshold?: number;
  /**
   * Threshold above which Canvas backend gets LTTB downsampling applied.
   * Below this we render raw points, above this LTTB triangulation
   * preserves visual shape while reducing draw calls. Default
   * {@link CANVAS_LTTB_POINT_THRESHOLD}. Codex iter-4 absorb (medium-
   * volume reason was unreachable without this band).
   */
  canvasLTTBThreshold?: number;
  /**
   * Threshold above which WebGL cross-filter degrades to `'partial'`.
   * Default {@link CROSS_FILTER_WEBGL_MAX_POINTS}.
   */
  crossFilterWebGLMaxPoints?: number;
}

/**
 * Deterministic, explainable router output. Chart wrappers consume this
 * to (1) pick the actual ECharts series type, (2) emit telemetry,
 * (3) surface the design-lab renderer pill ("Auto: WebGL · 1.2M pts ·
 * cross-filter partial").
 */
export interface RendererDecision {
  /** Concrete backend the chart should render with. */
  backend: RendererBackend;
  /**
   * Short machine-readable reason for the decision. Stable enum values
   * so analytics / Storybook stories can group on them.
   */
  reason:
    | 'forced-by-user'
    | 'auto-low-volume'
    | 'auto-medium-volume-canvas-lttb'
    | 'auto-high-volume-webgl'
    | 'webgl-fallback-unsupported'
    | 'webgl-fallback-cross-filter-required'
    | 'svg-explicit';
  /** Total point count considered. */
  pointCount: number;
  /**
   * Whether the router expects a downsample step before render. For
   * Canvas at medium volume this is true (LTTB), for raw Canvas /
   * WebGL it is false.
   */
  sampled: boolean;
  /** Cross-filter advisory for the chosen backend. */
  crossFilter: CrossFilterCapability;
  /**
   * Original `requestedMode` echoed back, so the consumer can detect a
   * fallback (`requested = 'webgl'` but `backend = 'canvas'`) and fire
   * `onRendererFallback`.
   */
  requestedMode: RendererMode;
}

/**
 * Default threshold above which `'auto'` mode prefers WebGL. Picked at
 * 100K to leave generous headroom above LTTB-eligible Canvas sweet spot
 * (~50K) and below the WebGL "obvious win" zone (~250K+). Benchmarks in
 * PR-A1 will tune this per chart type.
 */
export const AUTO_WEBGL_POINT_THRESHOLD = 100_000;

/**
 * Default threshold above which Canvas backend applies LTTB downsampling.
 * The medium-volume band lives between this and {@link AUTO_WEBGL_POINT_THRESHOLD}:
 * `<50K` raw Canvas, `50K..100K` Canvas + LTTB, `>=100K` WebGL (or fallback).
 * Codex iter-4 absorb — without this constant the `auto-medium-volume-canvas-lttb`
 * decision reason was declared but never produced.
 */
export const CANVAS_LTTB_POINT_THRESHOLD = 50_000;

/**
 * Default ceiling above which WebGL hit-testing degrades the cross-
 * filter capability advisory to `'partial'`. Above this, click → datum
 * resolution is technically possible but throttled / sampled.
 */
export const CROSS_FILTER_WEBGL_MAX_POINTS = 500_000;

/**
 * Optional consumer callback fired when the requested renderer was
 * downgraded — e.g. user asked for `'webgl'` but the browser does not
 * support it, so the router fell back to Canvas. Lets dashboards surface
 * a banner without polling `RendererDecision` themselves.
 */
export interface RendererFallbackEvent {
  requested: RendererMode;
  actual: RendererBackend;
  reason: RendererDecision['reason'];
}

/**
 * Optional consumer callback fired when cross-filter capability changes
 * relative to the chart's typical baseline (e.g. dropping from `'on'` to
 * `'partial'` on a 750K WebGL render). Mirror of `RendererFallbackEvent`
 * for the cross-filter path.
 */
export interface CrossFilterCapabilityEvent {
  capability: CrossFilterCapability;
  pointCount: number;
  backend: RendererBackend;
  reason: RendererDecision['reason'];
}
