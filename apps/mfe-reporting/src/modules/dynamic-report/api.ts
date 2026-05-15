// PR-FE-3 (Codex 019e08e2 iter-11): direct axios usage is required for
// the typed AxiosError narrowing in tenant-gate detection. The shell
// http client is still used for the actual GET/POST calls — only the
// `axios.isAxiosError` type guard and the AxiosError type are imported.
// eslint-disable-next-line no-restricted-imports
import axios, { AxiosError } from 'axios';
// eslint-disable-next-line no-restricted-imports
import { api, type ApiInstance } from '@mfe/shared-http';
import { getShellServices } from '../../app/services/shell-services';
import type { ExportGridState, FilterValuesResult, GridRequest, GridResponse } from '../../grid';
import { normalizeServerSideRequest, requestsGrouping } from '../../grid';
import type {
  DynamicReportFilters,
  DynamicReportRow,
  ReportListItem,
  ReportMetadata,
  ReportCategory,
} from './types';

type PagedResultDto = {
  items: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
  // PR-0.4d-be (Codex thread 019e2695) — pivot-only response fields.
  // Optional so non-pivot responses (the @JsonInclude(NON_EMPTY) backend
  // path) keep parsing cleanly. PR-0.4d-fe consumes both:
  // pivotResultColumns drives the semantic AG Grid SSRM secondary
  // headers; pivotResultFields stays the canonical row-data key list
  // for fallback registrations.
  pivotResultFields?: string[];
  pivotResultColumns?: Array<{
    field: string;
    pivotField: string;
    pivotValue: string;
    pivotLabel: string;
    aggFunc: string;
    valueField: string;
  }>;
  // PR-0.5a (Codex thread 019e2c61): grand-total row over the
  // RLS+filter-narrowed source set. Backend emits this only on root
  // grouped (non-pivot) requests with non-empty aggregations; absent
  // on flat, pivot, and child-store responses thanks to backend's
  // @JsonInclude(NON_NULL). Map keys match aggregation aliases,
  // values may be null (empty filter SUM/AVG, weightedavg denominator
  // zero, percentile over empty set).
  grandTotalRow?: Record<string, unknown> | null;
};

type ErrorResponse = {
  error?: string;
  message?: string;
  meta?: { traceId?: string };
  // PR-FE-3 (Codex thread 019e08e2 iter-11 AGREE absorb, 2026-05-08):
  // tenant_selection_required 400 surface (yearly reports). Backend
  // YearlySchemaResolver returns {error: 'tenant_selection_required',
  // reportKey, message, hint?} for super-admins and multi-company users
  // with no X-Company-Id header. Frontend lifts this into a typed
  // TenantSelectionRequiredError so ReportPage can render a prominent
  // CompanyPicker gate instead of a generic error toast / redirect.
  reportKey?: string;
  hint?: string;
};

/**
 * PR-FE-3 (Codex thread 019e08e2 iter-11 AGREE absorb, 2026-05-08):
 * typed error for the yearly-report tenant gate. Distinct from
 * generic 400s so ReportPage can branch on the presence of this class
 * and render a CompanyPicker gate (no redirect, no generic toast).
 *
 * Pre-fix: yearly reports (e.g. fin-muhasebe-detay) returned a 400 with
 * {error:'tenant_selection_required'} that was swallowed by metadata-
 * cache as `emptyMeta()`, so ReportPage saw an empty metadata cache and
 * produced a "report not found" outcome that bounced the user back to
 * /admin/reports. The picker existed but was never reached because the
 * page never settled.
 */
export class TenantSelectionRequiredError extends Error {
  public readonly reportKey: string;
  public readonly originalMessage?: string;
  public readonly hint?: string;
  public readonly status: number;

  constructor(reportKey: string, originalMessage?: string, hint?: string) {
    super(`tenant_selection_required:${reportKey}`);
    this.name = 'TenantSelectionRequiredError';
    this.reportKey = reportKey;
    this.originalMessage = originalMessage;
    this.hint = hint;
    this.status = 400;
  }
}

/**
 * Type guard usable across module-federation boundaries (single-domain
 * builds give each remote its own copy of TenantSelectionRequiredError,
 * so `instanceof` is unreliable — name-based check is the canonical
 * "is this our typed gate error" test).
 */
