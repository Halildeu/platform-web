// @vitest-environment jsdom
/**
 * Faz 21.5-A3 — chart × density contract.
 *
 * Codex iter-7+8 AGREE matrix:
 *   - 13 chart wrapper'a `density?: 'auto'|'comfortable'|'compact'` prop
 *   - Compact mode'da axisLabel.fontSize / legend.itemGap / grid.* hardcoded
 *     değerleri scaleFontSize/Spacing/Padding helper'larından geçer
 *   - density prop DOM'a sızmaz (theme/decal aynı pattern)
 *   - default density='auto' + no DOM signal → multiplier 1.0 (mevcut consumer
 *     için pixel-perfect aynı output)
 *
 * Total: 13 chart × 4 case = 52 mutation killers
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';

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

import { __resetThemeStoreForTests } from '../theme/themeReactiveStore';

/* ---------------------------------------------------------------- */
/*  Mock echarts                                                     */
/* ---------------------------------------------------------------- */

const { setOptionMock, dispatchMock, initMock } = vi.hoisted(() => ({
  setOptionMock: vi.fn(),
  dispatchMock: vi.fn(),
  initMock: vi.fn(),
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
      init: initMock.mockImplementation(() => fakeInstance),
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
  setOptionMock.mockClear();
  initMock.mockClear();
  dispatchMock.mockClear();
  document.documentElement.removeAttribute('data-appearance');
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-mode');
  document.documentElement.removeAttribute('data-density');
  __resetThemeStoreForTests();
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
  document.documentElement.removeAttribute('data-appearance');
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-mode');
  document.documentElement.removeAttribute('data-density');
  __resetThemeStoreForTests();
  (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver =
    originalResizeObserver;
  window.matchMedia = originalMatchMedia;
});

/* ---------------------------------------------------------------- */
/*  Helpers                                                          */
/* ---------------------------------------------------------------- */

const lastSetOption = (): Record<string, unknown> => {
  expect(setOptionMock).toHaveBeenCalled();
  const calls = setOptionMock.mock.calls;
  return calls[calls.length - 1][0] as Record<string, unknown>;
};

/**
 * Walks the option object and collects all numeric `fontSize` values
 * from any nested location (axisLabel, legend.textStyle, title.textStyle,
 * label, etc.). Used to verify the compact multiplier reduced at least
 * one fontSize.
 */
const collectFontSizes = (obj: unknown): number[] => {
  const sizes: number[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const o = node as Record<string, unknown>;
    if (typeof o.fontSize === 'number') sizes.push(o.fontSize);
    Object.values(o).forEach(walk);
  };
  walk(obj);
  return sizes;
};

/* ---------------------------------------------------------------- */
/*  Sample fixtures (re-used from chart-theme-decal.test.tsx)        */
/* ---------------------------------------------------------------- */

const SAMPLE_BAR = [
  { label: 'A', value: 10 },
  { label: 'B', value: 20 },
];

const SAMPLE_SERIES = [{ name: 's', data: [1, 2, 3] }];
const SAMPLE_LABELS = ['Jan', 'Feb', 'Mar'];

type ChartCase = {
  name: string;
  testId: string;
  build: (props: { density?: unknown }) => React.ReactElement;
};

const charts: ChartCase[] = [
  {
    name: 'BarChart',
    testId: 'bar-chart',
    build: ({ density }) => <BarChart data={SAMPLE_BAR} density={density as never} />,
  },
  {
    name: 'LineChart',
    testId: 'line-chart',
    build: ({ density }) => (
      <LineChart series={SAMPLE_SERIES} labels={SAMPLE_LABELS} density={density as never} />
    ),
  },
  {
    name: 'AreaChart',
    testId: 'area-chart',
    build: ({ density }) => (
      <AreaChart series={SAMPLE_SERIES} labels={SAMPLE_LABELS} density={density as never} />
    ),
  },
  {
    name: 'PieChart',
    testId: 'pie-chart',
    build: ({ density }) => <PieChart data={SAMPLE_BAR} density={density as never} />,
  },
  {
    name: 'ScatterChart',
    testId: 'scatter-chart',
    build: ({ density }) => (
      <ScatterChart
        data={[
          { x: 1, y: 2 },
          { x: 3, y: 4 },
        ]}
        density={density as never}
      />
    ),
  },
  {
    name: 'GaugeChart',
    testId: 'gauge-chart',
    build: ({ density }) => <GaugeChart value={42} density={density as never} />,
  },
  {
    name: 'RadarChart',
    testId: 'radar-chart',
    build: ({ density }) => (
      <RadarChart
        indicators={[
          { name: 'A', max: 10 },
          { name: 'B', max: 10 },
        ]}
        series={[{ name: 's', data: [5, 7] }]}
        density={density as never}
      />
    ),
  },
  {
    name: 'TreemapChart',
    testId: 'treemap-chart',
    build: ({ density }) => (
      <TreemapChart
        data={[
          { name: 'A', value: 10 },
          { name: 'B', value: 20 },
        ]}
        density={density as never}
      />
    ),
  },
  {
    name: 'HeatmapChart',
    testId: 'heatmap-chart',
    build: ({ density }) => (
      <HeatmapChart
        data={[
          [0, 0, 5],
          [1, 1, 8],
        ]}
        xLabels={['x1', 'x2']}
        yLabels={['y1', 'y2']}
        density={density as never}
      />
    ),
  },
  {
    name: 'WaterfallChart',
    testId: 'waterfall-chart',
    build: ({ density }) => (
      <WaterfallChart
        data={[
          { label: 'Start', value: 100, type: 'total' },
          { label: 'A', value: 20 },
          { label: 'End', value: 120, type: 'total' },
        ]}
        density={density as never}
      />
    ),
  },
  {
    name: 'FunnelChart',
    testId: 'funnel-chart',
    build: ({ density }) => (
      <FunnelChart
        data={[
          { name: 'Visit', value: 100 },
          { name: 'Sale', value: 10 },
        ]}
        density={density as never}
      />
    ),
  },
  {
    name: 'SankeyChart',
    testId: 'sankey-chart',
    build: ({ density }) => (
      <SankeyChart
        nodes={[{ name: 'A' }, { name: 'B' }]}
        links={[{ source: 'A', target: 'B', value: 5 }]}
        density={density as never}
      />
    ),
  },
  {
    name: 'SunburstChart',
    testId: 'sunburst-chart',
    build: ({ density }) => (
      <SunburstChart
        data={[
          { name: 'A', value: 10 },
          { name: 'B', value: 20 },
        ]}
        density={density as never}
      />
    ),
  },
];

/* ---------------------------------------------------------------- */
/*  Per-chart parametric contract                                    */
/* ---------------------------------------------------------------- */

describe.each(charts)('$name — density contract (Faz 21.5-A3)', ({ name, testId, build }) => {
  it(`[${name}] default density='auto' + no DOM signal → comfortable (no fontSize reduction)`, () => {
    render(build({ density: 'auto' }));
    const opt = lastSetOption();
    const fontSizes = collectFontSizes(opt);
    // Comfortable identity: tüm fontSize'lar pozitif ve >=10
    expect(fontSizes.length).toBeGreaterThan(0);
    fontSizes.forEach((fs) => expect(fs).toBeGreaterThanOrEqual(10));
  });

  it(`[${name}] explicit density='compact' → at least one fontSize is smaller than comfortable baseline`, () => {
    // First render comfortable, capture font sizes
    render(build({ density: 'comfortable' }));
    const comfortableSizes = collectFontSizes(lastSetOption());
    const comfortableSum = comfortableSizes.reduce((a, b) => a + b, 0);
    setOptionMock.mockClear();

    // Then render compact, expect smaller (sum-wise) due to multiplier
    render(build({ density: 'compact' }));
    const compactSizes = collectFontSizes(lastSetOption());
    const compactSum = compactSizes.reduce((a, b) => a + b, 0);

    // compact total fontSize < comfortable total (at least one reduction)
    expect(compactSum).toBeLessThan(comfortableSum);
    // Hiçbir fontSize 10px altına düşmesin (a11y clamp)
    compactSizes.forEach((fs) => expect(fs).toBeGreaterThanOrEqual(10));
  });

  it(`[${name}] data-density="compact" + density='auto' → compact applied`, () => {
    // Comfortable baseline first
    render(build({ density: 'auto' }));
    const baseSizes = collectFontSizes(lastSetOption());
    const baseSum = baseSizes.reduce((a, b) => a + b, 0);
    setOptionMock.mockClear();

    // Set DOM attribute, render auto
    document.documentElement.setAttribute('data-density', 'compact');
    __resetThemeStoreForTests();
    render(build({ density: 'auto' }));
    const compactSizes = collectFontSizes(lastSetOption());
    const compactSum = compactSizes.reduce((a, b) => a + b, 0);

    expect(compactSum).toBeLessThan(baseSum);
  });

  it(`[${name}] density prop doesn't leak to DOM as attribute`, () => {
    const { container } = render(build({ density: 'compact' }));
    const el = container.querySelector(`[data-testid="${testId}"]`);
    expect(el).not.toBeNull();
    expect(el?.getAttribute('density')).toBeNull();
    expect(container.firstElementChild?.getAttribute('density')).toBeNull();
  });
});

/* ---------------------------------------------------------------- */
/*  Cross-cutting invariants                                         */
/* ---------------------------------------------------------------- */

describe('Density invariants', () => {
  it('explicit comfortable wins over data-density="compact"', () => {
    render(<BarChart data={SAMPLE_BAR} density="comfortable" />);
    const baseSizes = collectFontSizes(lastSetOption());
    const baseSum = baseSizes.reduce((a, b) => a + b, 0);
    setOptionMock.mockClear();

    document.documentElement.setAttribute('data-density', 'compact');
    __resetThemeStoreForTests();
    render(<BarChart data={SAMPLE_BAR} density="comfortable" />);
    const explicitSizes = collectFontSizes(lastSetOption());
    const explicitSum = explicitSizes.reduce((a, b) => a + b, 0);

    // explicit comfortable wins, so sum unchanged despite compact attribute
    expect(explicitSum).toBe(baseSum);
  });

  it('compact mode never produces fontSize below MIN_FONT_SIZE_PX (10) — a11y guarantee', () => {
    document.documentElement.setAttribute('data-density', 'compact');
    __resetThemeStoreForTests();
    // Render every chart in compact and verify every fontSize >= 10
    for (const c of charts) {
      setOptionMock.mockClear();
      const { unmount } = render(c.build({ density: 'auto' }));
      const sizes = collectFontSizes(lastSetOption());
      sizes.forEach((fs) => {
        expect(
          fs,
          `${c.name} produced fontSize=${fs} below clamp threshold`,
        ).toBeGreaterThanOrEqual(10);
      });
      unmount();
    }
  });

  it('SunburstChart deep tree (depth=4) — every level fontSize stays >=10 in compact', () => {
    // Codex iter-9 fix: previously autoLevels used Math.max(9, 12 - i) which
    // violated MIN_FONT_SIZE_PX at deep levels. With density-aware autoLevels
    // every level fontSize must respect the 10px clamp regardless of depth.
    const deepTree = [
      {
        name: 'A',
        children: [
          {
            name: 'A1',
            children: [
              {
                name: 'A1a',
                children: [
                  {
                    name: 'A1a-x',
                    children: [{ name: 'A1a-x-deep', value: 1 }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ];
    document.documentElement.setAttribute('data-density', 'compact');
    __resetThemeStoreForTests();
    render(<SunburstChart data={deepTree} density="auto" />);
    const opt = lastSetOption();
    const sizes = collectFontSizes(opt);
    expect(sizes.length).toBeGreaterThan(0);
    sizes.forEach((fs) => {
      expect(
        fs,
        `SunburstChart deep tree produced fontSize=${fs} below clamp threshold`,
      ).toBeGreaterThanOrEqual(10);
    });
  });

  it('ScatterChart axis nameTextStyle.fontSize and nameGap respect density', () => {
    // Codex iter-9 fix: axis nameGap/nameTextStyle were hardcoded; must scale.
    render(<ScatterChart data={[{ x: 1, y: 2 }]} xLabel="X" yLabel="Y" density="comfortable" />);
    const optComfy = lastSetOption();
    const xAxisComfy = optComfy.xAxis as { nameGap: number; nameTextStyle: { fontSize: number } };
    const comfyNameGap = xAxisComfy.nameGap;
    const comfyNameFontSize = xAxisComfy.nameTextStyle.fontSize;
    setOptionMock.mockClear();

    render(<ScatterChart data={[{ x: 1, y: 2 }]} xLabel="X" yLabel="Y" density="compact" />);
    const optCompact = lastSetOption();
    const xAxisCompact = optCompact.xAxis as {
      nameGap: number;
      nameTextStyle: { fontSize: number };
    };

    // compact must reduce both nameGap (spacing) and nameTextStyle.fontSize
    expect(xAxisCompact.nameGap).toBeLessThan(comfyNameGap);
    expect(xAxisCompact.nameTextStyle.fontSize).toBeLessThanOrEqual(comfyNameFontSize);
    // a11y clamp respected
    expect(xAxisCompact.nameTextStyle.fontSize).toBeGreaterThanOrEqual(10);
  });
});
