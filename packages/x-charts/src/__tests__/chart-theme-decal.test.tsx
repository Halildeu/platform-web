// @vitest-environment jsdom
/**
 * Faz 21.5-B PR-B3b — chart × theme × decal contract.
 *
 * 13 charts × representative theme/decal cases pinlendi:
 *   - Default state (no DOM signal): aria.decal yok
 *   - data-appearance="high-contrast": aria.decal.show=true, decals.length=8
 *   - explicit theme='print': aria.decal.show=true (theme builder içindeki
 *     decal off, option-level injection on)
 *   - decal={false} override: aria.decal yok (high-contrast'ta bile)
 *   - decal={true} override: aria.decal.show=true (default'ta bile)
 *   - DOM sızıntı kontrolü: theme/decal prop'ları DOM attribute olmuyor
 *
 * Codex iter-3 madde 4: print theme builder useDecalPatterns:false ile
 * çağrılıyor; decal kontrolü tek noktada (option-level).
 *
 * Codex iter-3 madde 8: ScatterChart için ayrıca theme switch sonrası
 * setOption call diff (option memo'sunun themeObject dependency ile
 * recompute olduğu kanıtı) ayrı pinli.
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

const ariaOf = (opt: Record<string, unknown>): Record<string, unknown> | undefined =>
  opt.aria as Record<string, unknown> | undefined;

const decalOf = (opt: Record<string, unknown>): Record<string, unknown> | undefined =>
  ariaOf(opt)?.decal as Record<string, unknown> | undefined;

const lastTheme = (): Record<string, unknown> | undefined => {
  if (initMock.mock.calls.length === 0) return undefined;
  const last = initMock.mock.calls[initMock.mock.calls.length - 1];
  // signature: init(div, theme, opts?)
  return last[1] as Record<string, unknown> | undefined;
};

/* ---------------------------------------------------------------- */
/*  Sample fixtures                                                  */
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
  /** Returns a fresh element for each invocation (React must not see stale refs). */
  build: (props: { theme?: unknown; decal?: unknown }) => React.ReactElement;
};

const charts: ChartCase[] = [
  {
    name: 'BarChart',
    testId: 'bar-chart',
    build: ({ theme, decal }) => (
      <BarChart data={SAMPLE_BAR} theme={theme as never} decal={decal as never} />
    ),
  },
  {
    name: 'LineChart',
    testId: 'line-chart',
    build: ({ theme, decal }) => (
      <LineChart
        series={SAMPLE_SERIES}
        labels={SAMPLE_LABELS}
        theme={theme as never}
        decal={decal as never}
      />
    ),
  },
  {
    name: 'AreaChart',
    testId: 'area-chart',
    build: ({ theme, decal }) => (
      <AreaChart
        series={SAMPLE_SERIES}
        labels={SAMPLE_LABELS}
        theme={theme as never}
        decal={decal as never}
      />
    ),
  },
  {
    name: 'PieChart',
    testId: 'pie-chart',
    build: ({ theme, decal }) => (
      <PieChart data={SAMPLE_BAR} theme={theme as never} decal={decal as never} />
    ),
  },
  {
    name: 'ScatterChart',
    testId: 'scatter-chart',
    build: ({ theme, decal }) => (
      <ScatterChart
        data={[
          { x: 1, y: 2 },
          { x: 3, y: 4 },
        ]}
        theme={theme as never}
        decal={decal as never}
      />
    ),
  },
  {
    name: 'GaugeChart',
    testId: 'gauge-chart',
    build: ({ theme, decal }) => (
      <GaugeChart value={42} theme={theme as never} decal={decal as never} />
    ),
  },
  {
    name: 'RadarChart',
    testId: 'radar-chart',
    build: ({ theme, decal }) => (
      <RadarChart
        indicators={[
          { name: 'A', max: 10 },
          { name: 'B', max: 10 },
        ]}
        series={[{ name: 's', data: [5, 7] }]}
        theme={theme as never}
        decal={decal as never}
      />
    ),
  },
  {
    name: 'TreemapChart',
    testId: 'treemap-chart',
    build: ({ theme, decal }) => (
      <TreemapChart
        data={[
          { name: 'A', value: 10 },
          { name: 'B', value: 20 },
        ]}
        theme={theme as never}
        decal={decal as never}
      />
    ),
  },
  {
    name: 'HeatmapChart',
    testId: 'heatmap-chart',
    build: ({ theme, decal }) => (
      <HeatmapChart
        data={[
          [0, 0, 5],
          [1, 1, 8],
        ]}
        xLabels={['x1', 'x2']}
        yLabels={['y1', 'y2']}
        theme={theme as never}
        decal={decal as never}
      />
    ),
  },
  {
    name: 'WaterfallChart',
    testId: 'waterfall-chart',
    build: ({ theme, decal }) => (
      <WaterfallChart
        data={[
          { label: 'Start', value: 100, type: 'total' },
          { label: 'A', value: 20 },
          { label: 'End', value: 120, type: 'total' },
        ]}
        theme={theme as never}
        decal={decal as never}
      />
    ),
  },
  {
    name: 'FunnelChart',
    testId: 'funnel-chart',
    build: ({ theme, decal }) => (
      <FunnelChart
        data={[
          { name: 'Visit', value: 100 },
          { name: 'Sale', value: 10 },
        ]}
        theme={theme as never}
        decal={decal as never}
      />
    ),
  },
  {
    name: 'SankeyChart',
    testId: 'sankey-chart',
    build: ({ theme, decal }) => (
      <SankeyChart
        nodes={[{ name: 'A' }, { name: 'B' }]}
        links={[{ source: 'A', target: 'B', value: 5 }]}
        theme={theme as never}
        decal={decal as never}
      />
    ),
  },
  {
    name: 'SunburstChart',
    testId: 'sunburst-chart',
    build: ({ theme, decal }) => (
      <SunburstChart
        data={[
          { name: 'A', value: 10 },
          { name: 'B', value: 20 },
        ]}
        theme={theme as never}
        decal={decal as never}
      />
    ),
  },
];

