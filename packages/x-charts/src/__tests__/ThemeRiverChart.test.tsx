// @vitest-environment jsdom
/**
 * ThemeRiverChart — PR-X16d dense-matrix, option-shape + a11y tests.
 *
 * Codex thread 019e3615 plan-time AGREE (iter-2) — ECharts Depth
 * campaign, fourth wrapper. Covers:
 *   (a) normalizeThemeRiverData — dense date-x-category matrix, dates
 *       sorted, missing cells filled 0, duplicate pairs summed, negative
 *       values clamped, invalid rows dropped
 *   (b) linearizeThemeRiverForA11y — flat {label,value} rows
 *   (c) option-shape: a `themeRiver` series on the `singleAxis` time
 *       coordinate system; dense [date,value,category] tuple data;
 *       showLabel propagation
 *   (d) empty-data + all-zero stability (no option dispatched)
 *   (e) category-level click (theme-river-category)
 *   (f) a11y SR data table
 *
 * The lazy `themeRiver` feature is pre-registered via
 * `markEChartsFeatureRegisteredForTest` so `useRequiredEChartsFeature`
 * is synchronously `ready` and the option-shape assertions stay
 * synchronous (PolarChart.test.tsx pattern).
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
  ThemeRiverChart,
  normalizeThemeRiverData,
  linearizeThemeRiverForA11y,
  type ThemeRiverDataPoint,
} from '../ThemeRiverChart';
import {
  markEChartsFeatureRegisteredForTest,
  resetEChartsFeatureRegistration,
} from '../renderers/registerEChartsFeature';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

/** Two dates x two categories, deliberately date-unsorted so the sort
 *  contract is exercised. Web appears before Mobile (first-appearance). */
const riverData = (): ThemeRiverDataPoint[] => [
  { date: '2026-02-01', category: 'Web', value: 14 },
  { date: '2026-01-01', category: 'Web', value: 10 },
  { date: '2026-01-01', category: 'Mobile', value: 6 },
  { date: '2026-02-01', category: 'Mobile', value: 9 },
];

/** series[0] of the last dispatched option, typed loose for assertions. */
const riverSeries = (): Record<string, unknown> => {
  const series = lastDispatchedOption()?.series as Array<Record<string, unknown>> | undefined;
  return series?.[0] ?? {};
};

/** The `singleAxis` block of the last dispatched option. */
const riverSingleAxis = (): Record<string, unknown> =>
  (lastDispatchedOption()?.singleAxis as Record<string, unknown> | undefined) ?? {};

beforeEach(() => {
  resetEChartsMock();
  installJsdomPolyfills();
  // PR-X16d: ThemeRiverChart lazy-registers the `themeRiver` series +
  // `singleAxis` component. The echarts-mock stubs the renderer, so
  // pre-mark `themeRiver` registered — keeps the hook synchronously
  // `ready` and the assertions below synchronous.
  markEChartsFeatureRegisteredForTest('themeRiver');
});
afterEach(() => {
  restoreJsdomPolyfills();
  resetEChartsFeatureRegistration();
});

/* ------------------------------------------------------------------ */
/*  normalizeThemeRiverData                                            */
/* ------------------------------------------------------------------ */

