// @vitest-environment jsdom
/**
 * Faz 21.5-A2 — semantic color preservation contract.
 *
 * Codex iter-13 absorb: GaugeChart thresholds, HeatmapChart gradient, and
 * WaterfallChart increase/decrease colors are SEMANTIC and must NOT change
 * when accent palette flips. Only WaterfallChart's `total` color binds to
 * accent primary (effectivePalette[0]).
 *
 * Tests verify under accent='emerald':
 *   - GaugeChart thresholds: success/warning/danger SAĞLI ('#22c55e', '#f59e0b', '#ef4444')
 *   - HeatmapChart colors: gradient endpoints SAĞLI ('#f5f5f5', '#3b82f6')
 *   - WaterfallChart increase: '#22c55e' SAĞLI; decrease: '#ef4444' SAĞLI;
 *     total: '#16a34a' (emerald primary) — REPLACED
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';

import { GaugeChart } from '../GaugeChart';
import { HeatmapChart } from '../HeatmapChart';
import { WaterfallChart } from '../WaterfallChart';
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

const collectColorsFromOption = (obj: unknown): string[] => {
  const colors: string[] = [];
  const walk = (node: unknown) => {
    if (!node) return;
    if (typeof node === 'string' && node.match(/^#[0-9a-fA-F]{6}$/)) {
      colors.push(node);
    }
    if (typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    Object.values(node as Record<string, unknown>).forEach(walk);
  };
  walk(obj);
  return colors;
};

/* ---------------------------------------------------------------- */
/*  GaugeChart — accent IMMUNE                                       */
/* ---------------------------------------------------------------- */

describe('GaugeChart — accent immune (semantic thresholds preserved)', () => {
  it('default thresholds (success/warning/danger) preserved under accent="emerald"', () => {
    render(<GaugeChart value={42} accent="emerald" />);
    const opt = lastSetOption();
    const colors = collectColorsFromOption(opt);
    // Default thresholds: '#22c55e' (success), '#f59e0b' (warning), '#ef4444' (danger)
    expect(colors).toContain('#22c55e');
    expect(colors).toContain('#f59e0b');
    expect(colors).toContain('#ef4444');
  });

  it('emerald primary "#16a34a" NOT injected into Gauge option (accent ignored)', () => {
    render(<GaugeChart value={42} accent="emerald" />);
    const opt = lastSetOption();
    const colors = collectColorsFromOption(opt);
    expect(colors).not.toContain('#16a34a');
  });

  it('user-defined thresholds prop fully respected under any accent', () => {
    const customThresholds = [
      { value: 50, color: '#ff00ff' }, // magenta
      { value: 100, color: '#00ffff' }, // cyan
    ];
    render(<GaugeChart value={42} thresholds={customThresholds} accent="emerald" />);
    const opt = lastSetOption();
    const colors = collectColorsFromOption(opt);
    expect(colors).toContain('#ff00ff');
    expect(colors).toContain('#00ffff');
  });
});

/* ---------------------------------------------------------------- */
/*  HeatmapChart — accent IMMUNE                                     */
/* ---------------------------------------------------------------- */

