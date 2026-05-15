/**
 * GridShell — Core AG Grid v34 wrapper.
 *
 * Responsibilities:
 * - AgGridReact rendering with ref forwarding
 * - Theme class injection (ag-theme-quartz, etc.)
 * - Density attribute for CSS variable switching
 * - License guard via setup.ts side-effect import
 * - onGridReady event forwarding
 */
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
// Codex 019dde93 iter-48 — pure helper for entity-row drawer-open
// guard (action columns, group/footer rows, interactive DOM
// targets). Tested independently in
// internal/__tests__/drawer-target.test.ts.
import { isDrawerOpenSafeTarget } from './internal/drawer-target';
// Codex 019e2de6 (PR-0.5f) — aggregate-explainability tooltips. Pure
// `tooltipValueGetter` helpers for aggregated group / grand-total /
// auto-group cells. Tested in
// __tests__/aggregate-cell-tooltip.test.ts.
import { getAggregateCellTooltip, getGroupCellTooltip } from './aggregate-cell-tooltip';

/**
 * Codex 019dde93 iter-48 — handler composition utility.
 *
 * GridShell forwards consumer-supplied event handlers from
 * `gridOptions` AND adds its own DS handlers (drawer-open, grid
 * ready, etc.). With a single ag-grid prop slot per event, a naive
 * `{...gridOptions}` spread WITHOUT explicit handlers below would
 * let the consumer's handler clobber the DS one (no drawer-open).
 * With explicit handlers AFTER the spread, the consumer's handler
 * is dropped (the explicit assignment wins).
 *
 * `composeHandlers` runs consumer first, then DS unless the
 * consumer signaled an opt-out via `event.event?.defaultPrevented`.
 * Local to GridShell on purpose — generalizing across DS handler
 * boundaries would expand iter-48's scope per Codex review.
 */
// AG Grid v34 event types (`GridReadyEvent`, `PaginationChangedEvent`,
// `FilterChangedEvent`, etc.) don't all expose an `event` DOM-event
// field; only mouse/touch interaction events do. Constraining `E` to
// `{ event?: ... }` rejected the typed AG Grid events at the call
// sites, so the generic stays open (`object`) and the
// `defaultPrevented` lookup walks through `unknown` at runtime —
// behaviour unchanged for events that DO carry `event.event`, no-op
// for events that don't.
function composeHandlers<E extends object>(
  consumer: ((event: E) => void) | undefined,
  ds: (event: E) => void,
): (event: E) => void {
  return (event: E) => {
    if (typeof consumer === 'function') {
      consumer(event);
    }
    const domEvent = (event as { event?: { defaultPrevented?: boolean } | null }).event;
    if (domEvent?.defaultPrevented) return;
    ds(event);
  };
}
import {
  resolveAccessState,
  accessStyles,
  type AccessControlledProps,
} from '../../internal/access-controller';
import { AgGridReact } from 'ag-grid-react';
import type {
  ColDef,
  FilterChangedEvent,
  GridApi,
  GridOptions,
  GridReadyEvent,
  ExcelStyle,
  SideBarDef,
} from 'ag-grid-community';

// Side-effect: ensures modules are registered
import './setup';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------
 */

export type GridTheme = 'quartz' | 'balham' | 'alpine' | 'material';
export type GridDensity = 'comfortable' | 'compact';

export interface GridShellApi<RowData = unknown> {
  getGridApi: () => GridApi<RowData> | null;
}

