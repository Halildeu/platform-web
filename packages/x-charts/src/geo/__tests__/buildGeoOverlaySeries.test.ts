// @vitest-environment node
/**
 * buildGeoOverlaySeries — option-shape invariants for PR-X13a foundation
 * (Codex thread `019e2254` plan-time AGREE).
 *
 * Pure builder tests (no React mount, no ECharts canvas). Locks the
 * series spec the wrapper splices into `option.series` so future
 * overlay layer types append without regressing the bubble case.
 */
import { describe, it, expect } from 'vitest';
import {
  buildGeoOverlaySeries,
  buildBubbleLayerSeries,
  bubbleSymbolSize,
} from '../buildGeoOverlaySeries';
import type { GeoBubbleLayer } from '../geoOverlayTypes';

const sampleBubble = (): GeoBubbleLayer => ({
  type: 'bubble',
  name: 'Headcount',
  data: [
    { name: 'İstanbul', coordinates: [29.0, 41.0], value: 5000 },
    { name: 'Ankara', coordinates: [32.8, 39.9], value: 3000 },
    { name: 'İzmir', coordinates: [27.1, 38.4], value: 2200 },
  ],
});

describe('buildGeoOverlaySeries — dispatcher', () => {
  it('returns empty array when overlays undefined', () => {
    expect(buildGeoOverlaySeries(undefined, 0)).toEqual([]);
  });

  it('returns empty array when overlays empty', () => {
    expect(buildGeoOverlaySeries([], 0)).toEqual([]);
  });

  it('emits one series per layer in order', () => {
    const specs = buildGeoOverlaySeries([sampleBubble(), sampleBubble()], 0);
    expect(specs).toHaveLength(2);
    expect(specs[0].type).toBe('scatter');
    expect(specs[1].type).toBe('scatter');
  });
});

describe('buildBubbleLayerSeries — bubble layer spec', () => {
  it('series.type === "scatter" + coordinateSystem === "geo"', () => {
    const spec = buildBubbleLayerSeries(sampleBubble(), 0);
    expect(spec.type).toBe('scatter');
    expect(spec.coordinateSystem).toBe('geo');
    expect(spec.geoIndex).toBe(0);
  });

  it('data wraps each point as `[lng, lat, value]` + name', () => {
    const spec = buildBubbleLayerSeries(sampleBubble(), 0);
    const data = spec.data as Array<{
      value: [number, number, number];
      name: string;
    }>;
    expect(data).toHaveLength(3);
    expect(data[0].value).toEqual([29.0, 41.0, 5000]);
    expect(data[0].name).toBe('İstanbul');
    expect(data[1].value).toEqual([32.8, 39.9, 3000]);
    expect(data[2].value).toEqual([27.1, 38.4, 2200]);
  });

  it('symbol defaults to "circle", honours override', () => {
    const def = buildBubbleLayerSeries(sampleBubble(), 0);
    expect(def.symbol).toBe('circle');
    const square = buildBubbleLayerSeries({ ...sampleBubble(), symbol: 'rect' }, 0);
    expect(square.symbol).toBe('rect');
  });

  it('opacity defaults to 0.7, honours override', () => {
    const def = buildBubbleLayerSeries(sampleBubble(), 0);
    expect((def.itemStyle as { opacity?: number }).opacity).toBe(0.7);
    const opaque = buildBubbleLayerSeries({ ...sampleBubble(), opacity: 1 }, 0);
    expect((opaque.itemStyle as { opacity?: number }).opacity).toBe(1);
  });

  it('showLabels=true emits label.show=true with formatter "{b}"', () => {
    const def = buildBubbleLayerSeries(sampleBubble(), 0);
    expect((def.label as { show: boolean }).show).toBe(false);
    const labeled = buildBubbleLayerSeries({ ...sampleBubble(), showLabels: true }, 0);
    expect((labeled.label as { show: boolean; formatter: string }).show).toBe(true);
    expect((labeled.label as { formatter: string }).formatter).toBe('{b}');
  });

  it('per-point color override propagates to itemStyle', () => {
    const layer: GeoBubbleLayer = {
      type: 'bubble',
      data: [{ name: 'X', coordinates: [0, 0], value: 1, color: '#ff0000' }],
    };
    const spec = buildBubbleLayerSeries(layer, 0);
    const data = spec.data as Array<{ itemStyle?: { color?: string } }>;
    expect(data[0].itemStyle?.color).toBe('#ff0000');
  });

  it('z defaults to 5 (renders above choropleth base)', () => {
    const def = buildBubbleLayerSeries(sampleBubble(), 0);
    expect(def.z).toBe(5);
  });

  it('handles empty data without throwing', () => {
    expect(() => buildBubbleLayerSeries({ type: 'bubble', data: [] }, 0)).not.toThrow();
    const spec = buildBubbleLayerSeries({ type: 'bubble', data: [] }, 0);
    expect((spec.data as unknown[]).length).toBe(0);
  });
});

