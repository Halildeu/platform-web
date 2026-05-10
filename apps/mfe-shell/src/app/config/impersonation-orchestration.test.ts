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
  const apiDelete = vi.fn();
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
    api: { post: apiPost, get: apiGet, delete: apiDelete, defaults: { baseURL: '/api' } },
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

  return {
    dispatch,
    dispatched,
    apiPost,
    apiGet,
    apiDelete,
    cancelQueries,
    clear,
    getState: () => state,
  };
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
    const { dispatched, apiDelete } = setupMocks(initial);
    apiDelete.mockResolvedValueOnce({ data: null, status: 204 });

    const orch = await import('./impersonation-orchestration');
    const result = await orch.exitImpersonationOrchestration();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('session-lost');
    // Iter-6 P1 absorb (Codex thread `019e109c`): broker cookie
    // drop fires before metadata teardown on the session-lost
    // early exit. Without it the gateway would keep an
    // impersonation cookie after exit while {@code sessionId} is
    // gone and we cannot revoke server-side.
    expect(apiDelete).toHaveBeenCalledTimes(1);
    expect(apiDelete).toHaveBeenCalledWith(
      '/auth/cookie',
      expect.objectContaining({
        __skipAuthReadyGate: true,
        __skipRefreshOn401: true,
        headers: { Authorization: 'Bearer broker-token' },
      }),
    );
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
    const { dispatched, apiDelete } = setupMocks(initial);
    apiDelete.mockResolvedValueOnce({ data: null, status: 204 });

    const orch = await import('./impersonation-orchestration');
    const result = await orch.exitImpersonationOrchestration();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('admin-expired');
    // Iter-6 P1 absorb: same broker-cookie-drop contract on the
    // admin-expired branch. Restore is impossible (admin token
    // already past expiry), but the gateway must still drop the
    // impersonation cookie so the next non-impersonation request
    // does not authenticate as the target identity.
    expect(apiDelete).toHaveBeenCalledTimes(1);
    expect(apiDelete).toHaveBeenCalledWith(
      '/auth/cookie',
      expect.objectContaining({
        __skipAuthReadyGate: true,
        __skipRefreshOn401: true,
        headers: { Authorization: 'Bearer broker-token' },
      }),
    );
    expect(dispatched.find((a) => a.type === 'auth/markImpersonationExpired')).toBeDefined();
  });

  it('dropBrokerCookieBestEffort swallows network rejections (Codex iter-6 P1)', async () => {
    const initial = buildState({ token: 'broker-token' });
    const { apiDelete } = setupMocks(initial);
    apiDelete.mockRejectedValueOnce(new Error('network down'));

    const orch = await import('./impersonation-orchestration');
    // No-throw assertion — the helper is best-effort and must not
    // bubble exceptions to caller. Without the swallow, every
    // failure path that uses the helper (logout, listener,
    // exit-orchestration session-lost / admin-expired) would crash
    // mid-cleanup.
    await expect(orch.dropBrokerCookieBestEffort('broker-token')).resolves.toBeUndefined();
    expect(apiDelete).toHaveBeenCalledTimes(1);
    expect(apiDelete).toHaveBeenCalledWith(
      '/auth/cookie',
      expect.objectContaining({
        __skipAuthReadyGate: true,
        __skipRefreshOn401: true,
        headers: { Authorization: 'Bearer broker-token' },
      }),
    );
  });

  it('dropBrokerCookieBestEffort omits Authorization header when broker token absent (logout path)', async () => {
    const initial = buildState({ token: null });
    const { apiDelete } = setupMocks(initial);
    apiDelete.mockResolvedValueOnce({ data: null, status: 204 });

    const orch = await import('./impersonation-orchestration');
    await orch.dropBrokerCookieBestEffort(null);

    // Logout calls the helper with no broker token in hand; the
    // implicit cookie credential is enough for the gateway to
    // identify and drop the impersonation cookie. The contract:
    // never attach a phantom {@code Bearer null} header.
    expect(apiDelete).toHaveBeenCalledTimes(1);
    const cfg = apiDelete.mock.calls[0]?.[1] as { headers?: Record<string, string> } | undefined;
    expect(cfg?.headers).toBeUndefined();
  });

  /**
   * Codex iter-5 P1-4 absorb (thread `019e109c`): lifecycle-expired
   * recovery path is distinct from banner-stop. Backend already
   * considers the session inactive — calling /sessions/<id>/revoke
   * would 4xx and the banner-stop revoke-first sequence would never
   * reach admin restore. recoverFromLifecycleExpiry skips revoke,
   * drops the broker cookie best-effort, writes the admin cookie,
   * fetches admin authz/me when needed, and dispatches
   * exitImpersonationSession with the cached admin payload.
   */
  it('recoverFromLifecycleExpiry skips revoke and restores admin identity', async () => {
    const initial = buildState({
      token: 'broker-token',
      impersonation: {
        status: 'expired',
        sessionId: '00000000-0000-0000-0000-000000000001',
        originalAdminToken: 'admin-token',
        originalAdminUser: { id: '1', email: 'admin@example.com' },
        originalAdminAuthzSnapshot: { permissions: ['ADMIN'], superAdmin: true },
        originalAdminExpiresAt: Date.now() + 60_000,
      },
    });
    const { dispatched, apiPost, apiDelete } = setupMocks(initial);

    apiDelete.mockResolvedValueOnce({ data: null, status: 204 });
    // Single POST = /auth/cookie admin write (revoke MUST NOT be called).
    apiPost.mockResolvedValueOnce({ data: null, status: 200 });

    const orch = await import('./impersonation-orchestration');
    const result = await orch.recoverFromLifecycleExpiry();

    expect(result.ok).toBe(true);
    // Revoke endpoint MUST NOT be called.
    const revokeCalls = apiPost.mock.calls.filter(([url]) =>
      String(url).includes('/impersonation/sessions/'),
    );
    expect(revokeCalls).toHaveLength(0);
    // Broker cookie was dropped first (best-effort).
    expect(apiDelete).toHaveBeenCalledWith(
      '/auth/cookie',
      expect.objectContaining({
        headers: { Authorization: 'Bearer broker-token' },
      }),
    );
    // Admin cookie was re-written.
    expect(apiPost).toHaveBeenCalledWith(
      '/auth/cookie',
      null,
      expect.objectContaining({
        headers: { Authorization: 'Bearer admin-token' },
      }),
    );
    const exitAction = dispatched.find((a) => a.type === 'auth/exitImpersonationSession');
    expect(exitAction).toBeDefined();
    expect((exitAction!.payload as { adminToken: string }).adminToken).toBe('admin-token');
  });

  it('recoverFromLifecycleExpiry tolerates broker cookie drop failure', async () => {
    // The broker DELETE may legitimately 4xx (already revoked); the
    // admin POST below must still run and the recovery must succeed.
    const initial = buildState({
      token: 'broker-token',
      impersonation: {
        status: 'expired',
        sessionId: '00000000-0000-0000-0000-000000000001',
        originalAdminToken: 'admin-token',
        originalAdminUser: { id: '1', email: 'admin@example.com' },
        originalAdminAuthzSnapshot: { permissions: ['ADMIN'], superAdmin: true },
        originalAdminExpiresAt: Date.now() + 60_000,
      },
    });
    const { dispatched, apiPost, apiDelete } = setupMocks(initial);

    apiDelete.mockRejectedValueOnce(new Error('broker session already revoked'));
    apiPost.mockResolvedValueOnce({ data: null, status: 200 });

    const orch = await import('./impersonation-orchestration');
    const result = await orch.recoverFromLifecycleExpiry();

    expect(result.ok).toBe(true);
    expect(dispatched.find((a) => a.type === 'auth/exitImpersonationSession')).toBeDefined();
  });

  it('recoverFromLifecycleExpiry returns admin-expired when cached admin token is stale', async () => {
    const initial = buildState({
      token: 'broker-token',
      impersonation: {
        status: 'expired',
        sessionId: '00000000-0000-0000-0000-000000000001',
        originalAdminToken: 'admin-token',
        originalAdminUser: null,
        originalAdminAuthzSnapshot: null,
        originalAdminExpiresAt: Date.now() - 1_000,
      },
    });
    const { dispatched, apiPost, apiDelete } = setupMocks(initial);
    apiDelete.mockResolvedValueOnce({ data: null, status: 204 });

    const orch = await import('./impersonation-orchestration');
    const result = await orch.recoverFromLifecycleExpiry();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('admin-expired');
    expect(apiPost).not.toHaveBeenCalled();
    // Iter-6 P1 absorb (Codex thread `019e109c`): broker cookie
    // drop now fires on the admin-expired early exit too — gateway
    // must not retain an impersonation cookie after metadata
    // teardown even when restore is impossible.
    expect(apiDelete).toHaveBeenCalledTimes(1);
    expect(apiDelete).toHaveBeenCalledWith(
      '/auth/cookie',
      expect.objectContaining({
        __skipAuthReadyGate: true,
        __skipRefreshOn401: true,
        headers: { Authorization: 'Bearer broker-token' },
      }),
    );
    expect(dispatched.find((a) => a.type === 'auth/markImpersonationExpired')).toBeDefined();
  });

  it('recoverFromLifecycleExpiry returns restore-failed when admin cookie write rejects', async () => {
    const initial = buildState({
      token: 'broker-token',
      impersonation: {
        status: 'expired',
        sessionId: '00000000-0000-0000-0000-000000000001',
        originalAdminToken: 'admin-token',
        originalAdminUser: { id: '1', email: 'admin@example.com' },
        originalAdminAuthzSnapshot: { permissions: ['ADMIN'], superAdmin: true },
        originalAdminExpiresAt: Date.now() + 60_000,
      },
    });
    const { dispatched, apiPost, apiDelete } = setupMocks(initial);

    apiDelete.mockResolvedValueOnce({ data: null, status: 204 });
    apiPost.mockRejectedValueOnce(new Error('gateway 502'));

    const orch = await import('./impersonation-orchestration');
    const result = await orch.recoverFromLifecycleExpiry();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('restore-failed');
    // No admin restore occurred.
    expect(dispatched.find((a) => a.type === 'auth/exitImpersonationSession')).toBeUndefined();
    // Phase rolls back to transportReady so subsequent requests resume.
    const phaseTransitions = dispatched.filter((a) => a.type === 'auth/setAuthPhase');
    expect(phaseTransitions[phaseTransitions.length - 1]?.payload).toBe('transportReady');
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
