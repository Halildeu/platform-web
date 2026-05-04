// @vitest-environment jsdom
/**
 * useEChartsRenderer ref lifecycle + mock-fixture invariants
 *
 * Faz 21.9 PR3h: locks the additive callback-ref API and the
 * per-container alive-instance bookkeeping inside the redesigned
 * fixture. The point of this file is to catch double-mount /
 * stale-dispose regressions BEFORE they cascade across the chart
 * wrappers (which would surface as 100+ unrelated test failures, like
 * the original PR3h attempt).
 */
import {
  resetEChartsMock,
  initCallCount,
  disposeCallCount,
  aliveInstanceCount,
  duplicateInitCount,
  allMockInstances,
} from '../../__tests__/fixtures/echarts-mock';
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, renderHook, act } from '@testing-library/react';
import { useEChartsRenderer } from '../echarts-renderer';
// Imported AFTER the mock fixture so vi.mock interception is in place.
// Used by the stale-dispose race test below.
import { echarts as mockedEcharts } from '../echarts-imports';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function ChartHost({
  theme,
  refMode = 'object',
}: {
  theme?: string | object;
  refMode?: 'object' | 'callback';
}) {
  const { containerRef, setContainerRef } = useEChartsRenderer({
    option: { series: [] },
    theme,
  });

  return (
    <div
      data-testid="chart-host"
      // ResizeObserver mock: jsdom doesn't provide one, but fixture's
      // echarts-mock doesn't observe (no-op) so this works.
      ref={refMode === 'callback' ? setContainerRef : containerRef}
    />
  );
}

class ResizeObserverMock {
  observe(): void {
    /* no-op */
  }
  unobserve(): void {
    /* no-op */
  }
  disconnect(): void {
    /* no-op */
  }
}
// jsdom doesn't ship ResizeObserver — provide a no-op so the renderer's
// `new ResizeObserver(...)` doesn't throw. The real lifecycle behaviour
// we care about (init / dispose pairing) is unaffected.
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverMock }).ResizeObserver =
  ResizeObserverMock;

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('useEChartsRenderer ref lifecycle (PR3h)', () => {
  beforeEach(() => {
    resetEChartsMock();
  });

  /* ---------- ref API shape ---------- */

  it('exposes both an object containerRef and a stable setContainerRef callback', () => {
    const { result } = renderHook(() => useEChartsRenderer({ option: { series: [] } }));
    // Object ref shape — null until DOM commit.
    expect(result.current.containerRef).toBeDefined();
    expect('current' in result.current.containerRef).toBe(true);
    // Callback ref shape.
    expect(typeof result.current.setContainerRef).toBe('function');
  });

  it('setContainerRef identity is stable across rerenders', () => {
    const { result, rerender } = renderHook(() => useEChartsRenderer({ option: { series: [] } }));
    const cb1 = result.current.setContainerRef;
    rerender();
    const cb2 = result.current.setContainerRef;
    expect(cb1).toBe(cb2);
  });

  it('setContainerRef writes to the same containerRef.current as the object ref', () => {
    const { result } = renderHook(() => useEChartsRenderer({ option: { series: [] } }));
    const node = document.createElement('div') as HTMLDivElement;
    act(() => {
      result.current.setContainerRef(node);
    });
    expect(result.current.containerRef.current).toBe(node);
    act(() => {
      result.current.setContainerRef(null);
    });
    expect(result.current.containerRef.current).toBe(null);
  });

  /* ---------- mount/unmount invariants via mock fixture ---------- */

  it('mount produces exactly one alive instance, unmount disposes it', () => {
    const { unmount } = render(<ChartHost />);
    expect(initCallCount()).toBe(1);
    expect(aliveInstanceCount()).toBe(1);

    unmount();
    expect(aliveInstanceCount()).toBe(0);
    // Dispose was called at least once for the single instance.
    expect(disposeCallCount()).toBeGreaterThanOrEqual(1);
  });

  it('callback-ref mount path matches object-ref mount path (single alive)', () => {
    const { unmount } = render(<ChartHost refMode="callback" />);
    expect(initCallCount()).toBe(1);
    expect(aliveInstanceCount()).toBe(1);
    unmount();
    expect(aliveInstanceCount()).toBe(0);
  });

  it('healthy mount has zero duplicate inits (no double-mount bug)', () => {
    const { unmount } = render(<ChartHost />);
    expect(duplicateInitCount()).toBe(0);
    unmount();
    expect(duplicateInitCount()).toBe(0);
  });

  /* ---------- theme change re-init ---------- */

  it('theme change disposes old instance and creates a fresh one', () => {
    const { rerender, unmount } = render(<ChartHost theme="light" />);
    expect(initCallCount()).toBe(1);
    expect(aliveInstanceCount()).toBe(1);

    rerender(<ChartHost theme="dark" />);
    // One more init for the fresh theme; old instance disposed; net
    // alive stays at 1.
    expect(initCallCount()).toBe(2);
    expect(aliveInstanceCount()).toBe(1);
    expect(disposeCallCount()).toBeGreaterThanOrEqual(1);

    unmount();
    expect(aliveInstanceCount()).toBe(0);
  });

  /* ---------- dispose idempotency + duplicate-init contract ---------- */

  it('unmount disposes instance, leaves zero alive, and an explicit second dispose is idempotent', () => {
    const { unmount } = render(<ChartHost />);
    expect(aliveInstanceCount()).toBe(1);
    const disposesAfterMount = disposeCallCount();

    unmount();
    expect(aliveInstanceCount()).toBe(0);
    const disposesAfterUnmount = disposeCallCount();
    expect(disposesAfterUnmount).toBeGreaterThan(disposesAfterMount);

    // Reach for the (single) instance directly and call dispose() a
    // SECOND time. The fixture's idempotency contract says this must
    // not throw and must not revive the alive entry. Locking it here
    // is the regression net for PR3i lifecycle reconcile work.
    const [instance] = allMockInstances();
    expect(() => instance.dispose()).not.toThrow();
    expect(aliveInstanceCount()).toBe(0);
    // Dispose mock recorded the second call too.
    expect(disposeCallCount()).toBeGreaterThan(disposesAfterUnmount);
  });

  it('duplicate init on the same DOM returns the existing instance and bumps duplicateInitCount', () => {
    // Drive the duplicate-init scenario directly against the mocked
    // ECharts module, no React involved. Real ECharts returns the
    // existing instance for the same DOM; the fixture mirrors that and
    // surfaces a counter so the renderer would be caught if it ever
    // forgot to dispose before re-initing.
    const node = document.createElement('div') as HTMLDivElement;
    document.body.appendChild(node);

    const first = mockedEcharts.init(node);
    expect(aliveInstanceCount()).toBe(1);
    expect(duplicateInitCount()).toBe(0);

    const second = mockedEcharts.init(node);
    expect(second).toBe(first);
    expect(duplicateInitCount()).toBe(1);
    expect(aliveInstanceCount()).toBe(1); // still one alive

    // Disposing the (single, shared) instance evicts the alive entry.
    first.dispose();
    expect(aliveInstanceCount()).toBe(0);

    document.body.removeChild(node);
  });
});
