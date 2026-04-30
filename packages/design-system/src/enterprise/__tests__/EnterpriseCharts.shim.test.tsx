// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

/* ------------------------------------------------------------------ */
/*  Mock @mfe/x-charts                                                 */
/*                                                                     */
/*  PR-C2 turned the 5 design-system enterprise chart entries          */
/*  (Funnel/Radar/Treemap/Waterfall/Gauge) into thin shims around      */
/*  `@mfe/x-charts`. These tests verify the shim contract:             */
/*  - access-control surface (`access`, `accessReason`) handled in     */
/*    the DS wrapper, NOT forwarded to x-charts                        */
/*  - DS-only props consumed in the wrapper (e.g. `palette`,           */
/*    `formatOptions`, `unit`, `showLabel`, `showValue`)               */
/*  - Adapter mappings (DS shape -> x-charts shape) produce the        */
/*    expected props on the inner chart                                */
/*  - `warnDeprecatedChartOnce` fires once per chart name in dev       */
/*                                                                     */
/*  Visual rendering ownership lives entirely in `@mfe/x-charts`; this */
/*  test file deliberately does NOT exercise the canonical chart       */
/*  output (canvas/svg, ECharts options, axes, etc.) — that is owned   */
/*  by the x-charts package test suite.                                */
/* ------------------------------------------------------------------ */

const mockState = vi.hoisted(() => ({
  funnel: [] as any[],
  radar: [] as any[],
  treemap: [] as any[],
  waterfall: [] as any[],
  gauge: [] as any[],
}));

vi.mock('@mfe/x-charts', () => ({
  FunnelChart: (props: any) => {
    mockState.funnel.push(props);
    return <div data-testid="x-funnel-chart" />;
  },
  RadarChart: (props: any) => {
    mockState.radar.push(props);
    return <div data-testid="x-radar-chart" />;
  },
  TreemapChart: (props: any) => {
    mockState.treemap.push(props);
    return <div data-testid="x-treemap-chart" />;
  },
  WaterfallChart: (props: any) => {
    mockState.waterfall.push(props);
    return <div data-testid="x-waterfall-chart" />;
  },
  GaugeChart: (props: any) => {
    mockState.gauge.push(props);
    return <div data-testid="x-gauge-chart" />;
  },
}));

import { FunnelChart, type FunnelStage } from '../FunnelChart';
import { RadarChart } from '../RadarChart';
import { TreemapChart, type TreemapItem } from '../TreemapChart';
import { WaterfallChart, type WaterfallItem } from '../WaterfallChart';
import { GaugeChart } from '../GaugeChart';
import { __resetDeprecationCacheForTests } from '../../components/charts/deprecation';

let warnSpy: MockInstance<Parameters<typeof console.warn>, void>;

beforeEach(() => {
  mockState.funnel.length = 0;
  mockState.radar.length = 0;
  mockState.treemap.length = 0;
  mockState.waterfall.length = 0;
  mockState.gauge.length = 0;
  __resetDeprecationCacheForTests();
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  warnSpy.mockRestore();
});

/* ================================================================== */
/*  FunnelChart shim                                                   */
/* ================================================================== */

