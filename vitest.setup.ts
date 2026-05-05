import '@testing-library/jest-dom/vitest';

// JSDOM stubs for browser APIs not available in test environment.
//
// These are the workspace-wide common base. Package-level setup files may
// extend this set with additional stubs (e.g. canvas, Path2D) but should
// not duplicate what's already here. See the L1 boundary contract in
// docs/architecture/frontend/adr-test-environment-strategy.md — anything
// requiring real browser APIs (resolved CSS, container queries) belongs
// in *.cssom.test, not in jsdom.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => undefined;
}
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}
// ResizeObserver — used by useResponsiveChart, AG Charts, AG Grid, and
// any layout-aware primitive. Without this stub, workspace tests that
// touch chart hooks throw `ReferenceError: ResizeObserver is not defined`.
// The design-system package setup already declares this; promoting to
// the root setup so the same baseline applies to every workspace project.
if (
  typeof globalThis !== 'undefined' &&
  !(globalThis as { ResizeObserver?: unknown }).ResizeObserver
) {
  (globalThis as { ResizeObserver: unknown }).ResizeObserver = class ResizeObserverStub {
    observe(): void {
      /* noop in test */
    }
    unobserve(): void {
      /* noop in test */
    }
    disconnect(): void {
      /* noop in test */
    }
  };
}

// Canvas 2D context — jsdom returns null from `getContext('2d')` by
// default, which crashes ECharts/zrender (they assume a real canvas).
// Provide a no-op CanvasRenderingContext2D-shaped object so chart code
// can call rendering methods without throwing. Real visual fidelity
// belongs in *.cssom.test or *.visual.test, not in jsdom.
const createCanvasContextStub = () => {
  const noop = () => undefined;
  // Gradients and patterns return shape-compatible objects with
  // addColorStop/setTransform so chained renderer code does not crash.
  // These produce no real pixels.
  const gradientStub = () => ({ addColorStop: noop });
  const patternStub = () => ({ setTransform: noop });
  return {
    fillRect: noop,
    clearRect: noop,
    getImageData: () => ({ data: [] }),
    putImageData: noop,
    createImageData: () => [],
    setTransform: noop,
    drawImage: noop,
    save: noop,
    restore: noop,
    fillText: noop,
    strokeText: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    closePath: noop,
    stroke: noop,
    translate: noop,
    scale: noop,
    rotate: noop,
    arc: noop,
    fill: noop,
    measureText: () => ({ width: 0 }),
    transform: noop,
    rect: noop,
    clip: noop,
    // Gradient + pattern surface used by chart libraries
    // (ECharts/zrender, Chart.js). Without these,
    // `ctx.createLinearGradient(...).addColorStop(...)` throws an
    // unhandled error in jsdom and fails the workspace runner even
    // when no test asserts on the result.
    createLinearGradient: gradientStub,
    createRadialGradient: gradientStub,
    createConicGradient: gradientStub,
    createPattern: patternStub,
    quadraticCurveTo: noop,
    bezierCurveTo: noop,
    arcTo: noop,
    ellipse: noop,
    setLineDash: noop,
    getLineDash: () => [],
    isPointInPath: () => false,
    isPointInStroke: () => false,
  };
};
if (typeof HTMLCanvasElement !== 'undefined') {
  // Always override: jsdom's default returns null which is what crashes
  // ECharts. We do not gate on existence because the default exists but
  // is unusable. setProperty pattern matches design-system setup.
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => createCanvasContextStub(),
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
    configurable: true,
    value: () => 'data:image/png;base64,',
  });
}
