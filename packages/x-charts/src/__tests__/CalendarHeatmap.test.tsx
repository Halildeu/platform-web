// @vitest-environment jsdom
/**
 * CalendarHeatmap — PR-X16b option-shape + a11y linearization tests.
 *
 * Codex thread 019e33a9 plan-time AGREE — ECharts Depth campaign,
 * second wrapper. Covers:
 *   (a) normalizeCalendarData — date sort + invalid-entry drop
 *   (b) linearizeCalendarForA11y — flat {label,value} rows
 *   (c) option-shape: `heatmap` series on the `calendar` coordinate
 *       system; visualMap MANDATORY; range derived vs explicit;
 *       cellSize / orient / startOfWeek / showValues propagation
 *   (d) empty-data stability
 *   (e) a11y SR data table
 *
 * The lazy `calendar` component is pre-registered via
 * `markEChartsFeatureRegisteredForTest` so `useRequiredEChartsFeature`
 * is synchronously `ready` and the option-shape assertions stay
 * synchronous (TreeChart.test.tsx pattern).
 */
import { lastDispatchedOption, resetEChartsMock } from './fixtures/echarts-mock'; // side-effect import: vi.mock hoisted
import { installJsdomPolyfills, restoreJsdomPolyfills } from './fixtures/jsdom-polyfills';

import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';

import {
  CalendarHeatmap,
  normalizeCalendarData,
  linearizeCalendarForA11y,
  type CalendarHeatmapDataPoint,
} from '../CalendarHeatmap';
import {
  markEChartsFeatureRegisteredForTest,
  resetEChartsFeatureRegistration,
} from '../renderers/registerEChartsFeature';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

/** Deliberately date-unsorted so the sort contract is exercised. */
const calData = (): CalendarHeatmapDataPoint[] => [
  { date: '2026-01-03', value: 8 },
  { date: '2026-01-01', value: 5 },
  { date: '2026-01-02', value: 12 },
];

const calOption = (): Record<string, unknown> => lastDispatchedOption() ?? {};

/** series[0] of the last dispatched option, typed loose for assertions. */
const calSeries = (): Record<string, unknown> => {
  const series = lastDispatchedOption()?.series as Array<Record<string, unknown>> | undefined;
  return series?.[0] ?? {};
};

/** The `calendar` coordinate-system block of the last dispatched option. */
const calCalendar = (): Record<string, unknown> =>
  (lastDispatchedOption()?.calendar as Record<string, unknown> | undefined) ?? {};

beforeEach(() => {
  resetEChartsMock();
  installJsdomPolyfills();
  // PR-X16b: CalendarHeatmap lazy-registers the `calendar` coordinate
  // system via useRequiredEChartsFeature. The echarts-mock stubs the
  // renderer, so pre-mark `calendar` registered — keeps the hook
  // synchronously `ready` and the assertions below synchronous.
  markEChartsFeatureRegisteredForTest('calendar');
});
afterEach(() => {
  restoreJsdomPolyfills();
  resetEChartsFeatureRegistration();
});

/* ------------------------------------------------------------------ */
/*  normalizeCalendarData                                              */
/* ------------------------------------------------------------------ */

