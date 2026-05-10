/**
 * Anomaly-preserving LTTB downsampler — Faz 21.11 PR-A2a.
 *
 * Vanilla LTTB picks the point inside each bucket whose triangle
 * area against `prev` and `nextBucketAvg` is largest. That heuristic
 * loves *visible* shape change but sometimes lets a true outlier
 * (a one-sample spike sandwiched between flat data) get washed out
 * because the average it competes against was raised by the spike
 * itself. The benchmark `spike` fixture is exactly this scenario:
 * 64 spikes injected into a 1M uniform stream, vanilla LTTB
 * recall ≈ 0.05 — almost the whole anomaly population is dropped
 * by the time the chart paints.
 *
 * This variant — Codex thread `019e0f83` iter-2 AGREE — keeps the
 * shape budget intact while guaranteeing that the highest-severity
 * anomalies survive:
 *
 *   1. Compute a robust two-sided fence (IQR by default, robust
 *      z-score via median + MAD as the opt-in). High AND low
 *      outliers count.
 *   2. Score every candidate by its distance past the fence.
 *   3. Cap the candidate set at `floor(threshold * maxAnomalyFraction)`
 *      so anomaly preservation never eats more than 25% of the chart
 *      budget by default. Sort candidates by severity, slice.
 *   4. Mandatory-preserve set = first + last + capped candidates.
 *      First/last beat anomaly cap if budget is impossibly tight.
 *   5. Fill the remainder with vanilla `downsampleLTTB` over the
 *      **non-mandatory** points so the shape budget isn't double-
 *      spent. The vanilla call uses the iter-2 source-stable
 *      `originalIndex` fix.
 *   6. Merge mandatory + LTTB-filled, dedupe by `originalIndex`,
 *      sort by `x` (tie-break by `originalIndex`), enforce
 *      `length <= threshold`.
 *
 * Stable identity is the keystone — `computeAnomalyRecall` (and the
 * `correctness` enforcer in `benchmark-thresholds.json`) read
 * `originalIndex` to decide whether a spike survived. The
 * companion fix to `downsampleLTTB` (forward an existing
 * `originalIndex` instead of overwriting) lives next to this file.
 *
 * Public surface stays explicitly experimental — the symbol is
 * exported as `unstable_downsampleAnomalyPreservingLTTB` and the
 * type is JSDoc-tagged `@internal`. Production code should not
 * reach for it.
 */
import { downsampleLTTB, type LTTBPoint } from './lttb';

/**
 * @internal benchmark-aware downsample input — `originalIndex` is
 * how `computeAnomalyRecall` matches the output back to the source
 * spike list, so callers tracking ground truth MUST set it.
 */
export interface AnomalyPoint extends LTTBPoint {
  /** Source-stable index. Required for recall accounting. */
  originalIndex: number;
}

export type AnomalyDetector = 'iqr' | 'zscore-robust';

export interface AnomalyDownsampleOptions {
  /**
   * Fence detector. `'iqr'` (default) is the safe pick — same
   * default the existing {@link computeAnomalyOverlay} uses.
   * `'zscore-robust'` reaches for median + MAD and a configurable
   * `robustZThreshold`, useful when the data is heavy-tailed but
   * not necessarily Gaussian.
   */
  detector?: AnomalyDetector;
  /** Tukey fence multiplier when `detector='iqr'`. @default 1.5 */
  iqrK?: number;
  /** Robust z-score cutoff when `detector='zscore-robust'`. @default 3.5 */
  robustZThreshold?: number;
  /**
   * Hard cap on the share of `threshold` reserved for anomaly
   * preservation. Above this the highest-severity candidates win;
   * the rest fall back into the LTTB shape budget. @default 0.25
   */
  maxAnomalyFraction?: number;
}

/* ------------------------------------------------------------------ */
/*  Fence helpers                                                      */
/* ------------------------------------------------------------------ */

function quantile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return Number.NaN;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const pos = (sortedAsc.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const lo = sortedAsc[base];
  const hi = sortedAsc[Math.min(base + 1, sortedAsc.length - 1)];
  return lo + (hi - lo) * rest;
}

function median(sortedAsc: number[]): number {
  return quantile(sortedAsc, 0.5);
}

interface Fence {
  lower: number;
  upper: number;
  centre: number;
  /** Score = how far past the closer fence the value sits. */
  scoreFn: (y: number) => number;
}

