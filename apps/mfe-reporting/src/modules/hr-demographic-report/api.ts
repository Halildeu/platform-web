import type { HrDemographicFilters, HrDemographicRow, DemographicSummary } from './types';
import { generateMockEmployees, computeSummary } from './mock-data';
import type { GridRequest, GridResponse } from '../../grid';
// eslint-disable-next-line no-restricted-imports -- defensive fallback when getShellServices() unavailable (resolveHttp helper below)
// eslint-disable-next-line no-restricted-imports -- pre-existing fallback path; tracked separately as a shell-services migration.
>>>>>>> 2192487a (fix(hr-demografik): pr-x14 post-impl iter-1 absorb (3 high+medium))
import { api } from '@mfe/shared-http';
import { getShellServices } from '../../app/services/shell-services';
// PR-X14 (Codex 019e26a9 post-impl high #2): row filtering must use
// the same alias normalization the map adapter does — otherwise
// `location=İstanbul` filter drops the same İSTANBUL(Avrupa) /
// İSTANBUL(Anadolu) rows the map correctly aggregates to TR-34.
import { findProvinceCodeByLabel } from './geo/tr-provinces';

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

export const fetchHrDemographicRows = async (
  filters: HrDemographicFilters,
  request: GridRequest,
): Promise<GridResponse<HrDemographicRow>> => {
  // Grid still uses mock data (individual row data not available from dashboard API)
  let filtered = [...mockRows];

  if (filters.search) {
    const q = filters.search.toLowerCase();
    filtered = filtered.filter(
      (r) =>
        r.fullName.toLowerCase().includes(q) ||
        r.department.toLowerCase().includes(q) ||
        r.position.toLowerCase().includes(q),
    );
  }
  if (filters.department && filters.department !== 'all') {
    filtered = filtered.filter((r) => r.department === filters.department);
  }
  if (filters.gender && filters.gender !== 'all') {
    filtered = filtered.filter((r) => r.gender === filters.gender);
  }
  if (filters.location && filters.location !== 'all') {
    // Codex 019e26a9 post-impl high #2: code-based comparison so the
    // İstanbul filter accepts every row whose label aliases to TR-34
    // (canonical "İstanbul", "İSTANBUL(Avrupa)", "İSTANBUL(Anadolu)",
    // ASCII-folded variants). "Belirtilmemiş" stays a separate bucket
    // that does NOT match any province filter.
    const filterCode = findProvinceCodeByLabel(filters.location);
    if (filterCode) {
      filtered = filtered.filter((r) => findProvinceCodeByLabel(r.location) === filterCode);
    } else if (filters.location === 'Belirtilmemiş') {
      filtered = filtered.filter((r) => {
        const code = findProvinceCodeByLabel(r.location);
        return code === null;
      });
    } else {
      // Unknown filter value — fall back to legacy exact equality so
      // pre-existing callers don't silently drop to "no results".
      filtered = filtered.filter((r) => r.location === filters.location);
    }
  }
  if (filters.employmentType && filters.employmentType !== 'all') {
    filtered = filtered.filter((r) => r.employmentType === filters.employmentType);
  }

  if (request.sortModel && request.sortModel.length > 0) {
    const { colId, sort } = request.sortModel[0];
    const dir = sort === 'desc' ? -1 : 1;
    filtered.sort((a, b) => {
      const aVal = (a as unknown as Record<string, unknown>)[colId];
      const bVal = (b as unknown as Record<string, unknown>)[colId];
      if (typeof aVal === 'number' && typeof bVal === 'number') return (aVal - bVal) * dir;
      return String(aVal ?? '').localeCompare(String(bVal ?? ''), 'tr') * dir;
    });
  }

  const pageSize = request.pageSize ?? 50;
  const page = request.page ?? 1;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;

  return {
    rows: filtered.slice(start, end),
    total: filtered.length,
  };
};
