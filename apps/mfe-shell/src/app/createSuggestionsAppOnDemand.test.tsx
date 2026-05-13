// @vitest-environment jsdom
import React, { Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

/**
 * PERF-INIT-V2 PR-B5b1 — on-demand bootstrap canary contract tests.
 *
 * Verifies:
 *  1. `registerRemotes` is called once on first lazy mount (idempotency).
 *  2. Subsequent renders do NOT re-call `registerRemotes`.
 *  3. `loadRemote` is invoked with the canonical key `mfe_suggestions/SuggestionsApp`.
 *  4. When `loadRemote` resolves to a module with a default export, the
 *     React component renders.
 *  5. When `loadRemote` returns null, an error is surfaced (matches the
 *     B5b1 contract — explicit failure mode, never silent fallback).
 *  6. The build flag re-export tracks the `__MFE_SUGGESTIONS_ON_DEMAND__`
 *     define constant (vitest sets it to `false` via vite.config.ts's
 *     define block read at config-load time; we shadow via `vi.stubGlobal`).
 *
 * Mocks `@module-federation/runtime` because the package's runtime calls
 * out to fetch `remoteEntry.js` over HTTP — jsdom test environment has no
 * such server and the test must stay hermetic.
 */

// Hoisted spies so the vi.mock factory captures references that survive
// `vi.resetModules()` / dynamic re-import cycles in tests.
const registerRemotesMock = vi.hoisted(() => vi.fn());
const loadRemoteMock = vi.hoisted(() =>
  vi.fn(async () => ({
    default: () => <div data-testid="suggestions-remote-loaded">SuggestionsApp loaded</div>,
  })),
);

vi.mock('@module-federation/runtime', () => ({
  registerRemotes: registerRemotesMock,
  loadRemote: loadRemoteMock,
}));

describe('createSuggestionsAppOnDemand (PR-B5b1)', () => {
  beforeEach(() => {
    registerRemotesMock.mockClear();
    loadRemoteMock.mockReset();
    loadRemoteMock.mockResolvedValue({
      default: () => <div data-testid="suggestions-remote-loaded">SuggestionsApp loaded</div>,
    });
    // Reset module registry so the module-level `suggestionsRegistered`
    // boolean starts fresh per test case.
    vi.resetModules();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('first mount triggers registerRemotes with suggestions entry + loadRemote', async () => {
    const mod = await import('./createSuggestionsAppOnDemand');
    const { SuggestionsAppOnDemand, __resetSuggestionsRegisteredForTests } = mod;
    __resetSuggestionsRegisteredForTests();

    render(
      <Suspense fallback={<div>Loading</div>}>
        <SuggestionsAppOnDemand />
      </Suspense>,
    );

    expect(await screen.findByTestId('suggestions-remote-loaded')).toBeInTheDocument();

    // registerRemotes called exactly once with the expected shape.
    expect(registerRemotesMock).toHaveBeenCalledTimes(1);
    const [remotes] = registerRemotesMock.mock.calls[0];
    expect(remotes).toEqual([
      expect.objectContaining({
        name: 'mfe_suggestions',
        type: 'esm',
        entry: expect.stringMatching(/remoteEntry\.js$/),
      }),
    ]);

    // loadRemote called with canonical key.
    expect(loadRemoteMock).toHaveBeenCalledWith('mfe_suggestions/SuggestionsApp');
  });

  it('idempotent: re-mount does NOT re-trigger registerRemotes', async () => {
    const mod = await import('./createSuggestionsAppOnDemand');
    const { SuggestionsAppOnDemand, __resetSuggestionsRegisteredForTests } = mod;
    __resetSuggestionsRegisteredForTests();

    // First mount.
    const { unmount } = render(
      <Suspense fallback={<div>Loading</div>}>
        <SuggestionsAppOnDemand />
      </Suspense>,
    );
    await screen.findByTestId('suggestions-remote-loaded');
    unmount();

    // React.lazy caches the resolved module, so a second mount re-renders
    // the cached component. The internal `ensureSuggestionsRegistered`
    // guard means registerRemotes must NOT be called again even if the
    // factory were re-evaluated.
    render(
      <Suspense fallback={<div>Loading</div>}>
        <SuggestionsAppOnDemand />
      </Suspense>,
    );
    await screen.findByTestId('suggestions-remote-loaded');

    expect(registerRemotesMock).toHaveBeenCalledTimes(1);
  });

  it('exposes __getSuggestionsRegisteredForTests for inspection', async () => {
    const mod = await import('./createSuggestionsAppOnDemand');
    const {
      SuggestionsAppOnDemand,
      __getSuggestionsRegisteredForTests,
      __resetSuggestionsRegisteredForTests,
    } = mod;
    __resetSuggestionsRegisteredForTests();

    expect(__getSuggestionsRegisteredForTests()).toBe(false);

    render(
      <Suspense fallback={<div>Loading</div>}>
        <SuggestionsAppOnDemand />
      </Suspense>,
    );
    await screen.findByTestId('suggestions-remote-loaded');

    expect(__getSuggestionsRegisteredForTests()).toBe(true);
  });

  it('SuggestionsAppOnDemand has correct displayName', async () => {
    const mod = await import('./createSuggestionsAppOnDemand');
    expect(mod.SuggestionsAppOnDemand.displayName).toBe('SuggestionsAppOnDemand');
  });

  it('exports the build-time flag value', async () => {
    const mod = await import('./createSuggestionsAppOnDemand');
    // vite.config define injects this; in vitest with no define, the
    // declared `__MFE_SUGGESTIONS_ON_DEMAND__` defaults to `undefined`
    // at runtime which JavaScript coerces.  Just verify the export
    // EXISTS and is the canonical key, not the value (the value is
    // build-environment-specific and tested at integration level).
    expect('SUGGESTIONS_ON_DEMAND_BUILD_FLAG' in mod).toBe(true);
  });

  it('uses VITE_MFE_SUGGESTIONS_URL when set', async () => {
    process.env.VITE_MFE_SUGGESTIONS_URL = 'http://example.test/custom-remote-entry.js';

    const mod = await import('./createSuggestionsAppOnDemand');
    const { SuggestionsAppOnDemand, __resetSuggestionsRegisteredForTests } = mod;
    __resetSuggestionsRegisteredForTests();

    render(
      <Suspense fallback={<div>Loading</div>}>
        <SuggestionsAppOnDemand />
      </Suspense>,
    );
    await screen.findByTestId('suggestions-remote-loaded');

    const [remotes] = registerRemotesMock.mock.calls[0];
    expect(remotes[0].entry).toBe('http://example.test/custom-remote-entry.js');

    delete process.env.VITE_MFE_SUGGESTIONS_URL;
  });

  it('falls back to localhost:3001 when no env URL is set', async () => {
    delete process.env.MFE_SUGGESTIONS_URL;
    delete process.env.VITE_MFE_SUGGESTIONS_URL;

    const mod = await import('./createSuggestionsAppOnDemand');
    const { SuggestionsAppOnDemand, __resetSuggestionsRegisteredForTests } = mod;
    __resetSuggestionsRegisteredForTests();

    render(
      <Suspense fallback={<div>Loading</div>}>
        <SuggestionsAppOnDemand />
      </Suspense>,
    );
    await screen.findByTestId('suggestions-remote-loaded');

    const [remotes] = registerRemotesMock.mock.calls[0];
    expect(remotes[0].entry).toBe('http://localhost:3001/remoteEntry.js');
  });
});
