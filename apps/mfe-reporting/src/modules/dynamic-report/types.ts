/**
 * PR-D1b (Codex thread 019e800b, 2026-05-31) — extends DynamicReportFilters
 * from a narrow `{ search: string }` shape to an intersection with
 * `Record<string, unknown>` so metadata-driven filter widgets can store
 * arbitrary kind-shaped values (text-search / enum-select / date-range /
 * etc.) alongside the legacy `search` slot. Backward compat: existing
 * `filters.search?.trim()` callers continue to type-check because the
 * `search` key keeps its narrow `string?` contract on the intersection.
 */
export type DynamicReportFilters = { search?: string } & Record<string, unknown>;

export type DynamicReportRow = Record<string, unknown>;

/**
 * PR-0.4d-be backend response envelope record (Codex thread 019e2695).
 * Each entry pairs an SQL alias with the semantic metadata frontend
 * needs to render an AG Grid SSRM secondary column header without
 * re-fetching report metadata or re-parsing the alias.
 *
 * Ordering invariant (backend-enforced): the i-th entry matches
 * pivotResultFields[i] one-for-one; the frontend can index either list
 * with the same row pointer. PR-0.4d-fe additionally guards the
 * invariant client-side (rollout drift defence).
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
 * PR-0.4d-be: paginated response shape returned from
 * {@code POST /api/v1/reports/{key}/query}. Pivot-only fields stay
 * optional so non-pivot responses continue to deserialise cleanly
 * (backend uses {@code @JsonInclude(NON_EMPTY)}).
 */
export type DynamicReportQueryResponse = {
  items: DynamicReportRow[];
  total: number;
  page: number;
  pageSize: number;
  pivotResultFields?: string[];
  pivotResultColumns?: PivotResultColumn[];
};

/**
 * PR-D1a (Codex thread 019e800b, 2026-05-31) — backend StatusMap entry.
 * Mirrors {@code StatusMapEntry.java} record. Used for the {@code status}
 * column variant.
 */
export type StatusMapEntry = {
  variant: string;
  labelKey: string;
};

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
    | 'enum'
    /**
     * PR-D1b (Codex thread 019e800b, 2026-05-31) — bold-text variant
     * added at L2 level matching the backend whitelist. {@code link} and
     * {@code actions} are explicitly out-of-scope for the D-chain.
     */
    | 'bold-text';
  width: number;
  sensitive: boolean;
  /** Badge/enum: raw value → variant color map (e.g., { ADMIN: 'danger', USER: 'info' }) */
  variantMap?: Record<string, string>;
  /** Badge/enum: raw value → i18n label key map */
  labelMap?: Record<string, string>;
  /** Status: raw value → { variant, labelKey } map */
  statusMap?: Record<string, StatusMapEntry>;
  /** Currency: ISO 4217 code (default: 'TRY') */
  currencyCode?: string;
  /** Number/currency/percent: decimal places */
  decimals?: number;
  /** Number: suffix (e.g., 'dk', 'gün') */
  suffix?: string;
  /** Number: prefix (e.g., '₺') */
  prefix?: string;
  /**
   * PR-D1b (Codex 019e800b): date format preset
   * ({@code short / long / datetime / relative}). Mirrors the backend
   * {@code ColumnDefinition.format} whitelist.
   */
  format?: 'short' | 'long' | 'datetime' | 'relative';
  /**
   * PR-D1b (Codex 019e800b): badge/status fallback variant when a raw
   * value is not in {@code variantMap} / {@code statusMap}. Mirrors
   * backend {@code ColumnDefinition.defaultVariant}.
   */
  defaultVariant?: string;
  /**
   * PR-D1b (Codex 019e800b): badge/status set filter override. When
   * absent, the AG Grid set filter discovers values from the dataset
   * ({@code Object.keys(statusMap)} for the status variant). Mirrors
   * backend {@code ColumnDefinition.filterValues}.
   */
  filterValues?: string[];
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

/**
 * PR-D1b (Codex thread 019e800b, 2026-05-31) — supported filter widget
 * kinds. Wire values stay hyphenated to match the backend
 * {@code FilterKind.java} {@code @JsonValue} mapping.
 */
export type FilterKind =
  | 'text-search'
  | 'enum-select'
  | 'date-range'
  | 'number-range'
  | 'company-picker'
  | 'month-picker';

/**
 * PR-D1b — inline option entry for {@code enum-select} widgets.
 * Either {@code labelKey} (i18n) or {@code label} (raw) may be provided.
 */
export type FilterOptionEntry = {
  value: string;
  labelKey?: string;
  label?: string;
};

/**
 * PR-D1b — dynamic option source. {@code static} resolves to
 * {@code FilterDefinition.options}; {@code endpoint} fetches via HTTP;
 * {@code filter-values} delegates to the existing
 * {@code fetchFilterValues(key, column)} endpoint.
 */
export type FilterOptionsSourceType = 'static' | 'endpoint' | 'filter-values';

export type FilterOptionsSource = {
  type: FilterOptionsSourceType;
  endpoint?: string;
  column?: string;
};

/**
 * PR-D1b (Codex thread 019e800b, 2026-05-31) — metadata-driven filter
 * widget contract. When present on {@link ReportMetadata}, the dynamic
 * factory renders these widgets in place of the legacy CompanyPicker +
 * search pair. Mirrors backend {@code FilterDefinition.java}.
 */
export type FilterDefinition = {
  key: string;
  targetField?: string;
  kind: FilterKind;
  operator?: 'contains' | 'equals' | 'between' | 'gte' | 'lte';
  /** Default value used at filter initialization. */
  defaultValue?: unknown;
  /** URL search-param key preserving deep-link behaviour. */
  urlParam?: string;
  i18nLabelKey?: string;
  i18nPlaceholderKey?: string;
  options?: FilterOptionEntry[];
  optionsSource?: FilterOptionsSource;
  advancedFilterTarget?: string;
};

export type ReportListItem = {
  key: string;
  title: string;
  description: string;
  category: string;
  /** CNS-006 R18: reportGroup from access_config for deny-default filtering */
  reportGroup?: string;
  /**
   * PR-D1b (Codex 019e800b): optional alias for the web route segment
   * (defaults to {@code key}). When the backend wants to migrate a
   * static module that lived at a different route than its semantic
   * key — e.g. backend key {@code hr-compensation-detay} aliased to
   * route {@code hr-compensation} — it sets this field. Mirrors backend
   * {@code ReportListItemDto.routeSegment}.
   */
  routeSegment?: string;
  /**
   * PR-D1b (Codex 019e800b): optional legacy SharedReportId carry that
   * preserves favorites + saved-filter scope + sidebar default + export
   * mode when a static module is retired in favor of this dynamic
   * catalog entry. Mirrors backend {@code ReportListItemDto.sharedReportId}.
   */
  sharedReportId?: string;
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
  /**
   * PR-D1b (Codex thread 019e800b, 2026-05-31) — metadata-driven
   * sidebar filter widget contract. When present, the dynamic factory
   * renders these in place of the legacy CompanyPicker + search pair.
   * Mirrors backend {@code ReportMetadataDto.filterDefinitions}.
   */
  filterDefinitions?: FilterDefinition[];
};

export type ReportCategory = {
  name: string;
  count: number;
};
