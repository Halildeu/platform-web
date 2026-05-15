/**
 * PR-0.5b (Codex thread 019e2cd7): capture the AG Grid SSRM row
 * group / value / pivot / filter / sort state from a live
 * {@link GridApi} so the export endpoint can match what the user
 * sees on screen. The captured snapshot mirrors the shape AG Grid's
 * {@code IServerSideGetRowsRequest} carries on a normal `getRows`
 * call; we feed it through {@link normalizeServerSideRequest} on the
 * way out so any partial / contradictory snapshot (pivot toggle
 * without a value col, stale groupKeys, etc.) degrades the same way
 * the live query path degrades.
 */
import type { ColumnVO, GridApi, IServerSideGetRowsRequest } from 'ag-grid-community';
import type { ExportGridState, FilterModel, SortModelItem } from '../../grid';

/**
 * Read row group / value / pivot / filter / sort state from a live
 * grid api. Returns {@code undefined} when the api is missing
 * (component unmount race, route change) so the caller falls back
 * to the legacy flat-export path.
 */
export const captureExportGridState = (api: GridApi | null): ExportGridState | undefined => {
  if (!api) return undefined;
  try {
    const rowGroupCols = api.getRowGroupColumns().map((col) => columnToVO(col));
    const valueCols = api.getValueColumns().map((col) => columnToVO(col));
    const pivotCols = api.getPivotColumns().map((col) => columnToVO(col));
    const pivotMode = api.isPivotMode();
    const filterModel = (api.getFilterModel() as FilterModel | null) ?? undefined;
    const sortModel = extractSortModel(api);

    return {
      rowGroupCols,
      valueCols,
      pivotCols,
      pivotMode,
      filterModel,
      sortModel,
    };
  } catch {
    return undefined;
  }
};

/**
 * Minimal AG Grid Column → ColumnVO projection. AG Grid's runtime
 * Column shape carries more than we need; we project only the
 * fields the backend export contract uses so the wire payload stays
 * tight and predictable.
 */
const columnToVO = (col: ReturnType<GridApi['getRowGroupColumns']>[number]): ColumnVO => {
  const colDef = col.getColDef();
  // ColumnVO declares aggFunc as `string | undefined`; AG Grid's
  // `col.getAggFunc()` returns `string | IAggFunc | null`. Coerce
  // function-shaped aggregators to undefined (custom client-side
  // aggregators don't have a server-side mapping) and drop nulls.
  let aggFunc: string | undefined;
  if (typeof col.getAggFunc === 'function') {
    const raw = col.getAggFunc();
    if (typeof raw === 'string' && raw.length > 0) {
      aggFunc = raw;
    }
  }
  return {
    id: col.getColId(),
    displayName: (colDef.headerName ?? col.getColId()) as string,
    field: (colDef.field as string) ?? col.getColId(),
    aggFunc,
  };
};

/**
 * Pull the active sortModel out of AG Grid's column state. SSRM
 * keeps the sort on the column model itself (not on a separate
 * sortModel option), so reading `getColumnState()` and filtering
 * to entries with a non-null `sort` is the canonical extraction.
 */
const extractSortModel = (api: GridApi): SortModelItem[] => {
  const state = api.getColumnState();
  if (!Array.isArray(state)) return [];
  const sorted = state
    .filter((entry) => entry && typeof entry.sort === 'string' && entry.sort.length > 0)
    .map((entry) => ({
      colId: entry.colId,
      sort: entry.sort as 'asc' | 'desc',
      sortIndex: typeof entry.sortIndex === 'number' ? entry.sortIndex : 0,
    }));
  sorted.sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
  return sorted.map((entry) => ({ colId: entry.colId, sort: entry.sort }));
};

/**
 * Forward-compatible alias of AG Grid's request shape so the helper
 * surface stays decoupled from the SSRM internals — if AG Grid
 * renames `IServerSideGetRowsRequest`, only this alias updates.
 */
export type SsrmRequestSnapshot = IServerSideGetRowsRequest;
