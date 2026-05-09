# Cross-Filter — Consumer Guide

`@mfe/x-charts` cross-filter ekosistemi 13 chart adapter'ı tek bir
shared bus üzerinden bağlar: bir chart'ta yapılan tıklama diğer
chart'ları (ve isteğe bağlı AG Grid'leri) otomatik filtreler.

**Status: Stable** (2026-05-09 itibarıyla; PR #338 + #339 + #342 ile
13/13 chart için end-to-end deploy edildi).

---

## Hızlı başlangıç

```tsx
import { CrossFilterProvider, CrossFilterChart, BarChart, PieChart } from '@mfe/x-charts';

export function Dashboard() {
  return (
    <CrossFilterProvider options={{ groupId: 'sales-dashboard', debounceMs: 100 }}>
      <CrossFilterChart chartId="region-bar" emitFields={['label']}>
        <BarChart data={salesByRegion} />
      </CrossFilterChart>

      <CrossFilterChart chartId="category-pie" emitFields={['label']}>
        <PieChart data={salesByCategory} />
      </CrossFilterChart>
    </CrossFilterProvider>
  );
}
```

`<BarChart>`'a tıklamak `region-bar:label = 'Europe'` gibi bir filter
event yayar; `<PieChart>` aynı bus'a abone olduğu için kendi
verisini filtreler ve "filtre aktif" badge'ini gösterir.

---

## Üç parça

| Parça                                | Görev                                                                                                                                                       |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`CrossFilterProvider`**            | Cross-filter store'u dashboard alt-ağacına sağlar (provider altındaki tüm `CrossFilterChart` ve `useChartCrossFilter` consumer'ları aynı store'u paylaşır). |
| **`CrossFilterChart`**               | Wrapper — child chart'ın `onDataPointClick` event'ini intercept eder, datum'u bus'a yayar, "filter aktif" indicator badge'ini render eder.                  |
| **`useChartCrossFilter` (advanced)** | Wrapper'ı bypass etmek isteyen consumer için raw hook. Kendi UI'ınızdan `onChartClick(datum)` çağırın.                                                      |

---

## 13 chart adapter datum kontratları

Her chart'ın `onDataPointClick` event'i `ChartClickEvent` tipinde
(`packages/x-charts/src/types.ts`):

```ts
type ChartClickEvent = {
  datum: Record<string, unknown>;
  seriesId?: string;
  xKey?: string;
  yKey?: string;
  value?: number;
  label?: string;
};
```

`datum` shape'i chart-specific. Cross-filter wrapper'ın `emitFields`
seçtiği alanları filter event olarak yayar.

### Canonical `emitFields` tablosu

| Chart                  | datum şekli                                                    | Önerilen `emitFields`                |
| ---------------------- | -------------------------------------------------------------- | ------------------------------------ |
| **BarChart**           | `{ ...raw, label, value }`                                     | `['label']` (veya raw row alanı)     |
| **LineChart**          | `{ seriesName, label, value, dataIndex, seriesIndex }`         | `['label']`                          |
| **AreaChart**          | `{ seriesName, label, value, dataIndex, seriesIndex }`         | `['label']`                          |
| **PieChart**           | `{ ...raw, label, value }`                                     | `['label']`                          |
| **ScatterChart**       | `{ x, y, size, label, dataIndex }`                             | `['label']` veya `['x']`             |
| **GaugeChart**         | `{ label, name, value, min, max }`                             | `['name']`                           |
| **RadarChart**         | `{ seriesName, label, values, indicators }` (polygon-level v1) | `['seriesName']`                     |
| **TreemapChart**       | `{ name, label, value, treePathInfo, path, depth, data }`      | `['name']`                           |
| **HeatmapChart**       | `{ x, y, xLabel, yLabel, value, label }`                       | `['xLabel', 'yLabel']` (multi-field) |
| **WaterfallChart**     | `{ label, value, rawValue, type }`                             | `['label']`                          |
| **FunnelChart**        | `{ label, value, percent, conversionPercent? }`                | `['label']`                          |
| **SankeyChart** (node) | `{ dataType: 'node', name, label, value }`                     | `['name']`                           |
| **SankeyChart** (edge) | `{ dataType: 'edge', source, target, value, label }`           | `['source', 'target']` (multi-field) |
| **SunburstChart**      | `{ name, label, value, treePathInfo, path, depth, data }`      | `['name']`                           |

