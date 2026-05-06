import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GridRequest } from '../../../grid';
import { requestsGrouping } from '../../../grid';

/*
 * PR-0.2 (reporting platform hardening, 2026-05) — coverage for the
 * new SSRM POST /query branch in fetchReportData.
 *
 * The legacy GET /v1/reports/{key}/data path stays for flat queries
 * (page/pageSize/filterModel/sort). When the AG Grid request expresses
 * any grouping intent (rowGroupCols / valueCols / pivotCols / pivotMode
 * / groupKeys) we route to POST /v1/reports/{key}/query so the backend
 * GROUP BY / aggregation / ancestor-filter pipeline takes over.
 *
 * Tests use vitest module mocks against the @mfe/shared-http API so we
 * can assert the URL + method + body shape without spinning up a
 * server. The shell-services mock exposes a stub http instance so the
 * resolveHttpClient() helper returns it.
 */

/*
 * vi.hoisted lifts the mock instances above the vi.mock() factories
 * so the factories can reference them without hitting Temporal Dead
 * Zone when vitest hoists vi.mock() to the top of the file.
 */
const { mockGet, mockPost, stubClient } = vi.hoisted(() => {
  const mockGet = vi.fn();
  const mockPost = vi.fn();
  return {
    mockGet,
    mockPost,
    stubClient: { get: mockGet, post: mockPost },
  };
});

vi.mock('../../../app/services/shell-services', () => ({
  getShellServices: () => ({
    http: stubClient,
    auth: { getUser: () => ({ permissions: [] }) },
  }),
}));

/*
 * Mock the full @mfe/shared-http surface — other modules in this
 * package (e.g. design-system grid-variants) import getGatewayBaseUrl
 * and other helpers, so a partial mock that only provides `api`
 * crashes the test runner when those helpers come up null.
 */
vi.mock('@mfe/shared-http', () => ({
  api: stubClient,
  getGatewayBaseUrl: () => '',
  buildAuthHeaders: () => ({}),
  registerTokenResolver: () => undefined,
}));

// Import AFTER the mocks so resolveHttpClient picks up the stub.
import { fetchReportData, ReportQueryError } from '../api';

describe('requestsGrouping', () => {
  it('returns false on a flat request', () => {
    const req: GridRequest = { page: 1, pageSize: 50 };
    expect(requestsGrouping(req)).toBe(false);
  });

  it('returns true when rowGroupCols is non-empty', () => {
    const req: GridRequest = {
      page: 1,
      pageSize: 50,
      rowGroupCols: [{ id: 'category', field: 'category', displayName: 'Category' } as any],
    };
    expect(requestsGrouping(req)).toBe(true);
  });

  it('returns true when valueCols is non-empty', () => {
    const req: GridRequest = {
      page: 1,
      pageSize: 50,
      valueCols: [
        { id: 'amount', field: 'amount', displayName: 'Amount', aggFunc: 'sum' } as any,
      ],
    };
    expect(requestsGrouping(req)).toBe(true);
  });

  it('returns true when pivotMode is true', () => {
    const req: GridRequest = { page: 1, pageSize: 50, pivotMode: true };
    expect(requestsGrouping(req)).toBe(true);
  });

  it('returns true when groupKeys is non-empty', () => {
    const req: GridRequest = { page: 1, pageSize: 50, groupKeys: ['FIN'] };
    expect(requestsGrouping(req)).toBe(true);
  });
});

