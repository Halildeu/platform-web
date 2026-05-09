/**
 * Benchmark fixture generator tests (Faz 21.11 PR-A1).
 *
 * Same-seed determinism is the primary contract — without it the
 * "1M scatter render < 1.5s" KPI in the PR-A KPI matrix loses its
 * cross-machine comparability.
 */
import { describe, expect, it } from 'vitest';
import {
  BENCHMARK_TIERS,
  generateClusteredScatter,
  generateScatterSuite,
  generateSpikeScatter,
  generateTimeSeries,
  generateUniformScatter,
} from '../fixtures';

describe('generateUniformScatter', () => {
  it('produces N points with finite [0, 1) coordinates', () => {
    const points = generateUniformScatter(10_000);
    expect(points.length).toBe(10_000);
    for (const p of points.slice(0, 100)) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThan(1);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThan(1);
    }
  });

  it('is deterministic across runs (same seed → same output)', () => {
    const a = generateUniformScatter(100, 0xabcd);
    const b = generateUniformScatter(100, 0xabcd);
    expect(a).toEqual(b);
  });
});

describe('generateClusteredScatter', () => {
  it('produces N points across the requested cluster count', () => {
    const points = generateClusteredScatter(10_000, 8);
    expect(points.length).toBe(10_000);
  });

  it('different cluster counts yield different fixtures (same seed)', () => {
    const a = generateClusteredScatter(100, 4, 0x77);
    const b = generateClusteredScatter(100, 8, 0x77);
    expect(a).not.toEqual(b);
  });
});

describe('generateTimeSeries', () => {
  it('produces N samples with monotonic t', () => {
    const series = generateTimeSeries(1_000);
    expect(series.length).toBe(1_000);
    for (let i = 1; i < series.length; i++) {
      expect(series[i].t).toBeGreaterThan(series[i - 1].t);
    }
  });
});

describe('generateSpikeScatter', () => {
  it('preserves the recall surface for the anomaly-aware LTTB test', () => {
    const { points, spikeIndices } = generateSpikeScatter(10_000, 64);
    expect(points.length).toBe(10_000);
    expect(spikeIndices.length).toBe(64);
    // Every claimed spike index should sit at the elevated y position.
    for (const idx of spikeIndices) {
      expect(points[idx].y).toBeGreaterThan(1);
    }
  });

  it('non-spike indices stay in the [0, 1) baseline', () => {
    const { points, spikeIndices } = generateSpikeScatter(1_000, 8);
    const spikeSet = new Set(spikeIndices);
    for (let i = 0; i < points.length; i++) {
      if (!spikeSet.has(i)) {
        expect(points[i].y).toBeLessThan(1);
      }
    }
  });
});

describe('generateScatterSuite', () => {
  it('exposes the three benchmark tiers we ship in PR-A1', () => {
    expect(BENCHMARK_TIERS.medium).toBe(50_000);
    expect(BENCHMARK_TIERS.large).toBe(250_000);
    expect(BENCHMARK_TIERS.million).toBe(1_000_000);
  });

  it('builds uniform + clustered + spike for the requested tier', () => {
    const suite = generateScatterSuite('medium');
    expect(suite.tier).toBe('medium');
    expect(suite.pointCount).toBe(50_000);
    expect(suite.uniform.length).toBe(50_000);
    expect(suite.clustered.length).toBe(50_000);
    expect(suite.spike.points.length).toBe(50_000);
  });
});
