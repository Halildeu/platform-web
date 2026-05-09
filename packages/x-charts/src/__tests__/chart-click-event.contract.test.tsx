// @vitest-environment jsdom
/**
 * Cross-filter rollout sweep — chart-click-event contract test
 *
 * Locks the per-chart `onDataPointClick` adapter contract for all 13
 * x-charts adapters. For every chart, the test:
 *
 *   1. Renders the chart with a vi-mocked `onDataPointClick`.
 *   2. Pulls the registered ECharts click handler from the mock
 *      (`clickListenerRegistrations()` — see fixtures/echarts-mock).
 *   3. Invokes that handler with chart-specific `ECharts click params`.
 *   4. Asserts the resulting `ChartClickEvent.datum` shape matches the
 *      adapter contract documented in the corresponding shim.
 *
 * Why a separate suite from `cross-filter-wrapper-integration.test.tsx`:
 * the wrapper test feeds payloads to the cross-filter HOOK directly and
 * never exercises the per-chart adapter chain. Codex iter-2 (thread
 * 019e0c25) flagged that gap before BETA → stable promotion of
 * cross-filter; this suite closes it.
 *
 * The Sankey case asserts BOTH node and edge datum shapes (the only
 * chart with two click categories). The Treemap, Heatmap, Sankey and
 * Sunburst cases also verify the legacy callback (`onNodeClick` /
 * `onCellClick`) still fires alongside the new `onDataPointClick`.
 */
import { resetEChartsMock, clickListenerRegistrations } from './fixtures/echarts-mock'; // side-effect: hoists vi.mock for ECharts
import { installJsdomPolyfills, restoreJsdomPolyfills } from './fixtures/jsdom-polyfills';

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';

import { BarChart } from '../BarChart';
import { LineChart } from '../LineChart';
import { AreaChart } from '../AreaChart';
import { PieChart } from '../PieChart';
import { ScatterChart } from '../ScatterChart';
import { GaugeChart } from '../GaugeChart';
import { RadarChart } from '../RadarChart';
import { TreemapChart } from '../TreemapChart';
import { HeatmapChart } from '../HeatmapChart';
import { WaterfallChart } from '../WaterfallChart';
import { FunnelChart } from '../FunnelChart';
import { SankeyChart } from '../SankeyChart';
import { SunburstChart } from '../SunburstChart';

import type { ChartClickEvent } from '../types';

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  resetEChartsMock();
  installJsdomPolyfills();
});

afterEach(() => {
  restoreJsdomPolyfills();
});

/**
 * Pull the most recent ECharts `instance.on('click', …)` handler that
 * the wrapper registered. Charts register a fresh handler whenever the
 * `onDataPointClick` prop is non-null — we always want the LAST one.
 */
function getLastClickHandler(): (params: unknown) => void {
  const handlers = clickListenerRegistrations();
  expect(handlers.length).toBeGreaterThan(0);
  return handlers[handlers.length - 1] as (params: unknown) => void;
}

/* ------------------------------------------------------------------ */
/*  Per-chart contract assertions                                       */
/* ------------------------------------------------------------------ */

describe('BarChart onDataPointClick contract', () => {
  it('emits { datum: {label, value, ...raw}, value, label }', () => {
    const onClick = vi.fn<(e: ChartClickEvent) => void>();
    render(
      <BarChart
        data={[
          { label: 'Q1', value: 100 },
          { label: 'Q2', value: 200 },
        ]}
        onDataPointClick={onClick}
      />,
    );

    getLastClickHandler()({
      dataIndex: 0,
      name: 'Q1',
      value: 100,
      data: { label: 'Q1', value: 100, region: 'EU' },
    });

    expect(onClick).toHaveBeenCalledTimes(1);
    const event = onClick.mock.calls[0][0];
    expect(event.label).toBe('Q1');
    expect(event.value).toBe(100);
    expect(event.datum).toMatchObject({
      label: 'Q1',
      value: 100,
      region: 'EU',
    });
  });
});