export const isTenantSelectionRequiredError = (err: unknown): err is TenantSelectionRequiredError =>
  err instanceof Error && (err as { name?: unknown }).name === 'TenantSelectionRequiredError';

/**
 * Lifts an axios 400 with `error:'tenant_selection_required'` body into
 * a {@link TenantSelectionRequiredError}. Returns `null` if the response
 * shape doesn't match (caller falls through to existing 400 handling).
 */
const toTenantSelectionRequiredError = (
  reportKeyHint: string,
  error: AxiosError<ErrorResponse>,
): TenantSelectionRequiredError | null => {
  if (error.response?.status !== 400) {
    return null;
  }
  const body = error.response.data;
  if (body?.error !== 'tenant_selection_required') {
    return null;
  }
  return new TenantSelectionRequiredError(body.reportKey ?? reportKeyHint, body.message, body.hint);
};

const REPORTS_BASE = '/v1/reports';
const COMPANY_ID_STORAGE_KEY = 'reporting:currentCompanyId';
const COMPANY_HEADER = 'X-Company-Id';

const resolveHttpClient = (): ApiInstance => {
  try {
    return getShellServices().http;
  } catch {
    return api;
  }
};

/**
 * Resolves the active company id for report API calls.
 *
 * Source priority:
 *   1. shellServices.getCurrentCompanyId() if exposed by the host shell
 *   2. localStorage[COMPANY_ID_STORAGE_KEY] (persisted by WorkspaceSwitcher)
 *   3. undefined → header is omitted; backend will reject for super-admin /
 *      multi-company users with 400 MissingCompanyHeaderException
 *
 * Backend contract (YearlySchemaResolver): {@code X-Company-Id} is the
 * authoritative selector for the active company schema. Single-company users
 * are auto-selected server-side, so the header is optional in that case.
 */
const resolveCompanyId = (): string | undefined => {
  try {
    const services = getShellServices();
    const fromShell = (
      services as { getCurrentCompanyId?: () => string | number | null | undefined }
    ).getCurrentCompanyId?.();
    if (fromShell !== undefined && fromShell !== null && String(fromShell).trim() !== '') {
      return String(fromShell);
    }
  } catch {
    // shell-services not registered yet (e.g. unit tests); fall through to storage
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    const stored = window.localStorage.getItem(COMPANY_ID_STORAGE_KEY);
    if (stored && stored.trim() !== '') {
      return stored;
    }
  }

  return undefined;
};

const buildCompanyHeaders = (): Record<string, string> => {
  const companyId = resolveCompanyId();
  return companyId ? { [COMPANY_HEADER]: companyId } : {};
};

export const fetchReportList = async (): Promise<ReportListItem[]> => {
  const client = resolveHttpClient();
  const { data } = await client.get<ReportListItem[]>(REPORTS_BASE);
  return Array.isArray(data) ? data : [];
};

export const fetchReportCategories = async (): Promise<ReportCategory[]> => {
  const client = resolveHttpClient();
  const { data } = await client.get<ReportCategory[]>(`${REPORTS_BASE}/categories`);
  return Array.isArray(data) ? data : [];
};

export const fetchReportMetadata = async (reportKey: string): Promise<ReportMetadata> => {
  const client = resolveHttpClient();
  // PR-FE-3 (Codex 019e08e2 iter-11 AGREE absorb): tenant gate detection.
  // Pre-fix: any 400 from /metadata propagated as a generic axios error
  // and was swallowed by metadata-cache as emptyMeta() — yearly reports
  // surfaced as "no columns" silent failure. Now we lift the
  // tenant_selection_required body into a typed error so ReportPage can
  // render a CompanyPicker gate; other 400s preserve the legacy
  // generic-throw + cache emptyMeta path.
  try {
    const { data } = await client.get<ReportMetadata>(`${REPORTS_BASE}/${reportKey}/metadata`, {
      headers: buildCompanyHeaders(),
    });
    return data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const tenantError = toTenantSelectionRequiredError(
        reportKey,
        error as AxiosError<ErrorResponse>,
      );
      if (tenantError) {
        throw tenantError;
      }
    }
    throw error;
  }
};

