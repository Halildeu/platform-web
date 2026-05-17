// @vitest-environment jsdom
/**
 * GanttChart — PR-X16e custom-series option-shape, renderItem + a11y tests.
 *
 * Codex thread 019e365b plan-time AGREE — ECharts Depth campaign, fifth
 * and FINAL wrapper. Covers:
 *   (a) normalizeGanttData — trim, invalid-row drop, `endMs <= startMs`
 *       drop, category-defaults-to-name, order preservation
 *   (b) ganttCategories — distinct lanes, first-appearance order,
 *       duplicate-name swimlane
 *   (c) linearizeGanttForA11y — one {label,value} row per task
 *   (d) renderGanttBar — the pure `custom` renderItem: coord transform,
 *       min width, reversed pixel order, vertical centering, row-height
 *       ratio, style forwarding
 *   (e) option-shape — a `custom` series with `clip:true` + `encode` on
 *       a `time` x-axis / inverted `category` y-axis; per-task data items
 *   (f) empty / all-invalid data stability (no option dispatched)
 *   (g) point-level click (gantt-task)
 *   (h) a11y SR data table + the "Duration (days)" value header
 *
 * The lazy `custom` feature is pre-registered via
 * `markEChartsFeatureRegisteredForTest` so `useRequiredEChartsFeature`
 * is synchronously `ready` and the option-shape assertions stay
 * synchronous (ThemeRiverChart.test.tsx pattern).
 */
import {
  lastDispatchedOption,
  resetEChartsMock,
  clickListenerRegistrations,
} from './fixtures/echarts-mock'; // side-effect import: vi.mock hoisted
import { installJsdomPolyfills, restoreJsdomPolyfills } from './fixtures/jsdom-polyfills';

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';

import {
  GanttChart,
  normalizeGanttData,
  ganttCategories,
  linearizeGanttForA11y,
  renderGanttBar,
  type GanttTask,
} from '../GanttChart';
import {
  markEChartsFeatureRegisteredForTest,
  resetEChartsFeatureRegistration,
} from '../renderers/registerEChartsFeature';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

/** Three tasks, two lanes — Phase 1 (Design + Build), Phase 2 (Launch). */
const ganttData = (): GanttTask[] => [
  { id: 't1', name: 'Design', category: 'Phase 1', start: '2026-01-05', end: '2026-01-12' },
  { id: 't2', name: 'Build', category: 'Phase 1', start: '2026-01-12', end: '2026-01-26' },
  { id: 't3', name: 'Launch', category: 'Phase 2', start: '2026-01-26', end: '2026-02-02' },
];

/** series[0] of the last dispatched option, typed loose for assertions. */
const ganttSeries = (): Record<string, unknown> => {
  const series = lastDispatchedOption()?.series as Array<Record<string, unknown>> | undefined;
  return series?.[0] ?? {};
};

/** The `xAxis` block of the last dispatched option. */
const ganttXAxis = (): Record<string, unknown> =>
  (lastDispatchedOption()?.xAxis as Record<string, unknown> | undefined) ?? {};

/** The `yAxis` block of the last dispatched option. */
const ganttYAxis = (): Record<string, unknown> =>
  (lastDispatchedOption()?.yAxis as Record<string, unknown> | undefined) ?? {};

/**
 * A fake ECharts custom-series `api` for the `renderGanttBar` unit
 * tests. `coord` maps an x-value 1:1 to a pixel and a category index to
 * `index * 100`; `reversed` mode mirrors the x-pixel so the
 * `Math.min` / `Math.abs` robustness path is exercised. `size` returns
 * a fixed row height.
 */
function fakeApi(
  dims: [number, number, number],
  rowHeight: number,
  fill: string,
  coordKind: 'linear' | 'reversed' = 'linear',
) {
  return {
    value: (d: number): number => dims[d],
    coord: ([v, c]: [number, number]): [number, number] =>
      coordKind === 'reversed' ? [500 - v, c * 100] : [v, c * 100],
    size: (_span: [number, number]): [number, number] => [0, rowHeight],
    style: (): Record<string, unknown> => ({ fill }),
  };
}

beforeEach(() => {
  resetEChartsMock();
  installJsdomPolyfills();
  // PR-X16e: GanttChart lazy-registers the `custom` series. The
  // echarts-mock stubs the renderer, so pre-mark `custom` registered —
  // keeps the hook synchronously `ready` and the assertions synchronous.
  markEChartsFeatureRegisteredForTest('custom');
});
afterEach(() => {
  restoreJsdomPolyfills();
  resetEChartsFeatureRegistration();
});

