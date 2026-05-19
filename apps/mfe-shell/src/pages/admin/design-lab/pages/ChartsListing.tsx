/**
 * ChartsListing — Design Lab Charts category landing page
 *
 * Displays all chart components from @mfe/x-charts organized by group.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';

/* ------------------------------------------------------------------ */
/*  Chart Items Data                                                   */
/* ------------------------------------------------------------------ */

interface ChartItem {
  id: string;
  name: string;
  description: string;
  group: string;
  tier: 'core' | 'enterprise' | 'interaction' | 'ai' | 'perf';
  icon: string;
}

const CHART_GROUPS = [
  { id: 'charts_core', title: 'Core Charts', description: 'Temel grafik tipleri' },
  {
    id: 'charts_enterprise',
    title: 'Enterprise Charts',
    description: 'Gelismis analitik grafik tipleri',
  },
  {
    id: 'charts_interaction',
    title: 'Interaction & Composition',
    description: 'Chart container, dashboard, cross-filter',
  },
  {
    id: 'charts_ai',
    title: 'AI & Transforms',
    description: 'Otomatik chart onerisi, anomali, trend, NL->Chart',
  },
  {
    id: 'charts_perf',
    title: 'Performance & Infra',
    description: 'Downsampling, lazy loading, cache, code-split',
  },
] as const;

