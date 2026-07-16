/**
 * #1154 PR-3 — server-mode device grid contract.
 *
 * The backend `POST /endpoint-admin/endpoint-devices/query` (SSRM) returns
 * flat `colId -> value` rows whose keys are the snake_case column ids from
 * the server-side `DeviceGridColumns` registry — NOT the camelCase
 * `EndpointDevice` shape. AG Grid `columnDefs.field`, the filterModel keys,
 * and the export `columns` list all address these ids verbatim.
 */
export interface DeviceGridRow {
  device_id: string;
  hostname: string;
  display_name: string | null;
  os_type: string;
  os_version: string | null;
  agent_version: string | null;
  active_user: string | null;
  domain_name: string | null;
  status: string;
  last_seen_at: string | null;
  // device-health (AG-033) latest-per-device summary; null = no snapshot
  health_supported: boolean | null;
  health_probe_complete: boolean | null;
  health_any_low_disk: boolean | null;
  health_memory_used_percent: number | null;
  health_memory_high_pressure: boolean | null;
  health_uptime_days: number | null;
  health_long_uptime_warning: boolean | null;
  health_collected_at: string | null;
  // outdated-software (AG-036) latest-per-device summary; null = no snapshot
  outdated_supported: boolean | null;
  outdated_probe_complete: boolean | null;
  outdated_upgrade_count: number | null;
  outdated_upgrade_truncated: boolean | null;
  outdated_collected_at: string | null;
  // ── WEB-015 v2-a (backend DeviceGridColumns SCHEMA_VERSION = 3) ──
  // BE-025 prohibited-software latest evaluation (LEFT JOIN LATERAL pe);
  // pe.id IS NULL ⇒ status = 'NO_EVALUATION', decision = null, count = null.
  /** 'NO_EVALUATION' (no compliance evaluation row) | 'OK' (row present). */
  prohibited_status: string | null;
  /**
   * Latest evaluation decision projected as `pe.decision`
   * (backend `ComplianceDecision` enum):
   * 'COMPLIANT' | 'NON_COMPLIANT' | 'UNAUTHORIZED' | 'UNKNOWN' | null
   * (null only on LEFT JOIN no-snapshot path).
   */
  prohibited_decision: string | null;
  /** JSONB defensive array length over evidence.matchedItems.prohibitedInstalled. */
  prohibited_findings_count: number | null;
  // AG-041 latest app-control snapshot (LEFT JOIN LATERAL ac); ac.id IS NULL ⇒ null.
  /** WDAC mode: 'OFF' | 'AUDIT' | 'ENFORCE' | 'UNKNOWN' | null (no snapshot). */
  app_control_wdac_mode: string | null;
  /** AppLocker AppIDSvc state: 'RUNNING' | 'STOPPED' | 'DISABLED' | 'UNKNOWN' | null. */
  app_control_app_id_svc_state: string | null;
  // ── WEB-015 v2-b (backend DeviceGridColumns SCHEMA_VERSION = 4) ──
  // AG-038 latest diagnostics snapshot (LEFT JOIN LATERAL dx). LEFT JOIN
  // ⇒ no snapshot supplies SQL NULL for the three diagnostics columns.
  /** Last poll latency milliseconds. */
  diagnostics_last_poll_latency_ms: number | null;
  /**
   * Last error code (TEXT — backend DiagnosticsPayloadPolicy.CODE_RE is
   * `^[A-Z][A-Z0-9_]{2,64}$`, NOT a closed enum; the agent emits codes
   * like NEXT_COMMAND_TIMEOUT / DNS_TIMEOUT / UNSUPPORTED_PLATFORM that
   * a Set Filter tuple would silently drop — Codex 019e87bc iter-1 #2).
   */
  diagnostics_last_error_code: string | null;
  /**
   * Last error occurred-at timestamp (UI surface "last_error_at" but
   * the SQL source is the V23 canonical column `last_error_occurred_at`
   * — Codex 019e87bc iter-1 #3).
   */
  diagnostics_last_error_at: string | null;
  // AG-040 latest startup-exposure snapshot (LEFT JOIN LATERAL sx). The
  // backend projects NULL when sx.id IS NULL OR sx.supported = false OR
  // sx.probe_complete = false (CASE-guarded; Codex 019e87bc iter-1 #4) —
  // the V25 boolean columns are NOT NULL on the row, so the guard is
  // what carries "not measurable yet" semantics here.
  startup_rdp_enabled: boolean | null;
  startup_windows_firewall_event_log_enabled: boolean | null;
  // AG-039 latest services snapshot (LEFT JOIN LATERAL se). Single
  // operational sentinel: how many of the canonical 6 critical services
  // (WinDefend / wuauserv / BITS / EventLog / EndpointAgent / MpsSvc)
  // are persisted with `present=true AND state='STOPPED'` on the
  // latest snapshot. NULL when se.id IS NULL OR se.supported = false OR
  // se.probe_complete = false (Codex 019e87bc iter-1 #5).
  services_critical_stopped_count: number | null;
  // ── WEB-015 v2-d (backend DeviceGridColumns SCHEMA_VERSION = 5) ──
  // BE-024c DiffCache cache-fed summary columns: backend LEFT JOINs the
  // two diff cache tables (endpoint_software_diff_cache sdc +
  // endpoint_outdated_software_diff_cache odc) via UNIQUE(tenant_id,
  // device_id). Cache-absent device → all 9 columns return NULL (read-
  // model "not yet computed"; distinct from 'NO_HISTORY' which is a real
  // cache row state meaning "device has 0 history rows"). Grid stays
  // read-only — the canonical drawer endpoint is the live truth; the
  // backend AFTER_COMMIT listener + 10-min DiffCacheBackfillWorker close
  // the catch-up lag.
  /**
   * Software diff status enum:
   * 'OK' (real diff between two history rows) |
   * 'NO_CHANGE' (two captures, identical digest) |
   * 'INSUFFICIENT_HISTORY' (only one capture) |
   * 'NO_HISTORY' (cache row exists with zero captures) |
   * null (cache row absent — listener / worker has not yet computed).
   */
  software_diff_status: string | null;
  software_diff_added_count: number | null;
  software_diff_removed_count: number | null;
  software_diff_version_changed_count: number | null;
  /** Outdated diff status enum (mirror of software_diff_status). */
  outdated_diff_status: string | null;
  outdated_diff_added_count: number | null;
  outdated_diff_removed_count: number | null;
  outdated_diff_version_changed_count: number | null;
  /**
   * Available-version-bumped count: canonical packageId same,
   * installedVersion unchanged, availableVersion changed (4th outdated
   * count, distinct from added/removed/version_changed).
   */
  outdated_diff_available_version_bumped_count: number | null;
  // Index signature so the row satisfies AG Grid's
  // `RowData extends Record<string, unknown>` constraint.
  [key: string]: unknown;
}

