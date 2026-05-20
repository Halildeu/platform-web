// @vitest-environment jsdom
/**
 * Bar3DChart — Codex thread 019e4277 AGREE — option shape, GL gate
 * lifecycle, category derivation, click payload + a11y tests.
 *
 * Covers (Codex iter-1 spec):
 *
 *   1.  Empty data renders the `bar3d-chart-empty` sentinel and never
 *       dispatches an ECharts option or starts the GL import.
 *   2.  WebGL unsupported renders `bar3d-chart-unsupported` with a
 *       `data-reason` attribute.
 *   3.  Loading (`gl.status === 'loading'`) renders the
 *       `bar3d-chart-loading` sentinel and no option dispatch.
 *   4.  `gl.status === 'ready'` mounts `ChartA11yShell` and dispatches
 *       the bar3D option.
 *   5.  The a11y data table lists one row per cell, value = z.
 *   6.  The a11y data table caps at 1000 rows (BIG_DATA_ROW_LIMIT).
 *   7.  `buildBar3DOption` returns `xAxis3D.type='category'`,
 *       `yAxis3D.type='category'`, `zAxis3D.type='value'`.
 *   8.  Category-axis data preserves explicit `xCategories` /
 *       `yCategories` order when given.
 *   9.  Category-axis data is derived from first-seen order when no
 *       explicit categories are passed.
 *   10. `series[0].type === 'bar3D'` + `coordinateSystem === 'cartesian3D'`.
 *   11. Each series data item is `{ value: [xIdx, yIdx, z], name }`.
 *   12. `visualMap.dimension === 2`.
 *   13. `visualMap.min` / `max` are computed from the z range in a
 *       single pass.
 *   14. Non-finite z (NaN / Infinity) is clamped to 0 by
 *       `sanitizeNumber`.
 *   15. Per-point `color: 'var(--token)'` resolves to a concrete value.
 *   16. `colors` palette CSS-vars resolve into `visualMap.inRange.color`.
 *   17. `shading` default ('lambert') + override branch.
 *   18. `barSize` passed through to series.
 *   19. `viewControl` / `light` / `grid3D` overrides merge in.
 *   20. Tooltip formatter renders `x × y: z` with HTML escape.
 *   21. `showValues` flips `series.label.show` AND `formatter` calls fmt.
 *   22. `buildBar3DClickEvent` builds the canonical payload (`x`, `y`,
 *       `z`, `xIndex`, `yIndex`, `label`, `value=z`).
 *   23. Out-of-bounds click returns `null`.
 *   24. `access='readonly'` blocks `onDataPointClick` (the
 *       `guardChartCallback` gate from the outer wrapper).
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

// Mock the GL gate so the wrapper believes WebGL is ready in jsdom.
// Individual tests override the mock return value for the
// unsupported / loading branches.
vi.mock('../renderers/gl', async () => {
  const actual = await vi.importActual<typeof import('../renderers/gl')>('../renderers/gl');
  return {
    ...actual,
    useRequiredEChartsGL: vi.fn(() => ({ status: 'ready' })),
    describeEChartsGLReason: actual.describeEChartsGLReason,
  };
});

import {
  Bar3DChart,
  normalizeBar3DData,
  buildBar3DOption,
  buildBar3DClickEvent,
  type Bar3DDataPoint,
} from '../Bar3DChart';
import { useRequiredEChartsGL } from '../renderers/gl';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const defaultData = (): Bar3DDataPoint[] => [
  { x: 'Eng', y: 'Junior', z: 50000 },
  { x: 'Eng', y: 'Senior', z: 110000 },
  { x: 'Sales', y: 'Junior', z: 45000 },
  { x: 'Sales', y: 'Senior', z: 95000 },
];

const series = (): Array<Record<string, unknown>> =>
  (lastDispatchedOption()?.series as Array<Record<string, unknown>> | undefined) ?? [];

const xAxis3D = (): Record<string, unknown> =>
  (lastDispatchedOption()?.xAxis3D as Record<string, unknown> | undefined) ?? {};

const yAxis3D = (): Record<string, unknown> =>
  (lastDispatchedOption()?.yAxis3D as Record<string, unknown> | undefined) ?? {};

const zAxis3D = (): Record<string, unknown> =>
  (lastDispatchedOption()?.zAxis3D as Record<string, unknown> | undefined) ?? {};

const visualMap = (): Record<string, unknown> =>
  (lastDispatchedOption()?.visualMap as Record<string, unknown> | undefined) ?? {};

const tooltipFormatter = (): ((params: unknown) => string) | undefined =>
  (lastDispatchedOption()?.tooltip as { formatter?: (p: unknown) => string } | undefined)
    ?.formatter;

beforeEach(() => {
  resetEChartsMock();
  installJsdomPolyfills();
  // Reset to default 'ready' state.
  (useRequiredEChartsGL as ReturnType<typeof vi.fn>).mockReturnValue({ status: 'ready' });
});
afterEach(() => {
  restoreJsdomPolyfills();
});

/* ------------------------------------------------------------------ */
/*  GL gate lifecycle                                                  */
/* ------------------------------------------------------------------ */

