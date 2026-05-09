# ChartMarkup Overlay — Consumer Guide

`@mfe/x-charts` markup overlay layer (Highcharts annotation parity).
Threshold lines, highlight bands, anomaly markers, KPI labels — her şey
chart series üstüne render olur, data series'i bozmaz.

**Status: Stable** (2026-05-09 itibarıyla; PR #350 ile 13 chart için
end-to-end deploy edildi).

> **Cross-filter ile karışmasın.** ChartMarkup runtime overlay'i
> (markup) cross-filter ekosisteminden BAĞIMSIZDIR — markup click
> event'leri ayrı `onMarkupClick` callback'ten gider, cross-filter
> bus'ı kirletmez. Cross-filter için `docs/cross-filter.md`.

---

## Hızlı başlangıç

```tsx
import { BarChart, type ChartMarkup } from '@mfe/x-charts';

const SALES_DATA = [
  { label: 'Jan', value: 320 },
  { label: 'Feb', value: 480 },
  { label: 'Mar', value: 290 },
  { label: 'Apr', value: 720 },
];

const MARKUPS: ChartMarkup[] = [
  {
    id: 'budget',
    type: 'line',
    axis: 'y',
    value: 600,
    label: { text: 'Budget', position: 'end' },
    color: 'var(--state-success-text, #22c55e)',
    style: 'dashed',
  },
  {
    id: 'q1-band',
    type: 'area',
    axis: 'x',
    from: 'Jan',
    to: 'Mar',
    label: { text: 'Q1' },
    color: 'var(--accent-soft, #c7d2fe)',
    opacity: 0.25,
  },
];

<BarChart
  data={SALES_DATA}
  markups={MARKUPS}
  onMarkupClick={(e) => console.log('markup clicked:', e.markup)}
/>;
```

---

## Beş markup tipi

```ts
type ChartMarkup =
  | LineMarkup // axis-aligned threshold line
  | SegmentMarkup // sloped 2-coord line (regression / OLS)
  | AreaMarkup // highlighted band (warning zone)
  | PointMarkup // single emphasized data point (anomaly)
  | LabelMarkup; // free-floating text label
```

Her markup `BaseMarkup`'tan extend eder:

```ts
interface BaseMarkup {
  id: string; // ZORUNLU — click lookup key
  ariaLabel?: string; // RESERVED metadata — ECharts aria mapping v2 backlog (şu an SR'a forward edilmiyor)
  source?: 'manual' | 'ai_trend' | 'ai_anomaly' | 'threshold';
  target?: { seriesIndex?: number; seriesName?: string };
}
```

> **`ariaLabel` durumu (Codex post-impl review absorb):** Şu an sadece
> tipte tutulan metadata. `adaptToEcharts` mapper'ları ECharts
> `aria` field'larına forward etmiyor; chart-level `aria.label.description`
> mevcut (`ChartA11yShell` üzerinden) ama per-markup SR override v2
> backlog (drawing tools UI ile gelecek).

### LineMarkup — axis-aligned threshold

```ts
{
  id: 'sla-target',
  type: 'line',
  axis: 'y',           // 'x' | 'y'
  value: 100,          // numeric for value axis; string for category
  label?: { text: string; position?: 'start' | 'middle' | 'end' };
  color?: string;
  style?: 'solid' | 'dashed' | 'dotted';
  width?: number;
}
```

### SegmentMarkup — sloped line (regression / OLS)

```ts
{
  id: 'trend-segment',
  type: 'segment',
  from: { x: 'Jan', y: 100 },  // data coord
  to: { x: 'Dec', y: 450 },
  label?: { text: string; position?: 'start' | 'middle' | 'end' };
  color?: string;
  style?: 'solid' | 'dashed' | 'dotted';
  width?: number;
}
```

### AreaMarkup — highlighted band

