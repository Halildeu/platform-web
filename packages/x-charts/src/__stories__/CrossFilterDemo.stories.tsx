/**
 * Storybook: Cross-Filter Demo
 *
 * 3 charts sharing a cross-filter group. Click any chart to filter others.
 * Includes DataVolumeIndicator, undo/redo, bookmark save/load.
 *
 * @see feature_execution_contract (P2 DoD #19)
 */
import React, { useCallback, useState } from 'react';
import { CrossFilterProvider, useCrossFilter, useCrossFilterStoreApi } from '../cross-filter';
import { useChartCrossFilter } from '../cross-filter/useChartCrossFilter';
import { DataVolumeIndicator } from '../components/DataVolumeIndicator';
import { ChartToolbar } from '../ChartToolbar';
import { useChartInteractions } from '../useChartInteractions';

/* ------------------------------------------------------------------ */
/*  Sample Data                                                        */
/* ------------------------------------------------------------------ */

const SALES_DATA = [
  { region: 'Europe', category: 'Electronics', value: 4200 },
  { region: 'Europe', category: 'Clothing', value: 3100 },
  { region: 'Europe', category: 'Food', value: 2800 },
  { region: 'Asia', category: 'Electronics', value: 5500 },
  { region: 'Asia', category: 'Clothing', value: 2200 },
  { region: 'Asia', category: 'Food', value: 4100 },
  { region: 'Americas', category: 'Electronics', value: 3800 },
  { region: 'Americas', category: 'Clothing', value: 2900 },
  { region: 'Americas', category: 'Food', value: 3200 },
];

/* ------------------------------------------------------------------ */
/*  Chart Panels (simulated — real ECharts would render here)          */
/* ------------------------------------------------------------------ */