const CHART_ITEMS: ChartItem[] = [
  // Core
  {
    id: 'bar-chart',
    name: 'BarChart',
    description: 'Kategorik karsilastirma. Dikey/yatay, multi-series.',
    group: 'charts_core',
    tier: 'core',
    icon: 'bar',
  },
  {
    id: 'line-chart',
    name: 'LineChart',
    description: 'Trend analizi. Zaman serisi veya sirali veri.',
    group: 'charts_core',
    tier: 'core',
    icon: 'line',
  },
  {
    id: 'area-chart',
    name: 'AreaChart',
    description: 'Stacked area, gradient fill, kumulatif gosterim.',
    group: 'charts_core',
    tier: 'core',
    icon: 'area',
  },
  {
    id: 'pie-chart',
    name: 'PieChart',
    description: 'Oran dagilimi. Donut modu, innerLabel.',
    group: 'charts_core',
    tier: 'core',
    icon: 'pie',
  },
  {
    id: 'scatter-chart',
    name: 'ScatterChart',
    description: 'Iki degisken arasi korelasyon.',
    group: 'charts_core',
    tier: 'core',
    icon: 'scatter',
  },
  // Enterprise
  {
    id: 'gauge-chart',
    name: 'GaugeChart',
    description: 'KPI gostergesi, tek deger, hedef araligi.',
    group: 'charts_enterprise',
    tier: 'enterprise',
    icon: 'gauge',
  },
  {
    id: 'radar-chart',
    name: 'RadarChart',
    description: 'Cok boyutlu karsilastirma (performans profili).',
    group: 'charts_enterprise',
    tier: 'enterprise',
    icon: 'radar',
  },
  {
    id: 'treemap-chart',
    name: 'TreemapChart',
    description: 'Hiyerarsik orantili alan gosterimi.',
    group: 'charts_enterprise',
    tier: 'enterprise',
    icon: 'treemap',
  },
  {
    id: 'heatmap-chart',
    name: 'HeatmapChart',
    description: 'Iki boyutlu yogunluk matrisi.',
    group: 'charts_enterprise',
    tier: 'enterprise',
    icon: 'heatmap',
  },
  {
    id: 'waterfall-chart',
    name: 'WaterfallChart',
    description: 'Artis/azalis kumulatif analiz.',
    group: 'charts_enterprise',
    tier: 'enterprise',
    icon: 'waterfall',
  },
  {
    id: 'funnel-chart',
    name: 'FunnelChart',
    description: 'Donusum hunisi, asama bazli dusus.',
    group: 'charts_enterprise',
    tier: 'enterprise',
    icon: 'funnel',
  },
  {
    id: 'sankey-chart',
    name: 'SankeyChart',
    description: 'Akis diyagrami, kaynak-hedef iliskileri.',
    group: 'charts_enterprise',
    tier: 'enterprise',
    icon: 'sankey',
  },
  {
    id: 'sunburst-chart',
    name: 'SunburstChart',
    description: 'Cok katmanli hiyerarsik dagilim.',
    group: 'charts_enterprise',
    tier: 'enterprise',
    icon: 'sunburst',
  },
  // PR-X6 (Codex thread 019e1e30 AGREE): statistical box-and-whisker
  // chart for five-number summary distributions.
  {
    id: 'box-plot-chart',
    name: 'BoxPlotChart',
    description: 'Istatistiksel dagilim, min-Q1-medyan-Q3-max bes sayi ozeti.',
    group: 'charts_enterprise',
    tier: 'enterprise',
    icon: 'bar',
  },
  // PR-X7 (Codex thread 019e1e30 AGREE): financial OHLC chart with
  // bullish/bearish color coding for stock/crypto price ranges.
  {
    id: 'candlestick-chart',
    name: 'CandlestickChart',
    description: 'Finansal OHLC mum grafigi, bullish/bearish renk kodlu.',
    group: 'charts_enterprise',
    tier: 'enterprise',
    icon: 'bar',
  },
  // PR-X10 (Codex thread 019e1e30 AGREE): decorative pictogram bar
  // chart rendering each bar as a tiled symbol (icon-style).
  {
    id: 'pictorial-bar-chart',
    name: 'PictorialBarChart',
    description: 'Dekoratif piktogram bar, her bar tiled symbol/icon.',
    group: 'charts_enterprise',
    tier: 'enterprise',
    icon: 'bar',
  },
  // PR-X12a (Codex thread 019e2119 AGREE): multi-dim parallel-coords
  // plot for HR compensation eşitliği / employee profile analysis.
  {
    id: 'parallel-coordinates-chart',
    name: 'ParallelCoordinatesChart',
    description: 'Cok boyutlu paralel koordinat (her satir polyline, N axis).',
    group: 'charts_enterprise',
    tier: 'enterprise',
    icon: 'line',
  },
  // PR-X12b (Codex thread 019e2119 AGREE): network / entity-edge
  // topology graph (Context Health DocGraph, permission cascade).
  {
    id: 'graph-chart',
    name: 'GraphChart',
    description: 'Network/graf topolojisi, force/circular layout, node-edge iliskileri.',
    group: 'charts_enterprise',
    tier: 'enterprise',
    icon: 'sankey',
  },
  // PR-X12c (Codex thread 019e2254 AGREE): geographic choropleth map
  // for HR location distribution + branch concentration.
  {
    id: 'geo-map',
    name: 'GeoMap',
    description: 'Cografi choropleth harita (TR il, world, vb). visualMap renk gradyani.',
    group: 'charts_enterprise',
    tier: 'enterprise',
    icon: 'heatmap',
  },
  // Faz 21.11 P1a — 3D Extension Pack. Lazy `echarts-gl` chunk loads
  // on first 3D mount; WebGL-required.
  {
    id: 'scatter-3d-chart',
    name: 'Scatter3D',
    description: '3B nokta bulutu, WebGL-required.',
    group: 'charts_enterprise',
    tier: 'enterprise',
    icon: 'scatter',
  },
  // Faz 21.11 P1b — Surface + multi-path Lines (line3D series).
  {
    id: 'surface-3d-chart',
    name: 'Surface3D',
    description: '3B yüzey grafiği (rectangular grid), WebGL-required.',
    group: 'charts_enterprise',
    tier: 'enterprise',
    icon: 'heatmap',
  },
  {
    id: 'lines-3d-chart',
    name: 'Lines3D',
    description: '3B çoklu xyz path (line3D series), WebGL-required.',
    group: 'charts_enterprise',
    tier: 'enterprise',
    icon: 'line',
  },
  // Faz 21.11 P1c — Globe wrapper (geo sphere with multi-layer).
  {
    id: 'globe-chart',
    name: 'Globe',
    description: 'Geo küre (multi-layer scatter/lines/bar), WebGL-required.',
    group: 'charts_enterprise',
    tier: 'enterprise',
    icon: 'sankey',
  },
  // PR-X16a (Codex thread 019e32da AGREE): ECharts Depth campaign —
  // hierarchical node-link tree (org-chart / expand-collapse hierarchy).
  {
    id: 'tree-chart',
    name: 'TreeChart',
    description: 'Hiyerarsik node-link agac, orthogonal/radial, expand-collapse.',
    group: 'charts_enterprise',
    tier: 'enterprise',
    icon: 'treemap',
  },
  // PR-X16b (Codex thread 019e33a9 AGREE): ECharts Depth campaign —
  // GitHub-contributions-style daily calendar heatmap.
  {
    id: 'calendar-heatmap',
    name: 'CalendarHeatmap',
    description: 'GitHub tarzi gunluk takvim heatmap, aktivite yogunlugu.',
    group: 'charts_enterprise',
    tier: 'enterprise',
    icon: 'heatmap',
  },
  // PR-X16c (Codex thread 019e35b3 AGREE): ECharts Depth campaign —
  // categorical radial chart (bar/line/scatter on a polar grid).
  {
    id: 'polar-chart',
    name: 'PolarChart',
    description: 'Kategorik radyal grafik, polar eksende bar/line/scatter.',
    group: 'charts_enterprise',
    tier: 'enterprise',
    icon: 'radar',
  },
  // PR-X16d (Codex thread 019e3615 AGREE): ECharts Depth campaign —
  // stream graph (themeRiver series on a singleAxis time grid).
  {
    id: 'theme-river-chart',
    name: 'ThemeRiverChart',
    description: 'Akarsu/stream grafik, zaman ekseninde kategori hacmi.',
    group: 'charts_enterprise',
    tier: 'enterprise',
    icon: 'area',
  },
  // PR-X16e (Codex thread 019e365b AGREE): ECharts Depth campaign —
  // project-schedule timeline (custom series, task bars on a time axis).
  {
    id: 'gantt-chart',
    name: 'GanttChart',
    description: 'Proje zaman cizelgesi, zaman ekseninde gorev cubuklari.',
    group: 'charts_enterprise',
    tier: 'enterprise',
    icon: 'bar',
  },
  // PopulationPyramid (Codex thread 019e3f75 AGREE): HR age × gender
  // demographic pyramid — diverging horizontal bar.
  {
    id: 'population-pyramid',
    name: 'PopulationPyramid',
    description: 'IK nufus piramidi, yas bandi x cinsiyet diverging bar.',
    group: 'charts_enterprise',
    tier: 'enterprise',
    icon: 'bar',
  },
  // ComboChart (Codex thread 019e41cd AGREE): dual-axis composite —
  // bar + line series on two independent y-axes.
  {
    id: 'combo-chart',
    name: 'ComboChart',
    description: 'Dual-axis kompozit grafik, bar + line iki ayri y-ekseninde.',
    group: 'charts_enterprise',
    tier: 'enterprise',
    icon: 'bar',
  },
  // EffectScatterChart (Codex thread 019e425b AGREE): standalone
  // effectScatter wrapper — scatter + ripple for outlier emphasis.
  {
    id: 'effect-scatter-chart',
    name: 'EffectScatterChart',
    description: 'Vurgu noktalari, scatter + dalgalanma animasyonu ile outlier isaretleme.',
    group: 'charts_enterprise',
    tier: 'enterprise',
    icon: 'bar',
  },
  // Interaction
  {
    id: 'chart-container',
    name: 'ChartContainer',
    description: 'ECharts wrapper, tema, resize, error boundary.',
    group: 'charts_interaction',
    tier: 'interaction',
    icon: 'container',
  },
  {
    id: 'chart-dashboard',
    name: 'ChartDashboard',
    description: 'Multi-chart layout, grid composition.',
    group: 'charts_interaction',
    tier: 'interaction',
    icon: 'dashboard',
  },
  {
    id: 'chart-toolbar',
    name: 'ChartToolbar',
    description: 'Undo/redo, drill-up, export actions.',
    group: 'charts_interaction',
    tier: 'interaction',
    icon: 'toolbar',
  },
  {
    id: 'kpi-card',
    name: 'KPICard',
    description: 'Tek deger + trend gostergesi.',
    group: 'charts_interaction',
    tier: 'interaction',
    icon: 'kpi',
  },
  {
    id: 'sparkline-chart',
    name: 'SparklineChart',
    description: 'Inline mini grafik.',
    group: 'charts_interaction',
    tier: 'interaction',
    icon: 'sparkline',
  },
  {
    id: 'cross-filter',
    name: 'CrossFilterProvider',
    description: 'Chart-to-chart, chart-to-grid cross-filter bus.',
    group: 'charts_interaction',
    tier: 'interaction',
    icon: 'filter',
  },
  // Faz 21.4 PR-B
  {
    id: 'cross-filter-grid',
    name: 'useGridCrossFilter',
    description: 'Chart -> mock grid filter model bridge demo.',
    group: 'charts_interaction',
    tier: 'interaction',
    icon: 'filter',
  },
  {
    id: 'drill-down',
    name: 'useDrillDown',
    description: '3-seviye hierarchical drill (region -> city -> store) + breadcrumb.',
    group: 'charts_interaction',
    tier: 'interaction',
    icon: 'drill',
  },
  {
    id: 'drill-down-history',
    name: 'useDrillDown (with undo)',
    description: 'Drill state + Undo (drillUp) + Reset + depth/drill counter.',
    group: 'charts_interaction',
    tier: 'interaction',
    icon: 'history',
  },
  // Faz 21.4 PR-C — feature demos
  {
    id: 'feature-brush',
    name: 'Feature: Brush',
    description: 'useChartInteractions enableBrush + brushRange display.',
    group: 'charts_interaction',
    tier: 'interaction',
    icon: 'brush',
  },
  {
    id: 'feature-zoom-pan',
    name: 'Feature: Zoom + Pan',
    description: 'useChartInteractions enableZoom + enablePan handlers.',
    group: 'charts_interaction',
    tier: 'interaction',
    icon: 'zoom',
  },
  {
    id: 'feature-realtime',
    name: 'Feature: Real-time stream',
    description: 'useRealTimeData auto-tick (tickIntervalMs + onTick) + pause/resume buffer.',
    group: 'charts_interaction',
    tier: 'interaction',
    icon: 'realtime',
  },
  {
    id: 'feature-theme-switch',
    name: 'Feature: Theme switch',
    description: 'BarChart theme prop runtime swap (light/dark/high-contrast/print).',
    group: 'charts_interaction',
    tier: 'interaction',
    icon: 'theme',
  },
  {
    id: 'feature-export',
    name: 'Feature: Export',
    description: 'useChartExport PNG/SVG (getDataURL) + CSV (Blob ➜ URL.createObjectURL).',
    group: 'charts_interaction',
    tier: 'interaction',
    icon: 'download',
  },
  // AI
  {
    id: 'nl-to-chart',
    name: 'nlToChartSpec',
    description: 'Dogal dil -> ChartSpec donusturucusu.',
    group: 'charts_ai',
    tier: 'ai',
    icon: 'ai',
  },
  {
    id: 'suggest-chart',
    name: 'suggestChartType',
    description: 'Veri seklinden otomatik chart tipi onerisi.',
    group: 'charts_ai',
    tier: 'ai',
    icon: 'suggest',
  },
  {
    id: 'detect-anomalies',
    name: 'detectAnomalies',
    description: 'IQR-based outlier detection.',
    group: 'charts_ai',
    tier: 'ai',
    icon: 'anomaly',
  },
  {
    id: 'identify-trends',
    name: 'identifyTrends',
    description: 'OLS regression trend identification.',
    group: 'charts_ai',
    tier: 'ai',
    icon: 'trend',
  },
  {
    id: 'chart-description',
    name: 'generateChartDescription',
    description: 'A11y alt text uretici.',
    group: 'charts_ai',
    tier: 'ai',
    icon: 'a11y',
  },
  // Performance
  {
    id: 'lttb',
    name: 'downsampleLTTB',
    description: '100K+ nokta icin LTTB downsampling.',
    group: 'charts_perf',
    tier: 'perf',
    icon: 'perf',
  },
  {
    id: 'progressive-render',
    name: 'useProgressiveRender',
    description: 'Batch rendering, requestIdleCallback.',
    group: 'charts_perf',
    tier: 'perf',
    icon: 'progressive',
  },
  {
    id: 'lazy-chart',
    name: 'useLazyChart',
    description: 'Viewport-aware lazy initialization.',
    group: 'charts_perf',
    tier: 'perf',
    icon: 'lazy',
  },
  {
    id: 'lru-cache',
    name: 'LRUCache',
    description: 'Bounded cache for query results.',
    group: 'charts_perf',
    tier: 'perf',
    icon: 'cache',
  },
  {
    id: 'code-split',
    name: 'lazyChartImport',
    description: 'React.lazy chart type code splitting.',
    group: 'charts_perf',
    tier: 'perf',
    icon: 'split',
  },
];

