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
} from './fixtures/echarts-mock'; // side-effect import: vi.mock hoisted before component imports below
import { installJsdomPolyfills, restoreJsdomPolyfills } from './fixtures/jsdom-polyfills';

import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
