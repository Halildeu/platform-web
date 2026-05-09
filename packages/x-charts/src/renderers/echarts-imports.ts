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
import { SankeyChart } from 'echarts/charts';
import { TreemapChart } from 'echarts/charts';
import { RadarChart } from 'echarts/charts';
import { GaugeChart } from 'echarts/charts';
import { FunnelChart } from 'echarts/charts';
import { HeatmapChart } from 'echarts/charts';
import { SunburstChart } from 'echarts/charts';
// Future: import { BoxplotChart } from 'echarts/charts';
// Future: import { CandlestickChart } from 'echarts/charts';
// Future: import { ParallelChart } from 'echarts/charts';
// Future: import { GraphChart } from 'echarts/charts';

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
// ToolboxComponent removed Faz A — `ChartToolbar` + `useChartExport`
// handle export/zoom UX DOM-side. No chart shim emits `option.toolbox`.
import { AriaComponent } from 'echarts/components';
import { MarkLineComponent } from 'echarts/components';
import { MarkPointComponent } from 'echarts/components';
import { MarkAreaComponent } from 'echarts/components';
import { VisualMapComponent } from 'echarts/components';
// Future: import { GeoComponent } from 'echarts/components';

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
    SankeyChart,
    TreemapChart,
    RadarChart,
    GaugeChart,
    FunnelChart,
    HeatmapChart,
    SunburstChart,
    // Components
    TitleComponent,
    TooltipComponent,
    LegendComponent,
    GridComponent,
    DatasetComponent,
    TransformComponent,
    DataZoomInsideComponent, // Faz A: was DataZoomComponent (full installer)
    DataZoomSliderComponent, // ChartSpec zoom_pan transformer needs slider
    // ToolboxComponent: Faz A removed (DOM-side ChartToolbar / useChartExport)
    AriaComponent,
    MarkLineComponent,
    MarkPointComponent,
    MarkAreaComponent,
    VisualMapComponent,
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
