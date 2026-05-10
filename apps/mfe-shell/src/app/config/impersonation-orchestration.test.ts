// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from 'vitest';

/**
 * User Impersonation v1 PR-C2 (Codex AGREE thread `019e109c` iter-3 +
 * iter-4): orchestration kilitler. Codex iter-3 invariant: revoke-first;
 * revoke fail edince hiçbir state mutasyonu olmaz, banner retry
 * seçeneği gösterir. Codex iter-2 invariant: queryClient.clear()
 * dispatch'ten ÖNCE çalışır (identity switch).
 */

interface FakeAuthState {
  token: string | null;
  user: unknown;
  expiresAt: number | null;
  authzSnapshot: Record<string, unknown> | null;
  authEpoch: number;
  phase: string;
  impersonation: {
    status: 'inactive' | 'active' | 'expired';
    sessionId: string | null;
    originalAdminToken: string | null;
    originalAdminUser: unknown;
    originalAdminAuthzSnapshot: Record<string, unknown> | null;
    originalAdminExpiresAt: number | null;
  };
}

const buildState = (overrides: Partial<FakeAuthState> = {}): FakeAuthState => ({
  token: 'admin-token',
  user: { id: '1', email: 'admin@example.com', role: 'ADMIN', permissions: ['ADMIN'] },
  expiresAt: Date.now() + 60_000,
  authzSnapshot: { permissions: ['ADMIN'], superAdmin: true },
  authEpoch: 0,
  phase: 'transportReady',
  impersonation: {
    status: 'inactive',
    sessionId: null,
    originalAdminToken: null,
    originalAdminUser: null,
    originalAdminAuthzSnapshot: null,
    originalAdminExpiresAt: null,
  },
  ...overrides,
});

