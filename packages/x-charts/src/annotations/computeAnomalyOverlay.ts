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
  const formatValue = valueFormatter ?? ((v: number) => v.toFixed(2));

  // First pass: collect every outlier with its severity so we can
  // (a) emit a marker for each (cap-free) and (b) sort the pill
  // candidates by severity before applying `maxPills`.
  interface AnomalyHit {
    sourceIndex: number;
    point: AnomalyOverlayPoint;
    direction: '↑' | '↓';
    severity: number;
  }
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
