// @vitest-environment jsdom
/**
 * Hoisted ECharts renderer mock + dispatched-option getters.
 *
 * IMPORTANT — import order matters. This module installs `vi.mock(...)` at
 * module evaluation time. To keep the mock visible to chart wrappers, the
 * test file MUST import this module BEFORE any chart component import:
 *
 *   import { setOptionMock, lastDispatchedOption } from './fixtures/echarts-mock';
 *   // ↑ side-effect: vi.mock('../../renderers/echarts-imports', ...) hoisted
 *   import { BarChart } from '../BarChart';
 *
 * Re-using this fixture from multiple test files keeps the mock surface
 * single-source-of-truth.
 */
import { vi } from 'vitest';

/**
 * Hoisted refs so they survive vi.mock factory's hoisting and are stable
 * across imports. Module-internal — vitest 4.x forbids exporting hoisted
 * variables; consumers go through `lastDispatchedOption()`, `resetEChartsMock()`
 * etc. below.
 */
const { setOptionMock, dispatchMock } = vi.hoisted(() => ({
  setOptionMock: vi.fn(),
  dispatchMock: vi.fn(),
}));

vi.mock('../../renderers/echarts-imports', () => {
  const instance = {
    setOption: setOptionMock,
    dispose: vi.fn(),
    resize: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    getZr: () => ({ on: vi.fn(), off: vi.fn() }),
    dispatchAction: dispatchMock,
    getDataURL: vi.fn(() => 'data:image/png;base64,'),
    getOption: () => ({ series: [] }),
  };

  return {
    echarts: {
      init: vi.fn(() => instance),
      use: vi.fn(),
      registerTheme: vi.fn(),
      registerLocale: vi.fn(),
      getInstanceByDom: vi.fn(() => instance),
      dispose: vi.fn(),
    },
    registerECharts: vi.fn(),
  };
});

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export type DispatchedOption = Record<string, unknown>;

/** Last option object passed to ECharts.setOption(). */
export const lastDispatchedOption = (): DispatchedOption | null => {
  const lastCall = setOptionMock.mock.calls.at(-1);
  return (lastCall?.[0] as DispatchedOption) ?? null;
};

/** All option objects ever passed to setOption() in chronological order. */
export const allDispatchedOptions = (): DispatchedOption[] =>
  setOptionMock.mock.calls.map((call) => call[0] as DispatchedOption);

/** series[*].type literals on the last dispatched option, or []. */
export const seriesTypes = (option: DispatchedOption | null): string[] => {
  if (!option) return [];
  const series = option.series as Array<{ type?: string }> | undefined;
  return Array.isArray(series) ? series.map((s) => s?.type ?? '') : [];
};

/** Reset captured calls — call this in `beforeEach`. */
export const resetEChartsMock = (): void => {
  setOptionMock.mockClear();
  dispatchMock.mockClear();
};
