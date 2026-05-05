/**
 * useViewportWidth — shared `useSyncExternalStore` for viewport width.
 *
 * Single module-level store wired to ONE ResizeObserver on
 * `document.documentElement` plus a `window.resize` fallback (so test
 * environments and pre-emptive `dispatchEvent(new Event('resize'))`
 * shims still trigger a re-render). All consumers subscribe to the
 * same store; the observer/listener pair is started lazily on the
 * first subscriber and torn down when the last subscriber unsubscribes
 * (ref-counted).
 *
 * Why `useSyncExternalStore`:
 *   Concurrent and Suspense-safe primitive for external mutable
 *   sources. `useEffect + state` would tear during a Suspense replay;
 *   the viewport store is exactly the shape this hook was built for.
 *
 * SSR snapshot:
 *   Returns `1280` when `typeof window === 'undefined'` so server
 *   renders pick the same desktop default that AG Grid assumed
 *   pre-PR-A.
 *
 * Throttle:
 *   150ms trailing throttle — balances drag-resize render storms
 *   (sub-100ms feels janky) against post-drag latency (200ms+ feels
 *   laggy). Fixed; not exposed as an option to keep the singleton
 *   store semantics simple.
 *
 * `breakpointsOnly`:
 *   When `true`, the snapshot is bucketed into one of `0 | 640 | 768
 *   | 1024 | 1280` (the same scale as `ColumnMeta.responsive.hideBelow`).
 *   Consumers stick to the breakpoint thresholds without re-deriving;
 *   React only re-renders at bucket transitions, so drag-resize
 *   inside a single bucket is free.
 */

import { useSyncExternalStore } from 'react';

const SSR_DEFAULT_WIDTH = 1280;
const THROTTLE_MS = 150;

/**
 * Tailwind-aligned breakpoint thresholds. Mirrored from the
 * `BREAKPOINTS` map in `column-system/transformer.ts` so the bucketed
 * snapshot stays in lockstep with the responsive-hide filter.
 */
const BREAKPOINTS = [0, 640, 768, 1024, 1280] as const;

function bucketWidth(px: number): (typeof BREAKPOINTS)[number] {
  // Inclusive lower-bound walk: returns the highest threshold the
  // viewport currently exceeds.
  let bucket: (typeof BREAKPOINTS)[number] = BREAKPOINTS[0];
  for (const bp of BREAKPOINTS) {
    if (px >= bp) bucket = bp;
  }
  return bucket;
}

/* ------------------------------------------------------------------ */
/*  Module-level store                                                 */
/* ------------------------------------------------------------------ */

type Listener = () => void;

let currentWidth: number = typeof window !== 'undefined' ? window.innerWidth : SSR_DEFAULT_WIDTH;
const listeners = new Set<Listener>();
let observer: ResizeObserver | null = null;
let resizeHandler: (() => void) | null = null;
let throttleTimer: ReturnType<typeof setTimeout> | null = null;
let pendingWidth: number | null = null;

function flushPendingWidth(): void {
  throttleTimer = null;
  if (pendingWidth == null) return;
  const next = pendingWidth;
  pendingWidth = null;
  if (next === currentWidth) return;
  currentWidth = next;
  for (const listener of listeners) listener();
}

function scheduleWidth(next: number): void {
  pendingWidth = next;
  if (throttleTimer != null) return;
  throttleTimer = setTimeout(flushPendingWidth, THROTTLE_MS);
}

function startObserver(): void {
  if (typeof window === 'undefined' || observer != null) return;

  // Sync the snapshot in case the module was loaded server-side and
  // the cached `currentWidth` is the SSR default.
  currentWidth = window.innerWidth;

  // Primary: ResizeObserver on documentElement reacts to dev-tool
  // toggle, container resize, and orientation change without firing
  // for every scrollbar appearance.
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => {
      scheduleWidth(window.innerWidth);
    });
    observer.observe(document.documentElement);
  }

  // Fallback: jsdom doesn't ship ResizeObserver and many test
  // utilities call `dispatchEvent(new Event('resize'))` to simulate a
  // viewport change. Subscribe to the legacy event too so both paths
  // work.
  resizeHandler = () => {
    scheduleWidth(window.innerWidth);
  };
  window.addEventListener('resize', resizeHandler);
}

function stopObserver(): void {
  if (observer != null) {
    observer.disconnect();
    observer = null;
  }
  if (resizeHandler != null && typeof window !== 'undefined') {
    window.removeEventListener('resize', resizeHandler);
    resizeHandler = null;
  }
  if (throttleTimer != null) {
    clearTimeout(throttleTimer);
    throttleTimer = null;
  }
  pendingWidth = null;
}

function subscribe(listener: Listener): () => void {
  if (listeners.size === 0) startObserver();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stopObserver();
  };
}

function getRawSnapshot(): number {
  return currentWidth;
}

function getRawServerSnapshot(): number {
  return SSR_DEFAULT_WIDTH;
}

function getBucketSnapshot(): number {
  return bucketWidth(currentWidth);
}

function getBucketServerSnapshot(): number {
  return bucketWidth(SSR_DEFAULT_WIDTH);
}

/* ------------------------------------------------------------------ */
/*  Public hook                                                        */
/* ------------------------------------------------------------------ */

export interface UseViewportWidthOptions {
  /**
   * When true, return one of the responsive breakpoint thresholds
   * (`0 | 640 | 768 | 1024 | 1280`) instead of the raw pixel value.
   * Useful for re-rendering only on bucket transitions — drag-resize
   * inside a single bucket triggers no React work.
   *
   * @default false
   */
  breakpointsOnly?: boolean;
}

/**
 * Subscribe to the viewport width via a shared module-level store.
 *
 * @param options.breakpointsOnly — bucket the snapshot to the responsive
 *   breakpoint thresholds for cheaper re-renders. When set, React only
 *   re-renders subscribers when the viewport crosses a bucket boundary
 *   (the snapshot stays === between same-bucket resizes).
 */
export function useViewportWidth(options: UseViewportWidthOptions = {}): number {
  const breakpointsOnly = options.breakpointsOnly === true;
  // Pick the right snapshot pair so the value React sees from
  // `getSnapshot` is already bucketed when requested. If we bucketed
  // outside `useSyncExternalStore`, React would still re-render on
  // every raw-px change and only collapse via the parent memo.
  return useSyncExternalStore(
    subscribe,
    breakpointsOnly ? getBucketSnapshot : getRawSnapshot,
    breakpointsOnly ? getBucketServerSnapshot : getRawServerSnapshot,
  );
}

/* ------------------------------------------------------------------ */
/*  Test helpers (NOT exported via the public barrel)                  */
/* ------------------------------------------------------------------ */

/**
 * Reset the module-level store. Test-only — used between specs that
 * want a clean observer / listener / throttle state.
 */
export function __resetViewportWidthStore(): void {
  stopObserver();
  listeners.clear();
  currentWidth = typeof window !== 'undefined' ? window.innerWidth : SSR_DEFAULT_WIDTH;
}

/**
 * Force an immediate snapshot read + dispatch, bypassing the throttle.
 * Test-only — used to assert subscribers see the new value without
 * waiting for the 150ms timer in fake-timer specs.
 */
export function __flushViewportWidthThrottle(): void {
  if (throttleTimer != null) {
    clearTimeout(throttleTimer);
    throttleTimer = null;
  }
  flushPendingWidth();
}
