// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

/* ------------------------------------------------------------------ */
/*  Mock @mfe/x-charts                                                 */
/*                                                                     */
/*  PR-C1 turned the DS chart entries into thin shims around           */
/*  `@mfe/x-charts`. These tests verify the shim contract:             */
/*  - access-control surface (`access`, `accessReason`) handled in     */
/*    the DS wrapper, NOT forwarded to x-charts                        */
/*  - `localeText` accepted but NOT forwarded (known limitation)       */
/*  - `warnDeprecatedChartOnce` fires once per chart name in dev       */
/*  - All other props pass through to x-charts unchanged               */
/* ------------------------------------------------------------------ */

const mockState = vi.hoisted(() => ({
  bar: [] as any[],
  line: [] as any[],
  area: [] as any[],
  pie: [] as any[],
}));

vi.mock('@mfe/x-charts', () => ({
  BarChart: (props: any) => {
    mockState.bar.push(props);
    return <div data-testid="x-bar-chart" />;
  },
  LineChart: (props: any) => {
    mockState.line.push(props);
    return <div data-testid="x-line-chart" />;
  },
  AreaChart: (props: any) => {
    mockState.area.push(props);
    return <div data-testid="x-area-chart" />;
  },
  PieChart: (props: any) => {
    mockState.pie.push(props);
    return <div data-testid="x-pie-chart" />;
  },
}));

import { BarChart } from '../BarChart';
import { LineChart } from '../LineChart';
import { AreaChart } from '../AreaChart';
import { PieChart } from '../PieChart';
import { __resetDeprecationCacheForTests } from '../deprecation';

const barData = [
  { label: 'Ocak', value: 40 },
  { label: 'Subat', value: 65 },
];
const pieData = [
  { label: 'A', value: 30 },
  { label: 'B', value: 70 },
];
const lineSeries = [{ name: 'Satis', data: [10, 40, 30, 60] }];
const lineLabels = ['Q1', 'Q2', 'Q3', 'Q4'];

let warnSpy: MockInstance<Parameters<typeof console.warn>, void>;

beforeEach(() => {
  mockState.bar.length = 0;
  mockState.line.length = 0;
  mockState.area.length = 0;
  mockState.pie.length = 0;
  __resetDeprecationCacheForTests();
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  warnSpy.mockRestore();
});

/* ================================================================== */
/*  BarChart shim                                                      */
/* ================================================================== */

describe('BarChart shim', () => {
  it('renders an inner x-charts BarChart', () => {
    render(<BarChart data={barData} />);
    expect(screen.getByTestId('x-bar-chart')).toBeInTheDocument();
  });

  it('forwards data to x-charts', () => {
    render(<BarChart data={barData} />);
    expect(mockState.bar.at(-1)?.data).toEqual(barData);
  });

  it('forwards passthrough props (orientation, showValues, showGrid)', () => {
    render(<BarChart data={barData} orientation="horizontal" showValues showGrid={false} />);
    const props = mockState.bar.at(-1)!;
    expect(props.orientation).toBe('horizontal');
    expect(props.showValues).toBe(true);
    expect(props.showGrid).toBe(false);
  });

  it('does NOT forward localeText to x-charts', () => {
    render(<BarChart data={barData} localeText={{ noData: 'Custom empty' }} />);
    expect(mockState.bar.at(-1)).not.toHaveProperty('localeText');
  });

  it('does NOT forward access/accessReason to x-charts', () => {
    render(<BarChart data={barData} access="readonly" accessReason="Reason" />);
    const props = mockState.bar.at(-1)!;
    expect(props).not.toHaveProperty('access');
    expect(props).not.toHaveProperty('accessReason');
  });

  it('uses [] when data prop is undefined', () => {
    render(<BarChart data={undefined as any} />);
    expect(mockState.bar.at(-1)?.data).toEqual([]);
  });

  it('access="hidden" returns null (no DOM)', () => {
    const { container } = render(<BarChart data={barData} access="hidden" />);
    expect(container.innerHTML).toBe('');
    expect(mockState.bar).toHaveLength(0);
  });

  it('access="disabled" applies opacity-50 to the wrapper', () => {
    const { container } = render(<BarChart data={barData} access="disabled" />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('opacity-50');
    expect(wrapper.getAttribute('data-access-state')).toBe('disabled');
  });

  it('accessReason renders as DOM title on the wrapper', () => {
    const { container } = render(
      <BarChart data={barData} accessReason="Insufficient permissions" />,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.getAttribute('title')).toBe('Insufficient permissions');
  });

  it('emits a single deprecation warning across multiple renders', () => {
    render(<BarChart data={barData} />);
    render(<BarChart data={barData} />);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/BarChart is deprecated/);
  });

  it('merges className onto the wrapper', () => {
    const { container } = render(<BarChart data={barData} className="my-bar" />);
    expect(container.firstElementChild?.className).toContain('my-bar');
  });

  it("has displayName 'BarChart'", () => {
    expect(BarChart.displayName).toBe('BarChart');
  });
});

/* ================================================================== */
/*  LineChart shim                                                     */
/* ================================================================== */