/**
 * Workcube CompanyPicker dropdown source.
 *
 * <p>Backend: {@code GET /api/v1/reports/company-options} (Codex 019dfb15
 * iter-1 + iter-2 absorbed). Returns {@code [{id, nickname, name}]}
 * filtered by the caller's scope:
 * <ul>
 *   <li>Super-admin → full catalog (43 entries).</li>
 *   <li>Scoped user → subset matching {@code allowedCompanyIds}.</li>
 *   <li>Anonymous → 401 (rejected upstream).</li>
 * </ul>
 *
 * <p>Behaviour by HTTP status:
 * <ul>
 *   <li><b>200</b> — return list as-is.</li>
 *   <li><b>404</b> — feature flag {@code report.mssql.enabled=false} or
 *       Workcube datasource missing. Caller falls back to the static
 *       {@code Şirket #1..43} list silently.</li>
 *   <li><b>503</b> — MSSQL temporarily unreachable
 *       (ADR-0005 degraded mode). Caller may surface a notice but should
 *       still allow the user to pick from the cached/fallback list.</li>
 *   <li>Other errors — same as 404 (fall back).</li>
 * </ul>
 *
 * <p>Returning {@code null} (instead of throwing) keeps the picker resilient:
 * the component decides whether to fall back, and we don't break tree-shaking
 * by introducing a new error class. If a caller ever needs the 503 body
 * (which contains {@code error: "mssql_unavailable"}), wrap this helper or
 * call {@code client.get} directly — keeping a separate "raw" variant is
 * deferred until there's a real second consumer.
 */
export type CompanyOption = { id: number; nickname: string; name: string };

export const fetchCompanyOptions = async (): Promise<CompanyOption[] | null> => {
  const client = resolveHttpClient();
  try {
    const { data } = await client.get<CompanyOption[]>(`${REPORTS_BASE}/company-options`);
    return Array.isArray(data) ? data : null;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      if (status === 404 || status === 503) {
        // Expected degraded paths; let the caller fall back silently.
        return null;
      }
    }
    // Unexpected error — also fall back, log for diagnostics.
    console.warn('[fetchCompanyOptions] unexpected error, falling back:', error);
    return null;
  }
};

const buildSortParam = (request: GridRequest, defaultSort?: string, defaultDirection?: string) => {
  if (Array.isArray(request.sortModel) && request.sortModel.length > 0) {
    const entry = request.sortModel[0];
    if (entry?.colId && entry.sort) {
      return JSON.stringify([{ colId: entry.colId, sort: entry.sort }]);
    }
  }
  if (defaultSort) {
    return JSON.stringify([{ colId: defaultSort, sort: defaultDirection ?? 'desc' }]);
  }
  return '';
};

/**
 * Merge AG Grid column filterModel + sidebar search into a single advancedFilter
 * payload that the backend ReportController + FilterTranslator understand.
 *
 * Shape (mirrors hr-compensation-report/api.ts):
 *   {
 *     account_name: { filterType: 'text', type: 'contains', filter: 'serban' },
 *     paper_no:     { filterType: 'text', type: 'contains', filter: '20260505' },
 *     ...
 *   }
 *
 * Backend FilterTranslator whitelists each key against the report's
 * filterableColumns set, so unknown columns are silently skipped (no SQL
 * injection risk).
 *
 * Sidebar "search" is a free-text quickFilter; we do not know which column it
 * targets, so we leave the legacy `search` query param in place and let the
 * backend handle it (currently a no-op for muavin until a defaultSearchColumn
 * is wired in metadata — V2 follow-up).
 */
const buildAdvancedFilter = (
  filters: DynamicReportFilters,
  gridFilterModel?: Record<string, unknown> | null,
): Record<string, unknown> => {
  const merged: Record<string, unknown> = { ...(gridFilterModel ?? {}) };
  return merged;
};

/**
 * AG Grid SSRM-compatible request body for the backend
 * {@code POST /api/v1/reports/{key}/query} endpoint shipped in
 * platform-backend PR-0.1..0.3 (#78/#79/#81). Mirrors AG Grid's
 * {@code IServerSideGetRowsRequest} so we can forward the structured
 * payload verbatim.
 *
 * <p>The 400 envelope is {@link ReportQueryErrorDto} on the backend —
 * {@code { code, message }}. Error codes that fail-close at the SQL
 * builder boundary:
 * <ul>
 *   <li>{@code GROUPING_NOT_SUPPORTED} — capability false / pivot
 *       requested.</li>
 *   <li>{@code INVALID_AGGREGATION_REQUEST} — non-aggregatable field
 *       or unknown aggFunc.</li>
 *   <li>{@code INVALID_GROUP_KEY} — type-coercion failure (e.g. "abc"
 *       on a number column).</li>
 *   <li>{@code ANCESTOR_FILTER_COLLISION} — user filter collides with
 *       expansion ancestor on the same field.</li>
 *   <li>{@code INVALID_ROW_WINDOW} / {@code NON_ALIGNED_ROW_WINDOW} —
 *       malformed pagination window.</li>
 * </ul>
 */