describe('bubbleSymbolSize — sqrt scale invariants', () => {
  const minV = 100;
  const maxV = 10_000;
  const minS = 8;
  const maxS = 60;

  it('value === minValue → minSize', () => {
    expect(bubbleSymbolSize(minV, minV, maxV, minS, maxS)).toBe(minS);
  });

  it('value === maxValue → maxSize', () => {
    expect(bubbleSymbolSize(maxV, minV, maxV, minS, maxS)).toBe(maxS);
  });

  it('value < minValue clamps to minSize', () => {
    expect(bubbleSymbolSize(0, minV, maxV, minS, maxS)).toBe(minS);
  });

  it('value > maxValue clamps to maxSize', () => {
    expect(bubbleSymbolSize(99_999, minV, maxV, minS, maxS)).toBe(maxS);
  });

  it('mid-range value lands strictly between min and max sizes', () => {
    const mid = bubbleSymbolSize(2500, minV, maxV, minS, maxS);
    expect(mid).toBeGreaterThan(minS);
    expect(mid).toBeLessThan(maxS);
  });

  it('all values equal → midpoint of [minSize, maxSize]', () => {
    const flat = bubbleSymbolSize(50, 50, 50, minS, maxS);
    expect(flat).toBe((minS + maxS) / 2);
  });

  it('non-finite value falls back to minSize', () => {
    expect(bubbleSymbolSize(Number.NaN, minV, maxV, minS, maxS)).toBe(minS);
    expect(bubbleSymbolSize(Number.POSITIVE_INFINITY, minV, maxV, minS, maxS)).toBe(maxS);
  });

  it('sqrt scale preserves area-perception (4× value → 2× area)', () => {
    // Pick a power-of-4 ratio so the perceptual delta is easy to verify.
    const v1 = 100;
    const v4 = 400;
    const s1 = bubbleSymbolSize(v1, v1, v4, minS, maxS);
    const s4 = bubbleSymbolSize(v4, v1, v4, minS, maxS);
    expect(s1).toBe(minS);
    expect(s4).toBe(maxS);
    // Midpoint case: value at sqrt-midpoint should land at size midpoint.
    const sMid = bubbleSymbolSize(225, v1, v4, minS, maxS); // sqrt(225)=15, midway sqrt(100..400)
    const sizeMid = (minS + maxS) / 2;
    expect(Math.abs(sMid - sizeMid)).toBeLessThan(0.01);
  });
});

describe('buildGeoOverlaySeries — bubble pipeline integration', () => {
  it('produces a series the wrapper can splice into option.series', () => {
    const specs = buildGeoOverlaySeries([sampleBubble()], 0);
    expect(specs).toHaveLength(1);
    const s = specs[0];
    expect(s.type).toBe('scatter');
    expect(s.coordinateSystem).toBe('geo');
    expect(s.geoIndex).toBe(0);
    expect((s.data as unknown[]).length).toBe(3);
    // symbolSize is a function (sqrt scale closure); ECharts will call
    // it per point.
    expect(typeof s.symbolSize).toBe('function');
  });

  it('symbolSize callback decodes raw `[lng, lat, value]` array correctly', () => {
    const specs = buildGeoOverlaySeries([sampleBubble()], 0);
    const sizeFn = specs[0].symbolSize as (val: number[] | number) => number;
    const minSize = sizeFn([29.0, 41.0, 2200]); // lowest value
    const maxSize = sizeFn([29.0, 41.0, 5000]); // highest value
    expect(minSize).toBe(8);
    expect(maxSize).toBe(60);
  });
});
