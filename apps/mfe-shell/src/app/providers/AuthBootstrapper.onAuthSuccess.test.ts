// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

/**
 * User Impersonation v1 PR-C2 — iter-6 P1-3 absorb (Codex thread
 * `019e109c`): direct test for the onAuthSuccess catch-up handler.
 * Iter-5 introduced the impersonation-active short-circuit; iter-6
 * review explicitly required a regression test so a future refactor
 * does not silently re-allow the admin-cookie clobber.
 *
 * The factory is exercised in isolation (no React tree mount).
 */

const { mockGet, mockPost, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn().mockResolvedValue({ data: { permissions: [], superAdmin: false } }),
  mockPost: vi.fn().mockResolvedValue({ data: {} }),
  mockDelete: vi.fn().mockResolvedValue({ data: {} }),
}));

vi.mock('@mfe/shared-http', () => ({
  api: { get: mockGet, post: mockPost, delete: mockDelete },
}));

import { createOnAuthSuccessHandler } from './AuthBootstrapper';

describe('createOnAuthSuccessHandler — impersonation guard (iter-6 P1-3)', () => {
  const baseDeps = () => {
    const setTokenCookie = vi.fn(async () => undefined);
    const fetchAppPermissions = vi.fn(async () => ({
      permissions: ['ADMIN'],
      superAdmin: true,
      rawResponse: { permissions: ['ADMIN'], superAdmin: true },
    }));
    const dispatch = vi.fn();
    return {
      setTokenCookie,
      fetchAppPermissions,
      dispatch,
      mapProfile: vi.fn(() => ({
        id: 'admin-id',
        email: 'admin@example.com',
        role: 'USER' as const,
        permissions: [],
      })),
      getMounted: vi.fn(() => true),
      getIsImpersonating: vi.fn(() => false),
      getKeycloakToken: vi.fn(() => 'admin-jwt'),
      getKeycloakTokenParsed: vi.fn(() => ({ exp: Math.floor(Date.now() / 1000) + 3600 })),
    };
  };

  it('skips cookie write + dispatch sequence when impersonation active', async () => {
    const deps = baseDeps();
    deps.getIsImpersonating.mockReturnValue(true);

    const handler = createOnAuthSuccessHandler(deps);
    await handler();

    expect(deps.setTokenCookie).not.toHaveBeenCalled();
    expect(deps.fetchAppPermissions).not.toHaveBeenCalled();
    expect(deps.dispatch).not.toHaveBeenCalled();
  });

  it('runs catch-up closure when impersonation inactive (admin-only path)', async () => {
    const deps = baseDeps();
    const handler = createOnAuthSuccessHandler(deps);
    await handler();

    expect(deps.setTokenCookie).toHaveBeenCalledWith('admin-jwt');
    expect(deps.fetchAppPermissions).toHaveBeenCalledWith('admin-jwt');
    // setKeycloakSession + setAuthPhase('transportReady') + setAuthInitialized(true)
    const dispatchedTypes = deps.dispatch.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(dispatchedTypes).toContain('auth/setKeycloakSession');
    expect(dispatchedTypes).toContain('auth/setAuthPhase');
    expect(dispatchedTypes).toContain('auth/setAuthInitialized');
  });

  it('aborts gracefully when component unmounts during cookie await', async () => {
    const deps = baseDeps();
    let unmounted = false;
    deps.getMounted.mockImplementation(() => !unmounted);
    deps.setTokenCookie.mockImplementation(async () => {
      unmounted = true;
    });

    const handler = createOnAuthSuccessHandler(deps);
    await handler();

    // setTokenCookie still ran (mounted at start); but no further
    // dispatch fired (mounted check after await trips false).
    expect(deps.setTokenCookie).toHaveBeenCalled();
    expect(deps.fetchAppPermissions).not.toHaveBeenCalled();
    expect(deps.dispatch).not.toHaveBeenCalled();
  });

  it('dispatches setAuthFailed when cookie write rejects', async () => {
    const deps = baseDeps();
    deps.setTokenCookie.mockRejectedValueOnce(new Error('Gateway 503'));

    const handler = createOnAuthSuccessHandler(deps);
    await handler();

    const failedCall = deps.dispatch.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'auth/setAuthFailed',
    );
    expect(failedCall).toBeDefined();
    expect(deps.fetchAppPermissions).not.toHaveBeenCalled();
  });
});
