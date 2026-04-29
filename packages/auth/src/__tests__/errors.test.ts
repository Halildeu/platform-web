// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { getHttpStatus, isUnauthorizedError, isForbiddenError, isServerError } from '../errors';

describe('errors helpers — Codex 019dd818 iter-4 (B-prime)', () => {
  describe('getHttpStatus', () => {
    it('returns status from axios-shaped error', () => {
      const err = { response: { status: 401 } };
      expect(getHttpStatus(err)).toBe(401);
    });

    it('returns undefined for plain Error', () => {
      expect(getHttpStatus(new Error('boom'))).toBeUndefined();
    });

    it('returns undefined for null/undefined', () => {
      expect(getHttpStatus(null)).toBeUndefined();
      expect(getHttpStatus(undefined)).toBeUndefined();
    });

    it('returns undefined when response.status is not a number', () => {
      const err = { response: { status: 'oops' } };
      expect(getHttpStatus(err)).toBeUndefined();
    });

    it('returns undefined for primitive value', () => {
      expect(getHttpStatus('string error')).toBeUndefined();
      expect(getHttpStatus(42)).toBeUndefined();
    });
  });

  describe('isUnauthorizedError', () => {
    it('true for 401', () => {
      expect(isUnauthorizedError({ response: { status: 401 } })).toBe(true);
    });

    it('false for 403', () => {
      expect(isUnauthorizedError({ response: { status: 403 } })).toBe(false);
    });

    it('false for 500', () => {
      expect(isUnauthorizedError({ response: { status: 500 } })).toBe(false);
    });

    it('false for network/unknown errors', () => {
      expect(isUnauthorizedError(new Error('network'))).toBe(false);
      expect(isUnauthorizedError(null)).toBe(false);
    });
  });

  describe('isForbiddenError', () => {
    it('true for 403', () => {
      expect(isForbiddenError({ response: { status: 403 } })).toBe(true);
    });

    it('false for 401', () => {
      expect(isForbiddenError({ response: { status: 401 } })).toBe(false);
    });
  });

  describe('isServerError', () => {
    it('true for 500/502/503', () => {
      expect(isServerError({ response: { status: 500 } })).toBe(true);
      expect(isServerError({ response: { status: 502 } })).toBe(true);
      expect(isServerError({ response: { status: 503 } })).toBe(true);
    });

    it('false for 401/403/404', () => {
      expect(isServerError({ response: { status: 401 } })).toBe(false);
      expect(isServerError({ response: { status: 403 } })).toBe(false);
      expect(isServerError({ response: { status: 404 } })).toBe(false);
    });

    it('false for unknown status', () => {
      expect(isServerError(null)).toBe(false);
      expect(isServerError(new Error('network'))).toBe(false);
    });
  });
});
