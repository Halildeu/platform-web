// @vitest-environment jsdom
/**
 * PopulationPyramid — Codex thread 019e3f75 AGREE — option-shape, click
 * payload + a11y tests. Covers:
 *   (a) diverging two-series bar shape — shared `stack`, left negated /
 *       right positive, `rawValue` positive on both sides
 *   (b) symmetric value axis (`[-maxAbs, maxAbs]`); `maxValue` override
 *   (c) input normalization — NaN / negative measures clamped to 0
 *   (d) colors / series names / showGrid propagation
 *   (e) empty + all-invalid stability (no option dispatched)
 *   (f) click → raw POSITIVE value + `side` / `ageBand` payload; markup
 *       click does NOT fire `onDataPointClick`
 *   (g) tooltip / axis-label abs formatting
 *   (h) a11y SR data table — one row per age band, no negative numbers
 *
 * PopulationPyramid renders plain `bar` series on a standard cartesian
 * grid — no lazy ECharts feature registration needed (BarChart pattern).
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

import { PopulationPyramid, type PopulationPyramidDatum } from '../PopulationPyramid';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

/** Four age bands. `right` peaks at 240 → default symmetric axis ±240. */
const pyramidData = (): PopulationPyramidDatum[] => [
  { ageBand: '18-24', left: 120, right: 110 },
  { ageBand: '25-34', left: 200, right: 240 },
  { ageBand: '35-44', left: 160, right: 180 },
  { ageBand: '45-54', left: 90, right: 100 },
];

const series = (): Array<Record<string, unknown>> =>
  (lastDispatchedOption()?.series as Array<Record<string, unknown>> | undefined) ?? [];

const xAxis = (): Record<string, unknown> =>
  (lastDispatchedOption()?.xAxis as Record<string, unknown> | undefined) ?? {};

const yAxis = (): Record<string, unknown> =>
  (lastDispatchedOption()?.yAxis as Record<string, unknown> | undefined) ?? {};

beforeEach(() => {
  resetEChartsMock();
  installJsdomPolyfills();
});
afterEach(() => {
  restoreJsdomPolyfills();
});

/* ------------------------------------------------------------------ */
/*  Option shape — diverging two-series bar                            */
/* ------------------------------------------------------------------ */

describe('PopulationPyramid — option shape', () => {
  it('emits two bar series sharing one stack id', () => {
    render(<PopulationPyramid data={pyramidData()} animate={false} />);
    expect(series()).toHaveLength(2);
    expect(series()[0].type).toBe('bar');
    expect(series()[1].type).toBe('bar');
    expect(series()[0].stack).toBe('population-pyramid');
    expect(series()[1].stack).toBe('population-pyramid');
    expect(series()[0].stack).toBe(series()[1].stack);
  });

  it('negates the left series and keeps the right series positive', () => {
    render(<PopulationPyramid data={pyramidData()} animate={false} />);
    const left = series()[0].data as Array<{ value: number; rawValue: number; side: string }>;
    const right = series()[1].data as Array<{ value: number; rawValue: number; side: string }>;
    // Render coordinate: left negative, right positive.
    expect(left.every((d) => d.value <= 0)).toBe(true);
    expect(right.every((d) => d.value >= 0)).toBe(true);
    // rawValue is always the un-negated POSITIVE measure.
    expect(left[1].rawValue).toBe(200);
    expect(left[1].value).toBe(-200);
    expect(right[1].rawValue).toBe(240);
    expect(right[1].value).toBe(240);
    expect(left[0].side).toBe('left');
    expect(right[0].side).toBe('right');
  });

  it('carries the ageBand on every datum (cross-filter payload)', () => {
    render(<PopulationPyramid data={pyramidData()} animate={false} />);
    const left = series()[0].data as Array<{ ageBand: string }>;
    expect(left.map((d) => d.ageBand)).toEqual(['18-24', '25-34', '35-44', '45-54']);
  });

  it('uses a category y-axis (age bands) and a value x-axis', () => {
    render(<PopulationPyramid data={pyramidData()} animate={false} />);
    expect(yAxis().type).toBe('category');
    expect(yAxis().data).toEqual(['18-24', '25-34', '35-44', '45-54']);
    expect(xAxis().type).toBe('value');
  });

  it('makes the value axis symmetric around zero (auto max = largest measure)', () => {
    render(<PopulationPyramid data={pyramidData()} animate={false} />);
    expect(xAxis().min).toBe(-240);
    expect(xAxis().max).toBe(240);
  });

  it('honours an explicit maxValue (still symmetric)', () => {
    render(<PopulationPyramid data={pyramidData()} maxValue={500} animate={false} />);
    expect(xAxis().min).toBe(-500);
    expect(xAxis().max).toBe(500);
  });

  it('series names default / override via leftLabel + rightLabel', () => {
    render(<PopulationPyramid data={pyramidData()} animate={false} />);
    expect(series()[0].name).toBe('Sol');
    expect(series()[1].name).toBe('Sağ');
    render(
      <PopulationPyramid
        data={pyramidData()}
        leftLabel="Erkek"
        rightLabel="Kadın"
        animate={false}
      />,
    );
    expect(series()[0].name).toBe('Erkek');
    expect(series()[1].name).toBe('Kadın');
  });

  it('showGrid toggles the value-axis split line', () => {
    render(<PopulationPyramid data={pyramidData()} animate={false} />);
    expect((xAxis().splitLine as Record<string, unknown>).show).toBe(true);
    render(<PopulationPyramid data={pyramidData()} showGrid={false} animate={false} />);
    expect((xAxis().splitLine as Record<string, unknown>).show).toBe(false);
  });

  it('an explicit colors prop drives the two series itemStyle colors', () => {
    render(
      <PopulationPyramid data={pyramidData()} colors={['#111111', '#222222']} animate={false} />,
    );
    expect((series()[0].itemStyle as Record<string, unknown>).color).toBe('#111111');
    expect((series()[1].itemStyle as Record<string, unknown>).color).toBe('#222222');
  });

  it('the x-axis label formatter shows the absolute value (un-negates)', () => {
    render(<PopulationPyramid data={pyramidData()} animate={false} />);
    const formatter = (xAxis().axisLabel as { formatter: (v: number) => string }).formatter;
    expect(formatter(-200)).toBe(formatter(200));
  });

  it('the tooltip valueFormatter un-negates the left-series render value', () => {
    render(<PopulationPyramid data={pyramidData()} animate={false} />);
    const tt = lastDispatchedOption()?.tooltip as { valueFormatter: (v: unknown) => string };
    expect(tt.valueFormatter(-200)).toBe(tt.valueFormatter(200));
  });
});

