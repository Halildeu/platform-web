// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ORG_ID,
  selectNotifyIdentity,
  selectNotifyIdentityReady,
} from '../identity.selectors';
import type { RootState } from '../../../../app/store/store';

/**
 * Faz 23.4 PR-E.5 + Faz 23.5 hardening — identity selector unit tests.
 *
 * Codex thread `019e0316` iter-3 absorb:
 *   1. authzSnapshot.subscriberId (canonical, Faz 23.5 backend PR #107)
 *   2. user.subscriberId (persisted alias)
 *   3. authzSnapshot.userId (legacy fallback)
 *   4. user.id (JWT sub UUID, gated behind initialized=true)
 */

const buildState = (auth: Partial<RootState['auth']>): RootState =>
  ({
    auth: {
      user: null,
      token: null,
      authzSnapshot: null,
      // Default to initialized=true so legacy tests keep their behaviour;
      // the initialized=false guard is exercised by dedicated cases.
      initialized: true,
      ...auth,
    } as unknown as RootState['auth'],
    counter: {} as RootState['counter'],
    products: {} as RootState['products'],
    notifications: {} as RootState['notifications'],
  }) as unknown as RootState;

describe('selectNotifyIdentity — canonical-first priority', () => {
  it('returns null when user is signed out and no authz snapshot', () => {
    const state = buildState({ user: null, authzSnapshot: null });
    expect(selectNotifyIdentity(state)).toBeNull();
    expect(selectNotifyIdentityReady(state)).toBe(false);
  });

  it('prefers authzSnapshot.subscriberId (canonical) over every other source', () => {
    const state = buildState({
      user: {
        id: 'kc-sub-uuid',
        subscriberId: 'persisted-stale',
        email: 'alice@example.com',
        role: 'user',
        permissions: [],
      },
      authzSnapshot: {
        subscriberId: 1204,
        userId: 'legacy-1204',
      } as unknown as RootState['auth']['authzSnapshot'],
    });
    expect(selectNotifyIdentity(state)).toEqual({
      orgId: DEFAULT_ORG_ID,
      subscriberId: '1204',
    });
  });

  it('coerces a numeric authzSnapshot.subscriberId to string', () => {
    const state = buildState({
      user: null,
      authzSnapshot: { subscriberId: 1204 } as unknown as RootState['auth']['authzSnapshot'],
    });
    expect(selectNotifyIdentity(state)).toEqual({
      orgId: DEFAULT_ORG_ID,
      subscriberId: '1204',
    });
  });

  it('falls back to user.subscriberId when the snapshot did not carry one', () => {
    // E.g. token refresh path where the snapshot reload is in-flight but
    // the previously persisted subscriberId is still authoritative.
    const state = buildState({
      user: {
        id: 'kc-sub-uuid',
        subscriberId: '1204',
        email: 'alice@example.com',
        role: 'user',
        permissions: [],
      },
      authzSnapshot: { userId: 'legacy-fallback' } as unknown as RootState['auth']['authzSnapshot'],
    });
    expect(selectNotifyIdentity(state)).toEqual({
      orgId: DEFAULT_ORG_ID,
      subscriberId: '1204',
    });
  });

  it('falls back to authzSnapshot.userId when no canonical sources exist (legacy compat)', () => {
    const state = buildState({
      user: {
        id: '3520324b-3035-4510-8fca-a8a18dbd1da2',
        email: 'alice@example.com',
        role: 'user',
        permissions: [],
      },
      authzSnapshot: { userId: '1204' } as unknown as RootState['auth']['authzSnapshot'],
    });
    expect(selectNotifyIdentity(state)).toEqual({
      orgId: DEFAULT_ORG_ID,
      subscriberId: '1204',
    });
  });

  it('coerces a numeric authzSnapshot.userId to string (legacy)', () => {
    const state = buildState({
      user: null,
      authzSnapshot: { userId: 1204 } as unknown as RootState['auth']['authzSnapshot'],
    });
    expect(selectNotifyIdentity(state)).toEqual({
      orgId: DEFAULT_ORG_ID,
      subscriberId: '1204',
    });
  });

  it('uses user.id (JWT sub UUID) only when initialized is true', () => {
    const state = buildState({
      user: {
        id: '3520324b-3035-4510-8fca-a8a18dbd1da2',
        email: 'alice@example.com',
        role: 'user',
        permissions: [],
      },
      authzSnapshot: null,
      initialized: true,
    });
    expect(selectNotifyIdentity(state)).toEqual({
      orgId: DEFAULT_ORG_ID,
      subscriberId: '3520324b-3035-4510-8fca-a8a18dbd1da2',
    });
  });

  it('returns null when only the legacy user.id fallback would apply but bootstrap is in flight', () => {
    // Codex Delta-8 test: persisted UUID alone is not enough to fire
    // inbox / preferences calls; we wait for the snapshot reload.
    const state = buildState({
      user: {
        id: 'persisted-uuid',
        email: 'alice@example.com',
        role: 'user',
        permissions: [],
      },
      authzSnapshot: null,
      initialized: false,
    });
    expect(selectNotifyIdentity(state)).toBeNull();
  });

  it('ignores blank string and non-finite numeric identity values', () => {
    const blankState = buildState({
      user: {
        id: '   ',
        subscriberId: '',
        email: 'x@y.z',
        role: 'user',
        permissions: [],
      },
      authzSnapshot: { subscriberId: Number.NaN } as unknown as RootState['auth']['authzSnapshot'],
    });
    expect(selectNotifyIdentity(blankState)).toBeNull();
  });

  it('ignores non-primitive identity values (defensive coercion)', () => {
    const state = buildState({
      user: { id: 'fallback-id', email: 'x@y.z', role: 'user', permissions: [] },
      authzSnapshot: {
        subscriberId: { unexpected: true } as unknown as string,
        userId: { unexpected: true } as unknown as string,
      } as unknown as RootState['auth']['authzSnapshot'],
    });
    // Selector falls all the way through to user.id.
    expect(selectNotifyIdentity(state)).toEqual({
      orgId: DEFAULT_ORG_ID,
      subscriberId: 'fallback-id',
    });
  });

  it('coerces a numeric user.id to string when no other source exists', () => {
    // Faz 23.5 absorb: legacy auth payloads sometimes surfaced user.id as
    // a number. The selector now coerces the value uniformly so the
    // header serialisation contract is consistent.
    const state = buildState({
      user: {
        id: 1204 as unknown as string,
        email: 'alice@example.com',
        role: 'user',
        permissions: [],
      },
      authzSnapshot: null,
    });
    expect(selectNotifyIdentity(state)).toEqual({
      orgId: DEFAULT_ORG_ID,
      subscriberId: '1204',
    });
  });
});

