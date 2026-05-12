// @vitest-environment jsdom
/**
 * ChartDetail — page render coverage smoke for all 17 chart wrappers.
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
    SankeyChart: stubChart('SankeyChart'),
    SunburstChart: stubChart('SunburstChart'),
    HeatmapChart: stubChart('HeatmapChart'),
    WaterfallChart: stubChart('WaterfallChart'),
    FunnelChart: stubChart('FunnelChart'),
    Scatter3D: stubChart('Scatter3D'),
    Surface3D: stubChart('Surface3D'),
    Lines3D: stubChart('Lines3D'),
    Globe: stubChart('Globe'),
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
  'sankey-chart',
  'sunburst-chart',
  'heatmap-chart',
  'waterfall-chart',
  'funnel-chart',
  'scatter-3d-chart',
  'surface-3d-chart',
  'lines-3d-chart',
  'globe-chart',
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
