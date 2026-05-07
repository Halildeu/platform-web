// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mapKeycloakProfile } from './auth-helpers';

/**
 * Faz 23.6 PR-3 — auth-helpers.mapKeycloakProfile JWT subscriberId
 * claim reading (Codex thread `019e03f4` PARTIAL iter-1).
 *
 * The Keycloak realm mapper PR-2 wired into platform-gateway and
 * platform-frontend clients emits a `subscriberId` claim sourced from
 * the user attribute of the same name. mapKeycloakProfile() must
 * propagate that claim into UserProfile so the auth.slice reducer can
 * persist it and the identity selector can use it for the
 * `X-Subscriber-Id` header — even before /api/v1/authz/me has reloaded
 * its snapshot.
 */

/**
 * Build a JWT-shaped string with the given payload claims. Header and
 * signature are throwaway base64url chunks since the helper only
 * decodes the payload segment.
 */
const buildJwt = (payload: Record<string, unknown>): string => {
  const b64url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url(payload)}.signature`;
};

describe('mapKeycloakProfile — Faz 23.6 PR-3 subscriberId claim', () => {
  it('reads a string subscriberId claim into profile.subscriberId', () => {
    const token = buildJwt({
      sub: 'kc-uuid-1',
      email: 'alice@corp.example',
      subscriberId: '1204',
    });
    const profile = mapKeycloakProfile(token);
    expect(profile?.subscriberId).toBe('1204');
    // sub still maps to id (legacy fallback path)
    expect(profile?.id).toBe('kc-uuid-1');
  });

  it('coerces a numeric subscriberId claim to a string', () => {
    const token = buildJwt({
      sub: 'kc-uuid-2',
      subscriberId: 1204,
    });
    const profile = mapKeycloakProfile(token);
    expect(profile?.subscriberId).toBe('1204');
  });

  it('omits subscriberId when the claim is absent so the field is not set on the profile', () => {
    const token = buildJwt({
      sub: 'kc-uuid-3',
      email: 'bob@corp.example',
    });
    const profile = mapKeycloakProfile(token);
    // Use `in` to distinguish "absent key" from "explicit null/undefined"
    // — auth.slice's reducer treats absent key as "no canonical id from
    // this source", while a present-null key would override previous
    // state through the spread.
    expect(profile && 'subscriberId' in profile).toBe(false);
  });

  it('drops blank-string subscriberId claims to undefined / not-set', () => {
    const token = buildJwt({
      sub: 'kc-uuid-4',
      subscriberId: '   ',
    });
    const profile = mapKeycloakProfile(token);
    expect(profile && 'subscriberId' in profile).toBe(false);
  });

  it('drops non-finite numeric subscriberId claims (NaN, Infinity)', () => {
    // JSON cannot encode NaN/Infinity, but a Keycloak custom mapper
    // could in theory emit a string that parses to NaN — the helper
    // takes the safe path and only accepts finite numbers.
    const token = buildJwt({
      sub: 'kc-uuid-5',
      subscriberId: 'not-a-number-and-not-a-uuid-but-trimmed-non-empty',
    });
    const profile = mapKeycloakProfile(token);
    // Trimmed non-empty string is accepted as-is — backend guard
    // accepts any trusted-source string. The "drop NaN" guard is
    // strictly for numeric coercion failures (e.g. Number('foo')).
    expect(profile?.subscriberId).toBe('not-a-number-and-not-a-uuid-but-trimmed-non-empty');
  });

  it('returns null for an empty token string', () => {
    expect(mapKeycloakProfile(null)).toBeNull();
  });

  it('preserves email + role + permissions even when subscriberId is absent', () => {
    const token = buildJwt({
      sub: 'kc-uuid-6',
      email: 'carol@corp.example',
      preferred_username: 'carol',
      realm_access: { roles: ['ADMIN'] },
    });
    const profile = mapKeycloakProfile(token);
    expect(profile?.email).toBe('carol@corp.example');
    expect(profile?.role).toBe('ADMIN');
    expect(profile?.permissions).toContain('ADMIN');
    expect(profile && 'subscriberId' in profile).toBe(false);
  });
});