type ReportQueryRequestBody = {
  startRow?: number;
  endRow?: number;
  rowGroupCols?: GridRequest['rowGroupCols'];
  valueCols?: GridRequest['valueCols'];
  pivotCols?: GridRequest['pivotCols'];
  pivotMode?: boolean;
  groupKeys?: string[];
  filterModel?: GridRequest['filterModel'];
  sortModel?: GridRequest['sortModel'];
};

/**
 * Structured error mirror of the backend {@code ReportQueryErrorDto}
 * ({@code { code, message }}). Subclassing {@link Error} (instead of
 * embedding the code in the {@code message} string) lets the
 * follow-up PRs (#272c sanitizer, #272a UX flip) branch on the
 * canonical {@code code} field without parsing strings.
 *
 * <p>Codes shipped by platform-backend PR-0.1..0.3:
 * {@code GROUPING_NOT_SUPPORTED}, {@code INVALID_AGGREGATION_REQUEST},
 * {@code INVALID_GROUP_KEY}, {@code ANCESTOR_FILTER_COLLISION},
 * {@code INVALID_ROW_WINDOW}, {@code NON_ALIGNED_ROW_WINDOW}.
 */
export class ReportQueryError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = 'ReportQueryError';
  }
}

const fetchReportDataGrouped = async (
  reportKey: string,
  request: GridRequest,
): Promise<GridResponse<DynamicReportRow>> => {
  const blockSize = Math.max(1, request.pageSize ?? 50);
  const computedStart = ((request.page ?? 1) - 1) * blockSize;
  // Resolve startRow first so endRow falls off the same base when the
  // caller only set one half of the SSRM cache window. Keeps the
  // backend NON_ALIGNED_ROW_WINDOW guard deterministic for hand-crafted
  // test/mock payloads (Codex iter-1 absorb on PR #273).
  const resolvedStart = request.startRow ?? computedStart;
  const body: ReportQueryRequestBody = {
    startRow: resolvedStart,
    endRow: request.endRow ?? resolvedStart + blockSize,
    rowGroupCols: request.rowGroupCols ?? [],
    valueCols: request.valueCols ?? [],
    pivotCols: request.pivotCols ?? [],
    pivotMode: request.pivotMode ?? false,
    groupKeys: request.groupKeys ?? [],
    filterModel: request.filterModel ?? {},
    sortModel: request.sortModel ?? [],
  };

  try {
    const client = resolveHttpClient();
    const { data } = await client.post<PagedResultDto>(`${REPORTS_BASE}/${reportKey}/query`, body, {
      headers: buildCompanyHeaders(),
    });
    const items = Array.isArray(data?.items) ? data.items : [];
    // PR-0.4d-be (Codex thread 019e2695): pass the pivot envelope through
    // to the SSRM datasource so ReportPage can register secondary
    // columns. Non-pivot responses leave the fields undefined; the
    // caller treats undefined as "no pivot info to wire" and falls
    // back to the legacy flat / grouped registration path.
    return {
      rows: items,
      total: typeof data?.total === 'number' ? data.total : items.length,
      pivotResultFields: Array.isArray(data?.pivotResultFields)
        ? data.pivotResultFields
        : undefined,
      pivotResultColumns: Array.isArray(data?.pivotResultColumns)
        ? data.pivotResultColumns
        : undefined,
      // PR-0.5a (Codex thread 019e2c61): forward the optional
      // grand-total row when present. Empty object collapses to
      // undefined so the caller can treat it uniformly with the
      // absent-field case. Non-object responses are dropped
      // defensively (backend contract is Map<String, Object>; a
      // primitive or array here would be a rolling-deploy mismatch
      // and the existing grid render must keep going).
      grandTotalRow:
        data?.grandTotalRow &&
        typeof data.grandTotalRow === 'object' &&
        !Array.isArray(data.grandTotalRow)
          ? (data.grandTotalRow as Record<string, unknown>)
          : undefined,
    };
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const response = error as AxiosError<ErrorResponse & { code?: string; message?: string }>;
      const status = response.response?.status;
      const traceId = response.response?.data?.meta?.traceId;
      if (traceId && process.env.NODE_ENV !== 'production') {
        console.warn(`[mfe-reporting/${reportKey}/query] traceId`, traceId);
      }
      if (status === 401 || status === 403) {
        throw new Error('Rapor verileri için yetki bulunmuyor', { cause: error });
      }
      if (status === 400) {
        // PR-FE-3 (Codex 019e08e2 iter-11): tenant gate FIRST. Backend
        // YearlySchemaResolver returns 400 with error:'tenant_selection_required'
        // for super-admin / multi-company users without X-Company-Id.
        // Lift this into a typed error before falling through to the
        // generic ReportQueryError path; ReportPage branches on the typed
        // class to render a CompanyPicker gate (no toast).
        const tenantError = toTenantSelectionRequiredError(reportKey, response);
        if (tenantError) {
          throw tenantError;
        }
        // Surface the structured error so the caller can branch on
        // .code without parsing strings (#272c will inspect this to
        // revert offending grouping state, #272a will branch on
        // GROUPING_NOT_SUPPORTED to keep capability scoped).
        const data = response.response?.data;
        const code = data?.code ?? 'BAD_REQUEST';
        const detail = data?.message ?? 'Sorgu yapısı reddedildi';
        throw new ReportQueryError(code, `[${code}] ${detail}`, 400);
      }
      throw new Error(`Rapor verileri alınamadı (HTTP ${status ?? '??'})`, { cause: error });
    }
    throw new Error('Rapor verileri alınamadı', { cause: error });
  }
};

