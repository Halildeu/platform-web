/**
 * fetchHrDemographicRows — live backend wiring tests (Codex thread
 * 019e3b64). The İK demografik grid was mock-only and rendered empty on
 * prod/testai; it now reads the `report-service` dynamic report
 * `hr-demografik-yapi` through the shared dynamic-report `fetchReportData`
 * helper. These tests pin:
 *   1. the request goes to GET /v1/reports/hr-demografik-yapi/data;
 *   2. UPPER_SNAKE backend columns map onto the typed HrDemographicRow;
 *   3. sidebar filters translate into a backend-column advancedFilter;
 *   4. the grid's camelCase sort colId translates to the backend column;
 *   5. the auth.ready() gate (inherited from fetchReportData / PR #590)
 *      short-circuits to an empty page;
 *   6. the backend report key === the capability route segment, so
 *      ReportingApp's dynamic-report dedup suppresses the duplicate.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockGet, authReady } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  authReady: { ok: true },
}));

vi.mock('../../../app/services/shell-services', () => ({
  getShellServices: () => ({
    http: { get: mockGet, post: vi.fn() },
    // fetchReportData gates on auth.ready().ok (Codex 019e3ab8 / PR #590).
    auth: { ready: () => Promise.resolve({ ok: authReady.ok }) },
  }),
}));

import { fetchHrDemographicRows, REPORT_KEY } from '../api';
import { getSharedReport } from '@platform/capabilities';
import type { HrDemographicFilters } from '../types';
import type { GridRequest } from '../../../grid';

const emptyFilters: HrDemographicFilters = {
  search: '',
  department: 'all',
  location: 'all',
  employmentType: 'all',
  gender: 'all',
  ageGroup: 'all',
  dateRange: null,
};

const baseRequest: GridRequest = { page: 1, pageSize: 50 };

const backendRow = (id: number): Record<string, unknown> => ({
  EMPLOYEE_ID: id,
  FULL_NAME: `Çalışan ${id}`,
  DEPARTMENT_NAME: 'Finans',
  POSITION_NAME: 'Uzman',
  GENDER: 'Kadın',
  AGE: 30 + id,
  EDUCATION: 'Lisans',
  EMPLOYMENT_TYPE: 'Tam Zamanlı',
  LOCATION: 'İstanbul',
  HIRE_DATE: '2020-01-15',
  TENURE_YEARS: 5.2,
  GENERATION: 'Y Kuşağı',
});

/** Parse the query string of the (single) recorded GET call. */
const lastQuery = (): URLSearchParams => {
  const url = String(mockGet.mock.calls[0][0]);
  return new URLSearchParams(url.slice(url.indexOf('?') + 1));
};

describe('fetchHrDemographicRows — live backend wiring (Codex 019e3b64)', () => {
  beforeEach(() => {
    mockGet.mockReset();
    authReady.ok = true;
  });

  it('calls GET /v1/reports/hr-demografik-yapi/data and maps UPPER_SNAKE → HrDemographicRow', async () => {
    mockGet.mockResolvedValueOnce({ data: { items: [backendRow(1), backendRow(2)], total: 2 } });

    const res = await fetchHrDemographicRows(emptyFilters, baseRequest);

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(String(mockGet.mock.calls[0][0])).toContain('/v1/reports/hr-demografik-yapi/data');
    const query = lastQuery();
    expect(query.get('page')).toBe('1');
    expect(query.get('pageSize')).toBe('50');

    expect(res.total).toBe(2);
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0]).toMatchObject({
      id: '1',
      fullName: 'Çalışan 1',
      department: 'Finans',
      position: 'Uzman',
      gender: 'Kadın',
      age: 31,
      education: 'Lisans',
      employmentType: 'Tam Zamanlı',
      location: 'İstanbul',
      tenureYears: 5.2,
      generation: 'Y Kuşağı',
    });
  });

  it('folds sidebar filters into the advancedFilter with backend column names', async () => {
    mockGet.mockResolvedValueOnce({ data: { items: [], total: 0 } });

    await fetchHrDemographicRows(
      { ...emptyFilters, search: 'ali', department: 'Finans', gender: 'Erkek' },
      baseRequest,
    );

    const advancedFilter = lastQuery().get('advancedFilter');
    expect(advancedFilter).not.toBeNull();
    const model = JSON.parse(advancedFilter as string);
    expect(model.FULL_NAME).toEqual({ filterType: 'text', type: 'contains', filter: 'ali' });
    expect(model.DEPARTMENT_NAME).toEqual({
      filterType: 'text',
      type: 'contains',
      filter: 'Finans',
    });
    expect(model.GENDER).toEqual({ filterType: 'text', type: 'equals', filter: 'Erkek' });
    // `all` / untouched sidebar fields produce no filter entry.
    expect(model.LOCATION).toBeUndefined();
    expect(model.EMPLOYMENT_TYPE).toBeUndefined();
  });

  it('translates the grid camelCase sort colId to the backend column', async () => {
    mockGet.mockResolvedValueOnce({ data: { items: [], total: 0 } });

    await fetchHrDemographicRows(emptyFilters, {
      ...baseRequest,
      sortModel: [{ colId: 'tenureYears', sort: 'desc' }],
    });

    expect(JSON.parse(lastQuery().get('sort') as string)).toEqual([
      { colId: 'TENURE_YEARS', sort: 'desc' },
    ]);
  });

  it('short-circuits to an empty page without a request when auth is not ready', async () => {
    authReady.ok = false;

    const res = await fetchHrDemographicRows(emptyFilters, baseRequest);

    expect(res).toEqual({ rows: [], total: 0 });
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('hr-demografik-yapi route ↔ backend key coupling (dedup guard, Codex 019e3b64)', () => {
  it('backend report key equals the capability route segment so ReportingApp suppresses the dynamic duplicate', () => {
    // ReportingApp dedup: dynamicReports.filter(r => !allRoutes.has(r.key)).
    // allRoutes carries the hand-written module route (= webRouteSegment).
    // If these drift apart a duplicate /admin/reports menu entry appears.
    expect(REPORT_KEY).toBe('hr-demografik-yapi');
    expect(getSharedReport('hr-demografik-yapi').webRouteSegment).toBe(REPORT_KEY);
  });
});
