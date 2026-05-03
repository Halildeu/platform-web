// @vitest-environment jsdom
/**
 * useEChartsRenderer reduced-motion resize contract
 *
 * Faz 21.9 PR3b (Codex thread `019defa5`): the ResizeObserver inside
 * `useEChartsRenderer` used to fire `instance.resize({ animation: { duration: 200 } })`
 * unconditionally. Users with `prefers-reduced-motion: reduce` got a
 * janky 200ms bounce on every container size change.
 *
 * The fix passes `duration: 0` when reduced motion is detected. This test
 * locks the contract via a mocked ECharts instance — we capture the
 * argument shape that `instance.resize` receives and assert duration
 * routing per media-query state.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEChartsRenderer } from '../echarts-renderer';

// Capture every resize call's argument shape so the test can assert
// the duration value routed to the underlying instance.
let resizeCalls: Array<{ animation?: { duration?: number } }> = [];
let resizeObserverCallbacks: Array<() => void> = [];

class ResizeObserverMock {
  constructor(cb: () => void) {
    resizeObserverCallbacks.push(cb);
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

vi.mock('../echarts-imports', async () => {
  const actual = await vi.importActual<typeof import('../echarts-imports')>('../echarts-imports');
  return {
    ...actual,
    registerECharts: vi.fn(),
    echarts: {
      ...actual.echarts,
      init: vi.fn(() => ({
        setOption: vi.fn(),
        resize: vi.fn((opts: { animation?: { duration?: number } }) => {
          resizeCalls.push(opts ?? {});
        }),
        dispose: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
      })),
    },
  };
});

beforeEach(() => {
  resizeCalls = [];
  resizeObserverCallbacks = [];
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setReducedMotion(enabled: boolean): void {
  // Codex 019defa5 PR3b PARTIAL: use stubGlobal so afterEach's
  // unstubAllGlobals() restores the original matchMedia (or its absence)
  // cleanly — keeping suite isolation strong.
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: enabled && query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    })),
  );
}

describe('useEChartsRenderer reduced-motion resize', () => {
  /**
   * Renders the hook into a wrapper that pumps the callback ref into a
   * real (jsdom) div so the init effect fires.
   */
  function renderWithContainer(reducedMotion: boolean): void {
    setReducedMotion(reducedMotion);
    renderHook(() => {
      const renderer = useEChartsRenderer({
        option: { series: [] },
        respectReducedMotion: true,
      });
      // Bind the ref to a fresh div so init can run.
      const div = document.createElement('div');
      (renderer.containerRef as React.MutableRefObject<HTMLDivElement | null>).current = div;
      return renderer;
    });
  }

  it('passes duration 200 when reduced motion is OFF', () => {
    renderWithContainer(false);
    // Trigger the ResizeObserver callback to simulate a container resize.
    act(() => {
      resizeObserverCallbacks.forEach((cb) => cb());
    });
    const last = resizeCalls.at(-1);
    expect(last?.animation?.duration).toBe(200);
  });

  it('passes duration 0 when reduced motion is ON', () => {
    renderWithContainer(true);
    act(() => {
      resizeObserverCallbacks.forEach((cb) => cb());
    });
    const last = resizeCalls.at(-1);
    expect(last?.animation?.duration).toBe(0);
  });

  it('passes duration 200 when reduced motion is ON but respectReducedMotion is false', () => {
    // Codex 019defa5 PR3b PARTIAL: lock the escape hatch — consumers can
    // opt out of reduced-motion respect (`respectReducedMotion: false`)
    // and keep the 200ms resize animation even when the OS asks for
    // reduced motion. Validates the second branch of the resize callback.
    setReducedMotion(true);
    renderHook(() => {
      const renderer = useEChartsRenderer({
        option: { series: [] },
        respectReducedMotion: false,
      });
      const div = document.createElement('div');
      (renderer.containerRef as React.MutableRefObject<HTMLDivElement | null>).current = div;
      return renderer;
    });
    act(() => {
      resizeObserverCallbacks.forEach((cb) => cb());
    });
    const last = resizeCalls.at(-1);
    expect(last?.animation?.duration).toBe(200);
  });
});
