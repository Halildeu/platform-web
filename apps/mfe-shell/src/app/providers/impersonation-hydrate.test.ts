// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from 'vitest';

/**
 * User Impersonation v1 PR-C2 — iter-6 Approach A absorb (Codex thread
 * `019e109c`): the 6-condition hydrate guard is now extracted to
 * {@code ./impersonation-hydrate.ts} so we can lock its happy + fail-
 * closed branches with unit tests instead of a full bootstrap mount.
 *
 * Iter-6 review explicitly required at least 1 happy hydrate + 1
 * fail-closed test; this file covers both plus extra branches for
 * the side-effect contract (broker cookie write, authz fetch,
 * dispatch sequence).
 */

const buildBrokerJwt = (overrides: Record<string, unknown> = {}): string => {
  const header = { alg: 'none', typ: 'JWT' };
  const payload = {
    azp: 'impersonation-broker',
    sid: '00000000-0000-0000-0000-000000000001',
    sub: 'target-id',
    email: 'target@example.com',
    exp: Math.floor((Date.now() + 60_000) / 1000),
    ...overrides,
  };
  const enc = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString('base64').replace(/=+$/, '');
  return `${enc(header)}.${enc(payload)}.signature`;
};

const setupMocks = () => {
  const dispatched: { type: string; payload?: unknown }[] = [];
  const dispatch = vi.fn((action: { type: string; payload?: unknown }) => {
    dispatched.push(action);
    return action;
  });
  const apiPost = vi.fn();
  const apiGet = vi.fn();
  const apiDelete = vi.fn();
  const clearImpersonationOnFailurePath = vi.fn();

  vi.doMock('@mfe/shared-http', () => ({
    api: { post: apiPost, get: apiGet, delete: apiDelete, defaults: { baseURL: '/api' } },
  }));

  vi.doMock('../layout/impersonation-storage', async () => {
    // Re-export the actual storage module since the test drives state
    // via {@code window.localStorage} directly. Only the cleanup
    // helper is mocked so the test can assert the fail-closed
    // contract without losing the read-side behaviour.
    const actual = await vi.importActual<typeof import('../layout/impersonation-storage')>(
      '../layout/impersonation-storage',
    );
    return {
      ...actual,
      clearImpersonationOnFailurePath,
    };
  });

  vi.doMock('../../features/auth/model/auth.slice', () => ({
    decodeJwtPayload: (token: string) => {
      try {
        const parts = token.split('.');
        if (parts.length < 2) return null;
        const padded = parts[1].padEnd(
          parts[1].length + ((4 - (parts[1].length % 4 || 4)) % 4),
          '=',
        );
        return JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));
      } catch {
        return null;
      }
    },
    hydrateImpersonationSession: (payload: unknown) => ({
      type: 'auth/hydrateImpersonationSession',
      payload,
    }),
    setAuthInitialized: (payload: boolean) => ({ type: 'auth/setAuthInitialized', payload }),
    setAuthPhase: (payload: string) => ({ type: 'auth/setAuthPhase', payload }),
  }));

  vi.doMock('../config/auth-helpers', () => ({
    mapKeycloakProfile: (token: string) => ({
      id: 'target-id',
      email: 'target@example.com',
      role: 'USER',
      permissions: [],
      _token: token,
    }),
  }));

  return { dispatched, dispatch, apiPost, apiGet, apiDelete, clearImpersonationOnFailurePath };
};

const seedStorage = (input: {
  mode?: string;
  sessionId?: string | null;
  exchangedToken?: string | null;
  originalAdminToken?: string | null;
  originalAdminExpiresAt?: number | null;
  expiresAt?: number | null;
  startedAt?: number | null;
}) => {
  if (input.mode !== undefined) {
    if (input.mode === null) window.localStorage.removeItem('impersonation.mode');
    else window.localStorage.setItem('impersonation.mode', input.mode);
  }
  if (input.sessionId !== undefined) {
    if (input.sessionId === null) window.localStorage.removeItem('impersonation.session_id');
    else window.localStorage.setItem('impersonation.session_id', input.sessionId);
  }
  if (input.exchangedToken !== undefined) {
    if (input.exchangedToken === null)
      window.localStorage.removeItem('impersonation.exchanged_token');
    else window.localStorage.setItem('impersonation.exchanged_token', input.exchangedToken);
  }
  if (input.originalAdminToken !== undefined) {
    if (input.originalAdminToken === null)
      window.localStorage.removeItem('impersonation.original_token');
    else window.localStorage.setItem('impersonation.original_token', input.originalAdminToken);
  }
  if (input.originalAdminExpiresAt !== undefined) {
    if (input.originalAdminExpiresAt === null)
      window.localStorage.removeItem('impersonation.original_expires_at');
    else
      window.localStorage.setItem(
        'impersonation.original_expires_at',
        String(input.originalAdminExpiresAt),
      );
  }
  if (input.expiresAt !== undefined) {
    if (input.expiresAt === null) window.localStorage.removeItem('impersonation.expires_at');
    else window.localStorage.setItem('impersonation.expires_at', String(input.expiresAt));
  }
  if (input.startedAt !== undefined) {
    if (input.startedAt === null) window.localStorage.removeItem('impersonation.started_at');
    else window.localStorage.setItem('impersonation.started_at', String(input.startedAt));
  }
};

