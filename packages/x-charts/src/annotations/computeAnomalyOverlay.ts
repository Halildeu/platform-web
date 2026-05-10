/**
 * computeAnomalyOverlay — pure helper that flags outlier data points
 * via IQR (Tukey fences) and emits `ChartMarkup[]` per outlier.
 *
 * Pure: no React, no DOM, no global state. Used by
 * `useAnomalyOverlay` (React `useMemo` wrapper).
 *
 * The IQR method (Q1 − k·IQR, Q3 + k·IQR) is the safe default — it's
 * robust to skew and doesn't require a Gaussian assumption. Z-score
 * is reserved for v2 (`method: 'zscore'` currently falls back to IQR
 * with a warning so the API is forward-compatible). Codex thread
 * 019e0df1 iter-3 absorb.
 *
 * Faz 21.11 PR-A2b-ui — explanation pill (Codex thread `019e0fbf`
 * iter-1 AGREE + ready_for_impl=true). New `labelVariant` opt:
 *
 *   - `'marker'` (default, backwards-compatible) — emit a single
 *     `PointMarkup` per outlier with an inline `↑ value` text via
 *     `marker.label`.
 *   - `'pill'` — emit a `PointMarkup` per outlier (label-less) AND a
 *     capped, severity-ranked `LabelMarkup` per outlier carrying the
 *     formatted "Outlier: y=<value>" text on a warning-tinted
 *     background. The pill cap (`maxPills`, default 20) keeps the
 *     UI from drowning under labels when a dataset trips dozens of
 *     anomalies; the unlabelled markers stay visible for the rest.
 */
import type { ChartMarkup, LabelMarkup, PointMarkup } from '../types';

export interface AnomalyOverlayPoint {
  x: number | string;
  y: number;
}

export type AnomalyLabelVariant = 'marker' | 'pill';

export interface ComputeAnomalyOverlayOptions {
  data: AnomalyOverlayPoint[];
  /** Detection method (v1 supports 'iqr' only). */
  method?: 'iqr' | 'zscore';
  /** IQR fence multiplier. Default 1.5 (Tukey). */
  k?: number;
  /** Optional id prefix to scope multiple overlays per chart. */
  idPrefix?: string;
  /** Color override (defaults to error/danger token). */
  color?: string;
  /** Marker size override (default 12). */
  size?: number;
  /** Add a `↑ outlier` label next to each marker. Default true. */
  showLabel?: boolean;
  /**
   * @internal benchmark-aware UI surface — Faz 21.11 PR-A2b-ui.
   * `'marker'` (default) keeps the legacy inline-label behaviour;
   * `'pill'` emits a capped `LabelMarkup` chip on top of every
   * marker so consumers can show an "Outlier: y=value" explanation
   * pill driven by `onMarkupClick`.
   */
  labelVariant?: AnomalyLabelVariant;
  /**
   * Value formatter used for both the legacy marker label
   * (`↑ <value>`) and the pill text (`Outlier: y=<value>`). When
   * absent the value falls back to `toFixed(2)` to keep the legacy
   * marker output byte-identical for consumers that don't pass a
   * formatter in.
   */
  valueFormatter?: (value: number) => string;
  /**
   * Maximum number of `LabelMarkup` pills to emit (severity-ranked
   * — the largest fence violations win). Markers themselves are not
   * capped, so the overlay still shows every anomaly visually even
   * when its pill is dropped. Only used in `labelVariant === 'pill'`.
   * @default 20
   */
  maxPills?: number;
  /**
   * Pill background colour token. Defaults to a warning tint —
   * anomalies are an "attention / review" signal, not an error.
   */
  pillBackground?: string;
  /** Pill text colour token. Defaults to the warning text role. */
  pillTextColor?: string;
}

const DEFAULT_ANOMALY_COLOR = 'var(--state-error-text, #ef4444)';
const DEFAULT_ANOMALY_SIZE = 12;
const DEFAULT_PILL_BACKGROUND = 'var(--state-warning-bg, #fffbeb)';
const DEFAULT_PILL_TEXT_COLOR = 'var(--state-warning-text, #92400e)';
const DEFAULT_MAX_PILLS = 20;

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

/**
 * Internal anomaly hit shape — used by both `computeAnomalyOverlay`
 * (markup emission) and the new `computeAnomalySummary`
 * (a11y/announcement payload). Faz 21.11 PR-A2b-a11y absorbed
 * Codex thread `019e1027` iter-1 §1: detector logic lives in ONE
 * place; both surfaces consume the same hits.
 */
