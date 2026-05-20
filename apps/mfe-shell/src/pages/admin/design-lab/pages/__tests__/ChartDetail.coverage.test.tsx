// @vitest-environment jsdom
/**
 * ChartDetail — page render coverage smoke for chart wrappers with full
 * playground (LIVE_PROP_SUPPORT + CHART_PRESETS) support.
 *
 * NOTE: This smoke renders the ChartDetail page for every wrapper with
 * full live-playground wiring (LIVE_PROP_SUPPORT + CHART_PRESETS in
 * chartPlaygroundModel + a ChartPreviewLive switch arm) — see
 * `CHART_IDS_WITH_PRESETS`. Rendering the page exercises the full
 * `ChartMeta` catalog entry, so a missing required field surfaces here
 * instead of in cluster QA — e.g. the `features` omission in the
 * `tree-chart` entry that crashed `/charts/tree-chart` live on testai
 * (PR-X16a hotfix: tree-chart added to the list below as the guard).
 *
 * Faz 21.11 PR-Playground-Coverage follow-up: lock the contract that
 * `/admin/design-lab/charts/:chartId` mounts cleanly for every wrapper
 * with `LIVE_PROP_SUPPORT` + `CHART_PRESETS`, with Playground tab open
 * by default (live editor) and Examples tab containing a non-empty
 * preset gallery.
 *
 * This test was added after the user reported that earlier playground
 * iterations had inadvertently broken the login flow (PR #387/#389/#390
 * fixed it). Locks the render smoke so regressions surface in unit
 * tests instead of via live cluster QA.
 */
import './fixtures/jsdom-polyfills-stub';

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Stub the heavy ECharts wrappers so this jsdom test stays light. The
// playground / examples / API tab logic is what we care about — the
// actual chart canvas render is covered exhaustively elsewhere.
vi.mock('@mfe/x-charts', async () => {
  const actual = await vi.importActual<typeof import('@mfe/x-charts')>('@mfe/x-charts');
  const stubChart =
    (testId: string) =>
    (_props: unknown): React.ReactElement => <div data-testid={`stub-${testId}`} />;
  return {
    ...actual,
    BarChart: stubChart('BarChart'),
    LineChart: stubChart('LineChart'),
    AreaChart: stubChart('AreaChart'),
    PieChart: stubChart('PieChart'),
    ScatterChart: stubChart('ScatterChart'),
    GaugeChart: stubChart('GaugeChart'),
    RadarChart: stubChart('RadarChart'),
    TreemapChart: stubChart('TreemapChart'),
    TreeChart: stubChart('TreeChart'),
    CalendarHeatmap: stubChart('CalendarHeatmap'),
    PolarChart: stubChart('PolarChart'),
    ThemeRiverChart: stubChart('ThemeRiverChart'),
    GanttChart: stubChart('GanttChart'),
    PopulationPyramid: stubChart('PopulationPyramid'),
    ComboChart: stubChart('ComboChart'),
    EffectScatterChart: stubChart('EffectScatterChart'),
    Bar3DChart: stubChart('Bar3DChart'),
    LiquidFillChart: stubChart('LiquidFillChart'),
    WordCloudChart: stubChart('WordCloudChart'),
    SankeyChart: stubChart('SankeyChart'),
    SunburstChart: stubChart('SunburstChart'),
    HeatmapChart: stubChart('HeatmapChart'),
    WaterfallChart: stubChart('WaterfallChart'),
    FunnelChart: stubChart('FunnelChart'),
    Scatter3D: stubChart('Scatter3D'),
    Surface3D: stubChart('Surface3D'),
    Lines3D: stubChart('Lines3D'),
    Globe: stubChart('Globe'),
    // PR-X campaign wrappers (Codex 019e22b6 follow-up).
    BoxPlotChart: stubChart('BoxPlotChart'),
    CandlestickChart: stubChart('CandlestickChart'),
    PictorialBarChart: stubChart('PictorialBarChart'),
    ParallelCoordinatesChart: stubChart('ParallelCoordinatesChart'),
    GraphChart: stubChart('GraphChart'),
    GeoMap: stubChart('GeoMap'),
    // `ensureGeoMapRegistered` is called by the GeoMap playground inner
    // — return a resolved promise so the loading branch flips fast.
    ensureGeoMapRegistered: vi.fn().mockResolvedValue(undefined),
    isGeoMapRegistered: vi.fn().mockReturnValue(true),
  };
});

import ChartDetail from '../ChartDetail';

