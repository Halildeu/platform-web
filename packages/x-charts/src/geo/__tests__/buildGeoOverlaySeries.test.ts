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
  buildEffectScatterLayerSeries,
  buildFlowLayerSeries,
  bubbleSymbolSize,
  flowLineWidth,
  flowEdgeName,
} from '../buildGeoOverlaySeries';
import type { GeoBubbleLayer, GeoEffectScatterLayer, GeoFlowLayer } from '../geoOverlayTypes';

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

describe('bubbleSymbolSize — negative-domain defensive floor', () => {
  // Codex 019e25a2 iter-1 must-fix #4: sqrt(negative) = NaN. Bubble
  // metric is semantically non-negative; clamp safely.
  it('negative value floors at 0 → minSize', () => {
    expect(bubbleSymbolSize(-50, 0, 100, 8, 60)).toBe(8);
  });

  it('negative minValue is treated as 0', () => {
    // safeMin = 0, safeMax = 100, value = 50 → midpoint of [8, 60]
    const result = bubbleSymbolSize(50, -100, 100, 8, 60);
    expect(Number.isNaN(result)).toBe(false);
    expect(result).toBeGreaterThan(8);
    expect(result).toBeLessThan(60);
  });

  it('negative maxValue degrades to flat (both safeMin === safeMax === 0)', () => {
    // safeMin = 0, safeMax = 0 → midpoint
    const result = bubbleSymbolSize(-10, -100, -50, 8, 60);
    expect(result).toBe(34); // (8+60)/2
  });

  it('builder ingests negative values without producing NaN symbolSize', () => {
    const layer: GeoBubbleLayer = {
      type: 'bubble',
      data: [
        { name: 'A', coordinates: [0, 0], value: -10 },
        { name: 'B', coordinates: [1, 1], value: 50 },
      ],
    };
    const spec = buildBubbleLayerSeries(layer, 0);
    const sizeFn = spec.symbolSize as (val: number[]) => number;
    expect(Number.isNaN(sizeFn([0, 0, -10]))).toBe(false);
    expect(Number.isNaN(sizeFn([1, 1, 50]))).toBe(false);
  });
});

describe('buildBubbleLayerSeries — overlay metadata namespace', () => {
  // Codex 019e25a2 iter-1 must-fix #11: stable `_overlay` payload.
  it('every datum carries `_overlay` with type/layerName/coords/value/category', () => {
    const layer: GeoBubbleLayer = {
      type: 'bubble',
      name: 'HQ',
      data: [{ name: 'X', coordinates: [10, 20], value: 5, category: 'office' }],
    };
    const spec = buildBubbleLayerSeries(layer, 0);
    const data = spec.data as Array<{
      _overlay: {
        type: string;
        layerName: string;
        coordinates: [number, number];
        value: number;
        category: string;
      };
    }>;
    expect(data[0]._overlay.type).toBe('bubble');
    expect(data[0]._overlay.layerName).toBe('HQ');
    expect(data[0]._overlay.coordinates).toEqual([10, 20]);
    expect(data[0]._overlay.value).toBe(5);
    expect(data[0]._overlay.category).toBe('office');
  });

  it('layerName falls back to "Bubble overlay" when name omitted', () => {
    const layer: GeoBubbleLayer = {
      type: 'bubble',
      data: [{ name: 'Y', coordinates: [0, 0], value: 1 }],
    };
    const spec = buildBubbleLayerSeries(layer, 0);
    const data = spec.data as Array<{ _overlay: { layerName: string } }>;
    expect(data[0]._overlay.layerName).toBe('Bubble overlay');
  });
});

/* ================================================================== */
/*  PR-X13b — EffectScatter (animated pulse on geo)                    */
/* ================================================================== */

const sampleEffect = (): GeoEffectScatterLayer => ({
  type: 'effectScatter',
  name: 'Critical alerts',
  data: [
    { name: 'İstanbul', coordinates: [29.0, 41.0], value: 10 },
    { name: 'İzmir', coordinates: [27.1, 38.4], value: 5 },
  ],
});

