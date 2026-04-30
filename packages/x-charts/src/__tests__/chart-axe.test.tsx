// @vitest-environment jsdom
/**
 * Faz 21.5-B PR-B3a — axe-core a11y violation gate for the 13 charts
 * that received useChartA11y / ChartA11yShell integration in PR-B1
 * + PR-B2.
 *
 * Codex iter-7 cevap-4 threshold: hard gate on `serious + critical`;
 * `moderate + minor` reported but not blocking. jsdom layout/CSS-var
 * limitations would yield false positives on contrast/focus rules,
 * so we narrow severity rather than the rule list.
 *
 * What this test pins:
 *   - Chart container exposes a valid landmark (role="region")
 *   - Hidden data table has caption + scope=col headers + matching id
 *   - aria-live region passes status semantics
 *   - No empty buttons, missing labels, or improperly nested ARIA
 *
 * Each chart × 1 axe assertion = **13 new mutation killers**.
 * (BarChart's own contract test in PR-B1 already covers detailed
 * attribute pinning; this spec is the orthogonal a11y rule sweep.)
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import axe from 'axe-core';
import type { Result } from 'axe-core';

import { BarChart } from '../BarChart';
import { LineChart } from '../LineChart';
import { AreaChart } from '../AreaChart';
import { PieChart } from '../PieChart';
import { ScatterChart } from '../ScatterChart';
import { GaugeChart } from '../GaugeChart';
import { RadarChart } from '../RadarChart';
import { TreemapChart } from '../TreemapChart';
import { HeatmapChart } from '../HeatmapChart';
import { WaterfallChart } from '../WaterfallChart';
import { FunnelChart } from '../FunnelChart';
import { SankeyChart } from '../SankeyChart';
import { SunburstChart } from '../SunburstChart';

const { setOptionMock, dispatchMock } = vi.hoisted(() => ({
  setOptionMock: vi.fn(),
  dispatchMock: vi.fn(),
}));

vi.mock('../renderers/echarts-imports', () => {
  const fakeInstance = {
    setOption: setOptionMock,
    dispatchAction: dispatchMock,
    dispose: vi.fn(),
    resize: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    getZr: vi.fn(() => ({ on: vi.fn(), off: vi.fn() })),
    getDataURL: vi.fn(),
    getOption: vi.fn(() => ({})),
  };
  return {
    echarts: {
      init: vi.fn(() => fakeInstance),
      registerLocale: vi.fn(),
      registerTheme: vi.fn(),
    },
    registerECharts: vi.fn(),
  };
});

class ResizeObserverPolyfill {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
const originalResizeObserver = (globalThis as { ResizeObserver?: typeof ResizeObserver })
  .ResizeObserver;
const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver =
    ResizeObserverPolyfill as unknown as typeof ResizeObserver;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver =
    originalResizeObserver;
  window.matchMedia = originalMatchMedia;
});

const SAMPLE_DATA = [
  { label: 'Ocak', value: 100 },
  { label: 'Şubat', value: 200 },
];

const SAMPLE_LINE_LABELS = ['Jan', 'Feb', 'Mar'];
const SAMPLE_LINE_SERIES = [{ name: 's', data: [10, 20, 30] }];

/**
 * Run axe-core on a container, return only `serious | critical`
 * violations. jsdom-flaky rules (color-contrast, focus-order in
 * absent layout) downgraded to moderate at most by axe; we only
 * gate on the high-impact tiers.
 */
async function runAxeStrict(container: HTMLElement): Promise<Result[]> {
  const results = await axe.run(container, {
    // Disable rules that are unreliable in jsdom (no layout, no
    // computed styles for CSS custom properties): color-contrast
    // requires layout; landmark-unique is too strict for portal-style
    // visually-hidden tables embedded inside chart wrappers.
    rules: {
      'color-contrast': { enabled: false },
      'landmark-unique': { enabled: false },
    },
    resultTypes: ['violations'],
  });
  return results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
}

const charts = [
  { name: 'BarChart', element: () => <BarChart data={SAMPLE_DATA} /> },
  {
    name: 'LineChart',
    element: () => <LineChart series={SAMPLE_LINE_SERIES} labels={SAMPLE_LINE_LABELS} />,
  },
  {
    name: 'AreaChart',
    element: () => <AreaChart series={SAMPLE_LINE_SERIES} labels={SAMPLE_LINE_LABELS} />,
  },
  { name: 'PieChart', element: () => <PieChart data={SAMPLE_DATA} /> },
  {
    name: 'ScatterChart',
    element: () => (
      <ScatterChart
        data={[
          { x: 1, y: 2 },
          { x: 3, y: 4 },
        ]}
      />
    ),
  },
  { name: 'GaugeChart', element: () => <GaugeChart value={42} /> },
  {
    name: 'RadarChart',
    element: () => (
      <RadarChart
        indicators={[
          { name: 'A', max: 10 },
          { name: 'B', max: 10 },
        ]}
        series={[{ name: 's', data: [5, 7] }]}
      />
    ),
  },
  {
    name: 'TreemapChart',
    element: () => (
      <TreemapChart
        data={[
          { name: 'A', value: 10 },
          { name: 'B', value: 20 },
        ]}
      />
    ),
  },
  {
    name: 'HeatmapChart',
    element: () => (
      <HeatmapChart
        data={[
          [0, 0, 5],
          [1, 1, 8],
        ]}
        xLabels={['x1', 'x2']}
        yLabels={['y1', 'y2']}
      />
    ),
  },
  {
    name: 'WaterfallChart',
    element: () => (
      <WaterfallChart
        data={[
          { label: 'Start', value: 100, type: 'total' },
          { label: 'A', value: 20 },
          { label: 'End', value: 120, type: 'total' },
        ]}
      />
    ),
  },
  {
    name: 'FunnelChart',
    element: () => (
      <FunnelChart
        data={[
          { name: 'Visit', value: 100 },
          { name: 'Sale', value: 10 },
        ]}
      />
    ),
  },
  {
    name: 'SankeyChart',
    element: () => (
      <SankeyChart
        nodes={[{ name: 'A' }, { name: 'B' }]}
        links={[{ source: 'A', target: 'B', value: 5 }]}
      />
    ),
  },
  {
    name: 'SunburstChart',
    element: () => (
      <SunburstChart
        data={[
          { name: 'A', value: 10 },
          { name: 'B', value: 20 },
        ]}
      />
    ),
  },
] as const;

describe.each(charts)(
  '$name — axe-core gate (Faz 21.5-B PR-B3a, serious+critical zero)',
  ({ name, element }) => {
    it(`[${name}] has no serious/critical axe violations`, async () => {
      const { container } = render(element());
      const violations = await runAxeStrict(container);
      expect(
        violations,
        `${name} produced serious/critical axe violations: ${violations.map((v) => `${v.id} (${v.impact})`).join(', ')}`,
      ).toEqual([]);
    });
  },
);
