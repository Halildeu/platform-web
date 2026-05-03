// @vitest-environment jsdom
/**
 * Responsive collision integration tests
 *
 * Codex thread `019defa5` PARTIAL post-impl review absorbed: locks the two
 * regression bugs the static review caught:
 *
 *   1. Line/Area/Scatter mobile bottom-legend grid padding — earlier draft
 *      hardcoded `breakpoint !== 'mobile'` for `hasBottomLegend` which left
 *      mobile legends overlapping the x-axis whenever seriesCount <= 5.
 *      Fix: derive padding from the resolved legend's `orient`.
 *   2. PieChart mobile label suppression — when `showLegend=false` and
 *      `showLabels|showPercentage=true` on mobile, the earlier draft hid
 *      slice labels (collision avoidance) but didn't open the legend, so
 *      slices became coloured swatches with no textual context. Fix:
 *      force-open the legend in that case.
 *
 * These tests render the wrappers with a mocked container that reports
 * mobile width through ResizeObserver + getBoundingClientRect, then read
 * back the option object via the existing ECharts mock harness.
 */
import { lastDispatchedOption, resetEChartsMock } from './fixtures/echarts-mock'; // hoisted side-effect import
import { installJsdomPolyfills, restoreJsdomPolyfills } from './fixtures/jsdom-polyfills';

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';

import { LineChart } from '../LineChart';
import { AreaChart } from '../AreaChart';
import { ScatterChart } from '../ScatterChart';
import { PieChart } from '../PieChart';

/* ------------------------------------------------------------------ */
/*  Mobile-viewport mock                                               */
/*                                                                     */
/*  Replaces the no-op ResizeObserver polyfill with one that emits a   */
/*  user-controlled width. Combined with a getBoundingClientRect spy   */
/*  applied to every newly created HTMLDivElement, this tricks         */
/*  useResponsiveBreakpoint into the requested breakpoint.             */
/* ------------------------------------------------------------------ */

type ResizeCallback = (entries: Array<{ contentRect: { width: number; height: number } }>) => void;

let pendingCallbacks: ResizeCallback[] = [];

class ImmediateResizeObserver {
  constructor(cb: ResizeCallback) {
    pendingCallbacks.push(cb);
  }
  observe(el: HTMLElement): void {
    // Emit on next macrotask — mirrors browser timing so React batches.
    const rect = el.getBoundingClientRect();
    queueMicrotask(() => {
      pendingCallbacks.forEach((cb) =>
        cb([{ contentRect: { width: rect.width, height: rect.height } }]),
      );
    });
  }
  unobserve(): void {}
  disconnect(): void {}
}

function setMobileViewport(width = 375): void {
  // Force any HTMLDivElement created during this test to report mobile width.
  vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width,
    height: 240,
    top: 0,
    left: 0,
    bottom: 240,
    right: width,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  vi.stubGlobal('ResizeObserver', ImmediateResizeObserver);
}

beforeEach(() => {
  resetEChartsMock();
  installJsdomPolyfills();
  pendingCallbacks = [];
});

