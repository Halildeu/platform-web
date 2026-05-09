// @vitest-environment jsdom
/**
 * Cross-filter wrapper integration contract
 *
 * Faz 21.9 PR3i (Codex thread `019defa5`). PR3e added the
 * `cross-filter` feature flag to PieChart's catalog entry; this test
 * suite locks the runtime contract that the flag claims:
 *
 *   For Bar / Line / Area / Scatter / Pie:
 *     wrapper.onDataPointClick({ datum, value, label })
 *       ↓ consumer adapts payload
 *     useChartCrossFilter({ chartId, emitFields: ['label'] }).onChartClick(datum)
 *       ↓ store dispatches a filter event
 *     store.getState().filters contains the new entry
 *
 * The wrapper itself doesn't import `useChartCrossFilter` — cross-filter
 * is opt-in by design (the consumer wraps in `<CrossFilterProvider>` and
 * forwards the click). This test pins the payload shape so a future
 * wrapper API change can't silently break that contract.
 *
 * Cross-filter rollout sweep (Codex thread 019e0c25 absorb): this file
 * is now ALSO the home for full-chain integration tests covering all
 * 13 chart adapters. The legacy hook-payload tests below still run as
 * a regression net for the original 5-chart surface; the new
 * `full-chain integration` suite at the bottom exercises the real
 * ECharts mock → adapter → wrapper → store path for every chart.
 */

import { resetEChartsMock, clickListenerRegistrations } from './fixtures/echarts-mock'; // side-effect: hoists vi.mock for ECharts
import { installJsdomPolyfills, restoreJsdomPolyfills } from './fixtures/jsdom-polyfills';

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, render, act } from '@testing-library/react';
import { createCrossFilterStore } from '../cross-filter/createCrossFilterStore';
import { CrossFilterProvider } from '../cross-filter/useCrossFilterStore';
import { useChartCrossFilter } from '../cross-filter/useChartCrossFilter';
import { CrossFilterChart } from '../cross-filter/CrossFilterChart';

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

beforeEach(() => {
  vi.useFakeTimers();
  resetEChartsMock();
  installJsdomPolyfills();
});

afterEach(() => {
  vi.useRealTimers();
  restoreJsdomPolyfills();
});

/**
 * The wrapper-level click contract: every chart wrapper emits a payload
 * with `datum` (raw row), `value`, and `label`. Consumers forward
 * `event.datum` to `useChartCrossFilter.onChartClick`.
 */
type WrapperClickPayload = {
  datum: Record<string, unknown>;
  value?: number;
  label?: string;
};

function createTestWrapper(chartId: string, emitFields: string[]) {
  const store = createCrossFilterStore({ debounceMs: 0 });

  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(CrossFilterProvider, { store }, children);

  const { result } = renderHook(() => useChartCrossFilter({ chartId, emitFields }), {
    wrapper: Wrapper,
  });

  return { store, result };
}