> `Sankey` tek chart'tır ama iki click target tipi yayar
> (`dataType: 'node' \| 'edge'`). Tek bir `<CrossFilterChart>` instance
> ile node + edge clicks aynı bus'a yayılır; consumer'lar `dataType`
> field'ı üzerinden ayrım yapabilir.

---

## Legacy callback'ler (Treemap / Heatmap / Sankey / Sunburst)

Bu 4 chart eski tip dar callback'leri (`onNodeClick`, `onCellClick`)
korur. Yeni `onDataPointClick` ile birlikte kullanılabilir:

```tsx
<TreemapChart
  data={data}
  onDataPointClick={(event) => emitToCrossFilter(event)} // CrossFilterChart bunu otomatik enjekte eder
  onNodeClick={(p) => trackAnalytics(p)} // legacy yan etki
/>
```

Çağrı sırası: **`onDataPointClick` ÖNCE → `onNodeClick`/`onCellClick`
SONRA**. Cross-filter wrapper'ın bus'a forward etmesi her zaman
legacy handler'ın side-effect'lerinden ÖNCE gerçekleşir; legacy
callback bus'ı bloke edemez. Sankey'de edge clicks **yalnız** yeni
callback'i tetikler (legacy `onNodeClick` node-only by design).

---

## Diğer faydalı API'ler

```tsx
import { useCrossFilter, useGridCrossFilter, useDrillDown } from '@mfe/x-charts';

// Aktif filter listesi + clear / undo / redo
const filters = useCrossFilter((s) => s.filters);
const undo = useCrossFilter((s) => s.undo);
const clearAll = useCrossFilter((s) => s.clearAllFilters);

// Chart → AG Grid bridge: cross-filter event'lerini AG Grid filter
// model'a translate eder (tenant-aware, server-side row model uyumlu)
const gridFilterModel = useGridCrossFilter();

// 3-seviye drill-down (region → city → store) breadcrumb + undo
const { drillTo, drillUp, drillPath } = useDrillDown();
```

---

## Pratik senaryolar

### 1. Sales dashboard (bar + pie + summary)

`packages/x-charts/src/__stories__/CrossFilterDemo.stories.tsx` →
`Default` story.

### 2. 13 chart full-suite showcase

Aynı dosya → `FullSuite` story. Tüm 13 adapter aynı provider altında;
deterministik fixture (snapshot-stable LCG seed). Consumer için
referans implementation.

### 3. Chart → AG Grid bridge

`apps/mfe-shell/src/pages/admin/design-lab/widgets/CrossFilterGridDemoLive.tsx`
→ chart click event'leri AG Grid filter model'a translate eder.

---

## Performans

Store throughput gate'leri (CI runner-tolerant, `vitest run`):

| Operasyon                                   | Bütçe (best-of-3) |
| ------------------------------------------- | ----------------- |
| 1000 sequential setFilter                   | < 500 ms          |
| 100 distinct (chartId, field) timer + flush | < 50 ms           |
| 1000 same-key coalesce                      | < 50 ms           |
| `_disposeTimers` 200 pending cleanup        | < 20 ms           |

Per-key debounce timer (PR #338 commit bc64adbc): aynı tick içinde
distinct (chartId, field) tuple'ları birbirini iptal etmez —
multi-field event flush'u atomik. Eski global-timer impl'i Codex
iter-2'de regression'lı bulundu, fix ile correctness gate kapatıldı.

---

## Bilinen sınırlamalar (v2 backlog)

- **Radar indicator-level click** — şu an polygon-level v1 (whole
  series). Per-indicator drill için custom hit-mapping gerekir;
  Codex iter-1'de v2 backlog'a alındı.
- **Highcharts annotation parity** — annotation/shape/marker module
  henüz yok; roadmap candidate.
- **AG Charts dashboard composer parity** — `ChartDashboard` mevcut
  ama drag-drop authoring yok.

---

## İlgili dokümanlar

- ADR: `decisions/topics/chart-viz-engine-selection.v1.json` (D-006
  cross-filter bus karar belgesi)
- API source: `packages/x-charts/src/cross-filter/`
- Tests: `packages/x-charts/src/__tests__/chart-click-event.contract.test.tsx`,
  `cross-filter-wrapper-integration.test.tsx`, `cross-filter-bench.test.ts`
- Sweep zinciri: PR #338 (kod), PR #339 (catalog metadata), PR #342
  (BETA → stable + UX polish)
