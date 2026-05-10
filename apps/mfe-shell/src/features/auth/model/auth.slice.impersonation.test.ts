// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import reducer, {
  enterImpersonationSession,
  hydrateImpersonationSession,
  exitImpersonationSession,
  markImpersonationExpired,
  selectIsImpersonating,
  selectImpersonationOriginalAdmin,
  selectImpersonationOriginalAdminToken,
  selectImpersonationSessionId,
  selectImpersonationStatus,
  logout,
} from './auth.slice';

/**
 * User Impersonation v1 PR-C2 (Codex AGREE thread `019e109c` iter-4):
 * reducer + selector kilitler. enter/hydrate/exit/markExpired her biri
 * substate'i atomic değiştirir; authEpoch tek bump kuralı reducer
 * tarafında uygulanır.
 */

const originalWindow = globalThis.window;
const originalLocalStorage = globalThis.localStorage;

class LocalStorageMock {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return key in this.store ? this.store[key] : null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = value;
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
}

const ADMIN_USER = {
  id: '1',
  email: 'admin@example.com',
  role: 'ADMIN',
  permissions: ['ADMIN'],
  fullName: 'Site Admin',
};
const TARGET_USER = {
  id: '42',
  email: 'target@example.com',
  role: 'USER',
  permissions: ['USER_VIEWER'],
  fullName: 'Target User',
};
const ADMIN_AUTHZ = { permissions: ['ADMIN'], superAdmin: true };
const TARGET_AUTHZ = { permissions: ['USER_VIEWER'], superAdmin: false };

const ADMIN_TOKEN = 'admin-jwt-token';
const BROKER_TOKEN = 'broker-exchanged-token';
const SESSION_ID = '00000000-0000-0000-0000-000000000001';

