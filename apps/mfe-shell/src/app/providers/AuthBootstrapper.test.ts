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
    // PR #314: live getters (NOT pre-init snapshots) — keycloak-js
    // sets the token inside init() during auth-code callback flow.
    getToken: () => 'mock-jwt',
    getTokenParsed: () => ({ exp: Date.now() / 1000 + 3600 }),
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
  // 2026-05-20 hotfix: tests opt into a per-test mock via overrides when
  // they care about the stale-token clear; default is a no-op so the
  // happy-path tests keep working without restructuring.
  dispatchSessionClear: vi.fn(),
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
          getToken: () => null,
          getTokenParsed: () => undefined,
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

  it('2026-05-20 stale-token recovery: kcToken yoksa dispatchSessionClear çağrılır (BEFORE phase=unauthenticated)', async () => {
    // Regression guard for the testai stuck-UI bug: when silent-SSO
    // returns no Keycloak session, the controller must clear any stale
    // Redux token (rehydrated from localStorage at slice-init time)
    // BEFORE dispatching phase=unauthenticated. Without this, the
    // ProtectedRoute `(token && !authorizationReady)` branch returns
    // null forever and the LoginPage `(initialized && token)` Navigate
    // bounces the user back into a redirect loop. Bug repro pre-fix:
    // testai admin pages rendered empty `main` for 4+ minutes; tab
    // never reached the login form despite real auth being broken.
    const dispatchSessionClear = vi.fn();
    const result = await bootstrapAuthController(
      buildDeps({
        keycloak: {
          authenticated: false,
          getToken: () => null,
          getTokenParsed: () => undefined,
          init: vi.fn().mockResolvedValue(undefined),
        },
        dispatchPhase,
        dispatchFailed,
        dispatchSession,
        dispatchSessionClear,
      }),
    );

    expect(result.finalPhase).toBe('unauthenticated');
    // dispatchSessionClear MUST fire exactly once (no double-clear) and
    // MUST land before phase=unauthenticated so React subscribers see
    // {token: null, phase: 'unauthenticated'} together — preventing
    // the brief render where ProtectedRoute reads (truthy_token,
    // unauthenticated_phase) and stays on the stuck loading path.
    expect(dispatchSessionClear).toHaveBeenCalledTimes(1);
    const phaseDispatchOrder = dispatchPhase.mock.invocationCallOrder[1];
    const clearDispatchOrder = dispatchSessionClear.mock.invocationCallOrder[0];
    expect(clearDispatchOrder).toBeLessThan(phaseDispatchOrder);
  });

  it('2026-05-20 stale-token recovery: kcToken VAR ise dispatchSessionClear çağrılmaz (happy-path no-regression)', async () => {
    // Inverse guard: the stale-token clear must NOT fire on the
    // successful auth path. dispatchSession (with the real token)
    // remains the only state-write in the happy path.
    const dispatchSessionClear = vi.fn();
    const result = await bootstrapAuthController(
      buildDeps({
        dispatchPhase,
        dispatchFailed,
        dispatchSession,
        dispatchSessionClear,
      }),
    );

    expect(result.finalPhase).toBe('transportReady');
    expect(dispatchSessionClear).not.toHaveBeenCalled();
    expect(dispatchSession).toHaveBeenCalledTimes(1);
  });

  it('keycloak.init throw → failed phase + degraded UI (not login)', async () => {
    const kcErr = new Error('Keycloak unreachable');
    const result = await bootstrapAuthController(
      buildDeps({
        keycloak: {
          authenticated: false,
          getToken: () => null,
          getTokenParsed: () => undefined,
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

  it('PR #314: token set INSIDE keycloak.init() (live getter sees mutation)', async () => {
    // Repro of testai.acik.com regression: keycloak-js standard
    // auth-code callback flow assigns keycloak.token from inside
    // init() — the token does NOT exist on the keycloak instance
    // before init() runs. A pre-init snapshot captures null and
    // the controller dispatches 'unauthenticated' even though a
    // valid token will be set milliseconds later. Live getters fix
    // this by re-reading the value after init() resolves.
    let liveToken: string | null = null;
    const initFn = vi.fn().mockImplementation(async () => {
      // Simulate keycloak-js' internal callback exchange — the token
      // is set during init's await chain, NOT after it resolves.
      liveToken = 'mock-token-from-auth-code-callback';
    });

    const result = await bootstrapAuthController(
      buildDeps({
        keycloak: {
          authenticated: false,
          getToken: () => liveToken,
          getTokenParsed: () => (liveToken ? { exp: Date.now() / 1000 + 3600 } : undefined),
          init: initFn,
        },
        dispatchPhase,
        dispatchFailed,
        dispatchSession,
      }),
    );

    // Bootstrap MUST advance through all phases to transportReady,
    // not stop at unauthenticated. This is the regression guard.
    expect(result.finalPhase).toBe('transportReady');
    expect(dispatchPhase.mock.calls.map((c) => c[0])).toEqual([
      'keycloakReady',
      'cookieReady',
      'authzReady',
      'transportReady',
    ]);
    expect(dispatchSession).toHaveBeenCalledTimes(1);
    // Verify the dispatched session carries the live token
    expect(dispatchSession.mock.calls[0][0].token).toBe('mock-token-from-auth-code-callback');
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
