import React from 'react';
import type { SharedReportId } from '@platform/capabilities';
import type { ReportModule } from '../types';
import type { ColumnMeta } from '@mfe/design-system/advanced/data-grid';
import type { DynamicReportFilters, DynamicReportRow, ReportListItem } from './types';
import { fetchReportData, exportReportData } from './api';
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

  return {
    id: moduleId,
    // The runtime-generated `dynamic:{key}` SharedReportId isn't part
    // of the static union; cast through the type instead of `any`.
    sharedReportId: `dynamic:${report.key}` as SharedReportId,
    route: report.key,
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
    exportRows: (filters, format) => exportReportData(report.key, filters, format),
  };
};