export const fetchReportData = async (
  reportKey: string,
  filters: DynamicReportFilters,
  request: GridRequest,
  defaultSort?: string,
  defaultDirection?: string,
): Promise<GridResponse<DynamicReportRow>> => {
  // PR-0.2 hardening: when the request expresses any grouping intent,
  // forward it via POST /query so the backend's grouped path handles
  // GROUP BY / aggregations / ancestor expansion. Flat requests stay on
  // the legacy GET /data path so non-grouping callers (dashboards,
  // exports) keep working unchanged.
  if (requestsGrouping(request)) {
    return fetchReportDataGrouped(reportKey, request);
  }

  const params = new URLSearchParams();
  params.set('page', String(request.page ?? 1));
  params.set('pageSize', String(request.pageSize ?? 50));

  const quickFilter = request.quickFilter?.trim() || '';
  const search = quickFilter || filters.search?.trim() || '';
  if (search) {
    params.set('search', search);
  }

  const sort = buildSortParam(request, defaultSort, defaultDirection);
  if (sort) {
    params.set('sort', sort);
  }

  // Merge AG Grid column-level filterModel + sidebar filters into one
  // advancedFilter payload. If the caller already provided an explicit
  // advancedFilter (e.g. dashboard drill-through), prefer that.
  //
  // GridRequest.advancedFilter is typed as `string` and DashboardPage hands us
  // an already-JSON-stringified payload. Pass-through if it's a string; only
  // stringify when a caller mistakenly hands us a raw object (defensive).
  if (request.advancedFilter) {
    const advFilterStr =
      typeof request.advancedFilter === 'string'
        ? request.advancedFilter
        : JSON.stringify(request.advancedFilter);
    params.set('advancedFilter', advFilterStr);
  } else {
    const advFilter = buildAdvancedFilter(filters, request.filterModel);
    if (Object.keys(advFilter).length > 0) {
      params.set('advancedFilter', JSON.stringify(advFilter));
    }
  }

  try {
    const client = resolveHttpClient();
    const { data } = await client.get<PagedResultDto>(
      `${REPORTS_BASE}/${reportKey}/data?${params.toString()}`,
      { headers: buildCompanyHeaders() },
    );
    const items = Array.isArray(data?.items) ? data.items : [];
    return {
      rows: items,
      total: typeof data?.total === 'number' ? data.total : items.length,
    };
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const response = error as AxiosError<ErrorResponse>;
      const status = response.response?.status;
      const traceId = response.response?.data?.meta?.traceId;
      if (traceId && process.env.NODE_ENV !== 'production') {
        console.warn(`[mfe-reporting/${reportKey}] traceId`, traceId);
      }
      if (status === 401 || status === 403) {
        throw new Error('Rapor verileri için yetki bulunmuyor', { cause: error });
      }
      // PR-FE-3 (Codex 019e08e2 iter-11): same tenant gate detection on
      // the flat data path. fin-muhasebe-detay yearly schema returns
      // 400/tenant_selection_required here when no X-Company-Id is set;
      // the typed error lets ReportPage gate the grid and surface the
      // CompanyPicker prominently.
      if (status === 400) {
        const tenantError = toTenantSelectionRequiredError(reportKey, response);
        if (tenantError) {
          throw tenantError;
        }
      }
      throw new Error(`Rapor verileri alınamadı (HTTP ${status ?? '??'})`, { cause: error });
    }
    throw new Error('Rapor verileri alınamadı', { cause: error });
  }
};