/* ------------------------------------------------------------------ */
/*  normalizeGanttData                                                 */
/* ------------------------------------------------------------------ */

describe('normalizeGanttData', () => {
  it('parses start/end to epoch ms and resolves the lane', () => {
    const out = normalizeGanttData(ganttData());
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({
      id: 't1',
      name: 'Design',
      category: 'Phase 1',
      startMs: Date.parse('2026-01-05'),
      endMs: Date.parse('2026-01-12'),
    });
  });

  it('defaults category to the task name when omitted', () => {
    const out = normalizeGanttData([{ name: 'Solo', start: '2026-01-01', end: '2026-01-03' }]);
    expect(out[0].category).toBe('Solo');
  });

  it('defaults category to name when category is blank', () => {
    const out = normalizeGanttData([
      { name: 'Solo', category: '   ', start: '2026-01-01', end: '2026-01-03' },
    ]);
    expect(out[0].category).toBe('Solo');
  });

  it('trims name and category', () => {
    const out = normalizeGanttData([
      { name: '  Design  ', category: '  Phase 1  ', start: '2026-01-01', end: '2026-01-03' },
    ]);
    expect(out[0].name).toBe('Design');
    expect(out[0].category).toBe('Phase 1');
  });

  it('drops a whitespace-only or missing name', () => {
    const out = normalizeGanttData([
      { name: '   ', start: '2026-01-01', end: '2026-01-03' },
      { start: '2026-01-01', end: '2026-01-03' } as unknown as GanttTask,
      { name: 'Keep', start: '2026-01-01', end: '2026-01-03' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Keep');
  });

  it('drops rows with an unparseable start or end', () => {
    const out = normalizeGanttData([
      { name: 'BadStart', start: 'not-a-date', end: '2026-01-03' },
      { name: 'BadEnd', start: '2026-01-01', end: 'nope' },
      { name: 'Keep', start: '2026-01-01', end: '2026-01-03' },
    ]);
    expect(out.map((t) => t.name)).toEqual(['Keep']);
  });

  it('drops rows whose span is not strictly positive (endMs <= startMs)', () => {
    const out = normalizeGanttData([
      { name: 'ZeroSpan', start: '2026-01-05', end: '2026-01-05' },
      { name: 'Reversed', start: '2026-01-10', end: '2026-01-05' },
      { name: 'Keep', start: '2026-01-01', end: '2026-01-03' },
    ]);
    expect(out.map((t) => t.name)).toEqual(['Keep']);
  });

  it('preserves filtered input order', () => {
    const out = normalizeGanttData(ganttData());
    expect(out.map((t) => t.name)).toEqual(['Design', 'Build', 'Launch']);
  });

  it('omits id when the input task carries none', () => {
    const out = normalizeGanttData([{ name: 'NoId', start: '2026-01-01', end: '2026-01-03' }]);
    expect(out[0].id).toBeUndefined();
  });

  it('handles empty input', () => {
    expect(normalizeGanttData([])).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  ganttCategories                                                    */
/* ------------------------------------------------------------------ */

describe('ganttCategories', () => {
  it('returns the distinct lanes in first-appearance order', () => {
    expect(ganttCategories(normalizeGanttData(ganttData()))).toEqual(['Phase 1', 'Phase 2']);
  });

  it('puts two no-category tasks that share a name on ONE lane (swimlane)', () => {
    const out = normalizeGanttData([
      { name: 'Review', start: '2026-01-01', end: '2026-01-03' },
      { name: 'Review', start: '2026-01-05', end: '2026-01-07' },
    ]);
    expect(ganttCategories(out)).toEqual(['Review']);
  });
});

/* ------------------------------------------------------------------ */
/*  linearizeGanttForA11y                                              */
/* ------------------------------------------------------------------ */

describe('linearizeGanttForA11y', () => {
  it('maps each task to a {label,value} row with the duration in days', () => {
    const rows = linearizeGanttForA11y(normalizeGanttData(ganttData()));
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ label: 'Phase 1 · Design', value: 7 });
    expect(rows[1].value).toBe(14);
    expect(rows[2]).toEqual({ label: 'Phase 2 · Launch', value: 7 });
  });

  it('uses the bare name as the label when the lane equals the name', () => {
    const rows = linearizeGanttForA11y(
      normalizeGanttData([{ name: 'Solo', start: '2026-01-01', end: '2026-01-08' }]),
    );
    expect(rows[0]).toEqual({ label: 'Solo', value: 7 });
  });
});

/* ------------------------------------------------------------------ */
/*  renderGanttBar — the pure custom renderItem                        */
/* ------------------------------------------------------------------ */

describe('renderGanttBar', () => {
  it('paints a rect spanning [start,end] centred on the category row', () => {
    const el = renderGanttBar({}, fakeApi([0, 100, 300], 50, '#abc'));
    expect(el.type).toBe('rect');
    expect(el.shape.x).toBe(100);
    expect(el.shape.width).toBe(200);
    // barHeight = rowHeight(50) * 0.6 = 30; y = rowY(0) - 30/2 = -15
    expect(el.shape.height).toBe(30);
    expect(el.shape.y).toBe(-15);
    expect(el.shape.r).toBe(2);
    expect(el.style).toEqual({ fill: '#abc' });
  });

  it('centres the bar vertically on a non-zero category row', () => {
    const el = renderGanttBar({}, fakeApi([1, 100, 300], 50, '#abc'));
    // rowY = categoryIndex(1) * 100 = 100; y = 100 - 15 = 85
    expect(el.shape.y).toBe(85);
  });

  it('enforces a minimum bar width for a very short task', () => {
    const el = renderGanttBar({}, fakeApi([0, 100, 101], 50, '#abc'));
    expect(el.shape.width).toBe(3);
  });

  it('stays well-formed when the pixel x-order comes back reversed', () => {
    const el = renderGanttBar({}, fakeApi([0, 100, 300], 50, '#abc', 'reversed'));
    // reversed coord: start → [400,0], end → [200,0]; x = min = 200, width = 200
    expect(el.shape.x).toBe(200);
    expect(el.shape.width).toBe(200);
  });

  it('scales the bar height by the row-height ratio', () => {
    const el = renderGanttBar({}, fakeApi([0, 100, 300], 80, '#abc'));
    expect(el.shape.height).toBe(48); // 80 * 0.6
  });
});

/* ------------------------------------------------------------------ */
/*  Option-shape                                                       */
/* ------------------------------------------------------------------ */

describe('GanttChart — option shape', () => {
  it('emits a single custom series with clip:true', () => {
    render(<GanttChart data={ganttData()} animate={false} />);
    const series = lastDispatchedOption()?.series as unknown[];
    expect(series).toHaveLength(1);
    expect(ganttSeries().type).toBe('custom');
    expect(ganttSeries().clip).toBe(true);
  });

  it('binds the data dimensions to the axes via encode', () => {
    render(<GanttChart data={ganttData()} animate={false} />);
    expect(ganttSeries().encode).toEqual({ x: [1, 2], y: 0 });
  });

  it('provides a renderItem callback', () => {
    render(<GanttChart data={ganttData()} animate={false} />);
    expect(typeof ganttSeries().renderItem).toBe('function');
  });

  it('series.data is one [categoryIndex,startMs,endMs] item per task', () => {
    render(<GanttChart data={ganttData()} animate={false} />);
    const data = ganttSeries().data as Array<{ value: number[] }>;
    expect(data).toHaveLength(3);
    expect(data[0].value).toEqual([0, Date.parse('2026-01-05'), Date.parse('2026-01-12')]);
    // Launch sits on the second lane (Phase 2 → index 1).
    expect(data[2].value[0]).toBe(1);
  });

  it('x-axis is a time axis fitted to the task span', () => {
    render(<GanttChart data={ganttData()} animate={false} />);
    expect(ganttXAxis().type).toBe('time');
    expect(ganttXAxis().min).toBe(Date.parse('2026-01-05'));
    expect(ganttXAxis().max).toBe(Date.parse('2026-02-02'));
  });

  it('y-axis is an inverted category axis of the distinct lanes', () => {
    render(<GanttChart data={ganttData()} animate={false} />);
    expect(ganttYAxis().type).toBe('category');
    expect(ganttYAxis().inverse).toBe(true);
    expect(ganttYAxis().data).toEqual(['Phase 1', 'Phase 2']);
  });

  it('empty data renders an empty-state without dispatching an option', () => {
    expect(() => render(<GanttChart data={[]} animate={false} />)).not.toThrow();
    expect(lastDispatchedOption()).toBeNull();
  });

  it('all-invalid data renders the empty-state (no blank canvas)', () => {
    render(<GanttChart data={[{ name: 'X', start: 'bad', end: 'also-bad' }]} animate={false} />);
    expect(lastDispatchedOption()).toBeNull();
  });

  it('rerender with new data produces a fresh option (stale-dep guard)', () => {
    const { rerender } = render(<GanttChart data={ganttData()} animate={false} />);
    expect((ganttSeries().data as unknown[]).length).toBe(3);
    rerender(
      <GanttChart
        data={[{ name: 'Solo', start: '2026-03-01', end: '2026-03-05' }]}
        animate={false}
      />,
    );
    expect((ganttSeries().data as unknown[]).length).toBe(1);
    expect(ganttYAxis().data).toEqual(['Solo']);
  });
});

/* ------------------------------------------------------------------ */
/*  tooltip formatter                                                  */
/* ------------------------------------------------------------------ */

describe('GanttChart — tooltip formatter', () => {
  const tooltipFormatter = (): ((p: { dataIndex?: number }) => string) => {
    const tooltip = lastDispatchedOption()?.tooltip as
      | { formatter?: (p: { dataIndex?: number }) => string }
      | undefined;
    return tooltip?.formatter ?? (() => '');
  };

  it('resolves dataIndex to the task name, lane, date range and duration', () => {
    render(<GanttChart data={ganttData()} animate={false} />);
    const html = tooltipFormatter()({ dataIndex: 0 });
    expect(html).toContain('<strong>Design</strong>');
    expect(html).toContain('Phase 1');
    expect(html).toContain('2026-01-05');
    expect(html).toContain('2026-01-12');
    expect(html).toContain('7'); // Design spans 7 days
  });

  it('omits the lane line when the lane equals the task name', () => {
    render(
      <GanttChart
        data={[{ name: 'Solo', start: '2026-01-01', end: '2026-01-08' }]}
        animate={false}
      />,
    );
    const html = tooltipFormatter()({ dataIndex: 0 });
    expect(html).toContain('<strong>Solo</strong>');
    // `Solo` appears exactly once — no separate lane line.
    expect(html.match(/Solo/g)).toHaveLength(1);
  });

  it('returns an empty string for an out-of-range dataIndex', () => {
    render(<GanttChart data={ganttData()} animate={false} />);
    expect(tooltipFormatter()({ dataIndex: 99 })).toBe('');
  });
});

/* ------------------------------------------------------------------ */
/*  onDataPointClick — point-level                                     */
/* ------------------------------------------------------------------ */

describe('GanttChart — onDataPointClick', () => {
  it('resolves a bar click to the task (gantt-task, point-level)', () => {
    const onClick = vi.fn();
    render(<GanttChart data={ganttData()} onDataPointClick={onClick} animate={false} />);

    const handlers = clickListenerRegistrations();
    expect(handlers.length).toBeGreaterThan(0);
    handlers[handlers.length - 1]({ dataIndex: 1 });

    expect(onClick).toHaveBeenCalledTimes(1);
    const event = onClick.mock.calls[0][0];
    expect(event.label).toBe('Build');
    expect(event.value).toBe(14); // 2026-01-12 → 2026-01-26 = 14 days
    expect(event.datum).toMatchObject({
      kind: 'gantt-task',
      id: 't2',
      name: 'Build',
      category: 'Phase 1',
      dataIndex: 1,
    });
  });

  it('ignores a click whose dataIndex is out of range or absent', () => {
    const onClick = vi.fn();
    render(<GanttChart data={ganttData()} onDataPointClick={onClick} animate={false} />);
    const handlers = clickListenerRegistrations();
    const fire = handlers[handlers.length - 1];
    fire({ dataIndex: 99 });
    fire({ dataIndex: -1 });
    fire({});
    expect(onClick).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/*  A11y                                                               */
/* ------------------------------------------------------------------ */

describe('GanttChart — a11y SR data table', () => {
  it('renders a hidden SR table with one row per task', () => {
    const { container } = render(
      <GanttChart data={ganttData()} title="Sprint Plan" animate={false} />,
    );
    const rows = container.querySelectorAll('table tbody tr');
    expect(rows.length).toBe(3);
  });

  it('labels the value column "Duration (days)"', () => {
    const { container } = render(
      <GanttChart data={ganttData()} title="Sprint Plan" animate={false} />,
    );
    const headerText = container.querySelector('table thead')?.textContent ?? '';
    expect(headerText).toContain('Duration (days)');
  });
});