describe('buildEffectScatterLayerSeries — effectScatter layer spec', () => {
  it('series.type === "effectScatter" + coordinateSystem === "geo"', () => {
    const spec = buildEffectScatterLayerSeries(sampleEffect(), 0);
    expect(spec.type).toBe('effectScatter');
    expect(spec.coordinateSystem).toBe('geo');
    expect(spec.geoIndex).toBe(0);
  });

  it('symbol defaults to "pin", symbolSize defaults to 14', () => {
    const def = buildEffectScatterLayerSeries(sampleEffect(), 0);
    expect(def.symbol).toBe('pin');
    expect(def.symbolSize).toBe(14);
  });

  it('rippleEffect defaults: period=4, scale=2.5, brushType="stroke"', () => {
    const def = buildEffectScatterLayerSeries(sampleEffect(), 0);
    const ripple = def.rippleEffect as { period: number; scale: number; brushType: string };
    expect(ripple.period).toBe(4);
    expect(ripple.scale).toBe(2.5);
    expect(ripple.brushType).toBe('stroke');
  });

  it('rippleEffect overrides propagate', () => {
    const layer: GeoEffectScatterLayer = {
      ...sampleEffect(),
      ripplePeriod: 1.5,
      rippleScale: 4,
      rippleBrush: 'fill',
    };
    const spec = buildEffectScatterLayerSeries(layer, 0);
    const ripple = spec.rippleEffect as { period: number; scale: number; brushType: string };
    expect(ripple.period).toBe(1.5);
    expect(ripple.scale).toBe(4);
    expect(ripple.brushType).toBe('fill');
  });

  it('respectReducedMotion: true → number=0 (ripple paths suppressed)', () => {
    // Codex 019e25a2 iter-1 medium-fix: `period: 0` would still build
    // zero-duration animators inside `EffectSymbol.startEffectAnimation`
    // (no `period > 0` guard there). `number: 0` suppresses ripple
    // paths entirely while period/scale stay in valid ranges.
    const layer: GeoEffectScatterLayer = {
      ...sampleEffect(),
      respectReducedMotion: true,
    };
    const spec = buildEffectScatterLayerSeries(layer, 0);
    const ripple = spec.rippleEffect as {
      number: number;
      period: number;
      scale: number;
    };
    expect(ripple.number).toBe(0);
    // period/scale stay at defaults (valid range) so ECharts doesn't
    // construct a zero-duration loop even though no ripple is drawn.
    expect(ripple.period).toBe(4);
    expect(ripple.scale).toBe(2.5);
  });

  it('showEffectOn defaults to "render", honours override', () => {
    const def = buildEffectScatterLayerSeries(sampleEffect(), 0);
    expect(def.showEffectOn).toBe('render');
    const onHover = buildEffectScatterLayerSeries(
      { ...sampleEffect(), showEffectOn: 'emphasis' },
      0,
    );
    expect(onHover.showEffectOn).toBe('emphasis');
  });

  it('opacity defaults to 0.9 (higher than bubble 0.7)', () => {
    const def = buildEffectScatterLayerSeries(sampleEffect(), 0);
    expect((def.itemStyle as { opacity?: number }).opacity).toBe(0.9);
  });

  it('showLabels defaults to true (highlights deserve a label)', () => {
    const def = buildEffectScatterLayerSeries(sampleEffect(), 0);
    expect((def.label as { show: boolean }).show).toBe(true);
  });

  it('showLabels=false collapses to label.show=false', () => {
    const layer: GeoEffectScatterLayer = { ...sampleEffect(), showLabels: false };
    const spec = buildEffectScatterLayerSeries(layer, 0);
    expect((spec.label as { show: boolean }).show).toBe(false);
  });

  it('emits stable `_overlay` namespace per datum', () => {
    const spec = buildEffectScatterLayerSeries(sampleEffect(), 0);
    const data = spec.data as Array<{
      _overlay: { type: string; layerName: string; coordinates: [number, number]; value: number };
    }>;
    expect(data[0]._overlay.type).toBe('effectScatter');
    expect(data[0]._overlay.layerName).toBe('Critical alerts');
    expect(data[0]._overlay.coordinates).toEqual([29.0, 41.0]);
    expect(data[0]._overlay.value).toBe(10);
  });

  it('handles empty data without throwing', () => {
    expect(() =>
      buildEffectScatterLayerSeries({ type: 'effectScatter', data: [] }, 0),
    ).not.toThrow();
  });
});

