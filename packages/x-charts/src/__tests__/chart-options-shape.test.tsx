// @vitest-environment jsdom
/**
 * PR-D2 — per-chart option-shape mutation tests for the 13 ECharts-backed
 * wrappers in @mfe/x-charts.
 *
 * Scope (PR-D2 only — see docs/x-charts-ui-ux-tracker.md line 36):
 *   (a) Data mapping fidelity   (input data → option.series[*].data)
 *   (b) Multi-series preservation
 *   (c) Prop→option toggles     (chart-specific)
 *   (d) Empty-data behaviour    (no throw)
 *   (e) Rerender stale-dependency check (data/prop change → fresh option)
 *
 * Out of scope (covered elsewhere):
 *   - A11y shell contract  → chart-a11y-bulk.test.tsx, bar-chart-a11y.test.tsx
 *   - Accent / theme       → chart-accent.test.tsx, chart-theme-decal.test.tsx
 *   - Visual regression    → x-charts.visual.ts (Playwright)
 *   - Coverage thresholds  → deferred to follow-up PR
 *
 * Mock surface: ECharts renderer is mocked via fixtures/echarts-mock; tests
 * read back the option object passed to setOption() and assert chart-specific
 * extractors. Generic `option.series[0].data[i].value` paths are NOT used —
 * each chart has its own data shape per CONTRACT.md.
 */
import {
  lastDispatchedOption,
  allDispatchedOptions,
  seriesTypes,
  resetEChartsMock,
  clickListenerRegistrations,
  lastSetOptionOpts,
} from './fixtures/echarts-mock'; // side-effect import: vi.mock hoisted before component imports below
import { installJsdomPolyfills, restoreJsdomPolyfills } from './fixtures/jsdom-polyfills';

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/react';

/* ------------------------------------------------------------------ */
/*  Component imports (mock is already hoisted by side-effect above)   */
/* ------------------------------------------------------------------ */

import { BarChart } from '../BarChart';
import { LineChart } from '../LineChart';
import { AreaChart } from '../AreaChart';
import { PieChart } from '../PieChart';
import { ScatterChart } from '../ScatterChart';
import { GaugeChart } from '../GaugeChart';
import { RadarChart } from '../RadarChart';
import { TreemapChart } from '../TreemapChart';
import { HeatmapChart } from '../HeatmapChart';
import { WaterfallChart } from '../WaterfallChart';
import { FunnelChart } from '../FunnelChart';
import { SankeyChart } from '../SankeyChart';
import { SunburstChart } from '../SunburstChart';
// PR-X6: BoxPlotChart wrapper.
import { BoxPlotChart } from '../BoxPlotChart';
// PR-X7: financial OHLC chart.
import { CandlestickChart } from '../CandlestickChart';
// PR-X10: pictogram bar chart.
import { PictorialBarChart } from '../PictorialBarChart';
// PR-X12a: parallel coordinates.
import { ParallelCoordinatesChart } from '../ParallelCoordinatesChart';
// PR-X12b: network / entity-edge graph.
import { GraphChart } from '../GraphChart';
// PR-X12c: geographic choropleth map.
import { GeoMap } from '../GeoMap';
import {
  ensureGeoMapRegistered,
  __resetGeoMapRegistrationCacheForTests,
} from '../geo/registerGeoMap';

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  resetEChartsMock();
  installJsdomPolyfills();
});

afterEach(() => {
  restoreJsdomPolyfills();
});

/* ------------------------------------------------------------------ */
/*  Type helpers (extractors are chart-specific — see each describe)   */
/* ------------------------------------------------------------------ */

type SeriesArray = Array<Record<string, unknown>>;

const series = (): SeriesArray => {
  const opt = lastDispatchedOption();
  return (opt?.series as SeriesArray) ?? [];
};

const axis = (key: 'xAxis' | 'yAxis'): Record<string, unknown> | undefined => {
  const opt = lastDispatchedOption();
  return opt?.[key] as Record<string, unknown> | undefined;
};

/* ================================================================== */
/*  BarChart                                                           */
/* ================================================================== */

describe('BarChart option shape', () => {
  // BarChart wraps each value in `{ value, itemStyle: { color } }` for
  // per-bar coloring; canonical extractor unwraps the value sequence.
  const extractValues = (s: SeriesArray): number[] => {
    const data = s[0].data as Array<number | { value?: number }>;
    return data.map((d) => (typeof d === 'number' ? d : (d.value ?? NaN)));
  };

  it('maps data[].value into series[0].data (object-wrapped values)', () => {
    render(
      <BarChart
        data={[
          { label: 'A', value: 10 },
          { label: 'B', value: 20 },
        ]}
        animate={false}
      />,
    );
    const s = series();
    expect(s[0].type).toBe('bar');
    // Value extraction: the canonical sequence after unwrapping per-bar
    // colour metadata.
    expect(extractValues(s)).toEqual([10, 20]);
    // Wrapper shape: each entry MUST be an object carrying both `value`
    // and `itemStyle.color` (per-bar coloring contract). A regression
    // that flattens to raw numbers would make extractValues() still pass
    // but should still fail this gate.
    const data = s[0].data as Array<{ value?: number; itemStyle?: { color?: string } }>;
    expect(typeof data[0]).toBe('object');
    expect(data[0]).toHaveProperty('value', 10);
    expect(data[0]?.itemStyle?.color).toEqual(expect.any(String));
  });

  it('default orientation = vertical → xAxis category, yAxis value', () => {
    render(<BarChart data={[{ label: 'A', value: 1 }]} animate={false} />);
    expect(axis('xAxis')?.type).toBe('category');
    expect(axis('yAxis')?.type).toBe('value');
  });

  it('orientation:horizontal swaps axis types', () => {
    render(<BarChart data={[{ label: 'A', value: 1 }]} orientation="horizontal" animate={false} />);
    expect(axis('xAxis')?.type).toBe('value');
    expect(axis('yAxis')?.type).toBe('category');
  });

  it('rerender with new data refreshes series.data (no stale dep)', () => {
    const { rerender } = render(<BarChart data={[{ label: 'A', value: 1 }]} animate={false} />);
    rerender(
      <BarChart
        data={[
          { label: 'A', value: 1 },
          { label: 'B', value: 2 },
        ]}
        animate={false}
      />,
    );
    expect(extractValues(series())).toEqual([1, 2]);
  });

  it('handles empty data without throwing', () => {
    expect(() => render(<BarChart data={[]} animate={false} />)).not.toThrow();
  });

  // ────────────────────────────────────────────────────────────────────
  // PR-X1 wrapper extensions (Codex thread 019e1e30 AGREE)
  // Codex hidden-risk note: each new prop must be locked at the
  // option-shape boundary so future refactors don't silently drop the
  // ECharts surface area (stacking + track + bar sizing).
  // ────────────────────────────────────────────────────────────────────

  it('stacked=false (default) leaves multi-series series[].stack undefined', () => {
    render(
      <BarChart
        data={
          [
            { label: 'Q1', a: 1, b: 2 },
            { label: 'Q2', a: 3, b: 4 },
          ] as unknown as Array<{ label: string; value: number }>
        }
        series={[
          { field: 'a', name: 'A' },
          { field: 'b', name: 'B' },
        ]}
        animate={false}
      />,
    );
    const s = series();
    expect(s).toHaveLength(2);
    expect(s[0].stack).toBeUndefined();
    expect(s[1].stack).toBeUndefined();
  });

  it('stacked=true + multi-series → shared stack key (single contiguous bar)', () => {
    render(
      <BarChart
        data={
          [
            { label: 'Q1', a: 1, b: 2 },
            { label: 'Q2', a: 3, b: 4 },
          ] as unknown as Array<{ label: string; value: number }>
        }
        series={[
          { field: 'a', name: 'A' },
          { field: 'b', name: 'B' },
        ]}
        stacked
        animate={false}
      />,
    );
    const s = series();
    expect(s).toHaveLength(2);
    expect(s[0].stack).toBe('bar-stack');
    expect(s[1].stack).toBe('bar-stack');
  });

  it('stacked=true + single-series is a no-op (no stack key leaks)', () => {
    render(<BarChart data={[{ label: 'A', value: 1 }]} stacked animate={false} />);
    const s = series();
    expect(s[0].stack).toBeUndefined();
  });

  it('showBackground=true sets series.showBackground + default backgroundStyle', () => {
    render(<BarChart data={[{ label: 'A', value: 1 }]} showBackground animate={false} />);
    const s = series();
    expect(s[0].showBackground).toBe(true);
    const bg = s[0].backgroundStyle as Record<string, unknown>;
    expect(bg).toBeDefined();
    // Default fill is a translucent grey to avoid stealing the eye away
    // from the actual bar.
    expect(bg.color).toEqual(expect.stringContaining('rgba'));
    expect(bg.borderRadius).toBe(4);
  });

  it('showBackground=false (default) does NOT add showBackground/backgroundStyle keys', () => {
    render(<BarChart data={[{ label: 'A', value: 1 }]} animate={false} />);
    const s = series();
    expect(s[0].showBackground).toBeUndefined();
    expect(s[0].backgroundStyle).toBeUndefined();
  });

  it('backgroundStyle override merges into the default fill', () => {
    render(
      <BarChart
        data={[{ label: 'A', value: 1 }]}
        showBackground
        backgroundStyle={{ color: 'var(--accent-muted)', borderRadius: 8 }}
        animate={false}
      />,
    );
    const bg = series()[0].backgroundStyle as Record<string, unknown>;
    expect(bg.color).toBe('var(--accent-muted)');
    expect(bg.borderRadius).toBe(8);
  });

  it('barWidth / barGap / barCategoryGap pass through verbatim', () => {
    render(
      <BarChart
        data={[{ label: 'A', value: 1 }]}
        barWidth={12}
        barGap="-100%"
        barCategoryGap="30%"
        animate={false}
      />,
    );
    const s = series()[0];
    expect(s.barWidth).toBe(12);
    expect(s.barGap).toBe('-100%');
    expect(s.barCategoryGap).toBe('30%');
  });

  it('negative values pass through unmodified (back-to-back pyramid contract)', () => {
    render(
      <BarChart
        data={
          [
            { label: '20-24', male: -240, female: 18 },
            { label: '25-29', male: -362, female: 82 },
          ] as unknown as Array<{ label: string; value: number }>
        }
        series={[
          { field: 'male', name: 'Erkek' },
          { field: 'female', name: 'Kadin' },
        ]}
        orientation="horizontal"
        animate={false}
      />,
    );
    const s = series();
    expect(s).toHaveLength(2);
    const maleData = s[0].data as number[];
    const femaleData = s[1].data as number[];
    expect(maleData).toEqual([-240, -362]);
    expect(femaleData).toEqual([18, 82]);
  });

  // PR-X11 (Codex thread 019e1e30): explicit axis range so bullet
  // widgets share a comparable scale and pyramid layouts can request
  // a symmetric domain around zero.

  it('valueAxisMax pins the value-axis max (bullet-chart contract)', () => {
    render(
      <BarChart
        data={[{ label: 'A', value: 5 }]}
        orientation="horizontal"
        valueAxisMax={10}
        animate={false}
      />,
    );
    expect(axis('xAxis')?.max).toBe(10);
  });

  it('valueAxisMin + valueAxisMax pin symmetric domain (pyramid contract)', () => {
    render(
      <BarChart
        data={
          [{ label: '20-24', male: -240, female: 18 }] as unknown as Array<{
            label: string;
            value: number;
          }>
        }
        series={[
          { field: 'male', name: 'Erkek' },
          { field: 'female', name: 'Kadin' },
        ]}
        orientation="horizontal"
        valueAxisMin={-300}
        valueAxisMax={300}
        animate={false}
      />,
    );
    expect(axis('xAxis')?.min).toBe(-300);
    expect(axis('xAxis')?.max).toBe(300);
  });

  it('valueAxisMax undefined leaves axis auto-scaling (default backward-compat)', () => {
    render(<BarChart data={[{ label: 'A', value: 5 }]} animate={false} />);
    expect(axis('yAxis')?.max).toBeUndefined();
    expect(axis('yAxis')?.min).toBeUndefined();
  });
});

