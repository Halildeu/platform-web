import React from 'react';
import { getLiveKPIs, getLiveCharts, refreshDashboardData } from './api';
import type { DashboardKPI, DashboardChart, DashboardChartItem, DashboardFilters } from './api';
import {
  BarChart,
  LineChart,
  PieChart,
  WaterfallChart,
  CrossFilterProvider,
  useCrossFilter,
} from '@mfe/x-charts';
import type { ChartClickEvent, CrossFilterEntry } from '@mfe/x-charts';
import { KPICard as XKPICard } from '@mfe/x-charts';
// ESLint exception: lightweight read-only chart-summary grid, no toolbar/variant needed — see CONTRIBUTING grid-contract section.
import { AgGridReact } from 'ag-grid-react';
import type { ColDef } from 'ag-grid-community';
import type { CrossFilter } from './crossFilterTypes';
import { CHART_FILTER_MAP, KPI_FILTER_MAP } from './crossFilterTypes';
import ActiveFilterChips from './ActiveFilterChips';
import type { HrCompensationFilters } from './types';

/* ------------------------------------------------------------------ */
/*  Formatters                                                         */
/* ------------------------------------------------------------------ */

const formatCurrency = (v: number | null): string => {
  if (v == null) return '-';
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
  }).format(v);
};

const formatPercent = (v: number | null): string => {
  if (v == null) return '-';
  return `%${(v * 100).toFixed(1)}`;
};

const formatNumber = (v: number | null): string => {
  if (v == null) return '-';
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(v);
};

const formatDecimal = (v: number | null): string => {
  if (v == null) return '-';
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  }).format(v);
};

const formatValue = (v: number | null, format?: string): string => {
  if (format === 'currency') return formatCurrency(v);
  if (format === 'percent') return formatPercent(v);
  if (format === 'decimal') return formatDecimal(v);
  if (v == null) return '-';
  return formatNumber(v);
};

/**
 * KPI value formatter — compacts large currency magnitudes (>= 1M) to a
 * short notation (e.g. ₺207,7 Mn) so a 9-digit figure cannot overflow its
 * card. Non-currency / sub-million values fall through to `formatValue`.
 */
const formatKpiValue = (v: number | null, format?: string): string => {
  if (format === 'currency' && v != null && Math.abs(v) >= 1_000_000) {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(v);
  }
  return formatValue(v, format);
};

const chartCurrencyFormatter = (value: number): string => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return formatNumber(value);
};

/* ------------------------------------------------------------------ */
/*  Shared styles                                                      */
/* ------------------------------------------------------------------ */

const sectionClass = 'mb-6';
const chartRowClass = 'grid grid-cols-1 md:grid-cols-2 gap-4 mb-6';
const chartFullClass = 'grid grid-cols-1 gap-4 mb-6';
const cardClass = 'rounded-lg border border-border-subtle bg-surface-default p-4';
const kpiStripClass = 'grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6';

/* ------------------------------------------------------------------ */
/*  KPI Card \u2014 thin shim around `@mfe/x-charts/KPICard`                */
/*                                                                     */
/*  Faz 21.10 wave 1-7 primitives (mobile padding `p-3 sm:p-5`, value  */
/*  font `text-xl sm:text-2xl`, accessible click handling, semantic    */
/*  trend coloring) live in the x-charts component. This shim adapts   */
/*  the local `DashboardKPI` shape to the public KPICard contract,     */
/*  layers the cross-filter `active` ring on top via className, and    */
/*  forwards the click handler. The standalone div implementation was  */
/*  removed because every responsive primitive in waves 1-7 was being  */
/*  bypassed.                                                          */
/* ------------------------------------------------------------------ */