describe('FunnelChart shim', () => {
  const stages: FunnelStage[] = [
    { id: 'leads', label: 'Leads', value: 1000 },
    { id: 'qualified', label: 'Qualified', value: 600 },
    { id: 'won', label: 'Won', value: 120 },
  ];

  it('renders inner x-charts FunnelChart', () => {
    render(<FunnelChart stages={stages} />);
    expect(screen.getByTestId('x-funnel-chart')).toBeInTheDocument();
  });

  it('adapts DS stages to x-charts data shape', () => {
    render(<FunnelChart stages={stages} />);
    expect(mockState.funnel.at(-1)?.data).toEqual([
      { id: 'leads', name: 'Leads', value: 1000, color: undefined },
      { id: 'qualified', name: 'Qualified', value: 600, color: undefined },
      { id: 'won', name: 'Won', value: 120, color: undefined },
    ]);
  });

  it('forwards sort="none" so the canonical chart preserves DS stage order', () => {
    render(<FunnelChart stages={stages} />);
    expect(mockState.funnel.at(-1)?.sort).toBe('none');
  });

  it('renames `animated` -> `animate`', () => {
    render(<FunnelChart stages={stages} animated={false} />);
    expect(mockState.funnel.at(-1)?.animate).toBe(false);
  });

  it('forwards orientation passthrough', () => {
    render(<FunnelChart stages={stages} orientation="horizontal" />);
    expect(mockState.funnel.at(-1)?.orientation).toBe('horizontal');
  });

  it('converts formatOptions to a valueFormatter callback', () => {
    render(<FunnelChart stages={stages} formatOptions={{ format: 'percent' }} />);
    const fmt = mockState.funnel.at(-1)?.valueFormatter as ((v: number) => string) | undefined;
    expect(typeof fmt).toBe('function');
    expect(fmt?.(50)).toMatch(/50/);
  });

  it('does NOT forward access/accessReason to x-charts', () => {
    render(<FunnelChart stages={stages} access="readonly" accessReason="Reason" />);
    const props = mockState.funnel.at(-1)!;
    expect(props).not.toHaveProperty('access');
    expect(props).not.toHaveProperty('accessReason');
  });

  it('invokes onStageClick with the original DS stage via dataIndex', () => {
    const onStageClick = vi.fn();
    render(<FunnelChart stages={stages} onStageClick={onStageClick} />);
    const onClick = mockState.funnel.at(-1)?.onDataPointClick as ((p: unknown) => void) | undefined;
    expect(typeof onClick).toBe('function');
    onClick?.({ dataIndex: 1, name: 'Qualified' });
    expect(onStageClick).toHaveBeenCalledWith(stages[1]);
  });

  it('falls back to `name` when dataIndex is missing in onStageClick', () => {
    const onStageClick = vi.fn();
    render(<FunnelChart stages={stages} onStageClick={onStageClick} />);
    const onClick = mockState.funnel.at(-1)?.onDataPointClick as ((p: unknown) => void) | undefined;
    onClick?.({ name: 'Won' });
    expect(onStageClick).toHaveBeenCalledWith(stages[2]);
  });

  it('access="hidden" returns null (no inner chart)', () => {
    const { container } = render(<FunnelChart stages={stages} access="hidden" />);
    expect(container.innerHTML).toBe('');
    expect(mockState.funnel).toHaveLength(0);
  });

  it('emits a single deprecation warning across renders', () => {
    render(<FunnelChart stages={stages} />);
    render(<FunnelChart stages={stages} />);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/FunnelChart is deprecated/);
  });
});

/* ================================================================== */
/*  RadarChart shim                                                    */
/* ================================================================== */

