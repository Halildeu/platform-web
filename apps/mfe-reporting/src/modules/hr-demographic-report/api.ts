import type { HrDemographicFilters, HrDemographicRow, DemographicSummary } from './types';
import { generateMockEmployees, computeSummary } from './mock-data';
import type { GridRequest, GridResponse } from '../../grid';
// eslint-disable-next-line no-restricted-imports -- defensive fallback when getShellServices() unavailable (resolveHttp helper below)
import { api } from '@mfe/shared-http';
import { getShellServices } from '../../app/services/shell-services';
// Codex 019e3b64: the grid now reads the live backend dynamic report
// `hr-demografik-yapi` through the shared dynamic-report helper, inheriting
// its auth.ready() gate + 401/400 handling (PR #590).
import { fetchReportData } from '../dynamic-report/api';

// ---------------------------------------------------------------------------
// Backend Dashboard API — canlı Workcube verisi
// ---------------------------------------------------------------------------

const DASHBOARD_KEY = 'hr-demografik';

const resolveHttp = () => {
  try {
    return getShellServices().http;
  } catch {
    return api;
  }
};

interface DashboardKPI {
  id: string;
  title: string;
  value: number | null;
  formattedValue: string;
  trend?: { direction: string; percentage: number } | null;
}

interface DashboardChartItem {
  label: string;
  value: number;
  [key: string]: unknown;
}

interface DashboardChart {
  id: string;
  title: string;
  chartType: string;
  data: DashboardChartItem[];
}

let _liveKPIs: DashboardKPI[] | null = null;
let _liveCharts: DashboardChart[] | null = null;
let _liveFetchPromise: Promise<void> | null = null;

async function fetchLiveDashboardData(): Promise<void> {
  if (_liveKPIs && _liveCharts) return;
  if (_liveFetchPromise) return _liveFetchPromise;

  _liveFetchPromise = (async () => {
    try {
      const client = resolveHttp();
      const [kpiRes, chartRes] = await Promise.all([
        client.get<DashboardKPI[]>(`/v1/dashboards/${DASHBOARD_KEY}/kpis?timeRange=ytd`),
        client.get<DashboardChart[]>(`/v1/dashboards/${DASHBOARD_KEY}/charts?timeRange=ytd`),
      ]);

      if (kpiRes.data) _liveKPIs = Array.isArray(kpiRes.data) ? kpiRes.data : null;
      if (chartRes.data) _liveCharts = Array.isArray(chartRes.data) ? chartRes.data : null;
    } catch (err) {
      console.warn('[hr-demographic] Live dashboard fetch failed, falling back to mock:', err);
    }
  })();

  return _liveFetchPromise;
}

// ---------------------------------------------------------------------------
// Public API — tries live data first, falls back to mock
// ---------------------------------------------------------------------------

// Mock fallback — only in dev/staging; production returns empty so users
// never see fake row data. Live KPIs/charts API zaten mevcut; sadece grid
// (row-level) mock'lanıyor çünkü dashboard API row-level data dönmez.
// Plan §7 Adım 3 (Codex 019e258f audit): "prod'da hard error veya empty state".
// Vite build PROD true bayrağı production environment'da geçerli.
const IS_PROD: boolean =
  typeof import.meta !== 'undefined' &&
  (import.meta as { env?: { PROD?: boolean } }).env?.PROD === true;
const mockRows = IS_PROD ? [] : generateMockEmployees(2545);
const mockSummary = computeSummary(mockRows);

export const getSummary = (): DemographicSummary => mockSummary;

export const getLiveKPIs = async (): Promise<DashboardKPI[] | null> => {
  await fetchLiveDashboardData();
  return _liveKPIs;
};

export const getLiveCharts = async (): Promise<DashboardChart[] | null> => {
  await fetchLiveDashboardData();
  return _liveCharts;
};

export const isLiveDataAvailable = (): boolean => _liveKPIs !== null && _liveCharts !== null;

export const refreshLiveData = (): void => {
  _liveKPIs = null;
  _liveCharts = null;
  _liveFetchPromise = null;
};

// ---------------------------------------------------------------------------
// Grid rows — canlı Workcube verisi (backend dynamic report)
// ---------------------------------------------------------------------------
// Codex thread 019e3b64: the grid was mock-only (suppressed empty on prod).
// It now reads `report-service` report `hr-demografik-yapi`. The backend
// emits UPPER_SNAKE columns; this module maps each row onto the typed
// camelCase HrDemographicRow.

/**
 * Backend report key. Intentionally equal to the hand-written module's
 * route segment (`getSharedReport('hr-demografik-yapi').webRouteSegment`)
 * so ReportingApp's `dynamicReports.filter(r => !allRoutes.has(r.key))`
 * dedup suppresses the would-be duplicate dynamic route. The route-coupling
 * test in `__tests__/api-filter.test.ts` locks this invariant.
 */
export const REPORT_KEY = 'hr-demografik-yapi';

