// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAdaptiveLayout, type AdaptiveBlock } from '../useAdaptiveLayout';

/**
 * K3-1 (PHASE F5 fallback) — useAdaptiveLayout standard behavior contract.
 *
 * AI/MCP/adaptive provider yokken hook deterministik, lokal, schema-driven
 * davranır. Bu testler "AI runtime/config olmadan" davranışı kilitler.
 *
 * W1.5 fake guarantee: AI önerisi/external suggestion sayılmıyor;
 * sadece local priority sort + viewport-driven grid.
 */

const BLOCKS: AdaptiveBlock[] = [
  { key: 'a', type: 'metric', priority: 'low', span: 1 },
  { key: 'b', type: 'chart', priority: 'high', span: 2 },
  { key: 'c', type: 'list', priority: 'medium', span: 1 },
];

describe('useAdaptiveLayout — fallback (no AI runtime)', () => {
  let originalInnerWidth: number;

  beforeEach(() => {
    originalInnerWidth = window.innerWidth;
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: originalInnerWidth,
    });
  });

  it('uses window.innerWidth when viewportWidth is not provided', () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 800,
    });
    const { result } = renderHook(() => useAdaptiveLayout(BLOCKS));
    // 640 <= width < 1024 → 2 columns
    expect(result.current.gridConfig.columns).toBe(2);
  });

  it('honours explicit viewportWidth and overrides window.innerWidth', () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 1600,
    });
    const { result } = renderHook(() => useAdaptiveLayout(BLOCKS, 320));
    // width < 640 → 1 column
    expect(result.current.gridConfig.columns).toBe(1);
    expect(result.current.gridConfig.gap).toBe('0.75rem');
  });

  it('produces 4 columns at desktop breakpoint (≥1280)', () => {
    const { result } = renderHook(() => useAdaptiveLayout(BLOCKS, 1440));
    expect(result.current.gridConfig.columns).toBe(4);
  });

  it('does not mutate the input blocks array', () => {
    const inputCopy = BLOCKS.map((b) => ({ ...b }));
    renderHook(() => useAdaptiveLayout(BLOCKS, 1024));
    expect(BLOCKS).toEqual(inputCopy);
  });

  it('orders blocks by priority rank only (high → medium → low) — no AI re-ranking', () => {
    const { result } = renderHook(() => useAdaptiveLayout(BLOCKS, 1024));
    expect(result.current.orderedBlocks.map((b) => b.key)).toEqual(['b', 'c', 'a']);
  });

  it('returns a stable result for the same input (idempotent — no random AI suggestion)', () => {
    const { result, rerender } = renderHook(
      ({ width }: { width: number }) => useAdaptiveLayout(BLOCKS, width),
      { initialProps: { width: 1024 } },
    );
    const first = result.current;
    rerender({ width: 1024 });
    expect(result.current).toBe(first);
  });

  it('does not trigger any external runtime call on render (no MCP/fetch)', () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() =>
        Promise.reject(new Error('fetch should not be called in fallback mode')),
      );
    try {
      renderHook(() => useAdaptiveLayout(BLOCKS, 1024));
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