export const exportReportData = async (
  reportKey: string,
  filters: DynamicReportFilters,
  format: 'csv' | 'excel',
  gridState?: ExportGridState,
  /**
   * PR-0.5b2 (Codex thread 019e2d85): export mode.
   *   - 'raw'      → flat detail rows; grouping/pivot ignored, but
   *                  the on-screen column filters + sort still apply.
   *                  Always routes to GET /export.
   *   - 'view'     → the PR-0.5b grouped/pivot "current view"
   *                  behaviour (normalize-then-route).
   *   - undefined  → legacy two-button path; identical to the
   *                  pre-PR-0.5b2 behaviour (filename has no suffix).
   */
  mode?: 'raw' | 'view',
): Promise<{ blob: Blob; filename: string }> => {
  const client = resolveHttpClient();
  const wireFormat = format === 'csv' ? 'csv' : 'xlsx';
  const extension = format === 'csv' ? 'csv' : 'xlsx';

  // PR-0.5b2: filename suffix distinguishes the two downloads so a
  // raw Excel and a view Excel of the same report don't collide in
  // the browser's download folder. Legacy path (mode undefined)
  // keeps the bare `${reportKey}.${ext}` filename unchanged.
  const filenameFor = (m: 'raw' | 'view' | undefined): string => {
    if (m === 'raw') return `${reportKey}-ham-veri.${extension}`;
    if (m === 'view') return `${reportKey}-gorunum.${extension}`;
    return `${reportKey}.${extension}`;
  };

  /*
   * PR-0.5b2 raw mode: always a flat GET /export. The grid's
   * grouping/pivot is discarded, but the on-screen column
   * filters + sort ARE forwarded (advancedFilter + sort query
   * params) so "ham veri" still respects what the user filtered
   * on screen — Codex 019e2d85 netleştirme.
   */
  if (mode === 'raw') {
    const params = new URLSearchParams();
    // PR-0.5b2 iter-2 §P2: prefer the grid toolbar quick-filter so
    // "ham veri" honours the on-screen quick search; fall back to
    // the report filter drawer's search field.
    const search = gridState?.quickFilterText?.trim() || filters.search?.trim();
    if (search) {
      params.set('search', search);
    }
    params.set('format', wireFormat);
    if (gridState?.filterModel && Object.keys(gridState.filterModel).length > 0) {
      params.set('advancedFilter', JSON.stringify(gridState.filterModel));
    }
    if (gridState?.sortModel && gridState.sortModel.length > 0) {
      params.set('sort', JSON.stringify(gridState.sortModel));
    }
    const { data } = await client.get<Blob>(
      `${REPORTS_BASE}/${reportKey}/export?${params.toString()}`,
      { responseType: 'blob', headers: buildCompanyHeaders() },
    );
    return { blob: data, filename: filenameFor('raw') };
  }

  /*
   * PR-0.5b (Codex thread 019e2cd7 post-impl REVISE absorb): dispatch
   * decision is made AFTER normalization, mirroring the SSRM data
   * path's ordering (ReportPage normalises before fetchReportData
   * routes on requestsGrouping(normalised)).
   *
   * Why normalize-then-route: normalizeServerSideRequest collapses
   * incomplete pivot / stale valueCols / stale groupKeys snapshots
   * to the closest backend-supported shape. A snapshot that looked
   * "pivoty" before the normalizer can resolve to a flat request
   * after it (e.g. pivotMode=true + no rowGroup → flat; valueCols
   * with no rowGroup + no expansion → flat). Calling POST /export
   * for those would trip GROUPING_NOT_SUPPORTED on the backend;
   * the legacy GET /export is the right destination.
   */
  if (gridState) {
    const normalised = normalizeServerSideRequest({
      page: 1,
      pageSize: 1,
      rowGroupCols: gridState.rowGroupCols,
      valueCols: gridState.valueCols,
      pivotCols: gridState.pivotCols,
      pivotMode: gridState.pivotMode,
      filterModel: gridState.filterModel,
      sortModel: gridState.sortModel,
    });

    if (requestsGrouping(normalised)) {
      const body = {
        format: wireFormat,
        rowGroupCols: normalised.rowGroupCols ?? [],
        valueCols: normalised.valueCols ?? [],
        pivotCols: normalised.pivotCols ?? [],
        pivotMode: normalised.pivotMode ?? false,
        filterModel: normalised.filterModel ?? {},
        sortModel: normalised.sortModel ?? [],
      };

      try {
        const { data } = await client.post<Blob>(`${REPORTS_BASE}/${reportKey}/export`, body, {
          responseType: 'blob',
          headers: buildCompanyHeaders(),
        });
        return { blob: data, filename: filenameFor(mode) };
      } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
          const response = error as AxiosError<ErrorResponse & { code?: string; message?: string }>;
          const status = response.response?.status;
          if (status === 401 || status === 403) {
            throw new Error('Rapor verileri için yetki bulunmuyor', { cause: error });
          }
          if (status === 400) {
            // POST /export returns the same structured ReportQueryError
            // envelope as /query, but the body arrives as a Blob (we
            // told axios responseType=blob). Read the blob as JSON so
            // the user-facing toast surfaces the canonical code.
            // Codex iter-2 §3: also tolerate the legacy `{error: ...}`
            // shape just in case a sub-handler emits it on this path.
            const blob = response.response?.data as unknown;
            let code = 'BAD_REQUEST';
            let message = 'Export reddedildi';
            try {
              if (blob instanceof Blob) {
                const text = await blob.text();
                if (text && text.trim().length > 0) {
                  const parsed = JSON.parse(text) as {
                    code?: string;
                    error?: string;
                    message?: string;
                  };
                  if (parsed.code) code = parsed.code;
                  else if (parsed.error) code = parsed.error;
                  if (parsed.message) message = parsed.message;
                }
              }
            } catch {
              // body wasn't JSON — fall through to generic message
            }
            throw new ReportQueryError(code, `[${code}] ${message}`, 400);
          }
          throw new Error(`Export başlatılamadı (HTTP ${status ?? '??'})`, { cause: error });
        }
        throw new Error('Export başlatılamadı', { cause: error });
      }
    }
    // gridState present but normalised to flat → fall through to
    // the legacy GET /export path; backend has no grouped contract
    // to honour on this shape.
  }

  // Flat fallback — keep the legacy GET /export path so non-grouping
  // callers (dashboards, simple flat exports) stay byte-for-byte.
  // PR-0.5b2: a 'view'-mode snapshot that normalised to flat also
  // lands here; its filename still carries the -gorunum suffix.
  const params = new URLSearchParams();
  // PR-0.5b2 iter-2 §P2: for a 'view' export that fell to flat,
  // prefer the grid quick-filter; the legacy path (mode undefined)
  // keeps its byte-for-byte behaviour using only filters.search.
  const search =
    mode === 'view'
      ? gridState?.quickFilterText?.trim() || filters.search?.trim()
      : filters.search?.trim();
  if (search) {
    params.set('search', search);
  }
  params.set('format', wireFormat);
  // PR-0.5b2: a 'view' export whose grid is flat still wants the
  // on-screen filter/sort forwarded.
  if (mode === 'view' && gridState?.filterModel && Object.keys(gridState.filterModel).length > 0) {
    params.set('advancedFilter', JSON.stringify(gridState.filterModel));
  }
  if (mode === 'view' && gridState?.sortModel && gridState.sortModel.length > 0) {
    params.set('sort', JSON.stringify(gridState.sortModel));
  }

  const { data } = await client.get<Blob>(
    `${REPORTS_BASE}/${reportKey}/export?${params.toString()}`,
    { responseType: 'blob', headers: buildCompanyHeaders() },
  );
  return { blob: data, filename: filenameFor(mode) };
};

