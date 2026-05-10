/**
 * Minimal jsdom polyfills for design-lab page tests. Kept tiny because
 * the showcase test stubs heavy chart wrappers — we don't need the
 * full echarts polyfill suite.
 */
export {};

if (typeof globalThis.ResizeObserver === 'undefined') {
  // @ts-expect-error — jsdom env doesn't ship ResizeObserver.
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

if (typeof globalThis.matchMedia === 'undefined') {
  // @ts-expect-error — jsdom env doesn't ship matchMedia.
  globalThis.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