const KPICard: React.FC<{ kpi: DashboardKPI; onClick?: () => void; active?: boolean }> = ({
  kpi,
  onClick,
  active,
}) => {
  const trendValue =
    kpi.trend?.percentage != null
      ? `${kpi.trend.percentage > 0 ? '+' : ''}${kpi.trend.percentage.toFixed(1)}%`
      : '';

  /*
   * x-charts KPICard derives the trend color from `trend.positive`. The
   * local KPI tone (`info` / `positive` / `negative`) is independent
   * of the arrow direction \u2014 a downward salary trend can be "positive"
   * for cost reduction. Map tone \u2192 positive flag so the trend color
   * tracks the metric's intent, not the arrow direction. The active
   * cross-filter ring rides on the `className` slot so x-charts root
   * picks it up via cn() merge.
   */
  const subtitle =
    kpi.benchmark?.label && kpi.benchmark.value != null
      ? `${kpi.benchmark.label}: ${formatValue(kpi.benchmark.value, kpi.format)}`
      : kpi.benchmark?.label
        ? `${kpi.benchmark.label}: N/A`
        : undefined;

  /*
   * Tone-derived top accent — gives each card a colour-coded edge so the
   * metric's intent reads at a glance and the strip no longer looks like
   * a row of flat, undifferentiated white boxes. `tone` comes from the
   * backend KPI payload (`positive` / `negative` / `info`).
   */
  const toneAccent =
    kpi.tone === 'positive'
      ? 'border-t-4 border-t-state-success-text'
      : kpi.tone === 'negative'
        ? 'border-t-4 border-t-state-error-text'
        : 'border-t-4 border-t-action-primary';

  return (
    <XKPICard
      title={kpi.title}
      value={formatKpiValue(kpi.value, kpi.format)}
      subtitle={subtitle}
      trend={
        kpi.trend && trendValue
          ? {
              // Backend trend.direction is loosely typed as string; clamp
              // to the x-charts literal union so an unknown value falls
              // through to "flat" instead of producing an invalid chip.
              direction:
                kpi.trend.direction === 'up' || kpi.trend.direction === 'down'
                  ? kpi.trend.direction
                  : 'flat',
              value: trendValue,
              positive:
                kpi.tone === 'positive' ? true : kpi.tone === 'negative' ? false : undefined,
            }
          : undefined
      }
      onClick={onClick}
      className={[toneAccent, active && 'ring-2 ring-action-primary'].filter(Boolean).join(' ')}
    />
  );
};

/* ------------------------------------------------------------------ */
/*  ChartDataGrid — AG Grid client-mode for chart data                 */
/* ------------------------------------------------------------------ */

interface ChartGridColumn {
  key: string;
  label: string;
  format?: 'currency' | 'percent' | 'number';
}

