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

  it('enterImpersonationOrchestration surfaces VALIDATION_ERROR fieldErrors as the localized message (BUG #3)', async () => {
    // Codex 019e1e0f BUG #3: Spring's MethodArgumentNotValidException
    // returns a 400 with body shape
    //   { error: "VALIDATION_ERROR",
    //     message: "Validation failed",
    //     fieldErrors: [{field, message}] }
    // — different from the StartResponse `errorCode/errorMessage`
    // shape the BLOCKED branches return. Before this fix the FE
    // ERROR_CODE_MESSAGES lookup never matched (axios error.message
    // was just "Request failed with status code 400") and users saw
    // a generic fallback. The adapter wraps the validation body into
    // an Error whose `errorCode === 'VALIDATION_ERROR'` and whose
    // `message` is the field-level localized text.
    const initial = buildState();
    const { apiPost } = setupMocks(initial);

    const axiosErr = Object.assign(new Error('Request failed with status code 400'), {
      response: {
        status: 400,
        data: {
          error: 'VALIDATION_ERROR',
          message: 'Validation failed',
          fieldErrors: [
            { field: 'reason', message: "boyut '10' ile '500' arasında olmalı" },
          ],
        },
      },
    });
    apiPost.mockRejectedValueOnce(axiosErr);

    const orch = await import('./impersonation-orchestration');
    await expect(
      orch.enterImpersonationOrchestration({
        targetUserId: 42,
        targetEmail: 'target@example.com',
        reason: 'short',
      }),
    ).rejects.toMatchObject({
      message: "boyut '10' ile '500' arasında olmalı",
      errorCode: 'VALIDATION_ERROR',
    });
  });

  it('enterImpersonationOrchestration falls back to body.message when fieldErrors is empty/missing (BUG #3 edge case)', async () => {
    // Codex 019e1e66 REVISE-1: defensive guards must handle malformed
    // VALIDATION_ERROR shapes (missing/non-array fieldErrors, non-string
    // field message). Adapter should still surface a useful message
    // and preserve `errorCode === 'VALIDATION_ERROR'` rather than
    // crashing with TypeError or surfacing "[object Object]".
    const initial = buildState();
    const { apiPost } = setupMocks(initial);

    const axiosErr = Object.assign(new Error('Request failed with status code 400'), {
      response: {
        status: 400,
        data: {
          error: 'VALIDATION_ERROR',
          message: 'Validation failed',
          // fieldErrors missing entirely
        },
      },
    });
    apiPost.mockRejectedValueOnce(axiosErr);

    const orch = await import('./impersonation-orchestration');
    await expect(
      orch.enterImpersonationOrchestration({
        targetUserId: 42,
        targetEmail: 'target@example.com',
        reason: 'whatever',
      }),
    ).rejects.toMatchObject({
      message: 'Validation failed',
      errorCode: 'VALIDATION_ERROR',
    });
  });

  it('enterImpersonationOrchestration prefers reason field message over other fieldErrors (BUG #3 determinism)', async () => {
    // Codex 019e1e66 REVISE-1: when fieldErrors has multiple entries
    // (theoretically possible if Spring validates additional fields in
    // future) the `reason` field message is the deterministic choice
    // because it is the only validated field on the StartSessionRequest
    // contract today.
    const initial = buildState();
    const { apiPost } = setupMocks(initial);

    const axiosErr = Object.assign(new Error('Request failed with status code 400'), {
      response: {
        status: 400,
        data: {
          error: 'VALIDATION_ERROR',
          message: 'Validation failed',
          fieldErrors: [
            { field: 'targetSubject', message: 'must be a valid UUID' },
            { field: 'reason', message: "boyut '10' ile '500' arasında olmalı" },
            { field: 'targetEmail', message: 'must be a well-formed email' },
          ],
        },
      },
    });
    apiPost.mockRejectedValueOnce(axiosErr);

    const orch = await import('./impersonation-orchestration');
    await expect(
      orch.enterImpersonationOrchestration({
        targetUserId: 42,
        targetEmail: 'target@example.com',
        reason: 'short',
      }),
    ).rejects.toMatchObject({
      message: "boyut '10' ile '500' arasında olmalı",
      errorCode: 'VALIDATION_ERROR',
    });
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

  /**
   * Codex iter-7 P1-2 absorb (thread `019e109c`): if the broker
   * httpOnly cookie has been written but a downstream step (authz/me,
   * dispatch, cache reset) throws, the catch block MUST roll the
   * gateway back to the admin identity. Without rollback, the gateway
   * holds a broker cookie tied to the target user while Redux still
   * shows the admin → split-brain that defeats PR-C2's FSM-first
   * guarantee. The previous catch only cleared metadata + flipped
   * the auth phase, so the cookie leaked.
   */
  it('enterImpersonationOrchestration rolls broker cookie back to admin when authz/me throws', async () => {
    const initial = buildState();
    const { dispatched, apiPost, apiGet, apiDelete } = setupMocks(initial);

    // 1) start endpoint succeeds (broker token + sessionId returned).
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
      // 2) broker cookie write succeeds (this is where the iter-7
      // bug surfaced — without rollback the cookie leaks).
      .mockResolvedValueOnce({ data: null, status: 200 })
      // 3) admin cookie restore must run inside the catch block.
      .mockResolvedValueOnce({ data: null, status: 200 });

    // 4) /v1/authz/me throws → triggers the catch block.
    apiGet.mockRejectedValueOnce(new Error('authz/me 502 bad gateway'));
    // 5) broker cookie drop inside the catch block (best-effort).
    apiDelete.mockResolvedValueOnce({ data: null, status: 204 });

    const orch = await import('./impersonation-orchestration');
    await expect(
      orch.enterImpersonationOrchestration({
        targetUserId: 42,
        targetSubject: '11111111-1111-1111-1111-111111111111',
        targetEmail: 'target@example.com',
        reason: 'audit smoke test',
      }),
    ).rejects.toThrowError('authz/me 502 bad gateway');

    // Rollback assertion 1: broker cookie drop fired with the
    // broker token (so the gateway can match the cookie).
    expect(apiDelete).toHaveBeenCalledTimes(1);
    expect(apiDelete).toHaveBeenCalledWith(
      '/auth/cookie',
      expect.objectContaining({
        __skipAuthReadyGate: true,
        __skipRefreshOn401: true,
        headers: { Authorization: 'Bearer broker-token' },
      }),
    );

    // Rollback assertion 2: admin cookie restore fired with the
    // admin token. Order matters: this is the third POST call
    // (start, broker-cookie, admin-cookie).
    expect(apiPost).toHaveBeenCalledTimes(3);
    const adminRestoreCall = apiPost.mock.calls[2];
    expect(adminRestoreCall[0]).toBe('/auth/cookie');
    expect(adminRestoreCall[1]).toBeNull();
    expect(adminRestoreCall[2]).toEqual(
      expect.objectContaining({
        __skipAuthReadyGate: true,
        __skipRefreshOn401: true,
        headers: { Authorization: 'Bearer admin-token' },
      }),
    );

    // Rollback assertion 3: Redux is preserved as admin —
    // enterImpersonationSession MUST NOT have dispatched.
    const enterAction = dispatched.find((a) => a.type === 'auth/enterImpersonationSession');
    expect(enterAction).toBeUndefined();

    // Phase rolls back to transportReady so subsequent requests
    // resume on the admin identity.
    const phaseTransitions = dispatched.filter((a) => a.type === 'auth/setAuthPhase');
    expect(phaseTransitions[phaseTransitions.length - 1]?.payload).toBe('transportReady');
  });

  /**
   * Iter-7 P1-2 absorb continued: the rollback path itself must
   * tolerate failures (broker drop 401, admin restore 502) without
   * masking the original error. The caller's responsibility is to
   * re-throw the original {@code authz/me} failure so the UI shows
   * the right toast.
   */
  it('enterImpersonationOrchestration re-throws original error even when rollback rejects', async () => {
    const initial = buildState();
    const { dispatched, apiPost, apiGet, apiDelete } = setupMocks(initial);

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
      .mockResolvedValueOnce({ data: null, status: 200 })
      // Admin cookie restore fails too.
      .mockRejectedValueOnce(new Error('admin restore 503'));

    apiGet.mockRejectedValueOnce(new Error('authz/me original error'));
    // Broker cookie drop fails.
    apiDelete.mockRejectedValueOnce(new Error('broker drop 401'));

    const orch = await import('./impersonation-orchestration');
    // The original error MUST surface — not the broker drop or
    // admin restore failure. Rollback path swallows its own
    // exceptions (best-effort contract).
    await expect(
      orch.enterImpersonationOrchestration({
        targetUserId: 42,
        targetSubject: '11111111-1111-1111-1111-111111111111',
        reason: 'audit smoke test',
      }),
    ).rejects.toThrowError('authz/me original error');

    // Both rollback attempts ran despite their failures.
    expect(apiDelete).toHaveBeenCalledTimes(1);
    expect(apiPost).toHaveBeenCalledTimes(3);
    expect(dispatched.find((a) => a.type === 'auth/enterImpersonationSession')).toBeUndefined();
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