/** Props for the GridShell component. */
export interface GridShellProps<RowData = unknown> extends AccessControlledProps {
  /** AG Grid column definitions */
  columnDefs: ColDef<RowData>[];
  /** Default column definition applied to all columns */
  defaultColDef?: ColDef<RowData>;
  /** AG Grid options (passed through to AgGridReact) */
  gridOptions?: GridOptions<RowData>;
  /** Row data for client-side mode (undefined for server-side) */
  rowData?: RowData[];
  /** Row model type */
  rowModelType?: 'clientSide' | 'serverSide' | 'infinite';
  /** AG Grid sidebar definition */
  sideBar?: SideBarDef | string | string[] | boolean;
  /** AG Grid locale text overrides */
  localeText?: Record<string, string>;
  /** Excel export styles */
  excelStyles?: ExcelStyle[];
  /** Loading overlay template */
  overlayLoadingTemplate?: string;
  /** No-rows overlay template */
  overlayNoRowsTemplate?: string;
  /** Row height (overrides density default) */
  rowHeight?: number;
  /** Row selection config */
  rowSelection?: GridOptions<RowData>['rowSelection'];
  /** Theme name */
  theme?: GridTheme;
  /** Density setting */
  density?: GridDensity;
  /** Animate rows */
  animateRows?: boolean;
  /** Grid ready callback */
  onGridReady?: (event: GridReadyEvent<RowData>) => void;
  /** Row double-click callback */
  onRowDoubleClick?: (row: RowData) => void;
  /** Pagination changed callback (for useAgGridTablePagination) */
  onPaginationChanged?: (event: { api: GridApi<RowData> }) => void;
  /** Container height */
  height?: number | string;
  /** Container className */
  className?: string;
  /** Unique key for grid remounting */
  gridKey?: string;
  /** Enable AG Grid integrated charts (requires IntegratedChartsModule) */
  enableCharts?: boolean;
  /** AG Charts theme overrides for integrated charts */
  chartThemeOverrides?: Record<string, unknown>;
  /** Callback fired when any filter (column or advanced) changes */
  onFilterChanged?: (event: FilterChangedEvent<RowData>) => void;
  /** Children rendered below the grid (e.g., pagination) */
  children?: React.ReactNode;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DENSITY_ROW_HEIGHT: Record<GridDensity, number> = {
  comfortable: 48,
  compact: 36,
};

const DEFAULT_COL_DEF: ColDef = {
  sortable: true,
  filter: 'agMultiColumnFilter',
  floatingFilter: true,
  resizable: true,
  enableRowGroup: true,
  enablePivot: true,
  enableValue: true,
  minWidth: 120,
  flex: 1,
  menuTabs: ['generalMenuTab', 'filterMenuTab', 'columnsMenuTab'],
  // Codex 019e2de6 (PR-0.5f) — aggregate-explainability tooltip.
  // `getAggregateCellTooltip` returns a string ONLY for aggregated
  // value cells inside group rows / the grand-total pinned-bottom
  // row, and `undefined` for leaf cells (AG Grid then shows no
  // tooltip). Native `tooltipValueGetter` — no custom tooltip
  // component; see `enableBrowserTooltips={false}` below.
  tooltipValueGetter: getAggregateCellTooltip,
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function GridShellInner<RowData = unknown>(
  props: GridShellProps<RowData>,
  ref: React.Ref<GridShellApi<RowData>>,
): React.ReactElement {
  const {
    columnDefs,
    defaultColDef,
    gridOptions,
    rowData,
    rowModelType = 'clientSide',
    sideBar,
    localeText,
    excelStyles,
    overlayLoadingTemplate,
    overlayNoRowsTemplate,
    rowHeight,
    rowSelection,
    theme = 'quartz',
    density = 'comfortable',
    animateRows = true,
    onGridReady,
    onRowDoubleClick,
    onPaginationChanged,
    height = 600,
    enableCharts = false,
    chartThemeOverrides,
    onFilterChanged,
    className,
    gridKey,
    children,
    access,
    accessReason,
  } = props;

  const accessState = resolveAccessState(access);
  if (accessState.isHidden) return null as unknown as React.ReactElement;

  const gridApiRef = useRef<GridApi<RowData> | null>(null);

  useImperativeHandle(ref, () => ({
    getGridApi: () => gridApiRef.current,
  }));

  const resolvedRowHeight = rowHeight ?? DENSITY_ROW_HEIGHT[density];
  const themeClassName = `ag-theme-${theme}`;

  const mergedDefaultColDef = useMemo(
    () => ({ ...DEFAULT_COL_DEF, ...defaultColDef }),
    [defaultColDef],
  );

  const handleGridReady = useCallback(
    (event: GridReadyEvent<RowData>) => {
      gridApiRef.current = event.api;
      onGridReady?.(event);
    },
    [onGridReady],
  );

  // Codex 019dde93 iter-48 — drawer-open dedupe.
  // ag-grid normally fires BOTH `rowDoubleClicked` AND
  // `cellDoubleClicked` for the same physical double-click. If we
  // route both into `onRowDoubleClick(event.data)` directly, the
  // consumer drawer opens twice (double fetch, double analytics,
  // race conditions). The shared `lastEntityClickRef` swallows the
  // second hit within a 300ms window keyed by the rendered DOM
  // target so semantically distinct dblclicks (different rows) are
  // never deduped, but the row+cell pair from the same gesture is.
  const lastEntityClickRef = useRef<{ key: unknown; ts: number } | null>(null);
  const fireOpenEntity = useCallback(
    (data: RowData | undefined, key: unknown) => {
      if (!data || !onRowDoubleClick) return;
      const now = Date.now();
      const last = lastEntityClickRef.current;
      if (last && last.key === key && now - last.ts < 300) return;
      lastEntityClickRef.current = { key, ts: now };
      onRowDoubleClick(data);
    },
    [onRowDoubleClick],
  );

  const handleRowDoubleClicked = useCallback(
    (event: { data: RowData | undefined; node?: { id?: string } | null }) => {
      // Row event always opens the drawer (the row is the entity).
      // Use node id as dedupe key when available; fall back to data
      // ref. Action-column click on the row event is essentially
      // never a problem because the canonical row event surfaces
      // even for action cells, but we still rely on the cell
      // handler to skip those via `isDrawerOpenSafeTarget`.
      const key = event.node?.id ?? event.data;
      fireOpenEntity(event.data, key);
    },
    [fireOpenEntity],
  );

  const handleCellDoubleClicked = useCallback(
    (event: import('ag-grid-community').CellDoubleClickedEvent<RowData>) => {
      if (!isDrawerOpenSafeTarget(event)) return;
      const key = event.node?.id ?? event.data;
      fireOpenEntity(event.data, key);
    },
    [fireOpenEntity],
  );

  const handlePaginationChanged = useCallback(() => {
    if (onPaginationChanged && gridApiRef.current) {
      onPaginationChanged({ api: gridApiRef.current });
    }
  }, [onPaginationChanged]);

  const handleFilterChanged = useCallback(
    (event: FilterChangedEvent<RowData>) => {
      onFilterChanged?.(event);
      // For SSRM, trigger server refresh so the datasource re-fetches with updated filterModel
      if (rowModelType === 'serverSide' && gridApiRef.current) {
        gridApiRef.current.refreshServerSide?.({ purge: true });
      }
    },
    [onFilterChanged, rowModelType],
  );

  /* ------------------------------------------------------------------ */
  /*  Codex 019dde93 iter-48c — DS native `dblclick` fallback           */
  /*                                                                     */
  /*  iter-48 + iter-48b proved at runtime that ag-grid v34 does NOT    */
  /*  fire `onRowDoubleClicked` / `onCellDoubleClicked` for genuine     */
  /*  user double-clicks even with `cellSelection` removed (root cause */
  /*  unknown — possibly AgGridReact event-binding regression on this  */
  /*  version, or a third-party overlay capturing dblclick before ag-  */
  /*  grid's eventService sees it). Live verify on testai.acik.com:    */
  /*    - DOM `dblclick` reaches `.ag-cell` (capture phase observed)   */
  /*    - DS handlers (composeHandlers + fireOpenEntity) never invoked */
  /*                                                                     */
  /*  This DS fallback bypasses ag-grid's event translation entirely:  */
  /*    1. Capture native `dblclick` on the grid root                  */
  /*    2. Walk up to `.ag-row` / `.ag-cell` to identify the entity    */
  /*    3. Apply the same `isDrawerOpenSafeTarget` guard               */
  /*    4. Resolve row data via `gridApi.getDisplayedRowAtIndex()`     */
  /*    5. Funnel through the same `fireOpenEntity` dedupe path        */
  /*                                                                     */
  /*  Sits ALONGSIDE the iter-48 ag-grid handler bindings — if those   */
  /*  ever start firing again (ag-grid bug fix upstream), the dedupe   */
  /*  swallows the redundant call.                                     */
  /* ------------------------------------------------------------------ */
  const rootContainerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const container = rootContainerRef.current;
    if (!container || !onRowDoubleClick) return;

    const handler = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const rowEl = target.closest('.ag-row') as HTMLElement | null;
      if (!rowEl) return;
      if (rowEl.classList.contains('ag-header-row')) return;
      if (rowEl.classList.contains('ag-row-group')) return;
      if (rowEl.classList.contains('ag-row-pinned')) return;

      const cellEl = target.closest('.ag-cell') as HTMLElement | null;
      const colId = cellEl?.getAttribute('col-id') ?? null;

      // Reuse the iter-48 guard at DOM level — same allow-list of
      // canonical action colIds, plus the interactive-target closest
      // walk via the helper's DOM target check. We coerce a minimal
      // event shape that satisfies `isDrawerOpenSafeTarget`.
      const guardEvent = {
        event: { target },
        column: colId ? { getColId: () => colId } : null,
        // `colDef` not available at DOM level; the helper falls back
        // to colId set + interactive-target walk, which covers the
        // common cases (action columns + interactive elements).
        colDef: null,
        node: null,
      };
      if (!isDrawerOpenSafeTarget(guardEvent)) return;

      const rowIndex = Number(rowEl.getAttribute('row-index'));
      const api = gridApiRef.current;
      if (!api || Number.isNaN(rowIndex)) return;

      const rowNode = api.getDisplayedRowAtIndex(rowIndex);
      const data = rowNode?.data;
      const key = rowNode?.id ?? data;
      fireOpenEntity(data as RowData | undefined, key);
    };

    container.addEventListener('dblclick', handler, true);
    return () => container.removeEventListener('dblclick', handler, true);
  }, [onRowDoubleClick, fireOpenEntity]);

  return (
    <div
      ref={rootContainerRef}
      data-access-state={accessState.state}
      className={[className ?? '', accessStyles(accessState.state)].join(' ').trim() || undefined}
      data-component="grid-shell"
      data-density={density}
      title={accessReason}
    >
      <div
        className={themeClassName}
        style={{ width: '100%', height: typeof height === 'number' ? `${height}px` : height }}
      >
        <AgGridReact<RowData>
          key={gridKey}
          rowData={rowModelType === 'clientSide' ? rowData : undefined}
          columnDefs={columnDefs}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AG Grid ColDef typing gap
          defaultColDef={mergedDefaultColDef as any}
          rowModelType={rowModelType}
          sideBar={sideBar}
          localeText={localeText}
          excelStyles={excelStyles}
          overlayLoadingTemplate={overlayLoadingTemplate}
          overlayNoRowsTemplate={overlayNoRowsTemplate}
          rowHeight={resolvedRowHeight}
          headerHeight={density === 'compact' ? 40 : 48}
          rowSelection={
            rowSelection ?? { mode: 'multiRow' as const, checkboxes: true, headerCheckbox: true }
          }
          animateRows={animateRows}
          rowGroupPanelShow="always"
          enableRangeSelection
          groupDefaultExpanded={0}
          autoGroupColumnDef={{
            floatingFilter: true,
            filter: 'agTextColumnFilter',
            minWidth: 200,
            // Codex 019e2de6 (PR-0.5f) — auto-group cell tooltip:
            // group context only (`Grup: <label> · <count> satır`).
            // Returns `undefined` for non-group cells.
            tooltipValueGetter: getGroupCellTooltip,
          }}
          // groupTotalRow="bottom" — disabled: duplicates group header values
          pagination
          paginationPageSize={50}
          paginationPageSizeSelector={false}
          suppressPaginationPanel
          // enableAdvancedFilter — AG Grid limitation: disables floating filters + context menu
          // Custom filter builder will be implemented in design-system instead
          enableCharts={enableCharts}
          chartThemeOverrides={chartThemeOverrides}
          statusBar={{
            statusPanels: [
              { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
              { statusPanel: 'agSelectedRowCountComponent', align: 'left' },
              { statusPanel: 'agAggregationComponent', align: 'right' },
            ],
          }}
          getContextMenuItems={(params) => {
            const setAggFunc = (p: typeof params, fn: string | null) => {
              if (p.column && p.api) {
                const colId = p.column.getColId();
                p.api.applyColumnState({
                  state: [{ colId, aggFunc: fn }],
                });
              }
            };
            /*
             * PR #272c (reporting hardening, 2026-05): respect the
             * column-level enableValue capability gate. AG Grid's
             * `enableValue: false` blocks drag/menu/QuickGroupMenu
             * paths, but the custom "Sütun Hesaplama" submenu used to
             * call applyColumnState directly — bypassing the guard and
             * letting the user pick an aggregation that the backend
             * would then reject with 400 INVALID_AGGREGATION_REQUEST.
             *
             * Reading the colDef and disabling the entire submenu when
             * the column declares enableValue=false keeps the UI
             * honest: only columns the registry marked aggregatable=true
             * (PR-0.2 backend opt-in) expose the submenu.
             *
             * The first/last entries are also dropped because the
             * backend's ALLOWED_AGG_FUNCS allowlist (sum/avg/min/max/
             * count) doesn't include them — exposing them would
             * produce another reliable 400 path.
             */
            const colDef = params.column?.getColDef?.();
            const aggregationDisabled = !params.column || colDef?.enableValue === false;
            const defaults = params.defaultItems ?? [];
            return [
              ...defaults,
              'separator',
              {
                name: 'Bu değere göre filtrele',
                icon: '<span style="font-size:12px">🔍</span>',
                disabled: !params.value,
                action: () => {
                  if (params.column && params.api) {
                    const colId = params.column.getColId();
                    params.api
                      .setColumnFilterModel(colId, {
                        filterType: 'text',
                        type: 'equals',
                        filter: String(params.value),
                      })
                      .then(() => params.api.onFilterChanged());
                  }
                },
              },
              {
                name: 'Satırı üste sabitle',
                icon: '<span style="font-size:12px">📌</span>',
                disabled: !params.node?.data,
                action: () => {
                  if (params.api && params.node?.data) {
                    const existing = params.api.getGridOption('pinnedTopRowData') ?? [];
                    params.api.setGridOption('pinnedTopRowData', [...existing, params.node.data]);
                  }
                },
              },
              {
                name: 'Sabitlemeleri kaldır',
                icon: '<span style="font-size:12px">📌</span>',
                action: () => {
                  params.api?.setGridOption('pinnedTopRowData', []);
                  params.api?.setGridOption('pinnedBottomRowData', []);
                },
              },
              'separator',
              {
                name: 'Sütun Hesaplama',
                icon: '<span style="font-size:12px">∑</span>',
                disabled: aggregationDisabled,
                subMenu: [
                  { name: 'Toplam (Sum)', action: () => setAggFunc(params, 'sum') },
                  { name: 'Ortalama (Avg)', action: () => setAggFunc(params, 'avg') },
                  { name: 'Sayı (Count)', action: () => setAggFunc(params, 'count') },
                  { name: 'Min', action: () => setAggFunc(params, 'min') },
                  { name: 'Max', action: () => setAggFunc(params, 'max') },
                  // PR #272c absorb: first/last omitted — backend
                  // ALLOWED_AGG_FUNCS doesn't include them and a user
                  // pick would always 400 INVALID_AGGREGATION_REQUEST.
                  'separator',
                  { name: 'Hesaplamayı kaldır', action: () => setAggFunc(params, null) },
                ],
              },
            ];
          }}
          popupParent={typeof document !== 'undefined' ? document.body : undefined}
          // Codex 019e2de6 (PR-0.5f) — keep AG Grid's own (custom)
          // tooltip renderer for the aggregate-explainability
          // `tooltipValueGetter` strings. Browser-native tooltips are
          // explicitly disabled so the native AG Grid tooltip
          // lifecycle owns rendering (no portal / focus debt).
          enableBrowserTooltips={false}
          {...gridOptions}
          /* Codex 019dde93 iter-48 — handler composition.
             gridOptions spread comes BEFORE the explicit handlers so
             our DS handlers always win the prop assignment, while a
             consumer can still extend behavior via composeHandlers
             through gridOptions. The composition runs the consumer
             callback first; if it sets `event.event.defaultPrevented`,
             the DS drawer-open path is skipped. */
          onGridReady={composeHandlers(gridOptions?.onGridReady, handleGridReady)}
          onRowDoubleClicked={composeHandlers(
            gridOptions?.onRowDoubleClicked,
            handleRowDoubleClicked,
          )}
          onCellDoubleClicked={composeHandlers(
            gridOptions?.onCellDoubleClicked,
            handleCellDoubleClicked,
          )}
          onPaginationChanged={composeHandlers(
            gridOptions?.onPaginationChanged,
            handlePaginationChanged,
          )}
          onFilterChanged={composeHandlers(gridOptions?.onFilterChanged, handleFilterChanged)}
        />
      </div>
      {children}
    </div>
  );
}

/** Core AG Grid shell with theme, density, selection, empty state, and imperative API access.
 * @example
 * ```tsx
 * <GridShell />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/grid-shell)
 */
export const GridShell = forwardRef(GridShellInner) as <RowData = unknown>(
  props: GridShellProps<RowData> & { ref?: React.Ref<GridShellApi<RowData>> },
) => React.ReactElement;

// @ts-expect-error -- generic forwardRef cast loses static properties
GridShell.displayName = 'GridShell';

export default GridShell;