/* ---------------------------------------------------------------- */
/*  Per-chart parametric contract                                    */
/* ---------------------------------------------------------------- */

describe.each(charts)(
  '$name — theme/decal contract (Faz 21.5-B PR-B3b)',
  ({ name, testId, build }) => {
    it(`[${name}] default state → aria.decal yok`, () => {
      render(build({ theme: 'auto', decal: 'auto' }));
      const opt = lastSetOption();
      expect(decalOf(opt)).toBeUndefined();
    });

    it(`[${name}] data-appearance="high-contrast" → aria.decal.show=true with 8 decals`, () => {
      document.documentElement.setAttribute('data-appearance', 'high-contrast');
      __resetThemeStoreForTests();
      render(build({ theme: 'auto', decal: 'auto' }));
      const opt = lastSetOption();
      const decal = decalOf(opt);
      expect(decal).toBeDefined();
      expect(decal?.show).toBe(true);
      expect(Array.isArray(decal?.decals)).toBe(true);
      expect((decal?.decals as unknown[]).length).toBe(8);
    });

    it(`[${name}] explicit theme="print" → aria.decal.show=true (option-level injection)`, () => {
      render(build({ theme: 'print', decal: 'auto' }));
      const opt = lastSetOption();
      const decal = decalOf(opt);
      expect(decal).toBeDefined();
      expect(decal?.show).toBe(true);
    });

    it(`[${name}] decal=false override on high-contrast → aria.decal yok`, () => {
      document.documentElement.setAttribute('data-appearance', 'high-contrast');
      __resetThemeStoreForTests();
      render(build({ theme: 'auto', decal: false }));
      const opt = lastSetOption();
      expect(decalOf(opt)).toBeUndefined();
    });

    it(`[${name}] decal=true override on default → aria.decal.show=true`, () => {
      render(build({ theme: 'auto', decal: true }));
      const opt = lastSetOption();
      const decal = decalOf(opt);
      expect(decal).toBeDefined();
      expect(decal?.show).toBe(true);
    });

    it(`[${name}] aria.label.description preserved alongside decal injection`, () => {
      render(build({ theme: 'high-contrast', decal: 'auto' }));
      const opt = lastSetOption();
      const aria = ariaOf(opt);
      expect(aria?.enabled).toBe(true);
      expect(typeof (aria?.label as Record<string, unknown>)?.description).toBe('string');
    });

    it(`[${name}] theme/decal props don't leak to DOM as attributes`, () => {
      const { container } = render(build({ theme: 'high-contrast', decal: true }));
      const el = container.querySelector(`[data-testid="${testId}"]`);
      expect(el).not.toBeNull();
      expect(el?.getAttribute('theme')).toBeNull();
      expect(el?.getAttribute('decal')).toBeNull();
      // ChartA11yShell wrapper de aynı kontrolden geçer:
      expect(container.firstElementChild?.getAttribute('theme')).toBeNull();
      expect(container.firstElementChild?.getAttribute('decal')).toBeNull();
    });

    it(`[${name}] echarts.init received a non-null theme object`, () => {
      render(build({ theme: 'high-contrast', decal: 'auto' }));
      const themeObj = lastTheme();
      expect(themeObj).toBeDefined();
      expect(typeof themeObj).toBe('object');
      // Theme builders her zaman 'color' palette döner
      expect(Array.isArray((themeObj as Record<string, unknown>)?.color)).toBe(true);
    });
  },
);