/* ------------------------------------------------------------------ */
/*  Tier Badge                                                         */
/* ------------------------------------------------------------------ */

const TIER_COLORS: Record<string, string> = {
  core: 'bg-blue-100 text-blue-700',
  enterprise: 'bg-purple-100 text-purple-700',
  interaction: 'bg-green-100 text-green-700',
  ai: 'bg-amber-100 text-amber-700',
  perf: 'bg-rose-100 text-rose-700',
};

const TierBadge: React.FC<{ tier: string }> = ({ tier }) => (
  <span
    className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${TIER_COLORS[tier] ?? 'bg-gray-100 text-gray-600'}`}
  >
    {tier}
  </span>
);

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const ChartsListing: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Charts</h1>
        <p className="mt-1 text-sm text-text-secondary">
          @mfe/x-charts — 24 chart tipi (20 2D + 4 3D), cross-filter, AI, performance. ECharts +
          echarts-gl engine.
        </p>
        <div className="mt-3 flex gap-2 text-xs text-text-tertiary">
          <span>{CHART_ITEMS.length} component/hook</span>
          <span>|</span>
          <span>466 test</span>
          <span>|</span>
          <span>P0-P8 complete</span>
        </div>
      </div>

      {/* Faz 21.11 batch3 follow-up — anomaly detector showcase entry. */}
      <button
        type="button"
        onClick={() => navigate('/admin/design-lab/charts-anomaly-detectors')}
        data-testid="charts-listing-anomaly-showcase-cta"
        className="block w-full rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)] p-4 text-left transition hover:border-[var(--color-border-strong)]"
      >
        <h3 className="text-sm font-semibold text-text-primary">Anomaly Detectors Showcase →</h3>
        <p className="mt-1 text-xs text-text-secondary">
          Faz 21.11 batch3 — 4 detector (Flat IQR, per-indicator IQR, tree-walking IQR, dual-mode
          Sankey IQR) live on a single page with toggleable announcements.
        </p>
      </button>

      {/* Groups */}
      {CHART_GROUPS.map((group) => {
        const items = CHART_ITEMS.filter((i) => i.group === group.id);
        if (items.length === 0) return null;

        return (
          <section key={group.id}>
            <div className="mb-3">
              <h2 className="text-lg font-semibold text-text-primary">{group.title}</h2>
              <p className="text-xs text-text-secondary">{group.description}</p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(`/admin/design-lab/charts/${item.id}`)}
                  // Codex 019e2349 follow-up: stable hooks for the headless
                  // smoke (workflow_dispatch design-lab-23-smoke.yml). The
                  // listing renders buttons, not anchors — so a selector by
                  // `data-chart-slug` is the canonical stable contract for
                  // the spec to enumerate cards.
                  data-testid={`chart-card-${item.id}`}
                  data-chart-slug={item.id}
                  className="group flex flex-col gap-1 rounded-xl border border-border-subtle bg-surface-default p-4 text-left transition hover:border-action-primary hover:shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-text-primary group-hover:text-action-primary">
                      {item.name}
                    </span>
                    <TierBadge tier={item.tier} />
                  </div>
                  <span className="text-xs text-text-secondary line-clamp-2">
                    {item.description}
                  </span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
};

export default ChartsListing;