// PR-0.5b iter-2 absorb (Codex 019e2cfe Finding #1): the dispatch
// decision lives inline with the normalisation step now, so the
// raw-snapshot pre-check is redundant — removed to keep a single
// source of truth for "is this request grouping".

/*
 * PR-0.5c (Codex thread 019e2d54): set filter distinct values.
 *
 * In-memory cache: the AG Grid set filter `values` callback fires
 * every time the dropdown opens (with refreshValuesOnOpen=true);
 * without a cache the user pays a round-trip per open. The value
 * set is RLS/principal scoped, so the cache key includes BOTH the
 * company id AND the auth epoch — Codex iter-2 §High: a
 * logout/re-login/impersonation within the same tab must not serve
 * the previous principal's distinct values. This mirrors the
 * epoch-aware invalidation metadata-cache.ts already does.
 *
 * The cache lives only in this module's memory (never a shared HTTP
 * cache). 60s TTL balances freshness against churn.
 */
const FILTER_VALUES_CACHE_TTL_MS = 60_000;
type FilterValuesCacheEntry = { result: FilterValuesResult; expiresAt: number };
const filterValuesCache = new Map<string, FilterValuesCacheEntry>();
let filterValuesLastSeenEpoch = -1;

/**
 * Resolve the current auth epoch; returns -1 when shell-services is
 * not yet wired (unit tests). The epoch advances on logout /
 * re-login / impersonation so it is the canonical principal-change
 * signal.
 */
