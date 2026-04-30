// @vitest-environment jsdom
/**
 * Faz 21.5-A2 — chart × accent contract.
 *
 * Codex iter-13+14 AGREE matrix:
 *   - 10 accent-affected chart × {default light, emerald, ocean} → setOption color
 *     array first item matches expected accent palette
 *   - 3 accent-immune chart (Gauge, Heatmap, Waterfall) tested in
 *     semantic-preservation.test.tsx
 *   - DOM leak: accent prop attribute olarak yok
 *   - HC/Print theme variant invariant: accent ignored under HC/Print
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';

import { BarChart } from '../BarChart';
import { LineChart } from '../LineChart';
import { AreaChart } from '../AreaChart';
import { PieChart } from '../PieChart';
import { ScatterChart } from '../ScatterChart';
import { RadarChart } from '../RadarChart';
import { TreemapChart } from '../TreemapChart';
import { FunnelChart } from '../FunnelChart';
import { SankeyChart } from '../SankeyChart';
import { SunburstChart } from '../SunburstChart';

import { ACCENT_PALETTES } from '../theme/accent-palettes';
import { __resetThemeStoreForTests } from '../theme/themeReactiveStore';

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
  document.documentElement.removeAttribute('data-accent');
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
  document.documentElement.removeAttribute('data-accent');
  __resetThemeStoreForTests();
  (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver =
    originalResizeObserver;
  window.matchMedia = originalMatchMedia;
});

const lastSetOption = (): Record<string, unknown> => {
  expect(setOptionMock).toHaveBeenCalled();
  const calls = setOptionMock.mock.calls;
  return calls[calls.length - 1][0] as Record<string, unknown>;
};

/**
 * Walks the option object and collects all string color values from
 * itemStyle.color, color array (top-level), or series item colors.
 */
