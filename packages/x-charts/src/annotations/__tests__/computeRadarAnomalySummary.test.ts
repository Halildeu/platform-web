/**
 * computeRadarAnomalySummary — pure helper tests (Faz 21.11 batch3 / PR-Radar).
 *
 * Locks the per-indicator IQR detector contract Codex thread
 * `019e10a5` PR-Radar plan iter-1 mandated:
 *   - <4 finite values per indicator → no anomalies for that indicator
 *   - per-indicator IQR fence (Tukey k=1.5 default)
 *   - normalised severity (rawFenceDistance / axisScale)
 *   - axisUnit propagated into AnomalySummary metadata
 *   - id format `${idPrefix}-${indicatorIndex}-${seriesIndex}`
 *   - single-series radar omits seriesName (formatter-friendly)
 *   - severityHighFraction default 0.25 (precedent uyumu)
 */
import { describe, it, expect } from 'vitest';
import { computeRadarAnomalySummary } from '../computeRadarAnomalySummary';

describe('computeRadarAnomalySummary — empty / tiny inputs', () => {
  it('returns [] when indicators or series are empty', () => {
    expect(computeRadarAnomalySummary({ indicators: [], series: [] })).toEqual([]);
    expect(
      computeRadarAnomalySummary({
        indicators: [{ name: 'A' }],
        series: [],
      }),
    ).toEqual([]);
  });

  it('skips an indicator with <4 finite values (Tukey fence meaningless)', () => {
    const out = computeRadarAnomalySummary({
      indicators: [{ name: 'A' }],
      series: [
        { name: 's1', data: [10] },
        { name: 's2', data: [11] },
        { name: 's3', data: [100] }, // looks like a spike but n=3
      ],
    });
    expect(out).toEqual([]);
  });

  it('single-series radar always returns [] (auto via <4 finite values)', () => {
    const out = computeRadarAnomalySummary({
      indicators: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }, { name: 'E' }],
      series: [{ name: 'Q1', data: [10, 20, 30, 40, 9999] }],
    });
    expect(out).toEqual([]);
  });
});

