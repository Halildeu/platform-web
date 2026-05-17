// @vitest-environment jsdom
/**
 * PolarChart — PR-X16c option-shape, radius-axis + a11y tests.
 *
 * Codex thread 019e35b3 plan-time AGREE (iter-2) — ECharts Depth
 * campaign, third wrapper. Covers:
 *   (a) normalizePolarData — input order preserved, invalid-name drop,
 *       value sanitization
 *   (b) linearizePolarForA11y — flat {label,value} rows
 *   (c) option-shape: `bar` / `line` / `scatter` series on the `polar`
 *       coordinate system; `colorBy` per series type; category
 *       `angleAxis`; value `radiusAxis`; the bar-vs-line `radiusAxis.min`
 *       default; startAngle / axis-label propagation
 *   (d) empty-data + all-invalid-name stability (no option dispatched)
 *   (e) click `dataIndex` → normalized-array parity
 *   (f) a11y SR data table
 *
 * The lazy `polar` component is pre-registered via
 * `markEChartsFeatureRegisteredForTest` so `useRequiredEChartsFeature`
 * is synchronously `ready` and the option-shape assertions stay
 * synchronous (CalendarHeatmap.test.tsx pattern).
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
  PolarChart,
  normalizePolarData,
  linearizePolarForA11y,
  type PolarChartDataPoint,
} from '../PolarChart';
import {
  markEChartsFeatureRegisteredForTest,
  resetEChartsFeatureRegistration,
} from '../renderers/registerEChartsFeature';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

/** Four categories, deliberately NOT value-sorted — exercises the
 *  input-order-preserved contract. */
const polarData = (): PolarChartDataPoint[] => [
  { name: 'Pzt', value: 12 },
  { name: 'Sal', value: 8 },
  { name: 'Çar', value: 20 },
  { name: 'Per', value: 5 },
];

/** series[0] of the last dispatched option, typed loose for assertions. */
const polarSeries = (): Record<string, unknown> => {
  const series = lastDispatchedOption()?.series as Array<Record<string, unknown>> | undefined;
  return series?.[0] ?? {};
};

/** The `angleAxis` block of the last dispatched option. */
const polarAngleAxis = (): Record<string, unknown> =>
  (lastDispatchedOption()?.angleAxis as Record<string, unknown> | undefined) ?? {};

/** The `radiusAxis` block of the last dispatched option. */
const polarRadiusAxis = (): Record<string, unknown> =>
  (lastDispatchedOption()?.radiusAxis as Record<string, unknown> | undefined) ?? {};

beforeEach(() => {
  resetEChartsMock();
  installJsdomPolyfills();
  // PR-X16c: PolarChart lazy-registers the `polar` coordinate system
  // via useRequiredEChartsFeature. The echarts-mock stubs the renderer,
  // so pre-mark `polar` registered — keeps the hook synchronously
  // `ready` and the assertions below synchronous.
  markEChartsFeatureRegisteredForTest('polar');
});
afterEach(() => {
  restoreJsdomPolyfills();
  resetEChartsFeatureRegistration();
});

/* ------------------------------------------------------------------ */
/*  normalizePolarData                                                 */
/* ------------------------------------------------------------------ */

