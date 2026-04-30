/**
 * CrossFilterDemoLive — interactive linked-charts demo for the Design Lab.
 *
 * Wires two real BarCharts together via the @mfe/x-charts cross-filter
 * store. Clicking a bar in either chart emits a filter; the other chart
 * subscribes to incoming filters and re-aggregates its data, producing
 * an observable mutation that drives the Vitest + Playwright tests.
 *
 * Sample data is taken verbatim from the Storybook reference
 * (`CrossFilterDemo.stories.tsx`) so the visual snapshot remains
 * consistent across surfaces.
 */
import React from 'react';
import {
  BarChart,
  CrossFilterProvider,
  useChartCrossFilter,
  useCrossFilterStoreApi,
} from '@mfe/x-charts';

interface SaleRow {
  region: 'Europe' | 'Asia' | 'Americas';
  category: 'Electronics' | 'Clothing' | 'Food';
  value: number;
}

const SALES_DATA: readonly SaleRow[] = [
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

const aggregateBy = (
  rows: readonly SaleRow[],
  field: 'region' | 'category',
): { label: string; value: number }[] => {
  const grouped = new Map<string, number>();
  for (const row of rows) {
    const key = row[field];
    grouped.set(key, (grouped.get(key) ?? 0) + row.value);
  }
  return [...grouped.entries()].map(([label, value]) => ({ label, value }));
};

interface FilteredBarProps {
  chartId: string;
  emitField: 'region' | 'category';
  title: string;
}

const FilteredBar: React.FC<FilteredBarProps> = ({ chartId, emitField, title }) => {
  const { activeFilters, onChartClick, isFiltered, filterCount } = useChartCrossFilter({
    chartId,
    emitFields: [emitField],
  });

  const filteredData = isFiltered
    ? SALES_DATA.filter((row) =>
        activeFilters.every(
          (filter) =>
            row[filter.field as 'region' | 'category'] ===
            (filter.value as SaleRow['region'] | SaleRow['category']),
        ),
      )
    : SALES_DATA;

  const chartData = aggregateBy(filteredData, emitField);
  const total = chartData.reduce((sum, point) => sum + point.value, 0);

  return (
    <div data-testid={`cross-filter-${emitField}-panel`} className="space-y-2">
      <div className="flex items-center justify-between text-xs text-text-secondary">
        <span className="font-semibold">
          {title}
          {isFiltered ? (
            <span
              className="ml-2 rounded bg-state-info-bg px-2 py-0.5 text-state-info-text"
              data-testid={`cross-filter-${emitField}-badge`}
            >
              filtered ({filterCount})
            </span>
          ) : null}
        </span>
        <span className="font-mono tabular-nums" data-testid={`cross-filter-${emitField}-total`}>
          {total}
        </span>
      </div>
      <BarChart
        data={chartData}
        title={title}
        showValues
        showGrid
        size="md"
        animate={false}
        onDataPointClick={(event) => {
          onChartClick({ [emitField]: event.label });
        }}
      />
    </div>
  );
};

const ResetButton: React.FC = () => {
  const storeApi = useCrossFilterStoreApi();
  return (
    <button
      type="button"
      onClick={() => storeApi.getState().clearAllFilters()}
      className="rounded border border-border-subtle bg-surface-default px-3 py-1 text-xs font-medium text-text-secondary transition hover:bg-surface-muted"
      data-testid="cross-filter-reset"
    >
      Tüm filtreleri temizle
    </button>
  );
};

export const CrossFilterDemoLive: React.FC = () => (
  <CrossFilterProvider>
    <div className="space-y-4 p-3" data-testid="cross-filter-demo">
      <p className="text-xs text-text-secondary">
        Bir bara tıklayın → diğer chart aynı filtre'ye göre re-render eder. Region ↔ Category linked
        aggregation.
      </p>
      <FilteredBar chartId="cross-filter-demo-region" emitField="region" title="Sales by Region" />
      <FilteredBar
        chartId="cross-filter-demo-category"
        emitField="category"
        title="Sales by Category"
      />
      <ResetButton />
    </div>
  </CrossFilterProvider>
);

export default CrossFilterDemoLive;