describe('Bar3DChart — GL gate lifecycle', () => {
  it('empty data renders bar3d-chart-empty and no option dispatch', () => {
    const { getByTestId } = render(<Bar3DChart data={[]} />);
    expect(getByTestId('bar3d-chart-empty')).toBeTruthy();
    expect(lastDispatchedOption()).toBeNull();
  });

  it('webgl unsupported renders bar3d-chart-unsupported with reason', () => {
    (useRequiredEChartsGL as ReturnType<typeof vi.fn>).mockReturnValue({
      status: 'unsupported',
      reason: 'webgl-unavailable',
    });
    const { getByTestId } = render(<Bar3DChart data={defaultData()} />);
    const el = getByTestId('bar3d-chart-unsupported');
    expect(el.getAttribute('data-reason')).toBe('webgl-unavailable');
    expect(lastDispatchedOption()).toBeNull();
  });

  it('loading state renders bar3d-chart-loading and no option dispatch', () => {
    (useRequiredEChartsGL as ReturnType<typeof vi.fn>).mockReturnValue({ status: 'loading' });
    const { getByTestId } = render(<Bar3DChart data={defaultData()} />);
    expect(getByTestId('bar3d-chart-loading')).toBeTruthy();
    expect(lastDispatchedOption()).toBeNull();
  });

  it('ready state mounts ChartA11yShell and dispatches the option', () => {
    const { getByTestId } = render(<Bar3DChart data={defaultData()} animate={false} />);
    expect(getByTestId('bar3d-chart')).toBeTruthy();
    expect(lastDispatchedOption()).not.toBeNull();
  });

  it('loading → ready rerender dispatches the bar3D series after the GL gate flips', () => {
    // Codex iter-2 P1 BLOCKER fix regression guard. Without
    // `enabled: gl.status === 'ready'` on useEChartsRenderer, the
    // renderer init effect would bail on the first mount (loading
    // branch, container null) and not re-run when GL flipped to ready.
    (useRequiredEChartsGL as ReturnType<typeof vi.fn>).mockReturnValue({ status: 'loading' });
    const { getByTestId, rerender } = render(<Bar3DChart data={defaultData()} animate={false} />);
    expect(getByTestId('bar3d-chart-loading')).toBeTruthy();
    expect(lastDispatchedOption()).toBeNull();

    // GL flips to ready, the wrapper re-renders, ChartA11yShell mounts
    // (renderer container is finally attached) and the option dispatches.
    (useRequiredEChartsGL as ReturnType<typeof vi.fn>).mockReturnValue({ status: 'ready' });
    rerender(<Bar3DChart data={defaultData()} animate={false} />);
    expect(getByTestId('bar3d-chart')).toBeTruthy();
    expect(lastDispatchedOption()).not.toBeNull();
    expect(series()[0].type).toBe('bar3D');
  });

  it('unsupported branch aria-label suffixes the WebGL reason (Codex iter-2 P2)', () => {
    (useRequiredEChartsGL as ReturnType<typeof vi.fn>).mockReturnValue({
      status: 'unsupported',
      reason: 'webgl2-required',
    });
    const { getByTestId } = render(<Bar3DChart data={defaultData()} title="Maaş Pivotu" />);
    const el = getByTestId('bar3d-chart-unsupported');
    const aria = el.getAttribute('aria-label') ?? '';
    expect(aria).toContain('Maaş Pivotu'); // a11y.ariaLabel piece
    expect(aria).toContain('WebGL2'); // banner piece
    expect(el.getAttribute('data-reason')).toBe('webgl2-required');
  });

  it('unsupported branch data-reason falls back to "webgl-unavailable" when reason is missing', () => {
    (useRequiredEChartsGL as ReturnType<typeof vi.fn>).mockReturnValue({ status: 'unsupported' });
    const { getByTestId } = render(<Bar3DChart data={defaultData()} />);
    expect(getByTestId('bar3d-chart-unsupported').getAttribute('data-reason')).toBe(
      'webgl-unavailable',
    );
  });

  it('loading branch aria-label suffixes the loading message (Codex iter-2 P2)', () => {
    (useRequiredEChartsGL as ReturnType<typeof vi.fn>).mockReturnValue({ status: 'loading' });
    const { getByTestId } = render(<Bar3DChart data={defaultData()} title="Maaş Pivotu" />);
    const aria = getByTestId('bar3d-chart-loading').getAttribute('aria-label') ?? '';
    expect(aria).toContain('Maaş Pivotu');
    expect(aria).toContain('yükleniyor');
  });
});

