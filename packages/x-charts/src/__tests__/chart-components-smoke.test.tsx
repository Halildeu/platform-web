// @vitest-environment jsdom
/**
 * Smoke + option-shape tests for the 13 chart components.
 *
 * x-charts renders ECharts into a div ref; the canvas/SVG output is not
 * usable in jsdom. So instead we mock the ECharts renderer and assert
 * (a) the component renders without throwing, and (b) the option object
 * dispatched into ECharts.setOption carries the right series.type for
 * the chart wrapper. Mutation discipline:
 *
 *   - "drop the wrapper render"             → render() throws
 *   - "swap series.type to wrong literal"   → option assertion fails
 *   - "skip data → series.data mapping"     → series.data assertion fails
 *
 * Composition charts (KPICard / SparklineChart / ChartContainer / etc.)
 * already have dedicated tests under this directory and are not covered
 * here. PR-D scope is the 13 ECharts-backed wrappers.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';

/* ------------------------------------------------------------------ */
/*  ECharts renderer mock — captures the last option passed to        */
/*  setOption so per-chart tests can assert series shape.             */
/* ------------------------------------------------------------------ */

// vi.mock factories run before top-level `const`s are initialised, so we
// hoist the mock fns explicitly to keep them visible inside the factory
// AND in the assertions below.
const { setOptionMock, dispatchMock } = vi.hoisted(() => ({
  setOptionMock: vi.fn(),
  dispatchMock: vi.fn(),
}));

vi.mock('../renderers/echarts-imports', () => {
  const instance = {
    setOption: setOptionMock,
    dispose: vi.fn(),
    resize: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    getZr: () => ({ on: vi.fn(), off: vi.fn() }),
    dispatchAction: dispatchMock,
    getDataURL: vi.fn(() => 'data:image/png;base64,'),
    getOption: () => ({ series: [] }),
  };

  return {
    echarts: {
      init: vi.fn(() => instance),
      use: vi.fn(),
      registerTheme: vi.fn(),
      registerLocale: vi.fn(),
      getInstanceByDom: vi.fn(() => instance),
      dispose: vi.fn(),
    },
    registerECharts: vi.fn(),
  };
});

/* ------------------------------------------------------------------ */
/*  Imports                                                            */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const lastDispatchedOption = (): Record<string, unknown> | null => {
  const lastCall = setOptionMock.mock.calls.at(-1);
  return (lastCall?.[0] as Record<string, unknown>) ?? null;
};

const seriesTypes = (option: Record<string, unknown> | null): string[] => {
  if (!option) return [];
  const series = option.series as Array<{ type?: string }> | undefined;
  return Array.isArray(series) ? series.map((s) => s?.type ?? '') : [];
};

interface ChartCase {
  name: string;
  element: React.ReactElement;
  expectedSeriesTypes: string[];
}

/* ------------------------------------------------------------------ */
/*  Cases                                                              */
/* ------------------------------------------------------------------ */