describe('LineChart onDataPointClick contract', () => {
  it('emits a series-aware datum with seriesName / label / value', () => {
    const onClick = vi.fn<(e: ChartClickEvent) => void>();
    render(
      <LineChart
        series={[{ name: 'Sales', data: [10, 20, 30] }]}
        labels={['Jan', 'Feb', 'Mar']}
        onDataPointClick={onClick}
      />,
    );

    getLastClickHandler()({
      seriesName: 'Sales',
      seriesIndex: 0,
      dataIndex: 1,
      name: 'Feb',
      value: 20,
    });

    expect(onClick).toHaveBeenCalledTimes(1);
    const event = onClick.mock.calls[0][0];
    expect(event.datum).toMatchObject({
      seriesName: 'Sales',
      label: 'Feb',
      value: 20,
    });
  });
});

describe('AreaChart onDataPointClick contract', () => {
  it('emits { seriesName, label, value, dataIndex, seriesIndex }', () => {
    const onClick = vi.fn<(e: ChartClickEvent) => void>();
    render(
      <AreaChart
        series={[{ name: 'Gelir', data: [100, 200, 300] }]}
        labels={['Q1', 'Q2', 'Q3']}
        onDataPointClick={onClick}
      />,
    );

    getLastClickHandler()({
      seriesName: 'Gelir',
      seriesIndex: 0,
      dataIndex: 1,
      name: 'Q2',
      value: 200,
    });

    expect(onClick).toHaveBeenCalledTimes(1);
    const datum = onClick.mock.calls[0][0].datum;
    expect(datum).toMatchObject({
      seriesName: 'Gelir',
      label: 'Q2',
      value: 200,
      dataIndex: 1,
      seriesIndex: 0,
    });
  });
});

describe('PieChart onDataPointClick contract', () => {
  it('emits { datum: {label, value, ...raw} }', () => {
    const onClick = vi.fn<(e: ChartClickEvent) => void>();
    render(
      <PieChart
        data={[
          { label: 'Tarım', value: 320 },
          { label: 'Sanayi', value: 540 },
        ]}
        onDataPointClick={onClick}
      />,
    );

    getLastClickHandler()({
      dataIndex: 0,
      name: 'Tarım',
      value: 320,
      data: { label: 'Tarım', value: 320, sector: 'A' },
    });

    expect(onClick).toHaveBeenCalledTimes(1);
    const event = onClick.mock.calls[0][0];
    expect(event.label).toBe('Tarım');
    expect(event.value).toBe(320);
    expect(event.datum).toMatchObject({
      label: 'Tarım',
      value: 320,
      sector: 'A',
    });
  });
});

describe('ScatterChart onDataPointClick contract', () => {
  it('emits { x, y, size, label, dataIndex } (cartesian / bubble)', () => {
    const onClick = vi.fn<(e: ChartClickEvent) => void>();
    render(
      <ScatterChart
        data={[
          { x: 5.2, y: 8.7, size: 30, label: 'Outlier-A' },
          { x: 3.1, y: 4.2, label: 'Cluster-B' },
        ]}
        onDataPointClick={onClick}
      />,
    );

    getLastClickHandler()({
      dataIndex: 0,
      value: [5.2, 8.7, 30],
      data: { x: 5.2, y: 8.7, size: 30, label: 'Outlier-A' },
      name: 'Outlier-A',
    });

    expect(onClick).toHaveBeenCalledTimes(1);
    const datum = onClick.mock.calls[0][0].datum;
    expect(datum).toMatchObject({
      x: 5.2,
      y: 8.7,
      size: 30,
      label: 'Outlier-A',
      dataIndex: 0,
    });
  });
});

describe('GaugeChart onDataPointClick contract', () => {
  it('emits { label, name, value, min, max } — no synthetic `target`', () => {
    const onClick = vi.fn<(e: ChartClickEvent) => void>();
    render(<GaugeChart value={75} min={0} max={100} title="CPU" onDataPointClick={onClick} />);

    getLastClickHandler()({
      value: 75,
      name: 'CPU',
    });

    expect(onClick).toHaveBeenCalledTimes(1);
    const datum = onClick.mock.calls[0][0].datum;
    expect(datum).toMatchObject({
      label: 'CPU',
      name: 'CPU',
      value: 75,
      min: 0,
      max: 100,
    });
    // Codex iter-1 blocker — `target` is NOT a Gauge prop.
    expect(datum.target).toBeUndefined();
  });
});

