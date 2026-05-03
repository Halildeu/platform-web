/**
 * jsdom polyfills required by the ECharts renderer.
 *
 * - ResizeObserver: not shipped by jsdom; chart wrappers observe their
 *   container. The polyfill is no-op (constructor + observe/unobserve/
 *   disconnect stubs); the resize callback never has to fire because
 *   chart-options-shape tests assert on the FIRST setOption() dispatch.
 * - matchMedia: not shipped by jsdom; the renderer's
 *   prefers-reduced-motion check needs it. Stub returns `matches: false`.
 *
 * Use:
 *   beforeEach(installJsdomPolyfills);
 *   afterEach(restoreJsdomPolyfills);
 */
import { vi } from 'vitest';

class ResizeObserverPolyfill {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

interface GlobalWithResizeObserver {
  ResizeObserver?: typeof ResizeObserver;
}

let originalResizeObserver: typeof ResizeObserver | undefined;
let polyfilledMatchMedia = false;

export function installJsdomPolyfills(): void {
  const g = globalThis as GlobalWithResizeObserver;
  originalResizeObserver = g.ResizeObserver;
  g.ResizeObserver = ResizeObserverPolyfill as unknown as typeof ResizeObserver;

  if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    polyfilledMatchMedia = true;
  }
}

export function restoreJsdomPolyfills(): void {
  const g = globalThis as GlobalWithResizeObserver;
  if (originalResizeObserver !== undefined) {
    g.ResizeObserver = originalResizeObserver;
  } else {
    delete g.ResizeObserver;
  }

  if (polyfilledMatchMedia && typeof window !== 'undefined') {
    // We installed a stub; remove it so test files that already had a
    // matchMedia stub upstream are not silently overridden.
    delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    polyfilledMatchMedia = false;
  }
}