describe('RadarChart shim', () => {
  const axes = [
    { key: 'speed', label: 'Speed' },
    { key: 'power', label: 'Power' },
    { key: 'skill', label: 'Skill' },
  ];
  const series = [
    {
      id: 'p1',
      label: 'Player 1',
      values: { speed: 80, power: 60, skill: 90 },
      color: '#abc',
      fillOpacity: 0.4,
    },
  ];

  it('renders inner x-charts RadarChart', () => {
    render(<RadarChart axes={axes} series={series} />);
    expect(screen.getByTestId('x-radar-chart')).toBeInTheDocument();
  });

  it('adapts axes to indicators (label -> name)', () => {
    render(<RadarChart axes={axes} series={series} />);
    expect(mockState.radar.at(-1)?.indicators).toEqual([
      { name: 'Speed', max: undefined },
      { name: 'Power', max: undefined },
      { name: 'Skill', max: undefined },
    ]);
  });

  it('preserves axis max when explicitly given', () => {
    const axesWithMax = [
      { key: 'a', label: 'A', max: 100 },
      { key: 'b', label: 'B', max: 50 },
    ];
    const seriesAB = [{ id: 's', label: 'S', values: { a: 10, b: 20 } }];
    render(<RadarChart axes={axesWithMax} series={seriesAB} />);
    expect(mockState.radar.at(-1)?.indicators).toEqual([
      { name: 'A', max: 100 },
      { name: 'B', max: 50 },
    ]);
  });

  it('converts series.values Record to ordered data array', () => {
    render(<RadarChart axes={axes} series={series} />);
    const adapted = mockState.radar.at(-1)?.series?.[0];
    expect(adapted?.name).toBe('Player 1');
    expect(adapted?.data).toEqual([80, 60, 90]);
    expect(adapted?.color).toBe('#abc');
    expect(adapted?.areaStyle).toEqual({ opacity: 0.4 });
  });

  it('falls back to palette color when series.color is missing', () => {
    const palette = ['#111', '#222', '#333'];
    const seriesNoColor = [
      { id: 's1', label: 'S1', values: { speed: 1, power: 2, skill: 3 } },
      { id: 's2', label: 'S2', values: { speed: 4, power: 5, skill: 6 } },
    ];
    render(<RadarChart axes={axes} series={seriesNoColor} palette={palette} />);
    const adapted = mockState.radar.at(-1)?.series;
    expect(adapted[0].color).toBe('#111');
    expect(adapted[1].color).toBe('#222');
  });

  it('maps px size to chart-size variant via toChartSizeFromPx', () => {
    render(<RadarChart axes={axes} series={series} size={200} />);
    expect(mockState.radar.at(-1)?.size).toBe('sm');
  });

  it('renames levels -> splitNumber', () => {
    render(<RadarChart axes={axes} series={series} levels={4} />);
    expect(mockState.radar.at(-1)?.splitNumber).toBe(4);
  });

  it('does NOT forward showTooltip (no-op in shim)', () => {
    render(<RadarChart axes={axes} series={series} showTooltip={false} />);
    expect(mockState.radar.at(-1)).not.toHaveProperty('showTooltip');
  });

  it('access="hidden" returns null', () => {
    const { container } = render(<RadarChart axes={axes} series={series} access="hidden" />);
    expect(container.innerHTML).toBe('');
  });

  it('emits a single deprecation warning', () => {
    render(<RadarChart axes={axes} series={series} />);
    render(<RadarChart axes={axes} series={series} />);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/RadarChart is deprecated/);
  });
});

/* ================================================================== */
/*  TreemapChart shim                                                  */
/* ================================================================== */

describe('TreemapChart shim', () => {
  const items: TreemapItem[] = [
    { id: 'a', label: 'Alpha', value: 100, color: '#aaa' },
    {
      id: 'b',
      label: 'Bravo',
      value: 60,
      children: [
        { id: 'b1', label: 'B1', value: 30 },
        { id: 'b2', label: 'B2', value: 30 },
      ],
    },
  ];

  it('renders inner x-charts TreemapChart', () => {
    render(<TreemapChart items={items} />);
    expect(screen.getByTestId('x-treemap-chart')).toBeInTheDocument();
  });

  it('adapts items to TreemapNode shape with palette fallback', () => {
    render(<TreemapChart items={items} />);
    const data = mockState.treemap.at(-1)?.data as any[];
    expect(data[0].name).toBe('Alpha');
    expect(data[0].itemStyle.color).toBe('#aaa');
    expect(data[1].name).toBe('Bravo');
    expect(data[1].itemStyle.color).toBeTruthy(); // palette fallback
  });

  it('recursively adapts nested children', () => {
    render(<TreemapChart items={items} />);
    const data = mockState.treemap.at(-1)?.data as any[];
    expect(data[1].children).toHaveLength(2);
    expect(data[1].children[0].name).toBe('B1');
  });

  it('attaches __dsId metadata for click resolution', () => {
    render(<TreemapChart items={items} />);
    const data = mockState.treemap.at(-1)?.data as any[];
    expect(data[0].__dsId).toBe('a');
    expect(data[1].children[0].__dsId).toBe('b1');
  });

  it('maps width/height to chart-size variant', () => {
    render(<TreemapChart items={items} width={400} />);
    expect(mockState.treemap.at(-1)?.size).toBe('lg');
  });

  it('invokes onItemClick with the original item via __dsId', () => {
    const onItemClick = vi.fn();
    render(<TreemapChart items={items} onItemClick={onItemClick} />);
    const onClick = mockState.treemap.at(-1)?.onNodeClick as ((p: unknown) => void) | undefined;
    onClick?.({ name: 'B1', value: 30, data: { __dsId: 'b1' } });
    expect(onItemClick).toHaveBeenCalledWith(items[1].children![0]);
  });

  it('access="hidden" returns null', () => {
    const { container } = render(<TreemapChart items={items} access="hidden" />);
    expect(container.innerHTML).toBe('');
  });

  it('emits a single deprecation warning', () => {
    render(<TreemapChart items={items} />);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/TreemapChart is deprecated/);
  });
});