/* ================================================================== */
/*  LineChart                                                          */
/* ================================================================== */

describe('LineChart option shape', () => {
  it('preserves multi-series count + maps data per series', () => {
    render(
      <LineChart
        series={[
          { name: 's1', data: [1, 2, 3] },
          { name: 's2', data: [4, 5, 6] },
        ]}
        labels={['a', 'b', 'c']}
        animate={false}
      />,
    );
    const s = series();
    expect(s).toHaveLength(2);
    expect(s[0].type).toBe('line');
    expect(s[0].data).toEqual([1, 2, 3]);
    expect(s[1].data).toEqual([4, 5, 6]);
  });

  it('rerender with extended series adds points', () => {
    const { rerender } = render(
      <LineChart series={[{ name: 's1', data: [1, 2] }]} labels={['a', 'b']} animate={false} />,
    );
    rerender(
      <LineChart
        series={[{ name: 's1', data: [1, 2, 3] }]}
        labels={['a', 'b', 'c']}
        animate={false}
      />,
    );
    expect(series()[0].data).toEqual([1, 2, 3]);
  });

  it('handles empty series without throwing', () => {
    expect(() => render(<LineChart series={[]} labels={[]} animate={false} />)).not.toThrow();
  });

  // ────────────────────────────────────────────────────────────────────
  // PR-X2 wrapper extensions (Codex thread 019e1e30 AGREE):
  // step + connectNulls for status-history / sparse-data line charts.
  // ────────────────────────────────────────────────────────────────────

  it('step=undefined (default) → series.step false, smooth follows curved', () => {
    render(
      <LineChart
        series={[{ name: 's1', data: [1, 2, 3] }]}
        labels={['a', 'b', 'c']}
        curved
        animate={false}
      />,
    );
    const s = series();
    expect(s[0].step).toBe(false);
    expect(s[0].smooth).toBe(true);
  });

  it('step=start → series.step="start" + smooth forced false (mutual exclusivity)', () => {
    render(
      <LineChart
        series={[{ name: 's1', data: [1, 2, 3] }]}
        labels={['a', 'b', 'c']}
        step="start"
        curved
        animate={false}
      />,
    );
    const s = series();
    expect(s[0].step).toBe('start');
    expect(s[0].smooth).toBe(false);
  });

  it('step="middle" / "end" pass through verbatim', () => {
    const { rerender } = render(
      <LineChart
        series={[{ name: 's1', data: [1, 2, 3] }]}
        labels={['a', 'b', 'c']}
        step="middle"
        animate={false}
      />,
    );
    expect(series()[0].step).toBe('middle');
    rerender(
      <LineChart
        series={[{ name: 's1', data: [1, 2, 3] }]}
        labels={['a', 'b', 'c']}
        step="end"
        animate={false}
      />,
    );
    expect(series()[0].step).toBe('end');
  });

  it('connectNulls=false (default) lands as connectNulls false', () => {
    render(
      <LineChart
        series={[{ name: 's1', data: [1, 2, 3] }]}
        labels={['a', 'b', 'c']}
        animate={false}
      />,
    );
    expect(series()[0].connectNulls).toBe(false);
  });

  it('connectNulls=true propagates to every series', () => {
    render(
      <LineChart
        series={[
          { name: 's1', data: [1, 2, 3] },
          { name: 's2', data: [4, 5, 6] },
        ]}
        labels={['a', 'b', 'c']}
        connectNulls
        animate={false}
      />,
    );
    const s = series();
    expect(s[0].connectNulls).toBe(true);
    expect(s[1].connectNulls).toBe(true);
  });
});

/* ================================================================== */
/*  AreaChart                                                          */
/* ================================================================== */

describe('AreaChart option shape', () => {
  it('always sets areaStyle (this is what makes it Area not Line)', () => {
    render(
      <AreaChart series={[{ name: 's1', data: [1, 2] }]} labels={['a', 'b']} animate={false} />,
    );
    expect(series()[0].areaStyle).toBeDefined();
  });

  it('stacked:true → series[].stack === "total"', () => {
    render(
      <AreaChart
        series={[{ name: 's1', data: [1, 2] }]}
        labels={['a', 'b']}
        stacked
        animate={false}
      />,
    );
    expect(series()[0].stack).toBe('total');
  });

  it('default stacked:false → no stack key', () => {
    render(
      <AreaChart series={[{ name: 's1', data: [1, 2] }]} labels={['a', 'b']} animate={false} />,
    );
    expect(series()[0].stack).toBeUndefined();
  });

  // ────────────────────────────────────────────────────────────────────
  // PR-X2 wrapper extensions: step + connectNulls (mirrors LineChart).
  // ────────────────────────────────────────────────────────────────────

  it('step="middle" + curved=true → series.step="middle", smooth forced false', () => {
    render(
      <AreaChart
        series={[{ name: 's1', data: [1, 2, 3] }]}
        labels={['a', 'b', 'c']}
        step="middle"
        curved
        animate={false}
      />,
    );
    const s = series();
    expect(s[0].step).toBe('middle');
    expect(s[0].smooth).toBe(false);
  });

  it('connectNulls=true propagates to AreaChart series', () => {
    render(
      <AreaChart
        series={[{ name: 's1', data: [1, 2, 3] }]}
        labels={['a', 'b', 'c']}
        connectNulls
        animate={false}
      />,
    );
    expect(series()[0].connectNulls).toBe(true);
  });
});

/* ================================================================== */
/*  PieChart                                                           */
/* ================================================================== */

describe('PieChart option shape', () => {
  it('default mode → radius starts at 0% (full pie)', () => {
    render(
      <PieChart
        data={[
          { label: 'A', value: 1 },
          { label: 'B', value: 2 },
        ]}
        animate={false}
      />,
    );
    const s = series();
    expect(s[0].type).toBe('pie');
    expect(s[0].radius).toEqual(['0%', '70%']);
  });

  it('donut:true → radius starts at 45% (hollow centre)', () => {
    render(<PieChart donut data={[{ label: 'A', value: 1 }]} animate={false} />);
    expect(series()[0].radius).toEqual(['45%', '70%']);
  });

  it('handles empty data without throwing', () => {
    expect(() => render(<PieChart data={[]} animate={false} />)).not.toThrow();
  });

  // ────────────────────────────────────────────────────────────────────
  // PR-X3 wrapper extensions: radius / roseType / selectedMode
  // (Codex thread 019e1e30 AGREE).
  // ────────────────────────────────────────────────────────────────────

  it('radius override replaces the breakpoint+donut heuristic', () => {
    render(<PieChart data={[{ label: 'A', value: 1 }]} radius={['62%', '100%']} animate={false} />);
    expect(series()[0].radius).toEqual(['62%', '100%']);
  });

  it('radius override wins even when donut=true is also passed', () => {
    render(
      <PieChart data={[{ label: 'A', value: 1 }]} donut radius={['72%', '88%']} animate={false} />,
    );
    expect(series()[0].radius).toEqual(['72%', '88%']);
  });

  it('roseType undefined (default) does NOT add the key to series', () => {
    render(<PieChart data={[{ label: 'A', value: 1 }]} animate={false} />);
    expect(series()[0].roseType).toBeUndefined();
  });

  it('roseType="radius" passes through to ECharts series', () => {
    render(
      <PieChart
        data={[
          { label: 'A', value: 1 },
          { label: 'B', value: 4 },
          { label: 'C', value: 9 },
        ]}
        roseType="radius"
        animate={false}
      />,
    );
    expect(series()[0].roseType).toBe('radius');
  });

  it('roseType="area" passes through to ECharts series', () => {
    render(<PieChart data={[{ label: 'A', value: 1 }]} roseType="area" animate={false} />);
    expect(series()[0].roseType).toBe('area');
  });

  it('selectedMode undefined (default) does NOT add the key', () => {
    render(<PieChart data={[{ label: 'A', value: 1 }]} animate={false} />);
    expect(series()[0].selectedMode).toBeUndefined();
  });

  it('selectedMode="single" enables single-slice selection', () => {
    render(<PieChart data={[{ label: 'A', value: 1 }]} selectedMode="single" animate={false} />);
    expect(series()[0].selectedMode).toBe('single');
  });

  it('selectedMode="multiple" enables multi-slice selection', () => {
    render(<PieChart data={[{ label: 'A', value: 1 }]} selectedMode="multiple" animate={false} />);
    expect(series()[0].selectedMode).toBe('multiple');
  });

  it('selectedMode=false explicitly disables selection (truthy-passes through)', () => {
    render(<PieChart data={[{ label: 'A', value: 1 }]} selectedMode={false} animate={false} />);
    expect(series()[0].selectedMode).toBe(false);
  });
});

/* ================================================================== */
/*  ScatterChart                                                       */
/* ================================================================== */