describe('LineChart shim', () => {
  it('renders inner x-charts LineChart', () => {
    render(<LineChart series={lineSeries} labels={lineLabels} />);
    expect(screen.getByTestId('x-line-chart')).toBeInTheDocument();
  });

  it('forwards series and labels', () => {
    render(<LineChart series={lineSeries} labels={lineLabels} />);
    const props = mockState.line.at(-1)!;
    expect(props.series).toEqual(lineSeries);
    expect(props.labels).toEqual(lineLabels);
  });

  it('uses [] when series/labels are undefined', () => {
    render(<LineChart series={undefined as any} labels={undefined as any} />);
    const props = mockState.line.at(-1)!;
    expect(props.series).toEqual([]);
    expect(props.labels).toEqual([]);
  });

  it('forwards passthrough props (showDots, curved, valueFormatter)', () => {
    const fmt = (v: number) => `${v}/100`;
    render(
      <LineChart series={lineSeries} labels={lineLabels} showDots curved valueFormatter={fmt} />,
    );
    const props = mockState.line.at(-1)!;
    expect(props.showDots).toBe(true);
    expect(props.curved).toBe(true);
    expect(props.valueFormatter).toBe(fmt);
  });

  it('does NOT forward access/localeText', () => {
    render(
      <LineChart
        series={lineSeries}
        labels={lineLabels}
        access="readonly"
        localeText={{ noData: 'X' }}
      />,
    );
    const props = mockState.line.at(-1)!;
    expect(props).not.toHaveProperty('access');
    expect(props).not.toHaveProperty('localeText');
  });

  it('access="hidden" returns null', () => {
    const { container } = render(
      <LineChart series={lineSeries} labels={lineLabels} access="hidden" />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('emits a single deprecation warning', () => {
    render(<LineChart series={lineSeries} labels={lineLabels} />);
    render(<LineChart series={lineSeries} labels={lineLabels} />);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/LineChart is deprecated/);
  });

  it("has displayName 'LineChart'", () => {
    expect(LineChart.displayName).toBe('LineChart');
  });
});

/* ================================================================== */
/*  AreaChart shim                                                     */
/* ================================================================== */

describe('AreaChart shim', () => {
  it('renders inner x-charts AreaChart', () => {
    render(<AreaChart series={lineSeries} labels={lineLabels} />);
    expect(screen.getByTestId('x-area-chart')).toBeInTheDocument();
  });

  it('forwards series and labels', () => {
    render(<AreaChart series={lineSeries} labels={lineLabels} />);
    const props = mockState.area.at(-1)!;
    expect(props.series).toEqual(lineSeries);
    expect(props.labels).toEqual(lineLabels);
  });

  it('uses [] when series/labels are undefined', () => {
    render(<AreaChart series={undefined as any} labels={undefined as any} />);
    const props = mockState.area.at(-1)!;
    expect(props.series).toEqual([]);
    expect(props.labels).toEqual([]);
  });

  it('forwards passthrough props (stacked, gradient, curved)', () => {
    render(<AreaChart series={lineSeries} labels={lineLabels} stacked gradient={false} curved />);
    const props = mockState.area.at(-1)!;
    expect(props.stacked).toBe(true);
    expect(props.gradient).toBe(false);
    expect(props.curved).toBe(true);
  });

  it('access="hidden" returns null', () => {
    const { container } = render(
      <AreaChart series={lineSeries} labels={lineLabels} access="hidden" />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('emits a single deprecation warning', () => {
    render(<AreaChart series={lineSeries} labels={lineLabels} />);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/AreaChart is deprecated/);
  });

  it("has displayName 'AreaChart'", () => {
    expect(AreaChart.displayName).toBe('AreaChart');
  });
});

/* ================================================================== */
/*  PieChart shim                                                      */
/* ================================================================== */

describe('PieChart shim', () => {
  it('renders inner x-charts PieChart', () => {
    render(<PieChart data={pieData} />);
    expect(screen.getByTestId('x-pie-chart')).toBeInTheDocument();
  });

  it('forwards data', () => {
    render(<PieChart data={pieData} />);
    expect(mockState.pie.at(-1)?.data).toEqual(pieData);
  });

  it('forwards passthrough props (donut, showLabels, valueFormatter)', () => {
    const fmt = (v: number) => `$${v}`;
    render(<PieChart data={pieData} donut showLabels showPercentage valueFormatter={fmt} />);
    const props = mockState.pie.at(-1)!;
    expect(props.donut).toBe(true);
    expect(props.showLabels).toBe(true);
    expect(props.showPercentage).toBe(true);
    expect(props.valueFormatter).toBe(fmt);
  });

  it('uses [] when data prop is undefined', () => {
    render(<PieChart data={undefined as any} />);
    expect(mockState.pie.at(-1)?.data).toEqual([]);
  });

  it('access="hidden" returns null', () => {
    const { container } = render(<PieChart data={pieData} access="hidden" />);
    expect(container.innerHTML).toBe('');
  });

  it('emits a single deprecation warning', () => {
    render(<PieChart data={pieData} />);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/PieChart is deprecated/);
  });

  it("has displayName 'PieChart'", () => {
    expect(PieChart.displayName).toBe('PieChart');
  });
});