describe('normalizeCalendarData', () => {
  it('sorts entries by date ascending', () => {
    const sorted = normalizeCalendarData(calData());
    expect(sorted.map((d) => d.date)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
  });

  it('drops entries with a missing / non-string / empty date', () => {
    const sorted = normalizeCalendarData([
      { date: '2026-02-01', value: 1 },
      { date: '', value: 2 },
      { value: 3 } as unknown as CalendarHeatmapDataPoint,
    ]);
    expect(sorted).toHaveLength(1);
    expect(sorted[0].date).toBe('2026-02-01');
  });

  it('handles empty input', () => {
    expect(normalizeCalendarData([])).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  linearizeCalendarForA11y                                           */
/* ------------------------------------------------------------------ */

describe('linearizeCalendarForA11y', () => {
  it('maps the sorted array to flat {label,value} rows in chronological order', () => {
    const rows = linearizeCalendarForA11y(normalizeCalendarData(calData()));
    expect(rows).toEqual([
      { label: '2026-01-01', value: 5 },
      { label: '2026-01-02', value: 12 },
      { label: '2026-01-03', value: 8 },
    ]);
  });
});

/* ------------------------------------------------------------------ */
/*  Option-shape                                                       */
/* ------------------------------------------------------------------ */

describe('CalendarHeatmap — option shape', () => {
  it('emits a single heatmap series on the calendar coordinate system', () => {
    render(<CalendarHeatmap data={calData()} animate={false} />);
    const series = lastDispatchedOption()?.series as unknown[];
    expect(series).toHaveLength(1);
    expect(calSeries().type).toBe('heatmap');
    expect(calSeries().coordinateSystem).toBe('calendar');
  });

  it('series.data is the date-sorted [date, value] tuple array', () => {
    render(<CalendarHeatmap data={calData()} animate={false} />);
    expect(calSeries().data).toEqual([
      ['2026-01-01', 5],
      ['2026-01-02', 12],
      ['2026-01-03', 8],
    ]);
  });

  it('always emits a visualMap (mandatory heatmap render contract)', () => {
    render(<CalendarHeatmap data={calData()} animate={false} />);
    const vm = calOption().visualMap as Record<string, unknown>;
    expect(vm).toBeTruthy();
    expect(vm.min).toBe(5);
    expect(vm.max).toBe(12);
  });

  it('visualMap stays present but hidden when showVisualMap=false', () => {
    render(<CalendarHeatmap data={calData()} showVisualMap={false} animate={false} />);
    const vm = calOption().visualMap as Record<string, unknown>;
    expect(vm).toBeTruthy();
    expect(vm.show).toBe(false);
  });

  it('derives calendar.range from the data span when range omitted', () => {
    render(<CalendarHeatmap data={calData()} animate={false} />);
    expect(calCalendar().range).toEqual(['2026-01-01', '2026-01-03']);
  });

  it('honours an explicit range prop', () => {
    render(<CalendarHeatmap data={calData()} range="2026" animate={false} />);
    expect(calCalendar().range).toBe('2026');
  });

  it('calendar.orient defaults to horizontal, honours override', () => {
    render(<CalendarHeatmap data={calData()} animate={false} />);
    expect(calCalendar().orient).toBe('horizontal');
    render(<CalendarHeatmap data={calData()} orient="vertical" animate={false} />);
    expect(calCalendar().orient).toBe('vertical');
  });

  it('startOfWeek maps to calendar.dayLabel.firstDay (monday=1, sunday=0)', () => {
    render(<CalendarHeatmap data={calData()} animate={false} />);
    expect((calCalendar().dayLabel as Record<string, unknown>).firstDay).toBe(1);
    render(<CalendarHeatmap data={calData()} startOfWeek="sunday" animate={false} />);
    expect((calCalendar().dayLabel as Record<string, unknown>).firstDay).toBe(0);
  });

  it('cellSize defaults to "auto", honours a numeric override', () => {
    render(<CalendarHeatmap data={calData()} animate={false} />);
    expect(calCalendar().cellSize).toBe('auto');
    render(<CalendarHeatmap data={calData()} cellSize={16} animate={false} />);
    expect(calCalendar().cellSize).toBe(16);
  });

  it('showValues toggles the cell label visibility', () => {
    render(<CalendarHeatmap data={calData()} animate={false} />);
    expect((calSeries().label as Record<string, unknown>).show).toBe(false);
    render(<CalendarHeatmap data={calData()} showValues animate={false} />);
    expect((calSeries().label as Record<string, unknown>).show).toBe(true);
  });

  it('min/max overrides drive the visualMap scale', () => {
    render(<CalendarHeatmap data={calData()} min={0} max={100} animate={false} />);
    const vm = calOption().visualMap as Record<string, unknown>;
    expect(vm.min).toBe(0);
    expect(vm.max).toBe(100);
  });

  it('empty data renders an empty-state without throwing', () => {
    expect(() => render(<CalendarHeatmap data={[]} animate={false} />)).not.toThrow();
    // No option dispatched for empty data (component short-circuits).
  });

  it('rerender with new orient produces a fresh option (stale-dep guard)', () => {
    const { rerender } = render(
      <CalendarHeatmap data={calData()} orient="horizontal" animate={false} />,
    );
    expect(calCalendar().orient).toBe('horizontal');
    rerender(<CalendarHeatmap data={calData()} orient="vertical" animate={false} />);
    expect(calCalendar().orient).toBe('vertical');
  });
});

/* ------------------------------------------------------------------ */
/*  A11y                                                               */
/* ------------------------------------------------------------------ */

describe('CalendarHeatmap — a11y SR data table', () => {
  it('renders a hidden SR table with one chronological row per day', () => {
    const { container } = render(
      <CalendarHeatmap data={calData()} title="Günlük Aktivite" animate={false} />,
    );
    const rows = container.querySelectorAll('table tbody tr');
    expect(rows.length).toBeGreaterThanOrEqual(3);
    const firstCell = rows[0]?.querySelector('td')?.textContent ?? '';
    expect(firstCell).toBe('2026-01-01');
  });
});
