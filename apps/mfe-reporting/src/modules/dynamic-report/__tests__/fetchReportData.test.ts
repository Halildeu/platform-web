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
const { mockGet, mockPost, stubClient, authEpochHolder } = vi.hoisted(() => {
  const mockGet = vi.fn();
  const mockPost = vi.fn();
  return {
    mockGet,
    mockPost,
    stubClient: { get: mockGet, post: mockPost },
    // PR-0.5c: mutable auth epoch so a test can bump it between two
    // fetchFilterValues() calls and assert the cache invalidates.
    authEpochHolder: { value: 1 },
  };
});

vi.mock('../../../app/services/shell-services', () => ({
  getShellServices: () => ({
    http: stubClient,
    auth: {
      getUser: () => ({ permissions: [] }),
      getEpoch: () => authEpochHolder.value,
    },
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
import {
  clearFilterValuesCache,
  exportReportData,
  fetchFilterValues,
  fetchReportData,
  ReportQueryError,
} from '../api';

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
      valueCols: [{ id: 'amount', field: 'amount', displayName: 'Amount', aggFunc: 'sum' } as any],
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
      rowGroupCols: [{ id: 'category', field: 'category', displayName: 'Category' } as any],
      valueCols: [{ id: 'amount', field: 'amount', displayName: 'Amount', aggFunc: 'sum' } as any],
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

  /*
   * PR-0.5a (Codex thread 019e2c61): grand total row response
   * forwarding. The backend emits an optional grandTotalRow on root
   * grouped requests; the API layer must surface it on GridResponse
   * so ReportPage can wire pinnedBottomRowData. Null values inside
   * the row are legitimate (empty filter set, weightedavg denominator
   * zero, percentile over empty set).
   */
  it('forwards grandTotalRow when backend emits it on a root grouped response', async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        items: [{ category: 'FIN', _rowCount: 12, amount: 1234.56 }],
        total: 5,
        page: 1,
        pageSize: 50,
        grandTotalRow: { amount: 9999.99, median_amount: null },
      },
    });
    const req: GridRequest = {
      page: 1,
      pageSize: 50,
      rowGroupCols: [{ id: 'category', field: 'category', displayName: 'Category' } as any],
      valueCols: [{ id: 'amount', field: 'amount', displayName: 'Amount', aggFunc: 'sum' } as any],
    };

    const res = await fetchReportData('any', { search: '' }, req);

    expect(res.grandTotalRow).toEqual({ amount: 9999.99, median_amount: null });
  });

  it('leaves grandTotalRow undefined when backend omits it (child / flat / pivot)', async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        items: [{ category: 'FIN', _rowCount: 12 }],
        total: 1,
        page: 1,
        pageSize: 50,
        // grandTotalRow intentionally absent — backend's @JsonInclude(NON_NULL)
        // path on child-store / pivot / flat responses.
      },
    });
    const req: GridRequest = {
      page: 1,
      pageSize: 50,
      rowGroupCols: [{ id: 'category', field: 'category', displayName: 'Category' } as any],
      groupKeys: ['FIN'],
    };

    const res = await fetchReportData('any', { search: '' }, req);

    expect(res.grandTotalRow).toBeUndefined();
  });

  it('drops malformed grandTotalRow values defensively (rolling-deploy mismatch)', async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        items: [],
        total: 0,
        page: 1,
        pageSize: 50,
        // Primitive / array shapes shouldn't be possible per the
        // backend contract; defensive guard for rolling deploys.
        grandTotalRow: 'not-an-object',
      },
    });
    const req: GridRequest = {
      page: 1,
      pageSize: 50,
      rowGroupCols: [{ id: 'category', field: 'category', displayName: 'Category' } as any],
    };

    const res = await fetchReportData('any', { search: '' }, req);

    expect(res.grandTotalRow).toBeUndefined();
  });
});

/*
 * PR-0.5b (Codex thread 019e2cd7): exportReportData dispatch tests.
 * Grouping/pivot grid state → POST /export with normalised body;
 * flat / no grid state → legacy GET /export.
 */
