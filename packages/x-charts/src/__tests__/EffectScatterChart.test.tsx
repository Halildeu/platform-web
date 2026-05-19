// @vitest-environment jsdom
/**
 * EffectScatterChart — Codex thread 019e425b AGREE — option shape, ripple
 * defaults + override, symbolSize routing, reduced-motion suppression,
 * click payload, markup early-return, and a11y SR table tests.
 *
 * Covers:
 *   (a) series.type === 'effectScatter' + coordinateSystem 'cartesian2d'
 *   (b) x/y value axes, xLabel / yLabel, showGrid splitLine toggle
 *   (c) data normalization — NaN / Infinity clamped, missing size omitted,
 *       empty data → no option dispatch
 *   (d) data point shape: `{ value: [x, y, size?], name }`, palette + per-
 *       point color resolution (CSS var → concrete)
 *   (e) symbolSize routing — number, function, default `point.size ?? 12`
 *   (f) ripple defaults — period=4 / scale=2.5 / brushType='stroke';
 *       caller overrides merge per field; CSS-var resolution on
 *       `effect.color`; `prefers-reduced-motion: reduce` AND
 *       `animate={false}` independently zero the ripple
 *   (g) showEffectOn 'render' (default) + 'emphasis' branch
 *   (h) tooltip formatter — `(x, y)` + optional `— name`, HTML-escaped
 *   (i) click payload — `{ x, y, size, name, label, dataIndex }`,
 *       `value=y`, `label=name`; markup overlay click does NOT fire
 *       `onDataPointClick`
 *   (j) a11y SR data table — one row per point, value column is y
 *
 * EffectScatter renders a single `effectScatter` series on a standard
 * cartesian grid — no lazy ECharts feature registration needed
 * (ScatterChart pattern minus the renderer router / WebGL gate).
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

import { EffectScatterChart, type EffectScatterDataPoint } from '../EffectScatterChart';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const defaultData = (): EffectScatterDataPoint[] => [
  { x: 10, y: 20, name: 'Alpha' },
  { x: 30, y: 40, name: 'Beta' },
  { x: 50, y: 60, name: 'Gamma' },
];

const series = (): Array<Record<string, unknown>> =>
  (lastDispatchedOption()?.series as Array<Record<string, unknown>> | undefined) ?? [];

const xAxis = (): Record<string, unknown> =>
  (lastDispatchedOption()?.xAxis as Record<string, unknown> | undefined) ?? {};

const yAxis = (): Record<string, unknown> =>
  (lastDispatchedOption()?.yAxis as Record<string, unknown> | undefined) ?? {};

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
/*  Option shape — effectScatter series, cartesian2d, value axes       */
/* ------------------------------------------------------------------ */

describe('EffectScatterChart — option shape', () => {
  it('renders a single effectScatter series on coordinateSystem cartesian2d', () => {
    render(<EffectScatterChart data={defaultData()} animate={false} />);
    expect(series()).toHaveLength(1);
    expect(series()[0].type).toBe('effectScatter');
    expect(series()[0].coordinateSystem).toBe('cartesian2d');
  });

  it('builds value-type x and y axes', () => {
    render(<EffectScatterChart data={defaultData()} animate={false} />);
    expect(xAxis().type).toBe('value');
    expect(yAxis().type).toBe('value');
  });

  it('forwards xLabel and yLabel to the axis name', () => {
    render(
      <EffectScatterChart
        data={defaultData()}
        xLabel="Maaş aralığı"
        yLabel="Departman ortalaması"
        animate={false}
      />,
    );
    expect(xAxis().name).toBe('Maaş aralığı');
    expect(yAxis().name).toBe('Departman ortalaması');
  });

  it('toggles splitLine.show with showGrid', () => {
    render(<EffectScatterChart data={defaultData()} showGrid={false} animate={false} />);
    expect((xAxis().splitLine as Record<string, unknown>).show).toBe(false);
    expect((yAxis().splitLine as Record<string, unknown>).show).toBe(false);
  });

  it('formats axis labels through valueFormatter', () => {
    render(
      <EffectScatterChart data={defaultData()} valueFormatter={(v) => `TRY${v}`} animate={false} />,
    );
    const xFmt = (xAxis().axisLabel as { formatter: (v: number) => string }).formatter;
    const yFmt = (yAxis().axisLabel as { formatter: (v: number) => string }).formatter;
    expect(xFmt(10)).toBe('TRY10');
    expect(yFmt(10)).toBe('TRY10');
  });

  it('drives series.itemStyle.color from the first explicit color', () => {
    render(<EffectScatterChart data={defaultData()} colors={['#abcdef']} animate={false} />);
    expect((series()[0].itemStyle as Record<string, unknown>).color).toBe('#abcdef');
  });

  it('resolves a CSS var() color to its computed value', () => {
    document.documentElement.style.setProperty('--effect-test-accent', '#abcdef');
    render(
      <EffectScatterChart
        data={defaultData()}
        colors={['var(--effect-test-accent)']}
        animate={false}
      />,
    );
    const itemColor = (series()[0].itemStyle as Record<string, unknown>).color;
    document.documentElement.style.removeProperty('--effect-test-accent');
    expect(itemColor).toBe('#abcdef');
  });

  it('builds each data item as { value: [x, y, size?], name }', () => {
    render(
      <EffectScatterChart
        data={[
          { x: 5, y: 10, name: 'A' },
          { x: 7, y: 14, size: 32, name: 'B' },
        ]}
        animate={false}
      />,
    );
    const data = series()[0].data as Array<{ value: number[]; name: string }>;
    expect(data[0].value).toEqual([5, 10]);
    expect(data[0].name).toBe('A');
    expect(data[1].value).toEqual([7, 14, 32]);
    expect(data[1].name).toBe('B');
  });
});