const setupMocks = (initialAuth: FakeAuthState) => {
  let state = { auth: initialAuth };
  const dispatched: { type: string; payload?: unknown }[] = [];
  const dispatch = vi.fn((action: { type: string; payload?: unknown }) => {
    dispatched.push(action);
    if (action.type === 'auth/setAuthPhase') {
      state = { auth: { ...state.auth, phase: action.payload as string } };
    }
    if (action.type === 'auth/exitImpersonationSession') {
      const payload = action.payload as {
        adminToken: string;
        adminUser: unknown;
        adminAuthzSnapshot: Record<string, unknown> | null;
        adminExpiresAt: number | null;
      };
      state = {
        auth: {
          ...state.auth,
          token: payload.adminToken,
          user: payload.adminUser,
          authzSnapshot: payload.adminAuthzSnapshot,
          expiresAt: payload.adminExpiresAt,
          impersonation: {
            status: 'inactive',
            sessionId: null,
            originalAdminToken: null,
            originalAdminUser: null,
            originalAdminAuthzSnapshot: null,
            originalAdminExpiresAt: null,
          },
        },
      };
    }
    if (action.type === 'auth/enterImpersonationSession') {
      const payload = action.payload as {
        sessionId: string;
        exchangedToken: string;
        targetUser: unknown;
        targetAuthzSnapshot: Record<string, unknown> | null;
        originalAdminToken: string;
        originalAdminUser: unknown;
        originalAdminAuthzSnapshot: Record<string, unknown> | null;
        originalAdminExpiresAt: number | null;
      };
      state = {
        auth: {
          ...state.auth,
          token: payload.exchangedToken,
          user: payload.targetUser,
          authzSnapshot: payload.targetAuthzSnapshot,
          impersonation: {
            status: 'active',
            sessionId: payload.sessionId,
            originalAdminToken: payload.originalAdminToken,
            originalAdminUser: payload.originalAdminUser,
            originalAdminAuthzSnapshot: payload.originalAdminAuthzSnapshot,
            originalAdminExpiresAt: payload.originalAdminExpiresAt,
          },
        },
      };
    }
    return action;
  });
  const apiPost = vi.fn();
  const apiGet = vi.fn();
  const cancelQueries = vi.fn(async () => undefined);
  const clear = vi.fn();

  vi.doMock('../store/store', () => ({
    store: {
      getState: () => state,
      dispatch,
      subscribe: vi.fn(() => () => undefined),
    },
  }));
  vi.doMock('@mfe/shared-http', () => ({
    api: { post: apiPost, get: apiGet, delete: vi.fn(), defaults: { baseURL: '/api' } },
    registerAuthReadyResolver: vi.fn(),
    registerRefreshHandler: vi.fn(),
  }));
  vi.doMock('./query-config', () => ({
    queryClient: { cancelQueries, clear },
  }));
  vi.doMock('../config/auth-helpers', () => ({
    mapKeycloakProfile: (token: string) => ({
      id: token === 'broker-token' ? 'target-id' : 'admin-id',
      email: token === 'broker-token' ? 'target@example.com' : 'admin@example.com',
      role: 'USER',
      permissions: [],
    }),
  }));
  vi.doMock('../../features/auth/model/auth.slice', () => ({
    setAuthPhase: (phase: string) => ({ type: 'auth/setAuthPhase', payload: phase }),
    setKeycloakSession: (payload: unknown) => ({
      type: 'auth/setKeycloakSession',
      payload,
    }),
    enterImpersonationSession: (payload: unknown) => ({
      type: 'auth/enterImpersonationSession',
      payload,
    }),
    exitImpersonationSession: (payload: unknown) => ({
      type: 'auth/exitImpersonationSession',
      payload,
    }),
    markImpersonationExpired: (payload: unknown) => ({
      type: 'auth/markImpersonationExpired',
      payload,
    }),
    selectIsImpersonating: (s: { auth: FakeAuthState }) => s.auth.impersonation.status === 'active',
    selectImpersonationSessionId: (s: { auth: FakeAuthState }) => s.auth.impersonation.sessionId,
    selectImpersonationOriginalAdminToken: (s: { auth: FakeAuthState }) =>
      s.auth.impersonation.originalAdminToken,
    selectImpersonationOriginalAdminExpiresAt: (s: { auth: FakeAuthState }) =>
      s.auth.impersonation.originalAdminExpiresAt,
  }));
  vi.doMock('../layout/impersonation-storage', () => ({
    enterImpersonationMode: vi.fn(),
    exitImpersonationMode: vi.fn(),
    clearImpersonationOnFailurePath: vi.fn(),
  }));

  return { dispatch, dispatched, apiPost, apiGet, cancelQueries, clear, getState: () => state };
};