/* ---------------------------------------------------------------- */
/*  Cross-cutting invariants                                         */
/* ---------------------------------------------------------------- */

describe('Theme builder distinctness invariant', () => {
  it('high-contrast theme color palette differs from default theme palette', () => {
    render(<BarChart data={SAMPLE_BAR} theme="high-contrast" />);
    const hcTheme = lastTheme();
    initMock.mockClear();
    render(<BarChart data={SAMPLE_BAR} theme="light" />);
    const lightTheme = lastTheme();
    expect((hcTheme as Record<string, unknown>)?.color).not.toEqual(
      (lightTheme as Record<string, unknown>)?.color,
    );
  });

  it('print theme builder is invoked with useDecalPatterns:false (no theme-level aria.decal)', () => {
    render(<BarChart data={SAMPLE_BAR} theme="print" />);
    const printTheme = lastTheme() as Record<string, unknown>;
    // Theme'in kendi aria.decal'ı YOK (print theme useDecalPatterns:false ile çağrılıyor)
    // Ama option içine inject edilmiş aria.decal VAR (decal='auto' && resolved='print')
    const themeAria = printTheme?.aria as Record<string, unknown> | undefined;
    expect(themeAria?.decal).toBeUndefined();
  });

  it('high-contrast: light HC vs dark HC theme builder yields different textStyle.color', () => {
    // Light HC default
    document.documentElement.removeAttribute('data-mode');
    document.documentElement.setAttribute('data-appearance', 'high-contrast');
    __resetThemeStoreForTests();
    render(<BarChart data={SAMPLE_BAR} theme="auto" />);
    const lightHcTheme = lastTheme() as Record<string, unknown>;
    const lightHcText = (lightHcTheme?.textStyle as Record<string, unknown>)?.color;
    expect(lightHcText).toBe('#000000');

    initMock.mockClear();
    // Dark HC
    document.documentElement.setAttribute('data-mode', 'dark');
    __resetThemeStoreForTests();
    render(<BarChart data={SAMPLE_BAR} theme="auto" />);
    const darkHcTheme = lastTheme() as Record<string, unknown>;
    const darkHcText = (darkHcTheme?.textStyle as Record<string, unknown>)?.color;
    expect(darkHcText).toBe('#ffffff');
  });
});

/* ---------------------------------------------------------------- */
/*  ScatterChart memo dependency invariant (Codex iter-1 madde 6)    */
/* ---------------------------------------------------------------- */

describe('ScatterChart — option memo recomputes on theme switch', () => {
  it('setOption color/palette differs between light and high-contrast', () => {
    document.documentElement.removeAttribute('data-appearance');
    __resetThemeStoreForTests();

    const { rerender } = render(<ScatterChart data={[{ x: 1, y: 2 }]} theme="light" />);
    const lightCalls = setOptionMock.mock.calls.length;
    setOptionMock.mockClear();

    rerender(<ScatterChart data={[{ x: 1, y: 2 }]} theme="high-contrast" />);

    // theme switch yeni setOption tetiklemeli
    expect(setOptionMock.mock.calls.length).toBeGreaterThan(0);
    expect(lightCalls).toBeGreaterThan(0);
    const hcOpt = lastSetOption();
    // HC mode'da decal injection olmalı
    expect(decalOf(hcOpt)?.show).toBe(true);
  });
});