const collectColors = (obj: unknown): string[] => {
  const colors: string[] = [];
  const walk = (node: unknown, key?: string) => {
    if (!node) return;
    if (typeof node === 'string') {
      // Direct hex color in interesting context
      if (node.match(/^#[0-9a-fA-F]{6}$/) && (key === 'color' || key === undefined)) {
        colors.push(node);
      }
      return;
    }
    if (typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((item) => walk(item));
      return;
    }
    const o = node as Record<string, unknown>;
    Object.entries(o).forEach(([k, v]) => walk(v, k));
  };
  walk(obj);
  return colors;
};

const SAMPLE_BAR = [
  { label: 'A', value: 10 },
  { label: 'B', value: 20 },
];
const SAMPLE_SERIES = [{ name: 's', data: [1, 2, 3] }];
const SAMPLE_LABELS = ['Jan', 'Feb', 'Mar'];

type ChartCase = {
  name: string;
  testId: string;
  build: (props: { accent?: unknown; theme?: unknown }) => React.ReactElement;
};

const charts: ChartCase[] = [
  {
    name: 'BarChart',
    testId: 'bar-chart',
    build: ({ accent, theme }) => (
      <BarChart data={SAMPLE_BAR} accent={accent as never} theme={theme as never} />
    ),
  },
  {
    name: 'LineChart',
    testId: 'line-chart',
    build: ({ accent, theme }) => (
      <LineChart
        series={SAMPLE_SERIES}
        labels={SAMPLE_LABELS}
        accent={accent as never}
        theme={theme as never}
      />
    ),
  },
  {
    name: 'AreaChart',
    testId: 'area-chart',
    build: ({ accent, theme }) => (
      <AreaChart
        series={SAMPLE_SERIES}
        labels={SAMPLE_LABELS}
        accent={accent as never}
        theme={theme as never}
      />
    ),
  },
  {
    name: 'PieChart',
    testId: 'pie-chart',
    build: ({ accent, theme }) => (
      <PieChart data={SAMPLE_BAR} accent={accent as never} theme={theme as never} />
    ),
  },
  {
    name: 'ScatterChart',
    testId: 'scatter-chart',
    build: ({ accent, theme }) => (
      <ScatterChart
        data={[
          { x: 1, y: 2 },
          { x: 3, y: 4 },
        ]}
        accent={accent as never}
        theme={theme as never}
      />
    ),
  },
  {
    name: 'RadarChart',
    testId: 'radar-chart',
    build: ({ accent, theme }) => (
      <RadarChart
        indicators={[
          { name: 'A', max: 10 },
          { name: 'B', max: 10 },
        ]}
        series={[{ name: 's', data: [5, 7] }]}
        accent={accent as never}
        theme={theme as never}
      />
    ),
  },
  {
    name: 'TreemapChart',
    testId: 'treemap-chart',
    build: ({ accent, theme }) => (
      <TreemapChart
        data={[
          { name: 'A', value: 10 },
          { name: 'B', value: 20 },
        ]}
        accent={accent as never}
        theme={theme as never}
      />
    ),
  },
  {
    name: 'FunnelChart',
    testId: 'funnel-chart',
    build: ({ accent, theme }) => (
      <FunnelChart
        data={[
          { name: 'Visit', value: 100 },
          { name: 'Sale', value: 10 },
        ]}
        accent={accent as never}
        theme={theme as never}
      />
    ),
  },
  {
    name: 'SankeyChart',
    testId: 'sankey-chart',
    build: ({ accent, theme }) => (
      <SankeyChart
        nodes={[{ name: 'A' }, { name: 'B' }]}
        links={[{ source: 'A', target: 'B', value: 5 }]}
        accent={accent as never}
        theme={theme as never}
      />
    ),
  },
  {
    name: 'SunburstChart',
    testId: 'sunburst-chart',
    build: ({ accent, theme }) => (
      <SunburstChart
        data={[
          { name: 'A', value: 10 },
          { name: 'B', value: 20 },
        ]}
        accent={accent as never}
        theme={theme as never}
      />
    ),
  },
];

/* ---------------------------------------------------------------- */
/*  Per-chart accent contract                                        */
/* ---------------------------------------------------------------- */

describe.each(charts)('$name — accent contract (Faz 21.5-A2)', ({ name, testId, build }) => {
  it(`[${name}] default accent='auto' + no DOM → light primary "#3b82f6" appears`, () => {
    render(build({ accent: 'auto' }));
    const opt = lastSetOption();
    const colors = collectColors(opt);
    // light palette[0] = '#3b82f6' must appear somewhere in option
    expect(colors, `${name} should contain light primary`).toContain('#3b82f6');
  });

  it(`[${name}] accent='emerald' → emerald primary "#16a34a" appears in option`, () => {
    render(build({ accent: 'emerald' }));
    const opt = lastSetOption();
    const colors = collectColors(opt);
    expect(colors, `${name} should contain emerald primary`).toContain('#16a34a');
  });

  it(`[${name}] accent='ocean' → ocean primary "#0ea5e9" appears in option`, () => {
    render(build({ accent: 'ocean' }));
    const opt = lastSetOption();
    const colors = collectColors(opt);
    expect(colors, `${name} should contain ocean primary`).toContain('#0ea5e9');
  });

  it(`[${name}] HC theme + accent='emerald' → emerald primary NOT in option (HC palette wins)`, () => {
    render(build({ accent: 'emerald', theme: 'high-contrast' }));
    const opt = lastSetOption();
    const colors = collectColors(opt);
    // HC palette uses deep colors like '#0000CC', '#CC0000', etc.
    // emerald primary '#16a34a' should NOT appear (HC wins)
    expect(colors, `${name} HC mode must NOT contain emerald primary`).not.toContain('#16a34a');
  });

  it(`[${name}] accent prop doesn't leak to DOM as attribute`, () => {
    const { container } = render(build({ accent: 'emerald' }));
    const el = container.querySelector(`[data-testid="${testId}"]`);
    expect(el).not.toBeNull();
    expect(el?.getAttribute('accent')).toBeNull();
    expect(container.firstElementChild?.getAttribute('accent')).toBeNull();
  });
});

/* ---------------------------------------------------------------- */
/*  Cross-cutting invariants                                         */
/* ---------------------------------------------------------------- */

describe('Accent invariants', () => {
  it('explicit accent prop wins over data-accent="emerald"', () => {
    document.documentElement.setAttribute('data-accent', 'emerald');
    __resetThemeStoreForTests();
    render(<BarChart data={SAMPLE_BAR} accent="violet" />);
    const opt = lastSetOption();
    const colors = collectColors(opt);
    expect(colors).toContain('#722ed1'); // violet primary
    expect(colors).not.toContain('#16a34a'); // emerald primary not present
  });

  it('data-accent="neutral" alias resolves to light palette', () => {
    document.documentElement.setAttribute('data-accent', 'neutral');
    __resetThemeStoreForTests();
    render(<BarChart data={SAMPLE_BAR} accent="auto" />);
    const opt = lastSetOption();
    const colors = collectColors(opt);
    expect(colors).toContain('#3b82f6'); // light primary (legacy)
  });

  it('all 7 accents produce distinct primary in BarChart', () => {
    const seen: Set<string> = new Set();
    const accents = ['light', 'dark', 'emerald', 'graphite', 'ocean', 'sunset', 'violet'];
    for (const a of accents) {
      setOptionMock.mockClear();
      render(<BarChart data={SAMPLE_BAR} accent={a as never} />);
      const opt = lastSetOption();
      const expectedPrimary = ACCENT_PALETTES[a as keyof typeof ACCENT_PALETTES][0];
      seen.add(expectedPrimary);
      expect(collectColors(opt)).toContain(expectedPrimary);
    }
    // All 7 primaries must be unique (verifies palette dict integrity)
    expect(seen.size).toBe(7);
  });
});