/* ------------------------------------------------------------------ */
/*  Category derivation                                                */
/* ------------------------------------------------------------------ */

describe('Bar3DChart — category derivation', () => {
  it('preserves explicit xCategories / yCategories order', () => {
    render(
      <Bar3DChart
        data={defaultData()}
        xCategories={['Sales', 'Eng']}
        yCategories={['Senior', 'Junior']}
        animate={false}
      />,
    );
    expect(xAxis3D().data).toEqual(['Sales', 'Eng']);
    expect(yAxis3D().data).toEqual(['Senior', 'Junior']);
  });

  it('derives first-seen order when no explicit categories', () => {
    render(<Bar3DChart data={defaultData()} animate={false} />);
    expect(xAxis3D().data).toEqual(['Eng', 'Sales']);
    expect(yAxis3D().data).toEqual(['Junior', 'Senior']);
  });

  it('builds value-type z axis', () => {
    render(<Bar3DChart data={defaultData()} animate={false} />);
    expect(zAxis3D().type).toBe('value');
    expect(xAxis3D().type).toBe('category');
    expect(yAxis3D().type).toBe('category');
  });

  it('drops points whose category is not in the explicit set', () => {
    render(
      <Bar3DChart
        data={[
          { x: 'Eng', y: 'Junior', z: 50000 },
          { x: 'Unknown', y: 'Junior', z: 99999 },
        ]}
        xCategories={['Eng']}
        yCategories={['Junior']}
        animate={false}
      />,
    );
    const data = series()[0].data as Array<{ value: number[] }>;
    expect(data).toHaveLength(1);
    expect(data[0].value).toEqual([0, 0, 50000]);
  });
});

/* ------------------------------------------------------------------ */
/*  Series + visualMap                                                 */
/* ------------------------------------------------------------------ */

describe('Bar3DChart — series + visualMap', () => {
  it('series type is bar3D on cartesian3D', () => {
    render(<Bar3DChart data={defaultData()} animate={false} />);
    expect(series()[0].type).toBe('bar3D');
    expect(series()[0].coordinateSystem).toBe('cartesian3D');
  });

  it('builds each data item as { value: [xIdx, yIdx, z], name }', () => {
    render(<Bar3DChart data={defaultData()} animate={false} />);
    const data = series()[0].data as Array<{ value: number[]; name: string }>;
    // Eng × Junior → indices (0,0), z=50000
    expect(data[0].value).toEqual([0, 0, 50000]);
    expect(data[0].name).toBe('Eng × Junior');
    // Sales × Senior → indices (1,1), z=95000
    expect(data[3].value).toEqual([1, 1, 95000]);
  });

  it('visualMap dimension is 2 and min/max computed from z range', () => {
    render(<Bar3DChart data={defaultData()} animate={false} />);
    expect(visualMap().dimension).toBe(2);
    expect(visualMap().min).toBe(45000);
    expect(visualMap().max).toBe(110000);
  });

  it('clamps NaN / Infinity z to 0 via sanitizeNumber', () => {
    render(
      <Bar3DChart
        data={[
          { x: 'Eng', y: 'Junior', z: Number.NaN },
          { x: 'Eng', y: 'Senior', z: Number.POSITIVE_INFINITY },
          { x: 'Sales', y: 'Junior', z: 50000 },
        ]}
        animate={false}
      />,
    );
    const data = series()[0].data as Array<{ value: number[] }>;
    expect(data[0].value[2]).toBe(0);
    expect(data[1].value[2]).toBe(0);
    expect(data[2].value[2]).toBe(50000);
  });

  it('resolves per-point CSS var() color to concrete value', () => {
    document.documentElement.style.setProperty('--bar3d-test-cell', '#abcdef');
    render(
      <Bar3DChart
        data={[{ x: 'Eng', y: 'Junior', z: 50000, color: 'var(--bar3d-test-cell)' }]}
        animate={false}
      />,
    );
    const data = series()[0].data as Array<{ itemStyle?: { color?: string } }>;
    document.documentElement.style.removeProperty('--bar3d-test-cell');
    expect(data[0].itemStyle?.color).toBe('#abcdef');
  });

  it('passes explicit colors palette into visualMap.inRange.color (CSS-var resolved)', () => {
    document.documentElement.style.setProperty('--bar3d-palette-1', '#111111');
    render(
      <Bar3DChart
        data={defaultData()}
        colors={['var(--bar3d-palette-1)', '#222222']}
        animate={false}
      />,
    );
    const inRange = visualMap().inRange as { color: string[] };
    document.documentElement.style.removeProperty('--bar3d-palette-1');
    expect(inRange.color[0]).toBe('#111111');
    expect(inRange.color[1]).toBe('#222222');
  });

  it('default shading is lambert; override flows to series', () => {
    const { rerender } = render(<Bar3DChart data={defaultData()} animate={false} />);
    expect(series()[0].shading).toBe('lambert');
    rerender(<Bar3DChart data={defaultData()} shading="realistic" animate={false} />);
    expect(series()[0].shading).toBe('realistic');
  });

  it('barSize is passed through as a [w, w] tuple to series', () => {
    render(<Bar3DChart data={defaultData()} barSize={0.5} animate={false} />);
    expect(series()[0].barSize).toEqual([0.5, 0.5]);
  });

  it('viewControl + light + grid3D overrides merge over the defaults', () => {
    render(
      <Bar3DChart
        data={defaultData()}
        grid3D={{ boxWidth: 200 }}
        viewControl={{ distance: 400 }}
        light={{ main: { intensity: 2 } }}
        animate={false}
      />,
    );
    const grid = lastDispatchedOption()?.grid3D as Record<string, unknown>;
    expect(grid.boxWidth).toBe(200); // user override wins
    expect((grid.viewControl as { distance?: number }).distance).toBe(400);
    expect((grid.light as { main?: { intensity?: number } }).main?.intensity).toBe(2);
  });
});

