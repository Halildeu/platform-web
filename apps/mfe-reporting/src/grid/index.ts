import type React from 'react';
import type { ColumnVO } from 'ag-grid-community';
// Reporting MFE altından grid altyapısını dışa aktarır.
// Uygulamalar grid'i 'mfe_reporting/grid' üzerinden tüketsin.
export { EntityGridTemplate } from '../components/entity-grid';
export type {
  EntityGridTemplateProps,
  GridExportConfig,
  EntityGridQueryParams,
  MapAdvancedFilter,
} from '../components/entity-grid';
export { buildEntityGridQueryParams } from '../components/entity-grid';

// Legacy hafif-grid tipleri için minimal tanımlar (rapor modüllerinde kullanılıyor)
export type SortDirection = 'asc' | 'desc';
export type SortModelItem = { colId: string; sort: SortDirection };
export type FilterModel = Record<string, unknown>;

/**
 * Grid request shape carried between {@code ReportPage} and a module's
 * {@code fetchRows} implementation. PR-0.2 (reporting hardening, 2026-05)
 * extends this with the AG Grid SSRM grouping fields so the module can
 * forward a structured payload to the backend's
 * {@code POST /api/v1/reports/{key}/query} endpoint instead of dropping
 * grouping intent on the floor.
 *
 * <p>The legacy {@code page} / {@code pageSize} fields stay so the
 * client-mode datasource and dashboard drill-through paths keep working
 * unchanged. The new SSRM fields ({@code startRow / endRow /
 * rowGroupCols / valueCols / pivotCols / pivotMode / groupKeys}) are
 * optional — older modules that ignore them keep working too.
 */
export type GridRequest = {
  page: number;
  pageSize: number;
  sortModel?: SortModelItem[];
  filterModel?: FilterModel;
  quickFilter?: string;
  advancedFilter?: string;

  /**
   * AG Grid SSRM cache window. {@code startRow} is inclusive,
   * {@code endRow} exclusive. The backend translates these into
   * {@code (page - 1) * pageSize} so the alignment guard can detect
   * misaligned windows and fail closed.
   */
  startRow?: number;
  endRow?: number;
  /**
   * Columns the user dragged into the row-group panel. Empty / absent
   * for flat queries; non-empty for grouping. The module routes a
   * non-empty payload through {@code POST /query}.
   */
  rowGroupCols?: ColumnVO[];
  /** Aggregation columns (only meaningful with non-empty {@link rowGroupCols}). */
  valueCols?: ColumnVO[];
  /** Pivot columns (PR-0.4 territory; backend rejects until then). */
  pivotCols?: ColumnVO[];
  /** Pivot toggle (PR-0.4 territory). */
  pivotMode?: boolean;
  /**
   * Current expansion path; one entry per opened ancestor level. Empty
   * means the user is looking at the root buckets.
   */
  groupKeys?: string[];
};
/**
 * PR-0.4d-be backend response envelope record (Codex thread 019e2695).
 * Mirror of the backend {@code PivotResultColumnDto}; each entry pairs
 * an SQL alias with the semantic metadata frontend needs to render an
 * AG Grid SSRM secondary column header without re-fetching report
 * metadata or re-parsing the alias.
 */
export type PivotResultColumn = {
  field: string;
  pivotField: string;
  pivotValue: string;
  pivotLabel: string;
  aggFunc: string;
  valueField: string;
};