/* ================================================================== */
/*  WaterfallChart shim                                                */
/* ================================================================== */

describe('WaterfallChart shim', () => {
  const wfItems: WaterfallItem[] = [
    { id: 'rev', label: 'Revenue', value: 1000, type: 'increase' },
    { id: 'cost', label: 'Costs', value: -400, type: 'decrease' },
    { id: 'net', label: 'Net', value: 600, type: 'total' },
  ];

  it('renders inner x-charts WaterfallChart', () => {
    render(<WaterfallChart items={wfItems} />);
    expect(screen.getByTestId('x-waterfall-chart')).toBeInTheDocument();
  });

  it('adapts items to data shape (label -> name)', () => {
    render(<WaterfallChart items={wfItems} />);
    expect(mockState.waterfall.at(-1)?.data).toEqual([
      { id: 'rev', name: 'Revenue', value: 1000, type: 'increase' },
      { id: 'cost', name: 'Costs', value: -400, type: 'decrease' },
      { id: 'net', name: 'Net', value: 600, type: 'total' },
    ]);
  });

  it('renames showConnectors -> showConnector', () => {
    render(<WaterfallChart items={wfItems} showConnectors={false} />);
    expect(mockState.waterfall.at(-1)?.showConnector).toBe(false);
  });

  it('renames format -> valueFormatter', () => {
    const fmt = (v: number) => `$${v}`;
    render(<WaterfallChart items={wfItems} format={fmt} />);
    expect(mockState.waterfall.at(-1)?.valueFormatter).toBe(fmt);
  });

  it('collects best-effort type-level colors from per-item color', () => {
    const colored: WaterfallItem[] = [
      { id: 'a', label: 'A', value: 1, type: 'increase', color: '#aaa' },
      { id: 'b', label: 'B', value: 2, type: 'increase', color: '#bbb' },
      { id: 'c', label: 'C', value: -1, type: 'decrease', color: '#ccc' },
    ];
    render(<WaterfallChart items={colored} />);
    expect(mockState.waterfall.at(-1)?.colors).toEqual({
      increase: '#aaa', // first custom color per type
      decrease: '#ccc',
    });
  });

  it('forwards undefined colors when no item carries a custom color', () => {
    render(<WaterfallChart items={wfItems} />);
    expect(mockState.waterfall.at(-1)?.colors).toBeUndefined();
  });

  it('invokes onItemClick via dataIndex', () => {
    const onItemClick = vi.fn();
    render(<WaterfallChart items={wfItems} onItemClick={onItemClick} />);
    const onClick = mockState.waterfall.at(-1)?.onDataPointClick as
      | ((p: unknown) => void)
      | undefined;
    onClick?.({ dataIndex: 2, name: 'Net' });
    expect(onItemClick).toHaveBeenCalledWith(wfItems[2]);
  });

  it('parses px-prefixed string height to size variant', () => {
    render(<WaterfallChart items={wfItems} height="500px" />);
    expect(mockState.waterfall.at(-1)?.size).toBe('lg');
  });

  it('falls back to "md" when height string is unparseable', () => {
    render(<WaterfallChart items={wfItems} height="auto" />);
    expect(mockState.waterfall.at(-1)?.size).toBe('md');
  });

  it('access="hidden" returns null', () => {
    const { container } = render(<WaterfallChart items={wfItems} access="hidden" />);
    expect(container.innerHTML).toBe('');
  });

  it('emits a single deprecation warning', () => {
    render(<WaterfallChart items={wfItems} />);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/WaterfallChart is deprecated/);
  });
});

