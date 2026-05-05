// @vitest-environment jsdom
/**
 * useResponsiveColumnDefs — wires `useViewportWidth({ breakpointsOnly })`
 * into `buildColDefs`. The integration test confirms the consumer
 * memo re-runs when the viewport crosses a breakpoint bucket and
 * stays stable inside a single bucket.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, renderHook, act } from '@testing-library/react';
import { useResponsiveColumnDefs } from '../useResponsiveColumnDefs';
import { __resetViewportWidthStore, __flushViewportWidthThrottle } from '../useViewportWidth';
import type { ColumnMeta } from '../column-system/types';

afterEach(() => {
  cleanup();
  __resetViewportWidthStore();
});

function setWindowWidth(px: number): void {
  Object.defineProperty(window, 'innerWidth', { value: px, configurable: true, writable: true });
  window.dispatchEvent(new Event('resize'));
}

const t = (key: string) => key;

const meta: ColumnMeta[] = [
  { field: 'name', headerNameKey: 'col.name', columnType: 'text' },
  {
    field: 'role',
    headerNameKey: 'col.role',
    columnType: 'badge',
    variantMap: {},
    responsive: { hideBelow: 'md' },
  },
  {
    field: 'date',
    headerNameKey: 'col.date',
    columnType: 'date',
    responsive: { hideBelow: 'lg' },
  },
];

describe('useResponsiveColumnDefs', () => {
  beforeEach(() => {
    setWindowWidth(1280);
  });

  it('initial render shows every column at desktop viewport', () => {
    const { result } = renderHook(() => useResponsiveColumnDefs({ columns: meta, t }));
    expect(result.current.map((c) => c.field)).toEqual(['name', 'role', 'date']);
  });

  it('mobile viewport hides hideBelow columns; first column kept implicitly', () => {
    setWindowWidth(360);
    const { result } = renderHook(() => useResponsiveColumnDefs({ columns: meta, t }));
    expect(result.current.map((c) => c.field)).toEqual(['name']);
  });

  it('viewport bucket transition triggers a fresh column derivation', () => {
    const { result } = renderHook(() => useResponsiveColumnDefs({ columns: meta, t }));
    expect(result.current.map((c) => c.field)).toEqual(['name', 'role', 'date']);

    act(() => {
      // 800 → md bucket; date column (hideBelow: lg) should drop.
      setWindowWidth(800);
      __flushViewportWidthThrottle();
    });

    expect(result.current.map((c) => c.field)).toEqual(['name', 'role']);

    act(() => {
      // 360 → smallest bucket; only the implicit-first column stays.
      setWindowWidth(360);
      __flushViewportWidthThrottle();
    });

    expect(result.current.map((c) => c.field)).toEqual(['name']);
  });

  it('memo identity is stable within a bucket', () => {
    // Start in the [1024, 1280) bucket so the first resize lands in
    // the same bucket and we measure intra-bucket stability cleanly.
    setWindowWidth(1100);
    let renderCount = 0;
    const { result } = renderHook(() => {
      renderCount++;
      return useResponsiveColumnDefs({ columns: meta, t });
    });
    const firstResult = result.current;
    const initial = renderCount;

    act(() => {
      // 1100 → 1200 are both inside the [1024, 1280) bucket → no
      // bucket transition, no re-derivation.
      setWindowWidth(1200);
      __flushViewportWidthThrottle();
      setWindowWidth(1100);
      __flushViewportWidthThrottle();
    });

    expect(renderCount).toBe(initial);
    expect(result.current).toBe(firstResult);
  });
});
