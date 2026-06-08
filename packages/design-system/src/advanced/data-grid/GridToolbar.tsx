/**
 * GridToolbar — Grid control bar.
 *
 * Responsibilities:
 * - Quick filter input with SSRM refresh support
 * - Density toggle (comfortable / compact)
 * - Theme selector dropdown
 * - Fullscreen toggle
 * - Excel / CSV export (2 buttons — always exports all filtered rows)
 * - Reset filters button
 * - Extensible extras slot
 */
import React, { useCallback, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import {
  resolveAccessState,
  accessStyles,
  type AccessControlledProps,
} from '../../internal/access-controller';
import type { GridApi } from 'ag-grid-community';
import type { GridTheme, GridDensity } from './GridShell';
import type { GridExportConfig } from './EntityGridTemplate';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface GridToolbarMessages {
  quickFilterPlaceholder?: string;
  densityComfortableLabel?: string;
  densityCompactLabel?: string;
  densityResetLabel?: string;
  themeLabel?: string;
  fullscreenLabel?: string;
  fullscreenTooltip?: string;
  resetFiltersLabel?: string;
  excelLabel?: string;
  csvLabel?: string;
  exportingLabel?: string;
  /* PR-0.5b2 (Codex thread 019e2d85): raw vs view export menu. */
  exportMenuLabel?: string;
  exportRawGroupLabel?: string;
  exportViewGroupLabel?: string;
}

/**
 * PR-0.5b2 (Codex thread 019e2d85): export mode selector.
 *
 * <ul>
 *   <li>{@code 'raw'} — the report's flat detail rows, ignoring any
 *       AG Grid row grouping / pivot. The on-screen column filters
 *       and sort still apply.</li>
 *   <li>{@code 'view'} — the user's current on-screen view: grouped
 *       / pivoted leaf-bucket table when grouping is active, flat
 *       otherwise.</li>
 * </ul>
 */
export type GridExportMode = 'raw' | 'view';

/** Props for the GridToolbar component. */
export interface GridToolbarProps<RowData = unknown> extends AccessControlledProps {
  /** Reference to current GridApi */
  gridApi: GridApi<RowData> | null;
  /** Current theme */
  theme: GridTheme;
  /** Theme change handler */
  onThemeChange?: (theme: GridTheme) => void;
  /** Available theme options */
  themeOptions?: readonly { label: string; value: GridTheme }[];
  /** Current density */
  density: GridDensity;
  /** Density change handler */
  onDensityChange?: (density: GridDensity) => void;
  /** Whether grid is in server mode (affects quick filter behavior) */
  isServerMode?: boolean;
  /** Quick filter initial value */
  quickFilterInitialValue?: string;
  /** Quick filter value change handler */
  onQuickFilterChange?: (value: string) => void;
  /** Fullscreen handler */
  onRequestFullscreen?: () => void;
  /** Whether currently fullscreen */
  isFullscreen?: boolean;
  /** Export configuration */
  exportConfig?: GridExportConfig<RowData>;
  /**
   * Server-side export callback. Called when exporting in server mode.
   * Should fetch all filtered rows from backend and trigger file download.
   * Receives current filter model and sort model from the grid.
   *
   * <p>PR-0.5b2 (Codex thread 019e2d85): the {@code params} object
   * gains an optional {@code exportMode}. It is non-positional —
   * legacy callers using {@code onServerExport(format, params)} keep
   * working; only the raw/view dropdown path sets {@code exportMode}.
   */
  onServerExport?: (
    format: 'excel' | 'csv',
    params: {
      filterModel: Record<string, unknown>;
      sortModel: unknown[];
      quickFilterText: string;
      exportMode?: GridExportMode;
    },
  ) => Promise<void>;
  /**
   * PR-0.5b2 (Codex thread 019e2d85): when true, the export control
   * becomes a single "İndir" dropdown offering raw-data and
   * current-view variants (each with Excel + CSV). When false /
   * absent, the legacy two-button Excel + CSV layout renders
   * (raw-only — no grouping/pivot so the two modes coincide).
   *
   * <p>ReportPage derives this from the report's capability flags
   * ({@code serverSideGrouping || serverSidePivoting}).
   */
  supportsViewExport?: boolean;
  /** i18n messages */
  messages?: GridToolbarMessages;
  /** Extra elements to render in toolbar */
  extras?: React.ReactNode;
  /**
   * Trailing toolbar slot rendered on the RIGHT cluster, immediately to the
   * LEFT of the export ("İndir") control — for primary toolbar actions such as
   * a bulk action menu. Distinct from `extras` (left cluster, near Filtre).
   * Optional; default undefined renders nothing (backward-compatible — no
   * existing grid is affected).
   */
  exportLeadingExtras?: React.ReactNode;
  /** Variant selector slot (injected by VariantIntegration) */
  variantSlot?: React.ReactNode;
  /** Container className */
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Inline export icons                                                */
/* ------------------------------------------------------------------ */

const ExcelIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="8" y1="13" x2="16" y2="13" />
    <line x1="8" y1="17" x2="16" y2="17" />
  </svg>
);

const CsvIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="8" y1="13" x2="11" y2="13" />
    <line x1="8" y1="17" x2="13" y2="17" />
  </svg>
);