describe('ScatterChart option shape', () => {
  it('series.type === scatter', () => {
    render(
      <ScatterChart
        data={[
          { x: 1, y: 2 },
          { x: 3, y: 4 },
        ]}
      />,
    );
    expect(series()[0].type).toBe('scatter');
  });

  it('preserves data point count', () => {
    render(
      <ScatterChart
        data={[
          { x: 1, y: 2 },
          { x: 3, y: 4 },
          { x: 5, y: 6 },
        ]}
      />,
    );
    const data = series()[0].data as unknown[];
    expect(data).toHaveLength(3);
  });

  it('handles empty data without throwing', () => {
    expect(() => render(<ScatterChart data={[]} />)).not.toThrow();
  });

  // ────────────────────────────────────────────────────────────────────
  // PR-X4 wrapper extensions: large + largeThreshold + symbolSize fn
  // (Codex thread 019e1e30 AGREE).
  // ────────────────────────────────────────────────────────────────────

  it('large=false (default) does NOT add large / largeThreshold keys', () => {
    render(
      <ScatterChart
        data={[
          { x: 1, y: 2 },
          { x: 3, y: 4 },
        ]}
      />,
    );
    const s = series()[0];
    expect(s.large).toBeUndefined();
    expect(s.largeThreshold).toBeUndefined();
  });

  it('large=true adds series.large=true with default threshold=2000', () => {
    render(
      <ScatterChart
        data={[
          { x: 1, y: 2 },
          { x: 3, y: 4 },
        ]}
        large
      />,
    );
    const s = series()[0];
    expect(s.large).toBe(true);
    expect(s.largeThreshold).toBe(2000);
  });

  it('largeThreshold override passes through verbatim when large=true', () => {
    render(
      <ScatterChart
        data={[
          { x: 1, y: 2 },
          { x: 3, y: 4 },
        ]}
        large
        largeThreshold={5000}
      />,
    );
    expect(series()[0].largeThreshold).toBe(5000);
  });

  it('symbolSize fn replaces the default constant', () => {
    render(
      <ScatterChart
        data={[
          { x: 1, y: 2, size: 9 },
          { x: 3, y: 4, size: 25 },
        ]}
        symbolSize={(d) => (d.size != null ? Math.sqrt(d.size) * 5 : 8)}
      />,
    );
    const s = series()[0];
    // ECharts symbolSize is a function — the wrapper threads each datum
    // back through the caller-supplied formula.
    expect(typeof s.symbolSize).toBe('function');
  });

  it('symbolSize fn wins over bubble mode formula when both are set', () => {
    const customFn = (_d: { size?: number }) => 100; // sentinel large
    render(<ScatterChart data={[{ x: 1, y: 2, size: 9 }]} bubble symbolSize={customFn} />);
    const s = series()[0];
    expect(typeof s.symbolSize).toBe('function');
    // Sentinel: the formula returns 100 — verify it's the caller's not bubble's.
    const fn = s.symbolSize as (val: number[], params: { dataIndex: number }) => number;
    expect(fn([1, 2, 9], { dataIndex: 0 })).toBe(100);
  });
});

/* ================================================================== */
/*  GaugeChart                                                         */
/* ================================================================== */

describe('GaugeChart option shape', () => {
  it('series.type === gauge + value lands in series[0].data[0].value', () => {
    render(<GaugeChart value={42} min={0} max={100} />);
    const s = series();
    expect(s[0].type).toBe('gauge');
    const data = s[0].data as Array<{ value?: number }>;
    expect(data[0]?.value).toBe(42);
  });

  it('value = 0 dispatches without throwing', () => {
    expect(() => render(<GaugeChart value={0} min={0} max={100} />)).not.toThrow();
    const data = series()[0].data as Array<{ value?: number }>;
    expect(data[0]?.value).toBe(0);
  });

  it('rerender with new value refreshes series[0].data[0].value', () => {
    const { rerender } = render(<GaugeChart value={10} min={0} max={100} />);
    rerender(<GaugeChart value={75} min={0} max={100} />);
    const data = series()[0].data as Array<{ value?: number }>;
    expect(data[0]?.value).toBe(75);
  });
});

/* ================================================================== */
/*  RadarChart                                                         */
/* ================================================================== */

describe('RadarChart option shape', () => {
  it('series.type === radar + maps series[].data', () => {
    render(
      <RadarChart
        indicators={[
          { name: 'A', max: 10 },
          { name: 'B', max: 10 },
          { name: 'C', max: 10 },
        ]}
        series={[{ name: 's1', data: [5, 6, 7] }]}
      />,
    );
    const s = series();
    expect(s[0].type).toBe('radar');
    // Radar wraps series.data into [{ value: number[], name }]
    const data = s[0].data as Array<{ value?: number[] }>;
    expect(data[0]?.value).toEqual([5, 6, 7]);
  });

  it('multi-series preservation: 2 input series → 2 entries in series[0].data', () => {
    render(
      <RadarChart
        indicators={[
          { name: 'A', max: 10 },
          { name: 'B', max: 10 },
        ]}
        series={[
          { name: 's1', data: [5, 6] },
          { name: 's2', data: [7, 8] },
        ]}
      />,
    );
    const data = series()[0].data as Array<{ value?: number[] }>;
    expect(data).toHaveLength(2);
    expect(data[0]?.value).toEqual([5, 6]);
    expect(data[1]?.value).toEqual([7, 8]);
  });
});

/* ================================================================== */
/*  TreemapChart                                                       */
/* ================================================================== */

describe('TreemapChart option shape', () => {
  it('series.type === treemap + hierarchical data passes through', () => {
    render(
      <TreemapChart
        data={[
          { name: 'A', value: 10 },
          { name: 'B', value: 20 },
        ]}
      />,
    );
    const s = series();
    expect(s[0].type).toBe('treemap');
    const data = s[0].data as Array<{ name?: string; value?: number }>;
    expect(data).toHaveLength(2);
    expect(data[0]?.name).toBe('A');
    expect(data[0]?.value).toBe(10);
  });

  it('handles empty data without throwing', () => {
    expect(() => render(<TreemapChart data={[]} />)).not.toThrow();
  });
});

/* ================================================================== */
/*  HeatmapChart                                                       */
/* ================================================================== */

describe('HeatmapChart option shape', () => {
  it('series.type === heatmap + tuple data passes through', () => {
    render(
      <HeatmapChart
        data={[
          [0, 0, 1],
          [0, 1, 2],
          [1, 0, 3],
          [1, 1, 4],
        ]}
        xLabels={['x1', 'x2']}
        yLabels={['y1', 'y2']}
      />,
    );
    const s = series();
    expect(s[0].type).toBe('heatmap');
    const data = s[0].data as Array<number[]>;
    expect(data).toHaveLength(4);
    expect(data[0]).toEqual([0, 0, 1]);
    expect(data[3]).toEqual([1, 1, 4]);
  });

  it('handles empty data without throwing', () => {
    expect(() => render(<HeatmapChart data={[]} xLabels={[]} yLabels={[]} />)).not.toThrow();
  });

  it('rerender with new markups refreshes series[0].markPoint.data (no stale dep)', () => {
    // Codex post-impl iter-3 P1: option memo previously omitted
    // `markupResult` from its dependency array, so toggling markups
    // updated the click-lookup but NOT the visual markPoint patches.
    // This test pins the regression closed.
    const baseProps = {
      data: [
        [0, 0, 1],
        [1, 0, 5],
        [0, 1, 7],
      ] as Array<[number, number, number]>,
      xLabels: ['Mon', 'Tue'],
      yLabels: ['AM', 'PM'],
      animate: false,
    };
    const { rerender } = render(<HeatmapChart {...baseProps} />);
    // Initial render: no markups → no markPoint patch on series[0].
    expect((series()[0] as { markPoint?: { data: unknown[] } }).markPoint).toBeUndefined();

    rerender(
      <HeatmapChart
        {...baseProps}
        markups={[
          {
            id: 'spike-anchor',
            type: 'label',
            text: 'Spike',
            anchor: { dataIndex: 1 },
          },
        ]}
      />,
    );
    // After rerender: markPoint patch must be present and resolve to
    // the cell-tuple (xCat='Tue', yCat='AM') via the heatmap branch.
    const refreshed = series()[0] as { markPoint?: { data: unknown[] } };
    expect(refreshed.markPoint).toBeDefined();
    expect(refreshed.markPoint!.data).toHaveLength(1);
    expect((refreshed.markPoint!.data[0] as { coord: [string, string] }).coord).toEqual([
      'Tue',
      'AM',
    ]);

    // Toggling back to no markups must also flush the patch (memo dep
    // works in both directions).
    rerender(<HeatmapChart {...baseProps} />);
    expect((series()[0] as { markPoint?: { data: unknown[] } }).markPoint).toBeUndefined();
  });

  it('skips cell-tuple allocation when no markup needs dataIndex anchor', () => {
    // Codex post-impl iter-3 P1: render-time O(n) allocation should not
    // run when consumers don't pass `markups` or only pass `{ x, y }` /
    // `{ xLabel, yLabel }` anchors. We can't directly observe the
    // allocation, but we can prove that a `{ xLabel, yLabel }` markup
    // resolves WITHOUT exercising the cell-tuple branch — the resolver
    // returns `[xLabel, yLabel]` directly.
    render(
      <HeatmapChart
        data={[
          [0, 0, 1],
          [1, 1, 9],
        ]}
        xLabels={['Mon', 'Tue']}
        yLabels={['AM', 'PM']}
        animate={false}
        markups={[
          {
            id: 'shorthand',
            type: 'label',
            text: 'Tepe',
            anchor: { xLabel: 'Tue', yLabel: 'PM' },
          },
        ]}
      />,
    );
    const sx = series()[0] as { markPoint?: { data: unknown[] } };
    expect(sx.markPoint).toBeDefined();
    expect((sx.markPoint!.data[0] as { coord: [string, string] }).coord).toEqual(['Tue', 'PM']);
  });
});

/* ================================================================== */
/*  WaterfallChart                                                     */
/* ================================================================== */

describe('WaterfallChart option shape', () => {
  it('uses bar-based composition (Waterfall is built on stacked bars)', () => {
    render(
      <WaterfallChart
        data={[
          { label: 'Start', value: 100 },
          { label: 'Inflow', value: 50 },
          { label: 'End', value: 150 },
        ]}
      />,
    );
    const types = seriesTypes(lastDispatchedOption());
    expect(types.every((t) => t === 'bar')).toBe(true);
    expect(types.length).toBeGreaterThanOrEqual(1);
  });

  it('handles empty data without throwing', () => {
    expect(() => render(<WaterfallChart data={[]} />)).not.toThrow();
  });
});

/* ================================================================== */
/*  FunnelChart                                                        */
/* ================================================================== */

describe('FunnelChart option shape', () => {
  it('series.type === funnel + maps name/value passthrough', () => {
    render(
      <FunnelChart
        data={[
          { name: 'Top', value: 100 },
          { name: 'Mid', value: 60 },
          { name: 'Bot', value: 30 },
        ]}
      />,
    );
    const s = series();
    expect(s[0].type).toBe('funnel');
    const data = s[0].data as Array<{ name?: string; value?: number }>;
    expect(data).toHaveLength(3);
    expect(data[0]?.name).toBe('Top');
    expect(data[0]?.value).toBe(100);
  });

  it('handles empty data without throwing', () => {
    expect(() => render(<FunnelChart data={[]} />)).not.toThrow();
  });
});

/* ================================================================== */
/*  SankeyChart                                                        */
/* ================================================================== */

describe('SankeyChart option shape', () => {
  it('series.type === sankey + nodes/links land in series[0]', () => {
    render(
      <SankeyChart
        nodes={[{ name: 'A' }, { name: 'B' }, { name: 'C' }]}
        links={[
          { source: 'A', target: 'B', value: 10 },
          { source: 'B', target: 'C', value: 5 },
        ]}
      />,
    );
    const s = series();
    expect(s[0].type).toBe('sankey');
    const data = s[0].data as Array<{ name?: string }>;
    const links = s[0].links as Array<{ source?: string; target?: string; value?: number }>;
    expect(data).toHaveLength(3);
    expect(links).toHaveLength(2);
    expect(links[0]?.value).toBe(10);
  });

  it('handles empty graph without throwing', () => {
    expect(() => render(<SankeyChart nodes={[]} links={[]} />)).not.toThrow();
  });
});

