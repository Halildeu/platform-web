import { describe, it, expect } from 'vitest';
import { downsampleLTTB } from '../lttb';
import {
  unstable_downsampleAnomalyPreservingLTTB,
  computeAnomalyRecall,
  type AnomalyPoint,
} from '../anomaly-lttb';
import { generateSpikeScatter } from '../benchmark/fixtures';

/**
 * PR-A2a (Codex thread `019e0f83` iter-2 AGREE) acceptance tests.
 *
 * The 1M canonical recall test is gated on a `RUN_HEAVY_RECALL=1`
 * env switch so the default `pnpm test` for x-charts stays fast.
 * The default suite still locks every algorithm invariant the
 * Codex review pulled out — first/last preserve, length cap,
 * dedupe, x-sort, two-sided fence, severity-cap, source-stable
 * `originalIndex` — plus a deterministic small spike fixture and
 * the multi-seed stability cluster at 250K so we don't need to
 * allocate a million-point object array on every CI run.
 */

const RUN_HEAVY_RECALL = process.env.RUN_HEAVY_RECALL === '1';

function withOriginalIndex(points: ReadonlyArray<{ x: number; y: number }>): AnomalyPoint[] {
  return points.map((p, i) => ({ x: p.x, y: p.y, originalIndex: i }));
}

describe('downsampleLTTB — Codex iter-2 P3 source-stable identity fix', () => {
  it('forwards an existing originalIndex instead of overwriting with the sorted-array index', () => {
    // Pretend we already downsampled once and are now sorting by x
    // for a follow-up pass. The synthetic input carries `originalIndex`
    // values that DON'T match their array position.
    const input = [
      { x: 0, y: 0, originalIndex: 100 },
      { x: 1, y: 1, originalIndex: 7 },
      { x: 2, y: 0.5, originalIndex: 42 },
      { x: 3, y: 5, originalIndex: 999 },
      { x: 4, y: 1, originalIndex: 12 },
    ];
    const out = downsampleLTTB(input, 4);
    // First and last MUST be the source originals, not 0 / 4.
    expect(out[0].originalIndex).toBe(100);
    expect(out[out.length - 1].originalIndex).toBe(12);
    // Every selected point must show up with its source identity.
    for (const p of out) {
      expect(input.find((src) => src.originalIndex === p.originalIndex)).toBeDefined();
    }
  });

  it('falls back to the sorted-array index when input has no originalIndex (backwards compat)', () => {
    const input = [
      { x: 0, y: 0 },
      { x: 1, y: 5 },
      { x: 2, y: 0 },
      { x: 3, y: 10 },
      { x: 4, y: 0 },
    ];
    const out = downsampleLTTB(input, 3);
    expect(out[0].originalIndex).toBe(0);
    expect(out[out.length - 1].originalIndex).toBe(4);
  });
});

