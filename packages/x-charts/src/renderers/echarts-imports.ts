/**
 * ECharts Modular Imports — Tree-Shaking Optimized
 *
 * IMPORTANT: Never `import * as echarts from 'echarts'` — that pulls ~800KB.
 * Only import from 'echarts/core' + specific chart/component modules.
 * This file is the SINGLE ENTRY POINT for all ECharts imports in the platform.
 *
 * @see decisions/topics/chart-viz-engine-selection.v1.json (D-007)
 *
 * Faz 21.11 Faz A — register list trim (Codex thread `019e0ecf` mutabakat,
 * `019e0efc` A0 measurement). Aşağıdaki üç bileşen base register'dan
 * çıkarıldı:
 *
 *   - **SVGRenderer:** Hiçbir chart shim `init({ renderer: 'svg' })`
 *     çağırmıyor; canvas default ve `useEChartsRenderer` `renderer`
 *     prop'u expose etmiyor. SVG bundle'da 12 zrender path entry yer
 *     kaplıyordu (A0 `--scan-leakage` bulgusu).
 *
 *   - **ToolboxComponent:** Hiçbir chart shim `option.toolbox` üretmiyor;
 *     export/zoom/pan UX `ChartToolbar` + `useChartExport` üzerinden
 *     DOM-side yapılıyor. Sadece `i18n/echarts-locale.ts` toolbox
 *     locale string'leri tanımlıyordu — bu artık ölü kod ama dokunmadan
 *     bırakıldı (zarar yok, locale dosyaları human-translated).
 *
 *   - **DataZoomComponent → DataZoomInside + DataZoomSlider:**
 *     `responsive/buildResponsiveDataZoom.ts` `type: 'inside'` üretiyor;
 *     `spec/chartSpecToEChartsOption.ts:281` `interaction.zoom_pan`
 *     açıkken `[{ type: 'inside' }, { type: 'slider', bottom: 20 }]`
 *     üretiyor. Control/select hiç kullanılmıyor. Inside + Slider
 *     modular import full installer'dan küçük (control/select drop).
 *     Codex iter-1 review fix: ilk versiyon sadece Inside register
 *     etmişti, slider option emit'i runtime crash veriyordu.
 */

/* ------------------------------------------------------------------ */
/*  Core                                                               */
/* ------------------------------------------------------------------ */
import * as echarts from 'echarts/core';

/* ------------------------------------------------------------------ */
/*  Renderers — Canvas only (SVG removed Faz A; not used by any shim) */
/* ------------------------------------------------------------------ */
import { CanvasRenderer } from 'echarts/renderers';