/* ------------------------------------------------------------------ */
/*  Normalization                                                      */
/* ------------------------------------------------------------------ */

describe('PopulationPyramid — input normalization', () => {
  it('clamps NaN / Infinity / negative measures to 0', () => {
    render(
      <PopulationPyramid
        data={[
          { ageBand: 'A', left: Number.NaN, right: -50 },
          { ageBand: 'B', left: Number.POSITIVE_INFINITY, right: 80 },
        ]}
        animate={false}
      />,
    );
    const left = series()[0].data as Array<{ rawValue: number }>;
    const right = series()[1].data as Array<{ rawValue: number }>;
    expect(left[0].rawValue).toBe(0); // NaN → 0
    expect(right[0].rawValue).toBe(0); // -50 → 0
    expect(left[1].rawValue).toBe(0); // Infinity → 0
    expect(right[1].rawValue).toBe(80);
  });

  it('drops rows with a missing / non-string ageBand', () => {
    render(
      <PopulationPyramid
        data={[
          { ageBand: 'Keep', left: 1, right: 2 },
          { left: 3, right: 4 } as unknown as PopulationPyramidDatum,
          { ageBand: 'AlsoKeep', left: 5, right: 6 },
        ]}
        animate={false}
      />,
    );
    expect(yAxis().data).toEqual(['Keep', 'AlsoKeep']);
  });

  it('empty data renders an empty-state without dispatching an option', () => {
    expect(() => render(<PopulationPyramid data={[]} animate={false} />)).not.toThrow();
    expect(lastDispatchedOption()).toBeNull();
  });

  it('all-invalid rows render the empty-state (no option dispatched)', () => {
    render(
      <PopulationPyramid
        data={[{ left: 1, right: 2 } as unknown as PopulationPyramidDatum]}
        animate={false}
      />,
    );
    expect(lastDispatchedOption()).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  onDataPointClick — raw positive value + side payload               */
/* ------------------------------------------------------------------ */

describe('PopulationPyramid — onDataPointClick', () => {
  it('emits the raw POSITIVE value + side / ageBand on a bar click', () => {
    const onClick = vi.fn();
    render(<PopulationPyramid data={pyramidData()} onDataPointClick={onClick} animate={false} />);

    const handlers = clickListenerRegistrations();
    expect(handlers.length).toBeGreaterThan(0);
    // Simulate ECharts surfacing a left-series bar click (negated value).
    handlers[handlers.length - 1]({
      data: { rawValue: 200, side: 'left', ageBand: '25-34' },
      name: '25-34',
      value: -200,
      seriesName: 'Erkek',
    });

    expect(onClick).toHaveBeenCalledTimes(1);
    const event = onClick.mock.calls[0][0];
    expect(event.value).toBe(200); // POSITIVE — never the negated coord
    expect(event.label).toBe('25-34');
    // Canonical `label` / `value` must also live INSIDE `datum` (the
    // cross-filter bus forwards only `event.datum`).
    expect(event.datum).toMatchObject({
      side: 'left',
      ageBand: '25-34',
      seriesName: 'Erkek',
      label: '25-34',
      value: 200,
    });
  });

  it('a markup-overlay click does NOT fire onDataPointClick', () => {
    const onClick = vi.fn();
    render(<PopulationPyramid data={pyramidData()} onDataPointClick={onClick} animate={false} />);
    const handlers = clickListenerRegistrations();
    handlers[handlers.length - 1]({ componentType: 'markLine', name: 'mk-1' });
    expect(onClick).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/*  A11y                                                               */
/* ------------------------------------------------------------------ */

describe('PopulationPyramid — a11y SR data table', () => {
  it('renders a hidden SR table with one row per age band', () => {
    const { container } = render(
      <PopulationPyramid
        data={pyramidData()}
        leftLabel="Erkek"
        rightLabel="Kadın"
        title="İK Yaş Piramidi"
        animate={false}
      />,
    );
    const rows = container.querySelectorAll('table tbody tr');
    expect(rows.length).toBeGreaterThanOrEqual(4);
  });

  it('the SR table carries both sides as raw positive values (no negatives)', () => {
    const { container } = render(
      <PopulationPyramid
        data={pyramidData()}
        leftLabel="Erkek"
        rightLabel="Kadın"
        animate={false}
      />,
    );
    const tableText = container.querySelector('table')?.textContent ?? '';
    expect(tableText).toContain('Erkek');
    expect(tableText).toContain('Kadın');
    // The negated render coordinate must never leak into the SR table —
    // the left measures (120/200/160/90) must not appear negated. (A bare
    // /-\d/ would false-positive on age-band labels like "18-24".)
    for (const leftValue of [120, 200, 160, 90]) {
      expect(tableText).not.toContain(`-${leftValue}`);
    }
  });
});