/* ------------------------------------------------------------------ */
/*  Input normalization                                                */
/* ------------------------------------------------------------------ */

describe('EffectScatterChart — input normalization', () => {
  it('clamps NaN / Infinity x and y to 0 via sanitizeNumber', () => {
    render(
      <EffectScatterChart
        data={[
          { x: Number.NaN, y: 10, name: 'bad-x' },
          { x: 5, y: Number.POSITIVE_INFINITY, name: 'bad-y' },
        ]}
        animate={false}
      />,
    );
    const data = series()[0].data as Array<{ value: number[] }>;
    expect(data[0].value[0]).toBe(0);
    expect(data[1].value[1]).toBe(0);
  });

  it('omits the size element from value when not provided', () => {
    render(<EffectScatterChart data={[{ x: 1, y: 2 }]} animate={false} />);
    const data = series()[0].data as Array<{ value: number[] }>;
    expect(data[0].value).toHaveLength(2);
  });

  it('renders the empty-state without dispatching an option for empty data', () => {
    expect(() => render(<EffectScatterChart data={[]} animate={false} />)).not.toThrow();
    expect(lastDispatchedOption()).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  symbolSize routing                                                 */
/* ------------------------------------------------------------------ */

describe('EffectScatterChart — symbolSize', () => {
  it('passes a constant number through unchanged', () => {
    render(<EffectScatterChart data={defaultData()} symbolSize={24} animate={false} />);
    expect(series()[0].symbolSize).toBe(24);
  });

  it('wraps a function so it receives a reconstructed point', () => {
    const fn = vi.fn((p: EffectScatterDataPoint) => (p.size ?? 0) * 2 + 4);
    render(
      <EffectScatterChart
        data={[
          { x: 1, y: 1, size: 10, name: 'A' },
          { x: 2, y: 2, size: 20, name: 'B' },
        ]}
        symbolSize={fn}
        animate={false}
      />,
    );
    const wrapped = series()[0].symbolSize as (
      val: number[],
      params: { dataIndex: number },
    ) => number;
    expect(typeof wrapped).toBe('function');
    expect(wrapped([1, 1, 10], { dataIndex: 0 })).toBe(24);
    expect(wrapped([2, 2, 20], { dataIndex: 1 })).toBe(44);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('falls back to point.size when symbolSize is omitted', () => {
    render(<EffectScatterChart data={[{ x: 1, y: 1, size: 18, name: 'A' }]} animate={false} />);
    const fn = series()[0].symbolSize as (val: number[]) => number;
    expect(typeof fn).toBe('function');
    expect(fn([1, 1, 18])).toBe(18);
  });

  it('falls back to 12 px when neither symbolSize nor point.size is provided', () => {
    render(<EffectScatterChart data={[{ x: 1, y: 1, name: 'A' }]} animate={false} />);
    const fn = series()[0].symbolSize as (val: number[]) => number;
    expect(typeof fn).toBe('function');
    expect(fn([1, 1])).toBe(12);
  });
});

/* ------------------------------------------------------------------ */
/*  Ripple defaults + override + reduced motion                        */
/* ------------------------------------------------------------------ */

describe('EffectScatterChart — rippleEffect', () => {
  it('applies sensible defaults (scale=2.5, period=4, brushType=stroke)', () => {
    render(<EffectScatterChart data={defaultData()} animate />);
    const ripple = series()[0].rippleEffect as Record<string, unknown>;
    expect(ripple.scale).toBe(2.5);
    expect(ripple.period).toBe(4);
    expect(ripple.brushType).toBe('stroke');
  });

  it('merges per-field overrides without dropping the rest', () => {
    render(
      <EffectScatterChart data={defaultData()} animate effect={{ scale: 5, brushType: 'fill' }} />,
    );
    const ripple = series()[0].rippleEffect as Record<string, unknown>;
    expect(ripple.scale).toBe(5);
    expect(ripple.brushType).toBe('fill');
    expect(ripple.period).toBe(4); // default preserved
  });

  it('resolves a CSS var() in effect.color', () => {
    document.documentElement.style.setProperty('--ripple-tone', '#112233');
    render(
      <EffectScatterChart data={defaultData()} animate effect={{ color: 'var(--ripple-tone)' }} />,
    );
    const ripple = series()[0].rippleEffect as Record<string, unknown>;
    document.documentElement.style.removeProperty('--ripple-tone');
    expect(ripple.color).toBe('#112233');
  });

  it('zeroes the ripple number when animate is false', () => {
    render(<EffectScatterChart data={defaultData()} animate={false} />);
    const ripple = series()[0].rippleEffect as Record<string, unknown>;
    expect(ripple.number).toBe(0);
  });

  it('zeroes the ripple number when prefers-reduced-motion: reduce matches', () => {
    const original = window.matchMedia;
    // Codex iter-1 Risk 2: matchMedia('(prefers-reduced-motion: reduce)')
    // should suppress the ripple even when animate={true} — vestibular
    // safety lives BELOW the top-level animation switch.
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as typeof window.matchMedia;
    try {
      render(<EffectScatterChart data={defaultData()} animate />);
      const ripple = series()[0].rippleEffect as Record<string, unknown>;
      expect(ripple.number).toBe(0);
    } finally {
      window.matchMedia = original;
    }
  });

  it('honours showEffectOn render default', () => {
    render(<EffectScatterChart data={defaultData()} animate />);
    expect(series()[0].showEffectOn).toBe('render');
  });

  it('forwards showEffectOn="emphasis"', () => {
    render(<EffectScatterChart data={defaultData()} showEffectOn="emphasis" animate />);
    expect(series()[0].showEffectOn).toBe('emphasis');
  });
});

/* ------------------------------------------------------------------ */
/*  Tooltip                                                            */
/* ------------------------------------------------------------------ */

describe('EffectScatterChart — tooltip', () => {
  it('formats a point as (x, y) — name when explicit', () => {
    render(<EffectScatterChart data={defaultData()} animate={false} />);
    const fmt = tooltipFormatter();
    expect(typeof fmt).toBe('function');
    const html = fmt!({ value: [10, 20], name: 'Alpha' });
    expect(html).toContain('(10, 20)');
    expect(html).toContain('Alpha');
  });

  it('HTML-escapes name and value pieces', () => {
    render(<EffectScatterChart data={[{ x: 1, y: 2, name: '<x>' }]} animate={false} />);
    const fmt = tooltipFormatter();
    const html = fmt!({ value: [1, 2], name: '<x>' });
    expect(html).not.toContain('<x>');
    expect(html).toContain('&lt;x&gt;');
  });

  it('omits the trailing label when the point name was a synthetic Point N placeholder', () => {
    render(<EffectScatterChart data={[{ x: 1, y: 2 }]} animate={false} />);
    const fmt = tooltipFormatter();
    const html = fmt!({ value: [1, 2], name: 'Point 1' });
    expect(html).toBe('(1, 2)');
  });
});

/* ------------------------------------------------------------------ */
/*  onDataPointClick                                                   */
/* ------------------------------------------------------------------ */

describe('EffectScatterChart — onDataPointClick', () => {
  it('emits label / value + datum carrying x / y / size / name / dataIndex', () => {
    const onClick = vi.fn();
    render(
      <EffectScatterChart
        data={[{ x: 5, y: 10, size: 22, name: 'Alpha' }]}
        onDataPointClick={onClick}
        animate={false}
      />,
    );
    const handlers = clickListenerRegistrations();
    expect(handlers.length).toBeGreaterThan(0);
    handlers[handlers.length - 1]({
      seriesIndex: 0,
      dataIndex: 0,
      name: 'Alpha',
      value: [5, 10, 22],
    });
    expect(onClick).toHaveBeenCalledTimes(1);
    const event = onClick.mock.calls[0][0];
    expect(event.value).toBe(10);
    expect(event.label).toBe('Alpha');
    expect(event.datum).toMatchObject({
      x: 5,
      y: 10,
      size: 22,
      name: 'Alpha',
      label: 'Alpha',
      dataIndex: 0,
    });
  });

  it('falls back the label to a coordinate string when the point name is a Point N placeholder', () => {
    const onClick = vi.fn();
    render(
      <EffectScatterChart data={[{ x: 5, y: 10 }]} onDataPointClick={onClick} animate={false} />,
    );
    const handlers = clickListenerRegistrations();
    handlers[handlers.length - 1]({
      seriesIndex: 0,
      dataIndex: 0,
      name: 'Point 1',
      value: [5, 10],
    });
    expect(onClick).toHaveBeenCalledTimes(1);
    const event = onClick.mock.calls[0][0];
    expect(event.label).toBe('(5, 10)');
    expect(event.datum.name).toBeUndefined();
  });

  it('a markup-overlay click does NOT fire onDataPointClick', () => {
    const onClick = vi.fn();
    render(<EffectScatterChart data={defaultData()} onDataPointClick={onClick} animate={false} />);
    const handlers = clickListenerRegistrations();
    handlers[handlers.length - 1]({ componentType: 'markLine', name: 'mk-1' });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('onMarkupClick payload chartType is "effectScatter" (wrapper identity, not adapter mode)', () => {
    const onMarkup = vi.fn();
    // Provide a real markup so the wrapper's markupLookup resolves the
    // ECharts click event back to the markup payload. Without this the
    // early-return branch hits the `if (markup)` guard and skips the
    // callback — exactly what the previous test exercises.
    render(
      <EffectScatterChart
        data={defaultData()}
        markups={[
          {
            id: 'eff-mk-1',
            type: 'line',
            axis: 'x',
            value: 25,
          },
        ]}
        onMarkupClick={onMarkup}
        animate={false}
      />,
    );
    const handlers = clickListenerRegistrations();
    handlers[handlers.length - 1]({
      componentType: 'markLine',
      name: 'eff-mk-1',
      seriesIndex: 0,
      dataIndex: undefined,
    });
    expect(onMarkup).toHaveBeenCalledTimes(1);
    // Codex iter-2 fix: payload `chartType` carries the wrapper identity
    // (EffectScatter), not the adapter support-matrix mode ('scatter').
    expect(onMarkup.mock.calls[0][0]).toMatchObject({
      chartType: 'effectScatter',
      markup: expect.objectContaining({ id: 'eff-mk-1' }),
    });
  });
});

/* ------------------------------------------------------------------ */
/*  A11y SR data table                                                 */
/* ------------------------------------------------------------------ */

describe('EffectScatterChart — a11y SR data table', () => {
  it('renders a hidden SR table with one row per data point', () => {
    const { container } = render(
      <EffectScatterChart
        data={defaultData()}
        title="Departman maaş outlier'ları"
        animate={false}
      />,
    );
    const rows = container.querySelectorAll('table tbody tr');
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  it('uses the point name as the row label and y as the value', () => {
    const { container } = render(
      <EffectScatterChart
        data={[{ x: 1, y: 100000, name: 'Mühendislik' }]}
        valueFormatter={(v) => `TRY${v}`}
        animate={false}
      />,
    );
    const text = container.querySelector('table')?.textContent ?? '';
    expect(text).toContain('Mühendislik');
    expect(text).toContain('TRY100000');
  });
});
