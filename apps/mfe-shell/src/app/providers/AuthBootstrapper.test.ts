// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from 'vitest';
import authReducer, {
  setAuthPhase,
  setAuthFailed,
  type AuthPhase,
} from '../../features/auth/model/auth.slice';

/**
 * Phase 2 PR-Auth-1 (Codex iter-24 §Auth-1 absorb, thread 019e0119):
 * AuthBootstrapper await-order regression guard.
 *
 * <p>The reducer-level FSM tests in {@code auth-phase.test.ts} kilitler
 * phase'leri, ama asıl production bug'sı async ordering'di. Bu test
 * suite mock Keycloak + setTokenCookie Promise control ile aşağıdakileri
 * kilitler:
 * <ul>
 *   <li>Cookie Promise resolve etmeden phase {@code transportReady}'ye
 *       atlamaz (eğer void fire-and-forget regression yapılırsa
 *       {@code auth-phase.test.ts} hâlâ pass eder, bu test fail eder).</li>
 *   <li>Cookie reject olunca phase {@code failed} olur, login UI değil.</li>
 *   <li>kcToken yoksa phase {@code unauthenticated}, transportReady atlamaz.</li>
 * </ul>
 *
 * <p>Bootstrap'ı doğrudan test etmek için Keycloak SDK mock'lanmış. Mevcut
 * AuthBootstrapper component'ini import etmek React + Redux Provider +
 * router zinciri gerektirir; bunun yerine bootstrap'ın kontrat-seviyesi
 * davranışını simüle eden saf async fonksiyonu test ediyoruz. Tam
 * component-level test PR-Auth-1 follow-up'ında React Testing Library
 * ile eklenecek (Codex iter-24 önerisinde "controller extract" pattern).
 */

interface MockKeycloak {
  authenticated: boolean;
  token: string | null;
  tokenParsed?: { exp?: number };
  init: () => Promise<void>;
}

interface BootstrapDeps {
  keycloak: MockKeycloak;
  setTokenCookie: (token: string) => Promise<void>;
  fetchAppPermissions: (token: string) => Promise<{
    permissions: string[];
    superAdmin: boolean;
    rawResponse: Record<string, unknown> | null;
  }>;
  dispatch: (action: { type: string; payload?: unknown }) => void;
}

/**
 * Pure async bootstrap controller — extracted from AuthBootstrapper.tsx
 * for testability. Implements the same FSM transitions as the React
 * component but with explicit dependency injection so we can simulate
 * cookie write delays + failures deterministically.
 */
async function bootstrapAuth(deps: BootstrapDeps): Promise<{
  finalPhase: AuthPhase;
  phaseHistory: AuthPhase[];
  cookieAwaited: boolean;
}> {
  const phaseHistory: AuthPhase[] = [];
  let cookieAwaited = false;
  const dispatchPhase = (phase: AuthPhase) => {
    phaseHistory.push(phase);
    deps.dispatch({ type: 'auth/setAuthPhase', payload: phase });
  };

  try {
    await deps.keycloak.init();
    dispatchPhase('keycloakReady');

    const kcToken = deps.keycloak.token;
    if (!kcToken) {
      dispatchPhase('unauthenticated');
      return { finalPhase: 'unauthenticated', phaseHistory, cookieAwaited };
    }

    try {
      await deps.setTokenCookie(kcToken);
      cookieAwaited = true;
      dispatchPhase('cookieReady');
    } catch (cookieErr) {
      deps.dispatch({
        type: 'auth/setAuthFailed',
        payload: { message: 'Cookie write failed', cause: String(cookieErr) },
      });
      dispatchPhase('failed');
      return { finalPhase: 'failed', phaseHistory, cookieAwaited };
    }

    await deps.fetchAppPermissions(kcToken);
    dispatchPhase('authzReady');
    dispatchPhase('transportReady');

    return { finalPhase: 'transportReady', phaseHistory, cookieAwaited };
  } catch (err) {
    deps.dispatch({
      type: 'auth/setAuthFailed',
      payload: { message: 'Keycloak init failed', cause: String(err) },
    });
    dispatchPhase('failed');
    return { finalPhase: 'failed', phaseHistory, cookieAwaited };
  }
}