describe('buildGeoOverlaySeries — multi-layer mix (bubble + effectScatter)', () => {
  it('appends one series per layer in array order, type-discriminated', () => {
    const specs = buildGeoOverlaySeries(
      [
        { type: 'bubble', data: [{ name: 'A', coordinates: [29, 41], value: 1 }] },
        { type: 'effectScatter', data: [{ name: 'B', coordinates: [32, 39], value: 2 }] },
      ],
      0,
    );
    expect(specs).toHaveLength(2);
    expect(specs[0].type).toBe('scatter');
    expect(specs[1].type).toBe('effectScatter');
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

/* ------------------------------------------------------------------ */
/*  PR-X13c: GeoFlowLayer tests (Codex thread 019e25d4)                */
/* ------------------------------------------------------------------ */

const sampleFlow = (): GeoFlowLayer => ({
  type: 'flow',
  name: 'Logistics flow',
  data: [
    {
      fromName: 'İstanbul',
      toName: 'Ankara',
      from: [29.0, 41.0],
      to: [32.85, 39.93],
      value: 800,
    },
    {
      fromName: 'İstanbul',
      toName: 'İzmir',
      from: [29.0, 41.0],
      to: [27.14, 38.42],
      value: 600,
    },
    {
      fromName: 'Ankara',
      toName: 'İzmir',
      from: [32.85, 39.93],
      to: [27.14, 38.42],
      value: 400,
    },
  ],
});

describe('flowLineWidth — clamped linear scale', () => {
  it('returns midpoint when min === max (all values equal)', () => {
    expect(flowLineWidth(50, 50, 50, 1, 5)).toBe(3);
  });

  it('returns minW for non-finite value (NaN, Infinity)', () => {
    expect(flowLineWidth(NaN, 0, 100, 1, 5)).toBe(1);
    expect(flowLineWidth(Infinity, 0, 100, 1, 5)).toBe(1);
  });

  it('floors negative value to 0 (defensive non-negative domain)', () => {
    // value=-5 → safeValue=0 → t=0 → minW=1
    expect(flowLineWidth(-5, 0, 100, 1, 5)).toBe(1);
  });

  it('clamps value above maxValue to maxW (off-scale high)', () => {
    expect(flowLineWidth(200, 0, 100, 1, 5)).toBe(5);
  });

  it('clamps value below minValue to minW (off-scale low)', () => {
    expect(flowLineWidth(-10, 10, 100, 1, 5)).toBe(1);
  });

  it('linear scale: midpoint value → midpoint width', () => {
    // value=50, range [0, 100] → t=0.5 → width = 1 + 0.5*(5-1) = 3
    expect(flowLineWidth(50, 0, 100, 1, 5)).toBe(3);
  });

  it('linear is the default scale (omitted arg)', () => {
    expect(flowLineWidth(50, 0, 100, 1, 5)).toBe(flowLineWidth(50, 0, 100, 1, 5, 'linear'));
  });

  it('sqrt scale: outlier control — value=50 in [0,100] reads larger', () => {
    // linear t = 0.5 (width 3)
    // sqrt t = sqrt(50)/sqrt(100) ≈ 0.707 → width ≈ 1 + 0.707*4 ≈ 3.83
    const linear = flowLineWidth(50, 0, 100, 1, 5, 'linear');
    const sqrt = flowLineWidth(50, 0, 100, 1, 5, 'sqrt');
    expect(sqrt).toBeGreaterThan(linear);
    expect(sqrt).toBeGreaterThan(3.5);
    expect(sqrt).toBeLessThan(4.0);
  });

  it('sqrt scale handles negative-domain min defensively', () => {
    // safeMin/safeMax = 0/100; sqrt(0)=0; works without NaN
    expect(flowLineWidth(50, -10, 100, 1, 5, 'sqrt')).toBeGreaterThan(0);
    expect(Number.isFinite(flowLineWidth(50, -10, 100, 1, 5, 'sqrt'))).toBe(true);
  });
});

describe('flowEdgeName — synthesised route label', () => {
  it('uses fromName + toName when both provided', () => {
    expect(
      flowEdgeName({
        fromName: 'İstanbul',
        toName: 'Ankara',
        from: [29.0, 41.0],
        to: [32.85, 39.93],
      }),
    ).toBe('İstanbul → Ankara');
  });

  it('falls back to coordinate formatting when names missing', () => {
    expect(
      flowEdgeName({
        from: [29.0, 41.0],
        to: [32.85, 39.93],
      }),
    ).toBe('29.00,41.00 → 32.85,39.93');
  });

  it('mixed: fromName present, toName missing → coord fallback for to', () => {
    expect(
      flowEdgeName({
        fromName: 'İstanbul',
        from: [29.0, 41.0],
        to: [32.85, 39.93],
      }),
    ).toBe('İstanbul → 32.85,39.93');
  });
});

describe('buildFlowLayerSeries — flow layer spec', () => {
  it('series.type === "lines" + coordinateSystem === "geo"', () => {
    const spec = buildFlowLayerSeries(sampleFlow(), 0);
    expect(spec.type).toBe('lines');
    expect(spec.coordinateSystem).toBe('geo');
  });

  it('geoIndex is shared with the base map (passed through)', () => {
    const spec = buildFlowLayerSeries(sampleFlow(), 0);
    expect(spec.geoIndex).toBe(0);
  });

  it('polyline: false (OD-only single segments)', () => {
    const spec = buildFlowLayerSeries(sampleFlow(), 0);
    expect(spec.polyline).toBe(false);
  });

  it('empty data produces empty series.data array', () => {
    const spec = buildFlowLayerSeries({ type: 'flow', data: [] }, 0);
    expect((spec.data as unknown[]).length).toBe(0);
  });

  it('coords integrity: data[i].coords === [from, to]', () => {
    const spec = buildFlowLayerSeries(sampleFlow(), 0);
    const datum = (spec.data as Array<{ coords: number[][] }>)[0];
    expect(datum.coords).toEqual([
      [29.0, 41.0],
      [32.85, 39.93],
    ]);
  });

  it('every datum carries the `_overlay` namespace with flow discriminator', () => {
    const spec = buildFlowLayerSeries(sampleFlow(), 0);
    const data = spec.data as Array<{
      _overlay: {
        type: string;
        layerName: string;
        from: [number, number];
        to: [number, number];
        fromName?: string;
        toName?: string;
        value?: number;
      };
    }>;
    for (const datum of data) {
      expect(datum._overlay.type).toBe('flow');
      expect(datum._overlay.layerName).toBe('Logistics flow');
    }
    // Spot-check first edge specifics.
    expect(data[0]._overlay.fromName).toBe('İstanbul');
    expect(data[0]._overlay.toName).toBe('Ankara');
    expect(data[0]._overlay.value).toBe(800);
  });

  it('synthesises datum.name for label.formatter: "{b}" path', () => {
    // Codex 019e25d4 iter-2 nit: without datum.name, label "{b}" emits ''.
    const spec = buildFlowLayerSeries(sampleFlow(), 0);
    const data = spec.data as Array<{ name: string }>;
    expect(data[0].name).toBe('İstanbul → Ankara');
    expect(data[1].name).toBe('İstanbul → İzmir');
    expect(data[2].name).toBe('Ankara → İzmir');
  });

  it('value-driven width (linear scale) — min/mid/max bounds', () => {
    const spec = buildFlowLayerSeries(sampleFlow(), 0);
    const data = spec.data as Array<{ lineStyle: { width: number } }>;
    // Values: 800, 600, 400. range = [400, 800].
    // Default minWidth=1, maxWidth=6. Linear.
    // t(800) = 1.0 → width 6
    // t(600) = 0.5 → width 3.5
    // t(400) = 0.0 → width 1
    expect(data[0].lineStyle.width).toBe(6); // largest
    expect(data[1].lineStyle.width).toBe(3.5);
    expect(data[2].lineStyle.width).toBe(1); // smallest
  });

  it('widthScale: "sqrt" applies sqrt scale per datum', () => {
    const layer: GeoFlowLayer = { ...sampleFlow(), widthScale: 'sqrt' };
    const spec = buildFlowLayerSeries(layer, 0);
    const data = spec.data as Array<{ lineStyle: { width: number } }>;
    // sqrt t for value=600 in range [400, 800] should differ from linear 3.5
    expect(data[1].lineStyle.width).not.toBe(3.5);
    // Boundary points still clamp to min/max widths
    expect(data[0].lineStyle.width).toBe(6);
    expect(data[2].lineStyle.width).toBe(1);
  });

  it('layer.width fallback used when datum has no `value`', () => {
    const layer: GeoFlowLayer = {
      type: 'flow',
      width: 4,
      data: [
        { from: [29.0, 41.0], to: [32.85, 39.93] }, // no value
      ],
    };
    const spec = buildFlowLayerSeries(layer, 0);
    const data = spec.data as Array<{ lineStyle: { width: number } }>;
    expect(data[0].lineStyle.width).toBe(4);
  });

  it('curveness defaults to 0.2', () => {
    const spec = buildFlowLayerSeries(sampleFlow(), 0);
    const data = spec.data as Array<{ lineStyle: { curveness: number } }>;
    expect(data[0].lineStyle.curveness).toBe(0.2);
    expect((spec.lineStyle as { curveness: number }).curveness).toBe(0.2);
  });

  it('curveness clamps to [0, 1] (off-range value)', () => {
    const layer: GeoFlowLayer = { ...sampleFlow(), curveness: 1.5 };
    const spec = buildFlowLayerSeries(layer, 0);
    expect((spec.lineStyle as { curveness: number }).curveness).toBe(1);
  });

  it('curveness non-finite → fallback 0.2', () => {
    const layer: GeoFlowLayer = { ...sampleFlow(), curveness: NaN };
    const spec = buildFlowLayerSeries(layer, 0);
    expect((spec.lineStyle as { curveness: number }).curveness).toBe(0.2);
  });

  it('showEffect: true → effect.show: true (trail animation on)', () => {
    const layer: GeoFlowLayer = { ...sampleFlow(), showEffect: true };
    const spec = buildFlowLayerSeries(layer, 0);
    const eff = spec.effect as {
      show: boolean;
      period: number;
      trailLength: number;
      symbol: string;
    };
    expect(eff.show).toBe(true);
    expect(eff.period).toBe(6); // default
    expect(eff.trailLength).toBe(0.3); // default
    expect(eff.symbol).toBe('arrow'); // default
  });

  it('showEffect omitted → effect.show: false (animation opt-in)', () => {
    const spec = buildFlowLayerSeries(sampleFlow(), 0);
    expect((spec.effect as { show: boolean }).show).toBe(false);
  });

  it('respectReducedMotion: true → effect.show: false even when showEffect=true', () => {
    // Codex 019e25d4 iter-2: lines has no `rippleEffect.number` analogue.
    // `effect.show: false` is the canonical opt-out.
    const layer: GeoFlowLayer = {
      ...sampleFlow(),
      showEffect: true,
      respectReducedMotion: true,
    };
    const spec = buildFlowLayerSeries(layer, 0);
    expect((spec.effect as { show: boolean }).show).toBe(false);
  });

  it('showLabels: true → label.show: true + formatter "{b}"', () => {
    const layer: GeoFlowLayer = { ...sampleFlow(), showLabels: true };
    const spec = buildFlowLayerSeries(layer, 0);
    const label = spec.label as { show: boolean; formatter: string };
    expect(label.show).toBe(true);
    expect(label.formatter).toBe('{b}');
  });

  it('multi-edge data integrity (3 edges, all preserved in order)', () => {
    const spec = buildFlowLayerSeries(sampleFlow(), 0);
    const data = spec.data as Array<{ coords: number[][] }>;
    expect(data).toHaveLength(3);
    expect(data[0].coords[0]).toEqual([29.0, 41.0]);
    expect(data[1].coords[0]).toEqual([29.0, 41.0]);
    expect(data[2].coords[0]).toEqual([32.85, 39.93]);
  });

  it('per-edge color override propagates to lineStyle.color', () => {
    const layer: GeoFlowLayer = {
      type: 'flow',
      data: [
        {
          from: [29.0, 41.0],
          to: [32.85, 39.93],
          color: '#ff0000',
        },
      ],
    };
    const spec = buildFlowLayerSeries(layer, 0);
    const data = spec.data as Array<{ lineStyle: { color: string } }>;
    expect(data[0].lineStyle.color).toBe('#ff0000');
  });
});

describe('buildGeoOverlaySeries — flow dispatcher integration', () => {
  it('mixed overlays (bubble + effectScatter + flow) emits 3 series in order', () => {
    const sampleEffect: GeoEffectScatterLayer = {
      type: 'effectScatter',
      data: [{ name: 'Bursa', coordinates: [29.06, 40.19], value: 1 }],
    };
    const specs = buildGeoOverlaySeries([sampleBubble(), sampleEffect, sampleFlow()], 0);
    expect(specs).toHaveLength(3);
    expect(specs[0].type).toBe('scatter');
    expect(specs[1].type).toBe('effectScatter');
    expect(specs[2].type).toBe('lines');
  });

  it('flow series carries shared geoIndex with base map', () => {
    const specs = buildGeoOverlaySeries([sampleFlow()], 0);
    expect(specs).toHaveLength(1);
    expect(specs[0].geoIndex).toBe(0);
    expect(specs[0].coordinateSystem).toBe('geo');
  });
});
