import React from 'react';
import type { SharedReportId } from '@platform/capabilities';
import type { ReportModule } from '../types';
import type { ColumnMeta } from '@mfe/design-system/advanced/data-grid';
import type { DynamicReportFilters, DynamicReportRow, ReportListItem } from './types';
import { fetchReportData, exportReportData, fetchFilterValues } from './api';
import { CompanyPicker } from '../../components/CompanyPicker';
import {
  fetchMeta as fetchMetaFromCache,
  getCachedCapabilities,
  getCachedColumns,
} from './metadata-cache';

/* ------------------------------------------------------------------ */
/*  Dynamic report module factory                                      */
/* ------------------------------------------------------------------ */

export const createDynamicReportModule = (
  report: ReportListItem,
): ReportModule<DynamicReportFilters, DynamicReportRow> => {
  const moduleId = `reports.dynamic.${report.key}`;

  /*
   * Phase 2 PR-Reporting-2 (MFE Auth Transport Contract follow-up to
   * PR-Auth-1, #302): metadata cache moved to a module-scoped helper
   * (./metadata-cache.ts). The previous per-factory cache duplicated
   * work whenever multiple factory instances were created for the same
   * report.key (e.g. when a dashboard widget and a route both reference
   * the same report). The shared cache also adds:
   *
   *   - auth.ready() gate so no /metadata request leaves the MFE before
   *     the shell auth FSM reaches transportReady (closes the residual
   *     401 race that PR-Auth-1's eager-prefetch removal didn't cover);
   *   - in-flight promise share for concurrent callers on the same key;
   *   - bounded concurrency (default 4) so a 12-widget dashboard does
   *     not fan out 12 simultaneous /metadata calls;
   *   - epoch-aware invalidation (logout / re-login drop the cache);
   *   - failure NOT cached — next call retries (was: cached [] forever).
   *
   * The factory therefore becomes a thin adapter; the real intelligence
   * lives in metadata-cache.ts and is unit-tested independently.
   */
  const ensureColumnMeta = async (): Promise<ColumnMeta[]> => {
    const cached = await fetchMetaFromCache(report.key);
    return cached.columns;
  };

  // PR-D1b (Codex thread 019e800b, 2026-05-31):
  //   - `route`: prefer backend-supplied `routeSegment` alias when present
  //     (e.g. backend key `hr-compensation-detay` aliased to route
  //     `hr-compensation`); falls back to `report.key` for legacy reports
  //     without the alias. This is the platform-web side of the contract
  //     defined in `ReportListItemDto.routeSegment` (PR-D1a).
  //   - `sharedReportId`: prefer backend-supplied legacy `sharedReportId`
  //     carry so favorites + saved filters + sidebar default + export
  //     mode survive a static module → dynamic catalog migration. The
  //     frontend favorites sanitizer at `report-preferences.ts:48,56`
  //     keys off `SharedReportId`, not route. Falls back to the runtime
  //     `dynamic:${key}` cast for legacy reports without the carry.
  const route = report.routeSegment ?? report.key;
  const sharedReportId = (report.sharedReportId ?? `dynamic:${report.key}`) as SharedReportId;

  return {
    id: moduleId,
    sharedReportId,
    route,
    navKey: report.title,
    titleKey: report.title,
    descriptionKey: report.description,
    breadcrumbKeys: [{ key: 'reports.breadcrumb.root', to: '/reports' }, { key: report.title }],
    createInitialFilters: (context) => ({
      search: context?.searchParams?.get('search')?.trim() ?? '',
    }),
    renderFilters: ({ values, setFieldValue, requiredFields }) => {
      const isRequired = (key: string) => (requiredFields ?? []).includes(key);
      return (
        <>
          {/* CompanyPicker: AG Grid filter-row mantığında üç segment
              ([Şirket | Eşittir | <değer>]). Sütun ve operator kilit, sadece
              değer dropdown editable. Storage key 'reporting:currentCompanyId'
              shellServices.getCurrentCompanyId() ile dynamic-report/api.ts
              içindeki resolveCompanyId tarafından okunur.
              V1: hardcoded 1-43; V2 dynamic list (/api/v1/companies →
              OUR_COMPANY). */}
          <CompanyPicker required={isRequired('companyId')} />
          <div className="flex items-center gap-2" role="group" aria-label="Genel arama filtresi">
            <span
              className="rounded-md border border-border-subtle bg-surface-muted px-3 py-2 text-sm text-text-secondary cursor-not-allowed select-none"
              aria-readonly="true"
            >
              Ara
            </span>
            <span
              className="rounded-md border border-border-subtle bg-surface-muted px-3 py-2 text-sm text-text-secondary cursor-not-allowed select-none"
              aria-readonly="true"
            >
              İçerir
            </span>
            <input
              data-testid="report-filter-search"
              className="rounded-md border border-border-subtle bg-surface-default px-3 py-2 text-sm text-text-primary placeholder:text-text-subtle focus:outline-hidden focus:ring-2 focus:ring-selection-outline focus:ring-offset-1 min-w-[240px]"
              value={values.search ?? ''}
              placeholder="Arama..."
              onChange={(event) => setFieldValue('search', event.target.value)}
              aria-required={isRequired('search') ? 'true' : undefined}
            />
            {isRequired('search') ? (
              <span className="ml-1 text-danger" aria-label="zorunlu">
                *
              </span>
            ) : null}
          </div>
        </>
      );
    },
    requiredFilterFields: ['companyId'],
    /**
     * PR-D1b (Codex thread 019e800b, 2026-05-31) — opt-in flag that tells
     * ReportPage this module's filter UI depends on backend metadata
     * resolved AFTER `ensureColumnMeta()`. Cold deep-link URLs need a
     * second `createInitialFilters` pass once `filterDefinitions` arrive
     * in the cache so widgets that did not exist at mount time can
     * still hydrate from `?param=value` deep links. Re-hydration is
     * guarded so it cannot clobber user edits performed between mount
     * and metadata resolution.
     */
    hasMetadataDrivenFilters: true,
    getColumnMeta: () => getCachedColumns(report.key),
    /*
     * a11y-pr1 follow-up: expose the async loader so ReportPage can
     * await metadata before computing colDefs. Without this, the eager
     * fetch races the grid mount and the grid renders with an empty
     * column set even after the row data fetch resolves with rows —
     * 12k rows arrive but `params.success({ rowData })` finds no
     * column definitions to project them onto.
     */
    ensureColumnMeta,
    /*
     * PR-0.1+ capabilities reader. ReportPage flips serverSideGroupingEnabled
     * based on the {@code serverSideGrouping} flag returned alongside the
     * column metadata. Returns {@code undefined} until the metadata fetch
     * resolves; older backends that don't ship the field surface as
     * undefined permanently and ReportPage maps that to all-false.
     */
    getCapabilities: () => getCachedCapabilities(report.key),
    getColumns: () => [],
    fetchRows: (filters, request) => fetchReportData(report.key, filters, request),
    // PR-0.5b (Codex thread 019e2cd7): forward the optional grid-state
    // snapshot so grouped/pivot exports match the user's on-screen view.
    // PR-0.5b2 (Codex thread 019e2d85): forward the raw/view mode.
    exportRows: (filters, format, gridState, mode) =>
      exportReportData(report.key, filters, format, gridState, mode),
    // PR-0.5c (Codex thread 019e2d54): set filter distinct values.
    fetchFilterValues: (column, search) => fetchFilterValues(report.key, column, search),
  };
};