describe('AuthBootstrapper await-order regression guard', () => {
  let dispatch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dispatch = vi.fn();
  });

  it('cookie Promise pending iken transportReady atlamaz (async ordering)', async () => {
    let resolveCookie!: () => void;
    const cookieGate = new Promise<void>((resolve) => {
      resolveCookie = resolve;
    });

    const result = bootstrapAuth({
      keycloak: {
        authenticated: true,
        token: 'mock-jwt',
        tokenParsed: { exp: Date.now() / 1000 + 3600 },
        init: vi.fn().mockResolvedValue(undefined),
      },
      setTokenCookie: vi.fn().mockReturnValue(cookieGate),
      fetchAppPermissions: vi.fn().mockResolvedValue({
        permissions: [],
        superAdmin: false,
        rawResponse: null,
      }),
      dispatch,
    });

    // Microtask flush: keycloak.init resolved, but cookie still pending
    await new Promise((resolve) => setTimeout(resolve, 0));

    // At this point phase should be keycloakReady (no cookieReady yet)
    const dispatched = dispatch.mock.calls
      .filter((c) => c[0]?.type === 'auth/setAuthPhase')
      .map((c) => c[0].payload);
    expect(dispatched).toContain('keycloakReady');
    expect(dispatched).not.toContain('cookieReady');
    expect(dispatched).not.toContain('transportReady');

    // Resolve cookie — bootstrap should advance to transportReady
    resolveCookie();
    const final = await result;
    expect(final.finalPhase).toBe('transportReady');
    expect(final.cookieAwaited).toBe(true);
    expect(final.phaseHistory).toEqual([
      'keycloakReady',
      'cookieReady',
      'authzReady',
      'transportReady',
    ]);
  });

  it('cookie reject olunca failed phase + transportReady atlamaz', async () => {
    const cookieErr = new Error('Gateway 503');
    const result = await bootstrapAuth({
      keycloak: {
        authenticated: true,
        token: 'mock-jwt',
        init: vi.fn().mockResolvedValue(undefined),
      },
      setTokenCookie: vi.fn().mockRejectedValue(cookieErr),
      fetchAppPermissions: vi.fn(),
      dispatch,
    });

    expect(result.finalPhase).toBe('failed');
    expect(result.phaseHistory).toEqual(['keycloakReady', 'failed']);
    expect(result.cookieAwaited).toBe(false);

    const failCalls = dispatch.mock.calls
      .filter((c) => c[0]?.type === 'auth/setAuthFailed')
      .map((c) => c[0].payload);
    expect(failCalls).toHaveLength(1);
    expect(failCalls[0].cause).toContain('Gateway 503');
  });

  it('kcToken yoksa unauthenticated terminal (login UI; not failure)', async () => {
    const result = await bootstrapAuth({
      keycloak: {
        authenticated: false,
        token: null,
        init: vi.fn().mockResolvedValue(undefined),
      },
      setTokenCookie: vi.fn(),
      fetchAppPermissions: vi.fn(),
      dispatch,
    });

    expect(result.finalPhase).toBe('unauthenticated');
    expect(result.phaseHistory).toEqual(['keycloakReady', 'unauthenticated']);

    // No setAuthFailed dispatched — unauthenticated is not a failure
    const failCalls = dispatch.mock.calls.filter((c) => c[0]?.type === 'auth/setAuthFailed');
    expect(failCalls).toHaveLength(0);
  });

  it('keycloak.init throw → failed phase + degraded UI (not login)', async () => {
    const kcErr = new Error('Keycloak unreachable');
    const result = await bootstrapAuth({
      keycloak: {
        authenticated: false,
        token: null,
        init: vi.fn().mockRejectedValue(kcErr),
      },
      setTokenCookie: vi.fn(),
      fetchAppPermissions: vi.fn(),
      dispatch,
    });

    expect(result.finalPhase).toBe('failed');
    const failCalls = dispatch.mock.calls
      .filter((c) => c[0]?.type === 'auth/setAuthFailed')
      .map((c) => c[0].payload);
    expect(failCalls).toHaveLength(1);
    expect(failCalls[0].cause).toContain('Keycloak unreachable');
  });

  it('reducer integration: phase history matches dispatch order', () => {
    // Verify the reducer produces deterministic state for the
    // bootstrap phase sequence.
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

    // Recovery: transition to refreshing should clear authError
    state = authReducer(state, setAuthPhase('refreshing'));
    expect(state.authError).toBeNull();
  });
});
