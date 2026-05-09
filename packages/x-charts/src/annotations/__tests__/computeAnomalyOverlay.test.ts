/**
 * computeAnomalyOverlay — pure helper unit tests.
 *
 * Locks the IQR fence detection, PointMarkup output shape, and the
 * tiny-sample fallback (need at least 4 points for IQR).
 */
import { describe, it, expect } from 'vitest';
import { computeAnomalyOverlay } from '../computeAnomalyOverlay';
import type { PointMarkup } from '../../types';

describe('computeAnomalyOverlay — empty / tiny inputs', () => {
  it('returns [] when data is empty', () => {
    expect(computeAnomalyOverlay({ data: [] })).toEqual([]);
  });

  it('returns [] when data has fewer than 4 points (IQR meaningless)', () => {
    expect(
      computeAnomalyOverlay({
        data: [
          { x: 0, y: 1 },
          { x: 1, y: 2 },
          { x: 2, y: 3 },
        ],
      }),
    ).toEqual([]);
  });
});

describe('computeAnomalyOverlay — IQR fence detection', () => {
  it('flags a clear high outlier with default k=1.5', () => {
    const data = [
      { x: 'Jan', y: 10 },
      { x: 'Feb', y: 11 },
      { x: 'Mar', y: 12 },
      { x: 'Apr', y: 13 },
      { x: 'May', y: 100 }, // outlier
    ];
    const out = computeAnomalyOverlay({ data });
    expect(out).toHaveLength(1);
    const marker = out[0] as PointMarkup;
    expect(marker.type).toBe('point');
    expect(marker.x).toBe('May');
    expect(marker.y).toBe(100);
    expect(marker.symbol).toBe('diamond');
    expect(marker.source).toBe('ai_anomaly');
    expect(marker.label?.text).toContain('↑');
  });

  it('flags a clear low outlier (downward direction marker)', () => {
    const data = [
      { x: 0, y: 50 },
      { x: 1, y: 52 },
      { x: 2, y: 51 },
      { x: 3, y: 49 },
      { x: 4, y: 53 },
      { x: 5, y: 1 }, // outlier
    ];
    const out = computeAnomalyOverlay({ data });
    expect(out).toHaveLength(1);
    const marker = out[0] as PointMarkup;
    expect(marker.x).toBe(5);
    expect(marker.label?.text).toContain('↓');
  });

  it('returns [] when no outliers exist', () => {
    const data = [
      { x: 0, y: 10 },
      { x: 1, y: 11 },
      { x: 2, y: 10 },
      { x: 3, y: 11 },
      { x: 4, y: 10 },
    ];
    expect(computeAnomalyOverlay({ data })).toEqual([]);
  });

  it('honors custom k (tighter fence catches more)', () => {
    const data = [
      { x: 0, y: 10 },
      { x: 1, y: 11 },
      { x: 2, y: 12 },
      { x: 3, y: 14 },
      { x: 4, y: 18 }, // borderline
    ];
    const tight = computeAnomalyOverlay({ data, k: 0.5 });
    const loose = computeAnomalyOverlay({ data, k: 3 });
    expect(tight.length).toBeGreaterThan(loose.length);
  });
});

describe('computeAnomalyOverlay — markup shape options', () => {
  it('idPrefix scopes the per-marker ids', () => {
    const data = [
      { x: 0, y: 10 },
      { x: 1, y: 11 },
      { x: 2, y: 12 },
      { x: 3, y: 13 },
      { x: 4, y: 100 },
    ];
    const out = computeAnomalyOverlay({ data, idPrefix: 'spike' });
    expect(out[0].id).toBe('spike-4');
  });

  it('honors color + size overrides', () => {
    const data = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 99 },
    ];
    const out = computeAnomalyOverlay({ data, color: '#ff00ff', size: 20 });
    const marker = out[0] as PointMarkup;
    expect(marker.color).toBe('#ff00ff');
    expect(marker.size).toBe(20);
  });

  it('omits label when showLabel=false', () => {
    const data = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 99 },
    ];
    const out = computeAnomalyOverlay({ data, showLabel: false });
    expect((out[0] as PointMarkup).label).toBeUndefined();
  });
});