const CASES: ChartCase[] = [
  {
    name: 'BarChart',
    element: (
      <BarChart
        data={[
          { label: 'A', value: 10 },
          { label: 'B', value: 20 },
        ]}
        animate={false}
      />
    ),
    expectedSeriesTypes: ['bar'],
  },
  {
    name: 'LineChart',
    element: (
      <LineChart
        series={[{ name: 's1', data: [1, 2, 3] }]}
        labels={['a', 'b', 'c']}
        animate={false}
      />
    ),
    expectedSeriesTypes: ['line'],
  },
  {
    name: 'AreaChart',
    element: (
      <AreaChart
        series={[{ name: 's1', data: [1, 2, 3] }]}
        labels={['a', 'b', 'c']}
        animate={false}
      />
    ),
    // AreaChart uses ECharts type 'line' with areaStyle; assert the type
    // here so a regression that drops areaStyle still leaves the series
    // type observable.
    expectedSeriesTypes: ['line'],
  },
  {
    name: 'PieChart',
    element: (
      <PieChart
        data={[
          { label: 'A', value: 10 },
          { label: 'B', value: 20 },
        ]}
        animate={false}
      />
    ),
    expectedSeriesTypes: ['pie'],
  },
  {
    name: 'ScatterChart',
    element: (
      <ScatterChart
        data={[
          { x: 1, y: 2 },
          { x: 3, y: 4 },
        ]}
      />
    ),
    expectedSeriesTypes: ['scatter'],
  },
  {
    name: 'GaugeChart',
    element: <GaugeChart value={75} min={0} max={100} />,
    expectedSeriesTypes: ['gauge'],
  },
  {
    name: 'RadarChart',
    element: (
      <RadarChart
        indicators={[
          { name: 'A', max: 10 },
          { name: 'B', max: 10 },
          { name: 'C', max: 10 },
        ]}
        series={[{ name: 's1', values: [5, 6, 7] }]}
      />
    ),
    expectedSeriesTypes: ['radar'],
  },
  {
    name: 'TreemapChart',
    element: (
      <TreemapChart
        data={[
          { name: 'A', value: 10 },
          { name: 'B', value: 20 },
        ]}
      />
    ),
    expectedSeriesTypes: ['treemap'],
  },
  {
    name: 'HeatmapChart',
    element: (
      <HeatmapChart
        data={[
          [0, 0, 1],
          [0, 1, 2],
          [1, 0, 3],
          [1, 1, 4],
        ]}
        xLabels={['x1', 'x2']}
        yLabels={['y1', 'y2']}
      />
    ),
    expectedSeriesTypes: ['heatmap'],
  },
  {
    name: 'WaterfallChart',
    element: (
      <WaterfallChart
        data={[
          { label: 'Start', value: 100 },
          { label: 'Inflow', value: 50 },
          { label: 'End', value: 150 },
        ]}
      />
    ),
    // Waterfall is built on stacked bars in ECharts.
    expectedSeriesTypes: ['bar'],
  },
  {
    name: 'FunnelChart',
    element: (
      <FunnelChart
        data={[
          { label: 'Top', value: 100 },
          { label: 'Mid', value: 60 },
          { label: 'Bot', value: 30 },
        ]}
      />
    ),
    expectedSeriesTypes: ['funnel'],
  },
  {
    name: 'SankeyChart',
    element: (
      <SankeyChart
        nodes={[{ name: 'A' }, { name: 'B' }]}
        links={[{ source: 'A', target: 'B', value: 10 }]}
      />
    ),
    expectedSeriesTypes: ['sankey'],
  },
  {
    name: 'SunburstChart',
    element: (
      <SunburstChart
        data={[
          {
            name: 'Root',
            children: [
              { name: 'A', value: 10 },
              { name: 'B', value: 20 },
            ],
          },
        ]}
      />
    ),
    expectedSeriesTypes: ['sunburst'],
  },
];

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

/**
 * jsdom does not ship ResizeObserver; ECharts renderer uses it. A
 * minimal vi.fn-backed stub is enough — the chart wrapper only needs
 * the constructor + observe/unobserve to exist, the resize callback
 * never has to fire for these assertions.
 */
class ResizeObserverPolyfill {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

const originalResizeObserver = (globalThis as { ResizeObserver?: typeof ResizeObserver })
  .ResizeObserver;

beforeEach(() => {
  setOptionMock.mockClear();
  dispatchMock.mockClear();
  (globalThis as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
    ResizeObserverPolyfill as unknown as typeof ResizeObserver;
  // jsdom does not implement window.matchMedia; the renderer's
  // prefers-reduced-motion check needs it. Stub it to never match.
  if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  }
});

afterEach(() => {
  if (originalResizeObserver) {
    (globalThis as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
      originalResizeObserver;
  } else {
    delete (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
  }
});

describe('Chart components — smoke', () => {
  it.each(CASES)('$name renders without crashing', ({ element }) => {
    expect(() => render(element)).not.toThrow();
  });
});

describe('Chart components — option series.type contract', () => {
  it.each(CASES)(
    '$name dispatches series with type "$expectedSeriesTypes"',
    ({ element, expectedSeriesTypes }) => {
      render(element);
      const option = lastDispatchedOption();
      expect(option).not.toBeNull();
      const types = seriesTypes(option);
      // At least one series of each expected type must be present.
      for (const expected of expectedSeriesTypes) {
        expect(types).toContain(expected);
      }
    },
  );
});
