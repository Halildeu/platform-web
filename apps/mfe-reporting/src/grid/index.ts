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