/** Lightweight AG Grid for chart summary data — no toolbar/variant overhead */
const ChartDataGrid: React.FC<{
  data: DashboardChartItem[];
  columns: ChartGridColumn[];
}> = ({ data, columns }) => {
  if (!data || data.length === 0) return null;

  const colDefs = React.useMemo<ColDef[]>(
    () =>
      columns.map((col, idx) => ({
        field: col.key,
        headerName: col.label,
        flex: idx === 0 ? 1.5 : 1,
        minWidth: idx === 0 ? 160 : 100,
        sortable: true,
        type: idx > 0 ? 'rightAligned' : undefined,
        valueFormatter:
          idx > 0
            ? (params: { value: unknown }) => {
                const v = params.value;
                if (v == null) return '-';
                const num = typeof v === 'number' ? v : Number(v);
                if (isNaN(num)) return String(v);
                if (col.format === 'currency') return formatCurrency(num);
                if (col.format === 'percent') return formatPercent(num);
                return formatNumber(num);
              }
            : undefined,
      })),
    [columns],
  );

  return (
    <div className="ag-theme-quartz mt-3" style={{ height: Math.min(data.length * 32 + 42, 260) }}>
      <AgGridReact
        rowData={data}
        columnDefs={colDefs}
        headerHeight={32}
        rowHeight={32}
        suppressCellFocus
        suppressMovableColumns
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  ChartBlock — card with chart + optional AG Grid                    */
/* ------------------------------------------------------------------ */

const ChartBlock: React.FC<{
  chart: DashboardChart | undefined;
  title?: string;
  height?: string;
  children?: React.ReactNode;
  gridColumns?: ChartGridColumn[];
}> = ({ chart, title, height, children, gridColumns }) => {
  const chartTitle = chart?.title ?? title ?? '';
  const data = chart?.data ?? [];
  /*
   * The chart is the primary view; the per-chart summary grid duplicates
   * it 1:1. It sits behind a collapsed-by-default disclosure so every card
   * isn't trailed by a redundant always-on AG Grid.
   */
  const [tableOpen, setTableOpen] = React.useState(false);
  const hasTable = Boolean(gridColumns) && data.length > 0;
  return (
    <div className={cardClass}>
      <h3 className="text-sm font-medium text-text-primary mb-3">{chartTitle}</h3>
      <div className={`${height ?? 'h-72'} overflow-hidden`}>
        {chart && data.length > 0 ? children : <EmptyState />}
      </div>
      {hasTable && (
        <>
          <button
            type="button"
            onClick={() => setTableOpen((open) => !open)}
            aria-expanded={tableOpen}
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-text-secondary transition hover:text-text-primary"
          >
            <span aria-hidden="true">{tableOpen ? '▾' : '▸'}</span>
            {tableOpen ? 'Tabloyu gizle' : 'Tabloyu göster'}
          </button>
          {tableOpen && gridColumns && <ChartDataGrid data={data} columns={gridColumns} />}
        </>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Chart Renderers — explicit per-chart-id wrapper selection          */
/*                                                                     */
/*  No generic bar catch-all: every chart id deliberately picks its     */
/*  @mfe/x-charts contract wrapper. `renderChartContent` (switch on     */
/*  chart.id) at the end of this block is the single dispatch point.    */
/* ------------------------------------------------------------------ */

const EmptyState = () => (
  <div className="flex items-center justify-center h-full text-sm text-text-subtle">
    Veri bulunamadı
  </div>
);

/**
 * `api.ts` types dashboard aggregates as `number | null` — backend
 * `AVG` / `MIN` / `MAX` (incl. `AVG(CASE WHEN gender = ...)`) can resolve
 * to SQL NULL. The x-charts wrapper contracts require `number`, so every
 * adapter normalizes through `num()` before passing chart props.
 */
const num = (v: number | null | undefined): number => v ?? 0;

/**
 * salary-histogram — pre-binned salary buckets → single-color vertical bars.
 * A histogram is one distribution, so a one-entry `colors` palette keeps
 * every bin the same hue (BarChart cycles the supplied palette).
 */
const renderHistogram = (
  data: DashboardChartItem[],
  onDataPointClick?: (event: ChartClickEvent) => void,
) => (
  <BarChart
    data={data.map((d) => ({ label: d.label, value: num(d.value) }))}
    orientation="vertical"
    colors={['#3b82f6']}
    showValues
    onDataPointClick={onDataPointClick}
  />
);

/** Single-series ranking bar — dept-salary / education-premium / collar-type. */
const renderRankingBar = (
  data: DashboardChartItem[],
  orientation: 'vertical' | 'horizontal',
  onDataPointClick?: (event: ChartClickEvent) => void,
) => (
  <BarChart
    data={data.map((d) => ({ label: d.label, value: num(d.value) }))}
    orientation={orientation}
    showValues
    valueFormatter={chartCurrencyFormatter}
    onDataPointClick={onDataPointClick}
  />
);

/** gender-salary-comparison — grouped bars: Erkek (`value`) + Kadın (`value2`). */
const renderGenderBars = (
  data: DashboardChartItem[],
  onDataPointClick?: (event: ChartClickEvent) => void,
) => (
  <BarChart
    data={data.map((d) => ({
      label: d.label,
      value: num(d.value),
      value2: num(d.value2),
    }))}
    orientation="horizontal"
    series={[
      { field: 'value', name: 'Erkek' },
      { field: 'value2', name: 'Kadın' },
    ]}
    showLegend
    valueFormatter={chartCurrencyFormatter}
    onDataPointClick={onDataPointClick}
  />
);

/** dept-percentile-radar — grouped bars: Min / Ort. / Maks per department. */
const renderPercentileBars = (
  data: DashboardChartItem[],
  onDataPointClick?: (event: ChartClickEvent) => void,
) => (
  <BarChart
    data={data.map((d) => ({
      label: d.label,
      value: num(d.value),
      min_val: num(d.min_val),
      max_val: num(d.max_val),
    }))}
    orientation="horizontal"
    series={[
      { field: 'min_val', name: 'Min' },
      { field: 'value', name: 'Ort.' },
      { field: 'max_val', name: 'Maks' },
    ]}
    showLegend
    valueFormatter={chartCurrencyFormatter}
    onDataPointClick={onDataPointClick}
  />
);

/** salary-trend-12m / tenure-salary-relation — single-series line over an ordered axis. */
const renderSalaryLine = (data: DashboardChartItem[]) => (
  <LineChart
    series={[{ name: 'Ort. Maaş', data: data.map((d) => num(d.value)) }]}
    labels={data.map((d) => d.label)}
    valueFormatter={chartCurrencyFormatter}
  />
);

/** Narrow a backend-supplied `type` field to the WaterfallChart union. */
const asWaterfallType = (v: unknown): 'increase' | 'decrease' | 'total' | undefined =>
  v === 'increase' || v === 'decrease' || v === 'total' ? v : undefined;

/**
 * cost-waterfall — adaptive renderer (employer cost-structure waterfall).
 *
 * The report-service `dashboards/hr-compensation.json` `cost-waterfall`
 * query currently emits absolute, all-positive bar items
 * (`chartType: "bar"`) → the BarChart fallback below renders, visually
 * unchanged. The platform-backend follow-up rewrites that query to emit
 * signed waterfall deltas + a real total row (`chartType: "waterfall"`,
 * per-item `type`); once it deploys this switches to the canonical
 * `WaterfallChart` with no further frontend change. The switch is keyed
 * on `chartType` because `WaterfallChart` needs the signed/total shape —
 * feeding it the absolute bar payload would inflate the running total.
 */
const renderCostStructure = (chart: DashboardChart, data: DashboardChartItem[]) => {
  if (chart.chartType === 'waterfall') {
    return (
      <WaterfallChart
        data={data.map((d) => ({
          label: d.label,
          value: num(d.value),
          type: asWaterfallType(d.type),
        }))}
        showValues
        valueFormatter={chartCurrencyFormatter}
      />
    );
  }
  return (
    <BarChart
      data={data.map((d) => ({ label: d.label, value: num(d.value) }))}
      orientation="horizontal"
      showValues
      showGrid
      valueFormatter={chartCurrencyFormatter}
    />
  );
};

/** company-payroll-pie — share of total payroll. */
const renderPie = (
  data: DashboardChartItem[],
  onDataPointClick?: (event: ChartClickEvent) => void,
) => (
  <PieChart
    data={data.map((d) => ({ label: d.label, value: num(d.value) }))}
    showLegend
    valueFormatter={chartCurrencyFormatter}
    onDataPointClick={onDataPointClick}
  />
);

/**
 * Explicit chart-id → wrapper dispatcher. Every `case` is a deliberate
 * contract decision — there is no catch-all that the known charts route
 * through. An unrecognised id (backend ↔ frontend chart-id drift) renders
 * the empty state, so the gap is visible rather than silently absorbed
 * into a generic bar.
 */
const renderChartContent = (
  chart: DashboardChart | undefined,
  onDataPointClick?: (event: ChartClickEvent) => void,
): React.ReactNode => {
  const data = chart?.data ?? [];
  if (!chart || data.length === 0) return <EmptyState />;
  switch (chart.id) {
    case 'salary-histogram':
      return renderHistogram(data, onDataPointClick);
    case 'dept-salary-comparison':
      return renderRankingBar(data, 'horizontal', onDataPointClick);
    case 'gender-salary-comparison':
      return renderGenderBars(data, onDataPointClick);
    case 'education-salary-premium':
      return renderRankingBar(data, 'horizontal', onDataPointClick);
    case 'salary-trend-12m':
      return renderSalaryLine(data);
    case 'collar-type-salary':
      return renderRankingBar(data, 'vertical', onDataPointClick);
    case 'tenure-salary-relation':
      return renderSalaryLine(data);
    case 'cost-waterfall':
      return renderCostStructure(chart, data);
    case 'company-payroll-pie':
      return renderPie(data, onDataPointClick);
    case 'dept-percentile-radar':
      return renderPercentileBars(data, onDataPointClick);
    default:
      return <EmptyState />;
  }
};

/* ------------------------------------------------------------------ */
/*  Main Dashboard Component                                           */
/* ------------------------------------------------------------------ */

interface CompensationDashboardProps {
  filters?: Partial<HrCompensationFilters>;
}

/**
 * Inner component — assumes a `<CrossFilterProvider>` is mounted somewhere
 * up the tree. Faz 21.8 PR-X4a migration: cross-filter state lives in the
 * `@mfe/x-charts` Zustand store now (single source of truth) instead of a
 * bespoke `useState<CrossFilter[]>`. The toggle "same dimension + same
 * value -> remove; same dimension + different value -> replace; otherwise
 * add" semantics are preserved by the click handler logic below; the
 * removeFilter / clearAllFilters store actions handle the chip UI.
 */
const CompensationDashboardInner: React.FC<CompensationDashboardProps> = ({
  filters: sidebarFilters,
}) => {
  const [kpis, setKpis] = React.useState<DashboardKPI[]>([]);
  const [charts, setCharts] = React.useState<DashboardChart[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [retryCount, setRetryCount] = React.useState(0);

  // Store-backed cross-filter state. The store filters Map is keyed by
  // `${sourceId}:${field}` (see `createCrossFilterStore.ts:filterKey`).
  const storeFilters = useCrossFilter((s) => s.filters);
  const setStoreFilter = useCrossFilter((s) => s.setFilter);
  const removeStoreFilter = useCrossFilter((s) => s.removeFilter);
  const clearAllStoreFilters = useCrossFilter((s) => s.clearAllFilters);

  // Adapt the store's `Map<string, CrossFilterEntry>` to the legacy
  // `CrossFilter[]` shape the chip + KPI UI consumes. This is a derived
  // view, not a duplicate state.
  const crossFilters = React.useMemo<CrossFilter[]>(() => {
    const out: CrossFilter[] = [];
    for (const entry of storeFilters.values()) {
      out.push({
        sourceId: entry.sourceId,
        dimension: entry.field,
        value: entry.value as string | number,
        displayLabel: entry.sourceId.startsWith('kpi:')
          ? `KPI: ${entry.value}`
          : `${entry.field}: ${entry.value}`,
      });
    }
    return out;
  }, [storeFilters]);

  const effectiveFilters = React.useMemo<DashboardFilters>(() => {
    const merged: DashboardFilters = { ...sidebarFilters };
    for (const cf of crossFilters) {
      if (cf.dimension === 'department') merged.department = String(cf.value);
      else if (cf.dimension === 'gender') merged.gender = String(cf.value);
      else if (cf.dimension === 'collarType') merged.collarType = String(cf.value);
      else if (cf.dimension === 'education') merged.education = String(cf.value);
    }
    return merged;
  }, [sidebarFilters, crossFilters]);

  React.useEffect(() => {
    let active = true;
    const timer = setTimeout(
      () => {
        setLoading(true);
        Promise.all([getLiveKPIs(effectiveFilters), getLiveCharts(effectiveFilters)])
          .then(([k, c]) => {
            if (active) {
              setKpis(k ?? []);
              setCharts(c ?? []);
            }
          })
          .finally(() => {
            if (active) setLoading(false);
          });
      },
      crossFilters.length > 0 || sidebarFilters ? 300 : 0,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [effectiveFilters, retryCount]);

  const handleRetry = React.useCallback(() => {
    refreshDashboardData();
    setRetryCount((c) => c + 1);
  }, []);

  /**
   * Replicate the bespoke `toggleCrossFilter` semantics (replace by
   * dimension, toggle off on same dim+value) on top of the store API.
   *
   * Codex iter-1 PR-X4a fix: the bespoke helper was source-agnostic — it
   * removed the existing filter whenever `dimension + value` matched,
   * regardless of which chart originally emitted it. Multiple charts
   * (`dept-salary-comparison`, `gender-salary-comparison`,
   * `dept-percentile-radar`) all emit the `department` dimension, so a
   * source-sensitive comparison would silently change UX (the second
   * chart would replace instead of toggling off).
   */
  const toggleStoreFilter = React.useCallback(
    (sourceId: string, dimension: string, value: string) => {
      // Find any existing filter with the same dimension (any sourceId).
      let existingKey: string | null = null;
      let existingValue: unknown = null;
      for (const [key, entry] of storeFilters.entries()) {
        if (entry.field === dimension) {
          existingKey = key;
          existingValue = entry.value;
          break;
        }
      }
      if (existingKey && String(existingValue) === value) {
        // Same dim + same val (any source) → toggle off (parity with bespoke).
        removeStoreFilter(existingKey);
        return;
      }
      // Different value → replace by dimension.
      if (existingKey) removeStoreFilter(existingKey);
      const entry: CrossFilterEntry = {
        sourceId,
        field: dimension,
        value,
        operator: 'eq',
        createdAt: Date.now(),
      };
      setStoreFilter(entry);
    },
    [storeFilters, setStoreFilter, removeStoreFilter],
  );

  const handleChartClick = React.useCallback(
    (chartId: string, event: ChartClickEvent) => {
      const mapping = CHART_FILTER_MAP[chartId];
      if (!mapping) return;
      const label = event.label ?? event.datum?.[mapping.valueField] ?? '';
      if (!label) return;
      toggleStoreFilter(`chart:${chartId}`, mapping.dimension, String(label));
    },
    [toggleStoreFilter],
  );

  const handleKpiClick = React.useCallback(
    (kpiId: string) => {
      const dimension = KPI_FILTER_MAP[kpiId];
      if (!dimension) return;
      toggleStoreFilter(`kpi:${kpiId}`, dimension, kpiId);
    },
    [toggleStoreFilter],
  );

  const handleRemoveFilter = React.useCallback(
    (filter: CrossFilter) => {
      // Find the store key that matches this UI-level CrossFilter and remove
      // it. The chip has no `sourceId:field` so we match by source+dim.
      for (const [key, entry] of storeFilters.entries()) {
        if (entry.sourceId === filter.sourceId && entry.field === filter.dimension) {
          removeStoreFilter(key);
          return;
        }
      }
    },
    [storeFilters, removeStoreFilter],
  );

  const handleClearAll = React.useCallback(() => {
    clearAllStoreFilters();
  }, [clearAllStoreFilters]);

  const makeChartClickHandler = React.useCallback(
    (chartId: string) => {
      if (!CHART_FILTER_MAP[chartId]) return undefined;
      return (event: ChartClickEvent) => handleChartClick(chartId, event);
    },
    [handleChartClick],
  );

  const findChart = (id: string) => charts.find((c) => c.id === id);

  if (loading) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="h-20 animate-pulse rounded-lg bg-surface-muted" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-64 animate-pulse rounded-lg bg-surface-muted" />
          <div className="h-64 animate-pulse rounded-lg bg-surface-muted" />
        </div>
      </div>
    );
  }

  const hasData = kpis.length > 0 || charts.length > 0;

  return (
    <div className={sectionClass}>
      {!hasData && (
        <div className="mb-6 rounded-lg border border-state-warning-border bg-state-warning-surface p-4 text-sm text-state-warning-text flex items-center justify-between gap-3">
          <span>
            Dashboard verileri yüklenemedi. Backend report-service servisinin çalıştığından emin
            olun.
          </span>
          <button
            type="button"
            onClick={handleRetry}
            className="shrink-0 rounded-lg bg-action-primary px-3 py-1.5 text-xs font-semibold text-action-primary-text shadow-xs transition hover:opacity-90"
          >
            Tekrar Dene
          </button>
        </div>
      )}

      {/* Active Cross-Filter Chips */}
      <ActiveFilterChips
        filters={crossFilters}
        onRemove={handleRemoveFilter}
        onClearAll={handleClearAll}
      />

      {/* KPI Strip */}
      <div className={kpiStripClass}>
        {kpis.length > 0 ? (
          kpis.map((kpi) => (
            <KPICard
              key={kpi.id}
              kpi={kpi}
              onClick={KPI_FILTER_MAP[kpi.id] ? () => handleKpiClick(kpi.id) : undefined}
              active={crossFilters.some((f) => f.sourceId === `kpi:${kpi.id}`)}
            />
          ))
        ) : (
          <>
            {[
              'Medyan Maaş',
              'Compa-Ratio',
              'Cinsiyet Farkı',
              'İşveren Maliyeti',
              'YoY Artış',
              'P90/P10',
              'Fazla Mesai',
              'Gini',
            ].map((label) => (
              <div key={label} className={`${cardClass} flex flex-col gap-1`}>
                <span className="text-xs text-text-subtle">{label}</span>
                <span className="text-lg font-semibold text-text-subtle">—</span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Maaş Dağılımı Histogramı */}
      <div className={chartFullClass}>
        <ChartBlock
          chart={findChart('salary-histogram')}
          title="Maaş Dağılımı Histogramı"
          height="h-80"
          gridColumns={[
            { key: 'label', label: 'Bant' },
            { key: 'value', label: 'Kişi Sayısı', format: 'number' },
          ]}
        >
          {renderChartContent(
            findChart('salary-histogram'),
            makeChartClickHandler('salary-histogram'),
          )}
        </ChartBlock>
      </div>

      {/* Departman Bazlı Maaş Karşılaştırma */}
      <div className={chartFullClass}>
        <ChartBlock
          chart={findChart('dept-salary-comparison')}
          title="Departman Bazlı Maaş Karşılaştırma"
          height="h-96"
          gridColumns={[
            { key: 'label', label: 'Departman' },
            { key: 'value', label: 'Ort. Maaş', format: 'currency' },
          ]}
        >
          {renderChartContent(
            findChart('dept-salary-comparison'),
            makeChartClickHandler('dept-salary-comparison'),
          )}
        </ChartBlock>
      </div>

      {/* Cinsiyet + Eğitim */}
      <div className={chartRowClass}>
        <ChartBlock
          chart={findChart('gender-salary-comparison')}
          title="Cinsiyet Bazlı Maaş Karşılaştırma"
          gridColumns={[
            { key: 'label', label: 'Departman' },
            { key: 'value', label: 'Erkek Ort.', format: 'currency' },
            { key: 'value2', label: 'Kadın Ort.', format: 'currency' },
          ]}
        >
          {renderChartContent(
            findChart('gender-salary-comparison'),
            makeChartClickHandler('gender-salary-comparison'),
          )}
        </ChartBlock>

        <ChartBlock
          chart={findChart('education-salary-premium')}
          title="Eğitim Seviyesi Primi"
          gridColumns={[
            { key: 'label', label: 'Eğitim' },
            { key: 'value', label: 'Ort. Maaş', format: 'currency' },
          ]}
        >
          {renderChartContent(
            findChart('education-salary-premium'),
            makeChartClickHandler('education-salary-premium'),
          )}
        </ChartBlock>
      </div>

      {/* 12 Aylık Maaş Trendi */}
      <div className={chartFullClass}>
        <ChartBlock
          chart={findChart('salary-trend-12m')}
          title="12 Aylık Maaş Trendi"
          height="h-80"
          gridColumns={[
            { key: 'label', label: 'Ay' },
            { key: 'value', label: 'Ort. Maaş', format: 'currency' },
            { key: 'value2', label: 'Çalışan Sayısı', format: 'number' },
          ]}
        >
          {renderChartContent(
            findChart('salary-trend-12m'),
            makeChartClickHandler('salary-trend-12m'),
          )}
        </ChartBlock>
      </div>

      {/* Yaka Tipi + Kıdem */}
      <div className={chartRowClass}>
        <ChartBlock
          chart={findChart('collar-type-salary')}
          title="Yaka Tipi Dağılımı"
          gridColumns={[
            { key: 'label', label: 'Yaka Tipi' },
            { key: 'value', label: 'Ort. Maaş', format: 'currency' },
            { key: 'value2', label: 'Kişi Sayısı', format: 'number' },
          ]}
        >
          {renderChartContent(
            findChart('collar-type-salary'),
            makeChartClickHandler('collar-type-salary'),
          )}
        </ChartBlock>

        <ChartBlock
          chart={findChart('tenure-salary-relation')}
          title="Kıdem — Maaş İlişkisi"
          gridColumns={[
            { key: 'label', label: 'Kıdem Bandı' },
            { key: 'value', label: 'Ort. Maaş', format: 'currency' },
          ]}
        >
          {renderChartContent(
            findChart('tenure-salary-relation'),
            makeChartClickHandler('tenure-salary-relation'),
          )}
        </ChartBlock>
      </div>

      {/* Maliyet Yapısı Şelale */}
      <div className={chartFullClass}>
        <ChartBlock
          chart={findChart('cost-waterfall')}
          title="Maliyet Yapısı Şelale"
          height="h-96"
          gridColumns={[
            { key: 'label', label: 'Maliyet Kalemi' },
            { key: 'value', label: 'Tutar', format: 'currency' },
          ]}
        >
          {renderChartContent(findChart('cost-waterfall'), makeChartClickHandler('cost-waterfall'))}
        </ChartBlock>
      </div>

      {/* Şirket Pie + Departman Yüzdelik */}
      <div className={chartRowClass}>
        <ChartBlock
          chart={findChart('company-payroll-pie')}
          title="Şirket Bordro Dağılımı"
          height="h-72"
          gridColumns={[
            { key: 'label', label: 'Şirket' },
            { key: 'value', label: 'Toplam Bordro', format: 'currency' },
          ]}
        >
          {renderChartContent(
            findChart('company-payroll-pie'),
            makeChartClickHandler('company-payroll-pie'),
          )}
        </ChartBlock>

        <ChartBlock
          chart={findChart('dept-percentile-radar')}
          title="Departman Yüzdelik Karşılaştırma"
          gridColumns={[
            { key: 'label', label: 'Departman' },
            { key: 'min_val', label: 'Min', format: 'currency' },
            { key: 'value', label: 'Ort.', format: 'currency' },
            { key: 'max_val', label: 'Max', format: 'currency' },
          ]}
        >
          {renderChartContent(
            findChart('dept-percentile-radar'),
            makeChartClickHandler('dept-percentile-radar'),
          )}
        </ChartBlock>
      </div>
    </div>
  );
};

/**
 * Outer wrapper — provides an isolated cross-filter store for this
 * dashboard. Faz 21.8 PR-X4a: this is the public component; consumers
 * (`HrCompensationReport.tsx`) keep their import path unchanged.
 *
 * `debounceMs: 0` removes the default 150ms debounce delay so chart
 * clicks feel near-instantaneous (close to bespoke pre-migration UX).
 * Note: setFilter still goes through `setTimeout(..., 0)` per the store
 * implementation, so multiple rapid setFilter calls in the same call
 * stack may still coalesce; for normal click cadence the final state is
 * indistinguishable from synchronous mutation. The store still caps
 * history at the default 50 snapshots.
 */
export const CompensationDashboard: React.FC<CompensationDashboardProps> = ({ filters }) => (
  <CrossFilterProvider options={{ groupId: 'hr-compensation', debounceMs: 0 }}>
    <CompensationDashboardInner filters={filters} />
  </CrossFilterProvider>
);

export default CompensationDashboard;
