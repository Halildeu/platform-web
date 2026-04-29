// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { PermissionProvider, usePermissions } from '../PermissionProvider';
import type { AuthzMeResponse } from '../types';

const mockAuthzMe: AuthzMeResponse = {
  userId: '10',
  superAdmin: false,
  allowedModules: ['USER_MANAGEMENT'],
  allowedCompanyIds: [1],
  allowedProjectIds: [],
  allowedWarehouseIds: [],
  roles: ['TestRole'],
  modules: { USER_MANAGEMENT: 'VIEW' },
  actions: {},
  reports: {},
  pages: {},
  scopes: { companyIds: [1] },
  authzVersion: 5,
};

function createWrapper(httpGet: any, cacheTtl = 60_000) {
  return ({ children }: { children: React.ReactNode }) => (
    <PermissionProvider httpGet={httpGet} cacheTtl={cacheTtl}>
      {children}
    </PermissionProvider>
  );
}

describe('PermissionProvider version-based refresh', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores authzVersion from /me response', async () => {
    const httpGet = vi.fn().mockResolvedValue({ data: mockAuthzMe });

    const { result } = renderHook(() => usePermissions(), {
      wrapper: createWrapper(httpGet),
    });

    await waitFor(() => expect(result.current.initialized).toBe(true));
    expect(result.current.authz?.authzVersion).toBe(5);
  });

  it('does NOT call /me when version unchanged', async () => {
    const httpGet = vi
      .fn()
      .mockResolvedValueOnce({ data: mockAuthzMe }) // initial /me
      .mockResolvedValueOnce({ data: { authzVersion: 5 } }); // /version poll — same

    const { result } = renderHook(() => usePermissions(), {
      wrapper: createWrapper(httpGet, 1000),
    });

    await waitFor(() => expect(result.current.initialized).toBe(true));

    // httpGet called once for /me
    expect(httpGet).toHaveBeenCalledTimes(1);

    // Advance timer to trigger version poll
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });

    // Should have called /version but NOT /me again
    expect(httpGet).toHaveBeenCalledTimes(2);
    expect(httpGet).toHaveBeenLastCalledWith('/v1/authz/version');
  });

  it('calls /me when version changes', async () => {
    const updatedAuthz = { ...mockAuthzMe, authzVersion: 6 };
    const httpGet = vi
      .fn()
      .mockResolvedValueOnce({ data: mockAuthzMe }) // initial /me (v5)
      .mockResolvedValueOnce({ data: { authzVersion: 6 } }) // /version poll — changed!
      .mockResolvedValueOnce({ data: updatedAuthz }); // full /me refresh

    const { result } = renderHook(() => usePermissions(), {
      wrapper: createWrapper(httpGet, 1000),
    });

    await waitFor(() => expect(result.current.initialized).toBe(true));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });

    // Should have: /me (initial) + /version (poll) + /me (refresh) = 3 calls
    await waitFor(() => expect(httpGet).toHaveBeenCalledTimes(3));
  });

  it('falls back to full /me refresh when /version errors', async () => {
    const httpGet = vi
      .fn()
      .mockResolvedValueOnce({ data: mockAuthzMe }) // initial /me
      .mockRejectedValueOnce(new Error('network error')) // /version fails
      .mockResolvedValueOnce({ data: mockAuthzMe }); // fallback /me

    const { result } = renderHook(() => usePermissions(), {
      wrapper: createWrapper(httpGet, 1000),
    });

    await waitFor(() => expect(result.current.initialized).toBe(true));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });

    // fetchAuthzVersion returns -1 on error → triggers full /me
    await waitFor(() => expect(httpGet).toHaveBeenCalledTimes(3));
  });
});