interface AnomalyHit {
  sourceIndex: number;
  point: AnomalyOverlayPoint;
  /** Visual glyph used by markup labels — KEPT as the original
   * arrow chars so the legacy marker label byte-identical. */
  direction: '↑' | '↓';
  severity: number;
}

/**
 * Pure detector. Walks `data`, computes the IQR fences, and
 * returns a list of anomaly hits. No markup emission, no React,
 * no DOM. Returns an empty array when fewer than four points
 * (IQR is meaningless on tiny samples).
 *
 * Used by `computeAnomalyOverlay` (markup rendering) and
 * `computeAnomalySummary` (a11y announcement payload). Keeps the
 * fence math single-source so a future detector swap (zscore, MAD,
 * etc.) only needs to change one function.
 */
function collectAnomalyHits(data: AnomalyOverlayPoint[] | undefined, k: number): AnomalyHit[] {
  if (!Array.isArray(data) || data.length < 4) return [];
  const ys = data
    .map((d) => d.y)
    .slice()
    .sort((a, b) => a - b);
  const q1 = quantile(ys, 0.25);
  const q3 = quantile(ys, 0.75);
  const iqr = q3 - q1;
  const lowerFence = q1 - k * iqr;
  const upperFence = q3 + k * iqr;
  const hits: AnomalyHit[] = [];
  for (let i = 0; i < data.length; i++) {
    const point = data[i];
    if (point.y > upperFence) {
      hits.push({
        sourceIndex: i,
        point,
        direction: '↑',
        severity: point.y - upperFence,
      });
    } else if (point.y < lowerFence) {
      hits.push({
        sourceIndex: i,
        point,
        direction: '↓',
        severity: lowerFence - point.y,
      });
    }
  }
  return hits;
}

/**
 * Find IQR-fence outliers and emit `ChartMarkup[]` for each. Returns
 * an empty array when fewer than four points (IQR is meaningless on
 * tiny samples).
 *
 * In `labelVariant === 'marker'` (default) the result is the legacy
 * `PointMarkup[]` with an inline label per outlier. In `labelVariant
 * === 'pill'` the result is `[...PointMarkup, ...LabelMarkup]` —
 * one marker per outlier (no inline label) plus a capped,
 * severity-ranked label per outlier so the consumer can render an
 * explanation pill above the chart.
 */