describe('tryHydrateImpersonation (PR-C2 iter-6 Approach A)', () => {
  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
  });

  it('happy path: all 6 guards pass + side-effects + dispatch sequence', async () => {
    const sessionId = '00000000-0000-0000-0000-000000000001';
    const brokerToken = buildBrokerJwt({ sid: sessionId });
    seedStorage({
      mode: 'active',
      sessionId,
      exchangedToken: brokerToken,
      originalAdminToken: 'admin-token',
      originalAdminExpiresAt: Date.now() + 60_000,
      expiresAt: Date.now() + 30_000,
      startedAt: Date.now() - 1_000,
    });

    const { dispatched, dispatch, apiPost, apiGet, clearImpersonationOnFailurePath } = setupMocks();
    apiPost.mockResolvedValueOnce({ data: null, status: 200 });
    apiGet.mockResolvedValueOnce({
      data: { permissions: ['USER_VIEWER'], superAdmin: false },
      status: 200,
    });

    const mod = await import('./impersonation-hydrate');
    const ok = await mod.tryHydrateImpersonation(dispatch);

    expect(ok).toBe(true);
    expect(clearImpersonationOnFailurePath).not.toHaveBeenCalled();
    // Cookie write fired with the broker token before authz fetch
    expect(apiPost).toHaveBeenCalledWith(
      '/auth/cookie',
      null,
      expect.objectContaining({
        __skipAuthReadyGate: true,
        __skipRefreshOn401: true,
        headers: { Authorization: `Bearer ${brokerToken}` },
      }),
    );
    expect(apiGet).toHaveBeenCalledWith(
      '/v1/authz/me',
      expect.objectContaining({
        __skipAuthReadyGate: true,
        headers: { Authorization: `Bearer ${brokerToken}` },
      }),
    );
    // Dispatch order: hydrate → transportReady → setAuthInitialized
    const hydrateIdx = dispatched.findIndex((a) => a.type === 'auth/hydrateImpersonationSession');
    const transportIdx = dispatched.findIndex(
      (a) => a.type === 'auth/setAuthPhase' && a.payload === 'transportReady',
    );
    const initIdx = dispatched.findIndex(
      (a) => a.type === 'auth/setAuthInitialized' && a.payload === true,
    );
    expect(hydrateIdx).toBeGreaterThanOrEqual(0);
    expect(transportIdx).toBeGreaterThan(hydrateIdx);
    expect(initIdx).toBeGreaterThan(transportIdx);
  });

  it('fail-closed: originalAdminToken missing → guard fails + metadata cleared', async () => {
    const sessionId = '00000000-0000-0000-0000-000000000002';
    const brokerToken = buildBrokerJwt({ sid: sessionId });
    seedStorage({
      mode: 'active',
      sessionId,
      exchangedToken: brokerToken,
      originalAdminToken: null,
      originalAdminExpiresAt: Date.now() + 60_000,
    });

    const { dispatched, dispatch, apiPost, apiGet, clearImpersonationOnFailurePath } = setupMocks();

    const mod = await import('./impersonation-hydrate');
    const ok = await mod.tryHydrateImpersonation(dispatch);

    expect(ok).toBe(false);
    expect(clearImpersonationOnFailurePath).toHaveBeenCalledTimes(1);
    // No side effects on fail-closed path — neither cookie write nor
    // authz fetch may run before guards pass.
    expect(apiPost).not.toHaveBeenCalled();
    expect(apiGet).not.toHaveBeenCalled();
    expect(dispatched).toHaveLength(0);
  });

  it('fail-closed: sid claim mismatch → guard fails + metadata cleared', async () => {
    const sessionId = '00000000-0000-0000-0000-000000000003';
    // Broker JWT carries a DIFFERENT sid than persisted
    const brokerToken = buildBrokerJwt({ sid: '99999999-0000-0000-0000-000000000999' });
    seedStorage({
      mode: 'active',
      sessionId,
      exchangedToken: brokerToken,
      originalAdminToken: 'admin-token',
      originalAdminExpiresAt: Date.now() + 60_000,
    });

    const { dispatch, apiPost, apiGet, clearImpersonationOnFailurePath } = setupMocks();

    const mod = await import('./impersonation-hydrate');
    const ok = await mod.tryHydrateImpersonation(dispatch);

    expect(ok).toBe(false);
    expect(clearImpersonationOnFailurePath).toHaveBeenCalledTimes(1);
    expect(apiPost).not.toHaveBeenCalled();
    expect(apiGet).not.toHaveBeenCalled();
  });

  it('returns false when impersonation mode key not active', async () => {
    seedStorage({ mode: 'inactive' });
    const { dispatch, clearImpersonationOnFailurePath } = setupMocks();

    const mod = await import('./impersonation-hydrate');
    const ok = await mod.tryHydrateImpersonation(dispatch);

    expect(ok).toBe(false);
    // Inactive mode short-circuit MUST NOT clear metadata —
    // there is no metadata to clear, and clearing here would mask
    // legitimate re-entry pre-conditions.
    expect(clearImpersonationOnFailurePath).not.toHaveBeenCalled();
  });
});