describe('fetchReportData routing (PR-0.2 SSRM data path)', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('flat request keeps using GET /data', async () => {
    mockGet.mockResolvedValueOnce({
      data: { items: [{ id: 1 }], total: 1, page: 1, pageSize: 50 },
    });
    const req: GridRequest = { page: 1, pageSize: 50 };
    const res = await fetchReportData('any', { search: '' }, req);
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockPost).not.toHaveBeenCalled();
    const url = mockGet.mock.calls[0]?.[0] as string;
    expect(url.startsWith('/v1/reports/any/data')).toBe(true);
    expect(res.rows).toHaveLength(1);
    expect(res.total).toBe(1);
  });

  it('grouping request switches to POST /query with structured body', async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        items: [{ category: 'FIN', _rowCount: 12, amount: 1234.56 }],
        total: 5,
        page: 1,
        pageSize: 50,
      },
    });
    const req: GridRequest = {
      page: 1,
      pageSize: 50,
      startRow: 0,
      endRow: 50,
      rowGroupCols: [
        { id: 'category', field: 'category', displayName: 'Category' } as any,
      ],
      valueCols: [
        { id: 'amount', field: 'amount', displayName: 'Amount', aggFunc: 'sum' } as any,
      ],
    };
    const res = await fetchReportData('any', { search: '' }, req);

    expect(mockGet).not.toHaveBeenCalled();
    expect(mockPost).toHaveBeenCalledTimes(1);
    const [url, body] = mockPost.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe('/v1/reports/any/query');
    expect(body.startRow).toBe(0);
    expect(body.endRow).toBe(50);
    expect(Array.isArray(body.rowGroupCols)).toBe(true);
    expect((body.rowGroupCols as Array<{ field: string }>)[0]?.field).toBe('category');
    expect(Array.isArray(body.valueCols)).toBe(true);
    expect(body.pivotMode).toBe(false);
    expect(res.rows).toHaveLength(1);
    expect(res.total).toBe(5);
  });

  it('expansion request forwards groupKeys verbatim', async () => {
    mockPost.mockResolvedValueOnce({
      data: { items: [], total: 0, page: 1, pageSize: 50 },
    });
    const req: GridRequest = {
      page: 1,
      pageSize: 50,
      rowGroupCols: [
        { id: 'category', field: 'category', displayName: 'Category' } as any,
        { id: 'region', field: 'region', displayName: 'Region' } as any,
      ],
      groupKeys: ['FIN'],
    };
    await fetchReportData('any', { search: '' }, req);
    const [, body] = mockPost.mock.calls[0] as [string, Record<string, unknown>];
    expect(body.groupKeys).toEqual(['FIN']);
    // The backend reads groupKeys.size to compute the current expansion
    // level — we must not silently truncate or mutate the array.
    expect((body.rowGroupCols as unknown[]).length).toBe(2);
  });

  it('400 GROUPING_NOT_SUPPORTED surfaces a ReportQueryError with .code', async () => {
    mockPost.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          code: 'GROUPING_NOT_SUPPORTED',
          message: 'Server-side grouping/pivot not yet enabled',
        },
      },
    });
    const req: GridRequest = {
      page: 1,
      pageSize: 50,
      rowGroupCols: [{ id: 'x', field: 'x', displayName: 'X' } as any],
    };

    let thrown: unknown;
    try {
      await fetchReportData('any', { search: '' }, req);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(ReportQueryError);
    expect((thrown as ReportQueryError).code).toBe('GROUPING_NOT_SUPPORTED');
    expect((thrown as ReportQueryError).status).toBe(400);
    expect((thrown as ReportQueryError).message).toMatch(/GROUPING_NOT_SUPPORTED/);
  });

  it('400 INVALID_AGGREGATION_REQUEST surfaces a ReportQueryError with .code', async () => {
    mockPost.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          code: 'INVALID_AGGREGATION_REQUEST',
          message: 'valueCols field is not aggregatable: sensitive_col',
        },
      },
    });
    const req: GridRequest = {
      page: 1,
      pageSize: 50,
      rowGroupCols: [{ id: 'x', field: 'x', displayName: 'X' } as any],
      valueCols: [
        { id: 'sensitive_col', field: 'sensitive_col', displayName: 'X', aggFunc: 'sum' } as any,
      ],
    };

    let thrown: unknown;
    try {
      await fetchReportData('any', { search: '' }, req);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(ReportQueryError);
    expect((thrown as ReportQueryError).code).toBe('INVALID_AGGREGATION_REQUEST');
  });

  it('endRow falls off resolved startRow when caller only set startRow', async () => {
    // Codex iter-1 absorb edge case: a hand-crafted SSRM mock with
    // startRow set but endRow undefined must not derive endRow from a
    // different base (would shift the cache window and trigger
    // NON_ALIGNED_ROW_WINDOW on the backend).
    mockPost.mockResolvedValueOnce({
      data: { items: [], total: 0, page: 1, pageSize: 50 },
    });
    const req: GridRequest = {
      page: 2, // → computedStart=50
      pageSize: 50,
      startRow: 100, // explicit override
      // endRow intentionally omitted
      rowGroupCols: [{ id: 'x', field: 'x', displayName: 'X' } as any],
    };
    await fetchReportData('any', { search: '' }, req);
    const [, body] = mockPost.mock.calls[0] as [string, Record<string, unknown>];
    expect(body.startRow).toBe(100);
    // resolvedStart=100 → endRow=100+50=150, NOT 50+50=100 (which
    // would have been the buggy pre-absorb behaviour).
    expect(body.endRow).toBe(150);
  });

  it('401 from /query becomes the standard authorization message', async () => {
    mockPost.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 401, data: {} },
    });
    const req: GridRequest = {
      page: 1,
      pageSize: 50,
      pivotMode: true, // any grouping intent is enough to take the POST branch
    };
    await expect(fetchReportData('any', { search: '' }, req)).rejects.toThrow(
      'Rapor verileri için yetki bulunmuyor',
    );
  });
});
