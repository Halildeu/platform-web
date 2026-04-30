// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { checkPermission, checkPermissionBatch, fetchAuthzVersion, fetchAuthzMe } from '../api';

describe('checkPermission — reason-aware (CNS-20260411-005)', () => {
  it('returns full CheckResponse with reason', async () => {
    const httpPost = vi.fn().mockResolvedValue({
      data: { allowed: true, reason: 'granted' },
    });

    const result = await checkPermission(httpPost, {
      relation: 'can_view',
      objectType: 'report',
      objectId: 'HR_REPORTS',
    });

    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('granted');
    expect(httpPost).toHaveBeenCalledWith('/v1/authz/check', {
      relation: 'can_view',
      objectType: 'report',
      objectId: 'HR_REPORTS',
    });
  });

  it('returns blocked reason when denied', async () => {
    const httpPost = vi.fn().mockResolvedValue({
      data: { allowed: false, reason: 'blocked' },
    });

    const result = await checkPermission(httpPost, {
      relation: 'can_edit',
      objectType: 'report',
      objectId: 'FINANCE_REPORTS',
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('blocked');
  });

  it('returns no_relation when no tuple exists', async () => {
    const httpPost = vi.fn().mockResolvedValue({
      data: { allowed: false, reason: 'no_relation' },
    });

    const result = await checkPermission(httpPost, {
      relation: 'can_manage',
      objectType: 'module',
      objectId: 'UNKNOWN',
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('no_relation');
  });

  it('propagates network errors', async () => {
    const httpPost = vi.fn().mockRejectedValue(new Error('network error'));

    await expect(
      checkPermission(httpPost, { relation: 'can_view', objectType: 'report', objectId: 'X' }),
    ).rejects.toThrow('network error');
  });
});

describe('checkPermissionBatch', () => {
  it('returns array of results', async () => {
    const httpPost = vi.fn().mockResolvedValue({
      data: {
        results: [
          {
            allowed: true,
            reason: 'granted',
            relation: 'can_view',
            objectType: 'report',
            objectId: 'HR',
          },
          {
            allowed: false,
            reason: 'blocked',
            relation: 'can_edit',
            objectType: 'report',
            objectId: 'FIN',
          },
          {
            allowed: false,
            reason: 'no_relation',
            relation: 'can_manage',
            objectType: 'module',
            objectId: 'X',
          },
        ],
      },
    });

    const results = await checkPermissionBatch(httpPost, [
      { relation: 'can_view', objectType: 'report', objectId: 'HR' },
      { relation: 'can_edit', objectType: 'report', objectId: 'FIN' },
      { relation: 'can_manage', objectType: 'module', objectId: 'X' },
    ]);

    expect(results).toHaveLength(3);
    expect(results[0].allowed).toBe(true);
    expect(results[0].reason).toBe('granted');
    expect(results[1].allowed).toBe(false);
    expect(results[1].reason).toBe('blocked');
    expect(results[2].reason).toBe('no_relation');

    expect(httpPost).toHaveBeenCalledWith('/v1/authz/batch-check', {
      checks: [
        { relation: 'can_view', objectType: 'report', objectId: 'HR' },
        { relation: 'can_edit', objectType: 'report', objectId: 'FIN' },
        { relation: 'can_manage', objectType: 'module', objectId: 'X' },
      ],
    });
  });

  it('handles empty batch', async () => {
    const httpPost = vi.fn().mockResolvedValue({
      data: { results: [] },
    });

    const results = await checkPermissionBatch(httpPost, []);
    expect(results).toHaveLength(0);
  });
});

describe('fetchAuthzVersion — Codex 019dd818 iter-4 (B-prime) 401 propagate', () => {
  it('propagates 401 (no -1 fallback)', async () => {
    const httpGet = vi.fn().mockRejectedValue({
      response: { status: 401 },
      message: 'Unauthorized',
    });

    await expect(fetchAuthzVersion(httpGet)).rejects.toMatchObject({
      response: { status: 401 },
    });
  });

  it('returns -1 for 5xx (transient retry next poll)', async () => {
    const httpGet = vi.fn().mockRejectedValue({
      response: { status: 503 },
      message: 'Service Unavailable',
    });

    const result = await fetchAuthzVersion(httpGet);
    expect(result).toBe(-1);
  });

  it('returns -1 for network error (no response)', async () => {
    const httpGet = vi.fn().mockRejectedValue(new Error('Network Error'));

    const result = await fetchAuthzVersion(httpGet);
    expect(result).toBe(-1);
  });

  it('returns version on success', async () => {
    const httpGet = vi.fn().mockResolvedValue({
      data: { authzVersion: 42 },
    });

    const result = await fetchAuthzVersion(httpGet);
    expect(result).toBe(42);
  });
});

describe('fetchAuthzMe — 401 propagation (no retry)', () => {
  it('propagates 401 immediately (no retry)', async () => {
    const httpGet = vi.fn().mockRejectedValue({
      response: { status: 401 },
    });

    await expect(fetchAuthzMe(httpGet)).rejects.toMatchObject({
      response: { status: 401 },
    });
    // Only 1 attempt — 4xx should not retry (existing 5xx-only retry policy).
    expect(httpGet).toHaveBeenCalledTimes(1);
  });
});

describe('fetchAuthzMe — empty/incomplete body transient guard (iter-34)', () => {
  // Live capture (Playwright on testai.acik.com 2026-04-30): the first
  // /authz/me hop returned HTTP 200 with content-length: 0 — the second
  // hop returned the full payload. PermissionProvider used to cache the
  // empty body silently and report superAdmin: undefined → drawer
  // canEdit collapsed to false.
  it('retries when first response body is empty (data === null)', async () => {
    const httpGet = vi
      .fn()
      .mockResolvedValueOnce({ data: null })
      .mockResolvedValueOnce({
        data: { userId: '1204', superAdmin: true, authzVersion: 47 },
      });
    const result = await fetchAuthzMe(httpGet);
    expect(result).toMatchObject({ userId: '1204', superAdmin: true });
    expect(httpGet).toHaveBeenCalledTimes(2);
  });

  it('retries when response body is "" coerced to empty object', async () => {
    const httpGet = vi
      .fn()
      .mockResolvedValueOnce({ data: '' as unknown as never })
      .mockResolvedValueOnce({
        data: { userId: '1204', superAdmin: true },
      });
    const result = await fetchAuthzMe(httpGet);
    expect(result).toMatchObject({ userId: '1204', superAdmin: true });
    expect(httpGet).toHaveBeenCalledTimes(2);
  });

  it('retries when response body has no userId (incomplete payload)', async () => {
    const httpGet = vi
      .fn()
      .mockResolvedValueOnce({ data: { superAdmin: false } as never })
      .mockResolvedValueOnce({
        data: { userId: '1204', superAdmin: true },
      });
    const result = await fetchAuthzMe(httpGet);
    expect(result.userId).toBe('1204');
    expect(httpGet).toHaveBeenCalledTimes(2);
  });

  it('throws after MAX_RETRIES exhaustion when body keeps coming back empty', async () => {
    const httpGet = vi.fn().mockResolvedValue({ data: null });
    await expect(fetchAuthzMe(httpGet)).rejects.toThrow(/empty body/i);
    expect(httpGet).toHaveBeenCalledTimes(3);
  });
});
