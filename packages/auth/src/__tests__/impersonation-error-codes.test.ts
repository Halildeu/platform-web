// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { IMPERSONATION_ERROR_CODES, isImpersonationErrorCode } from '../impersonation';

/**
 * User Impersonation v1 PR-C2 (Codex AGREE thread `019e109c` iter-4):
 * shared-http interceptor branch'i bu type guard'ı kullanıyor; values
 * backend ile sözleşmede aynı string'ler olmalı.
 */
describe('IMPERSONATION_ERROR_CODES + isImpersonationErrorCode (PR-C2)', () => {
  it('exposes the lifecycle error codes the interceptor branches on', () => {
    expect(IMPERSONATION_ERROR_CODES.SESSION_EXPIRED).toBe('IMPERSONATION_SESSION_EXPIRED');
    expect(IMPERSONATION_ERROR_CODES.SESSION_REQUIRED).toBe('IMPERSONATION_SESSION_REQUIRED');
    expect(IMPERSONATION_ERROR_CODES.EXCHANGED_TOKEN_EXPIRED).toBe('EXCHANGED_TOKEN_EXPIRED');
    expect(IMPERSONATION_ERROR_CODES.SESSION_REVOKED).toBe('IMPERSONATION_SESSION_REVOKED');
  });

  it('isImpersonationErrorCode narrows known values to the typed union', () => {
    for (const code of Object.values(IMPERSONATION_ERROR_CODES)) {
      expect(isImpersonationErrorCode(code)).toBe(true);
    }
  });

  it('isImpersonationErrorCode rejects unrelated 4xx error codes', () => {
    expect(isImpersonationErrorCode('PROFILE_MISSING')).toBe(false);
    expect(isImpersonationErrorCode('TOKEN_EXCHANGE_FAILED')).toBe(false);
    expect(isImpersonationErrorCode('NESTED_IMPERSONATION_FORBIDDEN')).toBe(false);
    expect(isImpersonationErrorCode(undefined)).toBe(false);
    expect(isImpersonationErrorCode(null)).toBe(false);
    expect(isImpersonationErrorCode(42)).toBe(false);
    expect(isImpersonationErrorCode('')).toBe(false);
  });
});
