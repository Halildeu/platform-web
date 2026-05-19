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
  // §4f.2 / §4f.3: the sentinel surfaces the `markups` / `onMarkupClick`
  // and `anomalySummary` / `formatAnomalyAnnouncement` props as
  // data-attributes so the preset-forwarding tests can assert which
  // overlay / a11y summary reached the underlying chart. Routing tests
  // are unaffected — they only read `data-testid` + the title text node.
  const sentinel = (kind: string) => {
    const Component: React.FC<{
      title?: string;
      markups?: ReadonlyArray<{ type?: string }>;
      onMarkupClick?: unknown;
      anomalySummary?: ReadonlyArray<unknown>;
      formatAnomalyAnnouncement?: unknown;
    }> = ({ title, markups, onMarkupClick, anomalySummary, formatAnomalyAnnouncement }) =>
      React.createElement(
        'div',
        {
          'data-testid': `mock-${kind}`,
          'data-markup-types': Array.isArray(markups)
            ? markups.map((m) => m.type ?? '').join(',')
            : '',
          'data-has-markup-click': onMarkupClick ? '1' : '0',
          'data-anomaly-count': Array.isArray(anomalySummary) ? String(anomalySummary.length) : '0',
          'data-has-anomaly-fmt': formatAnomalyAnnouncement ? '1' : '0',
        },
        title,
      );
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
    TreeChart: sentinel('tree'),
    // PR-X16 ECharts-Depth wrappers — sentinels so routing + §4f.3
    // anomaly-forwarding coverage spans all 17 enrolled anomaly charts.
    CalendarHeatmap: sentinel('calendar-heatmap'),
    PolarChart: sentinel('polar'),
    ThemeRiverChart: sentinel('theme-river'),
    GanttChart: sentinel('gantt'),
    // PR#2 (Codex 019e3f75): PopulationPyramid HR demographic pyramid.
    PopulationPyramid: sentinel('population-pyramid'),
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
      getState: () => ({
        clearAllFilters: vi.fn(),
        // Faz 21.11 PR-A2c-adopt: ScatterBrushGridDemoLive calls
        // these inside its `onBrushSelection` handler. Smoke
        // tests don't drag the brush so the handler never fires,
        // but stubbing them keeps the mock surface honest.
        setFilter: vi.fn(),
        removeFilter: vi.fn(),
      }),
    }),
    // Faz 21.11 PR-A2c-adopt: stable brush filter key helper.
    // The smoke test renders the demo but never drags a brush,
    // so this only needs to exist as a callable.
    brushFilterKey: (x: string, y: string) => `__brush__:${x}:${y}`,
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
    // Faz 21.11 PR-A2b-ui — explanation-pill anomaly overlay hook.
    // ChartPreviewLive's ScatterAnomalyDemoChart calls
    // `useAnomalyOverlay({...})` to feed the demo ScatterChart's
    // `markup` prop. The routing smoke test only cares about which
    // sentinel renders, so the mock returns an empty markup array.
    // Real overlay shape is exercised in
    // `packages/x-charts/src/annotations/__tests__/computeAnomalyOverlay.test.ts`.
    useAnomalyOverlay: () => [],
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
  { chartId: 'tree-chart', expectedTestId: 'mock-tree' },
  { chartId: 'calendar-heatmap', expectedTestId: 'mock-calendar-heatmap' },
  { chartId: 'polar-chart', expectedTestId: 'mock-polar' },
  { chartId: 'theme-river-chart', expectedTestId: 'mock-theme-river' },
  { chartId: 'gantt-chart', expectedTestId: 'mock-gantt' },
  { chartId: 'population-pyramid', expectedTestId: 'mock-population-pyramid' },
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

  /* Faz 21.11 PR-A2c-wire — scatter brush demo */

  it('chart-id "scatter-chart" with `enableBrush=true` shows the brush status pill', () => {
    render(
      <ChartPreviewLive
        chartId="scatter-chart"
        chartName="scatter-chart preview"
        toggles={{ enableBrush: true }}
      />,
    );
    // Routing still hits the scatter sentinel.
    expect(screen.getByTestId('mock-scatter')).toBeInTheDocument();
    // The demo wrapper (`ScatterAnomalyDemoChart`) shows a status
    // pill when `enableBrush` is forwarded — proves the toggle
    // actually reached the inner component.
    expect(screen.getByTestId('scatter-anomaly-demo-brush-status')).toBeInTheDocument();
    expect(screen.getByTestId('scatter-anomaly-demo-brush-status').textContent).toMatch(/Brush:/);
  });

  it('chart-id "scatter-chart" with `enableBrush=false` (default) hides the brush status pill', () => {
    render(<ChartPreviewLive chartId="scatter-chart" chartName="scatter-chart preview" />);
    expect(screen.getByTestId('mock-scatter')).toBeInTheDocument();
    expect(screen.queryByTestId('scatter-anomaly-demo-brush-status')).not.toBeInTheDocument();
  });

  /* Faz 21.4 PR-B — drill-down + chart-to-grid cross-filter demos */

  it('chart-id "cross-filter-grid" mounts CrossFilterGridDemoLive AND ScatterBrushGridDemoLive (PR-A2c-adopt stack)', () => {
    render(<ChartPreviewLive chartId="cross-filter-grid" chartName="cross-filter-grid preview" />);
    expect(screen.getByTestId('cross-filter-grid-demo')).toBeInTheDocument();
    // PR-A2c-adopt: brush demo stacks under the legacy bar/grid
    // demo so both adoption paths share one chart-id.
    expect(screen.getByTestId('scatter-brush-grid-demo')).toBeInTheDocument();
    expect(screen.getByTestId('scatter-brush-grid-mock-panel')).toBeInTheDocument();
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

/* PR-X16 §4f.2 — markup overlay preset forwarding */

describe('ChartPreviewLive — §4f.2 markup preset forwarding', () => {
  const MARKUP_CHART_KINDS: Array<{ chartId: string; kind: string }> = [
    { chartId: 'bar-chart', kind: 'bar' },
    { chartId: 'line-chart', kind: 'line' },
    { chartId: 'area-chart', kind: 'area' },
    { chartId: 'heatmap-chart', kind: 'heatmap' },
    { chartId: 'waterfall-chart', kind: 'waterfall' },
    { chartId: 'population-pyramid', kind: 'population-pyramid' },
  ];

  it.each(MARKUP_CHART_KINDS)(
    'chart "$chartId" forwards a threshold-line markup preset to the chart',
    ({ chartId, kind }) => {
      render(
        <ChartPreviewLive
          chartId={chartId}
          chartName={`${chartId} preview`}
          toggles={{ markups: 'threshold-line' }}
        />,
      );
      expect(screen.getByTestId(`mock-${kind}`).getAttribute('data-markup-types')).toBe('line');
    },
  );

  it('markups "none" (default) forwards no markup overlay', () => {
    render(<ChartPreviewLive chartId="bar-chart" chartName="bar preview" />);
    expect(screen.getByTestId('mock-bar').getAttribute('data-markup-types')).toBe('');
  });

  it('a highlight-band preset forwards an area markup', () => {
    render(
      <ChartPreviewLive
        chartId="area-chart"
        chartName="area preview"
        toggles={{ markups: 'highlight-band' }}
      />,
    );
    expect(screen.getByTestId('mock-area').getAttribute('data-markup-types')).toBe('area');
  });

  it('onMarkupClick preset forwards a click handler to the chart', () => {
    render(
      <ChartPreviewLive
        chartId="bar-chart"
        chartName="bar preview"
        toggles={{ onMarkupClick: 'console-log' }}
      />,
    );
    expect(screen.getByTestId('mock-bar').getAttribute('data-has-markup-click')).toBe('1');
  });

  it('onMarkupClick "noop" (default) forwards no handler', () => {
    render(<ChartPreviewLive chartId="bar-chart" chartName="bar preview" />);
    expect(screen.getByTestId('mock-bar').getAttribute('data-has-markup-click')).toBe('0');
  });

  it('scatter-chart merges the markup preset alongside the anomaly overlay path', () => {
    // `useAnomalyOverlay` is mocked to return [] (real overlay shape is
    // covered in x-charts' own tests) — so this asserts the preset markup
    // is NOT swallowed by the anomaly `markups=` path: the pre-§4f.2
    // `markups={anomalyMarkups}` wiring would have dropped it.
    render(
      <ChartPreviewLive
        chartId="scatter-chart"
        chartName="scatter preview"
        toggles={{ markups: 'highlight-band' }}
      />,
    );
    expect(screen.getByTestId('mock-scatter').getAttribute('data-markup-types')).toBe('area');
  });
});

/* PR-X16 §4f.3 — anomaly a11y preset forwarding */

describe('ChartPreviewLive — §4f.3 anomaly preset forwarding', () => {
  // All 18 enrolled anomaly charts (every count-lock-enrolled chart
  // except Gauge) — each now has an x-charts mock sentinel below, so
  // §4f.3 anomaly-preset forwarding is harness-covered for the full set.
  const ANOMALY_CHART_KINDS: Array<{ chartId: string; kind: string }> = [
    { chartId: 'bar-chart', kind: 'bar' },
    { chartId: 'line-chart', kind: 'line' },
    { chartId: 'area-chart', kind: 'area' },
    { chartId: 'pie-chart', kind: 'pie' },
    { chartId: 'scatter-chart', kind: 'scatter' },
    { chartId: 'radar-chart', kind: 'radar' },
    { chartId: 'treemap-chart', kind: 'treemap' },
    { chartId: 'tree-chart', kind: 'tree' },
    { chartId: 'calendar-heatmap', kind: 'calendar-heatmap' },
    { chartId: 'polar-chart', kind: 'polar' },
    { chartId: 'theme-river-chart', kind: 'theme-river' },
    { chartId: 'gantt-chart', kind: 'gantt' },
    { chartId: 'population-pyramid', kind: 'population-pyramid' },
    { chartId: 'heatmap-chart', kind: 'heatmap' },
    { chartId: 'waterfall-chart', kind: 'waterfall' },
    { chartId: 'funnel-chart', kind: 'funnel' },
    { chartId: 'sankey-chart', kind: 'sankey' },
    { chartId: 'sunburst-chart', kind: 'sunburst' },
  ];

  it.each(ANOMALY_CHART_KINDS)(
    'chart "$chartId" forwards a multi-outlier anomalySummary preset (3 entries)',
    ({ chartId, kind }) => {
      render(
        <ChartPreviewLive
          chartId={chartId}
          chartName={`${chartId} preview`}
          toggles={{ anomalySummary: 'multi-outlier' }}
        />,
      );
      expect(screen.getByTestId(`mock-${kind}`).getAttribute('data-anomaly-count')).toBe('3');
    },
  );

  it('anomalySummary "none" (default) forwards no summary', () => {
    render(<ChartPreviewLive chartId="bar-chart" chartName="bar preview" />);
    expect(screen.getByTestId('mock-bar').getAttribute('data-anomaly-count')).toBe('0');
  });

  it('one-outlier preset forwards exactly one summary', () => {
    render(
      <ChartPreviewLive
        chartId="line-chart"
        chartName="line preview"
        toggles={{ anomalySummary: 'one-outlier' }}
      />,
    );
    expect(screen.getByTestId('mock-line').getAttribute('data-anomaly-count')).toBe('1');
  });

  it('formatAnomalyAnnouncement preset forwards a formatter alongside a summary', () => {
    render(
      <ChartPreviewLive
        chartId="bar-chart"
        chartName="bar preview"
        toggles={{ anomalySummary: 'multi-outlier', formatAnomalyAnnouncement: 'verbose' }}
      />,
    );
    const sentinel = screen.getByTestId('mock-bar');
    expect(sentinel.getAttribute('data-anomaly-count')).toBe('3');
    expect(sentinel.getAttribute('data-has-anomaly-fmt')).toBe('1');
  });

  it('formatAnomalyAnnouncement "default" forwards no formatter override', () => {
    render(<ChartPreviewLive chartId="bar-chart" chartName="bar preview" />);
    expect(screen.getByTestId('mock-bar').getAttribute('data-has-anomaly-fmt')).toBe('0');
  });
});