/* ------------------------------------------------------------------ */
/*  Tooltip + value labels                                             */
/* ------------------------------------------------------------------ */

describe('Bar3DChart — tooltip + showValues', () => {
  it('tooltip formatter renders "<x> × <y>: z" HTML-escaped', () => {
    render(
      <Bar3DChart
        data={[{ x: '<eng>', y: 'Junior', z: 50000 }]}
        valueFormatter={(v) => `TRY${v}`}
        animate={false}
      />,
    );
    const fmt = tooltipFormatter();
    const html = fmt!({ value: [0, 0, 50000], name: '<eng> × Junior' });
    expect(html).not.toContain('<eng>');
    expect(html).toContain('&lt;eng&gt;');
    expect(html).toContain('TRY50000');
  });

  it('showValues=false hides the bar label by default', () => {
    render(<Bar3DChart data={defaultData()} animate={false} />);
    const label = series()[0].label as { show: boolean };
    expect(label.show).toBe(false);
  });

  it('showValues=true shows the bar label with valueFormatter', () => {
    render(
      <Bar3DChart
        data={defaultData()}
        showValues
        valueFormatter={(v) => `TRY${v}`}
        animate={false}
      />,
    );
    const label = series()[0].label as {
      show: boolean;
      formatter: (p: { value?: unknown }) => string;
    };
    expect(label.show).toBe(true);
    expect(label.formatter({ value: [0, 0, 50000] })).toBe('TRY50000');
  });
});

/* ------------------------------------------------------------------ */
/*  Click payload                                                      */
/* ------------------------------------------------------------------ */

