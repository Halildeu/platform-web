// @vitest-environment jsdom
/**
 * Smoke test for ChartPreviewLive's switch routing.
 *
 * Asserts that each catalog chart-id renders the expected x-charts
 * component (mocked with a sentinel testid) — proving the switch
 * cases route to the right component. Mutation discipline: removing a
 * case or routing it to the wrong component would flip its testid
 * assertion and fail the test deterministically.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@mfe/x-charts', () => {
  const sentinel = (kind: string) => {
    const Component: React.FC<{ title?: string }> = ({ title }) =>
      React.createElement('div', { 'data-testid': `mock-${kind}` }, title);
    Component.displayName = `Mock${kind}`;
    return Component;
  };

  const KPICardMock: React.FC<{
    title: string;
    value: string | number;
    chart?: React.ReactNode;
  }> = ({ title, value, chart }) =>
    React.createElement(
      'div',
      { 'data-testid': 'mock-kpi-card' },
      title,
      ' ',
      String(value),
      chart,
    );

  const ChartContainerMock: React.FC<{ children: React.ReactNode; title?: string }> = ({
    children,
    title,
  }) => React.createElement('div', { 'data-testid': 'mock-chart-container' }, title, children);

  const ChartToolbarMock: React.FC = () =>
    React.createElement('div', { 'data-testid': 'mock-chart-toolbar' });

  const ChartDashboardMock: React.FC<{ children: React.ReactNode }> = ({ children }) =>
    React.createElement('div', { 'data-testid': 'mock-chart-dashboard' }, children);

  return {
    BarChart: sentinel('bar'),
    LineChart: sentinel('line'),
    AreaChart: sentinel('area'),
    PieChart: sentinel('pie'),
    ScatterChart: sentinel('scatter'),
    GaugeChart: sentinel('gauge'),
    RadarChart: sentinel('radar'),
    TreemapChart: sentinel('treemap'),
    HeatmapChart: sentinel('heatmap'),
    WaterfallChart: sentinel('waterfall'),
    FunnelChart: sentinel('funnel'),
    SankeyChart: sentinel('sankey'),
    SunburstChart: sentinel('sunburst'),
    SparklineChart: sentinel('sparkline'),
    KPICard: KPICardMock,
    ChartContainer: ChartContainerMock,
    ChartToolbar: ChartToolbarMock,
    ChartDashboard: ChartDashboardMock,
    useChartInteractions: () => [
      {
        zoomLevel: 1,
        zoomIn: vi.fn(),
        zoomOut: vi.fn(),
        resetZoom: vi.fn(),
        isPanning: false,
        panOffset: { x: 0, y: 0 },
        brushRange: null,
        isBrushing: false,
        clearBrush: vi.fn(),
      },
      {},
    ],
    // Faz 21.9 PR2: useResponsiveBreakpoint drives PreviewBox height +
    // chart `size` clamp. The mock returns a stable 'desktop' breakpoint
    // so existing chart-routing tests keep matching their previous
    // baseline (no clamp, no height shrink).
    useResponsiveBreakpoint: () => 'desktop',
    // Faz 21.9 PR3a: shared chart-size contract — ChartPreviewLive now
    // imports CHART_CANVAS_HEIGHT from @mfe/x-charts instead of
    // mirroring it inline. The mock has to expose the same constant or
    // the module re-export crashes.
    CHART_CANVAS_HEIGHT: { sm: 200, md: 300, lg: 400 },
    CHART_SIZE_ORDER: ['sm', 'md', 'lg'],
    CrossFilterProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    useChartCrossFilter: () => ({
      activeFilters: [],
      onChartClick: vi.fn(),
      isFiltered: false,
      filterCount: 0,
      clearOwnFilter: vi.fn(),
    }),
    useCrossFilterStoreApi: () => ({
      getState: () => ({ clearAllFilters: vi.fn() }),
    }),
    useGridCrossFilter: () => ({
      activeFilters: [],
      pushGridFilters: vi.fn(),
      bridge: null,
    }),
    useDrillDown: () => ({
      currentDepth: 0,
      currentLevel: undefined,
      chartTypeOverride: undefined,
      canDrillDeeper: true,
      breadcrumbs: [{ label: 'All Sales', index: -1, isCurrent: true }],
      drillDown: vi.fn(),
      drillUp: vi.fn(),
      drillToRoot: vi.fn(),
      drillTo: vi.fn(),
      drillPath: [],
    }),
    DrillDownBreadcrumb: ({ items }: { items: Array<{ label: string }> }) =>
      React.createElement(
        'nav',
        { 'data-testid': 'mock-drill-down-breadcrumb' },
        items.map((it) => it.label).join(' / '),
      ),
    // Faz 21.4 PR-C — feature demo mock surface
    useRealTimeData: () => ({
      data: [],
      isPaused: false,
      addPoint: vi.fn(),
      addPoints: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      clear: vi.fn(),
    }),
    useChartExport: () => ({
      exportChart: vi.fn(),
    }),
    // Performance helpers — minimal stubs so PerfUtilityDemoLive can mount
    // inside the routing smoke tests. The real semantics are exercised in
    // PerfUtilityDemoLive.test.tsx with no mock.
    downsampleLTTB: (data: unknown[]) => data,
    useProgressiveRender: ({ data }: { data: unknown[] }) => ({
      visibleData: data ?? [],
      isComplete: true,
      progress: 1,
      forceComplete: vi.fn(),
    }),
    useLazyChart: () => ({ containerRef: { current: null }, shouldRender: true }),
    LRUCache: class {
      private map = new Map<unknown, unknown>();
      set(k: unknown, v: unknown) {
        this.map.set(k, v);
      }
      get(k: unknown) {
        return this.map.get(k);
      }
    },
    lazyChartImport: () => () => null,
  };
});

import ChartPreviewLive from '../ChartPreviewLive';

const CASES: Array<{ chartId: string; expectedTestId: string }> = [
  { chartId: 'bar-chart', expectedTestId: 'mock-bar' },
  { chartId: 'line-chart', expectedTestId: 'mock-line' },
  { chartId: 'area-chart', expectedTestId: 'mock-area' },
  { chartId: 'pie-chart', expectedTestId: 'mock-pie' },
  { chartId: 'scatter-chart', expectedTestId: 'mock-scatter' },
  { chartId: 'gauge-chart', expectedTestId: 'mock-gauge' },
  { chartId: 'radar-chart', expectedTestId: 'mock-radar' },
  { chartId: 'treemap-chart', expectedTestId: 'mock-treemap' },
  { chartId: 'heatmap-chart', expectedTestId: 'mock-heatmap' },
  { chartId: 'waterfall-chart', expectedTestId: 'mock-waterfall' },
  { chartId: 'funnel-chart', expectedTestId: 'mock-funnel' },
  { chartId: 'sankey-chart', expectedTestId: 'mock-sankey' },
  { chartId: 'sunburst-chart', expectedTestId: 'mock-sunburst' },
  { chartId: 'kpi-card', expectedTestId: 'mock-kpi-card' },
  // 'sparkline-chart' renders three sparklines (line / area / bar) so it
  // gets its own dedicated test below to use getAllByTestId.
  { chartId: 'chart-dashboard', expectedTestId: 'mock-chart-dashboard' },
  { chartId: 'chart-container', expectedTestId: 'mock-chart-container' },
  { chartId: 'chart-toolbar', expectedTestId: 'mock-chart-toolbar' },
];

describe('ChartPreviewLive — switch routing per chart-id', () => {
  it.each(CASES)(
    'chart-id "$chartId" renders the $expectedTestId sentinel',
    ({ chartId, expectedTestId }) => {
      render(<ChartPreviewLive chartId={chartId} chartName={`${chartId} preview`} />);
      const sentinel = screen.getByTestId(expectedTestId);
      expect(sentinel).toBeInTheDocument();
      expect(screen.getByTestId(`design-lab-chart-preview-${chartId}`)).toBeInTheDocument();
    },
  );

  it('chart-id "sparkline-chart" renders all three variants (line / area / bar)', () => {
    render(<ChartPreviewLive chartId="sparkline-chart" chartName="Sparkline preview" />);
    const sparklines = screen.getAllByTestId('mock-sparkline');
    expect(sparklines).toHaveLength(3);
    expect(screen.getByTestId('design-lab-chart-preview-sparkline-chart')).toBeInTheDocument();
    expect(screen.getByText(/^line$/)).toBeInTheDocument();
    expect(screen.getByText(/^area$/)).toBeInTheDocument();
    expect(screen.getByText(/^bar$/)).toBeInTheDocument();
  });

  it('chart-id "cross-filter" mounts CrossFilterDemoLive (real provider)', () => {
    render(<ChartPreviewLive chartId="cross-filter" chartName="cross-filter preview" />);
    expect(screen.getByTestId('cross-filter-demo')).toBeInTheDocument();
    expect(screen.getByTestId('design-lab-chart-preview-cross-filter')).toBeInTheDocument();
  });

  /* Faz 21.4 PR-B — drill-down + chart-to-grid cross-filter demos */

  it('chart-id "cross-filter-grid" mounts CrossFilterGridDemoLive', () => {
    render(<ChartPreviewLive chartId="cross-filter-grid" chartName="cross-filter-grid preview" />);
    expect(screen.getByTestId('cross-filter-grid-demo')).toBeInTheDocument();
    expect(screen.getByTestId('design-lab-chart-preview-cross-filter-grid')).toBeInTheDocument();
  });

  it('chart-id "drill-down" mounts DrillDownDemoLive in basic mode', () => {
    render(<ChartPreviewLive chartId="drill-down" chartName="drill-down preview" />);
    expect(screen.getByTestId('drill-down-demo-basic')).toBeInTheDocument();
    expect(screen.getByTestId('design-lab-chart-preview-drill-down')).toBeInTheDocument();
  });

  it('chart-id "drill-down-history" mounts DrillDownDemoLive in history mode', () => {
    render(
      <ChartPreviewLive chartId="drill-down-history" chartName="drill-down-history preview" />,
    );
    expect(screen.getByTestId('drill-down-demo-history')).toBeInTheDocument();
    expect(screen.getByTestId('design-lab-chart-preview-drill-down-history')).toBeInTheDocument();
    // History mode exposes undo + redo + reset + depth/drill-count counter.
    // Faz 21.8 PR-X2: redo button restored — the cross-filter store already
    // retained `past` and `future` HistoryEntry stacks (each with full
    // drillPath snapshots), so the surface only needed wiring through
    // useDrillDown's new `redo`/`canRedo` properties.
    expect(screen.getByTestId('drill-down-undo')).toBeInTheDocument();
    expect(screen.getByTestId('drill-down-redo')).toBeInTheDocument();
    expect(screen.getByTestId('drill-down-history-reset')).toBeInTheDocument();
    expect(screen.getByTestId('drill-down-history-counter')).toBeInTheDocument();
  });

  /* Faz 21.4 PR-C — 5 feature demos */

  it.each([
    { featureId: 'feature-brush', demoTestId: 'feature-brush-demo' },
    { featureId: 'feature-zoom-pan', demoTestId: 'feature-zoom-pan-demo' },
    { featureId: 'feature-realtime', demoTestId: 'feature-realtime-demo' },
    { featureId: 'feature-theme-switch', demoTestId: 'feature-theme-switch-demo' },
    { featureId: 'feature-export', demoTestId: 'feature-export-demo' },
  ])(
    'feature demo "$featureId" mounts FeatureDemoLive ($demoTestId)',
    ({ featureId, demoTestId }) => {
      render(<ChartPreviewLive chartId={featureId} chartName={`${featureId} preview`} />);
      expect(screen.getByTestId(demoTestId)).toBeInTheDocument();
      expect(screen.getByTestId(`design-lab-chart-preview-${featureId}`)).toBeInTheDocument();
    },
  );

  it.each([
    { hookId: 'detect-anomalies', demoTestId: 'ai-detect-anomalies-demo' },
    { hookId: 'identify-trends', demoTestId: 'ai-identify-trends-demo' },
    { hookId: 'suggest-chart', demoTestId: 'ai-suggest-chart-demo' },
    { hookId: 'chart-description', demoTestId: 'ai-chart-description-demo' },
    { hookId: 'nl-to-chart', demoTestId: 'ai-nl-to-chart-demo' },
  ])('AI hook "$hookId" mounts AiHookDemoLive ($demoTestId)', ({ hookId, demoTestId }) => {
    render(<ChartPreviewLive chartId={hookId} chartName={`${hookId} preview`} />);
    expect(screen.getByTestId(demoTestId)).toBeInTheDocument();
    expect(screen.getByTestId(`design-lab-chart-preview-${hookId}`)).toBeInTheDocument();
  });

  it.each([
    { utilityId: 'lttb', demoTestId: 'perf-lttb-demo' },
    { utilityId: 'progressive-render', demoTestId: 'perf-progressive-render-demo' },
    { utilityId: 'lazy-chart', demoTestId: 'perf-lazy-chart-demo' },
    { utilityId: 'lru-cache', demoTestId: 'perf-lru-cache-demo' },
    { utilityId: 'code-split', demoTestId: 'perf-code-split-demo' },
  ])(
    'Perf utility "$utilityId" mounts PerfUtilityDemoLive ($demoTestId)',
    ({ utilityId, demoTestId }) => {
      render(<ChartPreviewLive chartId={utilityId} chartName={`${utilityId} preview`} />);
      expect(screen.getByTestId(demoTestId)).toBeInTheDocument();
      expect(screen.getByTestId(`design-lab-chart-preview-${utilityId}`)).toBeInTheDocument();
    },
  );

  it('unknown chart-id falls through to the friendly empty state', () => {
    render(<ChartPreviewLive chartId="not-a-real-chart" chartName="Future chart" />);
    expect(screen.getByText(/Future chart: live preview yakında/)).toBeInTheDocument();
    // No mock component should have rendered.
    expect(screen.queryByTestId(/^mock-/)).toBeNull();
  });
});