describe('exportReportData routing (PR-0.5b export path)', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('flat call (no gridState) uses GET /export', async () => {
    mockGet.mockResolvedValueOnce({ data: new Blob(['csv content']) });

    await exportReportData('any', { search: 'hello' }, 'csv');

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockPost).not.toHaveBeenCalled();
    const url = mockGet.mock.calls[0]?.[0] as string;
    expect(url.startsWith('/v1/reports/any/export?')).toBe(true);
    expect(url).toContain('format=csv');
    expect(url).toContain('search=hello');
  });

  it('grouping intent in gridState dispatches POST /export', async () => {
    mockPost.mockResolvedValueOnce({ data: new Blob(['csv content']) });

    await exportReportData('any', { search: '' }, 'excel', {
      rowGroupCols: [{ id: 'category', field: 'category', displayName: 'Category' } as any],
      valueCols: [
        {
          id: 'amount',
          field: 'amount',
          displayName: 'Amount',
          aggFunc: 'sum',
        } as any,
      ],
      pivotCols: [],
      pivotMode: false,
      filterModel: { category: { type: 'equals', filter: 'FIN' } },
      sortModel: [{ colId: 'category', sort: 'asc' }],
    });

    expect(mockGet).not.toHaveBeenCalled();
    expect(mockPost).toHaveBeenCalledTimes(1);
    const [url, body] = mockPost.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe('/v1/reports/any/export');
    expect(body.format).toBe('xlsx');
    expect(Array.isArray(body.rowGroupCols)).toBe(true);
    expect((body.rowGroupCols as any[])[0]?.field).toBe('category');
    expect((body.valueCols as any[])[0]?.aggFunc).toBe('sum');
    expect(body.pivotMode).toBe(false);
    expect(body.filterModel).toEqual({
      category: { type: 'equals', filter: 'FIN' },
    });
  });

  it('pivot intent in gridState dispatches POST /export with pivot fields', async () => {
    mockPost.mockResolvedValueOnce({ data: new Blob(['xlsx content']) });

    await exportReportData('any', { search: '' }, 'excel', {
      rowGroupCols: [{ id: 'category', field: 'category', displayName: 'Category' } as any],
      valueCols: [{ id: 'amount', field: 'amount', displayName: 'Amount', aggFunc: 'sum' } as any],
      pivotCols: [{ id: 'ba', field: 'ba', displayName: 'B/A' } as any],
      pivotMode: true,
      filterModel: {},
      sortModel: [],
    });

    expect(mockPost).toHaveBeenCalledTimes(1);
    const [, body] = mockPost.mock.calls[0] as [string, Record<string, unknown>];
    expect(body.pivotMode).toBe(true);
    expect((body.pivotCols as any[])[0]?.field).toBe('ba');
  });

  it('flat gridState (no grouping intent) falls through to GET /export', async () => {
    mockGet.mockResolvedValueOnce({ data: new Blob(['csv content']) });

    await exportReportData('any', { search: '' }, 'csv', {
      rowGroupCols: [],
      valueCols: [],
      pivotCols: [],
      pivotMode: false,
      filterModel: {},
      sortModel: [],
    });

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('POST 400 parses structured ReportQueryError from blob body', async () => {
    const errorPayload = JSON.stringify({
      code: 'INVALID_AGGREGATION_REQUEST',
      message: 'valueCols field is not aggregatable: note',
    });
    mockPost.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: new Blob([errorPayload], { type: 'application/json' }),
      },
    });

    await expect(
      exportReportData('any', { search: '' }, 'csv', {
        rowGroupCols: [{ id: 'category', field: 'category', displayName: 'Category' } as any],
        valueCols: [{ id: 'note', field: 'note', displayName: 'Note', aggFunc: 'sum' } as any],
        pivotCols: [],
        pivotMode: false,
        filterModel: {},
        sortModel: [],
      }),
    ).rejects.toMatchObject({
      name: 'ReportQueryError',
      message: expect.stringContaining('INVALID_AGGREGATION_REQUEST'),
    });
  });

  // PR-0.5b iter-2 absorb (Codex 019e2cfe Finding #1): normalisation
  // happens before dispatch. Stale/incomplete snapshots that collapse
  // to flat must NOT POST; backend would 400 GROUPING_NOT_SUPPORTED.
  it('stale valueCols only (no rowGroup) normalises to flat and uses GET /export', async () => {
    mockGet.mockResolvedValueOnce({ data: new Blob(['csv content']) });

    await exportReportData('any', { search: '' }, 'csv', {
      rowGroupCols: [],
      valueCols: [{ id: 'amount', field: 'amount', displayName: 'Amount', aggFunc: 'sum' } as any],
      pivotCols: [],
      pivotMode: false,
      filterModel: {},
      sortModel: [],
    });

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('pivotMode only (no rowGroup) normalises to flat and uses GET /export', async () => {
    mockGet.mockResolvedValueOnce({ data: new Blob(['csv content']) });

    await exportReportData('any', { search: '' }, 'csv', {
      rowGroupCols: [],
      valueCols: [],
      pivotCols: [{ id: 'ba', field: 'ba', displayName: 'B/A' } as any],
      pivotMode: true,
      filterModel: {},
      sortModel: [],
    });

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('incomplete pivot (rowGroup but no pivotCols) normalises to grouped (POSTs without pivotMode)', async () => {
    mockPost.mockResolvedValueOnce({ data: new Blob(['csv content']) });

    await exportReportData('any', { search: '' }, 'csv', {
      rowGroupCols: [{ id: 'category', field: 'category', displayName: 'Category' } as any],
      valueCols: [{ id: 'amount', field: 'amount', displayName: 'Amount', aggFunc: 'sum' } as any],
      pivotCols: [],
      pivotMode: true, // incomplete: no pivotCols
      filterModel: {},
      sortModel: [],
    });

    expect(mockPost).toHaveBeenCalledTimes(1);
    const [, body] = mockPost.mock.calls[0] as [string, Record<string, unknown>];
    // Normalizer dropped pivotMode → backend dispatches to grouped.
    expect(body.pivotMode).toBe(false);
  });

  it('POST 400 with non-JSON Blob falls back to generic ReportQueryError', async () => {
    // Codex iter-2 §3 defensive: empty / non-JSON body must not crash
    // the error parser.
    mockPost.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 400, data: new Blob(['plain text error']) },
    });

    await expect(
      exportReportData('any', { search: '' }, 'csv', {
        rowGroupCols: [{ id: 'category', field: 'category', displayName: 'Category' } as any],
        valueCols: [
          { id: 'amount', field: 'amount', displayName: 'Amount', aggFunc: 'sum' } as any,
        ],
        pivotCols: [],
        pivotMode: false,
        filterModel: {},
        sortModel: [],
      }),
    ).rejects.toMatchObject({
      name: 'ReportQueryError',
      message: expect.stringContaining('BAD_REQUEST'),
    });
  });

  it('POST 401 maps to authorization error message', async () => {
    mockPost.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 401, data: new Blob([]) },
    });

    await expect(
      exportReportData('any', { search: '' }, 'csv', {
        rowGroupCols: [{ id: 'category', field: 'category', displayName: 'Category' } as any],
        valueCols: [
          { id: 'amount', field: 'amount', displayName: 'Amount', aggFunc: 'sum' } as any,
        ],
        pivotCols: [],
        pivotMode: false,
        filterModel: {},
        sortModel: [],
      }),
    ).rejects.toThrow('Rapor verileri için yetki bulunmuyor');
  });
});

