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

/**
 * PR-0.5b (Codex thread 019e2cd7): AG Grid state snapshot that gets
 * forwarded to {@code POST /api/v1/reports/{key}/export} so the
 * exported file matches the user's on-screen view (row grouping,
 * value aggregations, pivot toggle, filter, sort).
 *
 * <p>{@code startRow}/{@code endRow}/{@code groupKeys} are
 * intentionally absent — export ships every leaf bucket / pivot
 * column combination, not the user's current SSRM expansion
 * frontier or cache window.
 */
export type ExportGridState = {
  rowGroupCols?: ColumnVO[];
  valueCols?: ColumnVO[];
  pivotCols?: ColumnVO[];
  pivotMode?: boolean;
  filterModel?: FilterModel;
  sortModel?: SortModelItem[];
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
  /**
   * PR-0.5a (2026-05-15, Codex thread 019e2c61): grand total row over
   * the RLS+filter-narrowed source set. The backend emits this only on
   * root SSRM store requests for non-pivot grouped queries with
   * non-empty aggregations. Map keys match the aggregation alias
   * (= column field), values mirror the bucket aggregate (sum / avg /
   * weightedavg / percentile etc.). The frontend binds this Map to AG
   * Grid's {@code pinnedBottomRowData}; child-store / flat / pivot
   * responses omit the field entirely so the dominant flow keeps its
   * byte-for-byte response shape.
   *
   * <p>Values may legitimately be {@code null} — an empty filter set
   * yields null SUM/AVG/STDEV, weightedavg with zero denominator
   * yields null, and PERCENTILE_CONT over an empty rowset yields
   * null. Consumers must tolerate null values.
   */
  grandTotalRow?: Record<string, unknown> | null;
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
 * <p>PR-0.4g2 (2026-05-15) extends the normaliser to the pivot-mode
 * surface. PR-0.4d-fe2 lit up the AG Grid pivot UI; chip removals
 * during normal user interactions can leave pivotMode=true with an
 * incomplete config (missing rowGroup, pivot column, or value
 * column), which the backend single-level pivot dispatcher cannot
 * honour. The normaliser now degrades incomplete pivot snapshots to
 * the closest backend-supported shape so the grid keeps rendering
 * data while the user iterates:
 *   - pivotMode + no rowGroup → flat (drop everything)
 *   - pivotMode + rowGroup + no pivotCols → grouped (drop pivotMode)
 *   - pivotMode + rowGroup + pivotCols + no valueCols → grouped (drop pivotMode)
 *   - pivotMode + complete state + non-empty groupKeys → strip
 *     groupKeys (PR-0.4b single-level pivot only; multi-level
 *     expansion is PR-0.4e roadmap)
 *   - complete pivot state → referential pass-through
 */
export const normalizeServerSideRequest = (request: GridRequest): GridRequest => {
  const hasRowGroup = (request.rowGroupCols?.length ?? 0) > 0;
  const hasPivotCols = (request.pivotCols?.length ?? 0) > 0;
  const pivotMode = request.pivotMode === true;
  const hasValueCols = (request.valueCols?.length ?? 0) > 0;
  const hasGroupKeys = (request.groupKeys?.length ?? 0) > 0;

  // PR-0.4g2 (2026-05-15): incomplete pivot state degradation. The
  // backend single-level pivot dispatcher requires pivotMode=true
  // AND rowGroupCols.size==1 AND pivotCols.size==1 AND
  // groupKeys.isEmpty(). AG Grid emits partial state during normal
  // user interactions:
  //   - user removes the row-group chip while keeping pivotMode on
  //   - user removes the pivot column chip while keeping pivotMode on
  //   - user removes the value column chip
  //   - user drills into a pivot bucket (groupKeys populated)
  // Each leaves a snapshot the backend cannot honour, surfacing as
  // GROUPING_NOT_SUPPORTED 400 + the "Bu kolonla gruplama
  // desteklenmiyor" toast. The normaliser degrades these snapshots
  // gracefully so the grid renders data the user can iterate on:
  //   - pivotMode + no rowGroup AND no pivotCols → flat (drop all)
  //   - pivotMode + no rowGroup BUT has pivotCols → flat (drop all)
  //   - pivotMode + rowGroup BUT no pivotCols → grouped (drop pivotMode)
  //   - pivotMode + rowGroup + pivotCols + groupKeys → strip groupKeys
  //     (multi-level pivot expansion is PR-0.4e roadmap)
  if (pivotMode) {
    if (!hasRowGroup) {
      // Without a row-group the pivot SQL cannot bucket rows. Drop
      // every grouping field so the request degrades to a flat query.
      return {
        ...request,
        pivotMode: false,
        pivotCols: [],
        valueCols: [],
        groupKeys: [],
      };
    }
    if (!hasPivotCols) {
      // Has rowGroup but no pivot column → degrade to a plain grouped
      // query. Keep rowGroupCols + valueCols + groupKeys so the
      // grouped path renders the aggregations the user already chose.
      return {
        ...request,
        pivotMode: false,
        pivotCols: [],
      };
    }
    if (!hasValueCols) {
      // PR-0.4g2 iter-2 (Codex 019e2a7f absorb): pivotMode + rowGroup
      // + pivotCols but no value column. Backend single-level pivot
      // builds aliases as `pvt__<pivot>__<value>__<aggFunc>__<valueField>`
      // — without aggregations there's nothing to materialise per
      // bucket. Degrade to a plain grouped request (drop pivotMode,
      // pivotCols, groupKeys) so the grid renders the bare row-group
      // buckets while the user is still picking a value column.
      return {
        ...request,
        pivotMode: false,
        pivotCols: [],
        groupKeys: [],
      };
    }
    if (hasGroupKeys) {
      // PR-0.4b single-level pivot rejects expanded pivot buckets
      // (multi-level pivot expansion is PR-0.4e). Strip groupKeys
      // so the dispatcher routes to the single-level pivot path
      // instead of tripping GROUPING_NOT_SUPPORTED.
      return {
        ...request,
        groupKeys: [],
      };
    }
    // Pivot state complete — backend single-level pivot will succeed.
    return request;
  }

  // PR-0.4g iter-2 (Codex 019e2a7f absorb): an active row-group /
  // pivot-cols signal short-circuits to referential pass-through —
  // drill-down / pivot / grouped paths are all backend-supported.
  if (hasRowGroup || hasPivotCols) {
    return request;
  }

  // PR-0.4g iter-2: stale `groupKeys` without a matching
  // `rowGroupCols` is the same shape of broken-route snapshot as
  // stale `valueCols`. AG Grid SSRM can briefly emit
  // {rowGroupCols=[], groupKeys=['…']} when a user removes the last
  // row-group while an expanded bucket is mounted; the backend
  // dispatcher would still see grouping intent and 400. Normalising
  // both fields together keeps the outbound payload internally
  // consistent regardless of which child-store request raced the
  // column-state mutation.
  if (!hasValueCols && !hasGroupKeys) {
    return request;
  }

  return {
    ...request,
    valueCols: [],
    groupKeys: [],
  };
};
