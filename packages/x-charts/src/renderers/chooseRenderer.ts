/**
 * Deterministic renderer router — Faz 21.11 PR-A0 (Codex thread
 * `019e0e7a` iter-4 consensus, three-band auto routing).
 *
 * The router is a **pure function** of its inputs: identical
 * {@link ChooseRendererInput} → identical {@link RendererDecision}.
 * No side effects, no I/O, no async. This makes the entire routing
 * decision matrix trivially testable and replayable from logs.
 *
 * ## Decision matrix (priority order)
 *
 * 1. `requestedMode === 'svg'` → SVG, regardless of point count.
 * 2. `requestedMode === 'canvas'` → Canvas (LTTB above the LTTB threshold).
 * 3. `requestedMode === 'webgl'`:
 *    - WebGL supported → WebGL (cross-filter advisory may degrade).
 *    - WebGL unsupported → Canvas fallback (LTTB above the LTTB threshold).
 * 4. `requestedMode === 'auto'` (three bands by point count):
 *    - `< CANVAS_LTTB_POINT_THRESHOLD` (≈ 50K) → Canvas, raw, no sampling.
 *    - `< AUTO_WEBGL_POINT_THRESHOLD` (≈ 100K) → Canvas + LTTB
 *      (`auto-medium-volume-canvas-lttb`).
 *    - `>= AUTO_WEBGL_POINT_THRESHOLD`:
 *      - `crossFilterRequired` AND `> CROSS_FILTER_WEBGL_MAX_POINTS`
 *        → Canvas + LTTB (`webgl-fallback-cross-filter-required`).
 *      - WebGL supported → WebGL (advisory may degrade above
 *        `CROSS_FILTER_WEBGL_MAX_POINTS`).
 *      - WebGL unsupported → Canvas + LTTB (`webgl-fallback-unsupported`).
 *
 * ## Sampling semantics (Codex iter-4)
 *
 * `sampled` is bound to the **LTTB threshold**, not the WebGL threshold:
 * a Canvas decision is `sampled: true` whenever the source point count
 * would exceed `canvasLTTBThreshold`. This stays accurate when the
 * router falls back to Canvas at high volume (the consumer can still
 * apply LTTB before paint).
 *
 * ## Cross-filter advisory rules
 *
 * - Backend Canvas / SVG → always `'on'` (native ECharts hit-testing).
 * - Backend WebGL + `pointCount <= CROSS_FILTER_WEBGL_MAX_POINTS` → `'on'`.
 * - Backend WebGL + `pointCount > CROSS_FILTER_WEBGL_MAX_POINTS` → `'partial'`.
 *   (PR-A2 will introduce `'disabled'` for chart types where GL hit-test
 *   parity is not yet implemented.)
 */
import {
  AUTO_WEBGL_POINT_THRESHOLD,
  CANVAS_LTTB_POINT_THRESHOLD,
  CROSS_FILTER_WEBGL_MAX_POINTS,
  type ChooseRendererInput,
  type CrossFilterCapability,
  type RendererBackend,
  type RendererDecision,
} from './types';