export type GridResponse<T = unknown> = {
  rows: T[];
  total: number;
  /**
   * PR-0.4d-be: SQL alias list emitted by the backend pivot path.
   * Optional so flat / grouped responses (the dominant case) stay
   * byte-for-byte identical.
   */
  pivotResultFields?: string[];
  /**
   * PR-0.4d-be: alias-aligned semantic metadata. The backend guarantees
   * the ordering {@code pivotResultColumns[i].field === pivotResultFields[i]};
   * PR-0.4d-fe additionally guards the invariant client-side.
   */
  pivotResultColumns?: PivotResultColumn[];
};
export type ColumnDef<TRow = unknown> = {
  field?: string;
  headerName?: string;
  width?: number;
  minWidth?: number;
  flex?: number | null;
  filterType?: 'text' | 'number' | 'date' | 'set';
  sortable?: boolean;
  filter?: boolean | string;
  floatingFilter?: boolean;
  pinned?: 'left' | 'right';
  wrapText?: boolean;
  autoHeight?: boolean;
  cellRenderer?: ((params: { value: unknown; data: TRow | undefined }) => React.ReactNode) | string;
  valueFormatter?: (params: { value: unknown; data: TRow | undefined }) => string;
  valueGetter?: (params: { data: TRow | undefined }) => unknown;
  filterParams?: Record<string, unknown>;
  cellClass?: string | string[];
};

/**
 * Helper used by both {@link ReportPage} and the modules to decide
 * whether a {@link GridRequest} expresses any grouping/pivot intent.
 * Mirrors the backend's {@code ReportQueryRequestDto.requestsGrouping()}
 * so client and server agree on the routing decision.
 */
export const requestsGrouping = (request: GridRequest): boolean =>
  (request.rowGroupCols?.length ?? 0) > 0 ||
  (request.valueCols?.length ?? 0) > 0 ||
  (request.pivotCols?.length ?? 0) > 0 ||
  request.pivotMode === true ||
  (request.groupKeys?.length ?? 0) > 0;

/**
 * PR-0.4g (2026-05-15) — variant-state sync fix. AG Grid SSRM keeps
 * {@link GridRequest#valueCols} populated even after the user drags the
 * last row-group chip off the panel (the request snapshot mirrors the
 * column model, which still carries the variant's aggregation
 * preferences). The backend's {@code ReportQueryRequestDto.requestsGrouping()}
 * treats a non-empty {@code valueCols} as grouping intent, so the
 * downstream dispatcher trips {@code GROUPING_NOT_SUPPORTED} the moment
 * row-group is cleared but the aggregations are not.
 *
 * <p>This normaliser runs before the request is handed to the SSRM
 * datasource so the backend payload stays internally consistent:
 * when there is no row-group, no pivot, and no ancestor expansion,
 * {@code valueCols} and {@code groupKeys} are also dropped. The
 * normalised request degrades to a flat query, which is what the user
 * sees on screen after removing the last row-group chip.
 *
 * <p>Pivot and ancestor-expansion paths are left untouched — the
 * normaliser is opt-in for the "no group / no pivot / no expansion"
 * combination only.
 */
export const normalizeServerSideRequest = (request: GridRequest): GridRequest => {
  const hasRowGroup = (request.rowGroupCols?.length ?? 0) > 0;
  const hasPivotCols = (request.pivotCols?.length ?? 0) > 0;
  const pivotMode = request.pivotMode === true;

  // PR-0.4g iter-2 (Codex 019e2a7f absorb): an active row-group /
  // pivot / pivotMode signal short-circuits to a referential
  // pass-through — drill-down / pivot / grouped paths are all
  // backend-supported and must not be touched.
  if (hasRowGroup || hasPivotCols || pivotMode) {
    return request;
  }

  // PR-0.4g iter-2 (Codex 019e2a7f absorb): stale `groupKeys` without
  // a matching `rowGroupCols` is the same shape of broken-route
  // snapshot as stale `valueCols`. AG Grid SSRM can briefly emit
  // {rowGroupCols=[], groupKeys=['…']} when a user removes the last
  // row-group while an expanded bucket is mounted; the backend
  // dispatcher would still see grouping intent and 400. Normalising
  // both fields together keeps the outbound payload internally
  // consistent regardless of which child-store request raced the
  // column-state mutation.
  const hasValueCols = (request.valueCols?.length ?? 0) > 0;
  const hasGroupKeys = (request.groupKeys?.length ?? 0) > 0;
  if (!hasValueCols && !hasGroupKeys) {
    return request;
  }

  return {
    ...request,
    valueCols: [],
    groupKeys: [],
  };
};