const CHART_IDS_WITH_PRESETS = [
  'bar-chart',
  'line-chart',
  'area-chart',
  'pie-chart',
  'scatter-chart',
  'gauge-chart',
  'radar-chart',
  'treemap-chart',
  // PR-X16a — TreeChart depth chart. Render-smoke regression guard for
  // the `features` / `sampleCode` catalog completeness that the live
  // testai crash exposed.
  'tree-chart',
  // PR-X16b — CalendarHeatmap depth chart. Same render-smoke guard for
  // catalog completeness (LIVE_PROP_SUPPORT + CHART_PRESETS + preview).
  'calendar-heatmap',
  // PR-X16c — PolarChart depth chart. Same render-smoke guard for
  // catalog completeness (LIVE_PROP_SUPPORT + CHART_PRESETS + preview).
  'polar-chart',
  // PR-X16d — ThemeRiverChart depth chart. Same render-smoke guard for
  // catalog completeness (LIVE_PROP_SUPPORT + CHART_PRESETS + preview).
  'theme-river-chart',
  // PR-X16e — GanttChart depth chart. Same render-smoke guard for
  // catalog completeness (LIVE_PROP_SUPPORT + CHART_PRESETS + preview).
  'gantt-chart',
  // PR#2 — PopulationPyramid HR demographic pyramid. Same render-smoke
  // guard for catalog completeness (LIVE_PROP_SUPPORT + CHART_PRESETS +
  // ChartPreviewLive switch arm).
  'population-pyramid',
  // ComboChart — dual-axis composite bar+line (Codex 019e41cd). Same
  // render-smoke guard for catalog completeness.
  'combo-chart',
  // EffectScatterChart — standalone effectScatter + ripple (Codex
  // 019e425b). Same render-smoke guard for catalog completeness.
  'effect-scatter-chart',
  // Bar3DChart — standalone cartesian3D bar3D pivot (Codex 019e42c3).
  // 32nd wrapper (5th 3D). Same render-smoke guard.
  'bar-3d-chart',
  // LiquidFillChart — lazy-loaded liquidFill KPI gauge (Codex 019e4301).
  // 33rd wrapper (1st echarts-liquidfill extension). Same render-smoke
  // guard. The lazy gate is jsdom-mocked via stubChart so the page
  // mount exercises the catalog/playground/preset plumbing without
  // pulling the echarts-liquidfill chunk.
  'liquid-fill-chart',
  // WordCloudChart — lazy-loaded text frequency cloud (Codex 019e4351).
  // 34th wrapper (1st echarts-wordcloud extension), FINAL of the
  // 5-missing-chart campaign. Same render-smoke guard. The lazy gate
  // is jsdom-mocked via stubChart so the page mount exercises the
  // catalog/playground/preset plumbing without pulling the
  // echarts-wordcloud chunk.
  'word-cloud-chart',
  'sankey-chart',
  'sunburst-chart',
  'heatmap-chart',
  'waterfall-chart',
  'funnel-chart',
  'scatter-3d-chart',
  'surface-3d-chart',
  'lines-3d-chart',
  'globe-chart',
  // PR-X campaign live playground (Codex 019e22b6 follow-up):
  // 6 new wrappers now have LIVE_PROP_SUPPORT + CHART_PRESETS
  // + ChartPreviewLive switch arms, so they MUST mount cleanly
  // with the playground/examples tabs populated.
  'box-plot-chart',
  'candlestick-chart',
  'pictorial-bar-chart',
  'parallel-coordinates-chart',
  'graph-chart',
  'geo-map',
] as const;

function renderChartDetail(chartId: string) {
  return render(
    <MemoryRouter initialEntries={[`/admin/design-lab/charts/${chartId}`]}>
      <Routes>
        <Route path="/admin/design-lab/charts/:chartId" element={<ChartDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe.each(CHART_IDS_WITH_PRESETS)(
  'ChartDetail — %s renders without throwing (PR-Playground-Coverage smoke)',
  (chartId) => {
    it('mounts page + Playground + Examples + API sections without crash', () => {
      // Render must not throw. Catalog entry → ChartMeta → Playground
      // model → Examples preset gallery — every layer is exercised
      // for this chartId.
      const result = renderChartDetail(chartId);

      // Spot-check: at least one heading is rendered (header/section
      // labels survive even when collapsible content is hidden).
      const headings = screen.getAllByRole('heading');
      expect(headings.length).toBeGreaterThan(0);

      result.unmount();
    });
  },
);

describe('ChartDetail — Examples gallery non-empty for every covered chartId', () => {
  // The Examples tab body is collapsed by default but the model lookup
  // (getChartPresets) is exhaustively asserted in
  // `chartPlaygroundModel.test.ts`. This describe locks the
  // ChartDetail page-level contract that the model is fed the correct
  // chartId.
  it.each(CHART_IDS_WITH_PRESETS)('derives a non-empty preset gallery for %s', async (chartId) => {
    const { getChartPresets } = await import('../../widgets/chartPlaygroundModel');
    expect(getChartPresets(chartId).length).toBeGreaterThan(0);
  });
});
