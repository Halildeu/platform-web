// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from 'vitest';
import authReducer, { setAuthPhase, setAuthFailed } from '../../features/auth/model/auth.slice';
import {
  bootstrapAuthController,
  type BootstrapDeps,
  type BootstrapInitOptions,
} from './auth-bootstrap-controller';

/**
 * Phase 2 PR-Auth-1 (Codex iter-24/25 §Auth-1 absorb, thread 019e0119):
 * AuthBootstrapper await-order regression guard.
 *
 * <p>Codex iter-25 absorb: tests now exercise the production
 * {@link bootstrapAuthController} (extracted from AuthBootstrapper.tsx)
 * directly. Earlier iter-24 implementation duplicated the bootstrap
 * function inside the test file — that pattern would not catch a
 * regression where someone re-introduces {@code void setTokenCookie()}
 * in the production component.
 *
 * <p>The reducer-level FSM tests in {@code auth-phase.test.ts} kilitler
 * phase'leri, ama asıl production bug'sı async ordering'di. Bu test
 * suite mock Keycloak + setTokenCookie Promise control ile aşağıdakileri
 * kilitler:
 * <ul>
 *   <li>Cookie Promise resolve etmeden phase {@code transportReady}'ye
 *       atlamaz (regression: void fire-and-forget yapılırsa
 *       {@code auth-phase.test.ts} hâlâ pass eder, bu test fail eder).</li>
 *   <li>Cookie reject olunca phase {@code failed} olur, login UI değil.</li>
 *   <li>kcToken yoksa phase {@code unauthenticated}, transportReady atlamaz.</li>
 * </ul>
 */

const baseInitOptions: BootstrapInitOptions = {
  pkceMethod: 'S256',
  checkLoginIframe: false,
};

const buildDeps = (overrides: Partial<BootstrapDeps>): BootstrapDeps => ({
  keycloak: {
    authenticated: true,
    token: 'mock-jwt',
    tokenParsed: { exp: Date.now() / 1000 + 3600 },
    init: vi.fn().mockResolvedValue(undefined),
  },
  initOptions: baseInitOptions,
  setTokenCookie: vi.fn().mockResolvedValue(undefined),
  fetchAppPermissions: vi.fn().mockResolvedValue({
    permissions: [],
    superAdmin: false,
    rawResponse: null,
  }),
  mapProfile: vi.fn().mockReturnValue({ email: 'test@example.com' }),
  dispatchPhase: vi.fn(),
  dispatchFailed: vi.fn(),
  dispatchSession: vi.fn(),
  isMounted: () => true,
  ...overrides,
});

