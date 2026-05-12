import '@testing-library/jest-dom/vitest';

// jsdom does not implement ResizeObserver; x-charts wrappers depend on it
// via `useResponsiveChart`. Provide a minimal stub so contract tests that
// render real chart components (e.g. DemographicDashboard with XLineChart /
// XGaugeChart after the 2026-05-12 Phase 1 migration) can mount without
// blowing up.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  // @ts-expect-error - jsdom global augmentation, stub only.
  globalThis.ResizeObserver = ResizeObserverStub;
}