afterEach(() => {
  restoreJsdomPolyfills();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/* ------------------------------------------------------------------ */
/*  Type helpers                                                       */
/* ------------------------------------------------------------------ */

function legend(): { show: boolean; orient: string; bottom?: number } | undefined {
  const opt = lastDispatchedOption();
  return opt?.legend as { show: boolean; orient: string; bottom?: number } | undefined;
}

function grid(): { top: number; bottom: number; left: number; right: number } | undefined {
  const opt = lastDispatchedOption();
  return opt?.grid as { top: number; bottom: number; left: number; right: number } | undefined;
}

function pieSeries(): {
  label?: { show: boolean };
  labelLayout?: { hideOverlap?: boolean };
} {
  const opt = lastDispatchedOption();
  const series = opt?.series as Array<Record<string, unknown>> | undefined;
  return (series?.[0] ?? {}) as {
    label?: { show: boolean };
    labelLayout?: { hideOverlap?: boolean };
  };
}

/**
 * Wait for the ResizeObserver microtask + a React state-update flush so
 * the option object reflects the mobile breakpoint before we assert.
 */
async function flushBreakpoint(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/* ------------------------------------------------------------------ */
/*  Bug 1 — mobile bottom-legend grid padding                          */
/* ------------------------------------------------------------------ */

describe('Codex 019defa5 PARTIAL bug 1: mobile bottom legend reserves grid padding', () => {
  it('LineChart mobile + 2 series → grid.bottom uses the legend-aware padding', async () => {
    setMobileViewport(375);
    render(
      <LineChart
        labels={['Oca', 'Şub', 'Mar']}
        series={[
          { name: 'A', data: [1, 2, 3] },
          { name: 'B', data: [3, 2, 1] },
        ]}
        animate={false}
      />,
    );
    await flushBreakpoint();

    const l = legend();
    const g = grid();
    expect(l?.show).toBe(true);
    expect(l?.orient).toBe('horizontal');
    // The plain bottom (24 × shrink) would round to ~12-17. The legend
    // bottom (48 × shrink) rounds to ~24-34. We assert the grid is on the
    // legend-aware side: > plain bottom for the same breakpoint.
    expect(g!.bottom).toBeGreaterThan(20);
  });

  it('AreaChart mobile + 2 series → grid.bottom uses the legend-aware padding', async () => {
    setMobileViewport(375);
    render(
      <AreaChart
        labels={['Oca', 'Şub']}
        series={[
          { name: 'A', data: [1, 2] },
          { name: 'B', data: [2, 1] },
        ]}
        animate={false}
      />,
    );
    await flushBreakpoint();

    const l = legend();
    const g = grid();
    expect(l?.show).toBe(true);
    expect(l?.orient).toBe('horizontal');
    expect(g!.bottom).toBeGreaterThan(20);
  });

  it('ScatterChart mobile + showLegend=true → grid.bottom uses the legend-aware padding', async () => {
    setMobileViewport(375);
    render(
      <ScatterChart
        data={[
          { x: 1, y: 2 },
          { x: 3, y: 4 },
        ]}
        showLegend
        animate={false}
      />,
    );
    await flushBreakpoint();

    const l = legend();
    const g = grid();
    expect(l?.show).toBe(true);
    expect(l?.orient).toBe('horizontal');
    expect(g!.bottom).toBeGreaterThan(20);
  });
});

/* ------------------------------------------------------------------ */
/*  Bug 2 — PieChart mobile label suppression fallback                 */
/* ------------------------------------------------------------------ */

describe('Codex 019defa5 PARTIAL bug 2: PieChart mobile label suppression opens legend', () => {
  it('mobile + showLabels=true + showLegend=false → legend is force-opened', async () => {
    setMobileViewport(375);
    render(
      <PieChart
        data={[
          { label: 'Tarım', value: 320 },
          { label: 'Sanayi', value: 280 },
          { label: 'Hizmet', value: 410 },
        ]}
        showLabels
        showLegend={false}
        animate={false}
      />,
    );
    await flushBreakpoint();

    expect(legend()?.show).toBe(true);
    // Outer slice labels stay suppressed (collision source on mobile).
    expect(pieSeries().label?.show).toBe(false);
  });

  it('mobile + showPercentage=true + showLegend=false → legend is force-opened', async () => {
    setMobileViewport(375);
    render(
      <PieChart
        data={[
          { label: 'A', value: 100 },
          { label: 'B', value: 100 },
        ]}
        showPercentage
        showLegend={false}
        animate={false}
      />,
    );
    await flushBreakpoint();

    expect(legend()?.show).toBe(true);
  });

  it('mobile + showLabels=false + showLegend=false → legend stays closed', async () => {
    setMobileViewport(375);
    render(
      <PieChart
        data={[
          { label: 'A', value: 1 },
          { label: 'B', value: 1 },
        ]}
        showLabels={false}
        showPercentage={false}
        showLegend={false}
        animate={false}
      />,
    );
    await flushBreakpoint();

    expect(legend()?.show).toBe(false);
  });

  it('always sets labelLayout.hideOverlap on the pie series', async () => {
    render(
      <PieChart
        data={[
          { label: 'A', value: 1 },
          { label: 'B', value: 1 },
        ]}
        animate={false}
      />,
    );
    await flushBreakpoint();

    expect(pieSeries().labelLayout?.hideOverlap).toBe(true);
  });
});