const resolveAuthEpoch = (): number => {
  try {
    return getShellServices().auth.getEpoch();
  } catch {
    return -1;
  }
};

/**
 * Drop the whole filter-values cache when the auth epoch advances —
 * the new principal must not see the previous principal's
 * RLS-scoped distinct values. Called at the top of every
 * {@link fetchFilterValues} lookup.
 */
const ensureFilterValuesEpoch = (epoch: number): void => {
  if (epoch !== filterValuesLastSeenEpoch) {
    filterValuesLastSeenEpoch = epoch;
    filterValuesCache.clear();
  }
};

/**
 * PR-0.5c: fetch a column's distinct values for the AG Grid set
 * filter dropdown. Backed by {@code GET /api/v1/reports/{key}/filter-values}.
 *
 * <p>A 60s in-memory cache keyed by {@code [authEpoch, reportKey,
 * companyId, column, search]} (JSON-encoded — printable, collision-
 * safe) avoids a backend round-trip on every dropdown open. The
 * cache is per browser tab (module memory) and epoch-invalidated so
 * a principal switch can never leak RLS-scoped values.
 */
export const fetchFilterValues = async (
  reportKey: string,
  column: string,
  search?: string,
): Promise<FilterValuesResult> => {
  const trimmedSearch = search?.trim() ?? '';
  const companyId = resolveCompanyId() ?? '';
  const authEpoch = resolveAuthEpoch();
  ensureFilterValuesEpoch(authEpoch);

  // JSON.stringify keeps the key printable + collision-safe (a
  // column name containing the old space separator would have
  // collided; the array form cannot). Codex iter-2 §Medium: the
  // previous template-literal separator embedded NUL bytes into
  // the source file — replaced entirely.
  const cacheKey = JSON.stringify([authEpoch, reportKey, companyId, column, trimmedSearch]);

  const cached = filterValuesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const client = resolveHttpClient();
  const params = new URLSearchParams();
  params.set('column', column);
  if (trimmedSearch) {
    params.set('search', trimmedSearch);
  }

  const { data } = await client.get<{
    values?: Array<string | number | boolean | null>;
    limit?: number;
    truncated?: boolean;
  }>(`${REPORTS_BASE}/${reportKey}/filter-values?${params.toString()}`, {
    headers: buildCompanyHeaders(),
  });

  const result: FilterValuesResult = {
    values: Array.isArray(data?.values) ? data.values : [],
    limit: typeof data?.limit === 'number' ? data.limit : 0,
    truncated: data?.truncated === true,
  };

  filterValuesCache.set(cacheKey, {
    result,
    expiresAt: Date.now() + FILTER_VALUES_CACHE_TTL_MS,
  });
  return result;
};

/**
 * PR-0.5c: drop every cached filter-values entry. Exposed so a
 * future "refresh filters" affordance (or a company switch) can
 * force the next dropdown open to re-fetch.
 */
export const clearFilterValuesCache = (): void => {
  filterValuesCache.clear();
};