describe('computeRadarAnomalySummary — happy-path detection', () => {
  it('flags an upper-fence outlier on a single indicator with kind=radar metadata', () => {
    const out = computeRadarAnomalySummary({
      indicators: [{ name: 'Latency', max: 500, unit: 'ms' }],
      series: [
        { name: 'Q1', data: [100] },
        { name: 'Q2', data: [110] },
        { name: 'Q3', data: [120] },
        { name: 'Q4', data: [130] },
        { name: 'Q5', data: [400] }, // upper-fence outlier
      ],
    });
    expect(out).toHaveLength(1);
    const anom = out[0];
    expect(anom.kind).toBe('radar');
    expect(anom.x).toBe('Latency');
    expect(anom.y).toBe(400);
    expect(anom.direction).toBe('above');
    expect(anom.indicatorIndex).toBe(0);
    expect(anom.indicatorName).toBe('Latency');
    expect(anom.seriesName).toBe('Q5');
    expect(anom.axisUnit).toBe('ms');
    expect(anom.severityBucket).toBe('high'); // single anomaly is always 'high'
  });

  it('flags a lower-fence outlier as direction "below"', () => {
    const out = computeRadarAnomalySummary({
      indicators: [{ name: 'Score' }],
      series: [
        { name: 's1', data: [50] },
        { name: 's2', data: [52] },
        { name: 's3', data: [51] },
        { name: 's4', data: [49] },
        { name: 's5', data: [53] },
        { name: 's6', data: [1] }, // lower-fence outlier
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].direction).toBe('below');
    expect(out[0].seriesName).toBe('s6');
  });

  it('multi-series + multi-indicator emits one summary per (indicator, series) pair', () => {
    const out = computeRadarAnomalySummary({
      indicators: [{ name: 'A' }, { name: 'B' }],
      series: [
        { name: 's1', data: [10, 100] },
        { name: 's2', data: [11, 110] },
        { name: 's3', data: [12, 120] },
        { name: 's4', data: [13, 130] },
        { name: 's5', data: [200, 9999] }, // outliers on both A and B
      ],
    });
    // s5 is outlier on both indicators → 2 summaries.
    expect(out).toHaveLength(2);
    const aIdx = out.findIndex((a) => a.indicatorName === 'A');
    const bIdx = out.findIndex((a) => a.indicatorName === 'B');
    expect(out[aIdx].seriesName).toBe('s5');
    expect(out[bIdx].seriesName).toBe('s5');
    expect(out[aIdx].indicatorIndex).toBe(0);
    expect(out[bIdx].indicatorIndex).toBe(1);
  });

  it('normalises severity using indicator.max so ordering is cross-indicator-safe', () => {
    const out = computeRadarAnomalySummary({
      indicators: [
        { name: 'Latency', max: 500, unit: 'ms' }, // axisScale=500
        { name: 'Throughput', max: 100000, unit: 'rps' }, // axisScale=100k
      ],
      series: [
        { name: 's1', data: [10, 1000] },
        { name: 's2', data: [11, 1100] },
        { name: 's3', data: [12, 1200] },
        { name: 's4', data: [13, 1300] },
        { name: 's5', data: [400, 90000] }, // both outliers
      ],
    });
    expect(out).toHaveLength(2);
    // Latency severity = (400 - upperFence_latency) / 500 ≈ 0.77
    // Throughput severity = (90000 - upperFence_throughput) / 100000 ≈ 0.88
    // Throughput should rank higher when sorted by severity.
    const sorted = [...out].sort((a, b) => b.severity - a.severity);
    expect(sorted[0].indicatorName).toBe('Throughput');
  });

  it('skips non-finite values silently (NaN / null / undefined / Infinity)', () => {
    const out = computeRadarAnomalySummary({
      indicators: [{ name: 'A' }],
      series: [
        { name: 's1', data: [10] },
        { name: 's2', data: [11] },
        { name: 's3', data: [12] },
        { name: 's4', data: [Number.NaN] },
        { name: 's5', data: [Number.POSITIVE_INFINITY] },
        { name: 's6', data: [null] },
        { name: 's7', data: [undefined] },
      ],
    });
    // Only s1-s3 are finite; <4 → skip the indicator entirely.
    expect(out).toEqual([]);
  });
});

describe('computeRadarAnomalySummary — id + idPrefix scoping', () => {
  it('default idPrefix produces ids like "radar-anomaly-{indicatorIdx}-{seriesIdx}"', () => {
    const out = computeRadarAnomalySummary({
      indicators: [{ name: 'A' }],
      series: [
        { name: 's1', data: [10] },
        { name: 's2', data: [11] },
        { name: 's3', data: [12] },
        { name: 's4', data: [13] },
        { name: 's5', data: [100] },
      ],
    });
    expect(out[0].id).toBe('radar-anomaly-0-4');
  });

  it('honours custom idPrefix', () => {
    const out = computeRadarAnomalySummary({
      indicators: [{ name: 'A' }],
      series: [
        { name: 's1', data: [10] },
        { name: 's2', data: [11] },
        { name: 's3', data: [12] },
        { name: 's4', data: [13] },
        { name: 's5', data: [100] },
      ],
      idPrefix: 'q4-radar',
    });
    expect(out[0].id).toBe('q4-radar-0-4');
  });
});

describe('computeRadarAnomalySummary — severityHighFraction bucketing', () => {
  it('default 0.25 → top quarter of detected anomalies become "high"', () => {
    // Build 4 outliers with monotonically increasing severity.
    const out = computeRadarAnomalySummary({
      indicators: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }],
      series: [
        { name: 's1', data: [10, 10, 10, 10] },
        { name: 's2', data: [11, 11, 11, 11] },
        { name: 's3', data: [12, 12, 12, 12] },
        { name: 's4', data: [13, 13, 13, 13] },
        { name: 's5', data: [100, 200, 300, 400] }, // 4 outliers, increasing severity
      ],
    });
    // 4 outliers × 0.25 = 1 high.
    const high = out.filter((a) => a.severityBucket === 'high');
    expect(high).toHaveLength(1);
    expect(high[0].y).toBe(400);
  });

  it('custom severityHighFraction tightens the high bucket', () => {
    const out = computeRadarAnomalySummary({
      indicators: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }],
      series: [
        { name: 's1', data: [10, 10, 10, 10] },
        { name: 's2', data: [11, 11, 11, 11] },
        { name: 's3', data: [12, 12, 12, 12] },
        { name: 's4', data: [13, 13, 13, 13] },
        { name: 's5', data: [100, 200, 300, 400] },
      ],
      severityHighFraction: 0.5,
    });
    // 4 × 0.5 = 2 high.
    const high = out.filter((a) => a.severityBucket === 'high');
    expect(high).toHaveLength(2);
  });
});

describe('computeRadarAnomalySummary — formattedY + ariaLabel', () => {
  it('formattedY uses default toFixed(2) when no formatter supplied', () => {
    const out = computeRadarAnomalySummary({
      indicators: [{ name: 'A' }],
      series: [
        { name: 's1', data: [10] },
        { name: 's2', data: [11] },
        { name: 's3', data: [12] },
        { name: 's4', data: [13] },
        { name: 's5', data: [99.456] },
      ],
    });
    expect(out[0].formattedY).toBe('99.46');
  });

  it('formattedY honours valueFormatter override', () => {
    const out = computeRadarAnomalySummary({
      indicators: [{ name: 'A' }],
      series: [
        { name: 's1', data: [10] },
        { name: 's2', data: [11] },
        { name: 's3', data: [12] },
        { name: 's4', data: [13] },
        { name: 's5', data: [99.456] },
      ],
      valueFormatter: (v) => `${Math.round(v)}!`,
    });
    expect(out[0].formattedY).toBe('99!');
  });

  it('ariaLabel includes direction + indicator + series + value + unit + bucket', () => {
    const out = computeRadarAnomalySummary({
      indicators: [{ name: 'Latency', max: 500, unit: 'ms' }],
      series: [
        { name: 's1', data: [100] },
        { name: 's2', data: [110] },
        { name: 's3', data: [120] },
        { name: 's4', data: [130] },
        { name: 's5', data: [400] },
      ],
    });
    expect(out[0].ariaLabel).toBe(
      'Outlier above expected at Latency, s5, value=400.00 ms (high severity)',
    );
  });
});