/* ------------------------------------------------------------------ */
/*  Chart Types (add new types here as needed)                         */
/* ------------------------------------------------------------------ */
import { BarChart } from 'echarts/charts';
import { LineChart } from 'echarts/charts';
import { PieChart } from 'echarts/charts';
import { ScatterChart } from 'echarts/charts';
// PR-X13b (Codex thread 019e2254 plan-time AGREE): animated pulse
// scatter for vurgulanmış (highlighted) lokasyonlar over a geo map.
// `effectScatter` series renders a periodic ripple effect to draw the
// eye to a small set of priority points (cf. plain `ScatterChart`
// which is silent — used for general bubble overlays).
import { EffectScatterChart } from 'echarts/charts';
// PR-X13c (Codex thread 019e25d4 plan-time AGREE): origin-destination
// flow lines drawn over a geo map (`lines` series with
// `coordinateSystem: 'geo'`). Used for logistics routes, migration
// flows, financial transfers — any directed edge between two
// geographic endpoints. Disjoint from `LineChart` (cartesian xy line).
import { LinesChart } from 'echarts/charts';
import { SankeyChart } from 'echarts/charts';
import { TreemapChart } from 'echarts/charts';
// PR-X16a TreeChart (`tree` series — hierarchical node-link / org-chart
// hierarchy) is intentionally NOT eager-registered here: adding it to
// the base register pushed the CONTRACT §8 `contractTotal` bundle over
// the 350 KB gzip hard cap. It is lazy-registered on first TreeChart
// mount via `renderers/registerEChartsFeature.ts` (Codex thread
// 019e32da iter-2, "Option 3 hybrid lazy register"). The rest of the
// PR-X16 depth campaign (Calendar/Polar/ThemeRiver/Gantt) follows the
// same lazy pattern.
import { RadarChart } from 'echarts/charts';
import { GaugeChart } from 'echarts/charts';
import { FunnelChart } from 'echarts/charts';
import { HeatmapChart } from 'echarts/charts';
import { SunburstChart } from 'echarts/charts';
// PR-X6 (Codex thread 019e1e30 AGREE): statistical box-and-whisker chart.
import { BoxplotChart } from 'echarts/charts';
// PR-X7 (Codex thread 019e1e30 AGREE): financial OHLC chart for stock/
// crypto price ranges with bullish/bearish color coding.
import { CandlestickChart } from 'echarts/charts';
// PR-X10 (Codex thread 019e1e30 AGREE): decorative bar chart that renders
// each bar as a tiled symbol (icon). Useful for infographic dashboards.
import { PictorialBarChart } from 'echarts/charts';
// PR-X12a (Codex thread 019e2119 AGREE): parallel coordinates chart for
// multi-dim data comparison (HR compensation eşitliği analizi). Reads N
// dimensions per row, renders one polyline per row across N axes.
import { ParallelChart } from 'echarts/charts';
// PR-X12b (Codex thread 019e2119 AGREE): network/graph chart for entity-
// edge relationship topology (Context Health DocGraph, dependency network,
// permission cascade). Replaces "graph"-named bar charts that count nodes
// but don't show their relationships.
import { GraphChart } from 'echarts/charts';
// PR-X12c (Codex thread 019e2254 AGREE): geographic choropleth map for
// regional distribution (HR location il bazlı yoğunluk). Map JSON
// (TR provinces, world, etc.) is CONSUMER-supplied and registered via
// `ensureGeoMapRegistered()`; this register only adds the series + geo
// coordinate system. Bundle delta ~25KB (series + component), map JSON
// stays out per Codex licensing/tree-shake guidance.
import { MapChart } from 'echarts/charts';

/* ------------------------------------------------------------------ */
/*  Components (UI features used by charts)                            */
/* ------------------------------------------------------------------ */
import { TitleComponent } from 'echarts/components';
import { TooltipComponent } from 'echarts/components';
import { LegendComponent } from 'echarts/components';
import { GridComponent } from 'echarts/components';
import { DatasetComponent } from 'echarts/components';
import { TransformComponent } from 'echarts/components';
// DataZoom — Inside + Slider only (no control/select). Faz A: ChartSpec
// `interaction.zoom_pan` transformer (`spec/chartSpecToEChartsOption.ts:281`)
// emits BOTH `type: 'inside'` and `type: 'slider'`; responsive helper
// emits `type: 'inside'`. The DataZoomComponent FULL installer also
// pulls in unused control/select surfaces, so we register only the
// two modular paths actually used. Codex post-impl review iter-1
// caught the slider runtime requirement (would have crashed
// `Component dataZoom.slider is used but not imported.`).
import { DataZoomInsideComponent, DataZoomSliderComponent } from 'echarts/components';
// Faz 21.11 PR-A2c-wire: Toolbox + Brush re-added for `ScatterChart`'s
// new `enableBrush` opt-in path. The Faz A removal note explained these
// were dropped because no shim emitted `option.toolbox`. Now `ScatterChart`
// emits `option.toolbox.feature.brush` + top-level `option.brush` when
// `enableBrush=true` so the user can drag a rectangle and our adapter
// (PR-A2c `normalizeBrushSelection` / `brushToAgGridFilterModel`)
// translates the event to an AG Grid filter model. Both components stay
// pay-for-what-you-render — no shim that omits `enableBrush` triggers
// the brush UI. Codex iter-1 PR-A2c-wire surface fix (BrushComponent
// was the missing piece that would have crashed at runtime with
// "Component brush is used but not imported.").
import { ToolboxComponent } from 'echarts/components';
import { BrushComponent } from 'echarts/components';
import { AriaComponent } from 'echarts/components';
import { MarkLineComponent } from 'echarts/components';
import { MarkPointComponent } from 'echarts/components';
import { MarkAreaComponent } from 'echarts/components';
import { VisualMapComponent } from 'echarts/components';
// PR-X12a: ParallelComponent is the coordinate system that the
// `ParallelChart` series renders into (analogous to GridComponent for
// cartesian charts). Must register both series + coordinate system.
import { ParallelComponent } from 'echarts/components';
// PR-X12c: GeoComponent is the coordinate system for `MapChart`
// (choropleth) and any future scatter-overlay-on-map use case.
// Required alongside `MapChart` for region styling, roam, visualMap
// hooks to work.
import { GeoComponent } from 'echarts/components';