describe('PermissionProvider — Codex 019dd818 iter-4 (B-prime) sessionExpired', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sets sessionExpired=true when initial /me returns 401', async () => {
    const httpGet = vi.fn().mockRejectedValue({
      response: { status: 401 },
      message: 'Unauthorized',
    });

    const { result } = renderHook(() => usePermissions(), {
      wrapper: createWrapper(httpGet),
    });

    await waitFor(() => expect(result.current.initialized).toBe(true));
    expect(result.current.sessionExpired).toBe(true);
    expect(result.current.authz).toBeNull();
    expect(result.current.isSuperAdmin()).toBe(false);
    expect(result.current.hasModule('USER_MANAGEMENT')).toBe(false);
  });

  it('sets sessionExpired=true when /version polling returns 401', async () => {
    const httpGet = vi
      .fn()
      .mockResolvedValueOnce({ data: mockAuthzMe }) // initial /me OK
      .mockRejectedValueOnce({ response: { status: 401 } }); // /version 401

    const { result } = renderHook(() => usePermissions(), {
      wrapper: createWrapper(httpGet, 1000),
    });

    await waitFor(() => expect(result.current.initialized).toBe(true));
    expect(result.current.sessionExpired).toBe(false); // önce false
    expect(result.current.authz).not.toBeNull();

    // poll cycle
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });

    await waitFor(() => expect(result.current.sessionExpired).toBe(true));
    expect(result.current.authz).toBeNull();
    expect(result.current.isSuperAdmin()).toBe(false);
  });

  it('does NOT set sessionExpired for 5xx errors', async () => {
    const httpGet = vi.fn().mockRejectedValue({
      response: { status: 503 },
      message: 'Service Unavailable',
    });

    const { result } = renderHook(() => usePermissions(), {
      wrapper: createWrapper(httpGet),
    });

    // 5xx hata: ProtectedRoute loading'de tutar (initialized false, error log).
    // sessionExpired SET EDİLMEZ (Codex iter-4 talebi: sadece authn-unknown için).
    await waitFor(() => expect(httpGet).toHaveBeenCalled(), { timeout: 1000 });
    expect(result.current.sessionExpired).toBe(false);
  });

  it('clears sessionExpired when subsequent /me succeeds', async () => {
    const httpGet = vi
      .fn()
      .mockRejectedValueOnce({ response: { status: 401 } }) // ilk /me 401
      .mockResolvedValueOnce({ data: { authzVersion: 5 } }) // /version OK
      .mockResolvedValueOnce({ data: mockAuthzMe }); // /me success

    const { result } = renderHook(() => usePermissions(), {
      wrapper: createWrapper(httpGet, 1000),
    });

    await waitFor(() => expect(result.current.sessionExpired).toBe(true));

    // Bir sonraki poll cycle'da version değişmiş gibi davran → /me re-fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });

    await waitFor(() => expect(result.current.sessionExpired).toBe(false));
    expect(result.current.authz).not.toBeNull();
    expect(result.current.isSuperAdmin()).toBe(false); // mockAuthzMe.superAdmin=false
  });

  // Codex 019dd818 iter-6 PARTIAL blocker fix: re-auth recovery via initialData.
  // Senaryo: /me 401 → sessionExpired=true → shell re-login + fresh initialData
  // Provider initialData branch'inde sessionExpired'i sıfırlamalı.
  it('clears sessionExpired when shell provides fresh initialData after 401', async () => {
    const httpGet = vi.fn().mockRejectedValue({ response: { status: 401 } });
    const freshAuthz: AuthzMeResponse = {
      ...mockAuthzMe,
      superAdmin: true,
      authzVersion: 99,
    };

    // useState driver: initialData null'dan freshAuthz'e geçiş simüle.
    function HostWithInitialData() {
      const [initialData, setInitialData] = React.useState<AuthzMeResponse | null>(null);
      const captureRef = React.useRef<{ trigger: () => void }>({ trigger: () => {} });
      captureRef.current.trigger = () => setInitialData(freshAuthz);
      // Expose trigger via window for the test to call.
      (window as unknown as { __recoveryTrigger?: () => void }).__recoveryTrigger = () =>
        captureRef.current.trigger();
      return (
        <PermissionProvider httpGet={httpGet} initialData={initialData}>
          <Probe />
        </PermissionProvider>
      );
    }

    let captured: ReturnType<typeof usePermissions> | null = null;
    function Probe() {
      captured = usePermissions();
      return null;
    }

    const { rerender } = renderHook(() => null, {
      wrapper: () => <HostWithInitialData />,
    });

    // İlk render: initialData=null → /me çağrılır → 401 → sessionExpired=true
    await waitFor(() => expect(captured?.sessionExpired).toBe(true));
    expect(captured?.authz).toBeNull();

    // Shell re-login: trigger fresh initialData.
    await act(async () => {
      (window as unknown as { __recoveryTrigger?: () => void }).__recoveryTrigger?.();
    });
    rerender();

    await waitFor(() => expect(captured?.sessionExpired).toBe(false));
    expect(captured?.authz).not.toBeNull();
    expect(captured?.isSuperAdmin()).toBe(true);
  });
});