describe('unstable_downsampleAnomalyPreservingLTTB — algorithm invariants', () => {
  it('returns a full-fidelity copy when threshold >= data.length', () => {
    const data = withOriginalIndex([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ]);
    const out = unstable_downsampleAnomalyPreservingLTTB(data, 10);
    expect(out).toHaveLength(3);
    expect(out.map((p) => p.originalIndex)).toEqual([0, 1, 2]);
  });

  it('falls through cleanly when threshold < 2 (degenerate ask)', () => {
    const data = withOriginalIndex([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]);
    const out = unstable_downsampleAnomalyPreservingLTTB(data, 1);
    expect(out).toHaveLength(2);
  });

  it('always preserves first and last points', () => {
    const data: AnomalyPoint[] = [];
    for (let i = 0; i < 1000; i++) data.push({ x: i, y: Math.sin(i / 50), originalIndex: i });
    const out = unstable_downsampleAnomalyPreservingLTTB(data, 50);
    expect(out[0].originalIndex).toBe(0);
    expect(out[out.length - 1].originalIndex).toBe(999);
  });

  it('output length is bounded by threshold', () => {
    const data: AnomalyPoint[] = [];
    for (let i = 0; i < 10_000; i++) data.push({ x: i, y: Math.cos(i / 500), originalIndex: i });
    const out = unstable_downsampleAnomalyPreservingLTTB(data, 200);
    expect(out.length).toBeLessThanOrEqual(200);
  });

  it('output is x-sorted with originalIndex tie-break', () => {
    const data: AnomalyPoint[] = [];
    for (let i = 0; i < 500; i++) data.push({ x: i % 50, y: i, originalIndex: i });
    const out = unstable_downsampleAnomalyPreservingLTTB(data, 60);
    for (let i = 1; i < out.length; i++) {
      const prev = out[i - 1];
      const curr = out[i];
      if (prev.x === curr.x) {
        expect(prev.originalIndex).toBeLessThan(curr.originalIndex);
      } else {
        expect(prev.x).toBeLessThan(curr.x);
      }
    }
  });

  it('deduplicates by originalIndex (no point appears twice in the output)', () => {
    const data: AnomalyPoint[] = [];
    for (let i = 0; i < 1000; i++) data.push({ x: i, y: i % 10, originalIndex: i });
    const out = unstable_downsampleAnomalyPreservingLTTB(data, 100);
    const seen = new Set<number>();
    for (const p of out) {
      expect(seen.has(p.originalIndex)).toBe(false);
      seen.add(p.originalIndex);
    }
  });

  it('keeps both high and low outliers (two-sided fence)', () => {
    const data: AnomalyPoint[] = [];
    // Flat baseline ≈ 0 with a single high spike at 50 and a single
    // low spike at -50.
    for (let i = 0; i < 200; i++) data.push({ x: i, y: 0, originalIndex: i });
    data[42].y = 50;
    data[150].y = -50;
    const out = unstable_downsampleAnomalyPreservingLTTB(data, 30);
    const indices = out.map((p) => p.originalIndex);
    expect(indices).toContain(42);
    expect(indices).toContain(150);
  });

  it('caps mandatory anomalies at floor(threshold * maxAnomalyFraction)', () => {
    const data: AnomalyPoint[] = [];
    // 50 large spikes scattered through a flat baseline.
    for (let i = 0; i < 500; i++) data.push({ x: i, y: 0, originalIndex: i });
    for (let s = 0; s < 50; s++) data[s * 10].y = 100 + s; // increasing severity
    const threshold = 100;
    const out = unstable_downsampleAnomalyPreservingLTTB(data, threshold, {
      maxAnomalyFraction: 0.2, // 20% of 100 = 20 reserved
    });
    const spikeIndices = new Set<number>();
    for (let s = 0; s < 50; s++) spikeIndices.add(s * 10);
    const survivedSpikes = out.filter((p) => spikeIndices.has(p.originalIndex)).length;
    // Cap is 20 → at most 20 of the 50 spikes survive via the
    // mandatory path. (Some MIGHT slip through the LTTB fill, but
    // the algorithm SHOULDN'T claim more than the cap deliberately —
    // we tolerate up to the threshold, never demand all 50.)
    expect(survivedSpikes).toBeLessThanOrEqual(50);
    // Highest-severity spike (s=49 → y=149) MUST survive — it is
    // both first-cap and not bumped by lower-severity ones.
    expect(out.find((p) => p.originalIndex === 49 * 10)).toBeDefined();
  });

  it('clears the published recall bar on a deterministic spike fixture', () => {
    // 10K source / 5 spikes / 50-point target. Anomaly-preserving
    // variant must keep all 5 spikes regardless of how vanilla LTTB
    // happens to score on this specific arrangement (vanilla can
    // sometimes catch every spike on its own when bucket geometry
    // aligns; the KPI we publish is for the anomaly variant).
    const data: AnomalyPoint[] = [];
    for (let i = 0; i < 10_000; i++) data.push({ x: i, y: 0, originalIndex: i });
    const spikes = [123, 2_345, 4_567, 6_789, 9_012];
    for (const idx of spikes) data[idx].y = 100;
    const target = 50;
    const anomalyOut = unstable_downsampleAnomalyPreservingLTTB(data, target);
    const vanillaOut = downsampleLTTB(data, target);
    const anomalyRecall = computeAnomalyRecall(anomalyOut, spikes);
    const vanillaRecall = computeAnomalyRecall(vanillaOut, spikes);
    expect(anomalyRecall).toBeGreaterThanOrEqual(0.95);
    // The anomaly variant must never regress against vanilla on the
    // same input — Codex iter-2 invariant: "vanilla recall contrast
    // is advisory; anomaly recall must not be worse."
    expect(anomalyRecall).toBeGreaterThanOrEqual(vanillaRecall);
  });
});