/*
 * PR-0.5c (Codex thread 019e2d54): fetchFilterValues — set filter
 * distinct values lookup with a 60s in-memory cache.
 */
describe('fetchFilterValues (PR-0.5c set filter values)', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    clearFilterValuesCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GETs /filter-values with the column param and maps the response', async () => {
    mockGet.mockResolvedValueOnce({
      data: { values: ['Ankara', 'Istanbul', null], limit: 1000, truncated: false },
    });

    const result = await fetchFilterValues('any', 'city');

    expect(mockGet).toHaveBeenCalledTimes(1);
    const url = mockGet.mock.calls[0]?.[0] as string;
    expect(url.startsWith('/v1/reports/any/filter-values?')).toBe(true);
    expect(url).toContain('column=city');
    expect(result.values).toEqual(['Ankara', 'Istanbul', null]);
    expect(result.limit).toBe(1000);
    expect(result.truncated).toBe(false);
  });

  it('forwards the search param when provided', async () => {
    mockGet.mockResolvedValueOnce({
      data: { values: ['Istanbul'], limit: 1000, truncated: false },
    });

    await fetchFilterValues('any', 'city', 'ist');

    const url = mockGet.mock.calls[0]?.[0] as string;
    expect(url).toContain('search=ist');
  });

  it('caches the result — a second identical call does not hit the network', async () => {
    mockGet.mockResolvedValueOnce({
      data: { values: ['Ankara'], limit: 1000, truncated: false },
    });

    const first = await fetchFilterValues('any', 'city');
    const second = await fetchFilterValues('any', 'city');

    expect(mockGet).toHaveBeenCalledTimes(1); // cache hit on the 2nd
    expect(second).toEqual(first);
  });

  it('different column / search → separate cache entries', async () => {
    mockGet
      .mockResolvedValueOnce({ data: { values: ['A'], limit: 1000, truncated: false } })
      .mockResolvedValueOnce({ data: { values: ['B'], limit: 1000, truncated: false } });

    await fetchFilterValues('any', 'city');
    await fetchFilterValues('any', 'region');

    expect(mockGet).toHaveBeenCalledTimes(2); // distinct keys → 2 fetches
  });

  it('clearFilterValuesCache forces the next call to re-fetch', async () => {
    mockGet
      .mockResolvedValueOnce({ data: { values: ['A'], limit: 1000, truncated: false } })
      .mockResolvedValueOnce({ data: { values: ['A2'], limit: 1000, truncated: false } });

    await fetchFilterValues('any', 'city');
    clearFilterValuesCache();
    const afterClear = await fetchFilterValues('any', 'city');

    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(afterClear.values).toEqual(['A2']);
  });

  it('malformed response (no values array) degrades to empty list', async () => {
    mockGet.mockResolvedValueOnce({ data: { limit: 1000 } });

    const result = await fetchFilterValues('any', 'city');

    expect(result.values).toEqual([]);
    expect(result.truncated).toBe(false);
  });

  it('truncated flag round-trips from the backend response', async () => {
    mockGet.mockResolvedValueOnce({
      data: { values: ['A', 'B'], limit: 2, truncated: true },
    });

    const result = await fetchFilterValues('any', 'city');

    expect(result.truncated).toBe(true);
    expect(result.limit).toBe(2);
  });

  it('auth epoch change invalidates the cache (Codex iter-2 §High)', async () => {
    // Same column, same company — but a principal switch (logout /
    // re-login / impersonation bumps the auth epoch). The new
    // principal must NOT see the previous principal's RLS-scoped
    // distinct values from cache.
    authEpochHolder.value = 1;
    mockGet
      .mockResolvedValueOnce({ data: { values: ['principal-1'], limit: 1000, truncated: false } })
      .mockResolvedValueOnce({ data: { values: ['principal-2'], limit: 1000, truncated: false } });

    const first = await fetchFilterValues('any', 'city');
    expect(first.values).toEqual(['principal-1']);

    // epoch bump → next call must re-fetch, not serve the cache
    authEpochHolder.value = 2;
    const afterEpochBump = await fetchFilterValues('any', 'city');

    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(afterEpochBump.values).toEqual(['principal-2']);
    // restore for any later test
    authEpochHolder.value = 1;
  });
});
