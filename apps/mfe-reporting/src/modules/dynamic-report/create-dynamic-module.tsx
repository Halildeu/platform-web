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
  // PR-D1b iter-3 (Codex 019e8066): factory-internal cache reader. NEVER
  // import this from outside `modules/dynamic-report/` — ReportPage and
  // other consumers must read via `module.getFilterDefinitions?.()`.
  getCachedFilterDefinitions,
} from './metadata-cache';
// PR-D1b.B.2 step 5 (Codex thread 019e8074): metadata-driven widget
// dispatcher + translator. Both are factory-internal — the dispatcher
// renders inside `renderFilters` and the translator runs inside the
// fetch/export closures.
import { FilterRenderer } from './filters/widgets';
import { translateMetadataFilters } from './filters/metadata-filter-model-translator';

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
    createInitialFilters: (context) => {
      // PR-D1b.B.2 step 5 (Codex thread 019e8074): URL deep-link
      // rehydration. Read filterDefinitions from the cache (may be
      // undefined on cold mount; ReportPage will re-run this hook AFTER
      // ensureColumnMeta resolves when hasMetadataDrivenFilters=true).
      // Precedence per Codex iter-2:
      //   1. legacy `search` slot always reads searchParams.search
      //   2. for each definition: defaultValue (when present)
      //   3.   then searchParams.get(urlParam) overrides
      const search = context?.searchParams?.get('search')?.trim() ?? '';
      const definitions = getCachedFilterDefinitions(report.key);
      const seeded: Record<string, unknown> = { search };
      if (definitions) {
        for (const def of definitions) {
          if (def.defaultValue !== undefined) {
            seeded[def.key] = def.defaultValue;
          }
          const urlParam = def.urlParam ?? def.key;
          const urlValue = context?.searchParams?.get(urlParam);
          if (urlValue !== null && urlValue !== undefined) {
            seeded[def.key] = urlValue;
          }
        }
      }
      return seeded as DynamicReportFilters;
    },
    renderFilters: ({ values, setFieldValue, requiredFields }) => {
      const isRequired = (key: string) => (requiredFields ?? []).includes(key);
      // PR-D1b.B.2 step 5 (Codex thread 019e8074): metadata-driven
      // render path. Three states distinguished:
      //   - filterDefinitions === undefined → metadata not yet resolved
      //     OR backend predates filterDefinitions; render legacy
      //     CompanyPicker + search pair (byte-for-byte same as
      //     pre-D1b.B behavior).
      //   - filterDefinitions === []        → backend explicitly said
      //     "no filters"; render empty prefix.
      //   - filterDefinitions.length > 0    → loop FilterRenderer per
      //     definition. Translator runs in fetchRows/exportRows.
      const definitions = getCachedFilterDefinitions(report.key);

      if (definitions !== undefined) {
        if (definitions.length === 0) return null;
        return (
          <>
            {definitions.map((def) => (
              <FilterRenderer
                key={def.key}
                definition={def}
                value={values[def.key]}
                onChange={(next) =>
                  setFieldValue(
                    def.key as keyof typeof values,
                    next as DynamicReportFilters[keyof DynamicReportFilters],
                  )
                }
                required={isRequired(def.key)}
                reportKey={report.key}
              />
            ))}
          </>
        );
      }

      // Legacy fallback (filterDefinitions undefined): preserve pre-D1b.B
      // CompanyPicker + search pair byte-for-byte.
      return (
        <>
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
    /*
     * PR-D1b iter-3 (Codex 019e8066): contract surface for
     * backend-supplied filter definitions. ReportPage (PR-D1b.B)
     * reads this — NOT the cache module directly — to drive the
     * per-kind widget renderer dispatcher. Returns undefined when
     * metadata hasn't resolved OR backend response lacks
     * filterDefinitions (legacy reports).
     */
    getFilterDefinitions: () => getCachedFilterDefinitions(report.key),
    getColumns: () => [],
    fetchRows: (filters, request) => {
      // PR-D1b.B.2 step 7 (Codex thread 019e8074): translate the user's
      // metadata-driven filter state into the column-keyed simple filter
      // model the backend FilterTranslator expects. api.ts:
      // planAdvancedFilterPayload then merges it with grid filterModel
      // (grid wins) or honors an explicit advancedFilter pass-through.
      const definitions = getCachedFilterDefinitions(report.key);
      const metadataFilterModel = definitions
        ? translateMetadataFilters(definitions, filters as Record<string, unknown>)
        : null;
      return fetchReportData(
        report.key,
        filters,
        request,
        undefined,
        undefined,
        metadataFilterModel,
      );
    },
    // PR-0.5b (Codex thread 019e2cd7): forward the optional grid-state
    // snapshot so grouped/pivot exports match the user's on-screen view.
    // PR-0.5b2 (Codex thread 019e2d85): forward the raw/view mode.
    // PR-D1b.B.2 step 7 (Codex 019e8074): forward translator output.
    exportRows: (filters, format, gridState, mode) => {
      const definitions = getCachedFilterDefinitions(report.key);
      const metadataFilterModel = definitions
        ? translateMetadataFilters(definitions, filters as Record<string, unknown>)
        : null;
      return exportReportData(report.key, filters, format, gridState, mode, metadataFilterModel);
    },
    // PR-0.5c (Codex thread 019e2d54): set filter distinct values.
    fetchFilterValues: (column, search) => fetchFilterValues(report.key, column, search),
  };
};
