/**
 * Cross-Filter Store — Zustand Store Factory
 *
 * Central state management for chart cross-filtering, drill-down,
 * undo/redo, bookmarks, and query tracking.
 *
 * @see decisions/topics/chart-viz-engine-selection.v1.json (D-006)
 */
import { createStore } from 'zustand/vanilla';
import type {
  CrossFilterStore,
  CrossFilterState,
  CrossFilterEntry,
  DrillLevel,
  HistoryEntry,
} from './types';

const HISTORY_CAP = 50;
const DEFAULT_DEBOUNCE_MS = 150;

function makeSnapshot(state: CrossFilterState, label: string): HistoryEntry {
  return {
    filters: new Map(state.filters),
    drillPath: [...state.drillPath],
    timestamp: Date.now(),
    label,
  };
}

function filterKey(entry: CrossFilterEntry): string {
  return `${entry.sourceId}:${entry.field}`;
}

export interface CreateCrossFilterStoreOptions {
  /** Debounce delay for filter propagation. @default 150 */
  debounceMs?: number;
  /** Max history entries. @default 50 */
  historyCap?: number;
  /** Initial cross-filter group. */
  groupId?: string;
}

export function createCrossFilterStore(options: CreateCrossFilterStoreOptions = {}) {
  const { debounceMs = DEFAULT_DEBOUNCE_MS, historyCap = HISTORY_CAP, groupId = null } = options;

  // Per-key debounce timers — keyed by `${sourceId}:${field}`. The previous
  // single global timer caused multi-field setFilter calls within the same
  // tick (or even across charts) to cancel each other, silently swallowing
  // filter intents. Codex iter-2 (thread 019e0c25) flagged this as a
  // correctness gate before BETA → stable promotion. With one timer per
  // (source, field) tuple, distinct filter intents are independent and a
  // fast successor on the SAME (source, field) still debounces the slow
  // predecessor (preserving the original behavior for that single key).
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function clearTimerFor(key: string): void {
    const t = debounceTimers.get(key);
    if (t !== undefined) {
      clearTimeout(t);
      debounceTimers.delete(key);
    }
  }

  function clearAllTimers(): void {
    for (const t of debounceTimers.values()) clearTimeout(t);
    debounceTimers.clear();
  }

  return createStore<CrossFilterStore>()((set, get) => ({
    // State
    filters: new Map(),
    activeGroup: groupId,
    drillPath: [],
    past: [],
    future: [],
    bookmarks: new Map(),
    pendingQueryCount: 0,

    // Actions
    setFilter: (entry: CrossFilterEntry) => {
      const key = filterKey(entry);
      clearTimerFor(key);
      const timer = setTimeout(() => {
        debounceTimers.delete(key);
        const state = get();
        const snapshot = makeSnapshot(state, `Filter: ${entry.field}=${String(entry.value)}`);
        const newFilters = new Map(state.filters);
        newFilters.set(key, entry);
        set({
          filters: newFilters,
          past: [...state.past.slice(-(historyCap - 1)), snapshot],
          future: [],
        });
      }, debounceMs);
      debounceTimers.set(key, timer);
    },

    removeFilter: (key: string) => {
      // Cancel any pending setFilter that's about to write this key.
      // Without this, a remove followed by a delayed pending setFilter
      // write would silently revive the filter the caller intended to
      // drop.
      clearTimerFor(key);
      const state = get();
      if (!state.filters.has(key)) return;
      const snapshot = makeSnapshot(state, `Remove filter: ${key}`);
      const newFilters = new Map(state.filters);
      newFilters.delete(key);
      set({
        filters: newFilters,
        past: [...state.past.slice(-(historyCap - 1)), snapshot],
        future: [],
      });
    },

    clearAllFilters: () => {
      // Cancel all pending setFilter writes — otherwise a clearAllFilters
      // followed by a still-pending setFilter would re-introduce filters
      // that the caller explicitly wiped.
      clearAllTimers();
      const state = get();
      if (state.filters.size === 0) return;
      const snapshot = makeSnapshot(state, 'Clear all filters');
      set({
        filters: new Map(),
        past: [...state.past.slice(-(historyCap - 1)), snapshot],
        future: [],
      });
    },

    /**
     * Internal teardown helper — drops every pending debounced setFilter
     * timer. Intended for `CrossFilterProvider` unmount cleanup and test
     * teardown so a stale store (or a torn-down provider) cannot mutate
     * state after consumers have moved on. Not part of the public
     * cross-filter contract; do not rely on it from chart adapters.
     *
     * Surfaced as a method on the returned store via the underscore prefix
     * to keep it discoverable in the API surface but visibly internal.
     */
    _disposeTimers: () => {
      clearAllTimers();
    },

    drillDown: (level: DrillLevel) => {
      const state = get();
      const snapshot = makeSnapshot(state, `Drill: ${level.field}=${String(level.value)}`);
      set({
        drillPath: [...state.drillPath, level],
        past: [...state.past.slice(-(historyCap - 1)), snapshot],
        future: [],
      });
    },

    drillUp: () => {
      const state = get();
      if (state.drillPath.length === 0) return;
      const snapshot = makeSnapshot(state, 'Drill up');
      set({
        drillPath: state.drillPath.slice(0, -1),
        past: [...state.past.slice(-(historyCap - 1)), snapshot],
        future: [],
      });
    },

    drillToRoot: () => {
      const state = get();
      if (state.drillPath.length === 0) return;
      const snapshot = makeSnapshot(state, 'Drill to root');
      set({
        drillPath: [],
        past: [...state.past.slice(-(historyCap - 1)), snapshot],
        future: [],
      });
    },

    drillTo: (index: number) => {
      const state = get();
      if (index < 0 || index >= state.drillPath.length) return;
      const snapshot = makeSnapshot(state, `Drill to level ${index}`);
      set({
        drillPath: state.drillPath.slice(0, index + 1),
        past: [...state.past.slice(-(historyCap - 1)), snapshot],
        future: [],
      });
    },

    undo: () => {
      const state = get();
      if (state.past.length === 0) return;
      const previous = state.past[state.past.length - 1];
      const currentSnapshot = makeSnapshot(state, 'Before undo');
      set({
        filters: new Map(previous.filters),
        drillPath: [...previous.drillPath],
        past: state.past.slice(0, -1),
        future: [currentSnapshot, ...state.future],
      });
    },

    redo: () => {
      const state = get();
      if (state.future.length === 0) return;
      const next = state.future[0];
      const currentSnapshot = makeSnapshot(state, 'Before redo');
      set({
        filters: new Map(next.filters),
        drillPath: [...next.drillPath],
        // Faz 21.8 PR-X2 — Codex iter-1 cap fix: every action that pushes a
        // snapshot onto `past` must respect `historyCap`. Previously this
        // path skipped the slice and allowed unbounded growth across
        // undo/redo cycles. All other store actions already use the same
        // `slice(-(historyCap-1))` pattern.
        past: [...state.past.slice(-(historyCap - 1)), currentSnapshot],
        future: state.future.slice(1),
      });
    },

    saveBookmark: (id: string, name: string) => {
      const state = get();
      const newBookmarks = new Map(state.bookmarks);
      newBookmarks.set(id, {
        name,
        state: makeSnapshot(state, `Bookmark: ${name}`),
        createdAt: Date.now(),
      });
      set({ bookmarks: newBookmarks });
    },

    loadBookmark: (id: string) => {
      const state = get();
      const bookmark = state.bookmarks.get(id);
      if (!bookmark) return;
      const snapshot = makeSnapshot(state, `Load bookmark: ${bookmark.name}`);
      set({
        filters: new Map(bookmark.state.filters),
        drillPath: [...bookmark.state.drillPath],
        past: [...state.past.slice(-(historyCap - 1)), snapshot],
        future: [],
      });
    },

    deleteBookmark: (id: string) => {
      const state = get();
      if (!state.bookmarks.has(id)) return;
      const newBookmarks = new Map(state.bookmarks);
      newBookmarks.delete(id);
      set({ bookmarks: newBookmarks });
    },

    incrementPendingQuery: () => {
      set((s) => ({ pendingQueryCount: s.pendingQueryCount + 1 }));
    },

    decrementPendingQuery: () => {
      set((s) => ({ pendingQueryCount: Math.max(0, s.pendingQueryCount - 1) }));
    },
  }));
}

export type CrossFilterStoreApi = ReturnType<typeof createCrossFilterStore>;