function RegionBarChart() {
  const { activeFilters, onChartClick, isFiltered, filterCount } = useChartCrossFilter({
    chartId: 'region-bar',
    emitFields: ['region'],
  });

  const regions = [...new Set(SALES_DATA.map((d) => d.region))];
  const filteredData = isFiltered
    ? SALES_DATA.filter((d) => activeFilters.every((f) => d[f.field as keyof typeof d] === f.value))
    : SALES_DATA;

  const totals = regions.map((r) => ({
    region: r,
    total: filteredData.filter((d) => d.region === r).reduce((s, d) => s + d.value, 0),
  }));

  return (
    <div
      style={{ border: '1px solid var(--border-default, #e5e7eb)', borderRadius: 8, padding: 16 }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
        Sales by Region{' '}
        {isFiltered && (
          <span style={{ color: 'var(--action-primary)', fontSize: 12 }}>
            ({filterCount} filter)
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'end', height: 120 }}>
        {totals.map((t) => (
          <div
            key={t.region}
            onClick={() => onChartClick({ region: t.region })}
            style={{
              flex: 1,
              height: `${Math.max(10, (t.total / 12000) * 100)}%`,
              background: 'var(--action-primary, #3b82f6)',
              borderRadius: '4px 4px 0 0',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'end',
              justifyContent: 'center',
              paddingBottom: 4,
              fontSize: 11,
              color: '#fff',
              transition: 'height 0.3s ease',
            }}
          >
            {t.region}
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryPieChart() {
  const { activeFilters, onChartClick, isFiltered } = useChartCrossFilter({
    chartId: 'category-pie',
    emitFields: ['category'],
  });

  const filteredData = isFiltered
    ? SALES_DATA.filter((d) => activeFilters.every((f) => d[f.field as keyof typeof d] === f.value))
    : SALES_DATA;

  const categories = [...new Set(SALES_DATA.map((d) => d.category))];
  const colors = ['#3b82f6', '#22c55e', '#f59e0b'];

  return (
    <div
      style={{ border: '1px solid var(--border-default, #e5e7eb)', borderRadius: 8, padding: 16 }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Sales by Category</div>
      <div style={{ display: 'flex', gap: 12 }}>
        {categories.map((c, i) => {
          const total = filteredData
            .filter((d) => d.category === c)
            .reduce((s, d) => s + d.value, 0);
          return (
            <div
              key={c}
              onClick={() => onChartClick({ category: c })}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: 4,
                background: 'var(--bg-muted, #f9fafb)',
              }}
            >
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: colors[i] }} />
              <span style={{ fontSize: 13 }}>
                {c}: {total.toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryPanel() {
  const { activeFilters } = useChartCrossFilter({
    chartId: 'summary',
    emitFields: [],
  });

  const filteredData =
    activeFilters.length > 0
      ? SALES_DATA.filter((d) =>
          activeFilters.every((f) => d[f.field as keyof typeof d] === f.value),
        )
      : SALES_DATA;

  const total = filteredData.reduce((s, d) => s + d.value, 0);

  return (
    <div
      style={{ border: '1px solid var(--border-default, #e5e7eb)', borderRadius: 8, padding: 16 }}
    >
      <div style={{ fontSize: 14, fontWeight: 600 }}>Total Sales</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--action-primary, #3b82f6)' }}>
        ${total.toLocaleString()}
      </div>
      <DataVolumeIndicator count={filteredData.length} total={SALES_DATA.length} label="rows" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Dashboard Controls                                                 */
/* ------------------------------------------------------------------ */

function DashboardControls() {
  const canUndo = useCrossFilter((s) => s.past.length > 0);
  const canRedo = useCrossFilter((s) => s.future.length > 0);
  const undo = useCrossFilter((s) => s.undo);
  const redo = useCrossFilter((s) => s.redo);
  const clearAll = useCrossFilter((s) => s.clearAllFilters);
  const saveBookmark = useCrossFilter((s) => s.saveBookmark);
  const loadBookmark = useCrossFilter((s) => s.loadBookmark);
  const bookmarks = useCrossFilter((s) => s.bookmarks);
  const filterCount = useCrossFilter((s) => s.filters.size);

  const [interactions] = useChartInteractions({ enableZoom: true, enableBrush: true });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <ChartToolbar
        interactions={interactions}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
      />
      <button
        type="button"
        onClick={clearAll}
        disabled={filterCount === 0}
        style={{ fontSize: 12, padding: '4px 12px', borderRadius: 4, cursor: 'pointer' }}
      >
        Clear All ({filterCount})
      </button>
      <button
        type="button"
        onClick={() => saveBookmark(`bm-${Date.now()}`, `Snapshot ${bookmarks.size + 1}`)}
        style={{ fontSize: 12, padding: '4px 12px', borderRadius: 4, cursor: 'pointer' }}
      >
        Save Bookmark
      </button>
      {Array.from(bookmarks.entries()).map(([id, bm]) => (
        <button
          key={id}
          type="button"
          onClick={() => loadBookmark(id)}
          style={{
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 4,
            cursor: 'pointer',
            background: 'var(--bg-muted)',
          }}
        >
          {bm.name}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Story                                                              */
/* ------------------------------------------------------------------ */

export default {
  title: 'Charts/CrossFilterDemo',
};

export const Default = () => (
  <CrossFilterProvider options={{ groupId: 'sales-dashboard', debounceMs: 100 }}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 24 }}>
      <h2 style={{ margin: 0, fontSize: 18 }}>Cross-Filter Dashboard Demo</h2>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary, #6b7280)' }}>
        Click any chart element to filter. Undo/Redo and Bookmarks are active.
      </p>
      <DashboardControls />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        <RegionBarChart />
        <CategoryPieChart />
        <SummaryPanel />
      </div>
    </div>
  </CrossFilterProvider>
);

/* ------------------------------------------------------------------ */
/*  Full-suite story — all 13 charts share one cross-filter bus        */
/* ------------------------------------------------------------------ */

/**
 * Cross-filter rollout sweep — Codex thread 019e0c25 absorb. Renders
 * every chart adapter inside one `CrossFilterProvider` so reviewers
 * can see the entire BETA → stable promotion in a single dashboard.
 *
 * Each chart wraps its real component in `CrossFilterChart` with a
 * canonical `emitFields` per the adapter datum table:
 *
 *   Bar / Line / Area / Pie / Funnel / Waterfall / Treemap / Sunburst → label
 *   Scatter → label
 *   Gauge → name
 *   Radar → seriesName
 *   Heatmap → xLabel + yLabel
 *   Sankey (node) → name
 *
 * (Sankey edge clicks emit source+target — covered in the wrapper
 * integration test, not surfaced here to keep the demo focused.)
 */

// Lazy import the shims here to keep the legacy stories fast-loading
// on tools that don't tree-shake the unused chart bundles.
import {
  BarChart,
  LineChart,
  AreaChart,
  PieChart,
  ScatterChart,
  GaugeChart,
  RadarChart,
  TreemapChart,
  HeatmapChart,
  WaterfallChart,
  FunnelChart,
  SankeyChart,
  SunburstChart,
} from '..';
import { CrossFilterChart } from '../cross-filter/CrossFilterChart';

const FULL_SUITE_DATA = {
  bar: [
    { label: 'Q1', value: 100 },
    { label: 'Q2', value: 200 },
    { label: 'Q3', value: 150 },
    { label: 'Q4', value: 280 },
  ],
  pie: [
    { label: 'Tarım', value: 320 },
    { label: 'Sanayi', value: 540 },
    { label: 'Hizmet', value: 720 },
  ],
  // Deterministic synthetic scatter — Codex thread 019e0c25 post-impl
  // review absorb: replace `Math.random()` with a seeded LCG so
  // snapshot/render gates that consume this story stay stable across
  // CI runs.
  scatter: (() => {
    let seed = 42;
    const next = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    return Array.from({ length: 30 }, (_, i) => ({
      x: next() * 10,
      y: next() * 10,
      size: 10 + next() * 30,
      label: `P${i + 1}`,
    }));
  })(),
  hierarchical: [
    {
      name: 'Root',
      children: [
        { name: 'EU', value: 320 },
        { name: 'Asia', value: 540 },
        { name: 'Americas', value: 380 },
      ],
    },
  ],
  funnel: [
    { name: 'Visit', value: 1000 },
    { name: 'Signup', value: 400 },
    { name: 'Purchase', value: 100 },
  ],
  waterfall: [
    { label: 'Start', value: 1000, type: 'total' as const },
    { label: 'Income', value: 500, type: 'increase' as const },
    { label: 'Expense', value: -200, type: 'decrease' as const },
    { label: 'End', value: 1300, type: 'total' as const },
  ],
  sankey: {
    nodes: [{ name: 'EU' }, { name: 'Asia' }, { name: 'Online' }, { name: 'Store' }],
    links: [
      { source: 'EU', target: 'Online', value: 200 },
      { source: 'EU', target: 'Store', value: 120 },
      { source: 'Asia', target: 'Online', value: 340 },
      { source: 'Asia', target: 'Store', value: 200 },
    ],
  },
  // Deterministic heatmap — same seeded LCG so the rendered intensity
  // matrix is identical run-to-run (Codex post-impl review absorb).
  heatmap: (() => {
    let seed = 7;
    const next = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    return Array.from({ length: 5 }, (_, x) =>
      Array.from(
        { length: 5 },
        (_, y) => [x, y, Math.round(next() * 100)] as [number, number, number],
      ),
    ).flat();
  })(),
  radar: {
    indicators: [
      { name: 'Hız', max: 100 },
      { name: 'Güç', max: 100 },
      { name: 'Verimlilik', max: 100 },
      { name: 'Konfor', max: 100 },
    ],
    series: [{ name: 'Model X', data: [85, 70, 90, 60] }],
  },
};

function panelStyle(): React.CSSProperties {
  return {
    border: '1px solid var(--border-default, #e5e7eb)',
    borderRadius: 8,
    padding: 12,
    background: 'var(--surface-default, #fff)',
    minHeight: 240,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  };
}

export const FullSuite = () => (
  <CrossFilterProvider options={{ groupId: 'full-suite', debounceMs: 100 }}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 24 }}>
      <h2 style={{ margin: 0, fontSize: 18 }}>Cross-Filter Full Suite — 13/13 Charts</h2>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary, #6b7280)' }}>
        Click any element in any chart. Every adapter forwards a canonical
        <code> ChartClickEvent </code>
        through <code>CrossFilterChart</code> into the shared cross-filter bus.{' '}
        <code>useChartCrossFilter</code> intentionally hides each chart&apos;s OWN filter from
        itself, so the active-filter indicator appears on the OTHER charts (the ones consuming the
        bus filter), not on the one you clicked.
      </p>
      <DashboardControls />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <div style={panelStyle()}>
          <h3 style={{ margin: 0, fontSize: 14 }}>BarChart</h3>
          <CrossFilterChart chartId="full-bar" emitFields={['label']}>
            <BarChart data={FULL_SUITE_DATA.bar} />
          </CrossFilterChart>
        </div>

        <div style={panelStyle()}>
          <h3 style={{ margin: 0, fontSize: 14 }}>LineChart</h3>
          <CrossFilterChart chartId="full-line" emitFields={['label']}>
            <LineChart
              series={[{ name: 'Trend', data: FULL_SUITE_DATA.bar.map((d) => d.value) }]}
              labels={FULL_SUITE_DATA.bar.map((d) => d.label)}
            />
          </CrossFilterChart>
        </div>

        <div style={panelStyle()}>
          <h3 style={{ margin: 0, fontSize: 14 }}>AreaChart</h3>
          <CrossFilterChart chartId="full-area" emitFields={['label']}>
            <AreaChart
              series={[{ name: 'Stacked', data: FULL_SUITE_DATA.bar.map((d) => d.value) }]}
              labels={FULL_SUITE_DATA.bar.map((d) => d.label)}
            />
          </CrossFilterChart>
        </div>

        <div style={panelStyle()}>
          <h3 style={{ margin: 0, fontSize: 14 }}>PieChart</h3>
          <CrossFilterChart chartId="full-pie" emitFields={['label']}>
            <PieChart data={FULL_SUITE_DATA.pie} />
          </CrossFilterChart>
        </div>

        <div style={panelStyle()}>
          <h3 style={{ margin: 0, fontSize: 14 }}>ScatterChart</h3>
          <CrossFilterChart chartId="full-scatter" emitFields={['label']}>
            <ScatterChart data={FULL_SUITE_DATA.scatter} />
          </CrossFilterChart>
        </div>

        <div style={panelStyle()}>
          <h3 style={{ margin: 0, fontSize: 14 }}>GaugeChart</h3>
          <CrossFilterChart chartId="full-gauge" emitFields={['name']}>
            <GaugeChart value={75} title="CPU" />
          </CrossFilterChart>
        </div>

        <div style={panelStyle()}>
          <h3 style={{ margin: 0, fontSize: 14 }}>RadarChart</h3>
          <CrossFilterChart chartId="full-radar" emitFields={['seriesName']}>
            <RadarChart {...FULL_SUITE_DATA.radar} />
          </CrossFilterChart>
        </div>

        <div style={panelStyle()}>
          <h3 style={{ margin: 0, fontSize: 14 }}>TreemapChart</h3>
          <CrossFilterChart chartId="full-treemap" emitFields={['name']}>
            <TreemapChart data={FULL_SUITE_DATA.hierarchical} />
          </CrossFilterChart>
        </div>

        <div style={panelStyle()}>
          <h3 style={{ margin: 0, fontSize: 14 }}>HeatmapChart</h3>
          <CrossFilterChart chartId="full-heatmap" emitFields={['xLabel', 'yLabel']}>
            <HeatmapChart
              data={FULL_SUITE_DATA.heatmap}
              xLabels={['Pzt', 'Sal', 'Çar', 'Per', 'Cum']}
              yLabels={['09:00', '12:00', '15:00', '18:00', '21:00']}
            />
          </CrossFilterChart>
        </div>

        <div style={panelStyle()}>
          <h3 style={{ margin: 0, fontSize: 14 }}>WaterfallChart</h3>
          <CrossFilterChart chartId="full-waterfall" emitFields={['label']}>
            <WaterfallChart data={FULL_SUITE_DATA.waterfall} />
          </CrossFilterChart>
        </div>

        <div style={panelStyle()}>
          <h3 style={{ margin: 0, fontSize: 14 }}>FunnelChart</h3>
          <CrossFilterChart chartId="full-funnel" emitFields={['label']}>
            <FunnelChart data={FULL_SUITE_DATA.funnel} showConversion />
          </CrossFilterChart>
        </div>

        <div style={panelStyle()}>
          <h3 style={{ margin: 0, fontSize: 14 }}>SankeyChart (node)</h3>
          <CrossFilterChart chartId="full-sankey" emitFields={['name']}>
            <SankeyChart {...FULL_SUITE_DATA.sankey} />
          </CrossFilterChart>
        </div>

        <div style={panelStyle()}>
          <h3 style={{ margin: 0, fontSize: 14 }}>SunburstChart</h3>
          <CrossFilterChart chartId="full-sunburst" emitFields={['name']}>
            <SunburstChart data={FULL_SUITE_DATA.hierarchical} />
          </CrossFilterChart>
        </div>
      </div>
    </div>
  </CrossFilterProvider>
);
