// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionExpiredToast } from './useSessionExpiredToast';

function dispatchUnauthorized(url?: string) {
  window.dispatchEvent(
    new CustomEvent('app:auth:unauthorized', {
      detail: { status: 401, method: 'GET', url, timestamp: Date.now() },
    }),
  );
}

describe('useSessionExpiredToast', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/admin/meetings');
  });

  it('ignores downstream 401 responses and deduplicates an auth-critical episode', () => {
    const showToast = vi.fn(() => 'toast-1');
    const dismissToast = vi.fn();
    const onSessionExpired = vi.fn();

    renderHook(() =>
      useSessionExpiredToast({
        token: 'token-1',
        showToast,
        dismissToast,
        onSessionExpired,
      }),
    );

    act(() => dispatchUnauthorized('/v1/admin/meetings'));
    act(() => dispatchUnauthorized());
    expect(showToast).not.toHaveBeenCalled();
    expect(onSessionExpired).not.toHaveBeenCalled();

    act(() => dispatchUnauthorized('/v1/authz/me'));
    act(() => dispatchUnauthorized('/v1/authz/version'));

    expect(showToast).toHaveBeenCalledTimes(1);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(dismissToast).not.toHaveBeenCalled();
  });

  it('dismisses the persistent toast on token refresh before a new episode', () => {
    const toastIds = ['toast-1', 'toast-2'];
    const showToast = vi.fn(() => toastIds.shift() ?? 'unexpected-toast');
    const dismissToast = vi.fn();
    const onSessionExpired = vi.fn();

    const { rerender } = renderHook(
      ({ token }) =>
        useSessionExpiredToast({
          token,
          showToast,
          dismissToast,
          onSessionExpired,
        }),
      { initialProps: { token: 'token-1' } },
    );

    act(() => dispatchUnauthorized('/v1/authz/me'));
    expect(showToast).toHaveBeenCalledTimes(1);

    rerender({ token: 'token-2' });
    expect(dismissToast).toHaveBeenCalledWith('toast-1');

    act(() => dispatchUnauthorized('/v1/authz/me'));
    expect(showToast).toHaveBeenCalledTimes(2);
    expect(onSessionExpired).toHaveBeenCalledTimes(2);
  });

  it('allows a new episode after the user closes the toast', () => {
    let onCancel: (() => void) | undefined;
    const showToast = vi.fn((cancel: () => void) => {
      onCancel = cancel;
      return 'toast-1';
    });

    renderHook(() =>
      useSessionExpiredToast({
        token: 'token-1',
        showToast,
        dismissToast: vi.fn(),
        onSessionExpired: vi.fn(),
      }),
    );

    act(() => dispatchUnauthorized('/v1/authz/me'));
    act(() => onCancel?.());
    act(() => dispatchUnauthorized('/v1/authz/me'));

    expect(showToast).toHaveBeenCalledTimes(2);
  });
});
