/**
 * computeAnomalyOverlay — pure helper unit tests.
 *
 * Locks the IQR fence detection, PointMarkup output shape, and the
 * tiny-sample fallback (need at least 4 points for IQR).
 */
import { describe, it, expect } from 'vitest';
import { computeAnomalyOverlay } from '../computeAnomalyOverlay';
import { adaptToEcharts } from '../adaptToEcharts';
import type { LabelMarkup, PointMarkup } from '../../types';

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

describe('computeAnomalyOverlay — PR-A2b-ui pill variant', () => {
  function flatBaselineWithSpikes(spikeYs: number[]): { x: number; y: number }[] {
    // Baseline length grows with the spike count so spike indices
    // stay in bounds: spike i lands at index 10 + i*5.
    const baselineLength = Math.max(100, 10 + (spikeYs.length - 1) * 5 + 5);
    const data: { x: number; y: number }[] = [];
    for (let i = 0; i < baselineLength; i++) data.push({ x: i, y: 0 });
    for (let i = 0; i < spikeYs.length; i++) {
      const idx = 10 + i * 5;
      data[idx] = { x: idx, y: spikeYs[i] };
    }
    return data;
  }

  it('pill variant emits one marker per outlier (cap-free) AND a labelled pill per outlier', () => {
    const data = flatBaselineWithSpikes([100, 110, 120]);
    const out = computeAnomalyOverlay({ data, labelVariant: 'pill' });
    const markers = out.filter((m) => m.type === 'point') as PointMarkup[];
    const pills = out.filter((m) => m.type === 'label') as LabelMarkup[];
    expect(markers).toHaveLength(3);
    expect(pills).toHaveLength(3);
    // Pill text + token-backed background.
    expect(pills[0].text).toMatch(/Outlier: y=/);
    expect(pills[0].background).toContain('--state-warning-bg');
    expect(pills[0].color).toContain('--state-warning-text');
    // Stable pill id derived from `idPrefix` + source index + `-pill`.
    expect(pills[0].id).toMatch(/^anomaly-\d+-pill$/);
    // Marker carries no inline label in pill mode (pill drives the
    // explanation; an inline label would double-stamp the chart).
    expect(markers[0].label).toBeUndefined();
    // Both surfaces remain `source: 'ai_anomaly'` so the cross-AI
    // markup-name-collision guard still recognises them.
    expect(markers[0].source).toBe('ai_anomaly');
    expect(pills[0].source).toBe('ai_anomaly');
    // ariaLabel populated on both for screen-reader fallback.
    expect(markers[0].ariaLabel).toMatch(/Outlier at/);
    expect(pills[0].ariaLabel).toMatch(/Outlier explanation pill/);
  });

  it('marker variant (default) keeps the legacy inline-label shape', () => {
    const data = flatBaselineWithSpikes([100]);
    const out = computeAnomalyOverlay({ data });
    expect(out).toHaveLength(1);
    const marker = out[0] as PointMarkup;
    expect(marker.type).toBe('point');
    expect(marker.label?.text).toMatch(/↑/);
  });

  it('honours `valueFormatter` in the pill text', () => {
    const data = flatBaselineWithSpikes([100.4567]);
    const out = computeAnomalyOverlay({
      data,
      labelVariant: 'pill',
      valueFormatter: (v) => `${v.toFixed(0)}!`,
    });
    const pill = out.find((m) => m.type === 'label') as LabelMarkup;
    expect(pill.text).toBe('Outlier: y=100!');
  });

  it('caps pill emission at `maxPills` while keeping every marker visible', () => {
    // 30 spike points trip the IQR fence. With `maxPills=10` we
    // expect 30 markers + 10 pills, ordered by descending severity.
    const spikeYs: number[] = [];
    for (let i = 0; i < 30; i++) spikeYs.push(100 + i); // increasing severity
    const data = flatBaselineWithSpikes(spikeYs);
    const out = computeAnomalyOverlay({ data, labelVariant: 'pill', maxPills: 10 });
    const markers = out.filter((m) => m.type === 'point');
    const pills = out.filter((m) => m.type === 'label') as LabelMarkup[];
    expect(markers.length).toBe(30);
    expect(pills.length).toBe(10);
    // Highest-severity spike (100 + 29 = 129) MUST get a pill.
    const highSeverityPill = pills.find((p) => p.text === 'Outlier: y=129.00');
    expect(highSeverityPill).toBeDefined();
  });

  it('respects custom pill background + text colour tokens', () => {
    const data = flatBaselineWithSpikes([100]);
    const out = computeAnomalyOverlay({
      data,
      labelVariant: 'pill',
      pillBackground: '#ffe4e6',
      pillTextColor: '#9f1239',
    });
    const pill = out.find((m) => m.type === 'label') as LabelMarkup;
    expect(pill.background).toBe('#ffe4e6');
    expect(pill.color).toBe('#9f1239');
  });

  it('pill output survives adaptToEcharts integration (Codex iter-2 RED #1)', () => {
    // Codex iter-2 caught the LabelMarkup shape bug — pills used to
    // ship `x`/`y` at the top level, which the adapter then crashed
    // on at `'x' in m.anchor`. This test wires
    // `computeAnomalyOverlay({ labelVariant: 'pill' })` straight
    // into `adaptToEcharts({ chartType: 'scatter' })` so a future
    // shape regression turns the suite red instead of waiting for
    // Playwright to crash a real chart.
    const data = flatBaselineWithSpikes([100]);
    const overlay = computeAnomalyOverlay({ data, labelVariant: 'pill' });
    expect(() => adaptToEcharts(overlay, { chartType: 'scatter' })).not.toThrow();
    const adapted = adaptToEcharts(overlay, { chartType: 'scatter' });
    // Adapter folds the pill into `seriesPatches[*].markPoint.data`
    // (label markup uses the same coord-anchored markPoint primitive
    // ECharts already supports). The contract this test guards is
    // "the pill object is accepted and produces at least one patch
    // entry"; the adapter internals stay implementation-detail.
    expect(adapted.seriesPatches.length).toBeGreaterThan(0);
  });
});
