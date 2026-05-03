/**
 * CrossFilterGridDemoLive — Faz 21.4 PR-B Design Lab demo for the
 * chart→grid cross-filter wiring.
 *
 * Pattern:
 *   - One BarChart uses `useChartCrossFilter` to emit filters on bar click.
 *   - A mock grid uses `useGridCrossFilter` and renders the grid filter
 *     model coming from the store. The mock's `setFilterModel` is wired
 *     to local React state so we have an OBSERVABLE signal in the DOM
 *     (grid `activeFilters` from the hook is a ref, not a render trigger).
 *
 * The pair shows the bidirectional bridge: chart click → grid filter
 * model update; grid filter change → chart re-aggregates via the
 * shared cross-filter store.
 */
import React, { useMemo, useRef, useState, useCallback } from 'react';
import {
  BarChart,
  CrossFilterProvider,
  useChartCrossFilter,
  useCrossFilterStoreApi,
  useGridCrossFilter,
} from '@mfe/x-charts';

interface OrderRow {
  region: 'Europe' | 'Asia' | 'Americas';
  status: 'paid' | 'shipped' | 'returned';
  value: number;
}

const ORDERS: readonly OrderRow[] = [
  { region: 'Europe', status: 'paid', value: 1200 },
  { region: 'Europe', status: 'shipped', value: 800 },
  { region: 'Europe', status: 'returned', value: 200 },
  { region: 'Asia', status: 'paid', value: 1500 },
  { region: 'Asia', status: 'shipped', value: 900 },
  { region: 'Asia', status: 'returned', value: 300 },
  { region: 'Americas', status: 'paid', value: 1800 },
  { region: 'Americas', status: 'shipped', value: 1100 },
  { region: 'Americas', status: 'returned', value: 400 },
];

const aggregateByRegion = (rows: readonly OrderRow[]): { label: string; value: number }[] => {
  const grouped = new Map<string, number>();
  for (const row of rows) {
    grouped.set(row.region, (grouped.get(row.region) ?? 0) + row.value);
  }
  return [...grouped.entries()].map(([label, value]) => ({ label, value }));
};

interface MockGridApi {
  setFilterModel: (model: Record<string, unknown>) => void;
  refreshServerSide: (params?: { purge?: boolean }) => void;
  getFilterModel: () => Record<string, unknown>;
}

const useMockGridApi = (): {
  api: MockGridApi;
  filterModel: Record<string, unknown>;
} => {
  const [filterModel, setFilterModel] = useState<Record<string, unknown>>({});
  const filterModelRef = useRef(filterModel);
  filterModelRef.current = filterModel;

  const api = useMemo<MockGridApi>(
    () => ({
      setFilterModel: (model) => {
        // Force a render so the grid panel reflects the new model.
        setFilterModel({ ...model });
      },
      refreshServerSide: () => {
        /* mock no-op — visible mutation is the filter model panel */
      },
      getFilterModel: () => filterModelRef.current,
    }),
    [],
  );

  return { api, filterModel };
};

const ChartSide: React.FC = () => {
  const { activeFilters, onChartClick, isFiltered, filterCount } = useChartCrossFilter({
    chartId: 'cross-filter-grid-chart',
    emitFields: ['region'],
  });

  const filteredRows = isFiltered
    ? ORDERS.filter((row) =>
        activeFilters.every(
          (filter) => row[filter.field as 'region'] === (filter.value as OrderRow['region']),
        ),
      )
    : ORDERS;

  const chartData = aggregateByRegion(filteredRows);

  return (
    <div className="space-y-2" data-testid="cross-filter-grid-chart-panel">
      <div className="flex items-center justify-between text-xs text-text-secondary">
        <span className="font-semibold">Sales by Region</span>
        {isFiltered ? (
          <span
            className="rounded bg-state-info-bg px-2 py-0.5 text-state-info-text"
            data-testid="cross-filter-grid-chart-badge"
          >
            filtered ({filterCount})
          </span>
        ) : null}
      </div>
      <BarChart
        data={chartData}
        title="Sales by Region"
        showValues
        showGrid
        size="md"
        animate={false}
        onDataPointClick={(event) => {
          if (typeof event.label === 'string') onChartClick({ region: event.label });
        }}
      />
    </div>
  );
};

const GridSide: React.FC = () => {
  const { api, filterModel } = useMockGridApi();
  // Wire the mock grid into the store. `useGridCrossFilter` invokes
  // `api.setFilterModel(...)` whenever the chart side emits a filter,
  // and our local mock translates that into a React state update.
  useGridCrossFilter({
    gridId: 'cross-filter-grid-mock',
    gridApi: api,
  });

  const entries = Object.entries(filterModel);
  return (
    <div
      className="rounded border border-border-subtle bg-surface-default p-3 text-xs"
      data-testid="cross-filter-grid-mock-panel"
    >
      <div className="flex items-center justify-between text-text-secondary">
        <span className="font-semibold">Mock grid filter model</span>
        <span data-testid="cross-filter-grid-filter-count">
          {entries.length} filter{entries.length === 1 ? '' : 's'}
        </span>
      </div>
      {entries.length === 0 ? (
        <p className="mt-2 text-text-secondary" data-testid="cross-filter-grid-empty">
          (no filters yet — click a bar above)
        </p>
      ) : (
        <pre
          className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-text-primary"
          data-testid="cross-filter-grid-filter-json"
        >
          {JSON.stringify(filterModel, null, 2)}
        </pre>
      )}
    </div>
  );
};

const ResetButton: React.FC = () => {
  const storeApi = useCrossFilterStoreApi();
  const handleClear = useCallback(() => {
    storeApi.getState().clearAllFilters();
  }, [storeApi]);
  return (
    <button
      type="button"
      onClick={handleClear}
      className="rounded border border-border-subtle bg-surface-default px-3 py-1 text-xs font-medium text-text-secondary transition hover:bg-surface-muted"
      data-testid="cross-filter-grid-reset"
    >
      Tüm filtreleri temizle
    </button>
  );
};

export const CrossFilterGridDemoLive: React.FC = () => (
  <CrossFilterProvider>
    <div className="space-y-4 p-3" data-testid="cross-filter-grid-demo">
      <p className="text-xs text-text-secondary">
        Chart → Grid bridge. Bir bara tıklayın → mock grid filter model store'dan otomatik
        güncellenir. Grid'in <code>setFilterModel</code>
        sinyali sağ panelde gözlenir.
      </p>
      <ChartSide />
      <GridSide />
      <ResetButton />
    </div>
  </CrossFilterProvider>
);

export default CrossFilterGridDemoLive;