describe('bootstrapAuthController — production controller import test', () => {
  let dispatchPhase: ReturnType<typeof vi.fn>;
  let dispatchFailed: ReturnType<typeof vi.fn>;
  let dispatchSession: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dispatchPhase = vi.fn();
    dispatchFailed = vi.fn();
    dispatchSession = vi.fn();
  });

  it('cookie Promise pending iken transportReady atlamaz (async ordering kanıt)', async () => {
    let resolveCookie!: () => void;
    const cookieGate = new Promise<void>((resolve) => {
      resolveCookie = resolve;
    });

    const controllerPromise = bootstrapAuthController(
      buildDeps({
        setTokenCookie: vi.fn().mockReturnValue(cookieGate),
        dispatchPhase,
        dispatchFailed,
        dispatchSession,
      }),
    );

    // Microtask flush: keycloak.init resolved, but cookie still pending
    await new Promise((resolve) => setTimeout(resolve, 0));

    const dispatched = dispatchPhase.mock.calls.map((c) => c[0]);
    expect(dispatched).toContain('keycloakReady');
    expect(dispatched).not.toContain('cookieReady');
    expect(dispatched).not.toContain('transportReady');

    // Resolve cookie — controller should advance to transportReady
    resolveCookie();
    const result = await controllerPromise;

    expect(result.finalPhase).toBe('transportReady');
    expect(result.cookieAwaited).toBe(true);
    expect(dispatchPhase.mock.calls.map((c) => c[0])).toEqual([
      'keycloakReady',
      'cookieReady',
      'authzReady',
      'transportReady',
    ]);
  });

  it('cookie reject olunca failed phase + transportReady atlamaz', async () => {
    const cookieErr = new Error('Gateway 503');
    const result = await bootstrapAuthController(
      buildDeps({
        setTokenCookie: vi.fn().mockRejectedValue(cookieErr),
        dispatchPhase,
        dispatchFailed,
        dispatchSession,
      }),
    );

    expect(result.finalPhase).toBe('failed');
    expect(result.cookieAwaited).toBe(false);
    expect(dispatchPhase.mock.calls.map((c) => c[0])).toEqual(['keycloakReady']);
    expect(dispatchFailed).toHaveBeenCalledTimes(1);
    expect(dispatchFailed.mock.calls[0][0].cause).toContain('Gateway 503');
  });

  it('kcToken yoksa unauthenticated terminal (login UI; not failure)', async () => {
    const result = await bootstrapAuthController(
      buildDeps({
        keycloak: {
          authenticated: false,
          token: null,
          init: vi.fn().mockResolvedValue(undefined),
        },
        dispatchPhase,
        dispatchFailed,
        dispatchSession,
      }),
    );

    expect(result.finalPhase).toBe('unauthenticated');
    expect(dispatchPhase.mock.calls.map((c) => c[0])).toEqual(['keycloakReady', 'unauthenticated']);
    expect(dispatchFailed).not.toHaveBeenCalled();
  });

  it('keycloak.init throw → failed phase + degraded UI (not login)', async () => {
    const kcErr = new Error('Keycloak unreachable');
    const result = await bootstrapAuthController(
      buildDeps({
        keycloak: {
          authenticated: false,
          token: null,
          init: vi.fn().mockRejectedValue(kcErr),
        },
        dispatchPhase,
        dispatchFailed,
        dispatchSession,
      }),
    );

    expect(result.finalPhase).toBe('failed');
    expect(dispatchFailed).toHaveBeenCalledTimes(1);
    expect(dispatchFailed.mock.calls[0][0].cause).toContain('Keycloak unreachable');
  });

  it('isMounted false → bootstrap aborts before dispatching transportReady', async () => {
    let mounted = true;
    let resolveCookie!: () => void;
    const cookieGate = new Promise<void>((resolve) => {
      resolveCookie = resolve;
    });

    const controllerPromise = bootstrapAuthController(
      buildDeps({
        setTokenCookie: vi.fn().mockReturnValue(cookieGate),
        isMounted: () => mounted,
        dispatchPhase,
        dispatchFailed,
        dispatchSession,
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    mounted = false; // unmount during cookie wait
    resolveCookie();
    const result = await controllerPromise;

    expect(result.finalPhase).toBe('unauthenticated');
    expect(dispatchPhase.mock.calls.map((c) => c[0])).toEqual(['keycloakReady']);
    // No cookieReady/transportReady dispatched after unmount
  });

  it('reducer integration: phase history matches dispatch order', () => {
    let state = authReducer(undefined, { type: '@@INIT' });
    expect(state.phase).toBe('initializing');
    expect(state.initialized).toBe(false);

    state = authReducer(state, setAuthPhase('keycloakReady'));
    expect(state.initialized).toBe(false);

    state = authReducer(state, setAuthPhase('cookieReady'));
    expect(state.initialized).toBe(false);

    state = authReducer(state, setAuthPhase('authzReady'));
    expect(state.initialized).toBe(false);

    state = authReducer(state, setAuthPhase('transportReady'));
    expect(state.initialized).toBe(true);
    expect(state.transportReadyAt).not.toBeNull();
  });

  it('failed phase preserves authError context across reducer transitions', () => {
    let state = authReducer(undefined, setAuthFailed({ message: 'Cookie 503' }));
    expect(state.phase).toBe('failed');
    expect(state.authError?.message).toBe('Cookie 503');

    state = authReducer(state, setAuthPhase('refreshing'));
    expect(state.authError).toBeNull();
  });
});