```ts
{
  id: 'risk-zone',
  type: 'area',
  axis: 'x',           // 'x' | 'y'
  from: 'Q2',
  to: 'Q3',
  label?: { text: string };
  color?: string;
  opacity?: number;    // default 0.15
}
```

### PointMarkup — single emphasized point

```ts
{
  id: 'spike',
  type: 'point',
  x: 'Mar',
  y: 950,              // numeric or string (Heatmap categorical)
  label?: { text: string };
  symbol?: 'circle' | 'rect' | 'triangle' | 'diamond' | 'arrow';
  color?: string;
  size?: number;       // default 8
}
```

### LabelMarkup — free-floating text

```ts
{
  id: 'campaign-note',
  type: 'label',
  text: 'Spring campaign launched',
  // Üç anchor varyantı:
  anchor: { x: 'Apr', y: 600 },                    // explicit data coord
  // veya:
  anchor: { dataIndex: 5, seriesIndex?: 0 },       // dataContext lookup
  // veya (Heatmap-friendly shorthand):
  anchor: { xLabel: 'Wed', yLabel: 'AM' },         // categorical kısa-yol
  color?: string;
  background?: string;
}
```

> **`anchor: { dataIndex }` shorthand kapsamı:** Bar (single series),
> Line, Area chart'larda `dataContext.labels[i]` + `series[s].data[i]`
> üzerinden çalışır. **Heatmap** için de artık desteklenir — shim
> `dataContext.series[0].data[i]` içine `{ x: <xCat>, y: <yCat>,
value }` cell-tuple koyduğu için resolver kategorik (xCat, yCat)
> çiftini direkt çıkarır.
>
> **`anchor: { xLabel, yLabel }` shorthand:** Heatmap için
> `dataContext` lookup'ına gerek bırakmayan kısa-yol — cell label'ları
> zaten elindeyse `anchor: { xLabel: 'Wed', yLabel: 'AM' }` yeter.
> Bu varyant tüm chart'larda kabul edilir; uygunluk koordinat
> sistemine bağlıdır (numeric axis'te string verirsen ECharts hizalayamaz).

---

## 13 chart support matrisi

(Codex iter-3 absorbed contract — 5 full + 1 partial + 7 no-op)

| Chart              | line | segment | area | point | label | Strateji                |
| ------------------ | :--: | :-----: | :--: | :---: | :---: | ----------------------- |
| **BarChart**       |  ✅  |   ✅    |  ✅  |  ✅   |  ✅   | full (cartesian)        |
| **LineChart**      |  ✅  |   ✅    |  ✅  |  ✅   |  ✅   | full                    |
| **AreaChart**      |  ✅  |   ✅    |  ✅  |  ✅   |  ✅   | full                    |
| **ScatterChart**   |  ✅  |   ✅    |  ✅  |  ✅   |  ✅   | full                    |
| **HeatmapChart**   |  ✅  |   ✅    |  ✅  |  ✅   |  ✅   | full (categorical x/y)¹ |
| **WaterfallChart** |  ⚠️  |   ✅    |  ⚠️  |  ✅   |  ✅   | partial²                |
| PieChart           |  ❌  |   ❌    |  ❌  |  ❌   |  ❌   | no-op + dev warning     |
| GaugeChart         |  ❌  |   ❌    |  ❌  |  ❌   |  ❌   | no-op + dev warning     |
| RadarChart         |  ❌  |   ❌    |  ❌  |  ❌   |  ❌   | no-op³                  |
| FunnelChart        |  ❌  |   ❌    |  ❌  |  ❌   |  ❌   | no-op + dev warning     |
| TreemapChart       |  ❌  |   ❌    |  ❌  |  ❌   |  ❌   | no-op (hierarchical)    |
| SankeyChart        |  ❌  |   ❌    |  ❌  |  ❌   |  ❌   | no-op (network)         |
| SunburstChart      |  ❌  |   ❌    |  ❌  |  ❌   |  ❌   | no-op (hierarchical)    |

¹ Heatmap LabelMarkup üç anchor varyantını da destekler: explicit
`{ x, y }`, `{ dataIndex, seriesIndex? }` (shim `dataContext.series[0].data[i]`
içine cell-tuple `{x, y, value}` koyar), veya kısa-yol
`{ xLabel, yLabel }`.

² Waterfall: line/area patches mevcut connector `markLine` ile MERGE
edilir (Codex iter-2 P1: per-endpoint `silent: true` connector
data, user markup APPEND ile clickable kalır). Base series
(`__waterfall_base__`) untouched.

³ Radar v2 backlog: `anchor: { indicatorIndex; seriesIndex? }`.

No-op chart'lar `markups` prop'u kabul eder (API consistency); adapter
dev warning emit eder, hiçbir patch render edilmez. Production'da
warning susar (NODE_ENV='production').

---

## Click events — markup vs data ayrımı

```tsx
<BarChart
  data={data}
  markups={[budget, riskZone]}
  onDataPointClick={(e) => {
    // CHART data click — bar / point / slice tıklandığında
    // cross-filter wrapper buraya bağlanabilir
    console.log('data click:', e.datum);
  }}
  onMarkupClick={(e) => {
    // MARKUP overlay click — threshold / band / label tıklandığında
    // cross-filter bus'ı kirletmez (ayrı callback)
    console.log('markup click:', e.markup);
  }}
/>
```

ECharts `componentType: 'markLine' | 'markArea' | 'markPoint'` ayrımı
chart shim seviyesinde yapılır; **markup click `onDataPointClick`
çağrısını TETİKLEMEZ** (early return).

`ChartMarkupClickEvent` shape:

```ts
interface ChartMarkupClickEvent {
  markup: ChartMarkup; // Looked up by id from markupLookup
  chartType: string; // 'bar' | 'line' | ...
  seriesIndex?: number;
  dataIndex?: number;
  nativeParams: unknown; // raw ECharts params (opaque, power users)
}
```

---

## AI Overlay — `useTrendOverlay` + `useAnomalyOverlay`

### Trend (OLS regression)

```tsx
import { LineChart, useTrendOverlay } from '@mfe/x-charts';

function SalesWithTrend() {
  const trendData = sales.map(({ month, revenue }) => ({
    x: month,
    y: revenue,
  }));
  const trend = useTrendOverlay({
    data: trendData,
    method: 'ols', // v1 default; 'movingAverage' / 'exponential' v2 backlog
    color: 'var(--state-info-text, #06b6d4)',
  });

  return (
    <LineChart
      series={[{ name: 'Revenue', data: sales.map((s) => s.revenue) }]}
      labels={sales.map((s) => s.month)}
      markups={trend} // SegmentMarkup + LabelMarkup (Slope: N · R²: N)
    />
  );
}
```

**Numeric x noktası:** her x numeric ise gerçek x değerleriyle
regression (irregular spacing / timestamps doğru); herhangi biri string
ise index-based fallback (orijinal label segment koordinatlarında
korunur). NaN/Infinity reject (boş array döner).

### Anomaly (IQR fences)

```tsx
import { LineChart, useAnomalyOverlay } from '@mfe/x-charts';

function LatencyWithOutliers() {
  const anomalyData = latencies.map(({ ts, ms }) => ({ x: ts, y: ms }));
  const anomalies = useAnomalyOverlay({
    data: anomalyData,
    method: 'iqr',
    k: 1.5,                  // Tukey fence multiplier
    color: 'var(--state-error-text, #ef4444)',
    size: 14,
  });

  return <LineChart series={...} labels={...} markups={anomalies} />;
}
```

PointMarkup output, ↑/↓ direction labelıyla outlier'ları işaretler.
Minimum 4 nokta (IQR meaningless on tiny samples).

### Composable — birlikte kullanım

```tsx
const trend = useTrendOverlay({ data: salesData });
const anomalies = useAnomalyOverlay({ data: salesData });

<LineChart series={...} labels={...} markups={[...trend, ...anomalies]} />;
```

---

## Performans

Pure adapter throughput gate (CI runner-tolerant best-of-3):

| Senaryo                                                    | Bütçe    |
| ---------------------------------------------------------- | -------- |
| 1000 line markups adapt                                    | < 150 ms |
| 1000 mixed-variant markups                                 | < 150 ms |
| 1000 markups × 10 series target (per-series patch routing) | < 150 ms |

Local target 100 ms; CI runner headroom 150 ms (jsdom React render
bench bilinçli olarak DEĞIL — Codex iter-3 absorb).

---

## Pure helper: `adaptToEcharts` (advanced)

React'siz consumer'lar (SSR, test fixture, custom render) için:

```ts
import { adaptToEcharts, mergeMarkupPatches, type ChartMarkup } from '@mfe/x-charts';

const result = adaptToEcharts(markups, {
  chartType: 'bar',
  orientation: 'vertical',
  devMode: process.env.NODE_ENV !== 'production',
  dataContext: {
    labels: ['Jan', 'Feb', 'Mar'],
    series: [{ name: 'Sales', data: [10, 20, 30] }],
  },
});

// result.seriesPatches: SeriesPatch[]
// result.markupLookup: Map<string, ChartMarkup>
// result.warnings: string[]

// Merge into existing ECharts series array:
const merged = mergeMarkupPatches(echartsSeries, result.seriesPatches);
```

Pure: NO React, NO ECharts instance (`convertToPixel` yok), NO module
side effects.

---

## Bilinen sınırlamalar (v2 backlog)

| Item                                                                  | Durum                                                                               |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| ~~**Heatmap LabelMarkup `dataIndex` anchor**~~                        | ✅ Closed — `{ dataIndex }` + `{ xLabel, yLabel }` (Codex thread `019e0e20` iter-2) |
| **Pie/Gauge/Funnel native series-label patches**                      | v2 backlog (markup → series.label)                                                  |
| **Radar indicator anchor** (`anchor: { indicatorIndex }`)             | v2 backlog                                                                          |
| **Drawing tools UI** (toolbar + state + serialize)                    | v2 — Highcharts Stock Tools parity                                                  |
| **Editable / draggable annotations**                                  | v2 — drag handle + transform state                                                  |
| **Stock-specific tech analysis** (Fibonacci, Pitchfork, Elliott Wave) | v2 — finansal alan, ihtiyaca göre defer                                             |
| **Multi-user annotation sync** (`useRealTimeData` ile collab)         | v2                                                                                  |
| **`movingAverage` / `exponential` trend method**                      | v2 (şu an OLS only)                                                                 |
| **`zscore` anomaly method**                                           | v2 (şu an IQR only)                                                                 |

---

## İlgili dokümanlar

- **API source**: `packages/x-charts/src/annotations/`
- **Types**: `packages/x-charts/src/types.ts` (`ChartMarkup` discriminated union)
- **Tests**:
  - `adaptToEcharts.test.ts` (32 unit case)
  - `computeTrendOverlay.test.ts` (14 case incl. numeric x finite guards)
  - `computeAnomalyOverlay.test.ts` (6 case)
  - `markup-bench.test.ts` (4 perf gate)
  - `markup-name-collision.test.ts` (compile-time `ChartMarkup` ≠ `ChartAnnotation` ≠ `Annotation`)
  - `waterfall-markup-merge.test.tsx` (Waterfall connector + markup pair shape)
- **Storybook**: `packages/x-charts/src/__stories__/MarkupDemo.stories.tsx` (3 story: Manual + Trend + Anomaly)
- **Cross-filter** (ayrı feature): `docs/cross-filter.md`
- **Sweep PR**: PR #350 (12 commit, foundation → 13 shim → AI overlay → bench/storybook → Codex iter-1..3 absorb)
- **Codex review threads**: `019e0df1` (plan-time), `019e0e20` (post-impl)
