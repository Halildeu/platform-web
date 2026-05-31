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
  code: string;
  message: string;
  /** Present only for `EXPORT_ROW_LIMIT_EXCEEDED`. */
  limit?: number;
}

/** Thrown by `exportDevices` when the backend returns a structured error. */
export class DeviceGridExportError extends Error {
  readonly code: string;
  readonly limit?: number;

  constructor(body: DeviceGridErrorBody) {
    super(body.message || body.code);
    this.name = 'DeviceGridExportError';
    this.code = body.code;
    this.limit = body.limit;
  }
}
