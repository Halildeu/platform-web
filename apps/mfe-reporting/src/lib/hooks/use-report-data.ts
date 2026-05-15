/**
 * R16 sonrası Adım 14 PR-3 — useReportData React Query unified wrapper.
 *
 * Plan §7 Adım 14 DoD: AG Grid SSRM (server-side row model) compatible
 * data fetch hook. Tek API surface ile report + dashboard data fetching.
 *
 * Codex 019e2a83 plan-time önerisi: kozmetik dalga 4-itemli;
 * PR-1 useReportFormatter (#521) + PR-2 FilterFormStyle (#522) MERGED ready.
 * Bu PR-3 React Query wrapper.
 *
 * Pattern:
 * ```tsx
 * const { data, isLoading, error, refetch } = useReportData<ReportRow>({
 *   reportKey: 'fin-banka-hareketleri',
 *   filter: { dateRange: [start, end] },
 *   page: 1,
 *   pageSize: 50,
 *   sort: [{ colId: 'amount', sort: 'desc' }],
 * });
 * ```
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

/**
 * Report data query input — AG Grid SSRM compatible.
 */
export type ReportDataQuery = {
  /** Report registry key (e.g. 'fin-banka-hareketleri'). */
  reportKey: string;
  /** AG Grid filter model (JSON-serializable). */
  filter?: Record<string, unknown>;
  /** AG Grid sort model. */
  sort?: Array<{ colId: string; sort: 'asc' | 'desc' }>;
  /** Page number (1-indexed). Default: 1. */
  page?: number;
  /** Page size. Default: 50. */
  pageSize?: number;
  /** Company id header (X-Company-Id). */
  companyId?: number;
  /** Disable refetch on window focus. Default: false. */
  noRefetchOnFocus?: boolean;
};

export type PagedReportResult<T> = {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * Default API fetcher — uses fetch + credentials include.
 * Can be replaced via dependency injection for testing.
 */
async function defaultReportFetcher<T>(query: ReportDataQuery): Promise<PagedReportResult<T>> {
  const params = new URLSearchParams();
  params.set('page', String(query.page ?? 1));
  params.set('pageSize', String(query.pageSize ?? 50));
  if (query.filter && Object.keys(query.filter).length > 0) {
    params.set('advancedFilter', JSON.stringify(query.filter));
  }
  if (query.sort && query.sort.length > 0) {
    params.set('sort', JSON.stringify(query.sort));
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (query.companyId != null) {
    headers['X-Company-Id'] = String(query.companyId);
  }
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const url = `/api/v1/reports/${encodeURIComponent(query.reportKey)}/data?${params.toString()}`;
  const response = await fetch(url, {
    credentials: 'include',
    headers,
  });
  if (!response.ok) {
    throw new Error(`Report fetch failed: HTTP ${response.status}`);
  }
  return (await response.json()) as PagedReportResult<T>;
}

export type UseReportDataOptions<T> = {
  /** Custom fetcher (e.g. for tests / MSW mock). Default: built-in fetch. */
  fetcher?: (query: ReportDataQuery) => Promise<PagedReportResult<T>>;
  /** Stale time in ms. Default: 5 min. */
  staleTime?: number;
  /** Cache time in ms (gcTime in v5). Default: 30 min. */
  cacheTime?: number;
  /** Disable query (enabled=false). Default: false. */
  disabled?: boolean;
};

/**
 * useReportData — unified report data fetcher.
 *
 * @param query Report data query input.
 * @param options Hook behavior overrides.
 * @returns React Query result + paged data.
 */
export function useReportData<T = Record<string, unknown>>(
  query: ReportDataQuery,
  options: UseReportDataOptions<T> = {},
): UseQueryResult<PagedReportResult<T>> {
  const fetcher = options.fetcher ?? defaultReportFetcher;

  return useQuery<PagedReportResult<T>>({
    queryKey: [
      'report-data',
      query.reportKey,
      query.filter,
      query.sort,
      query.page ?? 1,
      query.pageSize ?? 50,
      query.companyId,
    ],
    queryFn: () => fetcher(query),
    staleTime: options.staleTime ?? 5 * 60 * 1000,
    gcTime: options.cacheTime ?? 30 * 60 * 1000,
    refetchOnWindowFocus: !query.noRefetchOnFocus,
    enabled: !options.disabled && !!query.reportKey,
  });
}
