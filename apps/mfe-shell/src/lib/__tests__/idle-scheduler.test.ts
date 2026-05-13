// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scheduleOnIdle, runImmediately } from '../idle-scheduler';

describe('idle-scheduler', () => {
  let originalRic: typeof window.requestIdleCallback | undefined;
  let originalCancelRic: typeof window.cancelIdleCallback | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    originalRic = window.requestIdleCallback;
    originalCancelRic = window.cancelIdleCallback;
  });

  afterEach(() => {
    if (originalRic) {
      window.requestIdleCallback = originalRic;
    } else {
      delete (window as unknown as { requestIdleCallback?: unknown }).requestIdleCallback;
    }
    if (originalCancelRic) {
      window.cancelIdleCallback = originalCancelRic;
    } else {
      delete (window as unknown as { cancelIdleCallback?: unknown }).cancelIdleCallback;
    }
    vi.useRealTimers();
  });

  it('runs the callback via requestIdleCallback when available', () => {
    let ricCb: (() => void) | null = null;
    const ricMock = vi.fn((cb: () => void) => {
      ricCb = cb;
      return 1 as unknown as number;
    });
    window.requestIdleCallback = ricMock as unknown as typeof window.requestIdleCallback;

    const cb = vi.fn();
    scheduleOnIdle(cb);

    expect(ricMock).toHaveBeenCalledTimes(1);
    expect(cb).not.toHaveBeenCalled();

    // Simulate the browser firing the idle callback
    ricCb?.();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('falls back to the timeout if idle never fires within the budget', () => {
    let ricCb: (() => void) | null = null;
    window.requestIdleCallback = ((cb: () => void) => {
      ricCb = cb;
      return 1 as unknown as number;
    }) as unknown as typeof window.requestIdleCallback;

    const cb = vi.fn();
    scheduleOnIdle(cb, { timeout: 1000 });

    expect(cb).not.toHaveBeenCalled();

    vi.advanceTimersByTime(999);
    expect(cb).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(cb).toHaveBeenCalledTimes(1);
    // ricCb still exists, but firing it later must NOT double-invoke
    ricCb?.();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('does not double-invoke when both idle and timeout fire', () => {
    let ricCb: (() => void) | null = null;
    window.requestIdleCallback = ((cb: () => void) => {
      ricCb = cb;
      return 1 as unknown as number;
    }) as unknown as typeof window.requestIdleCallback;

    const cb = vi.fn();
    scheduleOnIdle(cb, { timeout: 500 });

    ricCb?.(); // idle wins first
    expect(cb).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(500); // timeout fires later
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('falls back to setTimeout when requestIdleCallback is not available', () => {
    delete (window as unknown as { requestIdleCallback?: unknown }).requestIdleCallback;

    const cb = vi.fn();
    scheduleOnIdle(cb, { timeout: 100 });

    expect(cb).not.toHaveBeenCalled();
    // setTimeout fallback uses Math.min(1, timeout); 1ms is enough.
    vi.advanceTimersByTime(1);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('runs the callback synchronously when window is undefined (SSR contract)', async () => {
    // Re-import after stubbing globalThis.window — vitest sandboxes a
    // fresh module graph so the runtime check sees the absent window.
    vi.resetModules();
    const originalWindow = globalThis.window;
    // @ts-expect-error — intentionally deleting for SSR simulation
    delete globalThis.window;
    try {
      const mod = await import('../idle-scheduler');
      const cb = vi.fn();
      mod.scheduleOnIdle(cb);
      expect(cb).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it('uses default timeout of 5000ms when none provided', () => {
    let ricCb: (() => void) | null = null;
    window.requestIdleCallback = ((cb: () => void) => {
      ricCb = cb;
      return 1 as unknown as number;
    }) as unknown as typeof window.requestIdleCallback;

    const cb = vi.fn();
    scheduleOnIdle(cb);

    vi.advanceTimersByTime(4999);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(cb).toHaveBeenCalledTimes(1);

    // Don't leave ricCb dangling — invoke and confirm no double-fire.
    ricCb?.();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('cancels both idle handle and timeout when cancel() called before fire', () => {
    let ricCb: (() => void) | null = null;
    const cancelRicMock = vi.fn();
    window.requestIdleCallback = ((cb: () => void) => {
      ricCb = cb;
      return 42 as unknown as number;
    }) as unknown as typeof window.requestIdleCallback;
    window.cancelIdleCallback = cancelRicMock as unknown as typeof window.cancelIdleCallback;

    const cb = vi.fn();
    const handle = scheduleOnIdle(cb, { timeout: 1000 });

    handle.cancel();
    expect(cancelRicMock).toHaveBeenCalledWith(42);

    // Even if the browser still tries to fire the idle callback later,
    // the cb must not run because the handle was cancelled.
    ricCb?.();
    expect(cb).not.toHaveBeenCalled();

    // Timeout race must also be cleared — advancing past the budget is a no-op.
    vi.advanceTimersByTime(1000);
    expect(cb).not.toHaveBeenCalled();
  });

  it('cancel() after fire is a no-op (idempotent)', () => {
    window.requestIdleCallback = ((cb: () => void) => {
      cb();
      return 1 as unknown as number;
    }) as unknown as typeof window.requestIdleCallback;

    const cb = vi.fn();
    const handle = scheduleOnIdle(cb);
    expect(cb).toHaveBeenCalledTimes(1);

    handle.cancel();
    handle.cancel();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('returns a no-op handle in SSR mode', async () => {
    vi.resetModules();
    const originalWindow = globalThis.window;
    // @ts-expect-error — intentionally deleting for SSR simulation
    delete globalThis.window;
    try {
      const mod = await import('../idle-scheduler');
      const cb = vi.fn();
      const handle = mod.scheduleOnIdle(cb);
      expect(cb).toHaveBeenCalledTimes(1);
      // cancel() exists and is a no-op (cannot un-call the sync execution)
      expect(() => handle.cancel()).not.toThrow();
      expect(cb).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.window = originalWindow;
    }
  });

  describe('runImmediately', () => {
    it('runs callback synchronously', () => {
      const cb = vi.fn();
      runImmediately(cb);
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });
});
