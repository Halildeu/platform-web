import { describe, it, expect } from 'vitest';

import {
  classifyCapabilityError,
  httpStatusOf,
  RETRYABLE_KINDS,
  FLEET_CAPABILITY_POLICY,
  FEATURE_FLAGGED_POLICY,
  RESOURCE_DETAIL_POLICY,
} from '../classify';

/**
 * Codex 019f67ba S4a acceptance matrix. The core guardrail under test: an HTTP
 * status is NOT a universal feature-state contract — the SAME status classifies
 * differently by endpoint policy, and non-HTTP/parse/undefined errors never become
 * a capability verdict.
 */

// RTK FetchBaseQueryError shapes.
const http = (status: number, data?: unknown) => ({ status, data });
const fetchError = { status: 'FETCH_ERROR', error: 'TypeError: failed to fetch' };
const timeoutError = { status: 'TIMEOUT_ERROR', error: 'AbortError' };
const parsingError = {
  status: 'PARSING_ERROR',
  originalStatus: 500,
  data: '<html>',
  error: 'bad json',
};
const customError = { status: 'CUSTOM_ERROR', error: 'nope' };

describe('classifyCapabilityError — HTTP status × endpoint policy', () => {
  it('403 → forbidden (any endpoint)', () => {
    expect(classifyCapabilityError(http(403), FLEET_CAPABILITY_POLICY)).toBe('forbidden');
    expect(classifyCapabilityError(http(403), RESOURCE_DETAIL_POLICY)).toBe('forbidden');
  });

  it('401 is a SESSION concern → error, NEVER forbidden', () => {
    expect(classifyCapabilityError(http(401), FLEET_CAPABILITY_POLICY)).toBe('error');
    expect(classifyCapabilityError(http(401))).not.toBe('forbidden');
  });

  it('404 on a capability-list endpoint → notEnabled', () => {
    expect(classifyCapabilityError(http(404), FLEET_CAPABILITY_POLICY)).toBe('notEnabled');
  });

  it('404 on a detail/resource endpoint → generic error, NOT notEnabled', () => {
    expect(classifyCapabilityError(http(404), RESOURCE_DETAIL_POLICY)).toBe('error');
    expect(classifyCapabilityError(http(404))).toBe('error'); // no policy = plain HTTP meaning
  });

  it('503 with a documented dark-ship flag → disabled', () => {
    expect(classifyCapabilityError(http(503), FEATURE_FLAGGED_POLICY)).toBe('disabled');
  });

  it('503 without a disabled contract → temporarilyUnavailable, NOT disabled', () => {
    expect(classifyCapabilityError(http(503), FLEET_CAPABILITY_POLICY)).toBe(
      'temporarilyUnavailable',
    );
    expect(classifyCapabilityError(http(503))).toBe('temporarilyUnavailable');
  });

  it('other 5xx/4xx → generic error', () => {
    expect(classifyCapabilityError(http(500), FLEET_CAPABILITY_POLICY)).toBe('error');
    expect(classifyCapabilityError(http(400), FLEET_CAPABILITY_POLICY)).toBe('error');
    expect(classifyCapabilityError(http(409))).toBe('error');
  });
});

describe('classifyCapabilityError — non-HTTP errors never become a capability verdict', () => {
  it('FETCH_ERROR / TIMEOUT_ERROR / PARSING_ERROR / CUSTOM_ERROR → error', () => {
    for (const e of [fetchError, timeoutError, parsingError, customError]) {
      expect(classifyCapabilityError(e, FLEET_CAPABILITY_POLICY)).toBe('error');
    }
  });

  it("a PARSING_ERROR's originalStatus is ignored (unparseable body ≠ capability state)", () => {
    // originalStatus 500 would be 'error' anyway; prove a 404 originalStatus does NOT become notEnabled.
    const parsed404 = { status: 'PARSING_ERROR', originalStatus: 404, data: '<html>', error: 'x' };
    expect(classifyCapabilityError(parsed404, FLEET_CAPABILITY_POLICY)).toBe('error');
  });

  it('undefined / null / plain object → error (never empty or notEnabled)', () => {
    expect(classifyCapabilityError(undefined, FLEET_CAPABILITY_POLICY)).toBe('error');
    expect(classifyCapabilityError(null)).toBe('error');
    expect(classifyCapabilityError({})).toBe('error');
    expect(classifyCapabilityError('boom')).toBe('error');
  });
});

describe('classifyCapabilityError — structured problem code is the durable contract (wins over status)', () => {
  it('FEATURE_DISABLED on any status → disabled', () => {
    expect(classifyCapabilityError(http(500, { code: 'FEATURE_DISABLED' }))).toBe('disabled');
    expect(classifyCapabilityError(http(200, { code: 'feature_disabled' }))).toBe('disabled'); // case-insensitive
  });

  it('MODULE_NOT_INSTALLED / MODULE_NOT_ENABLED → notEnabled even on a detail endpoint', () => {
    expect(
      classifyCapabilityError(http(404, { code: 'MODULE_NOT_INSTALLED' }), RESOURCE_DETAIL_POLICY),
    ).toBe('notEnabled');
    expect(classifyCapabilityError(http(400, { code: 'MODULE_NOT_ENABLED' }))).toBe('notEnabled');
  });

  it('DEPENDENCY_UNAVAILABLE → temporarilyUnavailable', () => {
    expect(classifyCapabilityError(http(500, { code: 'DEPENDENCY_UNAVAILABLE' }))).toBe(
      'temporarilyUnavailable',
    );
  });

  it('an unknown code falls through to the status/policy path', () => {
    expect(classifyCapabilityError(http(403, { code: 'SOMETHING_ELSE' }))).toBe('forbidden');
  });
});

describe('httpStatusOf', () => {
  it('numeric status → number; string/absent → undefined', () => {
    expect(httpStatusOf(http(404))).toBe(404);
    expect(httpStatusOf(fetchError)).toBeUndefined();
    expect(httpStatusOf(undefined)).toBeUndefined();
    expect(httpStatusOf({})).toBeUndefined();
  });
});

describe('RETRYABLE_KINDS', () => {
  it('only error + temporarilyUnavailable are retryable', () => {
    expect(RETRYABLE_KINDS.has('error')).toBe(true);
    expect(RETRYABLE_KINDS.has('temporarilyUnavailable')).toBe(true);
    for (const k of ['forbidden', 'notEnabled', 'disabled', 'empty'] as const) {
      expect(RETRYABLE_KINDS.has(k)).toBe(false);
    }
  });
});
