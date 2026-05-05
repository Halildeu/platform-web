import '@testing-library/jest-dom/vitest';

// Opt-in shared jsdom base for projects that explicitly reference this
// file via `setupFiles`. NOT a workspace-wide default — Vitest 4
// `test.projects` (see root vitest.config.ts) gives each project its own
// runner config; this file only runs for projects that opt in.
//
// Scope: universal jsdom no-ops that match the standard browser API
// surface every DOM-bearing test expects. Anything chart-, layout-,
// or rendering-specific belongs in the consuming package's own
// setupFiles, NOT here. See ADR-test-environment-strategy §L1 for
// the boundary contract:
//   docs/architecture/frontend/adr-test-environment-strategy.md
//
// What lives here:
//   - @testing-library/jest-dom matchers (toBeInTheDocument, etc.)
//   - Element.prototype.scrollIntoView (jsdom omits this entirely)
//   - window.matchMedia (jsdom returns undefined, breaks library code
//     that probes for prefers-color-scheme / responsive media queries)
//
// What does NOT live here (deliberately):
//   - ResizeObserver — owned by packages whose source uses it (DS,
//     x-charts, x-kanban, x-scheduler). DS already declares it in its
//     own setup; consumer-level apps add their own when needed.
//   - HTMLCanvasElement.getContext / toDataURL — chart/canvas-specific
//     stub belongs in the package whose tests render charts (DS, etc.).
//     The previous root-level canvas stub leaked package concerns into
//     the workspace common base; PR-2B-1 (Codex thread 019df881) shrinks
//     it back to true universals.
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