/* ================================================================== */
/*  SunburstChart                                                      */
/* ================================================================== */

describe('SunburstChart option shape', () => {
  it('series.type === sunburst + hierarchical data passthrough', () => {
    render(
      <SunburstChart
        data={[
          {
            name: 'Root',
            children: [
              { name: 'A', value: 10 },
              { name: 'B', value: 20 },
            ],
          },
        ]}
      />,
    );
    const s = series();
    expect(s[0].type).toBe('sunburst');
    const data = s[0].data as Array<{ name?: string; children?: unknown[] }>;
    expect(data).toHaveLength(1);
    expect(data[0]?.name).toBe('Root');
    expect(data[0]?.children).toHaveLength(2);
  });

  it('handles empty data without throwing', () => {
    expect(() => render(<SunburstChart data={[]} />)).not.toThrow();
  });
});

/* ================================================================== */
/*  BoxPlotChart (PR-X6)                                               */
/* ================================================================== */

describe('BoxPlotChart option shape', () => {
  it('series.type === boxplot for raw values input', () => {
    render(
      <BoxPlotChart
        data={[
          { category: 'A', values: [1, 2, 3, 4, 5] },
          { category: 'B', values: [2, 3, 4, 5, 6] },
        ]}
        animate={false}
      />,
    );
    expect(series()[0].type).toBe('boxplot');
  });

  it('computes 5-number summary from raw values (Q2=median)', () => {
    render(<BoxPlotChart data={[{ category: 'A', values: [1, 2, 3, 4, 5] }]} animate={false} />);
    const data = series()[0].data as number[][];
    expect(data[0]).toEqual([1, 2, 3, 4, 5]);
  });

  it('passes pre-computed quartiles through unchanged', () => {
    render(
      <BoxPlotChart data={[{ category: 'A', quartiles: [10, 20, 30, 40, 50] }]} animate={false} />,
    );
    const data = series()[0].data as number[][];
    expect(data[0]).toEqual([10, 20, 30, 40, 50]);
  });

  it('emits scatter outlier series when showOutliers=true (default)', () => {
    render(
      <BoxPlotChart data={[{ category: 'A', values: [1, 2, 3, 4, 5, 100] }]} animate={false} />,
    );
    const allSeries = series();
    expect(allSeries.length).toBeGreaterThanOrEqual(2);
    expect(allSeries[1].type).toBe('scatter');
    expect(allSeries[1].name).toBe('Outliers');
  });

  it('does NOT emit outlier series when showOutliers=false', () => {
    render(
      <BoxPlotChart
        data={[{ category: 'A', values: [1, 2, 3, 4, 5, 100] }]}
        showOutliers={false}
        animate={false}
      />,
    );
    expect(series()).toHaveLength(1);
  });

  it('orientation:horizontal swaps xAxis (value) and yAxis (category)', () => {
    render(
      <BoxPlotChart
        data={[{ category: 'A', values: [1, 2, 3] }]}
        orientation="horizontal"
        animate={false}
      />,
    );
    expect(axis('xAxis')?.type).toBe('value');
    expect(axis('yAxis')?.type).toBe('category');
  });

  it('handles empty data without throwing', () => {
    expect(() => render(<BoxPlotChart data={[]} animate={false} />)).not.toThrow();
  });

  it('boxWidth tuple passes through to series', () => {
    render(
      <BoxPlotChart
        data={[{ category: 'A', values: [1, 2, 3] }]}
        boxWidth={['7%', '50%']}
        animate={false}
      />,
    );
    expect(series()[0].boxWidth).toEqual(['7%', '50%']);
  });
});

/* ================================================================== */
/*  CandlestickChart (PR-X7)                                           */
/* ================================================================== */

describe('CandlestickChart option shape', () => {
  it('series.type === candlestick + maps OHLC tuples', () => {
    render(
      <CandlestickChart
        data={[
          { label: 'D1', open: 100, close: 110, low: 95, high: 115 },
          { label: 'D2', open: 110, close: 105, low: 100, high: 112 },
        ]}
        animate={false}
      />,
    );
    const s = series();
    expect(s[0].type).toBe('candlestick');
    const data = s[0].data as number[][];
    expect(data[0]).toEqual([100, 110, 95, 115]);
    expect(data[1]).toEqual([110, 105, 100, 112]);
  });

  it('xAxis category-based, yAxis value with scale=true (financial range needed)', () => {
    render(
      <CandlestickChart
        data={[{ label: 'D1', open: 100, close: 110, low: 95, high: 115 }]}
        animate={false}
      />,
    );
    expect(axis('xAxis')?.type).toBe('category');
    expect(axis('yAxis')?.type).toBe('value');
    expect(axis('yAxis')?.scale).toBe(true);
  });

  it('bullishColor / bearishColor map to itemStyle.color / color0', () => {
    render(
      <CandlestickChart
        data={[{ label: 'D1', open: 100, close: 110, low: 95, high: 115 }]}
        bullishColor="#0f0"
        bearishColor="#f00"
        animate={false}
      />,
    );
    const itemStyle = series()[0].itemStyle as Record<string, unknown>;
    expect(itemStyle.color).toBe('#0f0');
    expect(itemStyle.color0).toBe('#f00');
    expect(itemStyle.borderColor).toBe('#0f0');
    expect(itemStyle.borderColor0).toBe('#f00');
  });

  it('handles empty data without throwing', () => {
    expect(() => render(<CandlestickChart data={[]} animate={false} />)).not.toThrow();
  });
});

/* ================================================================== */
/*  PictorialBarChart (PR-X10)                                         */
/* ================================================================== */

describe('PictorialBarChart option shape', () => {
  it('series.type === pictorialBar + maps data values', () => {
    render(
      <PictorialBarChart
        data={[
          { label: 'A', value: 5 },
          { label: 'B', value: 8 },
        ]}
        animate={false}
      />,
    );
    const s = series();
    expect(s[0].type).toBe('pictorialBar');
    const data = s[0].data as Array<{ value: number }>;
    expect(data.map((d) => d.value)).toEqual([5, 8]);
  });

  it('default symbol=circle + symbolRepeat=true', () => {
    render(<PictorialBarChart data={[{ label: 'A', value: 1 }]} animate={false} />);
    const s = series()[0];
    expect(s.symbol).toBe('circle');
    expect(s.symbolRepeat).toBe(true);
  });

  it('symbol + symbolRepeat overrides apply at series level', () => {
    render(
      <PictorialBarChart
        data={[{ label: 'A', value: 5 }]}
        symbol="image://https://cdn/icon.svg"
        symbolRepeat="fixed"
        symbolSize={[20, 30]}
        animate={false}
      />,
    );
    const s = series()[0];
    expect(s.symbol).toBe('image://https://cdn/icon.svg');
    expect(s.symbolRepeat).toBe('fixed');
    expect(s.symbolSize).toEqual([20, 30]);
  });

  it('per-data-point symbol overrides default symbol', () => {
    render(
      <PictorialBarChart
        data={[
          { label: 'A', value: 1, symbol: 'triangle' },
          { label: 'B', value: 2 },
        ]}
        symbol="circle"
        animate={false}
      />,
    );
    const data = series()[0].data as Array<{ symbol?: string }>;
    expect(data[0].symbol).toBe('triangle');
    expect(data[1].symbol).toBe('circle');
  });

  it('horizontal orientation swaps axis types', () => {
    render(
      <PictorialBarChart
        data={[{ label: 'A', value: 1 }]}
        orientation="horizontal"
        animate={false}
      />,
    );
    expect(axis('xAxis')?.type).toBe('value');
    expect(axis('yAxis')?.type).toBe('category');
  });

  it('handles empty data without throwing', () => {
    expect(() => render(<PictorialBarChart data={[]} animate={false} />)).not.toThrow();
  });
});

/*  ParallelCoordinatesChart (PR-X12a)                                 */
/* ================================================================== */

describe('ParallelCoordinatesChart option shape', () => {
  const sampleAxes = [
    { field: 'dept', name: 'Department', type: 'category' as const },
    { field: 'salary', name: 'Salary', type: 'value' as const, min: 0, max: 100000 },
    { field: 'tenure', name: 'Tenure (yr)', type: 'value' as const, min: 0, max: 30 },
  ];
  const sampleData = [
    { dept: 'Eng', salary: 80000, tenure: 5 },
    { dept: 'Sales', salary: 60000, tenure: 3 },
    { dept: 'HR', salary: 55000, tenure: 8 },
  ];

  it('series.type === parallel + each row → polyline data in axis order', () => {
    render(<ParallelCoordinatesChart data={sampleData} axes={sampleAxes} animate={false} />);
    const s = series();
    expect(s[0].type).toBe('parallel');
    const data = s[0].data as Array<Array<number | string>>;
    expect(data).toHaveLength(3);
    // Each polyline is [v0, v1, v2] in the axis order.
    expect(data[0]).toEqual(['Eng', 80000, 5]);
    expect(data[1]).toEqual(['Sales', 60000, 3]);
    expect(data[2]).toEqual(['HR', 55000, 8]);
  });

  it('parallelAxis array preserves visual order + types', () => {
    render(<ParallelCoordinatesChart data={sampleData} axes={sampleAxes} animate={false} />);
    const opt = lastDispatchedOption();
    const parallelAxis = opt?.parallelAxis as Array<Record<string, unknown>>;
    expect(parallelAxis).toHaveLength(3);
    expect(parallelAxis[0]).toMatchObject({ dim: 0, name: 'Department', type: 'category' });
    expect(parallelAxis[1]).toMatchObject({
      dim: 1,
      name: 'Salary',
      type: 'value',
      min: 0,
      max: 100000,
    });
    expect(parallelAxis[2]).toMatchObject({ dim: 2, name: 'Tenure (yr)', type: 'value' });
  });

  it('groupBy partitions data into one series per group + assigns palette colors', () => {
    render(
      <ParallelCoordinatesChart
        data={sampleData}
        axes={sampleAxes}
        groupBy="dept"
        animate={false}
      />,
    );
    const s = series();
    // 3 distinct dept values → 3 series.
    expect(s).toHaveLength(3);
    expect(s[0].name).toBe('Eng');
    expect(s[1].name).toBe('Sales');
    expect(s[2].name).toBe('HR');
    // Each series gets a distinct palette color.
    const c0 = (s[0].lineStyle as Record<string, unknown>).color;
    const c1 = (s[1].lineStyle as Record<string, unknown>).color;
    expect(c0).not.toBe(c1);
  });

  it('default lineOpacity=0.35 + lineWidth=1.5 + overrides', () => {
    render(<ParallelCoordinatesChart data={sampleData} axes={sampleAxes} animate={false} />);
    const lineStyle = series()[0].lineStyle as Record<string, unknown>;
    expect(lineStyle.opacity).toBe(0.35);
    expect(lineStyle.width).toBe(1.5);
  });

  it('lineOpacity + lineWidth overrides pass through', () => {
    render(
      <ParallelCoordinatesChart
        data={sampleData}
        axes={sampleAxes}
        lineOpacity={0.8}
        lineWidth={3}
        animate={false}
      />,
    );
    const lineStyle = series()[0].lineStyle as Record<string, unknown>;
    expect(lineStyle.opacity).toBe(0.8);
    expect(lineStyle.width).toBe(3);
  });

  it('handles empty data without throwing', () => {
    expect(() =>
      render(<ParallelCoordinatesChart data={[]} axes={sampleAxes} animate={false} />),
    ).not.toThrow();
  });

  it('handles <2 axes without throwing (returns null option)', () => {
    expect(() =>
      render(
        <ParallelCoordinatesChart
          data={sampleData}
          axes={[{ field: 'dept', name: 'D', type: 'category' }]}
          animate={false}
        />,
      ),
    ).not.toThrow();
  });
});

