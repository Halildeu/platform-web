// @vitest-environment jsdom
//
// Codex 019e27bf fresh-context audit follow-up — unit coverage for the
// shared friendlyImpersonationErrorMessage helper. Previously the same
// resolution logic lived inline in two component files (ImpersonateAction
// + UserActions); this consolidates the regression coverage too.

import { describe, expect, it } from 'vitest';
import {
  IMPERSONATION_ERROR_MESSAGES,
  friendlyImpersonationErrorMessage,
} from '../impersonation-error-messages';

describe('friendlyImpersonationErrorMessage — shared helper coverage', () => {
  it('returns Spring VALIDATION_ERROR message verbatim (BUG #3 path)', () => {
    const validationErr = new Error('Sebep en az 10 karakter olmalı') as Error & {
      errorCode?: string;
    };
    validationErr.errorCode = 'VALIDATION_ERROR';
    expect(friendlyImpersonationErrorMessage(validationErr)).toBe(
      'Sebep en az 10 karakter olmalı',
    );
  });

  it('maps SELF_IMPERSONATION_FORBIDDEN to Turkish message via prefix match', () => {
    const err = new Error('SELF_IMPERSONATION_FORBIDDEN: backend message');
    expect(friendlyImpersonationErrorMessage(err)).toBe(
      'Kendi hesabını impersonate edemezsin.',
    );
  });

  it('maps TARGET_SUBJECT_UNRESOLVABLE branch correctly', () => {
    const err = new Error('TARGET_SUBJECT_UNRESOLVABLE downstream raw');
    expect(friendlyImpersonationErrorMessage(err)).toBe(
      IMPERSONATION_ERROR_MESSAGES.TARGET_SUBJECT_UNRESOLVABLE,
    );
  });

  it('maps both ACTIVE_SESSION_EXISTS aliases to the same message', () => {
    const aliasA = new Error('ACTIVE_SESSION_EXISTS upstream raw');
    const aliasB = new Error('ACTIVE_IMPERSONATION_EXISTS upstream raw');
    const expected = IMPERSONATION_ERROR_MESSAGES.ACTIVE_SESSION_EXISTS;
    expect(friendlyImpersonationErrorMessage(aliasA)).toBe(expected);
    expect(friendlyImpersonationErrorMessage(aliasB)).toBe(expected);
  });

  it('returns the raw Error.message when no code matches', () => {
    const err = new Error('Some unmapped backend message');
    expect(friendlyImpersonationErrorMessage(err)).toBe('Some unmapped backend message');
  });

  it('returns a generic fallback for non-Error throwables', () => {
    expect(friendlyImpersonationErrorMessage('string thrown')).toBe(
      'Impersonation başlatılamadı.',
    );
    expect(friendlyImpersonationErrorMessage(null)).toBe('Impersonation başlatılamadı.');
    expect(friendlyImpersonationErrorMessage(undefined)).toBe(
      'Impersonation başlatılamadı.',
    );
  });

  it('handles Error without a message gracefully', () => {
    const err = new Error();
    expect(friendlyImpersonationErrorMessage(err)).toBe('Impersonation başlatılamadı.');
  });

  it('VALIDATION_ERROR with empty message falls through to code lookup', () => {
    const err = new Error('') as Error & { errorCode?: string };
    err.errorCode = 'VALIDATION_ERROR';
    // Empty message → not used verbatim; falls through.
    expect(friendlyImpersonationErrorMessage(err)).toBe('Impersonation başlatılamadı.');
  });
});
