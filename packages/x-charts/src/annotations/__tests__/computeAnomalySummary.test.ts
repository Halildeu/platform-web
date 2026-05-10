/**
 * computeAnomalySummary — pure helper unit tests.
 *
 * Faz 21.11 PR-A2b-a11y. Locks the SEMANTIC outlier payload that
 * `useAnomalySummary` / `ChartAriaLive` consume for screen-reader
 * announcements. The detector internals are shared with
 * `computeAnomalyOverlay` (`collectAnomalyHits`) so this test
 * focuses on the summary-specific shape: direction wording,
 * severity bucketing, formattedY formatter wiring, ariaLabel
 * template, idPrefix scoping.
 */
import { describe, it, expect } from 'vitest';
import { computeAnomalySummary } from '../computeAnomalyOverlay';

describe('computeAnomalySummary — empty / tiny inputs', () => {
  it('returns [] when data is empty', () => {
    expect(computeAnomalySummary({ data: [] })).toEqual([]);
  });

  it('returns [] when data has fewer than 4 points (IQR meaningless)', () => {
    expect(
      computeAnomalySummary({
        data: [
          { x: 0, y: 1 },
          { x: 1, y: 2 },
          { x: 2, y: 3 },
        ],
      }),
    ).toEqual([]);
  });

  it('returns [] when no outliers exist', () => {
    expect(
      computeAnomalySummary({
        data: [
          { x: 0, y: 10 },
          { x: 1, y: 11 },
          { x: 2, y: 10 },
          { x: 3, y: 11 },
          { x: 4, y: 10 },
        ],
      }),
    ).toEqual([]);
  });
});

describe('computeAnomalySummary — direction + severity bucket', () => {
  it('flags an upper-fence outlier as direction "above"', () => {
    const data = [
      { x: 'Jan', y: 10 },
      { x: 'Feb', y: 11 },
      { x: 'Mar', y: 12 },
      { x: 'Apr', y: 13 },
      { x: 'May', y: 100 },
    ];
    const out = computeAnomalySummary({ data });
    expect(out).toHaveLength(1);
    expect(out[0].direction).toBe('above');
    expect(out[0].x).toBe('May');
    expect(out[0].y).toBe(100);
  });

  it('flags a lower-fence outlier as direction "below"', () => {
    const data = [
      { x: 0, y: 50 },
      { x: 1, y: 52 },
      { x: 2, y: 51 },
      { x: 3, y: 49 },
      { x: 4, y: 53 },
      { x: 5, y: 1 },
    ];
    const out = computeAnomalySummary({ data });
    expect(out).toHaveLength(1);
    expect(out[0].direction).toBe('below');
  });

  it('single-anomaly fixture gets severity bucket "high" (it IS the worst)', () => {
    const data = [
      { x: 0, y: 10 },
      { x: 1, y: 11 },
      { x: 2, y: 12 },
      { x: 3, y: 13 },
      { x: 4, y: 100 },
    ];
    const out = computeAnomalySummary({ data });
    expect(out[0].severityBucket).toBe('high');
  });

  it('top quartile anomalies bucketed as "high", rest "medium" (default 0.25 fraction)', () => {
    // 4 spike fixtures with monotonically increasing severity. Top
    // quartile (1 of 4) should be 'high'; the other 3 should be
    // 'medium'.
    const data: { x: number; y: number }[] = [];
    for (let i = 0; i < 50; i++) data.push({ x: i, y: 0 });
    // Spikes at increasing severities.
    data[10] = { x: 10, y: 100 };
    data[20] = { x: 20, y: 110 };
    data[30] = { x: 30, y: 120 };
    data[40] = { x: 40, y: 130 };
    const out = computeAnomalySummary({ data });
    const high = out.filter((s) => s.severityBucket === 'high');
    const medium = out.filter((s) => s.severityBucket === 'medium');
    expect(high.length).toBe(1);
    expect(medium.length).toBe(out.length - 1);
    // The most-severe spike (y=130) MUST be the high one.
    expect(high[0].y).toBe(130);
  });

  it('honours custom severityHighFraction', () => {
    const data: { x: number; y: number }[] = [];
    for (let i = 0; i < 50; i++) data.push({ x: i, y: 0 });
    data[10] = { x: 10, y: 100 };
    data[20] = { x: 20, y: 110 };
    data[30] = { x: 30, y: 120 };
    data[40] = { x: 40, y: 130 };
    const tight = computeAnomalySummary({ data, severityHighFraction: 0.5 });
    const tightHigh = tight.filter((s) => s.severityBucket === 'high');
    // 50% of 4 = 2 high.
    expect(tightHigh.length).toBe(2);
  });
});

describe('computeAnomalySummary — formattedY + ariaLabel template', () => {
  const baseData = [
    { x: 0, y: 10 },
    { x: 1, y: 11 },
    { x: 2, y: 12 },
    { x: 3, y: 13 },
    { x: 4, y: 99.456 },
  ];

  it('formattedY uses default toFixed(2) when no formatter supplied', () => {
    const out = computeAnomalySummary({ data: baseData });
    expect(out[0].formattedY).toBe('99.46');
  });

  it('formattedY honours valueFormatter override', () => {
    const out = computeAnomalySummary({
      data: baseData,
      valueFormatter: (v) => `${Math.round(v)}!`,
    });
    expect(out[0].formattedY).toBe('99!');
  });

  it('ariaLabel embeds direction + x + formattedY + severityBucket', () => {
    const out = computeAnomalySummary({ data: baseData });
    expect(out[0].ariaLabel).toBe('Outlier above expected at x=4, y=99.46 (high severity)');
  });
});

describe('computeAnomalySummary — id scoping', () => {
  it('default idPrefix "anomaly" produces ids like anomaly-<sourceIndex>', () => {
    const data = [
      { x: 0, y: 10 },
      { x: 1, y: 11 },
      { x: 2, y: 12 },
      { x: 3, y: 13 },
      { x: 4, y: 99 },
    ];
    const out = computeAnomalySummary({ data });
    expect(out[0].id).toBe('anomaly-4');
  });

  it('custom idPrefix scopes the ids', () => {
    const data = [
      { x: 0, y: 10 },
      { x: 1, y: 11 },
      { x: 2, y: 12 },
      { x: 3, y: 13 },
      { x: 4, y: 99 },
    ];
    const out = computeAnomalySummary({ data, idPrefix: 'sales-spike' });
    expect(out[0].id).toBe('sales-spike-4');
  });
});

describe('computeAnomalySummary — detector parity with computeAnomalyOverlay', () => {
  it('returns the same number of anomalies as computeAnomalyOverlay (marker variant) detects', async () => {
    // Both helpers MUST agree on which points are anomalies — the
    // shared `collectAnomalyHits` enforces this. Lock-in test so
    // a future detector change (zscore, MAD) keeps both surfaces
    // aligned.
    const { computeAnomalyOverlay } = await import('../computeAnomalyOverlay');
    const data = [
      { x: 0, y: 10 },
      { x: 1, y: 11 },
      { x: 2, y: 12 },
      { x: 3, y: 13 },
      { x: 4, y: 99 },
      { x: 5, y: 1 },
    ];
    const summaries = computeAnomalySummary({ data });
    const markups = computeAnomalyOverlay({ data });
    // Marker variant: 1 marker per anomaly.
    expect(summaries.length).toBe(markups.length);
  });
});
