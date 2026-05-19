// @vitest-environment jsdom
/**
 * ComboChart — Codex thread 019e41cd AGREE — option-shape, dual-axis,
 * tooltip routing, click payload + a11y tests. Covers:
 *   (a) mixed bar + line series — each series renders with its declared
 *       `type`; data passes through positionally
 *   (b) conditional secondary y-axis — TWO axes only when a series
 *       targets `axis: 'secondary'`, otherwise ONE; `yAxisIndex` routing
 *   (c) primary / secondary axis-label formatters resolve independently
 *   (d) custom tooltip — each row routed through its series-axis
 *       formatter by `seriesIndex` (duplicate-name safe), HTML escaped
 *   (e) CSS-var color resolution + explicit `colors` passthrough
 *   (f) input normalization — invalid type / non-array data dropped,
 *       short data zero-padded, long data truncated, NaN/Inf clamped,
 *       unknown axis coerced to primary
 *   (g) empty state — no option dispatched
 *   (h) click → label / value + datum carrying seriesName / seriesIndex
 *       / dataIndex / axis / type; markup click does NOT fire
 *       onDataPointClick
 *   (i) a11y SR data table — one row per label, each series formatted by
 *       its own axis formatter
 *
 * ComboChart renders plain `bar` + `line` series on a standard cartesian
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

import {
  ComboChart,
  type ComboChartSeries,
  type ComboSeriesType,
  type ComboAxisId,
} from '../ComboChart';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

/** Three months — a salary line (primary) + a headcount bar (secondary). */
const comboLabels = (): string[] => ['Oca', 'Şub', 'Mar'];
const comboSeries = (): ComboChartSeries[] => [
  { name: 'Ort. Maaş', type: 'line', axis: 'primary', data: [42000, 43500, 45000] },
  { name: 'Çalışan', type: 'bar', axis: 'secondary', data: [120, 118, 125] },
];

const series = (): Array<Record<string, unknown>> =>
  (lastDispatchedOption()?.series as Array<Record<string, unknown>> | undefined) ?? [];

const xAxis = (): Record<string, unknown> =>
  (lastDispatchedOption()?.xAxis as Record<string, unknown> | undefined) ?? {};

const yAxis = (): Array<Record<string, unknown>> =>
  (lastDispatchedOption()?.yAxis as Array<Record<string, unknown>> | undefined) ?? [];

const tooltipFormatter = (): ((params: unknown) => string) | undefined =>
  (lastDispatchedOption()?.tooltip as { formatter?: (p: unknown) => string } | undefined)
    ?.formatter;

beforeEach(() => {
  resetEChartsMock();
  installJsdomPolyfills();
});
afterEach(() => {
  restoreJsdomPolyfills();
});

/* ------------------------------------------------------------------ */
/*  Option shape — mixed bar + line, dual axis                         */
/* ------------------------------------------------------------------ */

describe('ComboChart — option shape', () => {
  it('renders each series with its declared type (bar / line)', () => {
    render(<ComboChart labels={comboLabels()} series={comboSeries()} animate={false} />);
    expect(series()).toHaveLength(2);
    expect(series()[0].type).toBe('line');
    expect(series()[1].type).toBe('bar');
  });

  it('passes series data through positionally', () => {
    render(<ComboChart labels={comboLabels()} series={comboSeries()} animate={false} />);
    expect(series()[0].data).toEqual([42000, 43500, 45000]);
    expect(series()[1].data).toEqual([120, 118, 125]);
  });

  it('uses a category x-axis with boundaryGap enabled (bars need a band)', () => {
    render(<ComboChart labels={comboLabels()} series={comboSeries()} animate={false} />);
    expect(xAxis().type).toBe('category');
    expect(xAxis().data).toEqual(['Oca', 'Şub', 'Mar']);
    expect(xAxis().boundaryGap).toBe(true);
  });

  it('renders TWO y-axes when a series targets the secondary axis', () => {
    render(<ComboChart labels={comboLabels()} series={comboSeries()} animate={false} />);
    expect(yAxis()).toHaveLength(2);
    expect(yAxis()[0].position).toBe('left');
    expect(yAxis()[1].position).toBe('right');
  });

  it('renders a SINGLE y-axis when no series targets the secondary axis', () => {
    render(
      <ComboChart
        labels={comboLabels()}
        series={[
          { name: 'A', type: 'bar', data: [1, 2, 3] },
          { name: 'B', type: 'line', data: [4, 5, 6] },
        ]}
        animate={false}
      />,
    );
    expect(yAxis()).toHaveLength(1);
    expect(yAxis()[0].position).toBe('left');
  });

  it('binds the secondary series to yAxisIndex 1 and the primary series to 0', () => {
    render(<ComboChart labels={comboLabels()} series={comboSeries()} animate={false} />);
    expect(series()[0].yAxisIndex).toBe(0); // 'Ort. Maaş' — primary
    expect(series()[1].yAxisIndex).toBe(1); // 'Çalışan' — secondary
  });

  it('keeps every series on yAxisIndex 0 when there is no secondary axis', () => {
    render(
      <ComboChart
        labels={comboLabels()}
        series={[
          { name: 'A', type: 'bar', data: [1, 2, 3] },
          { name: 'B', type: 'line', data: [4, 5, 6] },
        ]}
        animate={false}
      />,
    );
    expect(series()[0].yAxisIndex).toBe(0);
    expect(series()[1].yAxisIndex).toBe(0);
  });

  it('formats the primary axis with valueFormatter and the secondary with secondaryValueFormatter', () => {
    render(
      <ComboChart
        labels={comboLabels()}
        series={comboSeries()}
        valueFormatter={(v) => `P${v}`}
        secondaryValueFormatter={(v) => `S${v}`}
        animate={false}
      />,
    );
    const primary = yAxis()[0].axisLabel as { formatter: (v: number) => string };
    const secondary = yAxis()[1].axisLabel as { formatter: (v: number) => string };
    expect(primary.formatter(10)).toBe('P10');
    expect(secondary.formatter(10)).toBe('S10');
  });

  it('an explicit colors prop drives the line lineStyle and bar itemStyle colors', () => {
    render(
      <ComboChart
        labels={comboLabels()}
        series={comboSeries()}
        colors={['#111111', '#222222']}
        animate={false}
      />,
    );
    expect((series()[0].lineStyle as Record<string, unknown>).color).toBe('#111111');
    expect((series()[1].itemStyle as Record<string, unknown>).color).toBe('#222222');
  });

  it('resolves a CSS var() color to its computed value', () => {
    document.documentElement.style.setProperty('--combo-test-accent', '#abcdef');
    render(
      <ComboChart
        labels={comboLabels()}
        series={[{ name: 'L', type: 'line', data: [1, 2, 3] }]}
        colors={['var(--combo-test-accent)']}
        animate={false}
      />,
    );
    const lineColor = (series()[0].lineStyle as Record<string, unknown>).color;
    document.documentElement.style.removeProperty('--combo-test-accent');
    expect(lineColor).toBe('#abcdef');
  });
});

