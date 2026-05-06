import React from 'react';
import type { SharedReportId } from '@platform/capabilities';
import type { ReportModule } from '../types';
import type { ColumnMeta } from '@mfe/design-system/advanced/data-grid';
import type {
  DynamicReportFilters,
  DynamicReportRow,
  ReportListItem,
  ReportColumnMeta,
} from './types';
import { fetchReportData, fetchReportMetadata, exportReportData } from './api';
import { CompanyPicker } from '../../components/CompanyPicker';

/* ------------------------------------------------------------------ */
/*  Backend ReportColumnMeta → Universal ColumnMeta mapper             */
/* ------------------------------------------------------------------ */

function mapBackendColumnMeta(col: ReportColumnMeta): ColumnMeta {
  const base = {
    field: col.field,
    headerNameKey: col.headerName, // backend sends pre-translated string
    width: col.width,
  };

  switch (col.type) {
    case 'number':
      return {
        ...base,
        columnType: 'number' as const,
        decimals: col.decimals,
        suffix: col.suffix,
        prefix: col.prefix,
      };
    case 'date':
      return { ...base, columnType: 'date' as const };
    case 'badge':
      return {
        ...base,
        columnType: 'badge' as const,
        variantMap: (col.variantMap ?? {}) as Record<string, unknown>,
        labelMap: col.labelMap,
      };
    case 'status':
      return {
        ...base,
        columnType: 'status' as const,
        statusMap: (col.statusMap ?? {}) as Record<string, unknown>,
      };
    case 'currency':
      return {
        ...base,
        columnType: 'currency' as const,
        currencyCode: col.currencyCode,
        decimals: col.decimals,
      };
    case 'boolean':
      return { ...base, columnType: 'boolean' as const };
    case 'percent':
      return { ...base, columnType: 'percent' as const, decimals: col.decimals };
    case 'enum':
      return {
        ...base,
        columnType: 'enum' as const,
        labelMap: col.labelMap ?? {},
      };
    default:
      return { ...base, columnType: 'text' as const };
  }
}

/* ------------------------------------------------------------------ */
/*  Dynamic report module factory                                      */
/* ------------------------------------------------------------------ */

export const createDynamicReportModule = (
  report: ReportListItem,
): ReportModule<DynamicReportFilters, DynamicReportRow> => {
  const moduleId = `reports.dynamic.${report.key}`;

  /* Column metadata cache — fetched once, then reused */
  let cachedColumnMeta: ColumnMeta[] | null = null;
  let metaPromise: Promise<ColumnMeta[]> | null = null;

  const ensureColumnMeta = async (): Promise<ColumnMeta[]> => {
    if (cachedColumnMeta) return cachedColumnMeta;
    if (!metaPromise) {
      metaPromise = fetchReportMetadata(report.key)
        .then((meta) => {
          cachedColumnMeta = meta.columns.map(mapBackendColumnMeta);
          return cachedColumnMeta;
        })
        .catch((err) => {
          console.warn(`[dynamic-report] metadata fetch failed for ${report.key}:`, err);
          cachedColumnMeta = [];
          return cachedColumnMeta;
        });
    }
    return metaPromise;
  };

  /* Eagerly start fetching metadata */
  void ensureColumnMeta();

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
    renderFilters: ({ values, setFieldValue, onlyFields, excludeFields }) => {
      const include = (key: string) => {
        if (onlyFields && !onlyFields.includes(key)) return false;
        if (excludeFields && excludeFields.includes(key)) return false;
        return true;
      };
      return (
        <>
          {/* CompanyPicker: backend single-tenant raporlar (örn. muavin v3) için
              X-Company-Id header'ını seçilen şirkete bağlar. Storage key
              'reporting:currentCompanyId' shellServices.getCurrentCompanyId() ile
              dynamic-report/api.ts içindeki resolveCompanyId tarafından okunur.
              V1: hardcoded 1-43; V2 dynamic list (/api/v1/companies → OUR_COMPANY). */}
          {include('companyId') ? <CompanyPicker label="Şirket" /> : null}
          {include('search') ? (
            <label className="flex flex-col gap-1 text-xs font-medium text-text-secondary min-w-[200px]">
              <span>Ara</span>
              <input
                data-testid="report-filter-search"
                className="w-full rounded-md border border-border-subtle bg-surface-default px-3 py-2 text-sm text-text-primary placeholder:text-text-subtle focus:outline-hidden focus:ring-2 focus:ring-selection-outline focus:ring-offset-1"
                value={values.search ?? ''}
                placeholder="Arama..."
                onChange={(event) => setFieldValue('search', event.target.value)}
              />
            </label>
          ) : null}
        </>
      );
    },
    requiredFilterFields: ['companyId'],
    getColumnMeta: () => cachedColumnMeta ?? [],
    /*
     * a11y-pr1 follow-up: expose the async loader so ReportPage can
     * await metadata before computing colDefs. Without this, the eager
     * fetch races the grid mount and the grid renders with an empty
     * column set even after the row data fetch resolves with rows —
     * 12k rows arrive but `params.success({ rowData })` finds no
     * column definitions to project them onto.
     */
    ensureColumnMeta,
    getColumns: () => [],
    fetchRows: (filters, request) => fetchReportData(report.key, filters, request),
    exportRows: (filters, format) => exportReportData(report.key, filters, format),
  };
};
