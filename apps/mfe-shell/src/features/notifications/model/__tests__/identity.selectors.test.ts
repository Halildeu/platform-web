// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ORG_ID,
  selectNotifyIdentity,
  selectNotifyIdentityReady,
} from '../identity.selectors';
import type { RootState } from '../../../../app/store/store';

/**
 * Faz 23.4 PR-E.5 — identity selector unit tests.
 *
 * Verifies the resolution rule: subscriberId comes from the auth slice
 * user.id field (populated by AuthBootstrapper from /api/v1/authz/me or
 * the JWT custom userId claim). orgId is hard-coded "default" until the
 * tenant claim lands (Faz 24).
 */

const buildState = (auth: Partial<RootState['auth']>): RootState =>
  ({
    auth: { user: null, token: null, ...auth } as unknown as RootState['auth'],
    counter: {} as RootState['counter'],
    products: {} as RootState['products'],
    notifications: {} as RootState['notifications'],
  }) as unknown as RootState;

describe('selectNotifyIdentity', () => {
  it('returns null when user is signed out', () => {
    const state = buildState({ user: null });
    expect(selectNotifyIdentity(state)).toBeNull();
    expect(selectNotifyIdentityReady(state)).toBe(false);
  });

  it('returns the (default org, user.id) pair when authenticated', () => {
    const state = buildState({
      user: {
        id: '1204',
        email: 'alice@example.com',
        role: 'user',
        permissions: [],
      },
    });
    expect(selectNotifyIdentity(state)).toEqual({
      orgId: DEFAULT_ORG_ID,
      subscriberId: '1204',
    });
    expect(selectNotifyIdentityReady(state)).toBe(true);
  });

  it('treats numeric or missing user.id as not-authenticated', () => {
    // Defensive: legacy auth payloads may surface user.id as a number;
    // selector requires a string to keep the contract with the inbox API.
    const numericState = buildState({
      user: {
        id: 1204 as unknown as string,
        email: 'alice@example.com',
        role: 'user',
        permissions: [],
      },
    });
    expect(selectNotifyIdentity(numericState)).toBeNull();

    const emptyState = buildState({
      user: { email: 'x@y.z', role: 'user', permissions: [] },
    });
    expect(selectNotifyIdentity(emptyState)).toBeNull();
  });
});
