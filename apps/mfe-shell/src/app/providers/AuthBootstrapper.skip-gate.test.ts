// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Phase 2 PR-HTTP-3 (Codex iter-2 P0 absorb, thread 019e046c):
 * regression guard for the bootstrap deadlock.
 *
 * <p>The shared-http request interceptor awaits the shell's
 * {@code authReadyResolver()} before issuing any protected request.
 * The bootstrap chain has three calls that DRIVE the FSM toward
 * {@code transportReady} and therefore CANNOT wait for it:
 * <ul>
 *   <li>{@code POST /auth/cookie} (setTokenCookie)</li>
 *   <li>{@code DELETE /auth/cookie} (clearTokenCookie)</li>
 *   <li>{@code GET /v1/authz/me} (fetchAppPermissions, runs between
 *       cookieReady and transportReady — refresh path uses the same
 *       helper)</li>
 * </ul>
 * Each helper must pass {@code __skipAuthReadyGate: true} on the
 * request config. Codex iter-1 caught the cookie path; iter-2 caught
 * the {@code fetchAppPermissions} miss. This test pins all three.
 */

const { mockGet, mockPost, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock('@mfe/shared-http', () => ({
  api: {
    get: mockGet,
    post: mockPost,
    delete: mockDelete,
  },
}));

import { fetchAppPermissions, setTokenCookie, clearTokenCookie } from './AuthBootstrapper';

describe('AuthBootstrapper helpers — auth-ready gate bypass (PR-HTTP-3)', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    mockDelete.mockReset();
    mockGet.mockResolvedValue({ data: { permissions: [], superAdmin: false } });
    mockPost.mockResolvedValue({ data: {} });
    mockDelete.mockResolvedValue({ data: {} });
  });

  it('setTokenCookie passes __skipAuthReadyGate: true', async () => {
    await setTokenCookie('mock-token');

    expect(mockPost).toHaveBeenCalledTimes(1);
    const [url, body, config] = mockPost.mock.calls[0];
    expect(url).toBe('/auth/cookie');
    expect(body).toBeNull();
    expect(config?.__skipAuthReadyGate).toBe(true);
    // Authorization header is set explicitly; gate bypass MUST NOT
    // also strip it.
    expect(config?.headers?.Authorization).toBe('Bearer mock-token');
  });

  it('clearTokenCookie passes __skipAuthReadyGate: true', async () => {
    await clearTokenCookie();

    expect(mockDelete).toHaveBeenCalledTimes(1);
    const [url, config] = mockDelete.mock.calls[0];
    expect(url).toBe('/auth/cookie');
    expect(config?.__skipAuthReadyGate).toBe(true);
  });

  it('fetchAppPermissions passes __skipAuthReadyGate: true (Codex iter-2 P0)', async () => {
    await fetchAppPermissions('mock-token');

    expect(mockGet).toHaveBeenCalledTimes(1);
    const [url, config] = mockGet.mock.calls[0];
    expect(url).toBe('/v1/authz/me');
    expect(config?.__skipAuthReadyGate).toBe(true);
    expect(config?.headers?.Authorization).toBe('Bearer mock-token');
  });
});