/*  GraphChart (PR-X12b)                                               */
/* ================================================================== */

describe('GraphChart option shape', () => {
  const sampleNodes = [
    { id: 'a', name: 'A', value: 10, category: 0 },
    { id: 'b', name: 'B', value: 20, category: 0 },
    { id: 'c', name: 'C', value: 30, category: 1 },
  ];
  const sampleEdges = [
    { source: 'a', target: 'b', value: 5 },
    { source: 'b', target: 'c', value: 3 },
  ];
  const sampleCategories = [
    { name: 'Type 1', color: '#3b82f6' },
    { name: 'Type 2', color: '#22c55e' },
  ];

  it('series.type === graph + maps nodes/edges/categories', () => {
    render(
      <GraphChart
        nodes={sampleNodes}
        edges={sampleEdges}
        categories={sampleCategories}
        animate={false}
      />,
    );
    const s = series();
    expect(s[0].type).toBe('graph');
    const nodes = s[0].data as Array<{ id: string; name: string }>;
    const links = s[0].links as Array<{ source: string; target: string }>;
    const categories = s[0].categories as Array<{ name: string }>;
    expect(nodes).toHaveLength(3);
    expect(links).toHaveLength(2);
    expect(categories).toHaveLength(2);
    expect(nodes[0]).toMatchObject({ id: 'a', name: 'A' });
    expect(links[0]).toMatchObject({ source: 'a', target: 'b' });
  });

  it('default layout = force + force config emitted', () => {
    render(<GraphChart nodes={sampleNodes} edges={sampleEdges} animate={false} />);
    const s = series()[0];
    expect(s.layout).toBe('force');
    const force = s.force as { repulsion: number; gravity: number };
    expect(force.repulsion).toBe(100);
    expect(force.gravity).toBe(0.1);
  });

  it('layout="circular" does NOT emit force config', () => {
    render(
      <GraphChart nodes={sampleNodes} edges={sampleEdges} layout="circular" animate={false} />,
    );
    const s = series()[0];
    expect(s.layout).toBe('circular');
    expect(s.force).toBeUndefined();
  });

  it('directed=true (default) emits arrow head, false leaves none', () => {
    const { rerender } = render(
      <GraphChart nodes={sampleNodes} edges={sampleEdges} animate={false} />,
    );
    expect(series()[0].edgeSymbol).toEqual(['none', 'arrow']);
    rerender(
      <GraphChart nodes={sampleNodes} edges={sampleEdges} directed={false} animate={false} />,
    );
    expect(series()[0].edgeSymbol).toEqual(['none', 'none']);
  });

  it('force layout knobs (repulsion, gravity, edgeLength) pass through', () => {
    render(
      <GraphChart
        nodes={sampleNodes}
        edges={sampleEdges}
        forceRepulsion={250}
        forceGravity={0.2}
        forceEdgeLength={[30, 80]}
        animate={false}
      />,
    );
    const force = series()[0].force as { repulsion: number; gravity: number; edgeLength: unknown };
    expect(force.repulsion).toBe(250);
    expect(force.gravity).toBe(0.2);
    expect(force.edgeLength).toEqual([30, 80]);
  });

  it('handles empty nodes without throwing', () => {
    expect(() => render(<GraphChart nodes={[]} edges={[]} animate={false} />)).not.toThrow();
  });
});

/* ================================================================== */
/*  GeoMap (PR-X12c)                                                   */
/* ================================================================== */

