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
 * Resolution priority (Codex iter-4 RED absorb):
 *   1. state.auth.authzSnapshot.userId (canonical DB id from /authz/me)
 *   2. state.auth.user.id (JWT sub fallback)
 */

const buildState = (auth: Partial<RootState['auth']>): RootState =>
  ({
    auth: {
      user: null,
      token: null,
      authzSnapshot: null,
      ...auth,
    } as unknown as RootState['auth'],
    counter: {} as RootState['counter'],
    products: {} as RootState['products'],
    notifications: {} as RootState['notifications'],
  }) as unknown as RootState;

describe('selectNotifyIdentity — auth states', () => {
  it('returns null when user is signed out and no authz snapshot', () => {
    const state = buildState({ user: null, authzSnapshot: null });
    expect(selectNotifyIdentity(state)).toBeNull();
    expect(selectNotifyIdentityReady(state)).toBe(false);
  });

  it('prefers authzSnapshot.userId (canonical DB id) over user.id (JWT sub)', () => {
    const state = buildState({
      user: {
        id: '3520324b-3035-4510-8fca-a8a18dbd1da2', // KC sub UUID
        email: 'alice@example.com',
        role: 'user',
        permissions: [],
      },
      authzSnapshot: { userId: '1204' } as unknown as RootState['auth']['authzSnapshot'],
    });
    expect(selectNotifyIdentity(state)).toEqual({
      orgId: DEFAULT_ORG_ID,
      subscriberId: '1204', // canonical id wins
    });
  });

  it('falls back to user.id when authzSnapshot is absent', () => {
    const state = buildState({
      user: {
        id: 'user-1204',
        email: 'alice@example.com',
        role: 'user',
        permissions: [],
      },
      authzSnapshot: null,
    });
    expect(selectNotifyIdentity(state)).toEqual({
      orgId: DEFAULT_ORG_ID,
      subscriberId: 'user-1204',
    });
    expect(selectNotifyIdentityReady(state)).toBe(true);
  });

  it('coerces numeric authzSnapshot.userId to string', () => {
    const state = buildState({
      user: null,
      authzSnapshot: {
        userId: 1204 as unknown as string,
      } as unknown as RootState['auth']['authzSnapshot'],
    });
    expect(selectNotifyIdentity(state)).toEqual({
      orgId: DEFAULT_ORG_ID,
      subscriberId: '1204',
    });
  });

  it('treats numeric or missing user.id as not-authenticated when snapshot empty', () => {
    // Defensive: legacy auth payloads may surface user.id as a number;
    // selector requires a string to keep the contract with the inbox API.
    const numericState = buildState({
      user: {
        id: 1204 as unknown as string,
        email: 'alice@example.com',
        role: 'user',
        permissions: [],
      },
      authzSnapshot: null,
    });
    expect(selectNotifyIdentity(numericState)).toBeNull();

    const emptyState = buildState({
      user: { email: 'x@y.z', role: 'user', permissions: [] },
      authzSnapshot: null,
    });
    expect(selectNotifyIdentity(emptyState)).toBeNull();
  });

  it('ignores non-string non-number authzSnapshot.userId', () => {
    const state = buildState({
      user: { id: 'fallback-id', email: 'x@y.z', role: 'user', permissions: [] },
      authzSnapshot: {
        userId: { unexpected: true } as unknown as string,
      } as unknown as RootState['auth']['authzSnapshot'],
    });
    // Falls back to user.id since the snapshot value is not a primitive.
    expect(selectNotifyIdentity(state)).toEqual({
      orgId: DEFAULT_ORG_ID,
      subscriberId: 'fallback-id',
    });
  });
});
