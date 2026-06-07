// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import reducer, {
  setKeycloakSession,
  decodeJwtPayload,
  selectModuleLevel,
  selectIsSuperAdmin,
} from './auth.slice';

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

describe('auth.slice token sanitization', () => {
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

  it("literal 'undefined' tokenını gerçek oturum olarak kabul etmez", () => {
    const next = reducer(
      undefined,
      setKeycloakSession({
        token: 'undefined',
        profile: {
          email: 'admin1@example.com',
          role: 'ADMIN',
          permissions: ['USER-READ'],
        },
      }),
    );

    expect(next.token).toBeNull();
    expect(next.user).toBeNull();
    expect(globalThis.localStorage.getItem('token')).toBeNull();
  });
});

describe('auth.slice setKeycloakSession — canonical subscriberId (Faz 23.5)', () => {
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

  it('copies authzSnapshot.subscriberId into state.user.subscriberId and localStorage', () => {
    const next = reducer(
      undefined,
      setKeycloakSession({
        token: 'valid.jwt.token',
        profile: { id: 'sub-uuid', email: 'alice@example.com', role: 'USER', permissions: [] },
        authzSnapshot: {
          subscriberId: 1204,
          userId: 'legacy-1204',
        } as unknown as Record<string, unknown>,
      }),
    );

    expect(next.user?.subscriberId).toBe('1204');
    const persisted = JSON.parse(globalThis.localStorage.getItem('user') ?? '{}');
    expect(persisted.subscriberId).toBe('1204');
  });

  it('keeps the existing user.subscriberId when the snapshot omits it AND the profile is the same user (token refresh)', () => {
    // Codex Delta-8 absorb: same-profile path keeps the canonical id.
    const stateWithSubscriberId = reducer(
      undefined,
      setKeycloakSession({
        token: 'first.jwt.token',
        profile: { id: 'sub-uuid', email: 'alice@example.com', role: 'USER', permissions: [] },
        authzSnapshot: { subscriberId: 1204 } as unknown as Record<string, unknown>,
      }),
    );

    const refreshed = reducer(
      stateWithSubscriberId,
      setKeycloakSession({
        token: 'refreshed.jwt.token',
        // Same profile reference (same id and email) — token refresh path.
        profile: { id: 'sub-uuid', email: 'alice@example.com', role: 'USER', permissions: [] },
        // Snapshot reload still in flight — no subscriberId yet.
        authzSnapshot: { userId: 'legacy-1204' } as unknown as Record<string, unknown>,
      }),
    );

    expect(refreshed.user?.subscriberId).toBe('1204');
  });

  it('drops the previous subscriberId when a brand-new profile lands without a snapshot subscriberId', () => {
    // Codex Delta-8 absorb: prevents leaking a previous user's id into a
    // freshly authenticated session.
    const stateWithSubscriberId = reducer(
      undefined,
      setKeycloakSession({
        token: 'alice.jwt.token',
        profile: {
          id: 'sub-uuid-alice',
          email: 'alice@example.com',
          role: 'USER',
          permissions: [],
        },
        authzSnapshot: { subscriberId: 1204 } as unknown as Record<string, unknown>,
      }),
    );

    const switched = reducer(
      stateWithSubscriberId,
      setKeycloakSession({
        token: 'bob.jwt.token',
        // Different user. id and email both differ from the previous state.
        profile: { id: 'sub-uuid-bob', email: 'bob@example.com', role: 'USER', permissions: [] },
        authzSnapshot: undefined,
      }),
    );

    expect(switched.user?.subscriberId).toBeUndefined();
  });

  it('coerces blank / non-finite snapshot subscriberId values to undefined', () => {
    const next = reducer(
      undefined,
      setKeycloakSession({
        token: 'valid.jwt.token',
        profile: { id: 'sub-uuid', email: 'alice@example.com', role: 'USER', permissions: [] },
        authzSnapshot: {
          subscriberId: '   ',
          userId: 'legacy-1204',
        } as unknown as Record<string, unknown>,
      }),
    );
    expect(next.user?.subscriberId).toBeUndefined();
  });
});