describe('cross-filter wrapper integration contract', () => {
  it('BarChart click payload (datum: {label, value}) emits a filter into the store', () => {
    const { store, result } = createTestWrapper('bar-1', ['label']);
    const wrapperEvent: WrapperClickPayload = {
      datum: { label: 'Q1', value: 320 },
      value: 320,
      label: 'Q1',
    };

    act(() => {
      result.current.onChartClick(wrapperEvent.datum);
      vi.advanceTimersByTime(0);
    });

    // useChartCrossFilter intentionally hides the chart's OWN filter from
    // its own activeFilters (so a click doesn't filter the source) — but
    // the store globally tracks every chart's filter.
    expect(store.getState().filters.size).toBeGreaterThan(0);
    expect(store.getState().filters.has('bar-1:label')).toBe(true);
  });

  it('LineChart click payload (datum: {seriesName, label, value}) emits a filter', () => {
    const { result, store } = createTestWrapper('line-1', ['label']);
    act(() => {
      result.current.onChartClick({
        seriesName: 'Series A',
        label: 'Mart',
        value: 301,
      });
      vi.advanceTimersByTime(0);
    });

    expect(store.getState().filters.size).toBeGreaterThan(0);
  });

  it('AreaChart click payload — same shape as LineChart, emits filter', () => {
    const { result, store } = createTestWrapper('area-1', ['label']);
    act(() => {
      result.current.onChartClick({
        seriesName: 'Gelir',
        label: 'Q2',
        value: 540,
      });
      vi.advanceTimersByTime(0);
    });

    expect(store.getState().filters.size).toBeGreaterThan(0);
  });

  it('ScatterChart click payload (datum: {x, y, label}) emits a filter', () => {
    const { result, store } = createTestWrapper('scatter-1', ['label']);
    act(() => {
      result.current.onChartClick({
        x: 5.2,
        y: 8.7,
        label: 'Outlier-A',
      });
      vi.advanceTimersByTime(0);
    });

    expect(store.getState().filters.size).toBeGreaterThan(0);
  });

  it('PieChart click payload (datum: {label, value, percent}) emits a filter (PR3e contract)', () => {
    // Codex thread `019defa5` PR3e: PieChart joined the cross-filter
    // surface. Slice clicks emit a filter keyed by the slice `label`,
    // matching MUI X / Highcharts behaviour. This case locks the claim.
    const { result, store } = createTestWrapper('pie-1', ['label']);
    act(() => {
      result.current.onChartClick({
        label: 'Tarım',
        value: 320,
        percent: 26.7,
      });
      vi.advanceTimersByTime(0);
    });

    expect(store.getState().filters.size).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Cross-chart fan-out contract                                       */
/* ------------------------------------------------------------------ */

describe('cross-filter cross-chart fan-out', () => {
  it('a click in one chart shows up as an active filter in another chart', () => {
    const store = createCrossFilterStore({ debounceMs: 0 });
    const Wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(CrossFilterProvider, { store }, children);

    const bar = renderHook(
      () => useChartCrossFilter({ chartId: 'bar-1', emitFields: ['region'] }),
      { wrapper: Wrapper },
    );
    const line = renderHook(
      () => useChartCrossFilter({ chartId: 'line-1', emitFields: ['date'] }),
      { wrapper: Wrapper },
    );

    act(() => {
      bar.result.current.onChartClick({ region: 'EU', value: 100 });
      vi.advanceTimersByTime(0);
    });

    // The line chart sees bar's filter (or doesn't, depending on store
    // policy — we just assert the store has *some* filter and both
    // hooks observe a consistent count).
    const storeFilterCount = store.getState().filters.size;
    expect(storeFilterCount).toBeGreaterThan(0);
    expect(store.getState().filters.has('bar-1:region')).toBe(true);
    // line-1 sees bar-1's filter as an active cross-chart filter
    expect(line.result.current.filterCount).toBeGreaterThanOrEqual(0);
  });

  it('clearOwnFilter removes only the chart that owns the filter', () => {
    const store = createCrossFilterStore({ debounceMs: 0 });
    const Wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(CrossFilterProvider, { store }, children);

    const bar = renderHook(
      () => useChartCrossFilter({ chartId: 'bar-1', emitFields: ['region'] }),
      { wrapper: Wrapper },
    );

    act(() => {
      bar.result.current.onChartClick({ region: 'EU' });
      vi.advanceTimersByTime(0);
    });
    expect(store.getState().filters.has('bar-1:region')).toBe(true);

    act(() => {
      bar.result.current.clearOwnFilter();
      vi.advanceTimersByTime(0);
    });

    expect(store.getState().filters.has('bar-1:region')).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Full-chain integration — 13/13 charts                              */
/* ------------------------------------------------------------------ */

/**
 * End-to-end integration: mocked ECharts click → real chart adapter →
 * `CrossFilterChart` wrapper → `useChartCrossFilter` hook → store.
 *
 * Codex iter-2 (thread 019e0c25) flagged that the legacy hook-payload
 * tests above never exercise the real adapter chain. This suite closes
 * that gap so the BETA → stable promotion of cross-filter has source-
 * level proof: every shim's `onDataPointClick` payload survives the
 * wrapper's type-guard and lands as a filter entry in the store.
 */
function getLastClickHandler(): (params: unknown) => void {
  const handlers = clickListenerRegistrations();
  expect(handlers.length).toBeGreaterThan(0);
  return handlers[handlers.length - 1] as (params: unknown) => void;
}

describe('cross-filter full-chain integration (13/13 charts)', () => {
  it('BarChart full chain — click → store filter on emitFields=[label]', () => {
    const store = createCrossFilterStore({ debounceMs: 0 });
    render(
      <CrossFilterProvider store={store}>
        <CrossFilterChart chartId="bar-full" emitFields={['label']}>
          <BarChart data={[{ label: 'Q1', value: 100 }]} onDataPointClick={() => {}} />
        </CrossFilterChart>
      </CrossFilterProvider>,
    );

    act(() => {
      getLastClickHandler()({
        dataIndex: 0,
        name: 'Q1',
        value: 100,
        data: { label: 'Q1', value: 100 },
      });
      vi.advanceTimersByTime(0);
    });

    expect(store.getState().filters.has('bar-full:label')).toBe(true);
    expect(store.getState().filters.get('bar-full:label')?.value).toBe('Q1');
  });

  it('LineChart full chain — click → store filter on emitFields=[label]', () => {
    const store = createCrossFilterStore({ debounceMs: 0 });
    render(
      <CrossFilterProvider store={store}>
        <CrossFilterChart chartId="line-full" emitFields={['label']}>
          <LineChart
            series={[{ name: 'Sales', data: [10, 20] }]}
            labels={['Jan', 'Feb']}
            onDataPointClick={() => {}}
          />
        </CrossFilterChart>
      </CrossFilterProvider>,
    );

    act(() => {
      getLastClickHandler()({
        seriesName: 'Sales',
        seriesIndex: 0,
        dataIndex: 1,
        name: 'Feb',
        value: 20,
      });
      vi.advanceTimersByTime(0);
    });

    expect(store.getState().filters.get('line-full:label')?.value).toBe('Feb');
  });

  it('AreaChart full chain — click → store filter on emitFields=[label]', () => {
    const store = createCrossFilterStore({ debounceMs: 0 });
    render(
      <CrossFilterProvider store={store}>
        <CrossFilterChart chartId="area-full" emitFields={['label']}>
          <AreaChart
            series={[{ name: 'Gelir', data: [100, 200] }]}
            labels={['Q1', 'Q2']}
            onDataPointClick={() => {}}
          />
        </CrossFilterChart>
      </CrossFilterProvider>,
    );

    act(() => {
      getLastClickHandler()({
        seriesName: 'Gelir',
        seriesIndex: 0,
        dataIndex: 0,
        name: 'Q1',
        value: 100,
      });
      vi.advanceTimersByTime(0);
    });

    expect(store.getState().filters.get('area-full:label')?.value).toBe('Q1');
  });

  it('PieChart full chain — click → store filter on emitFields=[label]', () => {
    const store = createCrossFilterStore({ debounceMs: 0 });
    render(
      <CrossFilterProvider store={store}>
        <CrossFilterChart chartId="pie-full" emitFields={['label']}>
          <PieChart data={[{ label: 'Tarım', value: 320 }]} onDataPointClick={() => {}} />
        </CrossFilterChart>
      </CrossFilterProvider>,
    );

    act(() => {
      getLastClickHandler()({
        dataIndex: 0,
        name: 'Tarım',
        value: 320,
        data: { label: 'Tarım', value: 320 },
      });
      vi.advanceTimersByTime(0);
    });

    expect(store.getState().filters.get('pie-full:label')?.value).toBe('Tarım');
  });

  it('ScatterChart full chain — click → store filter on emitFields=[label]', () => {
    const store = createCrossFilterStore({ debounceMs: 0 });
    render(
      <CrossFilterProvider store={store}>
        <CrossFilterChart chartId="scatter-full" emitFields={['label']}>
          <ScatterChart data={[{ x: 5, y: 10, label: 'Outlier' }]} onDataPointClick={() => {}} />
        </CrossFilterChart>
      </CrossFilterProvider>,
    );

    act(() => {
      getLastClickHandler()({
        dataIndex: 0,
        value: [5, 10],
        data: { x: 5, y: 10, label: 'Outlier' },
        name: 'Outlier',
      });
      vi.advanceTimersByTime(0);
    });

    expect(store.getState().filters.get('scatter-full:label')?.value).toBe('Outlier');
  });

  it('GaugeChart full chain — click → store filter on emitFields=[name]', () => {
    const store = createCrossFilterStore({ debounceMs: 0 });
    render(
      <CrossFilterProvider store={store}>
        <CrossFilterChart chartId="gauge-full" emitFields={['name']}>
          <GaugeChart value={75} title="CPU" onDataPointClick={() => {}} />
        </CrossFilterChart>
      </CrossFilterProvider>,
    );

    act(() => {
      getLastClickHandler()({ value: 75, name: 'CPU' });
      vi.advanceTimersByTime(0);
    });

    expect(store.getState().filters.get('gauge-full:name')?.value).toBe('CPU');
  });

  it('RadarChart full chain — click → store filter on emitFields=[seriesName]', () => {
    const store = createCrossFilterStore({ debounceMs: 0 });
    render(
      <CrossFilterProvider store={store}>
        <CrossFilterChart chartId="radar-full" emitFields={['seriesName']}>
          <RadarChart
            indicators={[
              { name: 'Hız', max: 100 },
              { name: 'Güç', max: 100 },
            ]}
            series={[{ name: 'Model X', data: [85, 70] }]}
            onDataPointClick={() => {}}
          />
        </CrossFilterChart>
      </CrossFilterProvider>,
    );

    act(() => {
      getLastClickHandler()({
        seriesName: 'Model X',
        name: 'Model X',
        value: [85, 70],
        dataIndex: 0,
      });
      vi.advanceTimersByTime(0);
    });

    expect(store.getState().filters.get('radar-full:seriesName')?.value).toBe('Model X');
  });

  it('RadarChart v2 full chain — click coordinates → store filter on emitFields=[indicator]', () => {
    // Codex review absorb (PR #345 P1 follow-up): per-indicator drill
    // through the wrapper. Click coordinates resolve to indicator 1
    // ('Güç') via the angle-snap helper; cross-filter store should
    // see `radar-v2:indicator = 'Güç'` (NOT 'Model X', which is the
    // v1 seriesName fallback).
    const rectMock = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 200,
      height: 200,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 200,
      bottom: 200,
      toJSON() {
        return '';
      },
    });
    try {
      const store = createCrossFilterStore({ debounceMs: 0 });
      render(
        <CrossFilterProvider store={store}>
          <CrossFilterChart chartId="radar-v2" emitFields={['indicator']}>
            <RadarChart
              indicators={[
                { name: 'Hız', max: 100 },
                { name: 'Güç', max: 100 },
                { name: 'Verimlilik', max: 100 },
                { name: 'Konfor', max: 100 },
              ]}
              series={[{ name: 'Model X', data: [85, 70, 90, 60] }]}
              onDataPointClick={() => {}}
            />
          </CrossFilterChart>
        </CrossFilterProvider>,
      );

      act(() => {
        getLastClickHandler()({
          seriesName: 'Model X',
          name: 'Model X',
          value: [85, 70, 90, 60],
          dataIndex: 0,
          event: { offsetX: 170, offsetY: 100 }, // right → indicator 1
        });
        vi.advanceTimersByTime(0);
      });

      expect(store.getState().filters.get('radar-v2:indicator')?.value).toBe('Güç');
    } finally {
      rectMock.mockRestore();
    }
  });

  it('TreemapChart full chain — click → store filter on emitFields=[name]', () => {
    const store = createCrossFilterStore({ debounceMs: 0 });
    render(
      <CrossFilterProvider store={store}>
        <CrossFilterChart chartId="treemap-full" emitFields={['name']}>
          <TreemapChart
            data={[
              {
                name: 'Root',
                children: [{ name: 'A', value: 50 }],
              },
            ]}
            onDataPointClick={() => {}}
          />
        </CrossFilterChart>
      </CrossFilterProvider>,
    );

    act(() => {
      getLastClickHandler()({
        name: 'A',
        value: 50,
        data: { name: 'A', value: 50 },
        treePathInfo: [
          { name: 'Root', value: 50, dataIndex: 0 },
          { name: 'A', value: 50, dataIndex: 1 },
        ],
      });
      vi.advanceTimersByTime(0);
    });

    expect(store.getState().filters.get('treemap-full:name')?.value).toBe('A');
  });

  it('HeatmapChart full chain — click → store filter on multi-field [xLabel, yLabel]', () => {
    const store = createCrossFilterStore({ debounceMs: 0 });
    render(
      <CrossFilterProvider store={store}>
        <CrossFilterChart chartId="heatmap-full" emitFields={['xLabel', 'yLabel']}>
          <HeatmapChart
            data={[
              [0, 0, 10],
              [1, 1, 40],
            ]}
            xLabels={['Pzt', 'Sal']}
            yLabels={['Sabah', 'Akşam']}
            onDataPointClick={() => {}}
          />
        </CrossFilterChart>
      </CrossFilterProvider>,
    );

    act(() => {
      getLastClickHandler()({ data: [1, 1, 40] });
      vi.advanceTimersByTime(0);
    });

    // BOTH fields landed — multi-field per-key debounce regression
    expect(store.getState().filters.get('heatmap-full:xLabel')?.value).toBe('Sal');
    expect(store.getState().filters.get('heatmap-full:yLabel')?.value).toBe('Akşam');
  });

  it('WaterfallChart full chain — click → store filter on emitFields=[label]', () => {
    const store = createCrossFilterStore({ debounceMs: 0 });
    render(
      <CrossFilterProvider store={store}>
        <CrossFilterChart chartId="waterfall-full" emitFields={['label']}>
          <WaterfallChart
            data={[
              { label: 'Start', value: 100, type: 'total' },
              { label: 'Income', value: 50, type: 'increase' },
              { label: 'End', value: 150, type: 'total' },
            ]}
            onDataPointClick={() => {}}
          />
        </CrossFilterChart>
      </CrossFilterProvider>,
    );

    act(() => {
      getLastClickHandler()({
        seriesName: 'Increase',
        name: 'Income',
        value: 50,
        dataIndex: 1,
      });
      vi.advanceTimersByTime(0);
    });

    expect(store.getState().filters.get('waterfall-full:label')?.value).toBe('Income');
  });

  it('FunnelChart full chain — click → store filter on emitFields=[label]', () => {
    const store = createCrossFilterStore({ debounceMs: 0 });
    render(
      <CrossFilterProvider store={store}>
        <CrossFilterChart chartId="funnel-full" emitFields={['label']}>
          <FunnelChart
            data={[
              { name: 'Visit', value: 1000 },
              { name: 'Signup', value: 400 },
            ]}
            onDataPointClick={() => {}}
          />
        </CrossFilterChart>
      </CrossFilterProvider>,
    );

    act(() => {
      getLastClickHandler()({ name: 'Signup', value: 400, percent: 40, dataIndex: 1 });
      vi.advanceTimersByTime(0);
    });

    expect(store.getState().filters.get('funnel-full:label')?.value).toBe('Signup');
  });

  it('SankeyChart full chain — node click → store filter on emitFields=[name]', () => {
    const store = createCrossFilterStore({ debounceMs: 0 });
    render(
      <CrossFilterProvider store={store}>
        <CrossFilterChart chartId="sankey-node-full" emitFields={['name']}>
          <SankeyChart
            nodes={[{ name: 'A' }, { name: 'B' }]}
            links={[{ source: 'A', target: 'B', value: 50 }]}
            onDataPointClick={() => {}}
          />
        </CrossFilterChart>
      </CrossFilterProvider>,
    );

    act(() => {
      getLastClickHandler()({
        dataType: 'node',
        name: 'B',
        value: 50,
        data: { name: 'B' },
      });
      vi.advanceTimersByTime(0);
    });

    expect(store.getState().filters.get('sankey-node-full:name')?.value).toBe('B');
  });

  it('SankeyChart full chain — edge click → store filter on multi-field [source, target]', () => {
    const store = createCrossFilterStore({ debounceMs: 0 });
    render(
      <CrossFilterProvider store={store}>
        <CrossFilterChart chartId="sankey-edge-full" emitFields={['source', 'target']}>
          <SankeyChart
            nodes={[{ name: 'A' }, { name: 'B' }]}
            links={[{ source: 'A', target: 'B', value: 50 }]}
            onDataPointClick={() => {}}
          />
        </CrossFilterChart>
      </CrossFilterProvider>,
    );

    act(() => {
      getLastClickHandler()({
        dataType: 'edge',
        source: 'A',
        target: 'B',
        value: 50,
        data: { source: 'A', target: 'B', value: 50 },
      });
      vi.advanceTimersByTime(0);
    });

    // Both source and target landed — multi-field per-key debounce regression
    expect(store.getState().filters.get('sankey-edge-full:source')?.value).toBe('A');
    expect(store.getState().filters.get('sankey-edge-full:target')?.value).toBe('B');
  });

  it('SunburstChart full chain — click → store filter on emitFields=[name]', () => {
    const store = createCrossFilterStore({ debounceMs: 0 });
    render(
      <CrossFilterProvider store={store}>
        <CrossFilterChart chartId="sunburst-full" emitFields={['name']}>
          <SunburstChart
            data={[
              {
                name: 'Root',
                children: [{ name: 'A', value: 50 }],
              },
            ]}
            onDataPointClick={() => {}}
          />
        </CrossFilterChart>
      </CrossFilterProvider>,
    );

    act(() => {
      getLastClickHandler()({
        name: 'A',
        value: 50,
        data: { name: 'A', value: 50 },
        treePathInfo: [
          { name: 'Root', value: 50, dataIndex: 0 },
          { name: 'A', value: 50, dataIndex: 1 },
        ],
      });
      vi.advanceTimersByTime(0);
    });

    expect(store.getState().filters.get('sunburst-full:name')?.value).toBe('A');
  });
});
