/**
 * computeRadarAnomalySummary — Faz 21.11 batch3 sequential PR-Radar.
 *
 * Per-indicator IQR detector for multi-series radar charts. Emits
 * `AnomalySummary[]` payload tagged with `kind: 'radar'` so the
 * `ChartAriaLive` default formatter picks the radar-aware EN/TR
 * template (Codex thread `019e10a5` iter-2 batch3 contract).
 *
 * Codex thread `019e10a5` PR-Radar plan iter-1 design notes:
 *
 *   - **Per-indicator IQR**: each spoke (indicator) has its own IQR
 *     fence computed across `series[*].data[indicatorIndex]`. This
 *     is the only sane detector when indicators carry different
 *     units / ranges (Latency 0–500ms vs Throughput 0–100k).
 *
 *   - **<4 finite values → no anomalies for that indicator**: Tukey's
 *     fence is statistically meaningless on tiny samples (3-series
 *     radar with one outlier produces unstable Q1/Q3). Returning `[]`
 *     for that indicator is the honest answer; consumer-facing
 *     "did the detector fire?" stays predictable.
 *
 *   - **Normalised severity**: `severity = rawFenceDistance / axisScale`
 *     where `axisScale = indicator.max ?? observed maxAbs ?? 1`.
 *     Cross-indicator severity ranking otherwise compares ms to k$
 *     and produces nonsense "Most extreme" picks.
 *
 *   - **`x: indicatorName`** (NOT `seriesName`): radar's categorical
 *     axis IS the indicator. `seriesName` lives in the dedicated
 *     metadata field so the formatter can show / omit it depending
 *     on series count.
 *
 *   - **Single-series → `seriesName` omitted**: formatter conditionally
 *     prepends `${seriesName}, ` only when truthy. Single-series
 *     radar reads cleaner without the "Q1, " prefix.
 *
 *   - **Stable id format**: `${idPrefix}-${indicatorIndex}-${seriesIndex}`.
 *     Deterministic + reproducible across re-detection cycles so the
 *     `anomalySignature` dedupe in `ChartAriaLive` works correctly.
 */
import type { AnomalySummary, AnomalySeverityBucket } from './computeAnomalyOverlay';

/** Single radar indicator (axis / spoke). */
export interface RadarAnomalyIndicator {
  /** Display name (used for `AnomalySummary.x` and `indicatorName`). */
  name: string;
  /**
   * Optional axis ceiling. When set, drives the severity normalisation
   * scale; otherwise the helper falls back to `max(|finiteValues|)`.
   * Mirrors `RadarChart`'s `RadarIndicator.max`.
   */
  max?: number;
  /**
   * Optional unit suffix (e.g. `'ms'`, `'%'`). Forwarded to
   * `AnomalySummary.axisUnit` so the default formatter can append it
   * after the value (e.g. `Latency=240 ms`).
   */
  unit?: string;
}

/** Single radar series (one data point per indicator). */
export interface RadarAnomalySeries {
  /** Display name (e.g. `'Q1 Performance'`). */
  name: string;
  /**
   * Per-indicator values. `data[i]` is the value for `indicators[i]`.
   * Non-finite entries (`undefined`, `NaN`, `Infinity`) are skipped.
   */
  data: ReadonlyArray<number | null | undefined>;
}