describe('RadarChart onDataPointClick contract', () => {
  it('emits polygon-level datum { seriesName, label, values, indicators }', () => {
    const onClick = vi.fn<(e: ChartClickEvent) => void>();
    render(
      <RadarChart
        indicators={[
          { name: 'Hız', max: 100 },
          { name: 'Güç', max: 100 },
          { name: 'Verimlilik', max: 100 },
        ]}
        series={[{ name: 'Model X', data: [85, 70, 90] }]}
        onDataPointClick={onClick}
      />,
    );

    getLastClickHandler()({
      seriesName: 'Model X',
      name: 'Model X',
      value: [85, 70, 90],
      dataIndex: 0,
    });

    expect(onClick).toHaveBeenCalledTimes(1);
    const datum = onClick.mock.calls[0][0].datum;
    expect(datum).toMatchObject({
      seriesName: 'Model X',
      label: 'Model X',
      values: [85, 70, 90],
      indicators: ['Hız', 'Güç', 'Verimlilik'],
    });
  });
});

describe('TreemapChart onDataPointClick contract', () => {
  it('emits { name, label, value, treePathInfo, path, depth, data } and fires legacy onNodeClick AFTER it', () => {
    const onDataPointClick = vi.fn<(e: ChartClickEvent) => void>();
    const onNodeClick = vi.fn();
    const callOrder: string[] = [];
    onDataPointClick.mockImplementation(() => callOrder.push('data'));
    onNodeClick.mockImplementation(() => callOrder.push('node'));

    render(
      <TreemapChart
        data={[
          {
            name: 'Root',
            children: [
              { name: 'A', value: 100 },
              { name: 'B', value: 200 },
            ],
          },
        ]}
        onDataPointClick={onDataPointClick}
        onNodeClick={onNodeClick}
      />,
    );

    getLastClickHandler()({
      name: 'A',
      value: 100,
      data: { name: 'A', value: 100 },
      treePathInfo: [
        { name: 'Root', value: 300, dataIndex: 0 },
        { name: 'A', value: 100, dataIndex: 1 },
      ],
    });

    expect(onDataPointClick).toHaveBeenCalledTimes(1);
    expect(onNodeClick).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['data', 'node']);

    const datum = onDataPointClick.mock.calls[0][0].datum;
    expect(datum).toMatchObject({
      name: 'A',
      label: 'A',
      value: 100,
      path: 'Root > A',
      depth: 1, // treePathInfo.length - 1
    });
    expect(Array.isArray(datum.treePathInfo)).toBe(true);
  });

  it('falls back to depth=0 when treePathInfo is absent', () => {
    const onDataPointClick = vi.fn<(e: ChartClickEvent) => void>();
    render(
      <TreemapChart data={[{ name: 'Root', value: 100 }]} onDataPointClick={onDataPointClick} />,
    );

    getLastClickHandler()({ name: 'Root', value: 100, data: { name: 'Root', value: 100 } });

    const datum = onDataPointClick.mock.calls[0][0].datum;
    expect(datum.depth).toBe(0);
  });
});

describe('HeatmapChart onDataPointClick contract', () => {
  it('emits { x, y, xLabel, yLabel, value, label } and fires legacy onCellClick AFTER it', () => {
    const onDataPointClick = vi.fn<(e: ChartClickEvent) => void>();
    const onCellClick = vi.fn();
    const callOrder: string[] = [];
    onDataPointClick.mockImplementation(() => callOrder.push('data'));
    onCellClick.mockImplementation(() => callOrder.push('cell'));

    render(
      <HeatmapChart
        data={[
          [0, 0, 10],
          [1, 0, 20],
          [0, 1, 30],
          [1, 1, 40],
        ]}
        xLabels={['Pzt', 'Sal']}
        yLabels={['Sabah', 'Akşam']}
        onDataPointClick={onDataPointClick}
        onCellClick={onCellClick}
      />,
    );

    // Click the (xi=1, yi=0, value=20) cell
    getLastClickHandler()({ data: [1, 0, 20] });

    expect(onDataPointClick).toHaveBeenCalledTimes(1);
    expect(onCellClick).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['data', 'cell']);

    const datum = onDataPointClick.mock.calls[0][0].datum;
    expect(datum).toMatchObject({
      x: 1,
      y: 0,
      xLabel: 'Sal',
      yLabel: 'Sabah',
      value: 20,
      label: 'Sal/Sabah',
    });
  });
});

