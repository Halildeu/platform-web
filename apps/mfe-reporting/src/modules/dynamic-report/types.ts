export type DynamicReportFilters = {
  search: string;
};

export type DynamicReportRow = Record<string, unknown>;

export type ReportColumnMeta = {
  field: string;
  headerName: string;
  type:
    | 'text'
    | 'number'
    | 'date'
    | 'badge'
    | 'status'
    | 'currency'
    | 'boolean'
    | 'percent'
    | 'enum';
  width: number;
  sensitive: boolean;
  /** Badge/enum: raw value → variant color map (e.g., { ADMIN: 'danger', USER: 'info' }) */
  variantMap?: Record<string, string>;
  /** Badge/enum: raw value → i18n label key map */
  labelMap?: Record<string, string>;
  /** Status: raw value → { variant, labelKey } map */
  statusMap?: Record<string, { variant: string; labelKey: string }>;
  /** Currency: ISO 4217 code (default: 'TRY') */
  currencyCode?: string;
  /** Number/currency/percent: decimal places */
  decimals?: number;
  /** Number: suffix (e.g., 'dk', 'gün') */
  suffix?: string;
  /** Number: prefix (e.g., '₺') */
  prefix?: string;
  /**
   * PR-0.2 (reporting hardening, 2026-05) — per-column grouping
   * opt-ins. Optional + default false so absence keeps the
   * stop-gap UX shipped in platform-web #271 working as-is.
   */
  groupable?: boolean;
  aggregatable?: boolean;
  defaultAggFunc?: 'sum' | 'avg' | 'min' | 'max' | 'count';
};

/**
 * PR-0.1+ capabilities envelope returned alongside metadata. Frontend
 * uses {@code serverSideGrouping} to decide whether to expose the
 * row-group panel + drag-to-group + value-aggregation pickers.
 *
 * <p>Older backends that don't return the field are treated as
 * all-false so a rolling deploy where the gateway points to a stale
 * report-service can't accidentally light up grouping UX.
 */
export type ReportCapabilities = {
  serverSideGrouping: boolean;
  groupableFields?: string[];
  aggregatableFields?: string[];
  /**
   * PR-0.4a (Codex 019e2695 hybrid pivot): backend pivot SQL flag.
   * When true, the frontend may send {@code pivotMode=true} +
   * {@code pivotCols[]} on {@code POST /query} and expect a
   * pivot-applied response. Stays false until PR-0.4b wires the
   * backend SQL path; older backends that predate the field deserialize
   * to {@code undefined}, treated as false.
   */
  serverSidePivoting?: boolean;
  /**
   * PR-0.4a (Codex 019e2695 hybrid pivot): AG Grid native client pivot
   * flag. When true AND {@code dataSourceMode === 'client'}, the
   * frontend enables AG Grid's client-side pivot engine. Only sane on
   * reports with a hard ≤ 10K row client-mode cap.
   */
  clientPivotAllowed?: boolean;
  /**
   * PR-0.4a: column field names that may be dragged into AG Grid's
   * pivot column drop zone (matches AG Grid's {@code enablePivot}
   * surface). Authoritative on both server-mode and client-mode —
   * client-side pivot must respect the same backend allowlist so UX
   * stays consistent across modes.
   */
  pivotableFields?: string[];
};

export type ReportListItem = {
  key: string;
  title: string;
  description: string;
  category: string;
  /** CNS-006 R18: reportGroup from access_config for deny-default filtering */
  reportGroup?: string;
};

export type ReportMetadata = {
  key: string;
  title: string;
  description: string;
  category: string;
  columns: ReportColumnMeta[];
  defaultSort: string;
  defaultSortDirection: string;
  /**
   * PR-0.1+ capabilities envelope. Optional so older backends that
   * predate the field still parse cleanly; ReportPage treats absence
   * as all-false.
   */
  capabilities?: ReportCapabilities;
};

export type ReportCategory = {
  name: string;
  count: number;
};