describe('impersonation-orchestration (PR-C2)', () => {
  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
  });

  it('enterImpersonationOrchestration cancels the React Query cache before swapping Redux', async () => {
    const initial = buildState();
    const { dispatched, apiPost, apiGet, cancelQueries, clear } = setupMocks(initial);

    apiPost
      .mockResolvedValueOnce({
        data: {
          sessionId: '00000000-0000-0000-0000-000000000001',
          exchangedToken: 'broker-token',
          expiresAt: new Date(Date.now() + 30_000).toISOString(),
          errorCode: null,
          errorMessage: null,
        },
        status: 201,
      })
      .mockResolvedValueOnce({ data: null, status: 200 });
    apiGet.mockResolvedValueOnce({
      data: { permissions: ['USER_VIEWER'], superAdmin: false },
      status: 200,
    });

    const orch = await import('./impersonation-orchestration');
    await orch.enterImpersonationOrchestration({
      targetUserId: 42,
      targetSubject: '11111111-1111-1111-1111-111111111111',
      targetEmail: 'target@example.com',
      reason: 'audit smoke test',
    });

    expect(cancelQueries).toHaveBeenCalled();
    expect(clear).toHaveBeenCalled();
    const enterIdx = dispatched.findIndex((a) => a.type === 'auth/enterImpersonationSession');
    const transportIdx = dispatched.findLastIndex(
      (a) => a.type === 'auth/setAuthPhase' && a.payload === 'transportReady',
    );
    expect(enterIdx).toBeGreaterThanOrEqual(0);
    expect(transportIdx).toBeGreaterThan(enterIdx);
  });

  it('exitImpersonationOrchestration leaves Redux untouched on revoke failure (Codex iter-3)', async () => {
    const initial = buildState({
      token: 'broker-token',
      authEpoch: 1,
      impersonation: {
        status: 'active',
        sessionId: '00000000-0000-0000-0000-000000000001',
        originalAdminToken: 'admin-token',
        originalAdminUser: { id: '1', email: 'admin@example.com' },
        originalAdminAuthzSnapshot: { permissions: ['ADMIN'], superAdmin: true },
        originalAdminExpiresAt: Date.now() + 60_000,
      },
    });
    const { dispatched, apiPost } = setupMocks(initial);

    apiPost.mockRejectedValueOnce(new Error('backend revoke 502 bad gateway'));

    const orch = await import('./impersonation-orchestration');
    const result = await orch.exitImpersonationOrchestration();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('revoke-failed');
    const exitAction = dispatched.find((a) => a.type === 'auth/exitImpersonationSession');
    expect(exitAction).toBeUndefined();
    const phaseTransitions = dispatched.filter((a) => a.type === 'auth/setAuthPhase');
    expect(phaseTransitions[phaseTransitions.length - 1]?.payload).toBe('transportReady');
  });

  it('exitImpersonationOrchestration returns session-lost when sessionId is missing', async () => {
    const initial = buildState({
      token: 'broker-token',
      impersonation: {
        status: 'active',
        sessionId: null,
        originalAdminToken: 'admin-token',
        originalAdminUser: null,
        originalAdminAuthzSnapshot: null,
        originalAdminExpiresAt: Date.now() + 60_000,
      },
    });
    const { dispatched } = setupMocks(initial);

    const orch = await import('./impersonation-orchestration');
    const result = await orch.exitImpersonationOrchestration();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('session-lost');
    expect(dispatched.find((a) => a.type === 'auth/markImpersonationExpired')).toBeDefined();
  });

  it('exitImpersonationOrchestration treats expired admin token as admin-expired', async () => {
    const initial = buildState({
      token: 'broker-token',
      impersonation: {
        status: 'active',
        sessionId: '00000000-0000-0000-0000-000000000001',
        originalAdminToken: 'admin-token',
        originalAdminUser: null,
        originalAdminAuthzSnapshot: null,
        originalAdminExpiresAt: Date.now() - 1_000,
      },
    });
    const { dispatched } = setupMocks(initial);

    const orch = await import('./impersonation-orchestration');
    const result = await orch.exitImpersonationOrchestration();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('admin-expired');
    expect(dispatched.find((a) => a.type === 'auth/markImpersonationExpired')).toBeDefined();
  });

  it('exitImpersonationOrchestration restores admin identity on revoke success', async () => {
    const initial = buildState({
      token: 'broker-token',
      impersonation: {
        status: 'active',
        sessionId: '00000000-0000-0000-0000-000000000001',
        originalAdminToken: 'admin-token',
        originalAdminUser: { id: '1', email: 'admin@example.com' },
        originalAdminAuthzSnapshot: { permissions: ['ADMIN'], superAdmin: true },
        originalAdminExpiresAt: Date.now() + 60_000,
      },
    });
    const { dispatched, apiPost } = setupMocks(initial);

    apiPost
      .mockResolvedValueOnce({ data: null, status: 204 })
      .mockResolvedValueOnce({ data: null, status: 200 });

    const orch = await import('./impersonation-orchestration');
    const result = await orch.exitImpersonationOrchestration();

    expect(result.ok).toBe(true);
    const exitAction = dispatched.find((a) => a.type === 'auth/exitImpersonationSession');
    expect(exitAction).toBeDefined();
    expect((exitAction!.payload as { adminToken: string }).adminToken).toBe('admin-token');
  });
});