describe('GeoMap option shape', () => {
  const sampleGeoJson = {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        properties: { name: 'İstanbul' },
        geometry: { type: 'Polygon', coordinates: [] },
      },
      {
        type: 'Feature' as const,
        properties: { name: 'Ankara' },
        geometry: { type: 'Polygon', coordinates: [] },
      },
    ],
  };

  const sampleData = [
    { name: 'İstanbul', value: 5000 },
    { name: 'Ankara', value: 3000 },
  ];

  beforeEach(async () => {
    __resetGeoMapRegistrationCacheForTests();
    await ensureGeoMapRegistered('TR', () => sampleGeoJson);
  });

  it('series.type === map + map=mapName + region data passes through', () => {
    render(<GeoMap mapName="TR" data={sampleData} animate={false} />);
    const s = series();
    expect(s[0].type).toBe('map');
    expect(s[0].map).toBe('TR');
    const data = s[0].data as Array<{ name: string; value: number }>;
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({ name: 'İstanbul', value: 5000 });
  });

  it('visualMap emits continuous with computed min/max from data', () => {
    render(<GeoMap mapName="TR" data={sampleData} animate={false} />);
    const opt = lastDispatchedOption();
    const vm = opt?.visualMap as Record<string, unknown>;
    expect(vm.type).toBe('continuous');
    expect(vm.min).toBe(3000);
    expect(vm.max).toBe(5000);
  });

  it('visualMap min/max overrides propagate', () => {
    render(
      <GeoMap
        mapName="TR"
        data={sampleData}
        visualMap={{ min: 0, max: 10000, colors: ['#fff', '#000'] }}
        animate={false}
      />,
    );
    const vm = lastDispatchedOption()?.visualMap as Record<string, unknown>;
    expect(vm.min).toBe(0);
    expect(vm.max).toBe(10000);
    expect((vm.inRange as { color: string[] }).color).toEqual(['#fff', '#000']);
  });

  it('nameMap alias rewrites region names before passing to ECharts', () => {
    render(
      <GeoMap
        mapName="TR"
        data={[{ name: 'Istanbul', value: 100 }]}
        nameMap={{ Istanbul: 'İstanbul' }}
        animate={false}
      />,
    );
    const data = series()[0].data as Array<{ name: string }>;
    expect(data[0].name).toBe('İstanbul');
  });

  it('nameProperty propagates to series option (code-based matching)', () => {
    render(
      <GeoMap
        mapName="TR"
        data={[{ name: 'TR-34', value: 100 }]}
        nameProperty="code"
        animate={false}
      />,
    );
    const s = series()[0];
    expect(s.nameProperty).toBe('code');
  });

  it('selectedMode + roam + showLabels props propagate', () => {
    render(
      <GeoMap
        mapName="TR"
        data={sampleData}
        selectedMode="multiple"
        roam={false}
        showLabels
        animate={false}
      />,
    );
    const s = series()[0];
    expect(s.selectedMode).toBe('multiple');
    expect(s.roam).toBe(false);
    expect((s.label as { show: boolean }).show).toBe(true);
  });

  it('handles empty data without throwing', () => {
    expect(() => render(<GeoMap mapName="TR" data={[]} animate={false} />)).not.toThrow();
  });

  // PR-X13a (Codex thread 019e2254 plan-time AGREE): overlays prop
  // foundation. Bubble layer on coordinateSystem='geo' renders as a
  // second series after the choropleth base.
  it('overlays={[{type:"bubble"...}]} appends a scatter-on-geo series', () => {
    render(
      <GeoMap
        mapName="TR"
        data={sampleData}
        overlays={[
          {
            type: 'bubble',
            name: 'HQ Headcount',
            data: [
              { name: 'İstanbul HQ', coordinates: [29.0, 41.0], value: 1200 },
              { name: 'Ankara HQ', coordinates: [32.8, 39.9], value: 800 },
            ],
            symbol: 'circle',
            opacity: 0.7,
          },
        ]}
        animate={false}
      />,
    );
    const allSeries = series();
    // Base map series + 1 bubble overlay
    expect(allSeries).toHaveLength(2);
    expect(allSeries[0].type).toBe('map');
    const bubble = allSeries[1];
    expect(bubble.type).toBe('scatter');
    expect(bubble.coordinateSystem).toBe('geo');
    expect(bubble.geoIndex).toBe(0);
    expect(bubble.name).toBe('HQ Headcount');
    const bubbleData = bubble.data as Array<{ value: number[]; name: string }>;
    expect(bubbleData).toHaveLength(2);
    expect(bubbleData[0].value).toEqual([29.0, 41.0, 1200]);
    expect(bubbleData[0].name).toBe('İstanbul HQ');
  });

  it('overlays absent does not emit any geo coord standalone series duplication', () => {
    render(<GeoMap mapName="TR" data={sampleData} animate={false} />);
    const allSeries = series();
    // Single map series — no leftover scatter from a stale overlay.
    expect(allSeries).toHaveLength(1);
    expect(allSeries[0].type).toBe('map');
  });

  it('multiple overlay layers all appended in order', () => {
    render(
      <GeoMap
        mapName="TR"
        data={sampleData}
        overlays={[
          {
            type: 'bubble',
            name: 'Layer A',
            data: [{ name: 'A', coordinates: [29, 41], value: 100 }],
          },
          {
            type: 'bubble',
            name: 'Layer B',
            data: [{ name: 'B', coordinates: [32, 39], value: 200 }],
          },
        ]}
        animate={false}
      />,
    );
    const allSeries = series();
    // Base map + 2 bubble overlays
    expect(allSeries).toHaveLength(3);
    expect(allSeries[0].type).toBe('map');
    expect(allSeries[1].type).toBe('scatter');
    expect(allSeries[1].name).toBe('Layer A');
    expect(allSeries[2].type).toBe('scatter');
    expect(allSeries[2].name).toBe('Layer B');
  });

  // PR-X13b (Codex thread 019e2254 plan-time AGREE): effectScatter
  // overlay layer — animated pulse for highlighted points.
  it('effectScatter overlay appends a series with rippleEffect config', () => {
    render(
      <GeoMap
        mapName="TR"
        data={sampleData}
        overlays={[
          {
            type: 'effectScatter',
            name: 'Critical alerts',
            data: [{ name: 'İstanbul', coordinates: [29.0, 41.0], value: 5 }],
          },
        ]}
        animate={false}
      />,
    );
    const allSeries = series();
    expect(allSeries).toHaveLength(2);
    expect(allSeries[0].type).toBe('map');
    const fx = allSeries[1];
    expect(fx.type).toBe('effectScatter');
    expect(fx.coordinateSystem).toBe('geo');
    expect(fx.geoIndex).toBe(0);
    const ripple = fx.rippleEffect as { period: number; brushType: string };
    expect(ripple.period).toBe(4);
    expect(ripple.brushType).toBe('stroke');
  });

  it('effectScatter respectReducedMotion=true → number=0 (ripple paths suppressed)', () => {
    // Codex 019e25a2 iter-1 medium-fix: see builder unit test note.
    // Wrapper-side reduced-motion uses `rippleEffect.number = 0` to
    // skip ripple emission; period/scale remain in valid ranges.
    render(
      <GeoMap
        mapName="TR"
        data={sampleData}
        overlays={[
          {
            type: 'effectScatter',
            data: [{ name: 'X', coordinates: [29, 41], value: 1 }],
            respectReducedMotion: true,
          },
        ]}
        animate={false}
      />,
    );
    const fx = series()[1];
    const ripple = fx.rippleEffect as {
      number: number;
      period: number;
      scale: number;
    };
    expect(ripple.number).toBe(0);
    expect(ripple.period).toBe(4);
    expect(ripple.scale).toBe(2.5);
  });

  it('mixed overlays (bubble + effectScatter) preserve type discrimination', () => {
    render(
      <GeoMap
        mapName="TR"
        data={sampleData}
        overlays={[
          { type: 'bubble', data: [{ name: 'A', coordinates: [29, 41], value: 100 }] },
          { type: 'effectScatter', data: [{ name: 'B', coordinates: [32, 39], value: 5 }] },
        ]}
        animate={false}
      />,
    );
    const allSeries = series();
    expect(allSeries).toHaveLength(3); // base + bubble + effectScatter
    expect(allSeries[1].type).toBe('scatter');
    expect(allSeries[2].type).toBe('effectScatter');
  });

  /* -------------------------------------------------------------- */
  /*  PR-X13c: flow overlay (Codex thread 019e25d4)                  */
  /* -------------------------------------------------------------- */

  it('flow overlay appends a series with lines type + curveness', () => {
    render(
      <GeoMap
        mapName="TR"
        data={sampleData}
        overlays={[
          {
            type: 'flow',
            data: [
              {
                fromName: 'İstanbul',
                toName: 'Ankara',
                from: [29.0, 41.0],
                to: [32.85, 39.93],
                value: 800,
              },
            ],
          },
        ]}
        animate={false}
      />,
    );
    const flow = series()[1];
    expect(flow.type).toBe('lines');
    expect(flow.coordinateSystem).toBe('geo');
    expect(flow.geoIndex).toBe(0); // shared with base map
    expect(flow.polyline).toBe(false);
    const ls = flow.lineStyle as { curveness: number; opacity: number };
    expect(ls.curveness).toBe(0.2); // default
    expect(ls.opacity).toBe(0.6); // default
  });

  it('flow effect.show defaults to false (animation opt-in)', () => {
    render(
      <GeoMap
        mapName="TR"
        data={sampleData}
        overlays={[
          {
            type: 'flow',
            data: [
              {
                from: [29.0, 41.0],
                to: [32.85, 39.93],
                value: 1,
              },
            ],
          },
        ]}
        animate={false}
      />,
    );
    const flow = series()[1];
    const eff = flow.effect as { show: boolean };
    expect(eff.show).toBe(false);
  });

  it('flow showEffect=true → effect.show: true (trail animation on)', () => {
    render(
      <GeoMap
        mapName="TR"
        data={sampleData}
        overlays={[
          {
            type: 'flow',
            showEffect: true,
            data: [
              {
                from: [29.0, 41.0],
                to: [32.85, 39.93],
                value: 1,
              },
            ],
          },
        ]}
        animate={false}
      />,
    );
    const flow = series()[1];
    const eff = flow.effect as { show: boolean };
    expect(eff.show).toBe(true);
  });

  it('flow respectReducedMotion=true → effect.show: false (trail suppressed)', () => {
    // Codex 019e25d4 iter-2: lines has no rippleEffect.number analogue.
    // `effect.show: false` is the canonical reduced-motion opt-out.
    render(
      <GeoMap
        mapName="TR"
        data={sampleData}
        overlays={[
          {
            type: 'flow',
            showEffect: true,
            respectReducedMotion: true,
            data: [
              {
                from: [29.0, 41.0],
                to: [32.85, 39.93],
                value: 1,
              },
            ],
          },
        ]}
        animate={false}
      />,
    );
    const flow = series()[1];
    const eff = flow.effect as { show: boolean };
    expect(eff.show).toBe(false);
  });

  it('mixed overlays (bubble + effectScatter + flow) emits 4 series total', () => {
    render(
      <GeoMap
        mapName="TR"
        data={sampleData}
        overlays={[
          { type: 'bubble', data: [{ name: 'A', coordinates: [29, 41], value: 100 }] },
          {
            type: 'effectScatter',
            data: [{ name: 'B', coordinates: [32, 39], value: 5 }],
          },
          {
            type: 'flow',
            data: [
              {
                from: [29.0, 41.0],
                to: [32.85, 39.93],
                value: 1,
              },
            ],
          },
        ]}
        animate={false}
      />,
    );
    const allSeries = series();
    expect(allSeries).toHaveLength(4); // base + bubble + effectScatter + flow
    expect(allSeries[1].type).toBe('scatter');
    expect(allSeries[2].type).toBe('effectScatter');
    expect(allSeries[3].type).toBe('lines');
  });

  it('flow visualMap.seriesIndex stays scoped to base (overlay isolation)', () => {
    render(
      <GeoMap
        mapName="TR"
        data={sampleData}
        overlays={[
          {
            type: 'flow',
            data: [
              {
                from: [29.0, 41.0],
                to: [32.85, 39.93],
                value: 1,
              },
            ],
          },
        ]}
        animate={false}
      />,
    );
    const opt = lastDispatchedOption();
    const vm = opt?.visualMap as { seriesIndex: number } | undefined;
    expect(vm?.seriesIndex).toBe(0);
  });

  it('flow click → onDataPointClick fires with kind="overlay", overlayType="flow"', () => {
    // Codex 019e25d4 iter-2: click contract test — wrapper must
    // discriminate flow overlay datum from point overlay + region.
    const handler = vi.fn();
    render(
      <GeoMap
        mapName="TR"
        data={sampleData}
        overlays={[
          {
            type: 'flow',
            name: 'Logistics flow',
            data: [
              {
                fromName: 'İstanbul',
                toName: 'Ankara',
                from: [29.0, 41.0],
                to: [32.85, 39.93],
                value: 800,
                category: 'air',
              },
            ],
          },
        ]}
        onDataPointClick={handler}
        animate={false}
      />,
    );
    const registrations = clickListenerRegistrations();
    expect(registrations.length).toBeGreaterThanOrEqual(1);
    const clickHandler = registrations[registrations.length - 1];
    // Simulate ECharts click event with flow datum payload.
    clickHandler({
      seriesType: 'lines',
      name: 'İstanbul → Ankara',
      data: {
        _overlay: {
          type: 'flow',
          layerName: 'Logistics flow',
          from: [29.0, 41.0],
          to: [32.85, 39.93],
          fromName: 'İstanbul',
          toName: 'Ankara',
          value: 800,
          category: 'air',
        },
      },
    });
    expect(handler).toHaveBeenCalledOnce();
    const payload = handler.mock.calls[0][0] as {
      datum: Record<string, unknown>;
      value?: number;
      label?: string;
    };
    expect(payload.datum.kind).toBe('overlay');
    expect(payload.datum.overlayType).toBe('flow');
    expect(payload.datum.layerName).toBe('Logistics flow');
    expect(payload.datum.fromName).toBe('İstanbul');
    expect(payload.datum.toName).toBe('Ankara');
    expect(payload.datum.from).toEqual([29.0, 41.0]);
    expect(payload.datum.to).toEqual([32.85, 39.93]);
    expect(payload.datum.category).toBe('air');
    expect(payload.value).toBe(800);
    expect(payload.label).toBe('İstanbul → Ankara');
  });

  it('flow a11y SR row format: "<layer>: Flow edge: <from> to <to>"', () => {
    // Codex 019e25d4 post-impl must-fix: focused assertion that the
    // hidden SR data table contains a row for each flow edge with the
    // canonical "Flow edge: <from> to <to>" format. Mirrors the iter-2
    // a11y preference (visual "→" arrow swapped for screen-reader
    // friendly "edge" semantic).
    const { container } = render(
      <GeoMap
        mapName="TR"
        data={sampleData}
        overlays={[
          {
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
            ],
          },
        ]}
        animate={false}
      />,
    );
    // ChartA11yShell renders the hidden data table inline (visually
    // hidden via VISUALLY_HIDDEN_STYLE, present in DOM for SR walk).
    const rows = container.querySelectorAll('table tbody tr');
    const labels = Array.from(rows)
      .map((tr) => tr.querySelector('td')?.textContent ?? '')
      .filter((label) => label.includes('Flow edge'));
    expect(labels).toContain('Logistics flow: Flow edge: İstanbul to Ankara');
    expect(labels).toContain('Logistics flow: Flow edge: İstanbul to İzmir');
    // Sort by value desc verifies the SR walk order: 800 first, 600 next.
    expect(labels[0]).toContain('İstanbul to Ankara');
    expect(labels[1]).toContain('İstanbul to İzmir');
  });

  it('flow a11y SR row falls back to coords when fromName/toName missing', () => {
    const { container } = render(
      <GeoMap
        mapName="TR"
        data={sampleData}
        overlays={[
          {
            type: 'flow',
            // no layer name → defaults to "flow overlay"
            data: [
              {
                from: [29.0, 41.0],
                to: [32.85, 39.93],
                value: 1,
              },
            ],
          },
        ]}
        animate={false}
      />,
    );
    const rows = container.querySelectorAll('table tbody tr');
    const labels = Array.from(rows).map((tr) => tr.querySelector('td')?.textContent ?? '');
    // Coordinate fallback in the SR linearization.
    const flowRow = labels.find((l) => l.includes('Flow edge:'));
    expect(flowRow).toBe('flow overlay: Flow edge: 29.00,41.00 to 32.85,39.93');
  });

  it('flow click with coordinate-fallback label (no fromName/toName)', () => {
    const handler = vi.fn();
    render(
      <GeoMap
        mapName="TR"
        data={sampleData}
        overlays={[
          {
            type: 'flow',
            data: [
              {
                from: [29.0, 41.0],
                to: [32.85, 39.93],
                value: 1,
              },
            ],
          },
        ]}
        onDataPointClick={handler}
        animate={false}
      />,
    );
    const registrations = clickListenerRegistrations();
    const clickHandler = registrations[registrations.length - 1];
    clickHandler({
      seriesType: 'lines',
      name: '29.00,41.00 → 32.85,39.93',
      data: {
        _overlay: {
          type: 'flow',
          layerName: 'flow overlay',
          from: [29.0, 41.0],
          to: [32.85, 39.93],
          value: 1,
        },
      },
    });
    expect(handler).toHaveBeenCalledOnce();
    const payload = handler.mock.calls[0][0] as { label?: string };
    // Coordinate fallback when fromName/toName missing.
    expect(payload.label).toBe('29.00,41.00 → 32.85,39.93');
  });

  /* -------------------------------------------------------------- */
  /*  PR-X13d: heatmap overlay (Codex thread 019e25ee)               */
  /* -------------------------------------------------------------- */

  it('heatmap overlay appends a series with type "heatmap"', () => {
    render(
      <GeoMap
        mapName="TR"
        data={sampleData}
        overlays={[
          {
            type: 'heatmap',
            data: [
              { name: 'İstanbul', coordinates: [29.0, 41.0], value: 80 },
              { name: 'Ankara', coordinates: [32.85, 39.93], value: 40 },
            ],
          },
        ]}
        animate={false}
      />,
    );
    const heatmap = series()[1];
    expect(heatmap.type).toBe('heatmap');
    expect(heatmap.coordinateSystem).toBe('geo');
    expect(heatmap.geoIndex).toBe(0); // shared with base
    expect(heatmap.pointSize).toBe(20); // default
    expect(heatmap.blurSize).toBe(30); // default
    expect(heatmap.minOpacity).toBe(0); // default
    expect(heatmap.maxOpacity).toBe(0.8); // default — base shines through
  });

  it('option.visualMap is an ARRAY when heatmap overlay is present', () => {
    // Codex 019e25ee plan-time + iter-2: heatmap requires its own
    // visualMap entry (ECharts dev-throws "Heatmap must use with
    // visualMap" otherwise). Wrapper switches single object →
    // [base, ...heatmapVMs] only when needed.
    render(
      <GeoMap
        mapName="TR"
        data={sampleData}
        overlays={[
          {
            type: 'heatmap',
            data: [{ name: 'X', coordinates: [29, 41], value: 50 }],
          },
        ]}
        animate={false}
      />,
    );
    const opt = lastDispatchedOption();
    expect(Array.isArray(opt?.visualMap)).toBe(true);
    const vms = opt?.visualMap as Array<Record<string, unknown>>;
    expect(vms.length).toBe(2);
    // visualMap[0] = base map (still pinned to seriesIndex: 0)
    expect(vms[0].seriesIndex).toBe(0);
    // visualMap[1] = heatmap (pinned to overlay series, dimension: 2)
    expect(vms[1].seriesIndex).toBe(1);
    expect(vms[1].dimension).toBe(2);
    expect(vms[1].show).toBe(false); // legend opt-in
  });

  it('option.visualMap stays a SINGLE OBJECT when no heatmap (back-compat)', () => {
    // Regression guard: bubble/effectScatter/flow without heatmap
    // must NOT change the option.visualMap shape — existing consumers
    // would break if it became an array unconditionally.
    render(
      <GeoMap
        mapName="TR"
        data={sampleData}
        overlays={[
          { type: 'bubble', data: [{ name: 'A', coordinates: [29, 41], value: 1 }] },
          {
            type: 'effectScatter',
            data: [{ name: 'B', coordinates: [32, 39], value: 1 }],
          },
        ]}
        animate={false}
      />,
    );
    const opt = lastDispatchedOption();
    expect(Array.isArray(opt?.visualMap)).toBe(false);
    const vm = opt?.visualMap as { seriesIndex: number };
    expect(vm.seriesIndex).toBe(0); // base map only
  });

  it('mixed overlays (bubble + heatmap) → 3 series + 2 visualMaps with correct seriesIndex math', () => {
    render(
      <GeoMap
        mapName="TR"
        data={sampleData}
        overlays={[
          { type: 'bubble', data: [{ name: 'A', coordinates: [29, 41], value: 1 }] },
          {
            type: 'heatmap',
            data: [{ name: 'B', coordinates: [32, 39], value: 50 }],
          },
        ]}
        animate={false}
      />,
    );
    const allSeries = series();
    expect(allSeries).toHaveLength(3); // base + bubble + heatmap
    expect(allSeries[2].type).toBe('heatmap');
    const opt = lastDispatchedOption();
    const vms = opt?.visualMap as Array<Record<string, unknown>>;
    expect(vms.length).toBe(2);
    expect(vms[0].seriesIndex).toBe(0); // base
    expect(vms[1].seriesIndex).toBe(2); // heatmap is series[2] (after bubble)
  });

  it('heatmap rerender: toggle on → off does NOT leave stale series or visualMap (notMerge: true)', () => {
    // Codex 019e25ee iter-2 must-fix #4 + post-impl test note: ECharts
    // default merge would keep the heatmap visualMap orphaned when its
    // series disappears. GeoMap opts into notMerge: true so each render
    // fully replaces option.series + option.visualMap. The test
    // explicitly asserts the wrapper passed `notMerge: true` to
    // setOption — without this guard the test would silently pass even
    // if `notMerge` were removed (mock does not simulate ECharts merge).
    const { rerender } = render(
      <GeoMap
        mapName="TR"
        data={sampleData}
        overlays={[
          {
            type: 'heatmap',
            data: [{ name: 'X', coordinates: [29, 41], value: 50 }],
          },
        ]}
        animate={false}
      />,
    );
    expect(seriesTypes(lastDispatchedOption())).toContain('heatmap');
    expect(Array.isArray(lastDispatchedOption()?.visualMap)).toBe(true);
    // Direct args check — wrapper MUST pass `notMerge: true` to
    // setOption(option, opts) so ECharts replaces option fully.
    expect(lastSetOptionOpts()?.notMerge).toBe(true);

    // Toggle heatmap off (overlays prop empty).
    rerender(<GeoMap mapName="TR" data={sampleData} overlays={[]} animate={false} />);
    // Stale heatmap component must NOT survive the rerender.
    const types = seriesTypes(lastDispatchedOption());
    expect(types).not.toContain('heatmap');
    // visualMap shape regresses to single-object (back-compat preserved).
    expect(Array.isArray(lastDispatchedOption()?.visualMap)).toBe(false);
    // notMerge: true STILL passed on the rerender (regression guard
    // for the wrapper accidentally dropping the opt mid-lifecycle).
    expect(lastSetOptionOpts()?.notMerge).toBe(true);
  });

  it('heatmap a11y SR row: summary format "<layer>: N points, intensity MIN-MAX"', () => {
    // Codex 019e25ee iter-1 must-fix #8 + iter-2 #5: density is
    // aggregate; per-point linearization would dump thousands of
    // coordinates and mislead SR users. Single summary row instead.
    const { container } = render(
      <GeoMap
        mapName="TR"
        data={sampleData}
        overlays={[
          {
            type: 'heatmap',
            name: 'Events density',
            data: [
              { coordinates: [29.0, 41.0], value: 87 },
              { coordinates: [32.85, 39.93], value: 42 },
              { coordinates: [27.14, 38.42], value: 23 },
            ],
          },
        ]}
        animate={false}
      />,
    );
    const rows = container.querySelectorAll('table tbody tr');
    const labels = Array.from(rows).map((tr) => tr.querySelector('td')?.textContent ?? '');
    const summary = labels.find((l) => l.includes('points, intensity'));
    expect(summary).toBe('Events density: 3 points, intensity 23-87');
  });

  it('heatmap a11y SR row uses raw point count even when intensities sanitize', () => {
    // Codex iter-2 #5: pointCount = data.length (transparent),
    // intensity range = sanitized values (consistent with visualMap).
    const { container } = render(
      <GeoMap
        mapName="TR"
        data={sampleData}
        overlays={[
          {
            type: 'heatmap',
            name: 'Mixed density',
            data: [
              { coordinates: [29.0, 41.0], value: -10 }, // invalid → 0
              { coordinates: [32.85, 39.93], value: NaN }, // invalid → 0
              { coordinates: [27.14, 38.42], value: 50 }, // valid → 50
            ],
          },
        ]}
        animate={false}
      />,
    );
    const rows = container.querySelectorAll('table tbody tr');
    const labels = Array.from(rows).map((tr) => tr.querySelector('td')?.textContent ?? '');
    const summary = labels.find((l) => l.includes('points, intensity'));
    // 3 raw points, sanitized range 0..50
    expect(summary).toBe('Mixed density: 3 points, intensity 0-50');
  });

  // No 'heatmap click' test by design — Codex 019e25ee post-impl P1
  // verified vs echarts@5.6.0 source: geo heatmap renders one raster
  // `ZRImage` with `silent: true` and emits NO per-datum click event.
  // The wrapper intentionally drops the heatmap click branch in
  // GeoMap.tsx so a synthetic test here would prove only that the
  // mock can be misused — not that real users click density blobs.
  // A11y SR summary row tests above are the canonical accessibility
  // contract for heatmap density data.

  /* -------------------------------------------------------------- */
  /*  PR-X13e: marker overlay (Codex thread 019e2614)                */
  /* -------------------------------------------------------------- */

  it('marker overlay appends a scatter series with constant symbolSize', () => {
    render(
      <GeoMap
        mapName="TR"
        data={sampleData}
        overlays={[
          {
            type: 'marker',
            name: 'Branches',
            data: [
              { name: 'İstanbul', coordinates: [29.0, 41.0], value: 100 },
              { name: 'Ankara', coordinates: [32.85, 39.93], value: 50 },
            ],
          },
        ]}
        animate={false}
      />,
    );
    const marker = series()[1];
    expect(marker.type).toBe('scatter');
    expect(marker.coordinateSystem).toBe('geo');
    expect(marker.geoIndex).toBe(0);
    // Marker is constant-size by design — symbolSize is a number,
    // NOT a sqrt-scale function (that's bubble's job).
    expect(typeof marker.symbolSize).toBe('number');
    expect(marker.symbolSize).toBe(18); // default
    expect(marker.symbol).toBe('pin'); // default
  });

  it('marker invalid layer-level symbol falls back to "pin" at runtime', () => {
    // Codex 019e2614 must-fix #2: bad consumer input doesn't crash.
    render(
      <GeoMap
        mapName="TR"
        data={sampleData}
        overlays={[
          {
            type: 'marker',
            symbol: 'image://evil.com/track.png' as never, // rejected
            data: [{ name: 'X', coordinates: [29, 41] }],
          },
        ]}
        animate={false}
      />,
    );
    const marker = series()[1];
    expect(marker.symbol).toBe('pin');
  });

  it('marker accepts inline path:// SVG verbatim', () => {
    const path = 'path://M0,0 L20,0 L10,20 Z';
    render(
      <GeoMap
        mapName="TR"
        data={sampleData}
        overlays={[
          {
            type: 'marker',
            symbol: path,
            data: [{ name: 'X', coordinates: [29, 41] }],
          },
        ]}
        animate={false}
      />,
    );
    expect(series()[1].symbol).toBe(path);
  });

  it('marker + heatmap mixed overlays preserve correct visualMap seriesIndex math', () => {
    // Codex 019e2614 must-fix #7: marker + heatmap → visualMap[1]
    // pinned to series[2] (base + marker + heatmap).
    render(
      <GeoMap
        mapName="TR"
        data={sampleData}
        overlays={[
          {
            type: 'marker',
            data: [{ name: 'M', coordinates: [29, 41] }],
          }, // series[1]
          {
            type: 'heatmap',
            data: [{ coordinates: [32, 39], value: 50 }],
          }, // series[2]
        ]}
        animate={false}
      />,
    );
    const allSeries = series();
    expect(allSeries).toHaveLength(3);
    expect(allSeries[1].type).toBe('scatter'); // marker
    expect(allSeries[2].type).toBe('heatmap');
    const opt = lastDispatchedOption();
    const vms = opt?.visualMap as Array<Record<string, unknown>>;
    expect(Array.isArray(vms)).toBe(true);
    expect(vms.length).toBe(2);
    expect(vms[0].seriesIndex).toBe(0); // base
    expect(vms[1].seriesIndex).toBe(2); // heatmap (after marker)
  });

  it('all 5 layer types in one render → 6 series total (base + 5 overlays)', () => {
    render(
      <GeoMap
        mapName="TR"
        data={sampleData}
        overlays={[
          { type: 'bubble', data: [{ name: 'A', coordinates: [29, 41], value: 1 }] },
          {
            type: 'effectScatter',
            data: [{ name: 'B', coordinates: [32, 39], value: 1 }],
          },
          {
            type: 'flow',
            data: [{ from: [29, 41], to: [32, 39], value: 1 }],
          },
          {
            type: 'heatmap',
            data: [{ coordinates: [27, 38], value: 50 }],
          },
          {
            type: 'marker',
            data: [{ name: 'M', coordinates: [29, 41] }],
          },
        ]}
        animate={false}
      />,
    );
    const allSeries = series();
    expect(allSeries).toHaveLength(6); // base + 5 overlays
    expect(allSeries[0].type).toBe('map');
    expect(allSeries[1].type).toBe('scatter'); // bubble
    expect(allSeries[2].type).toBe('effectScatter');
    expect(allSeries[3].type).toBe('lines'); // flow
    expect(allSeries[4].type).toBe('heatmap');
    expect(allSeries[5].type).toBe('scatter'); // marker
  });

  it('marker click → onDataPointClick fires with overlayType=marker', () => {
    // Codex 019e2614 must-fix #4: marker is point-clickable; uses the
    // standard wrapper point branch (same path as bubble/effectScatter)
    // — `_overlay.type === 'marker'` flows through `overlayType` field.
    const handler = vi.fn();
    render(
      <GeoMap
        mapName="TR"
        data={sampleData}
        overlays={[
          {
            type: 'marker',
            name: 'Branches',
            data: [{ name: 'İstanbul HQ', coordinates: [29.0, 41.0], value: 100 }],
          },
        ]}
        onDataPointClick={handler}
        animate={false}
      />,
    );
    const registrations = clickListenerRegistrations();
    const clickHandler = registrations[registrations.length - 1];
    clickHandler({
      seriesType: 'scatter',
      name: 'İstanbul HQ',
      data: {
        _overlay: {
          type: 'marker',
          layerName: 'Branches',
          coordinates: [29.0, 41.0],
          value: 100,
          category: 'hq',
        },
      },
    });
    expect(handler).toHaveBeenCalledOnce();
    const payload = handler.mock.calls[0][0] as {
      datum: Record<string, unknown>;
      value?: number;
      label?: string;
    };
    expect(payload.datum.kind).toBe('overlay');
    expect(payload.datum.overlayType).toBe('marker');
    expect(payload.datum.layerName).toBe('Branches');
    expect(payload.datum.coordinates).toEqual([29.0, 41.0]);
    expect(payload.datum.category).toBe('hq');
    expect(payload.value).toBe(100);
    expect(payload.label).toBe('İstanbul HQ');
  });

  it('marker a11y SR rows: per-marker rows sorted by value desc (point branch)', () => {
    // Marker uses the standard point branch — same SR walk pattern as
    // bubble + effectScatter. value desc sort with stable input order
    // for ties.
    const { container } = render(
      <GeoMap
        mapName="TR"
        data={sampleData}
        overlays={[
          {
            type: 'marker',
            name: 'Branches',
            data: [
              { name: 'Ankara', coordinates: [32.85, 39.93], value: 50 },
              { name: 'İstanbul', coordinates: [29.0, 41.0], value: 100 },
              { name: 'İzmir', coordinates: [27.14, 38.42], value: 25 },
            ],
          },
        ]}
        animate={false}
      />,
    );
    const rows = container.querySelectorAll('table tbody tr');
    const labels = Array.from(rows)
      .map((tr) => tr.querySelector('td')?.textContent ?? '')
      .filter((label) => label.includes('Branches:'));
    expect(labels).toHaveLength(3);
    // Sorted by value desc: 100, 50, 25
    expect(labels[0]).toBe('Branches: İstanbul');
    expect(labels[1]).toBe('Branches: Ankara');
    expect(labels[2]).toBe('Branches: İzmir');
  });

  it('overlays trigger explicit option.geo block (shared coord system)', () => {
    render(
      <GeoMap
        mapName="TR"
        data={sampleData}
        overlays={[
          {
            type: 'bubble',
            data: [{ name: 'X', coordinates: [29, 41], value: 1 }],
          },
        ]}
        animate={false}
      />,
    );
    const opt = lastDispatchedOption();
    const geoBlock = opt?.geo as Record<string, unknown> | undefined;
    expect(geoBlock).toBeDefined();
    expect(geoBlock?.map).toBe('TR');
  });

  // Codex 019e25a2 PR-X13a iter-3 absorb: visualMap MUST be scoped
  // to the base map series only. Without `seriesIndex: 0`, ECharts'
  // default "all series" target drags bubble overlays into the
  // choropleth color encoding.
  it('option.visualMap.seriesIndex pins to base map only (overlay isolation)', () => {
    render(
      <GeoMap
        mapName="TR"
        data={sampleData}
        overlays={[
          {
            type: 'bubble',
            data: [{ name: 'X', coordinates: [29, 41], value: 1 }],
          },
        ]}
        animate={false}
      />,
    );
    const opt = lastDispatchedOption();
    const vm = opt?.visualMap as Record<string, unknown>;
    expect(vm.seriesIndex).toBe(0);
  });

  // Codex 019e25a2 PR-X13a iter-2 must-fix #1: when base map binds
  // to host geo, region click/tooltip lives on `option.geo`, not on
  // the series. `silent` MUST be falsy (default) so events surface.
  it('option.geo has region interaction surfaces (silent !== true, label, selectedMode)', () => {
    render(
      <GeoMap
        mapName="TR"
        data={sampleData}
        showLabels
        selectedMode="single"
        overlays={[
          {
            type: 'bubble',
            data: [{ name: 'X', coordinates: [29, 41], value: 1 }],
          },
        ]}
        animate={false}
      />,
    );
    const opt = lastDispatchedOption();
    const geoBlock = opt?.geo as Record<string, unknown> | undefined;
    expect(geoBlock).toBeDefined();
    expect(geoBlock?.silent).not.toBe(true);
    expect(geoBlock?.selectedMode).toBe('single');
    expect((geoBlock?.label as { show: boolean }).show).toBe(true);
    expect(geoBlock?.emphasis).toBeDefined();
    expect(geoBlock?.select).toBeDefined();
  });

  // Codex 019e25a2 PR-X13a iter-1 must-fix #1: base map series and
  // overlay scatter must SHARE the explicit geo coord system so
  // pan/zoom state stays in sync.
  it('base map series binds to geoIndex=0 (shares coord with overlays)', () => {
    render(
      <GeoMap
        mapName="TR"
        data={sampleData}
        overlays={[
          {
            type: 'bubble',
            data: [{ name: 'X', coordinates: [29, 41], value: 1 }],
          },
        ]}
        animate={false}
      />,
    );
    const allSeries = series();
    const baseMap = allSeries[0];
    expect(baseMap.type).toBe('map');
    expect(baseMap.geoIndex).toBe(0);
    const overlay = allSeries[1];
    expect(overlay.geoIndex).toBe(0);
    // Both bind to the same geoIndex → ECharts shares coord state.
  });

  it('skips render when map not registered (no setOption call after registry clear)', () => {
    __resetGeoMapRegistrationCacheForTests();
    // Now no map is registered; GeoMap should not emit a series.
    render(<GeoMap mapName="Unregistered" data={sampleData} animate={false} />);
    // Either no setOption call OR call dispatched with empty option.
    // The wrapper falls back to `{}` when option computes to null,
    // so no `series` array should be present.
    const opt = lastDispatchedOption();
    expect(opt?.series).toBeUndefined();
  });
});

