// @vitest-environment jsdom
/**
 * Faz 21.5-B PR-B2 — bulk a11y contract for all 12 charts that the
 * bulk PR brought into the useChartA11y / ChartA11yShell composition.
 *
 * BarChart has its own dedicated `bar-chart-a11y.test.tsx` from PR-B1
 * (10 tests). This spec parametrizes the same contract across the
 * remaining 12 charts so any future regression on a per-chart shell
 * integration is caught with mutation-aware coverage.
 *
 * Each chart × 3 assertions = 36 new mutation killers:
 *   1. role="region" + tabIndex=0 + aria-describedby on chart container
 *   2. Hidden data table id matches the chart's aria-describedby
 *   3. role="status" aria-live="polite" announcement region present
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

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

const { setOptionMock, dispatchMock } = vi.hoisted(() => ({
  setOptionMock: vi.fn(),
  dispatchMock: vi.fn(),
}));

vi.mock('../renderers/echarts-imports', () => {
  const fakeInstance = {
    setOption: setOptionMock,
    dispatchAction: dispatchMock,
    dispose: vi.fn(),
    resize: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    getZr: vi.fn(() => ({ on: vi.fn(), off: vi.fn() })),
    getDataURL: vi.fn(),
    getOption: vi.fn(() => ({})),
  };
  return {
    echarts: {
      init: vi.fn(() => fakeInstance),
      registerLocale: vi.fn(),
      registerTheme: vi.fn(),
    },
    registerECharts: vi.fn(),
  };
});

class ResizeObserverPolyfill {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
const originalResizeObserver = (globalThis as { ResizeObserver?: typeof ResizeObserver })
  .ResizeObserver;
const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver =
    ResizeObserverPolyfill as unknown as typeof ResizeObserver;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver =
    originalResizeObserver;
  window.matchMedia = originalMatchMedia;
});

const SAMPLE_LINE_LABELS = ['Jan', 'Feb', 'Mar'];
const SAMPLE_LINE_SERIES = [{ name: 's', data: [10, 20, 30] }];

const charts = [
  {
    name: 'LineChart',
    testId: 'line-chart',
    element: () => <LineChart series={SAMPLE_LINE_SERIES} labels={SAMPLE_LINE_LABELS} />,
  },
  {
    name: 'AreaChart',
    testId: 'area-chart',
    element: () => <AreaChart series={SAMPLE_LINE_SERIES} labels={SAMPLE_LINE_LABELS} />,
  },
  {
    name: 'PieChart',
    testId: 'pie-chart',
    element: () => (
      <PieChart
        data={[
          { label: 'A', value: 30 },
          { label: 'B', value: 70 },
        ]}
      />
    ),
  },
  {
    name: 'ScatterChart',
    testId: 'scatter-chart',
    element: () => (
      <ScatterChart
        data={[
          { x: 1, y: 2 },
          { x: 3, y: 4 },
        ]}
      />
    ),
  },
  {
    name: 'GaugeChart',
    testId: 'gauge-chart',
    element: () => <GaugeChart value={42} />,
  },
  {
    name: 'RadarChart',
    testId: 'radar-chart',
    element: () => (
      <RadarChart
        indicators={[
          { name: 'A', max: 10 },
          { name: 'B', max: 10 },
        ]}
        series={[{ name: 's', data: [5, 7] }]}
      />
    ),
  },
  {
    name: 'TreemapChart',
    testId: 'treemap-chart',
    element: () => (
      <TreemapChart
        data={[
          { name: 'A', value: 10 },
          { name: 'B', value: 20 },
        ]}
      />
    ),
  },
  {
    name: 'HeatmapChart',
    testId: 'heatmap-chart',
    element: () => (
      <HeatmapChart
        data={[
          [0, 0, 5],
          [0, 1, 6],
          [1, 0, 7],
          [1, 1, 8],
        ]}
        xLabels={['x1', 'x2']}
        yLabels={['y1', 'y2']}
      />
    ),
  },
  {
    name: 'WaterfallChart',
    testId: 'waterfall-chart',
    element: () => (
      <WaterfallChart
        data={[
          { label: 'Start', value: 100, type: 'total' },
          { label: 'A', value: 20 },
          { label: 'End', value: 120, type: 'total' },
        ]}
      />
    ),
  },
  {
    name: 'FunnelChart',
    testId: 'funnel-chart',
    element: () => (
      <FunnelChart
        data={[
          { name: 'Visit', value: 100 },
          { name: 'Lead', value: 50 },
          { name: 'Sale', value: 10 },
        ]}
      />
    ),
  },
  {
    name: 'SankeyChart',
    testId: 'sankey-chart',
    element: () => (
      <SankeyChart
        nodes={[{ name: 'A' }, { name: 'B' }]}
        links={[{ source: 'A', target: 'B', value: 5 }]}
      />
    ),
  },
  {
    name: 'SunburstChart',
    testId: 'sunburst-chart',
    element: () => (
      <SunburstChart
        data={[
          { name: 'A', value: 10 },
          { name: 'B', value: 20 },
        ]}
      />
    ),
  },
] as const;

describe.each(charts)(
  '$name — useChartA11y bulk a11y contract (Faz 21.5-B PR-B2)',
  ({ name, testId, element }) => {
    it(`[${name}] container exposes role="region" + tabIndex=0 + aria-describedby`, () => {
      render(element());
      const chart = screen.getByTestId(testId);
      expect(chart.getAttribute('role')).toBe('region');
      expect(chart.getAttribute('tabindex')).toBe('0');
      expect(chart.getAttribute('aria-describedby')).toMatch(/-data-table$/);
    });

    it(`[${name}] hidden data table id matches chart aria-describedby`, () => {
      const { container } = render(element());
      const chart = screen.getByTestId(testId);
      const describedBy = chart.getAttribute('aria-describedby');
      const table = container.querySelector('table');
      expect(table).not.toBeNull();
      expect(table?.getAttribute('id')).toBe(describedBy);
    });

    it(`[${name}] aria-live region with role="status" present`, () => {
      const { container } = render(element());
      const liveRegion = container.querySelector('[role="status"]');
      expect(liveRegion).not.toBeNull();
      expect(liveRegion?.getAttribute('aria-live')).toBe('polite');
    });
  },
);