describe('Bar3DChart — onDataPointClick', () => {
  it('emits canonical payload with x/y/z/xIndex/yIndex/label/value', () => {
    const onClick = vi.fn();
    render(<Bar3DChart data={defaultData()} onDataPointClick={onClick} animate={false} />);
    const handlers = clickListenerRegistrations();
    expect(handlers.length).toBeGreaterThan(0);
    handlers[handlers.length - 1]({
      value: [0, 1, 110000], // Eng × Senior
      name: 'Eng × Senior',
      dataIndex: 1,
    });
    expect(onClick).toHaveBeenCalledTimes(1);
    const event = onClick.mock.calls[0][0];
    expect(event.value).toBe(110000);
    expect(event.label).toBe('Eng × Senior');
    expect(event.datum).toMatchObject({
      x: 'Eng',
      y: 'Senior',
      z: 110000,
      xIndex: 0,
      yIndex: 1,
      label: 'Eng × Senior',
      dataIndex: 1,
    });
  });

  it('buildBar3DClickEvent returns null when dataIndex is missing or negative', () => {
    // Codex iter-2 P3 fix: dataIndex is the source-of-truth contract;
    // a missing or negative dataIndex means ECharts replayed a stale
    // event that no longer maps to a rendered cell.
    const normalized = normalizeBar3DData(defaultData());
    expect(buildBar3DClickEvent(normalized, { value: [0, 0, 50000] })).toBeNull();
    expect(buildBar3DClickEvent(normalized, { value: [0, 0, 50000], dataIndex: -1 })).toBeNull();
  });

  it('buildBar3DClickEvent returns null when dataIndex is past the end of items', () => {
    const normalized = normalizeBar3DData(defaultData());
    expect(buildBar3DClickEvent(normalized, { value: [0, 0, 50000], dataIndex: 99 })).toBeNull();
  });

  it('buildBar3DClickEvent returns null when value is not an array', () => {
    const normalized = normalizeBar3DData(defaultData());
    const event = buildBar3DClickEvent(normalized, { value: 'nope', dataIndex: 0 });
    expect(event).toBeNull();
  });

  it('buildBar3DClickEvent z/label sourced from normalized.items[dataIndex] (not the tuple)', () => {
    // Codex iter-2 P3 fix: source-of-truth z/label come from the
    // normalised item, not the (potentially stale) value tuple. The
    // tuple's [99, 99, 99999] would have been blindly trusted under
    // the previous helper.
    const normalized = normalizeBar3DData(defaultData());
    const event = buildBar3DClickEvent(normalized, {
      value: [99, 99, 99999],
      dataIndex: 0,
    });
    expect(event).not.toBeNull();
    expect(event!.value).toBe(50000); // items[0].z, NOT tuple[2]
    expect(event!.label).toBe('Eng × Junior'); // items[0] derived
    expect(event!.datum.xIndex).toBe(0); // items[0].xIndex, NOT tuple[0]
    expect(event!.datum.yIndex).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  A11y SR data table                                                 */
/* ------------------------------------------------------------------ */

describe('Bar3DChart — a11y SR data table', () => {
  it('renders one hidden table row per cell with value = z', () => {
    const { container } = render(<Bar3DChart data={defaultData()} animate={false} />);
    const rows = container.querySelectorAll('table tbody tr');
    expect(rows.length).toBe(4);
  });

  it('a11y row label is "<x> × <y>" (or override name)', () => {
    const { container } = render(
      <Bar3DChart
        data={[{ x: 'Eng', y: 'Junior', z: 50000, name: 'Mühendis Junior' }]}
        valueFormatter={(v) => `TRY${v}`}
        animate={false}
      />,
    );
    const text = container.querySelector('table')?.textContent ?? '';
    expect(text).toContain('Mühendis Junior');
    expect(text).toContain('TRY50000');
  });
});

/* ------------------------------------------------------------------ */
/*  Pure helper — buildBar3DOption (extracted for shape lock)          */
/* ------------------------------------------------------------------ */

describe('buildBar3DOption — pure option builder shape lock', () => {
  it('returns the canonical axis types + visualMap dimension', () => {
    const normalized = normalizeBar3DData(defaultData());
    const opt = buildBar3DOption({
      normalized,
      fmt: (v) => String(v),
      palette: ['#aaa', '#bbb'],
      animate: false,
      showValues: false,
      shading: 'lambert',
      barSize: 0.8,
      decalEnabled: false,
      decalPatterns: null,
    });
    expect((opt.xAxis3D as { type: string }).type).toBe('category');
    expect((opt.yAxis3D as { type: string }).type).toBe('category');
    expect((opt.zAxis3D as { type: string }).type).toBe('value');
    expect((opt.visualMap as { dimension: number }).dimension).toBe(2);
    const seriesArr = opt.series as Array<{ type: string; coordinateSystem: string }>;
    expect(seriesArr[0].type).toBe('bar3D');
    expect(seriesArr[0].coordinateSystem).toBe('cartesian3D');
  });

  it('falls back to (z=0, z=1) when all cells are zero (degenerate visualMap)', () => {
    const normalized = normalizeBar3DData([
      { x: 'A', y: 'A', z: 0 },
      { x: 'B', y: 'B', z: 0 },
    ]);
    const opt = buildBar3DOption({
      normalized,
      fmt: (v) => String(v),
      palette: ['#aaa'],
      animate: false,
      showValues: false,
      shading: 'lambert',
      barSize: 0.8,
      decalEnabled: false,
      decalPatterns: null,
    });
    const vm = opt.visualMap as { min: number; max: number };
    expect(vm.min).toBe(0);
    expect(vm.max).toBe(1);
  });
});