/* ================================================================== */
/*  Cross-cutting: setOption was called at least once for every chart */
/* ================================================================== */

describe('All 13 chart wrappers dispatch at least one setOption call', () => {
  const matrix: Array<{ name: string; el: () => React.ReactElement }> = [
    {
      name: 'BarChart',
      el: () => <BarChart data={[{ label: 'A', value: 1 }]} animate={false} />,
    },
    {
      name: 'LineChart',
      el: () => <LineChart series={[{ name: 's1', data: [1] }]} labels={['a']} animate={false} />,
    },
    {
      name: 'AreaChart',
      el: () => <AreaChart series={[{ name: 's1', data: [1] }]} labels={['a']} animate={false} />,
    },
    {
      name: 'PieChart',
      el: () => <PieChart data={[{ label: 'A', value: 1 }]} animate={false} />,
    },
    {
      name: 'ScatterChart',
      el: () => <ScatterChart data={[{ x: 1, y: 1 }]} />,
    },
    {
      name: 'GaugeChart',
      el: () => <GaugeChart value={50} min={0} max={100} />,
    },
    {
      name: 'RadarChart',
      el: () => (
        <RadarChart
          indicators={[
            { name: 'A', max: 10 },
            { name: 'B', max: 10 },
          ]}
          series={[{ name: 's1', data: [1, 2] }]}
        />
      ),
    },
    {
      name: 'TreemapChart',
      el: () => <TreemapChart data={[{ name: 'A', value: 1 }]} />,
    },
    {
      name: 'HeatmapChart',
      el: () => <HeatmapChart data={[[0, 0, 1]]} xLabels={['x1']} yLabels={['y1']} />,
    },
    {
      name: 'WaterfallChart',
      el: () => <WaterfallChart data={[{ label: 'A', value: 1 }]} />,
    },
    {
      name: 'FunnelChart',
      el: () => <FunnelChart data={[{ name: 'A', value: 1 }]} />,
    },
    {
      name: 'SankeyChart',
      el: () => (
        <SankeyChart
          nodes={[{ name: 'A' }, { name: 'B' }]}
          links={[{ source: 'A', target: 'B', value: 1 }]}
        />
      ),
    },
    {
      name: 'SunburstChart',
      el: () => <SunburstChart data={[{ name: 'A', value: 1 }]} />,
    },
  ];

  it.each(matrix)('$name dispatches setOption at least once', ({ el }) => {
    render(el());
    expect(allDispatchedOptions().length).toBeGreaterThanOrEqual(1);
  });
});
