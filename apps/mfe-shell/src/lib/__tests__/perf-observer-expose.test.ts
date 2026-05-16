// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { describeNode, rectLite } from '../perf-observer';

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

/**
 * PERF-INIT-V2.1 V3-B2 PR1: CLS source attribution helpers. `describeNode` and
 * `rectLite` are pure — they flatten a layout-shift source into a JSON-safe,
 * PII-free record so CLS regressions can be diagnosed ("which element moved"),
 * not merely measured.
 */
describe('rectLite (CLS attribution rect flattening)', () => {
  it('flattens and rounds a rect', () => {
    expect(rectLite({ x: 1.4, y: 2.6, width: 100.5, height: 50.49 } as DOMRectReadOnly)).toEqual({
      x: 1,
      y: 3,
      width: 101,
      height: 50,
    });
  });

  it('returns zeroes for undefined/null', () => {
    expect(rectLite(undefined)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(rectLite(null)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

describe('describeNode (CLS source identifier)', () => {
  it('returns a sentinel for an absent node', () => {
    expect(describeNode(null)).toBe('(detached)');
    expect(describeNode(undefined)).toBe('(detached)');
  });

  it('describes a bare element by tag', () => {
    expect(describeNode(document.createElement('section'))).toBe('section');
  });

  it('includes #id, .firstClass and [data-testid]', () => {
    const el = document.createElement('div');
    el.id = 'home-shell';
    el.classList.add('layout-main', 'extra');
    el.setAttribute('data-testid', 'shell-root');
    expect(describeNode(el)).toBe('div#home-shell.layout-main[data-testid="shell-root"]');
  });

  it('prepends parent tag#id context', () => {
    const parent = document.createElement('main');
    parent.id = 'root';
    const child = document.createElement('header');
    parent.appendChild(child);
    expect(describeNode(child)).toBe('main#root > header');
  });

  it('resolves a text node to its parent element', () => {
    const parent = document.createElement('p');
    parent.id = 'msg';
    const text = document.createTextNode('hello');
    parent.appendChild(text);
    expect(describeNode(text)).toBe('p#msg');
  });
});