describe('normalizeThemeRiverData', () => {
  it('builds a dense date-x-category matrix with dates ascending', () => {
    const out = normalizeThemeRiverData(riverData());
    expect(out).toEqual([
      { date: '2026-01-01', value: 10, category: 'Web' },
      { date: '2026-01-01', value: 6, category: 'Mobile' },
      { date: '2026-02-01', value: 14, category: 'Web' },
      { date: '2026-02-01', value: 9, category: 'Mobile' },
    ]);
  });

  it('fills missing (date, category) cells with 0', () => {
    const out = normalizeThemeRiverData([
      { date: '2026-01-01', category: 'Web', value: 10 },
      { date: '2026-02-01', category: 'Mobile', value: 9 },
    ]);
    expect(out).toHaveLength(4); // 2 dates x 2 categories
    const cell = (date: string, category: string): number | undefined =>
      out.find((d) => d.date === date && d.category === category)?.value;
    expect(cell('2026-01-01', 'Web')).toBe(10);
    expect(cell('2026-01-01', 'Mobile')).toBe(0);
    expect(cell('2026-02-01', 'Web')).toBe(0);
    expect(cell('2026-02-01', 'Mobile')).toBe(9);
  });

  it('sums duplicate (date, category) pairs', () => {
    const out = normalizeThemeRiverData([
      { date: '2026-01-01', category: 'Web', value: 4 },
      { date: '2026-01-01', category: 'Web', value: 7 },
    ]);
    expect(out).toEqual([{ date: '2026-01-01', value: 11, category: 'Web' }]);
  });

  it('clamps negative values to 0', () => {
    const out = normalizeThemeRiverData([
      { date: '2026-01-01', category: 'Web', value: -5 },
      { date: '2026-01-01', category: 'Mobile', value: 8 },
    ]);
    expect(out.find((d) => d.category === 'Web')?.value).toBe(0);
    expect(out.find((d) => d.category === 'Mobile')?.value).toBe(8);
  });

  it('drops rows with an empty category or an unparseable / missing date', () => {
    const out = normalizeThemeRiverData([
      { date: '2026-01-01', category: 'Keep', value: 1 },
      { date: '2026-01-01', category: '', value: 2 },
      { date: 'not-a-date', category: 'Drop', value: 3 },
      { category: 'NoDate', value: 4 } as unknown as ThemeRiverDataPoint,
    ]);
    expect(out).toEqual([{ date: '2026-01-01', value: 1, category: 'Keep' }]);
  });

  it('handles empty input', () => {
    expect(normalizeThemeRiverData([])).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  linearizeThemeRiverForA11y                                         */
/* ------------------------------------------------------------------ */

describe('linearizeThemeRiverForA11y', () => {
  it('maps the dense matrix to flat {label,value} rows in matrix order', () => {
    const rows = linearizeThemeRiverForA11y(normalizeThemeRiverData(riverData()));
    expect(rows).toHaveLength(4);
    expect(rows[0].value).toBe(10);
    expect(rows[0].label).toContain('2026-01-01');
    expect(rows[0].label).toContain('Web');
    expect(rows[3].value).toBe(9);
    expect(rows[3].label).toContain('Mobile');
  });
});

/* ------------------------------------------------------------------ */
/*  Option-shape                                                       */
/* ------------------------------------------------------------------ */

describe('ThemeRiverChart — option shape', () => {
  it('emits a single themeRiver series on the singleAxis coordinate system', () => {
    render(<ThemeRiverChart data={riverData()} animate={false} />);
    const series = lastDispatchedOption()?.series as unknown[];
    expect(series).toHaveLength(1);
    expect(riverSeries().type).toBe('themeRiver');
    expect(riverSeries().coordinateSystem).toBe('singleAxis');
  });

  it('singleAxis is a time axis', () => {
    render(<ThemeRiverChart data={riverData()} animate={false} />);
    expect(riverSingleAxis().type).toBe('time');
  });

  it('series.data is the dense [date, value, category] tuple matrix', () => {
    render(<ThemeRiverChart data={riverData()} animate={false} />);
    expect(riverSeries().data).toEqual([
      ['2026-01-01', 10, 'Web'],
      ['2026-01-01', 6, 'Mobile'],
      ['2026-02-01', 14, 'Web'],
      ['2026-02-01', 9, 'Mobile'],
    ]);
  });

  it('showLabel toggles the band label visibility', () => {
    render(<ThemeRiverChart data={riverData()} animate={false} />);
    expect((riverSeries().label as Record<string, unknown>).show).toBe(true);
    render(<ThemeRiverChart data={riverData()} showLabel={false} animate={false} />);
    expect((riverSeries().label as Record<string, unknown>).show).toBe(false);
  });

  it('empty data renders an empty-state without dispatching an option', () => {
    expect(() => render(<ThemeRiverChart data={[]} animate={false} />)).not.toThrow();
    expect(lastDispatchedOption()).toBeNull();
  });

  it('an all-zero dataset renders the empty-state (no blank canvas)', () => {
    render(
      <ThemeRiverChart
        data={[
          { date: '2026-01-01', category: 'Web', value: 0 },
          { date: '2026-02-01', category: 'Web', value: 0 },
        ]}
        animate={false}
      />,
    );
    expect(lastDispatchedOption()).toBeNull();
  });

  it('rerender with new data produces a fresh option (stale-dep guard)', () => {
    const { rerender } = render(<ThemeRiverChart data={riverData()} animate={false} />);
    expect((riverSeries().data as unknown[]).length).toBe(4);
    rerender(
      <ThemeRiverChart
        data={[{ date: '2026-01-01', category: 'Solo', value: 5 }]}
        animate={false}
      />,
    );
    expect(riverSeries().data).toEqual([['2026-01-01', 5, 'Solo']]);
  });
});

/* ------------------------------------------------------------------ */
/*  onDataPointClick — category-level                                  */
/* ------------------------------------------------------------------ */

describe('ThemeRiverChart — onDataPointClick', () => {
  it('resolves a band click to the category (theme-river-category)', () => {
    const onClick = vi.fn();
    render(<ThemeRiverChart data={riverData()} onDataPointClick={onClick} animate={false} />);

    const handlers = clickListenerRegistrations();
    expect(handlers.length).toBeGreaterThan(0);
    handlers[handlers.length - 1]({ name: 'Mobile' });

    expect(onClick).toHaveBeenCalledTimes(1);
    const event = onClick.mock.calls[0][0];
    expect(event.label).toBe('Mobile');
    expect(event.datum).toMatchObject({ kind: 'theme-river-category', category: 'Mobile' });
  });

  it('falls back to the data tuple category slot when name is absent', () => {
    const onClick = vi.fn();
    render(<ThemeRiverChart data={riverData()} onDataPointClick={onClick} animate={false} />);
    const handlers = clickListenerRegistrations();
    handlers[handlers.length - 1]({ value: ['2026-01-01', 10, 'Web'] });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0][0].datum.category).toBe('Web');
  });

  it('ignores a click whose band name is not a known category', () => {
    const onClick = vi.fn();
    render(<ThemeRiverChart data={riverData()} onDataPointClick={onClick} animate={false} />);
    const handlers = clickListenerRegistrations();
    handlers[handlers.length - 1]({ name: 'Unknown' });
    expect(onClick).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/*  A11y                                                               */
/* ------------------------------------------------------------------ */

describe('ThemeRiverChart — a11y SR data table', () => {
  it('renders a hidden SR table with one row per date-x-category cell', () => {
    const { container } = render(
      <ThemeRiverChart data={riverData()} title="Kanal Hacmi" animate={false} />,
    );
    const rows = container.querySelectorAll('table tbody tr');
    expect(rows.length).toBeGreaterThanOrEqual(4); // 2 dates x 2 categories
    const firstCell = rows[0]?.querySelector('td')?.textContent ?? '';
    expect(firstCell).toContain('2026-01-01');
  });
});
