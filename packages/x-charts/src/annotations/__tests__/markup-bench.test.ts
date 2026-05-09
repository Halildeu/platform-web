/**
 * markup-bench — adapter performance gate.
 *
 * Codex thread 019e0df1 iter-3 absorb: pure adapter must keep up with
 * realistic dashboard scales (1k markups across multi-series charts)
 * inside a single render call. The pure-helper bench keeps jsdom
 * noise out of the critical path; chart-render bench is intentionally
 * NOT included here because Codex flagged React-render bench as
 * gürültülü on jsdom.
 *
 * Budget: 1000 markup `adaptToEcharts` call < 100 ms best-of-3 on a
 * cold local node. CI runners (smaller cores) may be slower; use
 * `1.5×` headroom internally — see test threshold.
 */
import { describe, it, expect } from 'vitest';
import { adaptToEcharts } from '../adaptToEcharts';
import type { ChartMarkup } from '../../types';

function buildLineMarkups(n: number): ChartMarkup[] {
  const out: ChartMarkup[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: `line-${i}`,
      type: 'line',
      axis: i % 2 === 0 ? 'y' : 'x',
      value: i,
      label: { text: `Threshold ${i}` },
      color: '#3b82f6',
      style: i % 3 === 0 ? 'dashed' : 'solid',
    });
  }
  return out;
}

function buildMixedMarkups(n: number): ChartMarkup[] {
  const out: ChartMarkup[] = [];
  for (let i = 0; i < n; i++) {
    const variant = i % 5;
    if (variant === 0) {
      out.push({ id: `m${i}`, type: 'line', axis: 'y', value: i });
    } else if (variant === 1) {
      out.push({
        id: `m${i}`,
        type: 'segment',
        from: { x: 0, y: 0 },
        to: { x: i, y: i * 2 },
      });
    } else if (variant === 2) {
      out.push({ id: `m${i}`, type: 'area', axis: 'x', from: i, to: i + 1 });
    } else if (variant === 3) {
      out.push({ id: `m${i}`, type: 'point', x: i, y: i * 3 });
    } else {
      out.push({
        id: `m${i}`,
        type: 'label',
        text: `Note ${i}`,
        anchor: { x: i, y: i },
      });
    }
  }
  return out;
}

function bestOfN(times: number[]): number {
  return Math.min(...times);
}

describe('adaptToEcharts — performance bench', () => {
  it('1000 line markups complete in < 150 ms (best-of-3, CI tolerant)', () => {
    const markups = buildLineMarkups(1000);
    const times: number[] = [];
    for (let run = 0; run < 3; run++) {
      const t0 = performance.now();
      const r = adaptToEcharts(markups, { chartType: 'bar' });
      const t1 = performance.now();
      times.push(t1 - t0);
      expect(r.markupLookup.size).toBe(1000);
      expect((r.seriesPatches[0].markLine as { data: unknown[] }).data).toHaveLength(1000);
    }
    const best = bestOfN(times);
    // Local target < 100 ms; CI runner headroom up to 150 ms.
    expect(best).toBeLessThan(150);
  });

  it('1000 mixed-variant markups complete in < 150 ms (best-of-3)', () => {
    const markups = buildMixedMarkups(1000);
    const times: number[] = [];
    for (let run = 0; run < 3; run++) {
      const t0 = performance.now();
      adaptToEcharts(markups, { chartType: 'bar' });
      const t1 = performance.now();
      times.push(t1 - t0);
    }
    const best = bestOfN(times);
    expect(best).toBeLessThan(150);
  });

  it('1000 markups across 10 series targets stays < 150 ms (best-of-3)', () => {
    const markups: ChartMarkup[] = [];
    for (let i = 0; i < 1000; i++) {
      markups.push({
        id: `ms-${i}`,
        type: 'line',
        axis: 'y',
        value: i,
        target: { seriesIndex: i % 10 },
      });
    }
    const times: number[] = [];
    for (let run = 0; run < 3; run++) {
      const t0 = performance.now();
      const r = adaptToEcharts(markups, { chartType: 'line' });
      const t1 = performance.now();
      times.push(t1 - t0);
      expect(r.seriesPatches).toHaveLength(10);
    }
    const best = bestOfN(times);
    expect(best).toBeLessThan(150);
  });
});
