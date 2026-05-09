/**
 * Contract Test: Cross-Filter Store
 *
 * Validates all store actions, history stack, debounce, bookmarks.
 *
 * @see D-006 (cross-filter bus)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCrossFilterStore } from '../createCrossFilterStore';
import type { CrossFilterEntry, DrillLevel } from '../types';

function makeFilter(field: string, value: unknown, sourceId = 'chart-1'): CrossFilterEntry {
  return { sourceId, field, value, operator: 'eq', createdAt: Date.now() };
}

function makeDrill(field: string, value: string): DrillLevel {
  return { field, value, label: `${field}: ${value}` };
}

describe('createCrossFilterStore', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('initializes with empty state', () => {
    const store = createCrossFilterStore();
    const state = store.getState();
    expect(state.filters.size).toBe(0);
    expect(state.drillPath).toHaveLength(0);
    expect(state.past).toHaveLength(0);
    expect(state.future).toHaveLength(0);
    expect(state.bookmarks.size).toBe(0);
    expect(state.pendingQueryCount).toBe(0);
  });

  it('accepts initial groupId', () => {
    const store = createCrossFilterStore({ groupId: 'sales' });
    expect(store.getState().activeGroup).toBe('sales');
  });

  describe('setFilter', () => {
    it('adds filter after debounce', () => {
      const store = createCrossFilterStore({ debounceMs: 100 });
      store.getState().setFilter(makeFilter('region', 'EU'));

      // Before debounce
      expect(store.getState().filters.size).toBe(0);

      vi.advanceTimersByTime(100);
      expect(store.getState().filters.size).toBe(1);
    });

    it('coalesces rapid filter changes', () => {
      const store = createCrossFilterStore({ debounceMs: 100 });
      const { setFilter } = store.getState();

      setFilter(makeFilter('region', 'EU'));
      vi.advanceTimersByTime(50);
      setFilter(makeFilter('region', 'US'));
      vi.advanceTimersByTime(100);

      // Only last value applied
      expect(store.getState().filters.size).toBe(1);
      const entry = store.getState().filters.get('chart-1:region');
      expect(entry?.value).toBe('US');
    });

    // Regression — Codex iter-2 (thread 019e0c25) blocker: the previous
    // implementation kept a single global `debounceTimer`, so distinct
    // (chartId, field) intents within the same debounce window cancelled
    // each other and silently dropped filter writes. Per-key timers must
    // let independent intents land independently.
    it('per-key timers — distinct (chartId,field) intents do not cancel each other', () => {
      const store = createCrossFilterStore({ debounceMs: 100 });
      const { setFilter } = store.getState();

      // Same tick: 4 distinct (chartId, field) intents
      setFilter(makeFilter('region', 'EU', 'chart-A'));
      setFilter(makeFilter('category', 'X', 'chart-A'));
      setFilter(makeFilter('region', 'US', 'chart-B'));
      setFilter(makeFilter('quarter', 'Q1', 'chart-C'));

      vi.advanceTimersByTime(100);

      // All 4 intents must have been recorded — global-timer impl would
      // have dropped the first 3.
      expect(store.getState().filters.size).toBe(4);
      expect(store.getState().filters.get('chart-A:region')?.value).toBe('EU');
      expect(store.getState().filters.get('chart-A:category')?.value).toBe('X');
      expect(store.getState().filters.get('chart-B:region')?.value).toBe('US');
      expect(store.getState().filters.get('chart-C:quarter')?.value).toBe('Q1');
    });

    // Regression — same Codex iter-2 blocker, opposite axis: rapid
    // updates on the SAME (chartId, field) must still coalesce (last
    // write wins) WITHOUT affecting other keys whose timers are pending.
    it('per-key timers — same key still coalesces without disturbing other keys', () => {
      const store = createCrossFilterStore({ debounceMs: 100 });
      const { setFilter } = store.getState();

      setFilter(makeFilter('region', 'EU', 'chart-A'));
      setFilter(makeFilter('category', 'X', 'chart-A'));
      vi.advanceTimersByTime(50);
      // Coalesce on (chart-A, region); leave (chart-A, category) pending
      setFilter(makeFilter('region', 'US', 'chart-A'));
      vi.advanceTimersByTime(100);

      expect(store.getState().filters.size).toBe(2);
      expect(store.getState().filters.get('chart-A:region')?.value).toBe('US');
      expect(store.getState().filters.get('chart-A:category')?.value).toBe('X');
    });

    it('pushes to history', () => {
      const store = createCrossFilterStore({ debounceMs: 0 });
      store.getState().setFilter(makeFilter('region', 'EU'));
      vi.advanceTimersByTime(0);
      expect(store.getState().past).toHaveLength(1);
    });

    it('clears future on new filter', () => {
      const store = createCrossFilterStore({ debounceMs: 0 });
      const s = store.getState;

      s().setFilter(makeFilter('a', 1));
      vi.advanceTimersByTime(0);
      s().setFilter(makeFilter('b', 2));
      vi.advanceTimersByTime(0);
      s().undo();
      expect(s().future).toHaveLength(1);

      s().setFilter(makeFilter('c', 3));
      vi.advanceTimersByTime(0);
      expect(s().future).toHaveLength(0);
    });
  });

  describe('removeFilter', () => {
    it('removes existing filter', () => {
      const store = createCrossFilterStore({ debounceMs: 0 });
      store.getState().setFilter(makeFilter('region', 'EU'));
      vi.advanceTimersByTime(0);
      store.getState().removeFilter('chart-1:region');
      expect(store.getState().filters.size).toBe(0);
    });

    it('no-op for non-existing key', () => {
      const store = createCrossFilterStore({ debounceMs: 0 });
      store.getState().removeFilter('nonexistent');
      expect(store.getState().past).toHaveLength(0);
    });
  });

  describe('clearAllFilters', () => {
    it('clears all and pushes history', () => {
      const store = createCrossFilterStore({ debounceMs: 0 });
      store.getState().setFilter(makeFilter('a', 1));
      vi.advanceTimersByTime(0);
      store.getState().setFilter(makeFilter('b', 2, 'chart-2'));
      vi.advanceTimersByTime(0);

      store.getState().clearAllFilters();
      expect(store.getState().filters.size).toBe(0);
      expect(store.getState().past.length).toBeGreaterThan(0);
    });

    it('no-op when already empty', () => {
      const store = createCrossFilterStore({ debounceMs: 0 });
      store.getState().clearAllFilters();
      expect(store.getState().past).toHaveLength(0);
    });

    // Regression — pending debounced setFilter must NOT silently revive
    // a filter that the caller has cleared. Codex iter-2 absorb.
    it('cancels pending debounced setFilter writes', () => {
      const store = createCrossFilterStore({ debounceMs: 100 });
      store.getState().setFilter(makeFilter('region', 'EU'));
      // Don't advance — leave the timer pending
      store.getState().clearAllFilters();
      vi.advanceTimersByTime(200);
      // The pending setFilter must have been cancelled.
      expect(store.getState().filters.size).toBe(0);
    });
  });

  describe('removeFilter pending-timer cancellation', () => {
    // Regression — Codex iter-2 absorb: a removeFilter on a key whose
    // setFilter is still pending must cancel that pending write,
    // otherwise the timer fires later and silently revives the entry
    // the caller intended to drop.
    it('cancels pending setFilter for the same key', () => {
      const store = createCrossFilterStore({ debounceMs: 100 });
      const { setFilter, removeFilter } = store.getState();

      // Land an existing filter so removeFilter has something to drop
      setFilter(makeFilter('region', 'EU'));
      vi.advanceTimersByTime(100);
      expect(store.getState().filters.size).toBe(1);

      // Schedule a successor write, then remove BEFORE the timer fires
      setFilter(makeFilter('region', 'US'));
      removeFilter('chart-1:region');
      vi.advanceTimersByTime(200);

      // No revival
      expect(store.getState().filters.size).toBe(0);
    });
  });

  describe('_disposeTimers (provider unmount cleanup)', () => {
    // Regression — Codex iter-2 absorb: provider unmount must drop every
    // pending setFilter timer so a torn-down store cannot mutate state
    // after consumers have moved on.
    it('drops every pending debounced write', () => {
      const store = createCrossFilterStore({ debounceMs: 100 });
      const { setFilter, _disposeTimers } = store.getState();

      setFilter(makeFilter('region', 'EU', 'chart-A'));
      setFilter(makeFilter('category', 'X', 'chart-B'));
      setFilter(makeFilter('quarter', 'Q1', 'chart-C'));

      _disposeTimers();
      vi.advanceTimersByTime(200);

      expect(store.getState().filters.size).toBe(0);
      expect(store.getState().past).toHaveLength(0);
    });

    it('is idempotent — second call is a no-op', () => {
      const store = createCrossFilterStore({ debounceMs: 100 });
      store.getState().setFilter(makeFilter('region', 'EU'));
      store.getState()._disposeTimers();
      // Second call must not throw
      expect(() => store.getState()._disposeTimers()).not.toThrow();
    });
  });

  describe('drill-down', () => {
    it('drillDown pushes level', () => {
      const store = createCrossFilterStore();
      store.getState().drillDown(makeDrill('region', 'EU'));
      expect(store.getState().drillPath).toHaveLength(1);
      expect(store.getState().drillPath[0].value).toBe('EU');
    });

    it('drillUp pops last level', () => {
      const store = createCrossFilterStore();
      store.getState().drillDown(makeDrill('region', 'EU'));
      store.getState().drillDown(makeDrill('city', 'Berlin'));
      store.getState().drillUp();
      expect(store.getState().drillPath).toHaveLength(1);
    });

    it('drillToRoot clears path', () => {
      const store = createCrossFilterStore();
      store.getState().drillDown(makeDrill('region', 'EU'));
      store.getState().drillDown(makeDrill('city', 'Berlin'));
      store.getState().drillToRoot();
      expect(store.getState().drillPath).toHaveLength(0);
    });

    it('drillTo navigates to specific index', () => {
      const store = createCrossFilterStore();
      store.getState().drillDown(makeDrill('region', 'EU'));
      store.getState().drillDown(makeDrill('city', 'Berlin'));
      store.getState().drillDown(makeDrill('store', 'StoreA'));
      store.getState().drillTo(0);
      expect(store.getState().drillPath).toHaveLength(1);
      expect(store.getState().drillPath[0].value).toBe('EU');
    });
  });

  describe('undo/redo', () => {
    it('undo restores previous state', () => {
      const store = createCrossFilterStore({ debounceMs: 0 });
      store.getState().setFilter(makeFilter('a', 1));
      vi.advanceTimersByTime(0);
      expect(store.getState().filters.size).toBe(1);

      store.getState().undo();
      expect(store.getState().filters.size).toBe(0);
    });

    it('redo re-applies undone state', () => {
      const store = createCrossFilterStore({ debounceMs: 0 });
      store.getState().setFilter(makeFilter('a', 1));
      vi.advanceTimersByTime(0);
      store.getState().undo();
      store.getState().redo();
      expect(store.getState().filters.size).toBe(1);
    });

    it('undo no-op when past is empty', () => {
      const store = createCrossFilterStore();
      store.getState().undo();
      expect(store.getState().future).toHaveLength(0);
    });

    it('redo no-op when future is empty', () => {
      const store = createCrossFilterStore();
      store.getState().redo();
      expect(store.getState().past).toHaveLength(0);
    });
  });

  describe('history cap', () => {
    it('caps history at configured limit', () => {
      const store = createCrossFilterStore({ debounceMs: 0, historyCap: 5 });
      for (let i = 0; i < 10; i++) {
        store.getState().setFilter(makeFilter(`f${i}`, i));
        vi.advanceTimersByTime(0);
      }
      expect(store.getState().past.length).toBeLessThanOrEqual(5);
    });

    // Faz 21.8 PR-X2 — Codex iter-1+2 cap fix mutation discipline:
    //
    // Public-action chains alone cannot exceed the cap with the buggy raw
    // concat — undo/redo just shuffle snapshots and the slice happens at
    // every other action. The fix is a defence-in-depth invariant for any
    // code path that pre-loads `past` (session restore / bookmark hydrate
    // / external state replay) — exactly what a future feature might do.
    //
    // To prove the slice-cap fix kills the raw-concat mutation we seed the
    // store directly via Zustand's `setState` so `past` already sits at
    // the cap. Under the buggy behaviour, redo would push currentSnapshot
    // and overflow to length cap+1; the fix slices first.
    it('redo() respects historyCap when past is pre-seeded (mutation discipline)', () => {
      const store = createCrossFilterStore({ debounceMs: 0, historyCap: 2 });

      // Generate one valid HistoryEntry through the public API.
      store.getState().setFilter(makeFilter('seed', 1));
      vi.advanceTimersByTime(0);
      store.getState().undo();
      const seed = store.getState().future[0];
      expect(seed).toBeDefined();

      // Pre-seed past at the cap and keep future non-empty for redo.
      store.setState({ past: [seed, seed], future: [seed] });
      expect(store.getState().past).toHaveLength(2);

      // Redo with the buggy raw concat would set past=[seed, seed, currentSnapshot]
      // (length 3, > cap). The slice fix keeps it ≤ cap.
      store.getState().redo();
      expect(store.getState().past.length).toBeLessThanOrEqual(2);
    });
  });

  describe('bookmarks', () => {
    it('saves and loads bookmark', () => {
      const store = createCrossFilterStore({ debounceMs: 0 });
      store.getState().setFilter(makeFilter('region', 'EU'));
      vi.advanceTimersByTime(0);
      store.getState().saveBookmark('bm1', 'EU Filter');

      store.getState().clearAllFilters();
      expect(store.getState().filters.size).toBe(0);

      store.getState().loadBookmark('bm1');
      expect(store.getState().filters.size).toBe(1);
    });

    it('deletes bookmark', () => {
      const store = createCrossFilterStore();
      store.getState().saveBookmark('bm1', 'Test');
      expect(store.getState().bookmarks.size).toBe(1);
      store.getState().deleteBookmark('bm1');
      expect(store.getState().bookmarks.size).toBe(0);
    });

    it('load non-existing bookmark is no-op', () => {
      const store = createCrossFilterStore();
      store.getState().loadBookmark('nonexistent');
      expect(store.getState().past).toHaveLength(0);
    });
  });

  describe('pendingQueryCount', () => {
    it('increments and decrements', () => {
      const store = createCrossFilterStore();
      store.getState().incrementPendingQuery();
      store.getState().incrementPendingQuery();
      expect(store.getState().pendingQueryCount).toBe(2);
      store.getState().decrementPendingQuery();
      expect(store.getState().pendingQueryCount).toBe(1);
    });

    it('does not go below 0', () => {
      const store = createCrossFilterStore();
      store.getState().decrementPendingQuery();
      expect(store.getState().pendingQueryCount).toBe(0);
    });
  });

  describe('performance', () => {
    it('1000 rapid filter changes complete in < 100ms', () => {
      const store = createCrossFilterStore({ debounceMs: 0 });
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        store.getState().setFilter(makeFilter(`f${i % 10}`, i));
        vi.advanceTimersByTime(0);
      }
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(100);
    });
  });
});
