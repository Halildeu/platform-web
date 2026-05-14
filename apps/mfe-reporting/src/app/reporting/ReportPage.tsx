import React from 'react';
import { useLocation } from 'react-router-dom';
import { getSharedReport, getSharedReportExportMode } from '@platform/capabilities';
import {
  PageLayout,
  createPageLayoutBreadcrumbItems,
  createPageLayoutPreset,
} from '@mfe/design-system';
import { EntityGridTemplate, buildEntityGridQueryParams } from '../../grid';
import type { GridRequest, GridResponse, ColumnDef } from '../../grid';
import type {
  ColDef,
  GridApi,
  GridOptions,
  GridReadyEvent,
  IServerSideGetRowsParams,
} from 'ag-grid-community';
import { useReportingI18n } from '../../i18n/useReportingI18n';
import type { ReportModule } from '../../modules/types';
import type { ReportCapabilities } from '../../modules/dynamic-report/types';
import {
  buildColDefs,
  buildDetailRenderer,
  buildProcessCellCallback,
} from '@mfe/design-system/advanced/data-grid';
import type { VariantColumnState } from '@mfe/design-system/advanced/data-grid/VariantIntegration';
import { useReportSchemaContext } from '../../hooks/useReportSchemaContext';
import { enrichColumnsWithSchema } from '../../utils/enrichColumnsWithSchema';
import { getShellServices } from '../services/shell-services';
// PR-FE-3 (Codex 019e08e2 iter-11): typed error for tenant gate +
// CompanyPicker for the in-page selection prompt.
import { isTenantSelectionRequiredError } from '../../modules/dynamic-report/api';
import { CompanyPicker } from '../../components/CompanyPicker';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

type ToastType = 'success' | 'error' | 'warning' | 'info';

const showToast = (type: ToastType, text: string) => {
  try {
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { type, text } }));
  } catch {
    const method = type === 'error' ? 'error' : 'log';
    console[method](text);
  }
};

const normalizePermission = (value: string) => value.trim().toUpperCase();

const readCurrentPermissions = (): string[] => {
  try {
    const user = getShellServices().auth.getUser() as { permissions?: unknown } | null;
    if (!user || !Array.isArray(user.permissions)) return [];
    return user.permissions
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => normalizePermission(item));
  } catch {
    return [];
  }
};

const SERVER_CACHE_BLOCK_SIZE = 50;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface ReportPageProps<TFilters extends Record<string, unknown>, TRow> {
  module: ReportModule<TFilters, TRow>;
}