describe('selectNotifyIdentity — Faz 23.6 PR-3 JWT subscriberId claim flow', () => {
  // Codex thread `019e03f4` PARTIAL iter-1: post-PR-2 the Keycloak
  // mapper emits `subscriberId` as a JWT claim;
  // mapKeycloakProfile() copies it into UserProfile.subscriberId via
  // setKeycloakSession. From the selector's point of view this looks
  // like state.auth.user.subscriberId (the same persisted-alias slot
  // that Faz 23.5 introduced) — but the SOURCE is now the JWT claim
  // itself, not the /authz/me snapshot. These tests assert the
  // selector still resolves correctly when the JWT-driven alias is
  // the only canonical source available.

  it('selects user.subscriberId (sourced from JWT claim) when the snapshot has not loaded yet', () => {
    // Steady-state PR-3 scenario: token is fresh post-login, JWT
    // subscriberId claim is in user.subscriberId via mapKeycloakProfile,
    // but /api/v1/authz/me snapshot reload is still in flight.
    const state = buildState({
      user: {
        id: 'kc-uuid-after-login',
        subscriberId: '1204',
        email: 'alice@corp.example',
        role: 'USER',
        permissions: [],
      },
      authzSnapshot: null,
      initialized: true,
    });
    expect(selectNotifyIdentity(state)).toEqual({
      orgId: DEFAULT_ORG_ID,
      subscriberId: '1204',
    });
  });

  it('returns the JWT-sourced subscriberId even when the user.id (sub UUID) is also present', () => {
    // The selector must not prefer the legacy `sub` UUID when the
    // canonical JWT claim is in place — otherwise PR-4 strict cutover
    // would 403 every browser session.
    const state = buildState({
      user: {
        id: 'kc-uuid-sub',
        subscriberId: '1204',
        email: 'alice@corp.example',
        role: 'USER',
        permissions: [],
      },
      authzSnapshot: null,
      initialized: true,
    });
    const resolved = selectNotifyIdentity(state);
    expect(resolved?.subscriberId).toBe('1204');
    expect(resolved?.subscriberId).not.toBe('kc-uuid-sub');
  });

  it('falls back to authzSnapshot.userId (legacy claim) when the JWT had no subscriberId yet (pre-PR-2 token)', () => {
    // Backward-compat: a token issued BEFORE the PR-2 mapper rolled
    // out has no subscriberId claim. The /authz/me snapshot still
    // surfaces the legacy `userId` claim and the selector keeps
    // working through the rollout window. This is the critical
    // backward-compat case: PR-3 must not break existing sessions.
    const state = buildState({
      user: {
        id: 'pre-pr2-uuid',
        // No subscriberId on the user — pre-PR-2 mapKeycloakProfile
        // didn't populate it.
        email: 'alice@corp.example',
        role: 'USER',
        permissions: [],
      },
      authzSnapshot: {
        userId: 'legacy-1204',
      } as unknown as RootState['auth']['authzSnapshot'],
      initialized: true,
    });
    expect(selectNotifyIdentity(state)).toEqual({
      orgId: DEFAULT_ORG_ID,
      subscriberId: 'legacy-1204',
    });
  });

  it('falls back to user.id (sub UUID) only when no canonical/legacy claim exists at all', () => {
    // Worst-case: no subscriberId claim, no /authz/me userId, only
    // the JWT `sub` UUID. The legacy fallback keeps the session
    // functional through the rollout. PR-4 strict cutover will
    // reject this case (the env flip drops `sub` from the accepted
    // claim list), but PR-3 must keep it working.
    const state = buildState({
      user: {
        id: 'orphan-uuid',
        email: 'alice@corp.example',
        role: 'USER',
        permissions: [],
      },
      authzSnapshot: null,
      initialized: true,
    });
    expect(selectNotifyIdentity(state)).toEqual({
      orgId: DEFAULT_ORG_ID,
      subscriberId: 'orphan-uuid',
    });
  });
});
