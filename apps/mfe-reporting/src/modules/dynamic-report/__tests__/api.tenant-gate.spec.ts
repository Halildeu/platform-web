// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AxiosError } from 'axios';

/**
 * PR-FE-3 (Codex thread 019e08e2 iter-11 AGREE absorb, 2026-05-08):
 * verifies the tenant_selection_required typed error path on
 * fetchReportMetadata, fetchReportData (flat), and the grouped query
 * helper. Other 400 surfaces preserve their pre-fix behaviour.
 */

const { mockGet, mockPost } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
}));

vi.mock('../../../app/services/shell-services', () => ({
  getShellServices: () => ({
    http: {
      get: mockGet,
      post: mockPost,
    },
    // Codex 019e3ab8: fetchReportData now gates on auth.ready(); the
    // tenant-gate tests need a ready auth FSM so the request reaches
    // the backend and the 400 tenant_selection_required surfaces.
    auth: { ready: () => Promise.resolve({ ok: true }) },
  }),
}));

import {
  fetchReportMetadata,
  fetchReportData,
  TenantSelectionRequiredError,
  isTenantSelectionRequiredError,
} from '../api';

const tenantGateAxiosError = (reportKey: string, hint?: string): AxiosError => {
  const err = new Error('Request failed with status code 400') as AxiosError;
  err.isAxiosError = true;
  err.name = 'AxiosError';
  err.response = {
    status: 400,
    statusText: 'Bad Request',
    headers: {},
    config: {} as never,
    data: {
      error: 'tenant_selection_required',
      reportKey,
      message: `Yearly report '${reportKey}' requires an explicit COMPANY scope; no scope present in authz context (super-admin matched).`,
      hint,
    },
  } as never;
  err.toJSON = () => ({});
  return err;
};

const genericBadRequestError = (): AxiosError => {
  const err = new Error('Request failed with status code 400') as AxiosError;
  err.isAxiosError = true;
  err.name = 'AxiosError';
  err.response = {
    status: 400,
    statusText: 'Bad Request',
    headers: {},
    config: {} as never,
    data: { error: 'BAD_REQUEST', message: 'Sorgu yapısı reddedildi' },
  } as never;
  err.toJSON = () => ({});
  return err;
};

describe('PR-FE-3 tenant gate (api.ts)', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('fetchReportMetadata: 400 tenant_selection_required → throws TenantSelectionRequiredError', async () => {
    mockGet.mockRejectedValueOnce(tenantGateAxiosError('fin-muhasebe-detay', 'Bir şirket seçin.'));

    let caught: unknown = null;
    try {
      await fetchReportMetadata('fin-muhasebe-detay');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(TenantSelectionRequiredError);
    expect(isTenantSelectionRequiredError(caught)).toBe(true);
    expect((caught as TenantSelectionRequiredError).reportKey).toBe('fin-muhasebe-detay');
    expect((caught as TenantSelectionRequiredError).hint).toBe('Bir şirket seçin.');
  });

  it('fetchReportMetadata: generic 400 (non-tenant) → preserves legacy axios error', async () => {
    mockGet.mockRejectedValueOnce(genericBadRequestError());

    let caught: unknown = null;
    try {
      await fetchReportMetadata('demo-report');
    } catch (err) {
      caught = err;
    }

    expect(caught).not.toBeNull();
    expect(isTenantSelectionRequiredError(caught)).toBe(false);
  });

  it('fetchReportData (flat): 400 tenant_selection_required → throws typed error', async () => {
    mockGet.mockRejectedValueOnce(tenantGateAxiosError('fin-muhasebe-detay'));

    let caught: unknown = null;
    try {
      await fetchReportData('fin-muhasebe-detay', { search: '' }, {
        startRow: 0,
        endRow: 50,
        page: 1,
        pageSize: 50,
      } as never);
    } catch (err) {
      caught = err;
    }

    expect(isTenantSelectionRequiredError(caught)).toBe(true);
  });

  it('fetchReportData (flat): generic 400 → preserves "Rapor verileri alınamadı (HTTP 400)"', async () => {
    mockGet.mockRejectedValueOnce(genericBadRequestError());

    let caught: unknown = null;
    try {
      await fetchReportData('demo-report', { search: '' }, {
        startRow: 0,
        endRow: 50,
        page: 1,
        pageSize: 50,
      } as never);
    } catch (err) {
      caught = err;
    }

    expect(isTenantSelectionRequiredError(caught)).toBe(false);
    expect((caught as Error).message).toContain('HTTP 400');
  });

  it('fetchReportData (grouped POST /query): 400 tenant_selection_required → throws typed error', async () => {
    mockPost.mockRejectedValueOnce(tenantGateAxiosError('fin-muhasebe-detay'));

    let caught: unknown = null;
    try {
      await fetchReportData('fin-muhasebe-detay', { search: '' }, {
        startRow: 0,
        endRow: 50,
        page: 1,
        pageSize: 50,
        rowGroupCols: [{ id: 'depot' }],
        groupKeys: [],
      } as never);
    } catch (err) {
      caught = err;
    }

    expect(isTenantSelectionRequiredError(caught)).toBe(true);
  });

  it('isTenantSelectionRequiredError: cross-MF safe (name-based)', () => {
    const fake = Object.assign(new Error('tenant_selection_required:foo'), {
      name: 'TenantSelectionRequiredError',
      reportKey: 'foo',
    });

    expect(isTenantSelectionRequiredError(fake)).toBe(true);
    expect(isTenantSelectionRequiredError(new Error('something else'))).toBe(false);
    expect(isTenantSelectionRequiredError(null)).toBe(false);
    expect(isTenantSelectionRequiredError(undefined)).toBe(false);
  });
});
