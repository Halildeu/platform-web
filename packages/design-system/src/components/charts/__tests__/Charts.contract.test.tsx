// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

/* ------------------------------------------------------------------ */
/*  Charts.contract — DS chart shim contract surface                   */
/*                                                                     */
/*  After PR-C1 the DS chart entries are shims around `@mfe/x-charts`. */
/*  This file pins the surface that consumers rely on:                 */
/*  - displayName                                                      */
/*  - default export equality                                          */
/*  - ref forwarding (HTMLDivElement)                                  */
/*  - access-control state attribute                                   */
/* ------------------------------------------------------------------ */

vi.mock('@mfe/x-charts', () => ({
  BarChart: () => <div data-testid="x-bar-chart" />,
  LineChart: () => <div data-testid="x-line-chart" />,
  AreaChart: () => <div data-testid="x-area-chart" />,
  PieChart: () => <div data-testid="x-pie-chart" />,
}));

import BarChartDefault, { BarChart } from '../BarChart';
import LineChartDefault, { LineChart } from '../LineChart';
import AreaChartDefault, { AreaChart } from '../AreaChart';
import PieChartDefault, { PieChart } from '../PieChart';
import { __resetDeprecationCacheForTests } from '../deprecation';

const sampleData = [
  { label: 'Jan', value: 100 },
  { label: 'Feb', value: 200 },
];
const sampleSeries = [{ name: 'S', data: [1, 2, 3] }];
const sampleLabels = ['A', 'B', 'C'];

let warnSpy: MockInstance<Parameters<typeof console.warn>, void>;

beforeEach(() => {
  __resetDeprecationCacheForTests();
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  warnSpy.mockRestore();
});

describe('DS chart shim contract', () => {
  it('BarChart default and named exports refer to the same component', () => {
    expect(BarChartDefault).toBe(BarChart);
  });

  it('LineChart default and named exports refer to the same component', () => {
    expect(LineChartDefault).toBe(LineChart);
  });

  it('AreaChart default and named exports refer to the same component', () => {
    expect(AreaChartDefault).toBe(AreaChart);
  });

  it('PieChart default and named exports refer to the same component', () => {
    expect(PieChartDefault).toBe(PieChart);
  });

  it("BarChart has displayName 'BarChart'", () => {
    expect(BarChart.displayName).toBe('BarChart');
  });

  it("LineChart has displayName 'LineChart'", () => {
    expect(LineChart.displayName).toBe('LineChart');
  });

  it("AreaChart has displayName 'AreaChart'", () => {
    expect(AreaChart.displayName).toBe('AreaChart');
  });

  it("PieChart has displayName 'PieChart'", () => {
    expect(PieChart.displayName).toBe('PieChart');
  });

  it('BarChart forwards ref to the wrapper element', () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<BarChart ref={ref} data={sampleData} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-access-state')).toBe('full');
  });

  it('LineChart forwards ref to the wrapper element', () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<LineChart ref={ref} series={sampleSeries} labels={sampleLabels} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('AreaChart forwards ref to the wrapper element', () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<AreaChart ref={ref} series={sampleSeries} labels={sampleLabels} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('PieChart forwards ref to the wrapper element', () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<PieChart ref={ref} data={sampleData} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('renders inner x-charts BarChart', () => {
    render(<BarChart data={sampleData} />);
    expect(screen.getByTestId('x-bar-chart')).toBeInTheDocument();
  });
});