/* ------------------------------------------------------------------ */
/*  Default theme options                                              */
/* ------------------------------------------------------------------ */

const DEFAULT_THEME_OPTIONS: readonly { label: string; value: GridTheme }[] = [
  { label: 'Quartz', value: 'quartz' },
  { label: 'Balham', value: 'balham' },
  { label: 'Alpine', value: 'alpine' },
  { label: 'Material', value: 'material' },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/** Toolbar strip for data grids with search, density toggle, theme switcher, and export.
 * Export buttons always export all filtered rows (not just current page).
 * In server mode, calls onServerExport callback for backend-side export.
 * In client mode, uses AG Grid's built-in export (all rows, ignoring pagination).
 *
 * @example
 * ```tsx
 * <GridToolbar gridApi={api} theme="quartz" density="comfortable" exportConfig={{ fileBaseName: 'users' }} />
 * ```
 * @since 1.0.0
 */
export const GridToolbar = <RowData = unknown,>({
  gridApi,
  // theme / density props are kept on the public GridToolbarProps
  // contract for API stability, but this component no longer renders
  // the theme selector / density toggle itself (GridShell owns them).
  // Underscore-prefixed so the unused-vars lint stays clean without
  // a breaking interface change. (PR-0.5b2 incidental cleanup —
  // these warnings predate this PR; lint-staged surfaced them when
  // the file was touched for the export-mode dropdown.)
  theme: _theme,
  onThemeChange: _onThemeChange,
  themeOptions: _themeOptions = DEFAULT_THEME_OPTIONS,
  density: _density,
  onDensityChange: _onDensityChange,
  isServerMode = false,
  quickFilterInitialValue = '',
  onQuickFilterChange,
  onRequestFullscreen,
  isFullscreen = false,
  exportConfig,
  onServerExport,
  supportsViewExport = false,
  messages,
  extras,
  exportLeadingExtras,
  variantSlot,
  className,
  access,
  accessReason,
}: GridToolbarProps<RowData>): React.ReactElement => {
  const accessState = resolveAccessState(access);
  if (accessState.isHidden) return (<></>) as unknown as React.ReactElement;
  const [quickFilter, setQuickFilter] = useState(quickFilterInitialValue);
  const [exporting, setExporting] = useState<'excel' | 'csv' | null>(null);
  // PR-0.5b2 (Codex 019e2d85): "İndir" dropdown open state — only
  // used when showViewExport is true.
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  /*
   * PR-0.5b2 iter-2 §P1: the raw/view dropdown is shown only when the
   * server export path is actually wired. In client mode AG Grid's
   * built-in export runs and ignores exportMode, so a dropdown there
   * would present fake choices. A non-grouping server report keeps
   * the legacy two-button layout too (raw == view for flat data).
   */
  const showViewExport = supportsViewExport && isServerMode && Boolean(onServerExport);

  const handleQuickFilterChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setQuickFilter(value);
      onQuickFilterChange?.(value);

      if (gridApi) {
        gridApi.setGridOption?.('quickFilterText', value);
        if (isServerMode) {
          gridApi.refreshServerSide?.({ purge: false });
        }
      }
    },
    [gridApi, isServerMode, onQuickFilterChange],
  );

  const handleResetFilters = useCallback(() => {
    if (!gridApi) return;
    gridApi.setFilterModel?.(null);
    gridApi.setAdvancedFilterModel?.(null);
    gridApi.setGridOption?.('quickFilterText', '');
    setQuickFilter('');
    onQuickFilterChange?.('');
    if (isServerMode) {
      gridApi.refreshServerSide?.({ purge: true });
    }
  }, [gridApi, isServerMode, onQuickFilterChange]);

  /* ---- Unified export handler ---- */
  const handleExport = useCallback(
    async (format: 'excel' | 'csv', exportMode?: GridExportMode) => {
      if (!gridApi) return;
      setExportMenuOpen(false);

      // Server-side mode: delegate to callback
      if (isServerMode && onServerExport) {
        setExporting(format);
        try {
          const filterModel = gridApi.getFilterModel?.() ?? {};
          const sortModel = (gridApi.getColumnState?.() ?? [])
            .filter((c) => c.sort)
            .map((c) => ({ colId: c.colId, sort: c.sort, sortIndex: c.sortIndex }));
          const quickFilterText = (gridApi.getGridOption?.('quickFilterText') as string) ?? '';
          // PR-0.5b2: exportMode rides in the params object so legacy
          // callers (mfe-users etc.) that ignore it are unaffected.
          await onServerExport(format, { filterModel, sortModel, quickFilterText, exportMode });
        } finally {
          setExporting(null);
        }
        return;
      }

      // Client-side mode: use AG Grid export (all filtered rows)
      if (format === 'excel') {
        gridApi.exportDataAsExcel?.({
          fileName: exportConfig?.fileBaseName
            ? `${exportConfig.fileBaseName}.xlsx`
            : 'export.xlsx',
          sheetName: exportConfig?.sheetName ?? 'Sheet1',
          processCellCallback: exportConfig?.processCellCallback,
          allColumns: true,
        });
      } else {
        gridApi.exportDataAsCsv?.({
          fileName:
            (exportConfig?.csvFileBaseName ?? exportConfig?.fileBaseName)
              ? `${exportConfig?.csvFileBaseName ?? exportConfig?.fileBaseName}.csv`
              : 'export.csv',
          processCellCallback: exportConfig?.processCellCallback,
          allColumns: true,
          columnSeparator: exportConfig?.csvColumnSeparator ?? ';',
        });
      }
    },
    [gridApi, isServerMode, onServerExport, exportConfig],
  );

  const m = messages ?? {};

  return (
    <div
      data-access-state={accessState.state}
      className={[
        'flex flex-wrap items-center gap-3 border-b border-border-subtle bg-surface-default px-4 py-2',
        className ?? '',
        accessStyles(accessState.state),
      ]
        .join(' ')
        .trim()}
      data-component="grid-toolbar"
      title={accessReason}
    >
      {/* Quick filter */}
      <input
        type="text"
        value={quickFilter}
        onChange={handleQuickFilterChange}
        placeholder={m.quickFilterPlaceholder ?? 'Tüm sütunlarda ara...'}
        className="h-8 min-w-[180px] rounded-md border border-border-default bg-surface-default px-3 text-sm text-text-primary placeholder:text-text-disabled focus:border-action-primary focus:outline-hidden focus:ring-2 focus:ring-accent-focus"
        aria-label={m.quickFilterPlaceholder ?? 'Quick filter'}
      />

      {/* Extras slot (Grupla, Filtre, etc.) */}
      {extras}

      {/* Reset filters */}
      <button
        type="button"
        className="h-8 rounded-md bg-surface-muted px-3 text-xs font-medium text-text-secondary hover:bg-surface-raised"
        onClick={handleResetFilters}
      >
        {m.resetFiltersLabel ?? 'Reset Filters'}
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Primary action slot — right cluster, immediately LEFT of the
          İndir export control (e.g. a bulk action menu). */}
      {exportLeadingExtras}

      {/*
        Export controls. PR-0.5b2 (Codex 019e2d85, iter-2 §P1):
        - showViewExport → single "İndir" dropdown with raw-data +
          current-view variants. Gated on isServerMode && onServerExport
          because the raw/view split only exists on the server export
          path — in client mode AG Grid's built-in export ignores the
          exportMode, so a dropdown there would offer fake choices.
        - otherwise → legacy 2-button Excel + CSV (client AG Grid
          export, or a non-grouping server report).
      */}
      {exportConfig && !isFullscreen && !showViewExport && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={exporting === 'excel'}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-surface-muted px-3 text-xs font-medium text-text-secondary hover:bg-surface-raised disabled:opacity-50"
            onClick={() => handleExport('excel')}
            title="Excel"
          >
            <ExcelIcon className="h-4 w-4" />
            {exporting === 'excel'
              ? (m.exportingLabel ?? 'İndiriliyor...')
              : (m.excelLabel ?? 'Excel')}
          </button>
          <button
            type="button"
            disabled={exporting === 'csv'}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-surface-muted px-3 text-xs font-medium text-text-secondary hover:bg-surface-raised disabled:opacity-50"
            onClick={() => handleExport('csv')}
            title="CSV"
          >
            <CsvIcon className="h-4 w-4" />
            {exporting === 'csv' ? (m.exportingLabel ?? 'İndiriliyor...') : (m.csvLabel ?? 'CSV')}
          </button>
        </div>
      )}

      {exportConfig && !isFullscreen && showViewExport && (
        <div className="relative" data-component="grid-export-menu">
          <button
            type="button"
            disabled={exporting !== null}
            aria-haspopup="menu"
            aria-expanded={exportMenuOpen}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-surface-muted px-3 text-xs font-medium text-text-secondary hover:bg-surface-raised disabled:opacity-50"
            onClick={() => setExportMenuOpen((open) => !open)}
            title={m.exportMenuLabel ?? 'İndir'}
          >
            <ExcelIcon className="h-4 w-4" />
            {exporting !== null
              ? (m.exportingLabel ?? 'İndiriliyor...')
              : (m.exportMenuLabel ?? 'İndir')}
            <span aria-hidden className="text-[10px]">
              ▾
            </span>
          </button>
          {exportMenuOpen && (
            <>
              {/* click-away backdrop */}
              <div
                className="fixed inset-0 z-40"
                aria-hidden
                onClick={() => setExportMenuOpen(false)}
              />
              <div
                role="menu"
                className="absolute right-0 z-50 mt-1 w-56 rounded-md border border-border-default bg-surface-default py-1 shadow-lg"
              >
                <div className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-text-disabled">
                  {m.exportRawGroupLabel ?? 'Ham veri'}
                </div>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-muted"
                  onClick={() => handleExport('excel', 'raw')}
                >
                  <ExcelIcon className="h-4 w-4" />
                  Excel
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-muted"
                  onClick={() => handleExport('csv', 'raw')}
                >
                  <CsvIcon className="h-4 w-4" />
                  CSV
                </button>
                <div className="my-1 border-t border-border-subtle" />
                <div className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-text-disabled">
                  {m.exportViewGroupLabel ?? 'Mevcut görünüm'}
                </div>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-muted"
                  onClick={() => handleExport('excel', 'view')}
                >
                  <ExcelIcon className="h-4 w-4" />
                  Excel
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-muted"
                  onClick={() => handleExport('csv', 'view')}
                >
                  <CsvIcon className="h-4 w-4" />
                  CSV
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Variant selector slot */}
      {variantSlot}

      {/* Fullscreen toggle */}
      {onRequestFullscreen && (
        <button
          type="button"
          className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-muted text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary"
          onClick={onRequestFullscreen}
          title={m.fullscreenTooltip ?? (isFullscreen ? 'Exit fullscreen' : 'Fullscreen')}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
};

GridToolbar.displayName = 'GridToolbar';

export default GridToolbar;