/* ------------------------------------------------------------------ */
/*  Register — Call ONCE at app startup                                */
/* ------------------------------------------------------------------ */

let _registered = false;

export function registerECharts(): void {
  if (_registered) return;

  echarts.use([
    // Renderers — Canvas only (Faz A: SVGRenderer removed)
    CanvasRenderer,
    // Charts
    BarChart,
    LineChart,
    PieChart,
    ScatterChart,
    EffectScatterChart, // PR-X13b: animated pulse scatter for highlighted geo points
    LinesChart, // PR-X13c: origin-destination flow lines on geo coord system
    SankeyChart,
    TreemapChart,
    // TreeChart — lazy-registered (registerEChartsFeature.ts); see import note above.
    RadarChart,
    GaugeChart,
    FunnelChart,
    HeatmapChart,
    SunburstChart,
    BoxplotChart, // PR-X6: statistical box-and-whisker chart
    CandlestickChart, // PR-X7: financial OHLC chart
    PictorialBarChart, // PR-X10: decorative pictogram bar chart
    ParallelChart, // PR-X12a: parallel coordinates (multi-dim comparison)
    GraphChart, // PR-X12b: network/graph relationship topology
    MapChart, // PR-X12c: geographic choropleth map (regional distribution)
    // Components
    TitleComponent,
    TooltipComponent,
    LegendComponent,
    GridComponent,
    DatasetComponent,
    TransformComponent,
    DataZoomInsideComponent, // Faz A: was DataZoomComponent (full installer)
    DataZoomSliderComponent, // ChartSpec zoom_pan transformer needs slider
    ToolboxComponent, // Faz 21.11 PR-A2c-wire: hosts brush feature button
    BrushComponent, // Faz 21.11 PR-A2c-wire: ScatterChart enableBrush opt-in
    AriaComponent,
    MarkLineComponent,
    MarkPointComponent,
    MarkAreaComponent,
    VisualMapComponent,
    ParallelComponent, // PR-X12a: parallel-coordinate system (axes layout)
    GeoComponent, // PR-X12c: geo coordinate system (map series host)
  ]);

  _registered = true;
}

/* ------------------------------------------------------------------ */
/*  Re-export core for renderer usage                                  */
/* ------------------------------------------------------------------ */
export { echarts };
// echarts ≥6 renamed `EChartsOption` to `EChartsCoreOption`. Wave 1
// housekeeping keeps the public x-charts symbol name as
// `EChartsOption` (23+ consumer call sites depend on it) and aliases
// to the renamed core export so the rename ripple stays inside this
// barrel file. If echarts ever drops the export entirely the alias
// breaks loudly here, which is the right place to surface it.
export type { ECharts, EChartsCoreOption as EChartsOption } from 'echarts/core';