describe('normalizePolarData', () => {
  it('preserves input order (the angular order around the polar axis)', () => {
    const out = normalizePolarData(polarData());
    expect(out.map((d) => d.name)).toEqual(['Pzt', 'Sal', 'Çar', 'Per']);
  });

  it('drops entries with a missing / non-string / empty name', () => {
    const out = normalizePolarData([
      { name: 'Keep', value: 1 },
      { name: '', value: 2 },
      { value: 3 } as unknown as PolarChartDataPoint,
      { name: 'AlsoKeep', value: 4 },
    ]);
    expect(out.map((d) => d.name)).toEqual(['Keep', 'AlsoKeep']);
  });

  it('sanitizes non-finite values to a finite number', () => {
    const out = normalizePolarData([
      { name: 'A', value: Number.NaN },
      { name: 'B', value: Number.POSITIVE_INFINITY },
    ]);
    expect(Number.isFinite(out[0].value)).toBe(true);
    expect(Number.isFinite(out[1].value)).toBe(true);
  });

  it('handles empty input', () => {
    expect(normalizePolarData([])).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  linearizePolarForA11y                                              */
/* ------------------------------------------------------------------ */

describe('linearizePolarForA11y', () => {
  it('maps the normalized array to flat {label,value} rows in order', () => {
    const rows = linearizePolarForA11y(normalizePolarData(polarData()));
    expect(rows).toEqual([
      { label: 'Pzt', value: 12 },
      { label: 'Sal', value: 8 },
      { label: 'Çar', value: 20 },
      { label: 'Per', value: 5 },
    ]);
  });
});

/* ------------------------------------------------------------------ */
/*  Option-shape                                                       */
/* ------------------------------------------------------------------ */

describe('PolarChart — option shape', () => {
  it('emits a single series on the polar coordinate system', () => {
    render(<PolarChart data={polarData()} animate={false} />);
    const series = lastDispatchedOption()?.series as unknown[];
    expect(series).toHaveLength(1);
    expect(polarSeries().coordinateSystem).toBe('polar');
  });

  it('defaults to a bar series with colorBy "data"', () => {
    render(<PolarChart data={polarData()} animate={false} />);
    expect(polarSeries().type).toBe('bar');
    expect(polarSeries().colorBy).toBe('data');
  });

  it('a line series carries colorBy "series"', () => {
    render(<PolarChart data={polarData()} seriesType="line" animate={false} />);
    expect(polarSeries().type).toBe('line');
    expect(polarSeries().colorBy).toBe('series');
  });

  it('a scatter series carries colorBy "series"', () => {
    render(<PolarChart data={polarData()} seriesType="scatter" animate={false} />);
    expect(polarSeries().type).toBe('scatter');
    expect(polarSeries().colorBy).toBe('series');
  });

  it('series.data is the value array in input order', () => {
    render(<PolarChart data={polarData()} animate={false} />);
    expect(polarSeries().data).toEqual([12, 8, 20, 5]);
  });

  it('angleAxis is a category axis carrying the names in input order', () => {
    render(<PolarChart data={polarData()} animate={false} />);
    expect(polarAngleAxis().type).toBe('category');
    expect(polarAngleAxis().data).toEqual(['Pzt', 'Sal', 'Çar', 'Per']);
  });

  it('angleAxis.startAngle defaults to 90, honours an override', () => {
    render(<PolarChart data={polarData()} animate={false} />);
    expect(polarAngleAxis().startAngle).toBe(90);
    render(<PolarChart data={polarData()} startAngle={0} animate={false} />);
    expect(polarAngleAxis().startAngle).toBe(0);
  });

  it('radiusAxis is a value axis', () => {
    render(<PolarChart data={polarData()} animate={false} />);
    expect(polarRadiusAxis().type).toBe('value');
  });

  it('a bar series of all-non-negative values pins radiusAxis.min to 0', () => {
    render(<PolarChart data={polarData()} animate={false} />);
    expect(polarRadiusAxis().min).toBe(0);
  });

  it('a bar series with a negative value leaves radiusAxis.min auto', () => {
    render(
      <PolarChart
        data={[
          { name: 'A', value: -3 },
          { name: 'B', value: 7 },
        ]}
        animate={false}
      />,
    );
    expect(polarRadiusAxis().min).toBeUndefined();
  });

  it('a line series leaves radiusAxis.min auto', () => {
    render(<PolarChart data={polarData()} seriesType="line" animate={false} />);
    expect(polarRadiusAxis().min).toBeUndefined();
  });

  it('min / max props override the radius scale', () => {
    render(<PolarChart data={polarData()} min={2} max={50} animate={false} />);
    expect(polarRadiusAxis().min).toBe(2);
    expect(polarRadiusAxis().max).toBe(50);
  });

  it('showAngleAxisLabel toggles the angle-axis label visibility', () => {
    render(<PolarChart data={polarData()} animate={false} />);
    expect((polarAngleAxis().axisLabel as Record<string, unknown>).show).toBe(true);
    render(<PolarChart data={polarData()} showAngleAxisLabel={false} animate={false} />);
    expect((polarAngleAxis().axisLabel as Record<string, unknown>).show).toBe(false);
  });

  it('showRadiusAxisLabel toggles the radius-axis label visibility', () => {
    render(<PolarChart data={polarData()} animate={false} />);
    expect((polarRadiusAxis().axisLabel as Record<string, unknown>).show).toBe(true);
    render(<PolarChart data={polarData()} showRadiusAxisLabel={false} animate={false} />);
    expect((polarRadiusAxis().axisLabel as Record<string, unknown>).show).toBe(false);
  });

  it('empty data renders an empty-state without dispatching an option', () => {
    expect(() => render(<PolarChart data={[]} animate={false} />)).not.toThrow();
    expect(lastDispatchedOption()).toBeNull();
  });

  it('data whose every entry has an invalid name renders the empty-state', () => {
    render(
      <PolarChart
        data={[{ name: '', value: 1 }, { value: 2 } as unknown as PolarChartDataPoint]}
        animate={false}
      />,
    );
    expect(lastDispatchedOption()).toBeNull();
  });

  it('rerender with a new seriesType produces a fresh option (stale-dep guard)', () => {
    const { rerender } = render(<PolarChart data={polarData()} seriesType="bar" animate={false} />);
    expect(polarSeries().type).toBe('bar');
    rerender(<PolarChart data={polarData()} seriesType="line" animate={false} />);
    expect(polarSeries().type).toBe('line');
  });
});

/* ------------------------------------------------------------------ */
/*  onDataPointClick — dataIndex parity                                */
/* ------------------------------------------------------------------ */

describe('PolarChart — onDataPointClick', () => {
  it('resolves the clicked dataIndex against the normalized array', () => {
    const onClick = vi.fn();
    render(<PolarChart data={polarData()} onDataPointClick={onClick} animate={false} />);

    const handlers = clickListenerRegistrations();
    expect(handlers.length).toBeGreaterThan(0);
    handlers[handlers.length - 1]({ dataIndex: 2 });

    expect(onClick).toHaveBeenCalledTimes(1);
    const event = onClick.mock.calls[0][0];
    expect(event.label).toBe('Çar');
    expect(event.value).toBe(20);
    expect(event.datum).toMatchObject({
      kind: 'polar-point',
      name: 'Çar',
      label: 'Çar',
      value: 20,
      dataIndex: 2,
      seriesType: 'bar',
    });
  });

  it('ignores a click whose dataIndex is out of range', () => {
    const onClick = vi.fn();
    render(<PolarChart data={polarData()} onDataPointClick={onClick} animate={false} />);
    const handlers = clickListenerRegistrations();
    handlers[handlers.length - 1]({ dataIndex: 99 });
    expect(onClick).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/*  A11y                                                               */
/* ------------------------------------------------------------------ */

describe('PolarChart — a11y SR data table', () => {
  it('renders a hidden SR table with one chronological row per category', () => {
    const { container } = render(
      <PolarChart data={polarData()} title="Haftalık Yoğunluk" animate={false} />,
    );
    const rows = container.querySelectorAll('table tbody tr');
    expect(rows.length).toBeGreaterThanOrEqual(4);
    const firstCell = rows[0]?.querySelector('td')?.textContent ?? '';
    expect(firstCell).toBe('Pzt');
  });
});
