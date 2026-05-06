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
import {
  buildColDefs,
  buildDetailRenderer,
  buildProcessCellCallback,
} from '@mfe/design-system/advanced/data-grid';
import { useReportSchemaContext } from '../../hooks/useReportSchemaContext';
import { enrichColumnsWithSchema } from '../../utils/enrichColumnsWithSchema';
import { getShellServices } from '../services/shell-services';

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
   * Server-side grouping is not yet implemented on the backend. AG Grid sends
   * `rowGroupCols` / `groupKeys` / `valueCols` in the SSRM request, but
   * `ReportController.getData` ignores them and returns flat rows. Any path
   * that puts the grid into a row-grouped state — drag-to-panel, column
   * header menu "Group by …", QuickGroupMenu in the toolbar — produces a
   * visibly broken grid (group column populated but rows not collapsed).
   *
   * This temporary guard disables every grouping entrypoint for server-mode
   * datasources so users don't hit the half-working feature. Client-mode
   * datasources keep grouping because AG Grid handles it in-memory without
   * the backend.
   *
   * Three places need to flip together (Codex 019dfe66 iter-2 absorb — just
   * hiding the panel is not enough; the column menu and QuickGroupMenu reach
   * the same broken state):
   *
   *   1. `rowGroupPanelShow: 'never'` (the drag-to panel)
   *   2. `defaultColDef.enableRowGroup/enablePivot/enableValue: false` (column
   *       header menu actions)
   *   3. column-level `enableRowGroup: false` and any pre-set `rowGroup` /
   *       `rowGroupIndex` cleared (QuickGroupMenu picks groupable columns
   *       from `columnDefs`)
   *
   * The proper fix lands in PR-0.1+ (POST /data/query contract + capability
   * flag + GROUP BY in SqlBuilder). When the backend exposes the
   * `serverSideGrouping` capability, `serverSideGroupingEnabled` flips to
   * read it, the panel returns, and groupable columns light up again. See
   * `docs/plans/2026-05-reporting-platform-hardening.md` PR-0 acceptance.
   */
  const serverSideGroupingEnabled = false; // TODO PR-0.1: read from backend capability and re-enable panel + groupable column actions together
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
        if (gridApi.isPivotMode()) gridApi.setPivotMode(false);
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
    module
      .ensureColumnMeta()
      .then(() => {
        if (!cancelled) {
          setColumnMetaVersion((v) => v + 1);
        }
      })
      .catch(() => {
        // ensureColumnMeta swallows errors internally and resolves to
        // `[]`; nothing more to do here besides triggering the re-render
        // with the empty cache so the grid stops showing the loading
        // spinner forever.
        if (!cancelled) {
          setColumnMetaVersion((v) => v + 1);
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
  const effectiveColDefs = React.useMemo<ColDef<TRow>[]>(
    () =>
      rowGroupingEnabled
        ? colDefs
        : colDefs.map((cd) => ({
            ...cd,
            enableRowGroup: false,
            enablePivot: false,
            enableValue: false,
            rowGroup: false,
            rowGroupIndex: null,
          })),
    [colDefs, rowGroupingEnabled],
  );

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
          };
          const res: GridResponse<TRow> = await module.fetchRows(filters, req);
          params.success({ rowData: res.rows, rowCount: res.total });
        } catch (error: unknown) {
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
    } catch (error: unknown) {
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
        const result = await module.exportRows(filters, format === 'excel' ? 'csv' : format);
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
          key={reloadSignal}
          gridId={module.id}
          gridSchemaVersion={1}
          initialVariantId={initialVariantId}
          columnDefs={effectiveColDefs}
          defaultColDef={groupingDefaultColDef}
          gridOptions={gridOptions}
          onGridReady={handleGridReady}
          dataSourceMode={dataSourceMode}
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