describe('HeatmapChart — accent immune (semantic gradient preserved)', () => {
  it('default colors gradient ["#f5f5f5", "#3b82f6"] preserved under accent="emerald"', () => {
    render(
      <HeatmapChart
        data={[
          [0, 0, 5],
          [1, 1, 8],
        ]}
        xLabels={['x1', 'x2']}
        yLabels={['y1', 'y2']}
        accent="emerald"
      />,
    );
    const opt = lastSetOption();
    const colors = collectColorsFromOption(opt);
    // Default heatmap gradient: '#f5f5f5' (low) → '#3b82f6' (high)
    expect(colors).toContain('#f5f5f5');
    expect(colors).toContain('#3b82f6');
  });

  it('emerald primary "#16a34a" NOT injected into Heatmap option (accent ignored)', () => {
    render(
      <HeatmapChart
        data={[
          [0, 0, 5],
          [1, 1, 8],
        ]}
        xLabels={['x1', 'x2']}
        yLabels={['y1', 'y2']}
        accent="emerald"
      />,
    );
    const opt = lastSetOption();
    const colors = collectColorsFromOption(opt);
    expect(colors).not.toContain('#16a34a');
  });

  it('user-defined colors prop fully respected under any accent', () => {
    render(
      <HeatmapChart
        data={[
          [0, 0, 5],
          [1, 1, 8],
        ]}
        xLabels={['x1', 'x2']}
        yLabels={['y1', 'y2']}
        colors={['#abcdef', '#fedcba']}
        accent="emerald"
      />,
    );
    const opt = lastSetOption();
    const colors = collectColorsFromOption(opt);
    expect(colors).toContain('#abcdef');
    expect(colors).toContain('#fedcba');
  });
});

/* ---------------------------------------------------------------- */
/*  WaterfallChart — semantic + total accent-bound                    */
/* ---------------------------------------------------------------- */

const WATERFALL_DATA = [
  { label: 'Start', value: 100, type: 'total' as const },
  { label: 'A', value: 20 },
  { label: 'B', value: -10 },
  { label: 'End', value: 110, type: 'total' as const },
];

describe('WaterfallChart — semantic increase/decrease + total accent-bound', () => {
  it('default light: increase="#22c55e" + decrease="#ef4444" + total="#3b82f6" (light primary)', () => {
    render(<WaterfallChart data={WATERFALL_DATA} accent="light" />);
    const opt = lastSetOption();
    const colors = collectColorsFromOption(opt);
    expect(colors).toContain('#22c55e'); // success
    expect(colors).toContain('#ef4444'); // danger
    expect(colors).toContain('#3b82f6'); // total = light primary
  });

  it('accent="emerald": increase="#22c55e" + decrease="#ef4444" preserved; total="#16a34a" (emerald primary)', () => {
    render(<WaterfallChart data={WATERFALL_DATA} accent="emerald" />);
    const opt = lastSetOption();
    const colors = collectColorsFromOption(opt);
    // Semantic increase/decrease NEVER replaced by accent
    expect(colors).toContain('#22c55e'); // success SAĞLI
    expect(colors).toContain('#ef4444'); // danger SAĞLI
    // Total bound to accent primary
    expect(colors).toContain('#16a34a'); // total = emerald primary
  });

  it('accent="violet": total="#722ed1" (violet primary), semantic preserved', () => {
    render(<WaterfallChart data={WATERFALL_DATA} accent="violet" />);
    const opt = lastSetOption();
    const colors = collectColorsFromOption(opt);
    expect(colors).toContain('#22c55e'); // success
    expect(colors).toContain('#ef4444'); // danger
    expect(colors).toContain('#722ed1'); // total = violet primary
  });

  it('user-defined colors.total override wins over accent', () => {
    render(<WaterfallChart data={WATERFALL_DATA} colors={{ total: '#abcdef' }} accent="emerald" />);
    const opt = lastSetOption();
    const colors = collectColorsFromOption(opt);
    expect(colors).toContain('#abcdef'); // user override wins
    expect(colors).not.toContain('#16a34a'); // emerald primary excluded
    // Semantic preserved
    expect(colors).toContain('#22c55e');
    expect(colors).toContain('#ef4444');
  });

  it('user-defined colors.increase/decrease override semantic defaults', () => {
    render(
      <WaterfallChart
        data={WATERFALL_DATA}
        colors={{ increase: '#abcdef', decrease: '#fedcba' }}
        accent="emerald"
      />,
    );
    const opt = lastSetOption();
    const colors = collectColorsFromOption(opt);
    expect(colors).toContain('#abcdef'); // override
    expect(colors).toContain('#fedcba'); // override
    expect(colors).not.toContain('#22c55e'); // default success replaced
    expect(colors).not.toContain('#ef4444'); // default danger replaced
  });
});
