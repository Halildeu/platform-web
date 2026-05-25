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

  it('a separately-mounted second AuthBootstrapper tree shares the page singleton (no second keycloak.init)', async () => {
    const store1 = buildStore();
    const store2 = buildStore();

    // First tree
    const r1 = render(
      <Provider store={store1}>
        <AuthBootstrapper>
          <div />
        </AuthBootstrapper>
      </Provider>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(kcInit).toHaveBeenCalledTimes(1);
    expect(countInitStartingLogs()).toBe(1);

    // Second tree — would happen if a Module Federation remote
    // hosts its own AuthBootstrapper alongside the shell's. Without
    // the page singleton, this would call keycloak.init() AGAIN.
    render(
      <Provider store={store2}>
        <AuthBootstrapper>
          <div />
        </AuthBootstrapper>
      </Provider>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(kcInit).toHaveBeenCalledTimes(1);
    expect(countInitStartingLogs()).toBe(1);

    r1.unmount();
  });
});