/* ================================================================== */
/*  GaugeChart shim                                                    */
/* ================================================================== */

describe('GaugeChart shim', () => {
  it('renders inner x-charts GaugeChart', () => {
    render(<GaugeChart value={50} />);
    expect(screen.getByTestId('x-gauge-chart')).toBeInTheDocument();
  });

  it('forwards value/min/max passthrough', () => {
    render(<GaugeChart value={75} min={10} max={90} />);
    const props = mockState.gauge.at(-1)!;
    expect(props.value).toBe(75);
    expect(props.min).toBe(10);
    expect(props.max).toBe(90);
  });

  it('renames label -> title (when showLabel is not false)', () => {
    render(<GaugeChart value={50} label="CPU" />);
    expect(mockState.gauge.at(-1)?.title).toBe('CPU');
  });

  it('suppresses title when showLabel=false', () => {
    render(<GaugeChart value={50} label="CPU" showLabel={false} />);
    expect(mockState.gauge.at(-1)?.title).toBeUndefined();
  });

  it('composes a valueFormatter that appends the unit suffix', () => {
    render(<GaugeChart value={42} unit="%" />);
    const fmt = mockState.gauge.at(-1)?.valueFormatter as ((v: number) => string) | undefined;
    expect(typeof fmt).toBe('function');
    expect(fmt?.(42)).toBe('42%');
  });

  it('does NOT forward valueFormatter when unit is omitted', () => {
    render(<GaugeChart value={42} />);
    expect(mockState.gauge.at(-1)).not.toHaveProperty('valueFormatter');
  });

  it('does NOT forward showValue (no-op in shim, x-charts always renders value)', () => {
    render(<GaugeChart value={42} showValue={false} />);
    expect(mockState.gauge.at(-1)).not.toHaveProperty('showValue');
  });

  it('provides DS default thresholds for backward compatibility', () => {
    render(<GaugeChart value={50} />);
    const thresholds = mockState.gauge.at(-1)?.thresholds as Array<{
      value: number;
      color: string;
    }>;
    expect(thresholds).toHaveLength(3);
    expect(thresholds[0].value).toBe(33);
    expect(thresholds[2].value).toBe(100);
  });

  it('forwards explicit thresholds verbatim', () => {
    const custom = [
      { value: 50, color: '#abc' },
      { value: 100, color: '#def' },
    ];
    render(<GaugeChart value={50} thresholds={custom} />);
    expect(mockState.gauge.at(-1)?.thresholds).toBe(custom);
  });

  it('access="hidden" returns null', () => {
    const { container } = render(<GaugeChart value={50} access="hidden" />);
    expect(container.innerHTML).toBe('');
  });

  it('emits a single deprecation warning', () => {
    render(<GaugeChart value={50} />);
    render(<GaugeChart value={60} />);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/GaugeChart is deprecated/);
  });
});

/* ================================================================== */
/*  Cross-cutting wrapper assertions                                   */
/* ================================================================== */

describe('Enterprise chart shim wrapper', () => {
  it('attaches data-component=funnel-chart to the wrapper', () => {
    const { container } = render(<FunnelChart stages={[{ id: 'a', label: 'A', value: 10 }]} />);
    expect(container.firstElementChild?.getAttribute('data-component')).toBe('funnel-chart');
  });

  it('attaches data-access-state to the wrapper', () => {
    const { container } = render(
      <FunnelChart stages={[{ id: 'a', label: 'A', value: 10 }]} access="readonly" />,
    );
    expect(container.firstElementChild?.getAttribute('data-access-state')).toBe('readonly');
  });

  it('forwards accessReason as DOM title on the wrapper', () => {
    const { container } = render(
      <FunnelChart stages={[{ id: 'a', label: 'A', value: 10 }]} accessReason="locked" />,
    );
    expect(container.firstElementChild?.getAttribute('title')).toBe('locked');
  });

  it('merges className onto the wrapper', () => {
    const { container } = render(
      <FunnelChart stages={[{ id: 'a', label: 'A', value: 10 }]} className="my-funnel" />,
    );
    expect(container.firstElementChild?.className).toContain('my-funnel');
  });
});
