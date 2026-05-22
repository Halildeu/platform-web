// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { skipToken } from '@reduxjs/toolkit/query/react';

/**
 * usePushSubscription — auth-ready query gate (Codex 019e50ac).
 *
 * The WebPush endpoint-list query (GET /api/v1/notify/push/subscribe/me)
 * must NOT fire until the bearer token is in Redux state. On a cold
 * direct-load of /settings/notifications, identity (orgId/subscriberId)
 * can resolve from a profile/authz claim before `auth.token` is
 * dispatched; firing then sends a header-less request → backend 401.
 *
 * These tests assert the `skipToken` gate on the list query reacts to
 * the auth-token fixture, not identity alone.
 */

let authTokenMock: string | null = 'test-bearer-token';
// Codex 019e50ac re-smoke: transport-readiness fixture — token alone is not a
// sufficient gate. Default true so existing tests keep the query un-skipped.
let transportReadyMock = true;

const listQueryMock = vi.fn(() => ({
  data: undefined,
  isLoading: false,
  refetch: vi.fn(),
}));

vi.mock('../../../../app/store/store.hooks', () => ({
  useAppSelector: (selector: () => unknown) => selector(),
}));

vi.mock('../../../auth/model/auth.slice', () => ({
  selectAuthToken: () => authTokenMock,
  selectIsTransportReady: () => transportReadyMock,
}));

vi.mock('../../api/notify-push.api', () => ({
  useListMyPushEndpointsQuery: (arg: unknown) => listQueryMock(arg),
  useSubscribePushMutation: () => [vi.fn(), { isLoading: false }],
  useUnsubscribePushMutation: () => [vi.fn(), { isLoading: false }],
}));

vi.mock('../../api/notify-push.helpers', () => ({
  detectBrowserPushSupport: () => ({ supported: true }),
  PushPermissionDeniedError: class PushPermissionDeniedError extends Error {},
  registerAndSubscribe: vi.fn(),
  unsubscribeBrowser: vi.fn(),
}));

import { usePushSubscription } from '../use-push-subscription.model';

describe('usePushSubscription — auth-ready query gate (Codex 019e50ac)', () => {
  beforeEach(() => {
    authTokenMock = 'test-bearer-token';
    transportReadyMock = true;
    listQueryMock.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('skips the endpoint-list query when the bearer token is absent', () => {
    authTokenMock = null;
    renderHook(() =>
      usePushSubscription({ orgId: 'org-1', subscriberId: 'sub-1', vapidPublicKey: 'k' }),
    );
    // Header-less GET /push/subscribe/me must not fire → skipToken.
    expect(listQueryMock).toHaveBeenCalledWith(skipToken);
  });

  it('fires the endpoint-list query once identity AND token are both ready', () => {
    authTokenMock = 'bearer-xyz';
    renderHook(() =>
      usePushSubscription({ orgId: 'org-1', subscriberId: 'sub-1', vapidPublicKey: 'k' }),
    );
    expect(listQueryMock).toHaveBeenCalledWith(undefined);
  });

  it('skips the query when identity is incomplete even with a token present', () => {
    authTokenMock = 'bearer-xyz';
    renderHook(() =>
      usePushSubscription({ orgId: '', subscriberId: 'sub-1', vapidPublicKey: 'k' }),
    );
    expect(listQueryMock).toHaveBeenCalledWith(skipToken);
  });

  it('skips the query until the auth transport is ready (Codex 019e50ac re-smoke)', () => {
    // identity + token present, but transport not yet validated — token can be
    // populated in an intermediate auth phase, so the query must still wait.
    authTokenMock = 'bearer-xyz';
    transportReadyMock = false;
    renderHook(() =>
      usePushSubscription({ orgId: 'org-1', subscriberId: 'sub-1', vapidPublicKey: 'k' }),
    );
    expect(listQueryMock).toHaveBeenCalledWith(skipToken);
  });
});