/**
 * Grid colId (camelCase, from getColumnMeta) → backend report column
 * (UPPER_SNAKE, from reports/hr-demografik-yapi.json). Drives sort-colId
 * translation + column-level filter translation.
 */
const FIELD_TO_BACKEND: Record<string, string> = {
  fullName: 'FULL_NAME',
  department: 'DEPARTMENT_NAME',
  position: 'POSITION_NAME',
  gender: 'GENDER',
  age: 'AGE',
  education: 'EDUCATION',
  employmentType: 'EMPLOYMENT_TYPE',
  location: 'LOCATION',
  tenureYears: 'TENURE_YEARS',
  hireDate: 'HIRE_DATE',
  generation: 'GENERATION',
};

const asText = (value: unknown): string => (value == null ? '' : String(value));
const asNumber = (value: unknown): number => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};

const GENDER_LABELS: ReadonlySet<string> = new Set(['Erkek', 'Kadın', 'Diğer']);
const toGender = (value: unknown): HrDemographicRow['gender'] => {
  const label = asText(value);
  return (GENDER_LABELS.has(label) ? label : 'Diğer') as HrDemographicRow['gender'];
};

/** Map one backend (UPPER_SNAKE) row onto the typed HrDemographicRow. */
const mapBackendRow = (row: Record<string, unknown>): HrDemographicRow => ({
  id: asText(row.EMPLOYEE_ID),
  fullName: asText(row.FULL_NAME),
  department: asText(row.DEPARTMENT_NAME),
  position: asText(row.POSITION_NAME),
  gender: toGender(row.GENDER),
  birthDate: '',
  age: asNumber(row.AGE),
  education: asText(row.EDUCATION),
  maritalStatus: '',
  employmentType: asText(row.EMPLOYMENT_TYPE),
  hireDate: asText(row.HIRE_DATE),
  tenureYears: asNumber(row.TENURE_YEARS),
  location: asText(row.LOCATION),
  isManager: false,
  hasDisability: false,
  militaryStatus: '',
  generation: asText(row.GENERATION),
  ethicsTrainingComplete: false,
  positionLevel: '',
});

/**
 * Build the AG Grid advancedFilter payload from the sidebar filters + any
 * column-level filterModel, translating camelCase grid fields to the
 * backend's UPPER_SNAKE columns. The backend `/data` endpoint has no
 * `search` param, so `search` is folded in as `FULL_NAME contains`
 * (v1 = name-only). department/location use `contains` (real Workcube
 * values differ from the legacy mock dropdown); gender/employmentType
 * use `equals` (the report's SQL emits those exact labels).
 */
const buildDemographicFilter = (
  filters: HrDemographicFilters,
  gridFilterModel?: Record<string, unknown> | null,
): Record<string, unknown> => {
  const model: Record<string, unknown> = {};

  // Column-level AG Grid filters first (camelCase colId → backend column).
  for (const [colId, spec] of Object.entries(gridFilterModel ?? {})) {
    const backend = FIELD_TO_BACKEND[colId];
    if (backend) model[backend] = spec;
  }

  const textFilter = (type: 'contains' | 'equals', filter: string) => ({
    filterType: 'text',
    type,
    filter,
  });
  const sidebarValue = (raw: unknown): string => {
    const value = typeof raw === 'string' ? raw.trim() : '';
    return value && value !== 'all' ? value : '';
  };

  const search = sidebarValue(filters.search);
  if (search) model.FULL_NAME = textFilter('contains', search);

  const department = sidebarValue(filters.department);
  if (department) model.DEPARTMENT_NAME = textFilter('contains', department);

  const location = sidebarValue(filters.location);
  if (location) model.LOCATION = textFilter('contains', location);

  const gender = sidebarValue(filters.gender);
  if (gender) model.GENDER = textFilter('equals', gender);

  const employmentType = sidebarValue(filters.employmentType);
  if (employmentType) model.EMPLOYMENT_TYPE = textFilter('equals', employmentType);

  return model;
};

export const fetchHrDemographicRows = async (
  filters: HrDemographicFilters,
  request: GridRequest,
): Promise<GridResponse<HrDemographicRow>> => {
  // Translate the grid's camelCase sort colId(s) to the backend columns.
  const sortModel = (request.sortModel ?? [])
    .map((entry) => {
      const colId = FIELD_TO_BACKEND[entry.colId];
      return colId ? { colId, sort: entry.sort } : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const advancedFilter = buildDemographicFilter(filters, request.filterModel);

  // A fresh GridRequest — never mutate the caller's request (Codex 019e3b64).
  const backendRequest: GridRequest = {
    page: request.page,
    pageSize: request.pageSize,
    startRow: request.startRow,
    endRow: request.endRow,
    sortModel,
    advancedFilter: JSON.stringify(advancedFilter),
  };

  // `fetchReportData` carries the auth.ready() gate + 401/400 handling.
  const res = await fetchReportData(REPORT_KEY, { search: '' }, backendRequest, 'FULL_NAME', 'asc');

  return {
    rows: res.rows.map((row) => mapBackendRow(row as Record<string, unknown>)),
    total: res.total,
  };
};