describe('decodeJwtPayload — UTF-8 claim decoding', () => {
  // Build a JWT whose payload is a UTF-8 → base64url segment, exactly as a
  // real broker-issued token would be.
  const toJwt = (payload: Record<string, unknown>): string => {
    const body = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
    return `eyJhbGciOiJSUzI1NiJ9.${body}.sig`;
  };

  it('decodes non-ASCII (Turkish) name claims without mojibake', () => {
    // Regression: atob() alone yields a Latin-1 string, so "Koçoğlu"
    // surfaced as "KoÃ§oÄlu" in the header and user grids.
    const decoded = decodeJwtPayload(
      toJwt({ name: 'Halil Koçoğlu', given_name: 'Halil', family_name: 'Koçoğlu' }),
    );
    expect(decoded?.name).toBe('Halil Koçoğlu');
    expect(decoded?.given_name).toBe('Halil');
    expect(decoded?.family_name).toBe('Koçoğlu');
  });

  it('still decodes plain ASCII payloads', () => {
    const decoded = decodeJwtPayload(toJwt({ sub: 'abc-123', email: 'user@example.com' }));
    expect(decoded?.sub).toBe('abc-123');
    expect(decoded?.email).toBe('user@example.com');
  });

  it('returns null for a malformed token', () => {
    expect(decodeJwtPayload('not-a-jwt')).toBeNull();
  });
});

// Codex 019ea409 — shell-level per-module access selector consumed by remote
// MFEs (mfe-users UserActions) to gate destructive actions on MANAGE.
describe('selectModuleLevel (Codex 019ea409)', () => {
  const lvl = (authzSnapshot: unknown, module = 'USER_MANAGEMENT') =>
    selectModuleLevel(module)({ auth: { authzSnapshot } } as never);

  it('returns NONE when authz is not hydrated yet (null/undefined snapshot)', () => {
    expect(lvl(null)).toBe('NONE');
    expect(lvl(undefined)).toBe('NONE');
  });

  it('returns MANAGE for a super-admin regardless of the modules map', () => {
    expect(lvl({ superAdmin: true })).toBe('MANAGE');
    expect(lvl({ superAdmin: true, modules: { USER_MANAGEMENT: 'VIEW' } })).toBe('MANAGE');
    expect(lvl({ superAdmin: true, modules: {} })).toBe('MANAGE');
  });

  it('maps the per-module level: MANAGE -> MANAGE, VIEW -> VIEW', () => {
    expect(lvl({ modules: { USER_MANAGEMENT: 'MANAGE' } })).toBe('MANAGE');
    expect(lvl({ modules: { USER_MANAGEMENT: 'VIEW' } })).toBe('VIEW');
  });

  it('returns NONE for an absent module, an explicit NONE, or an unknown level', () => {
    expect(lvl({ modules: {} })).toBe('NONE');
    expect(lvl({ modules: { USER_MANAGEMENT: 'NONE' } })).toBe('NONE');
    expect(lvl({ modules: { USER_MANAGEMENT: 'OWNER' } })).toBe('NONE');
  });

  it('does NOT promote allowedModules to MANAGE (regression guard)', () => {
    // allowedModules is a navigation/view signal; a destructive gate must not
    // unlock just because the module appears there.
    expect(lvl({ allowedModules: ['USER_MANAGEMENT'] })).toBe('NONE');
    // when both are present, the modules map is authoritative.
    expect(lvl({ allowedModules: ['USER_MANAGEMENT'], modules: { USER_MANAGEMENT: 'VIEW' } })).toBe(
      'VIEW',
    );
  });

  it('is scoped to the requested module key', () => {
    const snap = { modules: { USER_MANAGEMENT: 'MANAGE' } };
    expect(lvl(snap, 'USER_MANAGEMENT')).toBe('MANAGE');
    expect(lvl(snap, 'AUDIT')).toBe('NONE');
  });
});

describe('selectIsSuperAdmin (fail-closed parity)', () => {
  const sa = (authzSnapshot: unknown) => selectIsSuperAdmin({ auth: { authzSnapshot } } as never);

  it('is false when not hydrated', () => {
    expect(sa(null)).toBe(false);
    expect(sa(undefined)).toBe(false);
  });

  it('reflects the snapshot superAdmin flag', () => {
    expect(sa({ superAdmin: true })).toBe(true);
    expect(sa({ superAdmin: false })).toBe(false);
    expect(sa({})).toBe(false);
  });
});