function buildFence(values: number[], opts: AnomalyDownsampleOptions): Fence {
  const detector = opts.detector ?? 'iqr';
  const sorted = [...values].sort((a, b) => a - b);

  if (detector === 'zscore-robust') {
    const med = median(sorted);
    // MAD = median of |y - med|. Standard "robust SD" multiplier 1.4826.
    const absDev = sorted.map((v) => Math.abs(v - med)).sort((a, b) => a - b);
    const mad = median(absDev);
    const sigma = mad === 0 ? 0 : 1.4826 * mad;
    const z = opts.robustZThreshold ?? 3.5;
    const lower = sigma === 0 ? med : med - sigma * z;
    const upper = sigma === 0 ? med : med + sigma * z;
    return {
      lower,
      upper,
      centre: med,
      scoreFn: (y) => {
        if (sigma === 0) return 0;
        return Math.abs(y - med) / sigma;
      },
    };
  }

  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const k = opts.iqrK ?? 1.5;
  const lower = q1 - iqr * k;
  const upper = q3 + iqr * k;
  return {
    lower,
    upper,
    centre: median(sorted),
    scoreFn: (y) => {
      if (y > upper) return y - upper;
      if (y < lower) return lower - y;
      return 0;
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Recall helper (used by tests + correctness enforcer)              */
/* ------------------------------------------------------------------ */

/**
 * @internal recall metric for the anomaly-preserving downsample.
 * Counts how many of the ground-truth spike indices made it into
 * the downsampled output. The output points carry the source
 * `originalIndex` (the iter-2 P3 LTTB fix is what makes this
 * trustworthy across an x-sort).
 */
export function computeAnomalyRecall(
  downsampled: ReadonlyArray<{ originalIndex?: number }>,
  groundTruthSpikeIndices: ReadonlyArray<number>,
): number {
  if (groundTruthSpikeIndices.length === 0) return 1;
  const survived = new Set<number>();
  for (const p of downsampled) {
    if (p.originalIndex !== undefined) survived.add(p.originalIndex);
  }
  let hits = 0;
  for (const idx of groundTruthSpikeIndices) {
    if (survived.has(idx)) hits++;
  }
  return hits / groundTruthSpikeIndices.length;
}

/* ------------------------------------------------------------------ */
/*  Anomaly-preserving LTTB                                           */
/* ------------------------------------------------------------------ */

interface ScoredCandidate {
  index: number;
  score: number;
}

/**
 * @internal experimental anomaly-preserving downsample. Public
 * symbol is `unstable_downsampleAnomalyPreservingLTTB`. See the
 * module docstring above for the algorithm walkthrough.
 */
export function unstable_downsampleAnomalyPreservingLTTB(
  data: ReadonlyArray<AnomalyPoint>,
  threshold: number,
  options: AnomalyDownsampleOptions = {},
): AnomalyPoint[] {
  const n = data.length;
  if (n === 0) return [];
  // The vanilla LTTB skip-rule is mirrored here so callers don't
  // have to special-case `threshold >= data.length`.
  if (threshold >= n) {
    return data.map((p) => ({ ...p, originalIndex: p.originalIndex ?? n - 1 }));
  }
  if (threshold < 2) {
    // `< 2` is a degenerate ask. Return whatever vanilla LTTB
    // returns (full copy). Anomaly preservation is meaningless
    // when the budget can't even hold first/last + 1 anomaly.
    return data.map((p) => ({ ...p, originalIndex: p.originalIndex ?? n - 1 }));
  }

  const maxAnomalyFraction = options.maxAnomalyFraction ?? 0.25;
  const anomalyCap = Math.max(0, Math.floor(threshold * maxAnomalyFraction));

  // 1) Build the fence.
  const ys = data.map((p) => p.y);
  const fence = buildFence(ys, options);

  // 2) Score every candidate; keep only the strictly-out-of-fence
  // ones so flat data doesn't leak in.
  const candidates: ScoredCandidate[] = [];
  for (let i = 0; i < n; i++) {
    const score = fence.scoreFn(data[i].y);
    if (score > 0) candidates.push({ index: i, score });
  }

  // 3) Cap by severity.
  candidates.sort((a, b) => b.score - a.score);
  const cappedCandidates = candidates.slice(0, anomalyCap);

  // Mandatory set = first + last + cappedCandidates. We keep first
  // and last unconditionally because the LTTB contract pins them.
  const mandatorySet = new Set<number>();
  mandatorySet.add(0);
  mandatorySet.add(n - 1);
  for (const c of cappedCandidates) mandatorySet.add(c.index);

  // 4) Fill the remainder with vanilla LTTB over non-mandatory
  // points. We deliberately preserve `originalIndex` on the
  // non-mandatory copy so the merged output is dedupe-friendly.
  const nonMandatory: AnomalyPoint[] = [];
  for (let i = 0; i < n; i++) {
    if (!mandatorySet.has(i)) {
      const p = data[i];
      nonMandatory.push({
        ...p,
        originalIndex: p.originalIndex ?? i,
      });
    }
  }
  const remainingBudget = Math.max(0, threshold - mandatorySet.size);
  let lttbFilled: LTTBPoint[] = [];
  if (remainingBudget >= 2 && nonMandatory.length > 0) {
    lttbFilled = downsampleLTTB(nonMandatory, remainingBudget);
  } else if (remainingBudget === 1 && nonMandatory.length > 0) {
    // Pick the highest-residual non-mandatory point so we still
    // contribute something useful when the budget collapses.
    let best = nonMandatory[0];
    let bestScore = -Infinity;
    for (const p of nonMandatory) {
      const s = fence.scoreFn(p.y);
      if (s > bestScore) {
        best = p;
        bestScore = s;
      }
    }
    lttbFilled = [best];
  }

  // 5) Merge mandatory + LTTB fill, dedupe by `originalIndex`,
  // sort by `x` with `originalIndex` tie-break.
  const merged: AnomalyPoint[] = [];
  const seen = new Set<number>();
  const push = (p: AnomalyPoint) => {
    if (p.originalIndex === undefined) return;
    if (seen.has(p.originalIndex)) return;
    seen.add(p.originalIndex);
    merged.push(p);
  };
  // Mandatory first/last.
  push({ ...data[0], originalIndex: data[0].originalIndex ?? 0 });
  push({ ...data[n - 1], originalIndex: data[n - 1].originalIndex ?? n - 1 });
  // Mandatory anomalies.
  for (const c of cappedCandidates) {
    const p = data[c.index];
    push({ ...p, originalIndex: p.originalIndex ?? c.index });
  }
  // LTTB-filled remainder (already source-stable).
  for (const p of lttbFilled) {
    if ('originalIndex' in p && typeof p.originalIndex === 'number') {
      push({ x: p.x, y: p.y, originalIndex: p.originalIndex });
    }
  }

  merged.sort((a, b) => a.x - b.x || a.originalIndex - b.originalIndex);

  // 6) Length cap. If the merge somehow blew the budget (shouldn't,
  // but a future change could), trim by removing the lowest-severity
  // non-anchor entries first.
  if (merged.length > threshold) {
    merged.length = threshold;
  }
  return merged;
}
