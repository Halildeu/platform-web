/**
 * Benchmark fixtures for the WebGL Million-Point Path — Faz 21.11
 * PR-A1.
 *
 * All fixtures are produced by a {@link mulberry32}-seeded RNG so the
 * exact same point cloud regenerates on every machine and every CI
 * run. This means render-time numbers are directly comparable across
 * commits, laptops, and CI artifacts — no "well it was faster on my
 * machine" noise.
 *
 * Codex iter-2 consensus (thread `019e0e7a`): real-world datasets
 * (NYC taxi, financial ticks) are NOT included here — license, size,
 * and determinism become a problem at PR-time. Synthetic + injected
 * anomalies cover the same shape space.
 *
 * Volume tiers we expose:
 *   - 50_000   "medium"  — Canvas + LTTB sweet spot
 *   - 250_000  "large"   — WebGL clear win
 *   - 1_000_000 "million"— PR-A1 leadership ceiling
 *
 * Fixture variants:
 *   - uniform      — flat random scatter, baseline ceiling
 *   - clustered    — Gaussian clusters, exercises GPU sort/blend
 *   - timeseries   — monotonic x + noisy y, exercises lineGL path
 *   - spike        — uniform with N injected outliers, exercises the
 *                    PR-A2 anomaly-preserving LTTB later on
 */
import { gaussian, mulberry32 } from './seeded-rng';

/** A single 2D point in the layout `(x, y)`. WebGL adapters and LTTB
 *  both consume this shape. */
export interface BenchmarkPoint2D {
  x: number;
  y: number;
}

/** A single time-series sample. `t` is a monotonic ms timestamp; `v`
 *  is the value at that instant. */
export interface BenchmarkTimePoint {
  t: number;
  v: number;
}

/** Benchmark volume tiers — exact counts so per-tier render targets
 *  in the KPI table stay traceable. */
export const BENCHMARK_TIERS = {
  medium: 50_000,
  large: 250_000,
  million: 1_000_000,
} as const;

export type BenchmarkTier = keyof typeof BENCHMARK_TIERS;

/* ------------------------------------------------------------------ */
/*  Generators                                                         */
/* ------------------------------------------------------------------ */

/** Uniform scatter `[0, 1) × [0, 1)`. Deterministic. */
export function generateUniformScatter(n: number, seed = 0xc001d00d): BenchmarkPoint2D[] {
  const rng = mulberry32(seed);
  const out = new Array<BenchmarkPoint2D>(n);
  for (let i = 0; i < n; i++) {
    out[i] = { x: rng(), y: rng() };
  }
  return out;
}

/** Clustered scatter — `clusterCount` Gaussian blobs at random
 *  centres. Models customer-segment / sensor-grid shapes. */
export function generateClusteredScatter(
  n: number,
  clusterCount = 8,
  seed = 0xbadcafe,
): BenchmarkPoint2D[] {
  const rng = mulberry32(seed);
  const centres: BenchmarkPoint2D[] = [];
  for (let i = 0; i < clusterCount; i++) {
    centres.push({ x: rng(), y: rng() });
  }
  const out = new Array<BenchmarkPoint2D>(n);
  for (let i = 0; i < n; i++) {
    const c = centres[i % clusterCount];
    out[i] = {
      x: gaussian(rng, c.x, 0.04),
      y: gaussian(rng, c.y, 0.04),
    };
  }
  return out;
}

/** Monotonic time series with bounded noise — feeds the LineGL path. */
export function generateTimeSeries(
  n: number,
  baseValue = 100,
  noiseStddev = 5,
  seed = 0xf00dbabe,
): BenchmarkTimePoint[] {
  const rng = mulberry32(seed);
  const out = new Array<BenchmarkTimePoint>(n);
  let v = baseValue;
  for (let i = 0; i < n; i++) {
    v += gaussian(rng, 0, noiseStddev * 0.1); // random walk drift
    out[i] = { t: i, v: v + gaussian(rng, 0, noiseStddev) };
  }
  return out;
}

/** Uniform scatter with `spikeCount` injected outliers placed at
 *  deterministic indices. Used for PR-A2's anomaly-preserving LTTB
 *  recall test ("the spike must survive downsampling"). */
export function generateSpikeScatter(
  n: number,
  spikeCount = 64,
  seed = 0x5eedc1f,
): { points: BenchmarkPoint2D[]; spikeIndices: number[] } {
  const points = generateUniformScatter(n, seed);
  const stride = Math.max(1, Math.floor(n / spikeCount));
  const spikeIndices: number[] = [];
  for (let i = 0; i < spikeCount; i++) {
    const idx = i * stride;
    if (idx < n) {
      // Push the outlier far above the [0, 1) baseline so any
      // downsample that drops it loses an obvious feature.
      points[idx] = { x: points[idx].x, y: 10 + i * 0.5 };
      spikeIndices.push(idx);
    }
  }
  return { points, spikeIndices };
}

/**
 * Build the entire scatter benchmark suite for a tier (uniform +
 * clustered + spike). Useful for one-line story fixtures.
 */
export function generateScatterSuite(tier: BenchmarkTier) {
  const n = BENCHMARK_TIERS[tier];
  return {
    tier,
    pointCount: n,
    uniform: generateUniformScatter(n),
    clustered: generateClusteredScatter(n),
    spike: generateSpikeScatter(n),
  };
}