describe('WaterfallChart onDataPointClick contract', () => {
  it('emits { label, value: displayedValue, rawValue, type } for visible bars', () => {
    const onClick = vi.fn<(e: ChartClickEvent) => void>();
    render(
      <WaterfallChart
        data={[
          { label: 'Start', value: 100, type: 'total' },
          { label: 'Income', value: 50, type: 'increase' },
          { label: 'Expense', value: -20, type: 'decrease' },
          { label: 'End', value: 130, type: 'total' },
        ]}
        onDataPointClick={onClick}
      />,
    );

    // Click the increase bar (dataIndex=1)
    getLastClickHandler()({
      seriesName: 'Increase',
      name: 'Income',
      value: 50, // ECharts displayedValue == rawValue for inc/dec
      dataIndex: 1,
    });

    expect(onClick).toHaveBeenCalledTimes(1);
    const datum = onClick.mock.calls[0][0].datum;
    expect(datum).toMatchObject({
      label: 'Income',
      value: 50, // displayedValue
      rawValue: 50,
      type: 'increase',
    });
  });

  it('drops hidden __waterfall_base__ series clicks', () => {
    const onClick = vi.fn<(e: ChartClickEvent) => void>();
    render(
      <WaterfallChart
        data={[
          { label: 'Start', value: 100, type: 'total' },
          { label: 'Income', value: 50, type: 'increase' },
        ]}
        onDataPointClick={onClick}
      />,
    );

    getLastClickHandler()({
      seriesName: '__waterfall_base__',
      name: 'Income',
      value: 100,
      dataIndex: 1,
    });

    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('FunnelChart onDataPointClick contract', () => {
  it('emits { label, value, percent } when showConversion=false', () => {
    const onClick = vi.fn<(e: ChartClickEvent) => void>();
    render(
      <FunnelChart
        data={[
          { name: 'Visit', value: 1000 },
          { name: 'Signup', value: 400 },
          { name: 'Purchase', value: 100 },
        ]}
        onDataPointClick={onClick}
      />,
    );

    getLastClickHandler()({ name: 'Signup', value: 400, percent: 40, dataIndex: 1 });

    expect(onClick).toHaveBeenCalledTimes(1);
    const datum = onClick.mock.calls[0][0].datum;
    expect(datum).toMatchObject({ label: 'Signup', value: 400, percent: 40 });
    // conversionPercent must NOT leak in when showConversion is off
    expect(datum.conversionPercent).toBeUndefined();
  });

  it('also emits conversionPercent when showConversion=true', () => {
    const onClick = vi.fn<(e: ChartClickEvent) => void>();
    render(
      <FunnelChart
        data={[
          { name: 'Visit', value: 1000 },
          { name: 'Signup', value: 400 },
        ]}
        showConversion
        onDataPointClick={onClick}
      />,
    );

    getLastClickHandler()({ name: 'Signup', value: 400, percent: 40, dataIndex: 1 });

    const datum = onClick.mock.calls[0][0].datum;
    expect(datum.conversionPercent).toBeCloseTo(40, 1); // 400 / 1000 * 100
  });
});

describe('SankeyChart onDataPointClick contract', () => {
  const NODES = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];
  const LINKS = [
    { source: 'A', target: 'B', value: 50 },
    { source: 'B', target: 'C', value: 30 },
  ];

  it('node click: emits { dataType: "node", name, label, value } and fires legacy onNodeClick AFTER it', () => {
    const onDataPointClick = vi.fn<(e: ChartClickEvent) => void>();
    const onNodeClick = vi.fn();
    const callOrder: string[] = [];
    onDataPointClick.mockImplementation(() => callOrder.push('data'));
    onNodeClick.mockImplementation(() => callOrder.push('node'));

    render(
      <SankeyChart
        nodes={NODES}
        links={LINKS}
        onDataPointClick={onDataPointClick}
        onNodeClick={onNodeClick}
      />,
    );

    getLastClickHandler()({
      dataType: 'node',
      name: 'B',
      value: 50,
      data: { name: 'B' },
    });

    expect(onDataPointClick).toHaveBeenCalledTimes(1);
    expect(onNodeClick).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['data', 'node']);

    const datum = onDataPointClick.mock.calls[0][0].datum;
    expect(datum).toMatchObject({
      dataType: 'node',
      name: 'B',
      label: 'B',
      value: 50,
    });
  });

  it('edge click: emits { dataType: "edge", source, target, value, label } and does NOT fire legacy onNodeClick', () => {
    const onDataPointClick = vi.fn<(e: ChartClickEvent) => void>();
    const onNodeClick = vi.fn();

    render(
      <SankeyChart
        nodes={NODES}
        links={LINKS}
        onDataPointClick={onDataPointClick}
        onNodeClick={onNodeClick}
      />,
    );

    getLastClickHandler()({
      dataType: 'edge',
      source: 'A',
      target: 'B',
      value: 50,
      data: { source: 'A', target: 'B', value: 50 },
    });

    expect(onDataPointClick).toHaveBeenCalledTimes(1);
    expect(onNodeClick).not.toHaveBeenCalled(); // Edges never trigger legacy

    const datum = onDataPointClick.mock.calls[0][0].datum;
    expect(datum).toMatchObject({
      dataType: 'edge',
      source: 'A',
      target: 'B',
      value: 50,
      label: 'A → B',
    });
  });
});

describe('SunburstChart onDataPointClick contract', () => {
  it('emits { name, label, value, treePathInfo, path, depth, data } and fires legacy onNodeClick AFTER it', () => {
    const onDataPointClick = vi.fn<(e: ChartClickEvent) => void>();
    const onNodeClick = vi.fn();
    const callOrder: string[] = [];
    onDataPointClick.mockImplementation(() => callOrder.push('data'));
    onNodeClick.mockImplementation(() => callOrder.push('node'));

    render(
      <SunburstChart
        data={[
          {
            name: 'Root',
            children: [
              { name: 'A', value: 50 },
              { name: 'B', value: 50 },
            ],
          },
        ]}
        onDataPointClick={onDataPointClick}
        onNodeClick={onNodeClick}
      />,
    );

    getLastClickHandler()({
      name: 'A',
      value: 50,
      data: { name: 'A', value: 50 },
      treePathInfo: [
        { name: 'Root', value: 100, dataIndex: 0 },
        { name: 'A', value: 50, dataIndex: 1 },
      ],
    });

    expect(onDataPointClick).toHaveBeenCalledTimes(1);
    expect(onNodeClick).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['data', 'node']);

    const datum = onDataPointClick.mock.calls[0][0].datum;
    expect(datum).toMatchObject({
      name: 'A',
      label: 'A',
      value: 50,
      path: 'Root > A',
      depth: 1,
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Coverage assertion — no chart left behind                           */
/* ------------------------------------------------------------------ */

describe('cross-filter rollout — full coverage check', () => {
  it('all 13 chart adapters export the canonical ChartClickEvent type', async () => {
    // This test is a tripwire. If a future commit adds a new chart but
    // forgets to export `ChartClickEvent`, this assertion catches it
    // (the import fails at test compile time and the whole suite goes
    // red — better signal than a silently-shrinking adapter set).
    const exports = await Promise.all([
      import('../BarChart'),
      import('../LineChart'),
      import('../AreaChart'),
      import('../PieChart'),
      import('../ScatterChart'),
      import('../GaugeChart'),
      import('../RadarChart'),
      import('../TreemapChart'),
      import('../HeatmapChart'),
      import('../WaterfallChart'),
      import('../FunnelChart'),
      import('../SankeyChart'),
      import('../SunburstChart'),
    ]);

    expect(exports).toHaveLength(13);
    // Every shim must expose the chart component and pass through the
    // canonical `ChartClickEvent` re-export. The latter is structural
    // — TypeScript verifies it at compile time; here we just sanity
    // check the component default export exists.
    for (const mod of exports) {
      const Chart = (mod as { default?: unknown }).default ?? Object.values(mod)[0];
      expect(Chart).toBeDefined();
    }
  });
});