export function ReportPage<TFilters extends Record<string, unknown>, TRow>({
  module,
}: ReportPageProps<TFilters, TRow>) {
  const { t, ready } = useReportingI18n();
  const location = useLocation();
  const schemaCtx = useReportSchemaContext(module.sourceTables, module.sourceSchema);
  const sharedReport = React.useMemo(() => {
    try {
      return getSharedReport(module.sharedReportId);
    } catch {
      return null;
    }
  }, [module.sharedReportId]);
  const exportMode = (() => {
    try {
      return getSharedReportExportMode(module.sharedReportId, 'web');
    } catch {
      return 'client' as const;
    }
  })();
  const searchParams = React.useMemo(() => new URLSearchParams(location.search), [location.search]);
  const initialFiltersFromSearch = React.useMemo(
    () => module.createInitialFilters({ searchParams }),
    [module, searchParams],
  );
  const [filters, setFilters] = React.useState<TFilters>(initialFiltersFromSearch);
  const [reloadSignal, setReloadSignal] = React.useState(0);
  const [, setLoading] = React.useState(false);
  const [, setExporting] = React.useState(false);
  const [dataSourceMode, setDataSourceMode] = React.useState<'server' | 'client'>('server');
  const [clientRows, setClientRows] = React.useState<TRow[]>([]);
  const initialFilterSyncRef = React.useRef(true);
  const permissions = React.useMemo(
    () => readCurrentPermissions(),
    [location.key, location.pathname],
  );
  const exportEnabled =
    exportMode !== 'none' &&
    typeof module.exportRows === 'function' &&
    (!sharedReport?.exportPermissionCode ||
      permissions.includes(normalizePermission(sharedReport.exportPermissionCode)));

  React.useEffect(() => {
    if (initialFilterSyncRef.current) {
      initialFilterSyncRef.current = false;
      return;
    }
    setFilters(initialFiltersFromSearch);
    setReloadSignal((value) => value + 1);
  }, [initialFiltersFromSearch]);

  /*
   * Server-side grouping flip — closes the loop opened by platform-web #271.
   * Backend PR-0.1..0.3 (#78/#79/#81 on platform-backend) added the POST
   * /api/v1/reports/{key}/query contract, multi-level GROUP BY +
   * groupKeys expansion + leaf rows + type-aware coercion. Frontend
   * #272b (#273) wired the SSRM data path; #272c (#274) added the
   * variant sanitizer + context menu guard. This component now reads
   * the backend capability flag and lights up the row-group panel +
   * column header Group action + QuickGroupMenu for any report whose
   * registry marks at least one column groupable=true.
   *
   * Capability state is keyed by module identity so a route change
   * (different report) clears the previous report's capability before
   * any auto-apply effect can fire. Reports whose backend predates the
   * capability envelope, or whose registry has no groupable columns,
   * surface as undefined → all-false → stop-gap UX preserved.
   */
  const [reportCapabilities, setReportCapabilities] = React.useState<
    ReportCapabilities | undefined
  >(() => module.getCapabilities?.());
  // PR-FE-3 (Codex 019e08e2 iter-11): tenant gate state. When set, the
  // render layer suppresses the AG Grid datasource and shows a
  // prominent CompanyPicker block instead — the user picks a company,
  // CompanyPicker writes localStorage + reload, dynamic-report/api.ts
  // sends the X-Company-Id header on the next mount and the gate
  // clears (state stays null after a successful metadata fetch).
  const [tenantSelectionRequired, setTenantSelectionRequired] = React.useState<{
    reportKey: string;
    hint?: string;
  } | null>(null);
  /*
   * Reset capability state immediately when the module reference
   * changes (route → different report) so a stale {@code capability=true}
   * from the previous report can't leak into the new mount before the
   * new ensureColumnMeta resolves. React 18 "derived state during
   * render" pattern: setState during render is safe when guarded by a
   * snapshot-id comparison; React schedules the re-render with the
   * new value before any effect (incl. variant auto-apply) fires.
   */
  const [previousModuleId, setPreviousModuleId] = React.useState(module.id);
  if (previousModuleId !== module.id) {
    setPreviousModuleId(module.id);
    setReportCapabilities(module.getCapabilities?.());
  }
  const serverSideGroupingEnabled = reportCapabilities?.serverSideGrouping === true;
  const groupableFieldSet = React.useMemo(
    () => new Set(reportCapabilities?.groupableFields ?? []),
    [reportCapabilities],
  );
  const aggregatableFieldSet = React.useMemo(
    () => new Set(reportCapabilities?.aggregatableFields ?? []),
    [reportCapabilities],
  );
  const rowGroupingEnabled = dataSourceMode !== 'server' || serverSideGroupingEnabled;

  /* ---- Grid options (matching UsersGrid standard) ---- */
  const gridOptions = React.useMemo<GridOptions<TRow>>(
    () => ({
      cellSelection: true,
      multiSortKey: 'ctrl' as const,
      rowGroupPanelShow: rowGroupingEnabled ? ('always' as const) : ('never' as const),
      ...(dataSourceMode === 'server'
        ? { cacheBlockSize: SERVER_CACHE_BLOCK_SIZE, maxBlocksInCache: 1 }
        : {}),
    }),
    [dataSourceMode, rowGroupingEnabled],
  );

  /*
   * Codex 019dfe66 iter-3: do NOT put `defaultColDef` inside `gridOptions`.
   * `GridShell` merges the `defaultColDef` prop with its own `DEFAULT_COL_DEF`
   * (sortable / filter / floatingFilter / resizable etc.); embedding it in
   * `gridOptions` and letting AG Grid spread `gridOptions` last would clobber
   * those defaults. The right shape is a separate prop on
   * `EntityGridTemplate` so `GridShell` can do the merge.
   */
  const groupingDefaultColDef = React.useMemo<ColDef<TRow> | undefined>(
    () =>
      rowGroupingEnabled
        ? undefined
        : {
            enableRowGroup: false,
            enablePivot: false,
            enableValue: false,
          },
    [rowGroupingEnabled],
  );

  /*
   * Codex 019dfe66 iter-4 absorb. AG Grid `enableRowGroup: false` is a UI
   * capability guard — it stops drag/menu/QuickGroupMenu paths but does NOT
   * sanitize programmatic `applyColumnState` calls. `VariantIntegration`
   * applies a saved variant's `columnState` directly, so a previously saved
   * variant carrying `rowGroup: true` / `pivotMode: true` could still push
   * the grid into the broken grouping state even though every UI entrypoint
   * is closed.
   *
   * Defensive event listener: when grouping is disabled, any time AG Grid
   * detects a row-group / pivot / pivot-mode change, immediately clear it.
   * No-op when grouping is enabled (or when AG Grid is already in the empty
   * state, so no infinite loop).
   *
   * PR-0.1+ should replace this with a proper variant state sanitizer in
   * the design-system `VariantIntegration` component (Codex's preferred
   * approach), but that change is bigger and orthogonal to closing the
   * user-facing P0.
   */
  const [gridApi, setGridApi] = React.useState<GridApi<TRow> | null>(null);
  const handleGridReady = React.useCallback((event: GridReadyEvent<TRow>) => {
    setGridApi(event.api);
  }, []);

  React.useEffect(() => {
    if (!gridApi || rowGroupingEnabled) {
      return;
    }
    const clearGrouping = () => {
      try {
        if (gridApi.getRowGroupColumns().length > 0) gridApi.setRowGroupColumns([]);
        if (gridApi.getPivotColumns().length > 0) gridApi.setPivotColumns([]);
        if (gridApi.getValueColumns().length > 0) gridApi.setValueColumns([]);
        // AG Grid 34.x: setPivotMode is removed; setGridOption is the
        // canonical way (matches VariantIntegration's own pattern).
        if (gridApi.isPivotMode()) gridApi.setGridOption('pivotMode', false);
      } catch {
        // gridApi may be destroyed mid-cleanup; harmless
      }
    };
    // Initial clear in case a saved variant was applied before this effect ran.
    clearGrouping();
    gridApi.addEventListener('columnRowGroupChanged', clearGrouping);
    gridApi.addEventListener('columnPivotChanged', clearGrouping);
    gridApi.addEventListener('columnPivotModeChanged', clearGrouping);
    gridApi.addEventListener('columnValueChanged', clearGrouping);
    return () => {
      try {
        gridApi.removeEventListener('columnRowGroupChanged', clearGrouping);
        gridApi.removeEventListener('columnPivotChanged', clearGrouping);
        gridApi.removeEventListener('columnPivotModeChanged', clearGrouping);
        gridApi.removeEventListener('columnValueChanged', clearGrouping);
      } catch {
        /* */
      }
    };
  }, [gridApi, rowGroupingEnabled]);

  /*
   * a11y-pr1 follow-up: column metadata for dynamic reports is
   * fetched at runtime from `/v1/reports/{key}/metadata`. The legacy
   * `getColumnMeta()` is purely synchronous — it returns the cached
   * value or `[]` when the eager fetch hasn't resolved yet. Mounting
   * the grid with `[]` columns silently swallows row data: the
   * datasource resolves `params.success({ rowData })` but AG Grid has
   * no column definitions to project rows onto, so the table renders
   * 12k total in pagination and zero visible cells.
   *
   * Fix: track metadata readiness via state. When the module exposes
   * `ensureColumnMeta()`, await it and bump the version counter so the
   * `columns` memo re-runs against the populated cache.
   */
  const [columnMetaVersion, setColumnMetaVersion] = React.useState(0);

  React.useEffect(() => {
    if (typeof module.ensureColumnMeta !== 'function') {
      return;
    }
    let cancelled = false;
    const refreshCapabilities = () => {
      if (!cancelled && typeof module.getCapabilities === 'function') {
        setReportCapabilities(module.getCapabilities());
      }
    };
    module
      .ensureColumnMeta()
      .then(() => {
        if (!cancelled) {
          setColumnMetaVersion((v) => v + 1);
          // PR-0.2 (reporting hardening): refresh capabilities after the
          // metadata fetch resolves; the same /metadata response carries
          // both the column list and the capabilities envelope.
          refreshCapabilities();
          setTenantSelectionRequired(null);
        }
      })
      .catch((err) => {
        // PR-FE-3 (Codex 019e08e2 iter-11 AGREE absorb, 2026-05-08):
        // tenant_selection_required is now propagated as a typed error
        // from metadata-cache. Branch on it to set the gate state so
        // the render layer below shows a CompanyPicker block instead of
        // the empty grid. Other failure classes preserve the legacy
        // empty-cache outcome (see catch path above pre-fix).
        if (!cancelled) {
          if (isTenantSelectionRequiredError(err)) {
            setTenantSelectionRequired({
              reportKey: err.reportKey,
              hint: err.hint,
            });
          }
          setColumnMetaVersion((v) => v + 1);
          refreshCapabilities();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [module]);

  /* ---- Column definitions — metadata-first, fallback to legacy ---- */
  const columns = React.useMemo<ColumnDef<TRow>[]>(() => {
    if (module.getColumnMeta) {
      const rawMeta = module.getColumnMeta();
      const enriched = schemaCtx.isAvailable
        ? enrichColumnsWithSchema(rawMeta, schemaCtx.tables, schemaCtx.relationships)
        : rawMeta;
      return buildColDefs<TRow>(enriched, t, 'tr-TR');
    }
    return module.getColumns(t);
    // `columnMetaVersion` is intentionally in the deps array so the
    // memo re-evaluates after the async ensureColumnMeta() resolves.
  }, [
    module,
    t,
    ready,
    schemaCtx.isAvailable,
    schemaCtx.tables,
    schemaCtx.relationships,
    columnMetaVersion,
  ]);

  const colDefs = React.useMemo<ColDef<TRow>[]>(
    () =>
      columns.map((c) => {
        const colDef: ColDef<TRow> = {
          field: c.field,
          headerName: c.headerName ?? c.field,
          width: c.width,
          minWidth: c.minWidth,
          flex: c.flex ?? undefined,
          filter:
            c.filter !== undefined
              ? c.filter
              : c.filterType === 'number'
                ? 'agNumberColumnFilter'
                : c.filterType === 'date'
                  ? 'agDateColumnFilter'
                  : c.filterType === 'set'
                    ? 'agSetColumnFilter'
                    : 'agTextColumnFilter',
        };
        if (c.type) (colDef as Record<string, unknown>).type = c.type;
        if (c.sortable !== undefined) colDef.sortable = c.sortable;
        if (c.floatingFilter !== undefined) colDef.floatingFilter = c.floatingFilter;
        if (c.pinned) colDef.pinned = c.pinned;
        if (c.wrapText !== undefined) colDef.wrapText = c.wrapText;
        if (c.autoHeight !== undefined) colDef.autoHeight = c.autoHeight;
        if (c.cellRenderer) colDef.cellRenderer = c.cellRenderer;
        if (c.valueFormatter)
          colDef.valueFormatter = c.valueFormatter as ColDef<TRow>['valueFormatter'];
        if (c.valueGetter) colDef.valueGetter = c.valueGetter as ColDef<TRow>['valueGetter'];
        if (c.filterParams) colDef.filterParams = c.filterParams;
        if (c.cellClass) colDef.cellClass = c.cellClass;
        return colDef;
      }),
    [columns],
  );

  /*
   * When server-side grouping is disabled, strip every column's
   * `enableRowGroup` / `rowGroup` / `rowGroupIndex` so the toolbar's
   * QuickGroupMenu (which lists groupable columns from `columnDefs`) and the
   * column header menu can't put the grid into the broken state. See
   * `gridOptions` block above for the full rationale.
   */
  const effectiveColDefs = React.useMemo<ColDef<TRow>[]>(() => {
    if (!rowGroupingEnabled) {
      // Stop-gap from #271 — server-mode + capability=false blocks
      // every grouping affordance.
      return colDefs.map((cd) => ({
        ...cd,
        enableRowGroup: false,
        enablePivot: false,
        enableValue: false,
        rowGroup: false,
        rowGroupIndex: null,
      }));
    }
    if (dataSourceMode !== 'server') {
      // Client-mode datasources let AG Grid group in-memory regardless
      // of backend capability — no per-column gating needed.
      return colDefs;
    }
    /*
     * Server-mode with capability=true: per-column gating against the
     * backend allowlist. Only columns with groupable=true expose
     * enableRowGroup; only aggregatable=true expose enableValue. Pivot
     * stays off until PR-0.4 (backend pivot path) ships, even when
     * capability lights up — keeps the UI honest about what the
     * backend will accept on POST /query.
     */
    return colDefs.map((cd) => {
      const field = (cd as { field?: string }).field;
      const isGroupable = field !== undefined && groupableFieldSet.has(field);
      const isAggregatable = field !== undefined && aggregatableFieldSet.has(field);
      return {
        ...cd,
        enableRowGroup: isGroupable,
        enableValue: isAggregatable,
        enablePivot: false,
      };
    });
  }, [colDefs, rowGroupingEnabled, dataSourceMode, groupableFieldSet, aggregatableFieldSet]);

  /*
   * PR-0.2 sanitizer for saved variant column state. Server-mode only —
   * client-mode datasources let AG Grid handle grouping in-memory so
   * mutating the saved variant would silently break user expectations
   * (Codex iter-1 absorb).
   *
   * On server-mode: strip rowGroup / rowGroupIndex on every entry
   * whose colId isn't in groupableFieldSet, aggFunc on entries not in
   * aggregatableFieldSet, and pivot / pivotIndex always (PR-0.4 will
   * graduate pivot once the backend pivot path ships).
   *
   * Type signature mirrors the design-system VariantColumnState
   * contract directly so strict-mode function variance stays safe.
   */
  const sanitizeVariantColumnState = React.useCallback(
    (state: VariantColumnState): VariantColumnState => {
      if (!Array.isArray(state)) return state;
      if (dataSourceMode !== 'server') return state;
      const groupableSet = groupableFieldSet;
      const aggregatableSet = aggregatableFieldSet;
      return state.map((entry) => {
        if (!entry || typeof entry !== 'object') return entry;
        const next = { ...(entry as Record<string, unknown>) };
        const colId = String(next.colId ?? '');
        if (!groupableSet.has(colId)) {
          delete next.rowGroup;
          delete next.rowGroupIndex;
        }
        if (!aggregatableSet.has(colId)) {
          delete next.aggFunc;
        }
        // Pivot stays disabled platform-wide until PR-0.4 ships the
        // backend pivot path; an in-flight saved variant carrying
        // pivot=true would just produce a 400 GROUPING_NOT_SUPPORTED
        // on the next /query call.
        delete next.pivot;
        delete next.pivotIndex;
        return next as VariantColumnState[number];
      });
    },
    [dataSourceMode, groupableFieldSet, aggregatableFieldSet],
  );

  /*
   * Companion sanitizer for pivotMode. Server-mode forces false until
   * PR-0.4 ships pivot; client-mode passes through the saved value so
   * in-memory pivot stays usable for the legacy client-side reports.
   */
  const sanitizeVariantPivotMode = React.useCallback(
    (pivotMode: boolean | undefined) => (dataSourceMode === 'server' ? false : pivotMode),
    [dataSourceMode],
  );

  /*
   * Capability "envelope signature" — change forces the embedded
   * VariantIntegration to re-mount via the {@code key} prop chain. Any
   * envelope swap re-runs the auto-apply effect against the fresh
   * sanitizer; without this, appliedRef.current would block re-apply
   * when capabilities arrive late or transition between reports.
   */
  const capabilityKey = React.useMemo(() => {
    const groupable = (reportCapabilities?.groupableFields ?? []).join(',');
    const aggregatable = (reportCapabilities?.aggregatableFields ?? []).join(',');
    return `${reportCapabilities?.serverSideGrouping ? '1' : '0'}|${groupable}|${aggregatable}`;
  }, [reportCapabilities]);

  /* ---- Server-side datasource ---- */
  const createServerSideDatasource = React.useCallback(
    () => ({
      getRows: async (params: IServerSideGetRowsParams) => {
        setLoading(true);
        try {
          const baseParams = buildEntityGridQueryParams({
            request: params.request,
            quickFilterText: (params.request as { quickFilterText?: string }).quickFilterText ?? '',
          });
          const sortModelFromHelper = (baseParams.sort ?? '')
            .split(';')
            .map((s) => {
              const [colId, dir] = s.split(',');
              if (!colId || !dir) return null;
              return { colId, sort: dir as 'asc' | 'desc' };
            })
            .filter(Boolean) as { colId: string; sort: 'asc' | 'desc' }[];

          /*
           * PR-0.2 hardening (reporting platform plan, 2026-05): forward
           * AG Grid SSRM grouping fields verbatim instead of stringifying
           * them into URL params. The module's fetchRows decides whether
           * to send POST /query (when requestsGrouping is true) or fall
           * back to the legacy GET /data path (flat). buildEntityGridQueryParams
           * still produces the legacy URL-encoded mirror for the GET path
           * but now we keep the structured form alongside it.
           */
          const ssrmRequest = params.request as {
            rowGroupCols?: GridRequest['rowGroupCols'];
            valueCols?: GridRequest['valueCols'];
            pivotCols?: GridRequest['pivotCols'];
            pivotMode?: boolean;
            groupKeys?: string[];
            startRow?: number;
            endRow?: number;
          };
          const req: GridRequest = {
            page: baseParams.page,
            pageSize: baseParams.pageSize,
            sortModel:
              sortModelFromHelper.length > 0
                ? sortModelFromHelper
                : Array.isArray(params.request.sortModel)
                  ? params.request.sortModel.map((s) => ({ colId: s.colId, sort: s.sort }))
                  : undefined,
            filterModel: params.request.filterModel ?? undefined,
            quickFilter: baseParams.search,
            advancedFilter: baseParams.advancedFilter,
            startRow: ssrmRequest.startRow,
            endRow: ssrmRequest.endRow,
            rowGroupCols: ssrmRequest.rowGroupCols,
            valueCols: ssrmRequest.valueCols,
            pivotCols: ssrmRequest.pivotCols,
            pivotMode: ssrmRequest.pivotMode,
            groupKeys: ssrmRequest.groupKeys,
          };
          const res: GridResponse<TRow> = await module.fetchRows(filters, req);
          params.success({ rowData: res.rows, rowCount: res.total });
          // PR-FE-3 (Codex 019e08e2 iter-12 REVISE absorb): clear the
          // tenant gate on a successful data fetch — covers the case
          // where the user picks a company AFTER metadata succeeded
          // (no metadata-path gate fired) and then the first data
          // request unblocks. Without this, a stale gate would persist
          // even after successful data arrives.
          setTenantSelectionRequired(null);
        } catch (error: unknown) {
          // PR-FE-3 (Codex 019e08e2 iter-12 REVISE absorb): tenant gate
          // detection on the data path. Live symptom is `/data` 400
          // tenant_selection_required (metadata 200 because backend
          // resolves the schema before requiring the company header
          // for yearly tables). Branch on the typed error, set the
          // page-level gate state, suppress the generic toast — the
          // CompanyPicker block render below takes over. AG Grid still
          // sees params.fail() so the loading spinner stops.
          if (isTenantSelectionRequiredError(error)) {
            setTenantSelectionRequired({
              reportKey: error.reportKey,
              hint: error.hint,
            });
            params.fail?.();
            return;
          }
          params.fail?.();
          const messageText = error instanceof Error ? error.message : 'Veriler yüklenemedi.';
          showToast('error', messageText);
        } finally {
          setLoading(false);
        }
      },
    }),
    [filters, module],
  );

  /* ---- Client-side data loading ---- */
  const loadClientData = React.useCallback(async () => {
    setLoading(true);
    try {
      const req: GridRequest = { page: 1, pageSize: 10000, quickFilter: '' };
      const res: GridResponse<TRow> = await module.fetchRows(filters, req);
      setClientRows(res.rows);
      // PR-FE-3 (Codex 019e08e2 iter-12 REVISE absorb): clear gate on
      // successful client-side load too (parallel to server-side branch).
      setTenantSelectionRequired(null);
    } catch (error: unknown) {
      // PR-FE-3 (Codex 019e08e2 iter-12 REVISE absorb): client-mode
      // tenant gate handling. Same shape as the server-mode branch —
      // typed error → state, no toast, empty rows.
      if (isTenantSelectionRequiredError(error)) {
        setTenantSelectionRequired({
          reportKey: error.reportKey,
          hint: error.hint,
        });
        setClientRows([]);
        return;
      }
      showToast('error', error instanceof Error ? error.message : 'Veriler yüklenemedi.');
      setClientRows([]);
    } finally {
      setLoading(false);
    }
  }, [filters, module]);

  React.useEffect(() => {
    if (dataSourceMode === 'client') {
      void loadClientData();
    }
  }, [dataSourceMode, loadClientData]);

  /* ---- Export config (matching UsersGrid: separator, BOM) ---- */
  const exportConfig = React.useMemo(() => {
    if (!exportEnabled || typeof module.exportRows !== 'function') return undefined;
    return {
      fileBaseName: module.route,
      sheetName: t(module.titleKey),
      csvColumnSeparator: ';',
      csvBom: true,
      ...(module.getColumnMeta
        ? {
            processCellCallback: buildProcessCellCallback(module.getColumnMeta(), t),
          }
        : {}),
    };
  }, [module, t, exportEnabled]);

  /* ---- Locale text (full, matching UsersGrid) ---- */
  const localeText = React.useMemo(() => {
    const groupText = t('shared.grid.groupPanel');
    const valueText = t('shared.grid.valuePanel') || 'Değer sütunlarını buraya sürükleyin';
    return {
      // Group panel
      rowGroupPanel: groupText,
      dropZoneColumnGroup: groupText,
      rowGroupColumnsEmptyMessage: groupText,
      dragHereToSetColumnRowGroup: groupText,
      dragHereToSetRowGroup: groupText,
      dropZoneColumnValue: valueText,
      // Side panel
      filters: t('shared.grid.filters'),
      columns: t('shared.grid.columns'),
      // Advanced filter
      advancedFilter: t('shared.grid.advancedFilter') || 'Gelişmiş Filtre',
      advancedFilterBuilder: t('shared.grid.advancedFilterBuilder') || 'Filtre Oluşturucu',
      advancedFilterButtonTooltip:
        t('shared.grid.advancedFilterButtonTooltip') || 'Gelişmiş Filtre',
      advancedFilterBuilderAdd: t('shared.grid.advancedFilterBuilderAdd') || 'Ekle',
      advancedFilterBuilderRemove: t('shared.grid.advancedFilterBuilderRemove') || 'Kaldır',
      advancedFilterJoinOperator: t('shared.grid.advancedFilterJoinOperator') || 'Operatör',
      advancedFilterAnd: t('shared.grid.advancedFilterAnd') || 'VE',
      advancedFilterOr: t('shared.grid.advancedFilterOr') || 'VEYA',
      advancedFilterValidationMissingColumn:
        t('shared.grid.advancedFilterValidationMissingColumn') || 'Sütun seçiniz',
      advancedFilterValidationMissingOption:
        t('shared.grid.advancedFilterValidationMissingOption') || 'Seçenek belirtiniz',
      advancedFilterValidationMissingValue:
        t('shared.grid.advancedFilterValidationMissingValue') || 'Değer giriniz',
      advancedFilterApply: t('shared.grid.advancedFilterApply') || 'Uygula',
    } as Record<string, string>;
  }, [t]);

  /* ---- Footer: Server/Client mode selector (birebir UsersGrid standardı) ---- */
  const modeSelector = React.useMemo(
    () => (
      <div className="flex items-center gap-3 text-sm text-text-secondary">
        <span className="font-semibold text-text-primary">
          {t('shared.grid.mode.label') || 'Mod'}
        </span>
        <select
          className="rounded-xl border border-border-subtle bg-surface-default px-3 py-1 text-sm font-medium text-text-secondary shadow-xs focus:outline-hidden focus:ring-2 focus:ring-selection-outline"
          value={dataSourceMode}
          onChange={(event) => setDataSourceMode(event.target.value as 'server' | 'client')}
        >
          <option value="server">{t('shared.grid.mode.server') || 'Sunucu'}</option>
          <option value="client">{t('shared.grid.mode.client') || 'İstemci'}</option>
        </select>
        {dataSourceMode === 'client' && (
          <button
            type="button"
            onClick={() => void loadClientData()}
            className="rounded-lg bg-action-primary px-3 py-1 text-xs font-semibold text-action-primary-text shadow-xs transition hover:opacity-90"
          >
            Yenile
          </button>
        )}
      </div>
    ),
    [dataSourceMode, loadClientData, t],
  );

  /* ---- Breadcrumbs & layout ---- */
  const breadcrumbItems = createPageLayoutBreadcrumbItems(
    module.breadcrumbKeys.map((item) => ({
      title: t(item.key),
      path: item.to,
    })),
  );
  const pageLayoutPreset = createPageLayoutPreset({
    preset: 'content-only',
    pageWidth: 'full',
  });

  const initialVariantId = searchParams.get('variant') ?? undefined;

  /* ---- Server export handler ---- */
  const handleServerExport = React.useCallback(
    async (format: 'excel' | 'csv') => {
      if (typeof module.exportRows !== 'function') return;
      setExporting(true);
      try {
        // Plan §7 Adım 4 (Codex 019e258f audit): backend ReportExportController
        // ExcelStreamingExporter destekliyor (Apache POI XLSX); önceki
        // `format === 'excel' ? 'csv' : format` workaround eski backend-Excel
        // desteksiz dönemden kalmıştı — kaldırıldı. Format param direkt passthrough.
        const result = await module.exportRows(filters, format);
        const objectUrl = window.URL.createObjectURL(result.blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = result.filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        window.URL.revokeObjectURL(objectUrl);
        showToast('success', t('reports.export.success') || 'Export indirilmeye başladı.');
      } catch (error: unknown) {
        showToast(
          'error',
          error instanceof Error
            ? error.message
            : t('reports.export.failed') || 'Export başlatılamadı.',
        );
      } finally {
        setExporting(false);
      }
    },
    [module, filters, t],
  );

  /* ---- Loading skeleton ---- */
  if (!ready) {
    return (
      <div className="rounded-3xl border border-border-subtle bg-surface-default p-6 shadow-xs">
        <div className="h-4 w-36 animate-pulse rounded-full bg-surface-muted" />
      </div>
    );
  }

  // PR-FE-3 (Codex 019e08e2 iter-11 AGREE absorb, 2026-05-08): tenant
  // gate prominent block. When the metadata or data fetch returned
  // tenant_selection_required, suppress the AG Grid datasource and
  // show a CompanyPicker block with the canonical
  // "Bu rapor için şirket seçimi zorunlu" copy. CompanyPicker reload
  // pattern (writes localStorage + window.location.reload) clears the
  // gate on the next mount because dynamic-report/api.ts now sends
  // X-Company-Id and the metadata fetch resolves cleanly.
  if (tenantSelectionRequired) {
    return (
      <div data-testid={`report-page-${module.route}`}>
        <PageLayout
          {...pageLayoutPreset}
          title={t(module.titleKey)}
          description={t(module.descriptionKey)}
          breadcrumbItems={breadcrumbItems}
          descriptionRevealOnHover
        >
          <div
            className="flex min-h-[320px] items-center justify-center rounded-3xl border border-border-subtle bg-surface-default p-8 shadow-xs"
            data-testid="reporting-tenant-selection-gate"
          >
            <div className="flex max-w-xl flex-col items-center gap-4 text-center">
              <h2 className="text-lg font-semibold text-text-primary">
                Bu rapor için şirket seçimi zorunlu
              </h2>
              <p className="text-sm text-text-secondary">
                {tenantSelectionRequired.hint ??
                  'Yıllık şema raporu için aktif bir şirket seçmelisiniz. Aşağıdan seçim yaptığınızda sayfa otomatik yeniden yüklenir ve rapor verileri seçilen şirkete göre listelenir.'}
              </p>
              <CompanyPicker required />
            </div>
          </div>
        </PageLayout>
      </div>
    );
  }

  return (
    <div data-testid={`report-page-${module.route}`}>
      <PageLayout
        {...pageLayoutPreset}
        title={t(module.titleKey)}
        description={t(module.descriptionKey)}
        breadcrumbItems={breadcrumbItems}
        descriptionRevealOnHover
      >
        {module.renderDashboard ? module.renderDashboard(t, filters) : null}

        <EntityGridTemplate<TRow>
          /*
           * PR-0.2 hardening: include module.id + capabilityKey in the
           * React key so both a route change to a different report and
           * a late capability arrival force a full re-mount of the
           * EntityGridTemplate + embedded VariantIntegration. Without
           * module.id, two reports with the same capability signature
           * would share the appliedRef.current guard and the second
           * mount could keep stale variant state from the first
           * (Codex iter-1 absorb).
           */
          key={`${module.id}-${reloadSignal}-${capabilityKey}`}
          gridId={module.id}
          gridSchemaVersion={1}
          initialVariantId={initialVariantId}
          columnDefs={effectiveColDefs}
          defaultColDef={groupingDefaultColDef}
          gridOptions={gridOptions}
          onGridReady={handleGridReady}
          dataSourceMode={dataSourceMode}
          sanitizeVariantColumnState={sanitizeVariantColumnState}
          sanitizeVariantPivotMode={sanitizeVariantPivotMode}
          createServerSideDatasource={
            dataSourceMode === 'server' ? () => createServerSideDatasource() : undefined
          }
          rowData={dataSourceMode === 'client' ? clientRows : undefined}
          total={dataSourceMode === 'client' ? clientRows.length : undefined}
          footerStartSlot={modeSelector}
          /*
           * Report-level filters (CompanyPicker etc.) are rendered as a
           * locked top-row inside the same "Filtre" drawer the user opens
           * via the toolbar's Filtre button (FilterBuilderPanel). The user
           * sees one filter drawer — Şirket / Eşittir locked + the picker
           * dropdown editable, then their own AG-Grid-style condition
           * rules below.
           *
           * Modules that legitimately return null from renderFilters
           * (context-health, hr-executive-summary, the dashboard fallback)
           * pass null through; FilterBuilderPanel suppresses the prefix
           * block when the value is null/false, so the drawer stays
           * unchanged for those reports.
           */
          filterBuilderPrefix={module.renderFilters?.({
            values: filters,
            setFieldValue: (key, value) =>
              setFilters((prev) => ({ ...prev, [key]: value }) as TFilters),
            t,
            requiredFields: module.requiredFilterFields,
          })}
          detailDrawer={
            module.getColumnMeta
              ? (row) =>
                  buildDetailRenderer(module.getColumnMeta!())(
                    row as Record<string, unknown> | null,
                    t,
                  )
              : module.renderDetail
                ? (row) => module.renderDetail?.(row, t)
                : undefined
          }
          localeText={localeText}
          quickFilterLabel={t(module.titleKey)}
          quickFilterPlaceholder={
            t('reports.filters.search.placeholder') || 'Tüm sütunlarda ara...'
          }
          resetFiltersLabel={t('reports.filters.reset')}
          exportConfig={exportConfig}
          onServerExport={exportEnabled ? handleServerExport : undefined}
        />
      </PageLayout>
    </div>
  );
}
