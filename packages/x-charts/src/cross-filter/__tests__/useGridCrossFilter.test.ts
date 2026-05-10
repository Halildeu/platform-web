/**
 * Contract Test: useGridCrossFilter
 *
 * Tests chart-to-grid and grid-to-chart filtering via cross-filter store.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { createCrossFilterStore } from '../createCrossFilterStore';
import type { CrossFilterStoreApi } from '../createCrossFilterStore';
import { CrossFilterProvider } from '../useCrossFilterStore';
import { useGridCrossFilter, type GridApi } from '../useGridCrossFilter';

function createWrapper(store: CrossFilterStoreApi) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(CrossFilterProvider, { store }, children);
  };
}

function createMockGridApi(): GridApi {
  return {
    setFilterModel: vi.fn(),
    refreshServerSide: vi.fn(),
    getFilterModel: vi.fn(() => ({})),
  };
}

describe('useGridCrossFilter', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns empty filters initially', () => {
    const store = createCrossFilterStore({ debounceMs: 0 });
    const gridApi = createMockGridApi();

    const { result } = renderHook(() => useGridCrossFilter({ gridId: 'grid-1', gridApi }), {
      wrapper: createWrapper(store),
    });

    expect(result.current.activeFilters).toHaveLength(0);
  });

  it('applies store filters to grid when chart emits filter', () => {
    const store = createCrossFilterStore({ debounceMs: 0 });
    const gridApi = createMockGridApi();

    renderHook(() => useGridCrossFilter({ gridId: 'grid-1', gridApi }), {
      wrapper: createWrapper(store),
    });

    // Simulate chart emitting a filter
    act(() => {
      store.getState().setFilter({
        sourceId: 'chart-1',
        field: 'region',
        value: 'EU',
        operator: 'eq',
        createdAt: Date.now(),
      });
      vi.advanceTimersByTime(0);
    });

    expect(gridApi.setFilterModel).toHaveBeenCalled();
    expect(gridApi.refreshServerSide).toHaveBeenCalledWith({ purge: true });
  });

  it('pushGridFilters sends grid model to store', () => {
    const store = createCrossFilterStore({ debounceMs: 0 });
    const gridApi = createMockGridApi();
    (gridApi.getFilterModel as ReturnType<typeof vi.fn>).mockReturnValue({
      status: { filterType: 'set', values: ['active', 'pending'] },
    });

    const { result } = renderHook(() => useGridCrossFilter({ gridId: 'grid-1', gridApi }), {
      wrapper: createWrapper(store),
    });

    act(() => {
      result.current.pushGridFilters();
      vi.advanceTimersByTime(0);
    });

    expect(store.getState().filters.has('grid-1:status')).toBe(true);
  });

  it('does not sync to grid when syncStoreToGrid=false', () => {
    const store = createCrossFilterStore({ debounceMs: 0 });
    const gridApi = createMockGridApi();

    renderHook(() => useGridCrossFilter({ gridId: 'grid-1', gridApi, syncStoreToGrid: false }), {
      wrapper: createWrapper(store),
    });

    act(() => {
      store.getState().setFilter({
        sourceId: 'chart-1',
        field: 'a',
        value: 1,
        operator: 'eq',
        createdAt: Date.now(),
      });
      vi.advanceTimersByTime(0);
    });

    expect(gridApi.setFilterModel).not.toHaveBeenCalled();
  });

  it('handles null gridApi gracefully', () => {
    const store = createCrossFilterStore({ debounceMs: 0 });

    const { result } = renderHook(() => useGridCrossFilter({ gridId: 'grid-1', gridApi: null }), {
      wrapper: createWrapper(store),
    });

    // Should not throw
    act(() => {
      result.current.pushGridFilters();
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Faz 21.11 PR-A2c-adopt — brush merge + clear (Codex iter-1)     */
  /* ---------------------------------------------------------------- */

  it('brush entry merges per-column inRange onto the existing grid model and preserves non-brush columns', () => {
    const store = createCrossFilterStore({ debounceMs: 0 });
    // Existing grid model already has a status set-filter.
    const gridApi: GridApi = {
      setFilterModel: vi.fn(),
      refreshServerSide: vi.fn(),
      getFilterModel: vi.fn(() => ({
        status: { filterType: 'set', values: ['ACTIVE'] },
      })),
    };
    renderHook(() => useGridCrossFilter({ gridId: 'grid-1', gridApi }), {
      wrapper: createWrapper(store),
    });

    act(() => {
      store.getState().setFilter({
        sourceId: 'chart-1',
        field: '__brush__:salary:tenure',
        operator: 'brush',
        value: {
          selection: {
            from: { x: 30000, y: 1 },
            to: { x: 80000, y: 5 },
            indices: [12, 34],
            kind: 'rect' as const,
          },
          xColId: 'salary',
          yColId: 'tenure',
        },
        createdAt: Date.now(),
      });
      vi.advanceTimersByTime(0);
    });

    expect(gridApi.setFilterModel).toHaveBeenCalledTimes(1);
    const lastModel = (gridApi.setFilterModel as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    // Status set-filter survived AND x/y inRange added.
    expect(lastModel).toEqual({
      status: { filterType: 'set', values: ['ACTIVE'] },
      salary: { filterType: 'number', type: 'inRange', filter: 30000, filterTo: 80000 },
      tenure: { filterType: 'number', type: 'inRange', filter: 1, filterTo: 5 },
    });
    expect(gridApi.refreshServerSide).toHaveBeenCalledWith({ purge: true });
  });

  it('clearing the brush strips the previously-owned x/y columns and keeps non-brush filters', () => {
    const store = createCrossFilterStore({ debounceMs: 0 });
    let currentGridModel: Record<string, unknown> = {
      status: { filterType: 'set', values: ['ACTIVE'] },
    };
    const gridApi: GridApi = {
      setFilterModel: vi.fn((model: Record<string, unknown>) => {
        currentGridModel = model;
      }),
      refreshServerSide: vi.fn(),
      getFilterModel: vi.fn(() => currentGridModel),
    };
    renderHook(() => useGridCrossFilter({ gridId: 'grid-1', gridApi }), {
      wrapper: createWrapper(store),
    });

    // Apply brush.
    act(() => {
      store.getState().setFilter({
        sourceId: 'chart-1',
        field: '__brush__:salary:tenure',
        operator: 'brush',
        value: {
          selection: {
            from: { x: 30000, y: 1 },
            to: { x: 80000, y: 5 },
            indices: [],
            kind: 'rect' as const,
          },
          xColId: 'salary',
          yColId: 'tenure',
        },
        createdAt: Date.now(),
      });
      vi.advanceTimersByTime(0);
    });

    // Sanity: brush established.
    expect(currentGridModel).toHaveProperty('salary');
    expect(currentGridModel).toHaveProperty('tenure');

    // Now clear by removing the brush entry — store key is
    // `${sourceId}:${field}` (see `filterKey` in createCrossFilterStore).
    act(() => {
      store.getState().removeFilter('chart-1:__brush__:salary:tenure');
      vi.advanceTimersByTime(0);
    });

    expect(gridApi.setFilterModel).toHaveBeenCalledTimes(2);
    const finalModel = (gridApi.setFilterModel as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(finalModel).toEqual({
      status: { filterType: 'set', values: ['ACTIVE'] },
    });
  });

  it('ignores brush entries with malformed value shape (no xColId/yColId/selection)', () => {
    const store = createCrossFilterStore({ debounceMs: 0 });
    const gridApi: GridApi = {
      setFilterModel: vi.fn(),
      refreshServerSide: vi.fn(),
      getFilterModel: vi.fn(() => ({})),
    };
    renderHook(() => useGridCrossFilter({ gridId: 'grid-1', gridApi }), {
      wrapper: createWrapper(store),
    });

    act(() => {
      store.getState().setFilter({
        sourceId: 'chart-1',
        field: '__brush__:invalid',
        operator: 'brush',
        value: { broken: true } as unknown,
        createdAt: Date.now(),
      });
      vi.advanceTimersByTime(0);
    });

    expect(gridApi.setFilterModel).toHaveBeenCalledTimes(1);
    const lastModel = (gridApi.setFilterModel as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    // Empty model — no inRange entries leaked from the bad brush.
    expect(lastModel).toEqual({});
  });

  it('brush + non-brush coexistence: range entry from another chart survives the brush merge', () => {
    const store = createCrossFilterStore({ debounceMs: 0 });
    const gridApi: GridApi = {
      setFilterModel: vi.fn(),
      refreshServerSide: vi.fn(),
      getFilterModel: vi.fn(() => ({})),
    };
    renderHook(() => useGridCrossFilter({ gridId: 'grid-1', gridApi }), {
      wrapper: createWrapper(store),
    });

    // Two filters in the same store update batch — one brush
    // (chart-1), one range (chart-2). Both push at once.
    act(() => {
      const state = store.getState();
      state.setFilter({
        sourceId: 'chart-2',
        field: 'rating',
        operator: 'range',
        value: { min: 3, max: 5 },
        createdAt: Date.now(),
      });
      state.setFilter({
        sourceId: 'chart-1',
        field: '__brush__:salary:tenure',
        operator: 'brush',
        value: {
          selection: {
            from: { x: 30000, y: 1 },
            to: { x: 80000, y: 5 },
            indices: [],
            kind: 'rect' as const,
          },
          xColId: 'salary',
          yColId: 'tenure',
        },
        createdAt: Date.now(),
      });
      vi.advanceTimersByTime(0);
    });

    const lastModel = (gridApi.setFilterModel as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(lastModel).toEqual({
      rating: { filterType: 'number', type: 'inRange', filter: 3, filterTo: 5 },
      salary: { filterType: 'number', type: 'inRange', filter: 30000, filterTo: 80000 },
      tenure: { filterType: 'number', type: 'inRange', filter: 1, filterTo: 5 },
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Codex iter-2 — clear sequencing + stricter guard + multi-brush  */
  /* ---------------------------------------------------------------- */

  it('clearing the brush does NOT erase a sibling chart range filter on the same column (P1 sequencing)', () => {
    const store = createCrossFilterStore({ debounceMs: 0 });
    let currentGridModel: Record<string, unknown> = {
      status: { filterType: 'set', values: ['ACTIVE'] },
    };
    const gridApi: GridApi = {
      setFilterModel: vi.fn((model: Record<string, unknown>) => {
        currentGridModel = model;
      }),
      refreshServerSide: vi.fn(),
      getFilterModel: vi.fn(() => currentGridModel),
    };
    renderHook(() => useGridCrossFilter({ gridId: 'grid-1', gridApi }), {
      wrapper: createWrapper(store),
    });

    // Step 1: brush salary/tenure.
    act(() => {
      store.getState().setFilter({
        sourceId: 'chart-1',
        field: '__brush__:salary:tenure',
        operator: 'brush',
        value: {
          selection: {
            from: { x: 30000, y: 1 },
            to: { x: 80000, y: 5 },
            indices: [],
            kind: 'rect' as const,
          },
          xColId: 'salary',
          yColId: 'tenure',
        },
        createdAt: Date.now(),
      });
      vi.advanceTimersByTime(0);
    });
    expect(currentGridModel).toHaveProperty('salary');

    // Step 2: sibling chart pushes a `range` on `salary` (different
    // sourceId so it isn't dropped by the per-grid filter).
    act(() => {
      store.getState().setFilter({
        sourceId: 'chart-2',
        field: 'salary',
        operator: 'range',
        value: { min: 50000, max: 90000 },
        createdAt: Date.now(),
      });
      vi.advanceTimersByTime(0);
    });
    // Sibling range took effect — overlay overrides brush bound on
    // shared `salary` column. Brush also re-emitted on top, which
    // owns `salary` last (per applyBrushEntries iteration order).
    // The key point for THIS test is that `salary` ENTRY EXISTS;
    // the next step asserts the strip behaviour.

    // Step 3: brush cleared. Sibling `salary range` MUST survive.
    act(() => {
      store.getState().removeFilter('chart-1:__brush__:salary:tenure');
      vi.advanceTimersByTime(0);
    });
    expect(currentGridModel).toEqual({
      status: { filterType: 'set', values: ['ACTIVE'] },
      salary: { filterType: 'number', type: 'inRange', filter: 50000, filterTo: 90000 },
    });
    // Tenure stripped (was brush-only); status preserved (grid-local);
    // salary range preserved (sibling overlay).
  });

  it('rejects a malformed brush selection shape (no from/to/indices/kind) without throwing (P2 stricter guard)', () => {
    const store = createCrossFilterStore({ debounceMs: 0 });
    const gridApi: GridApi = {
      setFilterModel: vi.fn(),
      refreshServerSide: vi.fn(),
      getFilterModel: vi.fn(() => ({})),
    };
    renderHook(() => useGridCrossFilter({ gridId: 'grid-1', gridApi }), {
      wrapper: createWrapper(store),
    });

    // `selection: {}` slipped through the previous loose guard and
    // crashed the downstream `brushToAgGridFilterModel` when it
    // dereferenced `selection.from.x`.
    act(() => {
      store.getState().setFilter({
        sourceId: 'chart-1',
        field: '__brush__:salary:tenure',
        operator: 'brush',
        value: {
          xColId: 'salary',
          yColId: 'tenure',
          selection: {} as unknown,
        },
        createdAt: Date.now(),
      });
      vi.advanceTimersByTime(0);
    });

    expect(gridApi.setFilterModel).toHaveBeenCalledTimes(1);
    const lastModel = (gridApi.setFilterModel as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(lastModel).toEqual({}); // no inRange leaked
  });

  it('two brush entries on the same (xColId, yColId) pair: last writer wins (multi-brush note)', () => {
    const store = createCrossFilterStore({ debounceMs: 0 });
    const gridApi: GridApi = {
      setFilterModel: vi.fn(),
      refreshServerSide: vi.fn(),
      getFilterModel: vi.fn(() => ({})),
    };
    renderHook(() => useGridCrossFilter({ gridId: 'grid-1', gridApi }), {
      wrapper: createWrapper(store),
    });

    act(() => {
      const state = store.getState();
      state.setFilter({
        sourceId: 'chart-A',
        field: '__brush__:salary:tenure',
        operator: 'brush',
        value: {
          selection: {
            from: { x: 0, y: 0 },
            to: { x: 100, y: 1 },
            indices: [],
            kind: 'rect' as const,
          },
          xColId: 'salary',
          yColId: 'tenure',
        },
        createdAt: Date.now(),
      });
      state.setFilter({
        sourceId: 'chart-B',
        field: '__brush__:salary:tenure',
        operator: 'brush',
        value: {
          selection: {
            from: { x: 200, y: 2 },
            to: { x: 300, y: 4 },
            indices: [],
            kind: 'rect' as const,
          },
          xColId: 'salary',
          yColId: 'tenure',
        },
        createdAt: Date.now(),
      });
      vi.advanceTimersByTime(0);
    });

    const lastModel = (gridApi.setFilterModel as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    // Iteration order folds B after A — B's bounds win on the shared pair.
    expect(lastModel).toEqual({
      salary: { filterType: 'number', type: 'inRange', filter: 200, filterTo: 300 },
      tenure: { filterType: 'number', type: 'inRange', filter: 2, filterTo: 4 },
    });
  });
});
