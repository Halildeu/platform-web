// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * PERF-INIT-V2 PR-B5c-lite (Codex thread 019e20fa iter-2 finding):
 * production-observer-exposure contract test.
 *
 * Three opt-in paths to expose `window.__perfSnapshot` / `window.__perfMark`:
 *   1. Runtime: `window.__PERF_OBSERVER_ENABLE = 1` before bootstrap.
 *   2. Build-time: `__PERF_OBSERVER_EXPOSE__` constant set by Vite define
 *      (from `VITE_PERF_OBSERVER_EXPOSE=1` env).
 *   3. Implicit dev: `NODE_ENV !== 'production'`.
 *
 * These tests cover the runtime-flag and dev-mode paths.  Build-time
 * `__PERF_OBSERVER_EXPOSE__` is a Vite define constant; it cannot be
 * dynamically set per test — vitest jsdom environment leaves it
 * `undefined`, which exercises the "no build-time opt-in" branch.
 * The Vite define value is verified by the build itself (no test
 * needed beyond `pnpm --filter mfe-shell build`).
 */

function setEnv(value: 'development' | 'production' | undefined): void {
  if (value === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = value;
  }
}

function clearObserverFlag(): void {
  delete (window as unknown as { __PERF_OBSERVER_ENABLE?: unknown }).__PERF_OBSERVER_ENABLE;
}

describe('shouldExposeGlobal (perf-observer exposure contract)', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    clearObserverFlag();
  });

  afterEach(() => {
    clearObserverFlag();
    setEnv(originalEnv as 'development' | 'production' | undefined);
  });

  it('returns false when window is undefined (SSR contract)', async () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error — intentionally deleting for SSR simulation
    delete globalThis.window;
    try {
      const mod = await import('../perf-observer');
      // Re-import path-dependent; just check the exported predicate
      expect(mod.shouldExposeGlobal()).toBe(false);
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it('returns true when window.__PERF_OBSERVER_ENABLE = 1', async () => {
    setEnv('production');
    (window as unknown as { __PERF_OBSERVER_ENABLE?: unknown }).__PERF_OBSERVER_ENABLE = 1;
    const { shouldExposeGlobal } = await import('../perf-observer');
    expect(shouldExposeGlobal()).toBe(true);
  });

  it('returns true when window.__PERF_OBSERVER_ENABLE = "1" (string)', async () => {
    setEnv('production');
    (window as unknown as { __PERF_OBSERVER_ENABLE?: unknown }).__PERF_OBSERVER_ENABLE = '1';
    const { shouldExposeGlobal } = await import('../perf-observer');
    expect(shouldExposeGlobal()).toBe(true);
  });

  it('returns true when window.__PERF_OBSERVER_ENABLE = true (boolean)', async () => {
    setEnv('production');
    (window as unknown as { __PERF_OBSERVER_ENABLE?: unknown }).__PERF_OBSERVER_ENABLE = true;
    const { shouldExposeGlobal } = await import('../perf-observer');
    expect(shouldExposeGlobal()).toBe(true);
  });

  it('returns false in production mode with no flag', async () => {
    setEnv('production');
    const { shouldExposeGlobal } = await import('../perf-observer');
    expect(shouldExposeGlobal()).toBe(false);
  });

  it('returns true in development mode without flag (DX default)', async () => {
    setEnv('development');
    const { shouldExposeGlobal } = await import('../perf-observer');
    expect(shouldExposeGlobal()).toBe(true);
  });

  it('returns true when NODE_ENV unset (treated as non-production)', async () => {
    setEnv(undefined);
    const { shouldExposeGlobal } = await import('../perf-observer');
    expect(shouldExposeGlobal()).toBe(true);
  });

  it('runtime flag = 0 does NOT enable in production (only truthy values)', async () => {
    setEnv('production');
    (window as unknown as { __PERF_OBSERVER_ENABLE?: unknown }).__PERF_OBSERVER_ENABLE = 0;
    const { shouldExposeGlobal } = await import('../perf-observer');
    expect(shouldExposeGlobal()).toBe(false);
  });

  it('runtime flag = "false" does NOT enable in production (strict opt-in)', async () => {
    setEnv('production');
    (window as unknown as { __PERF_OBSERVER_ENABLE?: unknown }).__PERF_OBSERVER_ENABLE = 'false';
    const { shouldExposeGlobal } = await import('../perf-observer');
    expect(shouldExposeGlobal()).toBe(false);
  });
});