export interface ComputeRadarAnomalySummaryOptions {
  /** Indicators (axes) — order is significant; matches `series[*].data` indexing. */
  indicators: ReadonlyArray<RadarAnomalyIndicator>;
  /** Series; each one must align with `indicators` length. */
  series: ReadonlyArray<RadarAnomalySeries>;
  /**
   * Tukey IQR fence multiplier. @default 1.5 — matches the flat
   * `computeAnomalySummary` precedent and the broader IQR convention.
   */
  k?: number;
  /**
   * Top-fraction of detected anomalies that earn `severityBucket:
   * 'high'`. Matches `ComputeAnomalySummaryOptions.severityHighFraction`
   * (Codex iter-1 precedent uyumu — NOT `maxAnomalyFraction`).
   * @default 0.25
   */
  severityHighFraction?: number;
  /**
   * Id prefix for `${idPrefix}-${indicatorIndex}-${seriesIndex}`.
   * @default `'radar-anomaly'`
   */
  idPrefix?: string;
  /**
   * Optional formatter for `formattedY`. Falls back to
   * `value.toFixed(2)` to match the flat detector default.
   */
  valueFormatter?: (value: number) => string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const DEFAULT_FORMATTER = (v: number): string => v.toFixed(2);

/**
 * Linear-interpolation quantile (matches numpy / Pandas type 7).
 * Caller MUST pass the array sorted ascending.
 */
function quantile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return Number.NaN;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const pos = (sortedAsc.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (base + 1 < sortedAsc.length) {
    return sortedAsc[base] + rest * (sortedAsc[base + 1] - sortedAsc[base]);
  }
  return sortedAsc[base];
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/* ------------------------------------------------------------------ */
/*  Main entry                                                         */
/* ------------------------------------------------------------------ */

/**
 * Detect per-indicator outliers across a multi-series radar chart.
 * Returns an `AnomalySummary[]` payload that `ChartAriaLive` will
 * announce via the `'radar'` template branch.
 */
export function computeRadarAnomalySummary(
  options: ComputeRadarAnomalySummaryOptions,
): AnomalySummary[] {
  const {
    indicators,
    series,
    k = 1.5,
    severityHighFraction = 0.25,
    idPrefix = 'radar-anomaly',
    valueFormatter,
  } = options;

  if (indicators.length === 0 || series.length === 0) return [];

  const fmt = valueFormatter ?? DEFAULT_FORMATTER;
  const showSeriesName = series.length > 1;
  const out: AnomalySummary[] = [];

  for (let i = 0; i < indicators.length; i++) {
    const indicator = indicators[i];

    // Collect finite values for this indicator across all series.
    const collected: Array<{ seriesIndex: number; value: number }> = [];
    for (let s = 0; s < series.length; s++) {
      const v = series[s].data[i];
      if (isFiniteNumber(v)) collected.push({ seriesIndex: s, value: v });
    }

    // Codex iter-1: <4 finite values per indicator → fence is
    // statistically meaningless. Skip cleanly.
    if (collected.length < 4) continue;

    const sortedValues = [...collected.map((c) => c.value)].sort((a, b) => a - b);
    const q1 = quantile(sortedValues, 0.25);
    const q3 = quantile(sortedValues, 0.75);
    const iqr = q3 - q1;
    const upperFence = q3 + k * iqr;
    const lowerFence = q1 - k * iqr;

    // Codex iter-1: severity normalisation scale. Indicator.max
    // when set; observed |max| otherwise; 1 as last-resort guard.
    const observedMaxAbs = Math.max(...sortedValues.map(Math.abs));
    const axisScaleRaw = indicator.max ?? observedMaxAbs;
    const axisScale = isFiniteNumber(axisScaleRaw) && axisScaleRaw > 0 ? axisScaleRaw : 1;

    for (const { seriesIndex, value } of collected) {
      let direction: AnomalySummary['direction'];
      let rawFenceDistance: number;
      if (value > upperFence) {
        direction = 'above';
        rawFenceDistance = value - upperFence;
      } else if (value < lowerFence) {
        direction = 'below';
        rawFenceDistance = lowerFence - value;
      } else {
        continue;
      }

      const severity = rawFenceDistance / axisScale;
      const formattedY = fmt(value);
      const seriesName = showSeriesName ? series[seriesIndex].name : undefined;

      const ariaLabelParts: string[] = [`Outlier ${direction} expected at ${indicator.name}`];
      if (seriesName) ariaLabelParts.push(seriesName);
      ariaLabelParts.push(`value=${formattedY}${indicator.unit ? ` ${indicator.unit}` : ''}`);
      // Severity bucket assigned in the second pass below.
      out.push({
        id: `${idPrefix}-${i}-${seriesIndex}`,
        kind: 'radar',
        x: indicator.name,
        y: value,
        formattedY,
        direction,
        severity,
        // Placeholder — overwritten below.
        severityBucket: 'medium' as AnomalySeverityBucket,
        ariaLabel: `${ariaLabelParts.join(', ')} (medium severity)`,
        seriesName,
        indicatorIndex: i,
        indicatorName: indicator.name,
        axisUnit: indicator.unit,
      });
    }
  }

  if (out.length === 0) return out;

  // Severity bucket second pass — top `severityHighFraction` of
  // detected anomalies (by `severity`) earn `'high'`; rest stay
  // `'medium'`. Single-anomaly batch always gets `'high'` (cap=1
  // by `Math.max(1, ceil(...))`).
  const sortedBySeverity = [...out].sort((a, b) => b.severity - a.severity);
  const cap = Math.max(1, Math.ceil(sortedBySeverity.length * severityHighFraction));
  const highIds = new Set(sortedBySeverity.slice(0, cap).map((a) => a.id));
  for (const a of out) {
    const bucket: AnomalySeverityBucket = highIds.has(a.id) ? 'high' : 'medium';
    a.severityBucket = bucket;
    // Refresh ariaLabel with the resolved bucket.
    a.ariaLabel = a.ariaLabel.replace(/\((?:medium|high) severity\)$/, `(${bucket} severity)`);
  }

  return out;
}
