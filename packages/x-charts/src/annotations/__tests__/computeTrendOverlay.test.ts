/**
 * computeTrendOverlay — pure helper unit tests.
 *
 * Locks the OLS slope/intercept/r² output, the segment + label
 * markup pair, and the categorical-x fallback (regression on
 * indices, output coordinates use original labels).
 */
import { describe, it, expect } from 'vitest';
import { computeTrendOverlay } from '../computeTrendOverlay';
import type { SegmentMarkup, LabelMarkup } from '../../types';

describe('computeTrendOverlay — empty / tiny inputs', () => {
  it('returns [] when data is empty', () => {
    expect(computeTrendOverlay({ data: [] })).toEqual([]);
  });

  it('returns [] when data has fewer than 2 points', () => {
    expect(computeTrendOverlay({ data: [{ x: 0, y: 1 }] })).toEqual([]);
  });
});

describe('computeTrendOverlay — OLS regression on numeric x', () => {
  it('emits a sloped SegmentMarkup + LabelMarkup with slope + r²', () => {
    // y = 2x + 1 perfectly linear → slope=2, intercept=1, r²=1
    const data = [
      { x: 0, y: 1 },
      { x: 1, y: 3 },
      { x: 2, y: 5 },
      { x: 3, y: 7 },
      { x: 4, y: 9 },
    ];
    const out = computeTrendOverlay({ data });
    expect(out).toHaveLength(2);

    const segment = out[0] as SegmentMarkup;
    expect(segment.type).toBe('segment');
    expect(segment.id).toBe('trend-segment');
    expect(segment.from.x).toBe(0);
    expect(segment.from.y).toBeCloseTo(1, 5);
    expect(segment.to.x).toBe(4);
    expect(segment.to.y).toBeCloseTo(9, 5);
    expect(segment.style).toBe('dashed');
    expect(segment.source).toBe('ai_trend');

    const label = out[1] as LabelMarkup;
    expect(label.type).toBe('label');
    expect(label.text).toContain('Slope: 2.00');
    expect(label.text).toContain('R²: 1.00');
    expect(label.anchor).toEqual({ dataIndex: 4 });
    expect(label.source).toBe('ai_trend');
  });

  it('honors color override on both segment and label', () => {
    const out = computeTrendOverlay({
      data: [
        { x: 0, y: 0 },
        { x: 1, y: 2 },
      ],
      color: '#ff00ff',
    });
    expect((out[0] as SegmentMarkup).color).toBe('#ff00ff');
    expect((out[1] as LabelMarkup).color).toBe('#ff00ff');
  });

  it('honors hideLabel — emits only the segment', () => {
    const out = computeTrendOverlay({
      data: [
        { x: 0, y: 0 },
        { x: 1, y: 2 },
      ],
      hideLabel: true,
    });
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('segment');
  });

  it('honors idPrefix so multiple overlays do not collide', () => {
    const a = computeTrendOverlay({
      data: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      idPrefix: 'series-A',
    });
    expect(a[0].id).toBe('series-A-segment');
    expect(a[1].id).toBe('series-A-label');
  });
});

describe('computeTrendOverlay — categorical x', () => {
  it('runs regression on indices but uses original labels in segment coords', () => {
    const data = [
      { x: 'Jan', y: 10 },
      { x: 'Feb', y: 30 },
      { x: 'Mar', y: 50 },
      { x: 'Apr', y: 70 },
    ];
    const out = computeTrendOverlay({ data });
    const segment = out[0] as SegmentMarkup;
    // Segment endpoints carry the ORIGINAL labels (not numeric
    // indices) so ECharts resolves them via the chart's coordinate
    // system.
    expect(segment.from.x).toBe('Jan');
    expect(segment.to.x).toBe('Apr');
    // Slope per index = (70-10)/(4-1) = 20 per index step
    expect(segment.from.y).toBeCloseTo(10, 5);
    expect(segment.to.y).toBeCloseTo(70, 5);
  });
});

describe('computeTrendOverlay — robust to noise', () => {
  it('returns reasonable r² (<1) for noisy data', () => {
    const data = [
      { x: 0, y: 1 },
      { x: 1, y: 2.3 },
      { x: 2, y: 4.5 },
      { x: 3, y: 7.1 },
      { x: 4, y: 8.7 },
    ];
    const out = computeTrendOverlay({ data });
    const label = out[1] as LabelMarkup;
    // r² should be high but not exactly 1 (~0.99 for this fixture)
    const r2Match = label.text.match(/R²:\s*([\d.]+)/);
    expect(r2Match).not.toBeNull();
    const r2 = Number(r2Match![1]);
    expect(r2).toBeGreaterThan(0.95);
    expect(r2).toBeLessThanOrEqual(1);
  });
});
