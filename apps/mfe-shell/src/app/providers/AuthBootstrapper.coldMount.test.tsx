// @vitest-environment jsdom
/**
 * 2026-05-25 cold-mount race regression guard.
 *
 * Live testai forensics (deep-link to `/endpoint-admin/devices`):
 * `[AuthBootstrapper] init starting` log fires three times within one
 * second of a fresh page load. Same call site, same useEffect deps —
 * meaning the effect re-runs and invokes a fresh `bootstrap()` body
 * each time. Each invocation calls `keycloak.init()`; concurrent calls
 * race `dispatchSessionClear` over the first one's success → grid
 * stuck "Cihazlar yükleniyor…", permission-gated nav items hidden,
 * `state.auth.user=null` even after Keycloak init resolved.
 *
 * Fix: module-level Promise singleton in `AuthBootstrapper.tsx` makes
 * `bootstrap()` idempotent at the page lifecycle. First useEffect mount
 * creates `pageBootstrapOutcomeDeferred` and invokes `bootstrap()`.
 * Subsequent useEffect mounts (the React-side multi-fire we observed
 * live) reuse the deferred but skip the bootstrap body.
 *
 * This regression test:
 *   1. Mounts AuthBootstrapper once.
 *   2. Force-rerenders the parent so the [dispatch, shouldUseKeycloak]
 *      useEffect cleans up + re-fires. Without the fix this triggered
 *      a second `bootstrap()` invocation. With the fix it should
 *      re-attach handlers but NOT call `keycloak.init` again.
 *   3. Asserts `keycloak.init` was called exactly once.
 *   4. Asserts `console.info('[AuthBootstrapper] init starting', ...)`
 *      was logged exactly once.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { render, act } from '@testing-library/react';
import authReducer from '../../features/auth/model/auth.slice';

// Mock keycloak module BEFORE importing AuthBootstrapper.
//
// 2026-05-25 Codex iter-1 P2 absorb (cross-AI peer review, thread
// 019e6061): kcInit is configurable per-test. The default mock
// resolves immediately, but the StrictMode + concurrent-mount
// regression installs a pending Promise so that the second
// useEffect run is guaranteed to observe an in-flight bootstrap —
// the production failure mode (keycloak.init returns a long-lived
// Promise; second bootstrap interleaves before the first emits the
// token via the live getter).
type DeferredInit = { promise: Promise<void>; resolve: () => void };
const makeDeferredInit = (): DeferredInit => {
  let resolveFn: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    resolveFn = resolve;
  });
  return { promise, resolve: resolveFn };
};
const kcInit = vi.fn().mockResolvedValue(undefined);
let kcToken: string | undefined = 'mock-jwt-token';
vi.mock('../auth/keycloakClient', () => ({
  default: {
    get token() {
      return kcToken;
    },
    set token(v) {
      kcToken = v;
    },
    tokenParsed: { exp: Math.floor(Date.now() / 1000) + 3600 },
    authenticated: true,
    init: kcInit,
    onAuthSuccess: undefined,
    onTokenExpired: undefined,
  },
}));

vi.mock('../auth/auth-config', () => ({
  authConfig: {
    mode: 'keycloak',
    keycloak: {
      url: 'https://example.com',
      realm: 'r',
      clientId: 'c',
      appPublicOrigin: 'https://example.com',
      silentCheckSsoRedirectUri: 'https://example.com/silent.html',
      enableSilentCheckSso: true,
    },
    enableFakeAuth: false,
    fakeUser: {
      email: 'x@y',
      fullName: 'x',
      displayName: 'x',
      role: 'ADMIN',
      permissions: [],
    },
  },
  isPermitAllMode: () => false,
  isKeycloakMode: () => true,
}));

vi.mock('@mfe/shared-http', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: { permissions: [], allowedModules: [] } }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
  registerAuthReadyResolver: vi.fn(),
  registerRefreshHandler: vi.fn(),
}));

vi.mock('@mfe/design-system', () => ({
  registerGridVariantsTokenResolver: vi.fn(),
}));

vi.mock('./impersonation-hydrate', () => ({
  tryHydrateImpersonation: vi.fn().mockResolvedValue(false),
}));

vi.mock('../auth/auth-sync', () => ({
  subscribeAuthState: vi.fn(() => () => undefined),
  withSuppressedAuthBroadcast: (fn: () => unknown) => fn(),
}));

vi.mock('../config/auth-helpers', () => ({
  createDevAuthSession: vi.fn().mockResolvedValue({ token: 'x', expiresAt: null }),
  mapKeycloakProfile: () => ({ email: 'x@y', permissions: [] }),
}));

vi.mock('../observability/auth-contract-e2e-probe', () => ({
  isAuthContractE2eEnabled: () => false,
}));

const buildStore = () =>
  configureStore({
    reducer: { auth: authReducer },
  });

describe('AuthBootstrapper — cold-mount triple-init guard (2026-05-25)', () => {
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
  let AuthBootstrapper: typeof import('./AuthBootstrapper').AuthBootstrapper;
  let resetPageState: typeof import('./AuthBootstrapper').__resetAuthBootstrapperPageStateForTests;

  beforeEach(async () => {
    kcInit.mockClear();
    kcToken = 'mock-jwt-token';
    const mod = await import('./AuthBootstrapper');
    AuthBootstrapper = mod.AuthBootstrapper;
    resetPageState = mod.__resetAuthBootstrapperPageStateForTests;
    resetPageState();
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleInfoSpy.mockRestore();
  });

  const countInitStartingLogs = () =>
    consoleInfoSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('init starting'),
    ).length;

  it('invokes keycloak.init() exactly once on first mount + forced effect re-run', async () => {
    const store = buildStore();
    let renderCount = 0;
    const Wrapper: React.FC<{ counter: number }> = ({ counter }) => {
      renderCount = counter;
      return (
        <Provider store={store}>
          <AuthBootstrapper>
            <div data-testid={`render-${counter}`} />
          </AuthBootstrapper>
        </Provider>
      );
    };

    const { rerender } = render(<Wrapper counter={1} />);
    // Let microtasks resolve so the [dispatch, shouldUseKeycloak]
    // useEffect runs and bootstrap() kicks off.
    await act(async () => {
      await Promise.resolve();
    });
    expect(kcInit).toHaveBeenCalledTimes(1);
    expect(countInitStartingLogs()).toBe(1);

    // Force a parent re-render. AuthBootstrapper itself receives the
    // same `dispatch` and computes the same `shouldUseKeycloak` (true)
    // so its useEffect deps don't change — the effect should NOT re-run
    // under normal React semantics. The page singleton additionally
    // guards against the surprising multi-fire we observed live
    // (Module Federation eager remote init re-render trigger).
    rerender(<Wrapper counter={2} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(renderCount).toBe(2);
    expect(kcInit).toHaveBeenCalledTimes(1);
    expect(countInitStartingLogs()).toBe(1);
  });

  it('StrictMode dev-mode double-mount + pending keycloak.init: bootstrap stays single-fire and final auth state populated', async () => {
    // Codex iter-1 P2 absorb (cross-AI peer review, thread 019e6061):
    // the earlier "forced parent re-render" spec did not actually
    // exercise the multi-fire path because the useEffect deps were
    // stable. React StrictMode reliably double-fires useEffects
    // (setup → cleanup → setup) and is the canonical local proxy
    // for the live testai multi-fire. Combined with a deliberately
    // *pending* kc.init promise, the second mount enters the
    // bootstrap-in-flight window where pre-fix code would race
    // dispatchSessionClear over the first one's success.
    const deferred = makeDeferredInit();
    kcInit.mockReturnValueOnce(deferred.promise);

    const store = buildStore();
    render(
      <React.StrictMode>
        <Provider store={store}>
          <AuthBootstrapper>
            <div data-testid="strict-child" />
          </AuthBootstrapper>
        </Provider>
      </React.StrictMode>,
    );

    // Let StrictMode's double-mount complete its setup/cleanup/setup
    // pass. The first mount's bootstrap is still in-flight on the
    // pending kc.init Promise; the second mount must NOT start a
    // second keycloak.init() call.
    await act(async () => {
      await Promise.resolve();
    });
    expect(kcInit).toHaveBeenCalledTimes(1);
    expect(countInitStartingLogs()).toBe(1);

    // Now resolve kc.init. The single in-flight bootstrap should
    // continue through cookie + authz + session dispatches.
    await act(async () => {
      deferred.resolve();
      // Flush all microtasks the bootstrap chain creates.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Final auth state must be populated — pre-fix code left
    // state.auth.user=null because dispatchSessionClear from a
    // second bootstrap stomped over the first's success.
    const finalState = store.getState().auth;
    expect(finalState.phase).toBe('transportReady');
    expect(finalState.initialized).toBe(true);
    expect(finalState.token).toBeTruthy();

    // Still exactly one bootstrap fire end-to-end.
    expect(kcInit).toHaveBeenCalledTimes(1);
    expect(countInitStartingLogs()).toBe(1);
  });

  it('two AuthBootstrapper instances sharing the same Provider/store still share the page singleton', async () => {
    // Codex iter-1 P2 absorb: this replaces the misleading
    // "separately-mounted second tree with its own store" spec. The
    // page singleton lives at module level, so two AuthBootstrapper
    // instances under the SAME canonical store (the actual
    // production topology if a remote ever hosts its own
    // AuthBootstrapper in the same React root) must still result
    // in exactly one keycloak.init + one terminal dispatch chain.
    const store = buildStore();
    render(
      <Provider store={store}>
        <AuthBootstrapper>
          <div data-testid="tree-1" />
        </AuthBootstrapper>
        <AuthBootstrapper>
          <div data-testid="tree-2" />
        </AuthBootstrapper>
      </Provider>,
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(kcInit).toHaveBeenCalledTimes(1);
    expect(countInitStartingLogs()).toBe(1);

    // The single canonical store reached transportReady.
    const finalState = store.getState().auth;
    expect(finalState.phase).toBe('transportReady');
    expect(finalState.initialized).toBe(true);
    expect(finalState.token).toBeTruthy();
  });
});
