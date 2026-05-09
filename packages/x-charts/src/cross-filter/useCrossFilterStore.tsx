/**
 * useCrossFilterStore — React hook + Context provider for cross-filter store
 *
 * Allows multiple dashboard instances to have isolated stores via Context.
 * Components use `useCrossFilter(selector)` for surgical re-renders.
 */
import { createContext, useContext, useEffect, useRef } from 'react';
import { useStoreWithEqualityFn } from 'zustand/traditional';
import {
  createCrossFilterStore,
  type CrossFilterStoreApi,
  type CreateCrossFilterStoreOptions,
} from './createCrossFilterStore';
import type { CrossFilterStore } from './types';

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

const CrossFilterContext = createContext<CrossFilterStoreApi | null>(null);

export interface CrossFilterProviderProps {
  children: React.ReactNode;
  /** Options for creating a new store (ignored when `store` is provided). */
  options?: CreateCrossFilterStoreOptions;
  /** Provide an existing store instance (for testing or shared stores). */
  store?: CrossFilterStoreApi;
}

/**
 * Provides an isolated cross-filter store to a dashboard subtree.
 *
 * @example
 * ```tsx
 * <CrossFilterProvider options={{ groupId: "sales-dashboard" }}>
 *   <BarChart ... />
 *   <PieChart ... />
 * </CrossFilterProvider>
 * ```
 */
export function CrossFilterProvider({
  children,
  options,
  store: externalStore,
}: CrossFilterProviderProps) {
  const storeRef = useRef<CrossFilterStoreApi | null>(externalStore ?? null);
  // Track whether THIS provider instance owns the store (only owners are
  // allowed to dispose it; an externally-provided store outlives the
  // provider and must remain usable after unmount).
  const ownsStoreRef = useRef(externalStore == null);
  if (!storeRef.current) {
    storeRef.current = createCrossFilterStore(options);
  }

  useEffect(() => {
    return () => {
      // Drop pending debounced setFilter timers on unmount so a torn-down
      // provider can't mutate state asynchronously after consumers have
      // moved on. External stores (passed via `store` prop) are owned by
      // the caller and are NOT disposed here.
      if (ownsStoreRef.current && storeRef.current) {
        storeRef.current.getState()._disposeTimers();
      }
    };
  }, []);

  return (
    <CrossFilterContext.Provider value={storeRef.current}>{children}</CrossFilterContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

/**
 * Access the cross-filter store from within a CrossFilterProvider.
 *
 * @example
 * ```tsx
 * const filterCount = useCrossFilter((s) => s.filters.size);
 * const canUndo = useCrossFilter((s) => s.past.length > 0);
 * const setFilter = useCrossFilter((s) => s.setFilter);
 * ```
 */
export function useCrossFilter<T>(
  selector: (state: CrossFilterStore) => T,
  equalityFn?: (a: T, b: T) => boolean,
): T {
  const store = useContext(CrossFilterContext);
  if (!store) {
    throw new Error('useCrossFilter must be used within a <CrossFilterProvider>');
  }
  // zustand v5 dropped the third `equalityFn` arg from `useStore`; the
  // equality-aware helper moved to `zustand/traditional`. We call it
  // unconditionally here — branching between two different hooks based
  // on `equalityFn` would change call order across renders (rules-of-
  // hooks violation, flagged by Codex iter-1 thread 019e08a2).
  // `useStoreWithEqualityFn` accepts `undefined` comparator and falls
  // through to reference equality, matching the pre-v5 `useStore(store,
  // selector)` semantics; safe for both 1-arg and 2-arg call sites.
  return useStoreWithEqualityFn(store, selector, equalityFn);
}

/**
 * Access the raw store API (for event bridge creation or imperative access).
 */
export function useCrossFilterStoreApi(): CrossFilterStoreApi {
  const store = useContext(CrossFilterContext);
  if (!store) {
    throw new Error('useCrossFilterStoreApi must be used within a <CrossFilterProvider>');
  }
  return store;
}