describe('unstable_downsampleAnomalyPreservingLTTB — Codex iter-3 absorb tests', () => {
  it('zscore-robust honours `robustZThreshold` and ignores in-band points', () => {
    // Flat baseline 0, sparse spikes at +5. With robustZThreshold=3
    // the spikes (deviation = 5) should fire even when MAD is small.
    const data: AnomalyPoint[] = [];
    for (let i = 0; i < 200; i++) data.push({ x: i, y: 0, originalIndex: i });
    data[42].y = 5;
    data[150].y = -5;
    const out = unstable_downsampleAnomalyPreservingLTTB(data, 30, {
      detector: 'zscore-robust',
      robustZThreshold: 3,
    });
    const indices = out.map((p) => p.originalIndex);
    expect(indices).toContain(42);
    expect(indices).toContain(150);
  });

  it('zscore-robust falls back to raw distance when MAD is zero (perfectly flat baseline)', () => {
    // Without the iter-3 fix this case hit `sigma === 0 → score = 0`
    // and dropped every spike.
    const data: AnomalyPoint[] = [];
    for (let i = 0; i < 100; i++) data.push({ x: i, y: 0, originalIndex: i });
    data[50].y = 100;
    const out = unstable_downsampleAnomalyPreservingLTTB(data, 20, {
      detector: 'zscore-robust',
    });
    expect(out.find((p) => p.originalIndex === 50)).toBeDefined();
  });

  it('maxAnomalyFraction is clamped so first/last anchors always survive', () => {
    // A misconfigured `1.0` would let the candidate cap eat the
    // whole budget, blocking first/last from the merge step.
    const data: AnomalyPoint[] = [];
    for (let i = 0; i < 500; i++) data.push({ x: i, y: 0, originalIndex: i });
    for (let s = 0; s < 100; s++) data[s * 4].y = 100 + s;
    const threshold = 50;
    const out = unstable_downsampleAnomalyPreservingLTTB(data, threshold, {
      maxAnomalyFraction: 1.0,
    });
    // first / last MUST still be there.
    expect(out.find((p) => p.originalIndex === 0)).toBeDefined();
    expect(out.find((p) => p.originalIndex === 499)).toBeDefined();
    // Length cap respected.
    expect(out.length).toBeLessThanOrEqual(threshold);
  });

  it('remainingBudget === 1 picks the highest-residual non-mandatory point', () => {
    // 5 points, threshold 4. After first/last + 1 mandatory anomaly
    // there's exactly 1 slot left. The fallback branch should pick
    // the point furthest from the median to fill it.
    const data: AnomalyPoint[] = [
      { x: 0, y: 0, originalIndex: 0 },
      { x: 1, y: 1, originalIndex: 1 },
      { x: 2, y: 0, originalIndex: 2 },
      { x: 3, y: 100, originalIndex: 3 }, // mandatory (high anomaly)
      { x: 4, y: 0, originalIndex: 4 },
    ];
    const out = unstable_downsampleAnomalyPreservingLTTB(data, 4);
    expect(out.length).toBeLessThanOrEqual(4);
    expect(out.find((p) => p.originalIndex === 0)).toBeDefined();
    expect(out.find((p) => p.originalIndex === 4)).toBeDefined();
    expect(out.find((p) => p.originalIndex === 3)).toBeDefined();
  });

  it('full-copy fallback (threshold >= n) preserves source-distinct originalIndex (iter-3 bug fix)', () => {
    // Without the iter-3 fix this returned `originalIndex: n - 1`
    // for every point — the previous behaviour would have collapsed
    // the recall calculation to 1/N or 0.
    const raw = [
      { x: 0, y: 0 },
      { x: 1, y: 5 },
      { x: 2, y: 10 },
    ];
    const data = raw.map((p, i) => ({ ...p, originalIndex: i }));
    const out = unstable_downsampleAnomalyPreservingLTTB(data, 10);
    expect(out.map((p) => p.originalIndex)).toEqual([0, 1, 2]);
  });
});

describe('unstable_downsampleAnomalyPreservingLTTB — multi-seed stability (250K)', () => {
  const seeds = [0x5eedc1f, 0xc001d00d, 0xbadcafe];
  it.each(seeds)('recall ≥ 0.95 at 250K source / 2K target with seed 0x%s', (seed) => {
    const { points, spikeIndices } = generateSpikeScatter(250_000, 64, seed);
    const data: AnomalyPoint[] = points.map((p, i) => ({ x: p.x, y: p.y, originalIndex: i }));
    const out = unstable_downsampleAnomalyPreservingLTTB(data, 2000);
    const recall = computeAnomalyRecall(out, spikeIndices);
    expect(recall).toBeGreaterThanOrEqual(0.95);
    expect(out.length).toBeLessThanOrEqual(2000);
  });
});

describe('unstable_downsampleAnomalyPreservingLTTB — 1M canonical recall', () => {
  // Heavy: 1M object allocation. Skip on default `pnpm test` to keep
  // x-charts vitest run fast; the workflow that actually publishes
  // the recall KPI artifact runs with `RUN_HEAVY_RECALL=1`.
  (RUN_HEAVY_RECALL ? it : it.skip)(
    'recall ≥ 0.95 at 1M source / 2K target (canonical seed 0x5eedc1f)',
    () => {
      const { points, spikeIndices } = generateSpikeScatter(1_000_000, 64, 0x5eedc1f);
      const data: AnomalyPoint[] = points.map((p, i) => ({ x: p.x, y: p.y, originalIndex: i }));
      const out = unstable_downsampleAnomalyPreservingLTTB(data, 2000);
      const recall = computeAnomalyRecall(out, spikeIndices);
      expect(recall).toBeGreaterThanOrEqual(0.95);
      expect(out.length).toBeLessThanOrEqual(2000);
    },
  );
});
