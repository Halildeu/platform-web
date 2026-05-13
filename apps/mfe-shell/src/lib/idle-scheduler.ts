/**
 * idle-scheduler.ts — defer non-critical work until the main thread is idle.
 *
 * PERF-INIT-V2 PR-B3a (shell-services idle deferral).
 *
 * The shell wires several Module Federation remotes via
 * `wireRemoteShellServices()` once the auth token is available.  Doing this
 * synchronously after auth competes with the critical post-login render
 * path (Redux subscribe → React re-render → route component mount).  None of
 * the remote `configureShellServices()` handlers are needed for the next
 * paint — they register background listeners (notification recipients, audit
 * live-stream re-binders, etc.) that only fire on later user actions.
 *
 * `scheduleOnIdle()` defers the work to the first idle window via
 * `requestIdleCallback` and falls back to `setTimeout` on browsers that
 * lack idle scheduling (Safari < 16.4).  A `timeout` option bounds the
 * worst case so the work always runs within a known budget — important on
 * pages that never go idle (continuous animations, polling loops).
 *
 * Design choices:
 *   - We DO NOT call `requestIdleCallback(cb, { timeout })` directly because
 *     Safari's polyfill behaviour varies; instead we race a manual setTimeout.
 *   - The cancel handle is intentionally minimal (returns void) — callers
 *     that need cancellation can compose with AbortSignal explicitly.
 *   - `runImmediately()` exists so unit tests don't need to mock timers.
 */

export interface ScheduleOnIdleOptions {
  /**
   * Maximum delay (ms) before the callback is forced to run even if the
   * browser never goes idle.  Defaults to 5000ms — generous enough that
   * `requestIdleCallback` almost always fires first, tight enough that
   * unbounded idle starvation does not silently drop the work.
   */
  timeout?: number;
}

/**
 * Cancel handle returned from `scheduleOnIdle`.  Calling `cancel()` revokes
 * BOTH the `requestIdleCallback` handle and the `setTimeout` race so neither
 * can fire later.  Idempotent — safe to call multiple times.
 *
 * Heavy / repeated callers should retain and cancel before re-scheduling to
 * avoid keeping a stale closure around for the timeout window.  Single-shot
 * callers (the canonical PR-B3a use case) can ignore the return value.
 */
export interface IdleScheduleHandle {
  cancel(): void;
}

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Schedule `cb` to run on the next idle window or after `timeout` ms,
 * whichever comes first.
 *
 * Returns an `IdleScheduleHandle` with a `cancel()` method that revokes
 * both the requestIdleCallback handle AND the setTimeout race.  Single-
 * shot callers may ignore the return value; repeated schedulers should
 * cancel the previous handle before scheduling again to keep stale
 * closures from outliving their relevance window.
 */
export function scheduleOnIdle(
  cb: () => void,
  options: ScheduleOnIdleOptions = {},
): IdleScheduleHandle {
  const timeoutMs = options.timeout ?? DEFAULT_TIMEOUT_MS;

  if (typeof window === 'undefined') {
    // SSR / Node — run synchronously so server-rendered paths still wire.
    // The intentional SSR contract: caller is responsible for ensuring `cb`
    // is safe at module-evaluation time on the server, which is already
    // the case for shell-services-wiring (it short-circuits on
    // `typeof window === 'undefined'` internally).
    cb();
    return { cancel: () => undefined };
  }

  let settled = false;
  let idleHandle: number | undefined;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  const settle = (action: 'fire' | 'cancel') => {
    if (settled) return;
    settled = true;
    if (idleHandle !== undefined && typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(idleHandle);
    }
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
    if (action === 'fire') cb();
  };

  const fire = () => settle('fire');

  const ric: typeof window.requestIdleCallback | undefined =
    typeof window.requestIdleCallback === 'function'
      ? window.requestIdleCallback.bind(window)
      : undefined;

  if (ric) {
    // Browser supports idle scheduling.  Race idle window vs. timeout
    // explicitly — Safari's implementation has historically been
    // inconsistent at honouring the native `{ timeout }` option.
    idleHandle = ric(fire);
    timeoutHandle = setTimeout(fire, timeoutMs);
  } else {
    // Fallback: schedule on the next macrotask.  We still respect the
    // `timeout` so behaviour stays predictable when callers tune it down.
    timeoutHandle = setTimeout(fire, Math.min(1, timeoutMs));
  }

  return {
    cancel: () => settle('cancel'),
  };
}

/**
 * Synchronous execution helper for unit tests.  Not exported under the
 * `scheduleOnIdle` name to keep production code paths honest.
 */
export function runImmediately(cb: () => void): void {
  cb();
}