/* ------------------------------------------------------------------ */
/*  Input normalization                                                */
/* ------------------------------------------------------------------ */

describe('ComboChart — input normalization', () => {
  it('drops a series with an invalid type', () => {
    render(
      <ComboChart
        labels={comboLabels()}
        series={[
          { name: 'ok', type: 'bar', data: [1, 2, 3] },
          { name: 'bad', type: 'pie' as unknown as ComboSeriesType, data: [4, 5, 6] },
        ]}
        animate={false}
      />,
    );
    expect(series()).toHaveLength(1);
    expect(series()[0].name).toBe('ok');
  });

  it('drops a series whose data is not an array', () => {
    render(
      <ComboChart
        labels={comboLabels()}
        series={[
          { name: 'ok', type: 'line', data: [1, 2, 3] },
          { name: 'bad', type: 'line', data: undefined as unknown as number[] },
        ]}
        animate={false}
      />,
    );
    expect(series()).toHaveLength(1);
    expect(series()[0].name).toBe('ok');
  });

  it('zero-pads a short data array and truncates a long one to labels.length', () => {
    render(
      <ComboChart
        labels={['A', 'B', 'C', 'D']}
        series={[
          { name: 'short', type: 'bar', data: [1, 2] },
          { name: 'long', type: 'line', data: [1, 2, 3, 4, 5, 6] },
        ]}
        animate={false}
      />,
    );
    expect(series()[0].data).toEqual([1, 2, 0, 0]);
    expect(series()[1].data).toEqual([1, 2, 3, 4]);
  });

  it('clamps NaN / Infinity data points to 0', () => {
    render(
      <ComboChart
        labels={['A', 'B', 'C']}
        series={[{ name: 's', type: 'bar', data: [10, Number.NaN, Number.POSITIVE_INFINITY] }]}
        animate={false}
      />,
    );
    expect(series()[0].data).toEqual([10, 0, 0]);
  });

  it('coerces an unknown axis value to primary', () => {
    render(
      <ComboChart
        labels={comboLabels()}
        series={[
          { name: 's', type: 'bar', axis: 'tertiary' as unknown as ComboAxisId, data: [1, 2, 3] },
        ]}
        animate={false}
      />,
    );
    expect(yAxis()).toHaveLength(1);
    expect(series()[0].yAxisIndex).toBe(0);
  });

  it('renders the empty-state without dispatching an option for empty labels or series', () => {
    expect(() =>
      render(<ComboChart labels={[]} series={comboSeries()} animate={false} />),
    ).not.toThrow();
    expect(lastDispatchedOption()).toBeNull();
    render(<ComboChart labels={comboLabels()} series={[]} animate={false} />);
    expect(lastDispatchedOption()).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  Tooltip — axis-routed formatters                                   */
/* ------------------------------------------------------------------ */

describe('ComboChart — tooltip', () => {
  it('routes each tooltip row through its series-axis formatter', () => {
    render(
      <ComboChart
        labels={comboLabels()}
        series={comboSeries()}
        valueFormatter={(v) => `TRY${v}`}
        secondaryValueFormatter={(v) => `${v}kisi`}
        animate={false}
      />,
    );
    const fmt = tooltipFormatter();
    expect(typeof fmt).toBe('function');
    const html = fmt!([
      {
        seriesIndex: 0,
        seriesName: 'Ort. Maaş',
        marker: 'M0',
        value: 43500,
        axisValueLabel: 'Şub',
      },
      { seriesIndex: 1, seriesName: 'Çalışan', marker: 'M1', value: 118 },
    ]);
    expect(html).toContain('TRY43500'); // primary series → valueFormatter
    expect(html).toContain('118kisi'); // secondary series → secondaryValueFormatter
    expect(html).toContain('Şub'); // axis header
  });

  it('HTML-escapes series names and the axis header', () => {
    render(
      <ComboChart
        labels={['<x>']}
        series={[{ name: '<b>L</b>', type: 'line', data: [1] }]}
        animate={false}
      />,
    );
    const fmt = tooltipFormatter();
    const html = fmt!([
      { seriesIndex: 0, seriesName: '<b>L</b>', marker: '', value: 1, axisValueLabel: '<x>' },
    ]);
    expect(html).not.toContain('<b>L</b>');
    expect(html).toContain('&lt;b&gt;');
    expect(html).toContain('&lt;x&gt;');
  });

  it('routes by seriesIndex, not seriesName (duplicate-name safe)', () => {
    render(
      <ComboChart
        labels={['A']}
        series={[
          { name: 'Dup', type: 'line', axis: 'primary', data: [1] },
          { name: 'Dup', type: 'bar', axis: 'secondary', data: [2] },
        ]}
        valueFormatter={(v) => `P${v}`}
        secondaryValueFormatter={(v) => `S${v}`}
        animate={false}
      />,
    );
    const fmt = tooltipFormatter();
    const html = fmt!([
      { seriesIndex: 0, seriesName: 'Dup', marker: '', value: 1 },
      { seriesIndex: 1, seriesName: 'Dup', marker: '', value: 2 },
    ]);
    expect(html).toContain('P1'); // index 0 → primary formatter
    expect(html).toContain('S2'); // index 1 → secondary formatter
  });
});

/* ------------------------------------------------------------------ */
/*  onDataPointClick                                                   */
/* ------------------------------------------------------------------ */

describe('ComboChart — onDataPointClick', () => {
  it('emits label / value + datum carrying seriesName / seriesIndex / dataIndex / axis / type', () => {
    const onClick = vi.fn();
    render(
      <ComboChart
        labels={comboLabels()}
        series={comboSeries()}
        onDataPointClick={onClick}
        animate={false}
      />,
    );
    const handlers = clickListenerRegistrations();
    expect(handlers.length).toBeGreaterThan(0);
    handlers[handlers.length - 1]({
      seriesIndex: 1,
      seriesName: 'Çalışan',
      dataIndex: 2,
      name: 'Mar',
      value: 125,
    });
    expect(onClick).toHaveBeenCalledTimes(1);
    const event = onClick.mock.calls[0][0];
    expect(event.value).toBe(125);
    expect(event.label).toBe('Mar');
    expect(event.datum).toMatchObject({
      seriesName: 'Çalışan',
      seriesIndex: 1,
      dataIndex: 2,
      axis: 'secondary',
      type: 'bar',
      label: 'Mar',
      value: 125,
    });
  });

  it('a markup-overlay click does NOT fire onDataPointClick', () => {
    const onClick = vi.fn();
    render(
      <ComboChart
        labels={comboLabels()}
        series={comboSeries()}
        onDataPointClick={onClick}
        animate={false}
      />,
    );
    const handlers = clickListenerRegistrations();
    handlers[handlers.length - 1]({ componentType: 'markLine', name: 'mk-1' });
    expect(onClick).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/*  A11y SR data table                                                 */
/* ------------------------------------------------------------------ */

describe('ComboChart — a11y SR data table', () => {
  it('renders a hidden SR table with one row per x-axis label', () => {
    const { container } = render(
      <ComboChart
        labels={comboLabels()}
        series={comboSeries()}
        title="12 Aylık Maaş Trendi"
        animate={false}
      />,
    );
    const rows = container.querySelectorAll('table tbody tr');
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  it('the SR table row text formats every series with its own axis formatter', () => {
    const { container } = render(
      <ComboChart
        labels={['Oca']}
        series={[
          { name: 'Maaş', type: 'line', axis: 'primary', data: [42000] },
          { name: 'Kişi', type: 'bar', axis: 'secondary', data: [120] },
        ]}
        valueFormatter={(v) => `TRY${v}`}
        secondaryValueFormatter={(v) => `${v}p`}
        animate={false}
      />,
    );
    const text = container.querySelector('table')?.textContent ?? '';
    expect(text).toContain('TRY42000'); // primary series → valueFormatter
    expect(text).toContain('120p'); // secondary series → secondaryValueFormatter
  });
});