describe('auth.slice impersonation FSM (PR-C2)', () => {
  beforeEach(() => {
    const localStorage = new LocalStorageMock();
    Object.defineProperty(globalThis, 'window', {
      value: { localStorage },
      configurable: true,
    });
    Object.defineProperty(globalThis, 'localStorage', {
      value: localStorage,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      value: originalWindow,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'localStorage', {
      value: originalLocalStorage,
      configurable: true,
    });
  });

  it('enterImpersonationSession atomically swaps subject and bumps authEpoch once', () => {
    const initial = reducer(undefined, { type: '@@INIT' });
    const epochBefore = initial.authEpoch;

    const next = reducer(
      { ...initial, token: ADMIN_TOKEN, user: ADMIN_USER, authzSnapshot: ADMIN_AUTHZ },
      enterImpersonationSession({
        sessionId: SESSION_ID,
        exchangedToken: BROKER_TOKEN,
        expiresAt: 1234567890,
        targetUser: TARGET_USER,
        targetAuthzSnapshot: TARGET_AUTHZ,
        originalAdminToken: ADMIN_TOKEN,
        originalAdminUser: ADMIN_USER,
        originalAdminAuthzSnapshot: ADMIN_AUTHZ,
        originalAdminExpiresAt: 9876543210,
      }),
    );

    // Effective subject swap.
    expect(next.token).toBe(BROKER_TOKEN);
    expect(next.user).toEqual(TARGET_USER);
    expect(next.authzSnapshot).toEqual(TARGET_AUTHZ);
    expect(next.expiresAt).toBe(1234567890);
    // Substate.
    expect(next.impersonation.status).toBe('active');
    expect(next.impersonation.sessionId).toBe(SESSION_ID);
    expect(next.impersonation.originalAdminToken).toBe(ADMIN_TOKEN);
    expect(next.impersonation.originalAdminUser).toEqual(ADMIN_USER);
    expect(next.impersonation.originalAdminAuthzSnapshot).toEqual(ADMIN_AUTHZ);
    expect(next.impersonation.originalAdminExpiresAt).toBe(9876543210);
    expect(next.impersonation.targetUser).toEqual(TARGET_USER);
    // Single epoch bump.
    expect(next.authEpoch).toBe(epochBefore + 1);
  });

  it('hydrateImpersonationSession does not require originalAdminUser/snapshot', () => {
    const initial = reducer(undefined, { type: '@@INIT' });

    const next = reducer(
      initial,
      hydrateImpersonationSession({
        sessionId: SESSION_ID,
        exchangedToken: BROKER_TOKEN,
        expiresAt: 1234567890,
        startedAt: 999999,
        targetUser: TARGET_USER,
        targetAuthzSnapshot: TARGET_AUTHZ,
        originalAdminToken: ADMIN_TOKEN,
        originalAdminExpiresAt: 9876543210,
      }),
    );

    expect(next.impersonation.status).toBe('active');
    expect(next.impersonation.startedAt).toBe(999999);
    expect(next.impersonation.originalAdminUser).toBeNull();
    expect(next.impersonation.originalAdminAuthzSnapshot).toBeNull();
    expect(next.impersonation.originalAdminToken).toBe(ADMIN_TOKEN);
    expect(next.impersonation.originalAdminExpiresAt).toBe(9876543210);
    expect(next.token).toBe(BROKER_TOKEN);
    expect(next.user).toEqual(TARGET_USER);
  });

  it('exitImpersonationSession restores admin identity and bumps epoch once', () => {
    let state = reducer(undefined, { type: '@@INIT' });
    state = reducer(
      { ...state, token: ADMIN_TOKEN, user: ADMIN_USER, authzSnapshot: ADMIN_AUTHZ },
      enterImpersonationSession({
        sessionId: SESSION_ID,
        exchangedToken: BROKER_TOKEN,
        expiresAt: 1234567890,
        targetUser: TARGET_USER,
        targetAuthzSnapshot: TARGET_AUTHZ,
        originalAdminToken: ADMIN_TOKEN,
        originalAdminUser: ADMIN_USER,
        originalAdminAuthzSnapshot: ADMIN_AUTHZ,
        originalAdminExpiresAt: 9876543210,
      }),
    );
    const epochAfterEnter = state.authEpoch;

    const next = reducer(
      state,
      exitImpersonationSession({
        adminToken: ADMIN_TOKEN,
        adminUser: ADMIN_USER,
        adminAuthzSnapshot: ADMIN_AUTHZ,
        adminExpiresAt: 9876543210,
      }),
    );

    expect(next.impersonation.status).toBe('inactive');
    expect(next.impersonation.sessionId).toBeNull();
    expect(next.impersonation.originalAdminToken).toBeNull();
    expect(next.token).toBe(ADMIN_TOKEN);
    expect(next.user).toEqual(ADMIN_USER);
    expect(next.authzSnapshot).toEqual(ADMIN_AUTHZ);
    // Single epoch bump (entered + exited = 2 total, but exit alone = +1).
    expect(next.authEpoch).toBe(epochAfterEnter + 1);
  });

  it('markImpersonationExpired transitions substate to expired without touching token', () => {
    let state = reducer(undefined, { type: '@@INIT' });
    state = reducer(
      { ...state, token: ADMIN_TOKEN, user: ADMIN_USER },
      enterImpersonationSession({
        sessionId: SESSION_ID,
        exchangedToken: BROKER_TOKEN,
        expiresAt: 1234567890,
        targetUser: TARGET_USER,
        targetAuthzSnapshot: TARGET_AUTHZ,
        originalAdminToken: ADMIN_TOKEN,
        originalAdminUser: ADMIN_USER,
        originalAdminAuthzSnapshot: ADMIN_AUTHZ,
        originalAdminExpiresAt: 9876543210,
      }),
    );
    const epochBefore = state.authEpoch;

    const next = reducer(state, markImpersonationExpired({ reason: 'session_expired' }));

    expect(next.impersonation.status).toBe('expired');
    expect(next.impersonation.lastExpiredReason).toBe('session_expired');
    // Token / user fields stay until the listener restores or redirects.
    expect(next.token).toBe(BROKER_TOKEN);
    expect(next.user).toEqual(TARGET_USER);
    // Codex iter-5 P2: markExpired bumps authEpoch so onTokenChange-style
    // consumers (e.g. audit live-stream) re-evaluate against the dying
    // broker session even before the listener restores the admin token.
    expect(next.authEpoch).toBe(epochBefore + 1);
  });

  it('logout tears down impersonation substate', () => {
    let state = reducer(undefined, { type: '@@INIT' });
    state = reducer(
      { ...state, token: ADMIN_TOKEN, user: ADMIN_USER },
      enterImpersonationSession({
        sessionId: SESSION_ID,
        exchangedToken: BROKER_TOKEN,
        expiresAt: 1234567890,
        targetUser: TARGET_USER,
        targetAuthzSnapshot: TARGET_AUTHZ,
        originalAdminToken: ADMIN_TOKEN,
        originalAdminUser: ADMIN_USER,
        originalAdminAuthzSnapshot: ADMIN_AUTHZ,
        originalAdminExpiresAt: 9876543210,
      }),
    );
    const next = reducer(state, logout());

    expect(next.impersonation.status).toBe('inactive');
    expect(next.impersonation.sessionId).toBeNull();
    expect(next.token).toBeNull();
    expect(next.user).toBeNull();
  });

  it('Codex iter-5 P1-2: logout also clears impersonation localStorage keys', () => {
    // Before the fix, logout cleared only generic auth keys (token,
    // user, tokenExpiresAt). The {@code impersonation.*} slots stayed
    // intact, so a subsequent bootstrap could falsely re-hydrate the
    // 6-condition guard against a disposed session.
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('impersonation.original_token', ADMIN_TOKEN);
      window.localStorage.setItem('impersonation.session_id', SESSION_ID);
      window.localStorage.setItem('impersonation.exchanged_token', BROKER_TOKEN);
      window.localStorage.setItem('impersonation.mode', 'active');
      window.localStorage.setItem('impersonation.started_at', '12345');
      window.localStorage.setItem('impersonation.expires_at', '99999');
      window.localStorage.setItem('impersonation.original_expires_at', '99999');
    }

    let state = reducer(undefined, { type: '@@INIT' });
    state = reducer(
      { ...state, token: ADMIN_TOKEN, user: ADMIN_USER },
      enterImpersonationSession({
        sessionId: SESSION_ID,
        exchangedToken: BROKER_TOKEN,
        expiresAt: 1234567890,
        targetUser: TARGET_USER,
        targetAuthzSnapshot: TARGET_AUTHZ,
        originalAdminToken: ADMIN_TOKEN,
        originalAdminUser: ADMIN_USER,
        originalAdminAuthzSnapshot: ADMIN_AUTHZ,
        originalAdminExpiresAt: 9876543210,
      }),
    );

    reducer(state, logout());

    // All impersonation slots gone — next bootstrap pass cannot
    // re-hydrate against the dead session.
    if (typeof window !== 'undefined' && window.localStorage) {
      expect(window.localStorage.getItem('impersonation.original_token')).toBeNull();
      expect(window.localStorage.getItem('impersonation.session_id')).toBeNull();
      expect(window.localStorage.getItem('impersonation.exchanged_token')).toBeNull();
      expect(window.localStorage.getItem('impersonation.mode')).toBeNull();
      expect(window.localStorage.getItem('impersonation.started_at')).toBeNull();
      expect(window.localStorage.getItem('impersonation.expires_at')).toBeNull();
      expect(window.localStorage.getItem('impersonation.original_expires_at')).toBeNull();
    }
  });

  it('selectors derive the expected booleans + accessors', () => {
    let state = reducer(undefined, { type: '@@INIT' });
    expect(selectIsImpersonating({ auth: state })).toBe(false);
    expect(selectImpersonationStatus({ auth: state })).toBe('inactive');
    expect(selectImpersonationOriginalAdmin({ auth: state })).toBeNull();
    expect(selectImpersonationOriginalAdminToken({ auth: state })).toBeNull();
    expect(selectImpersonationSessionId({ auth: state })).toBeNull();

    state = reducer(
      { ...state, token: ADMIN_TOKEN, user: ADMIN_USER, authzSnapshot: ADMIN_AUTHZ },
      enterImpersonationSession({
        sessionId: SESSION_ID,
        exchangedToken: BROKER_TOKEN,
        expiresAt: 1234567890,
        targetUser: TARGET_USER,
        targetAuthzSnapshot: TARGET_AUTHZ,
        originalAdminToken: ADMIN_TOKEN,
        originalAdminUser: ADMIN_USER,
        originalAdminAuthzSnapshot: ADMIN_AUTHZ,
        originalAdminExpiresAt: 9876543210,
      }),
    );

    expect(selectIsImpersonating({ auth: state })).toBe(true);
    expect(selectImpersonationStatus({ auth: state })).toBe('active');
    expect(selectImpersonationOriginalAdmin({ auth: state })).toEqual(ADMIN_USER);
    expect(selectImpersonationOriginalAdminToken({ auth: state })).toBe(ADMIN_TOKEN);
    expect(selectImpersonationSessionId({ auth: state })).toBe(SESSION_ID);
  });
});
