// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { decodeJwtPayload } from '../impersonation';

/**
 * Regression coverage for the UTF-8 decode of the @mfe/auth copy of
 * decodeJwtPayload. atob() alone yields a Latin-1 binary string, so a
 * non-ASCII claim (e.g. a Turkish name) decoded that way becomes mojibake.
 * The decoder now decodes the raw bytes as UTF-8.
 */
describe('decodeJwtPayload (@mfe/auth) — UTF-8 claim decoding', () => {
  // Build a JWT whose payload is a UTF-8 → base64url segment, exactly as a
  // real broker-issued token would be.
  const toJwt = (payload: Record<string, unknown>): string => {
    const body = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
    return `eyJhbGciOiJSUzI1NiJ9.${body}.sig`;
  };

  it('decodes non-ASCII claims as UTF-8 without mojibake', () => {
    const decoded = decodeJwtPayload(toJwt({ sub: 'abc-123', name: 'Halil Koçoğlu' }));
    expect(decoded?.name).toBe('Halil Koçoğlu');
    expect(decoded?.sub).toBe('abc-123');
  });

  it('decodes plain ASCII claims', () => {
    const decoded = decodeJwtPayload(toJwt({ azp: 'frontend', email: 'user@example.com' }));
    expect(decoded?.azp).toBe('frontend');
    expect(decoded?.email).toBe('user@example.com');
  });

  it('returns null for a malformed token', () => {
    expect(decodeJwtPayload('not-a-jwt')).toBeNull();
  });
});