export function computeAnomalyOverlay(options: ComputeAnomalyOverlayOptions): ChartMarkup[] {
  const {
    data,
    method = 'iqr',
    k = 1.5,
    idPrefix = 'anomaly',
    color = DEFAULT_ANOMALY_COLOR,
    size = DEFAULT_ANOMALY_SIZE,
    showLabel = true,
    labelVariant = 'marker',
    valueFormatter,
    maxPills = DEFAULT_MAX_PILLS,
    pillBackground = DEFAULT_PILL_BACKGROUND,
    pillTextColor = DEFAULT_PILL_TEXT_COLOR,
  } = options;

  // method === 'zscore' currently falls through to IQR; v2 will
  // expose zscore once we agree on the multiplier defaults.
  void method;

  const formatValue = valueFormatter ?? ((v: number) => v.toFixed(2));
  const hits = collectAnomalyHits(data, k);

  if (hits.length === 0) return [];

  const out: ChartMarkup[] = [];

  if (labelVariant === 'pill') {
    // Markers (cap-free) first.
    for (const hit of hits) {
      const marker: PointMarkup = {
        id: `${idPrefix}-${hit.sourceIndex}`,
        type: 'point',
        x: hit.point.x,
        y: hit.point.y,
        symbol: 'diamond',
        size,
        color,
        source: 'ai_anomaly',
        ariaLabel: `Outlier at x=${String(hit.point.x)}, y=${formatValue(hit.point.y)}`,
      };
      out.push(marker);
    }
    // Then severity-ranked pills, capped to `maxPills`. Codex iter-2
    // RED #1: `LabelMarkup` doesn't take top-level `x` / `y` — it
    // wraps the position inside a discriminated `anchor`. The
    // adapter does `'x' in m.anchor` and would throw at render time
    // without the wrapper.
    const pillCandidates = [...hits]
      .sort((a, b) => b.severity - a.severity)
      .slice(0, Math.max(0, maxPills));
    for (const hit of pillCandidates) {
      const pill: LabelMarkup = {
        id: `${idPrefix}-${hit.sourceIndex}-pill`,
        type: 'label',
        anchor: { x: hit.point.x, y: hit.point.y },
        text: `Outlier: y=${formatValue(hit.point.y)}`,
        color: pillTextColor,
        background: pillBackground,
        source: 'ai_anomaly',
        ariaLabel: `Outlier explanation pill at x=${String(hit.point.x)}, y=${formatValue(hit.point.y)}`,
      };
      out.push(pill);
    }
    return out;
  }

  // Legacy marker-only behaviour.
  for (const hit of hits) {
    const marker: PointMarkup = {
      id: `${idPrefix}-${hit.sourceIndex}`,
      type: 'point',
      x: hit.point.x,
      y: hit.point.y,
      symbol: 'diamond',
      size,
      color,
      source: 'ai_anomaly',
      ...(showLabel ? { label: { text: `${hit.direction} ${formatValue(hit.point.y)}` } } : {}),
    };
    out.push(marker);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  PR-A2b-a11y — anomaly summary for screen-reader announcements      */
/* ------------------------------------------------------------------ */

/**
 * Semantic outlier direction. Codex iter-1 §2: the markup uses the
 * arrow glyph `↑/↓` for visual labels, but a11y / external
 * consumers want the semantic word. Decoupled here so SR
 * announcements never read `up arrow` or rely on Unicode.
 */
export type AnomalyDirection = 'above' | 'below';

/** Categorical severity bucket. Top-quartile of detected anomalies
 * → `'high'`; everything else → `'medium'`. The continuous
 * `severity` numeric is also exposed so consumers can build their
 * own scale. */
export type AnomalySeverityBucket = 'medium' | 'high';

/**
 * Faz 21.11 batch3 contract — discriminated kind for domain-specific
 * a11y announcements (Codex thread `019e10a5` iter-2). Default `'flat'`
 * preserves the legacy 1D series semantics (Bar / Line / Area / Pie /
 * Funnel / Waterfall / Heatmap / Scatter / 3D wrappers). Future
 * sequential PRs (Radar, Treemap+Sunburst, Sankey) ship their own
 * detectors and emit the matching `kind` so the default formatter
 * picks the right template.
 *
 * `'3d'` is reserved for future Mahalanobis-style 3D detectors —
 * Scatter3D / Surface3D / Lines3D / Globe wrappers don't ship a
 * built-in 3D detector in P1, but consumer-supplied summaries can
 * already tag themselves so the formatter knows not to fall back to
 * the flat x/y template.
 */
export type AnomalySummaryKind =
  | 'flat'
  | 'radar'
  | 'hierarchical'
  | 'sankey-node'
  | 'sankey-edge'
  | '3d';

/**
 * Renderer-agnostic anomaly payload — the contract the
 * `ChartAriaLive` live region (and any other a11y consumer) reads
 * to announce an anomaly summary. NOT a markup; this is the
 * SEMANTIC view of an outlier.
 *
 * Stable across detector swaps (IQR, zscore, MAD, etc.). The
 * `severity` numeric scale is detector-specific — consumers should
 * lean on `severityBucket` for cross-detector portable UI.
 *
 * Faz 21.11 batch3 contract (Codex thread `019e10a5` iter-2): the
 * optional `kind` discriminator + per-domain metadata fields let
 * the default formatter announce Radar / hierarchical (Treemap +
 * Sunburst) / Sankey anomalies with the correct semantic copy
 * without breaking the legacy flat x/y consumers (which omit `kind`
 * and continue to receive the existing announcement template).
 */
export interface AnomalySummary {
  /** Stable id, scoped by `idPrefix`. Mirrors the marker id. */
  id: string;
  /** Source-row x value (string for categorical axes). */
  x: number | string;
  /** Source-row y value. */
  y: number;
  /** Pre-formatted y string using the consumer's `valueFormatter`
   * (or the legacy `toFixed(2)` fallback). Keeps the SR
   * announcement free of locale/precision drift. */
  formattedY: string;
  /** Semantic direction — `'above'` for upper-fence violation,
   * `'below'` for lower-fence. */
  direction: AnomalyDirection;
  /** Continuous severity score (distance past the fence in y-space).
   * Detector-specific — IQR returns absolute distance from the
   * fence; zscore would return σ-distance. */
  severity: number;
  /** Categorical severity. Top-quartile of detected anomalies →
   * `'high'`; else `'medium'`. Single-anomaly fixtures always get
   * `'high'` — a single outlier IS the worst one in the set. */
  severityBucket: AnomalySeverityBucket;
  /** Pre-baked SR-friendly description. Consumers MAY override
   * via `formatAnomalyAnnouncement` on `ChartAriaLive`. */
  ariaLabel: string;
  /**
   * Domain discriminator (Faz 21.11 batch3). Default `'flat'` when
   * omitted — preserves backwards-compatible 1D series semantics.
   */
  kind?: AnomalySummaryKind;

  /* ---- Radar (Faz 21.11 batch3 — `kind: 'radar'`) ---- */
  /** Series this anomaly belongs to (multi-series radar). */
  seriesName?: string;
  /** Numeric indicator index in the chart's `indicators` array. */
  indicatorIndex?: number;
  /** Indicator's display name (e.g. `"Latency"`). */
  indicatorName?: string;
  /** Indicator unit string (e.g. `"ms"`, `"%"`). */
  axisUnit?: string;

  /* ---- Hierarchical: Treemap / Sunburst (`kind: 'hierarchical'`) ---- */
  /** Ancestor → leaf path (e.g. `["Region", "Team", "Segment"]`). */
  path?: string[];
  /** Depth in the hierarchy (root = 0). */
  depth?: number;

  /* ---- Sankey (`kind: 'sankey-node' | 'sankey-edge'`) ---- */
  /** Sankey node identifier (when `kind === 'sankey-node'`). */
  nodeId?: string;
  /** Sankey edge identifier (when `kind === 'sankey-edge'`). */
  edgeId?: string;
  /** Sankey source-node display name (edge anomalies). */
  source?: string;
  /** Sankey target-node display name (edge anomalies). */
  target?: string;
  /** Sankey flow value through this node / edge. */
  flowValue?: number;
}

export interface ComputeAnomalySummaryOptions {
  data: AnomalyOverlayPoint[];
  /** Detection method (v1 supports 'iqr' only). */
  method?: 'iqr' | 'zscore';
  /** IQR fence multiplier. Default 1.5 (Tukey). */
  k?: number;
  /** Optional id prefix to scope multiple summaries per chart.
   * MUST match the `idPrefix` passed to `computeAnomalyOverlay` if
   * the consumer wants summary ids to align with markup ids. */
  idPrefix?: string;
  /** Same `valueFormatter` contract as `computeAnomalyOverlay` —
   * keeps `formattedY` consistent with the inline pill text. */
  valueFormatter?: (value: number) => string;
  /**
   * Severity threshold ratio for the 'high' bucket. The
   * top-`severityHighFraction` slice of detected anomalies
   * (sorted by descending severity) gets `severityBucket: 'high'`;
   * the rest get `'medium'`.
   * @default 0.25 — top quartile is "high"
   */
  severityHighFraction?: number;
}

/**
 * Compute an a11y-friendly anomaly summary list. Pure: no React,
 * no DOM, no markup emission. Built on top of `collectAnomalyHits`
 * so the detector logic stays single-source.
 *
 * Codex iter-1 §1+§7 absorb. The previous PR-A2b-ui pattern was
 * for consumers to walk `ChartMarkup[]` and synthesize a summary —
 * but in `pill` mode that double-counts (marker + pill share an
 * anomaly), and the markup shape doesn't carry severity/direction
 * metadata. This helper returns the canonical semantic summary so
 * `ChartAriaLive` (and any future a11y consumer) reads from one
 * source.
 */
export function computeAnomalySummary(options: ComputeAnomalySummaryOptions): AnomalySummary[] {
  const {
    data,
    method = 'iqr',
    k = 1.5,
    idPrefix = 'anomaly',
    valueFormatter,
    severityHighFraction = 0.25,
  } = options;
  void method; // forward compat — same as computeAnomalyOverlay

  const formatValue = valueFormatter ?? ((v: number) => v.toFixed(2));
  const hits = collectAnomalyHits(data, k);
  if (hits.length === 0) return [];

  // Severity bucketing: rank anomalies by severity descending; the
  // top `severityHighFraction` (default 25%) get `'high'`. Single-
  // anomaly fixtures: that one IS the highest, so it gets 'high'.
  const sortedSeverities = hits.map((h) => h.severity).sort((a, b) => b - a);
  const highCount = Math.max(1, Math.ceil(sortedSeverities.length * severityHighFraction));
  const highCutoff = sortedSeverities[highCount - 1] ?? sortedSeverities[0] ?? Infinity;

  return hits.map((hit) => {
    const direction: AnomalyDirection = hit.direction === '↑' ? 'above' : 'below';
    const formattedY = formatValue(hit.point.y);
    const severityBucket: AnomalySeverityBucket = hit.severity >= highCutoff ? 'high' : 'medium';
    return {
      id: `${idPrefix}-${hit.sourceIndex}`,
      x: hit.point.x,
      y: hit.point.y,
      formattedY,
      direction,
      severity: hit.severity,
      severityBucket,
      ariaLabel: `Outlier ${direction} expected at x=${String(hit.point.x)}, y=${formattedY} (${severityBucket} severity)`,
    };
  });
}
