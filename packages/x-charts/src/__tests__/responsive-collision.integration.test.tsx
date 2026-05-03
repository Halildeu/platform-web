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
import { WaterfallChart } from '../WaterfallChart';
import { HeatmapChart } from '../HeatmapChart';
import { RadarChart } from '../RadarChart';
import { GaugeChart } from '../GaugeChart';

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
  // Codex 019defa5 iter-2: teardown order matters. `unstubAllGlobals` first
  // pops the test-scoped ResizeObserver back to the fixture polyfill, then
  // `restoreJsdomPolyfills` returns globalThis to whatever existed before
  // the suite installed its polyfill. Reversing the order would let the
  // polyfill leak past the suite boundary.
  vi.unstubAllGlobals();
  restoreJsdomPolyfills();
  vi.restoreAllMocks();
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

/* ------------------------------------------------------------------ */
/*  PR3c — ext wrapper responsive option-shape regression             */
/* ------------------------------------------------------------------ */

function xAxis(): Record<string, unknown> | undefined {
  const opt = lastDispatchedOption();
  return opt?.xAxis as Record<string, unknown> | undefined;
}

function yAxis(): Record<string, unknown> | undefined {
  const opt = lastDispatchedOption();
  return opt?.yAxis as Record<string, unknown> | undefined;
}

function radar(): Record<string, unknown> | undefined {
  const opt = lastDispatchedOption();
  return opt?.radar as Record<string, unknown> | undefined;
}

function gaugeSeries(): Record<string, unknown> | undefined {
  const opt = lastDispatchedOption();
  const series = opt?.series as Array<Record<string, unknown>> | undefined;
  return series?.[0];
}

describe('Codex 019defa5 PR3c: ext wrapper responsive option shape', () => {
  it('WaterfallChart mobile + 40 labels → axisLabel.hideOverlap + interval=auto + dataZoom on xAxis', async () => {
    setMobileViewport(375);
    const labels = Array.from({ length: 40 }, (_, i) => `Q${i}`);
    const data = labels.map((label, i) => ({ label, value: (i % 3) - 1 }));
    render(<WaterfallChart data={data} animate={false} />);
    await flushBreakpoint();

    const xa = xAxis() as { axisLabel?: { hideOverlap?: boolean; interval?: 0 | 'auto' } };
    expect(xa.axisLabel?.hideOverlap).toBe(true);
    expect(xa.axisLabel?.interval).toBe('auto');

    const opt = lastDispatchedOption() as { dataZoom?: Array<{ xAxisIndex?: number }> };
    expect(opt.dataZoom?.[0]?.xAxisIndex).toBe(0);
  });

  it('HeatmapChart mobile + showLegend → grid.right reserved + both axes hideOverlap + yAxis no rotate', async () => {
    setMobileViewport(375);
    render(
      <HeatmapChart
        data={[
          [0, 0, 1],
          [1, 0, 2],
          [0, 1, 3],
        ]}
        xLabels={['A', 'B']}
        yLabels={['Y1', 'Y2']}
        showLegend
        animate={false}
      />,
    );
    await flushBreakpoint();

    const g = lastDispatchedOption()?.grid as { right?: number };
    expect(g?.right).toBeGreaterThanOrEqual(72);

    const xa = xAxis() as { axisLabel?: { hideOverlap?: boolean } };
    const ya = yAxis() as { axisLabel?: { hideOverlap?: boolean; rotate?: number } };
    expect(xa.axisLabel?.hideOverlap).toBe(true);
    expect(ya.axisLabel?.hideOverlap).toBe(true);
    // PR3c PARTIAL fix: yAxis must NOT inherit the helper's mobile rotate.
    expect(ya.axisLabel?.rotate).toBe(0);
  });

  it('RadarChart mobile + 5 indicators → radius shrunk + axisName suppressed (threshold)', async () => {
    setMobileViewport(375);
    render(
      <RadarChart
        indicators={[
          { name: 'Speed', max: 100 },
          { name: 'Reliability', max: 100 },
          { name: 'Comfort', max: 100 },
          { name: 'Safety', max: 100 },
          { name: 'Efficiency', max: 100 },
        ]}
        series={[{ name: 'Model A', data: [80, 90, 60, 70, 85] }]}
        showLabels
        animate={false}
      />,
    );
    await flushBreakpoint();

    const r = radar() as { radius?: string; axisName?: { show?: boolean } };
    expect(r.radius).toBe('60%');
    expect(r.axisName?.show).toBe(false);
  });

  it('RadarChart mobile + 3 indicators → axisName stays visible (under threshold)', async () => {
    // Codex PR3c PARTIAL: under-threshold radars keep their axis names.
    setMobileViewport(375);
    render(
      <RadarChart
        indicators={[
          { name: 'Speed', max: 100 },
          { name: 'Reliability', max: 100 },
          { name: 'Comfort', max: 100 },
        ]}
        series={[{ name: 'Model A', data: [80, 90, 60] }]}
        showLabels
        animate={false}
      />,
    );
    await flushBreakpoint();

    const r = radar() as { axisName?: { show?: boolean } };
    expect(r.axisName?.show).toBe(true);
  });

  it('GaugeChart mobile → axisLabel suppressed but detail.formatter still emits values', async () => {
    setMobileViewport(375);
    render(<GaugeChart value={42} animate={false} />);
    await flushBreakpoint();

    const s = gaugeSeries() as {
      axisLabel?: { show?: boolean };
      detail?: { formatter?: (v: number) => string };
    };
    expect(s.axisLabel?.show).toBe(false);
    expect(typeof s.detail?.formatter).toBe('function');
    expect(s.detail!.formatter!(42)).toContain('42');
  });
});