export function chooseRenderer(input: ChooseRendererInput): RendererDecision {
  const {
    requestedMode,
    pointCount,
    webgl,
    crossFilterRequired = false,
    autoWebGLThreshold = AUTO_WEBGL_POINT_THRESHOLD,
    canvasLTTBThreshold = CANVAS_LTTB_POINT_THRESHOLD,
    crossFilterWebGLMaxPoints = CROSS_FILTER_WEBGL_MAX_POINTS,
  } = input;
  // `hasInteraction` is intentionally left unread in PR-A0 — it is a
  // reserved input for PR-A2 chart-type-specific cross-filter parity.
  // Codex thread `019e0e7a` iter-4 review.

  const sampledIfCanvas = pointCount > canvasLTTBThreshold;

  // 1. Explicit user-requested SVG.
  if (requestedMode === 'svg') {
    return makeDecision({
      backend: 'svg',
      reason: 'svg-explicit',
      pointCount,
      sampled: false,
      requestedMode,
    });
  }

  // 2. Explicit user-requested Canvas.
  if (requestedMode === 'canvas') {
    return makeDecision({
      backend: 'canvas',
      // User chose Canvas explicitly — even at high volume, treat as
      // forced. The LTTB downsample still kicks in for visual fidelity.
      reason: 'forced-by-user',
      pointCount,
      sampled: sampledIfCanvas,
      requestedMode,
    });
  }

  // 3. Explicit user-requested WebGL.
  if (requestedMode === 'webgl') {
    if (!webgl.supported) {
      return makeDecision({
        backend: 'canvas',
        reason: 'webgl-fallback-unsupported',
        pointCount,
        sampled: sampledIfCanvas,
        requestedMode,
      });
    }
    return makeDecision({
      backend: 'webgl',
      reason: 'forced-by-user',
      pointCount,
      sampled: false,
      requestedMode,
      crossFilterMax: crossFilterWebGLMaxPoints,
    });
  }

  // 4. Auto routing — three bands.

  // 4a. Low volume → raw Canvas, no sampling.
  if (pointCount < canvasLTTBThreshold) {
    return makeDecision({
      backend: 'canvas',
      reason: 'auto-low-volume',
      pointCount,
      sampled: false,
      requestedMode,
    });
  }

  // 4b. Medium volume → Canvas + LTTB (the previously unreachable
  // `auto-medium-volume-canvas-lttb` decision now actually lives here).
  if (pointCount < autoWebGLThreshold) {
    return makeDecision({
      backend: 'canvas',
      reason: 'auto-medium-volume-canvas-lttb',
      pointCount,
      sampled: true,
      requestedMode,
    });
  }

  // 4c. High volume + cross-filter required → refuse WebGL, stay on Canvas/LTTB.
  const beyondCrossFilterCeiling = pointCount > crossFilterWebGLMaxPoints;
  if (crossFilterRequired && beyondCrossFilterCeiling) {
    return makeDecision({
      backend: 'canvas',
      reason: 'webgl-fallback-cross-filter-required',
      pointCount,
      sampled: true,
      requestedMode,
    });
  }

  // 4d. High volume + WebGL unsupported → Canvas + LTTB fallback.
  if (!webgl.supported) {
    return makeDecision({
      backend: 'canvas',
      reason: 'webgl-fallback-unsupported',
      pointCount,
      sampled: true,
      requestedMode,
    });
  }

  // 4e. High volume + WebGL OK + interaction is OK or below ceiling → WebGL.
  return makeDecision({
    backend: 'webgl',
    reason: 'auto-high-volume-webgl',
    pointCount,
    sampled: false,
    requestedMode,
    crossFilterMax: crossFilterWebGLMaxPoints,
  });
}

function makeDecision(args: {
  backend: RendererBackend;
  reason: RendererDecision['reason'];
  pointCount: number;
  sampled: boolean;
  requestedMode: RendererDecision['requestedMode'];
  /** Only consulted when `backend === 'webgl'`. */
  crossFilterMax?: number;
}): RendererDecision {
  return {
    backend: args.backend,
    reason: args.reason,
    pointCount: args.pointCount,
    sampled: args.sampled,
    crossFilter: deriveCrossFilterCapability(args.backend, args.pointCount, args.crossFilterMax),
    requestedMode: args.requestedMode,
  };
}

function deriveCrossFilterCapability(
  backend: RendererBackend,
  pointCount: number,
  crossFilterMax = CROSS_FILTER_WEBGL_MAX_POINTS,
): CrossFilterCapability {
  // Canvas / SVG always have native hit-testing.
  if (backend !== 'webgl') return 'on';
  // WebGL: degrade to `'partial'` above the ceiling.
  return pointCount > crossFilterMax ? 'partial' : 'on';
}