/** AG Grid SSRM block request body for `POST /query`. */
export interface DeviceGridQueryRequest {
  startRow: number;
  endRow: number;
  filterModel: Record<string, unknown>;
  sortModel: unknown[];
  quickFilterText: string;
}

/** `POST /query` response: a page of rows + the SSRM lastRow sentinel. */
export interface DeviceGridQueryResponse {
  rows: DeviceGridRow[];
  /** Total when this is the last block, or -1 when more rows remain. */
  lastRow: number;
}

/** Arguments for the report-style `POST /export`. */
export interface DeviceGridExportArgs {
  format: 'csv' | 'xlsx';
  exportMode: 'raw' | 'view';
  filterModel?: Record<string, unknown>;
  sortModel?: unknown[];
  quickFilterText?: string;
  /** Visible column ids for a VIEW export (ignored for RAW). */
  columns?: string[];
}

/** Structured error body from the grid endpoints. */
export interface DeviceGridErrorBody {
  /** Application problem code (e.g. `ACCESS_DENIED`, `EXPORT_ROW_LIMIT_EXCEEDED`) — NOT the HTTP status. */
  code: string;
  message: string;
  /** Present only for `EXPORT_ROW_LIMIT_EXCEEDED`. */
  limit?: number;
  /**
   * The transport HTTP status, preserved SEPARATELY from `code` so a structured
   * body (`403 { code: "ACCESS_DENIED" }`) doesn't lose the status the capability
   * classifier needs (Codex S4a P1-2).
   */
  httpStatus?: number;
}

/** Thrown by `queryDevices` / `exportDevices` when the backend returns a structured error. */
export class DeviceGridExportError extends Error {
  readonly code: string;
  readonly limit?: number;
  /** Transport HTTP status, kept apart from the application `code`. */
  readonly httpStatus?: number;

  constructor(body: DeviceGridErrorBody) {
    super(body.message || body.code);
    this.name = 'DeviceGridExportError';
    this.code = body.code;
    this.limit = body.limit;
    this.httpStatus = body.httpStatus;
  }
}

/** Minimal shape of an AG Grid column-state entry we care about for export. */
export interface GridColumnStateLike {
  colId?: string | null;
  hide?: boolean | null;
}

/**
 * Resolve the VIEW-export column id list from an AG Grid column state.
 *
 * Keeps only currently-VISIBLE, real backend columns: AG Grid's internal
 * columns (the selection checkbox {@code ag-Grid-SelectionColumn}, the
 * auto-group {@code ag-Grid-AutoColumn}) are grid chrome, NOT backend colIds
 * — sending them makes the server reject the whole export with
 * {@code INVALID_GRID_FILTER} (400). This is the live view-export 400 the
 * PR-4 browser smoke caught (#1154 fast-follow).
 */
export function exportViewColumns(columnState: GridColumnStateLike[]): string[] {
  return columnState
    .filter(
      (c) => !c.hide && typeof c.colId === 'string' && !(c.colId as string).startsWith('ag-Grid'),
    )
    .map((c) => c.colId as string);
}
