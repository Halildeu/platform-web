import React from 'react';
// WEB-014D perf follow-up: pull EntityGridTemplate from the
// `advanced/data-grid` subpath instead of the design-system barrel
// (the barrel transitively imports ECharts the grid never needs).
import { EntityGridTemplate } from '@mfe/design-system/advanced/data-grid';
import type { GridExportConfig } from '@mfe/design-system/advanced/data-grid';
import type {
  ColDef,
  GridApi,
  GridOptions,
  GridReadyEvent,
  IServerSideDatasource,
  IServerSideGetRowsParams,
  ValueFormatterParams,
} from 'ag-grid-community';
import {
  exportDevices,
  queryDevices,
  useGetEndpointDeviceQuery,
} from '../../app/services/endpointAdminApi';
import {
  DeviceGridExportError,
  exportViewColumns,
  type DeviceGridExportArgs,
  type DeviceGridRow,
} from '../../entities/endpoint-device-grid/types';
import { useEndpointAdminI18n } from '../../i18n';
import type { DeviceStatus, OsType } from '../../entities/endpoint-device/types';
import { DeviceDetailDrawer } from '../../widgets/device-detail-drawer';

/**
 * Devices surface — #1154 PR-3: SERVER-MODE grid.
 *
 * The grid is backed by the AG Grid Server-Side Row Model: each block is
 * fetched from `POST /endpoint-admin/endpoint-devices/query`, which already
 * joins each device's latest device-health (AG-033) + outdated-software
 * (AG-036) summary server-side. Converting to server mode is what unlocks
 * the platform-standard report-style **İndir ▾** export dropdown (Ham
 * veri/raw + Mevcut görünüm/view × Excel/CSV) — the toolbar only offers it
 * for a server-mode grid with an `onServerExport` callback. The old custom
 * client-side CSV button (`InventoryExportButton`) + per-device snapshot
 * lookup are retired.
 *
 * Row shape: `/query` returns flat snake_case `colId` rows (`DeviceGridRow`),
 * NOT the camelCase `EndpointDevice`. Column `field`s, the filterModel keys,
 * and the export `columns` all address those ids. Row click fetches the full
 * `EndpointDevice` by id (`getEndpointDevice`) for the detail drawer so the
 * drawer sees every field (tenantId/machineFingerprint/… are absent from the
 * flat grid row).
 */

const STATUS_VARIANT_MAP: Record<DeviceStatus, string> = {
  PENDING_ENROLLMENT: 'var(--state-warning-text)',
  ONLINE: 'var(--state-success-text)',
  STALE: 'var(--state-warning-text)',
  OFFLINE: 'var(--text-secondary)',
  DECOMMISSIONED: 'var(--danger-color)',
};

const STATUS_VALUES = Object.keys(STATUS_VARIANT_MAP) as DeviceStatus[];
const OS_VALUES: OsType[] = ['WINDOWS', 'MACOS', 'LINUX', 'UNKNOWN'];

const OS_LABEL: Record<OsType, string> = {
  WINDOWS: 'Windows',
  MACOS: 'macOS',
  LINUX: 'Linux',
  UNKNOWN: '—',
};

const GRID_ID = 'endpoint-admin-devices';
// Tracks the backend `DeviceGridColumns.SCHEMA_VERSION`:
//   v2 — health (AG-033) + outdated (AG-036) LATERAL summary
//   v3 — WEB-015 v2-a: prohibited + app-control LATERAL summary
//   v4 — WEB-015 v2-b: AG-038 diagnostics + AG-040 startup sentinels +
//        AG-039 services critical-stopped count (6 new colIds appended
//        to raw export sequence; Codex 019e87bc iter-3 AGREE).
// Each bump invalidates persisted column state from prior versions on
// EntityGridTemplate, so a user upgrading from v3 → v4 gets the v2-b
// columns hidden at default position (registry order, not stale layout).
const GRID_SCHEMA_VERSION = 5;

// v2-a domain enums kept verbatim from backend (DeviceGridColumns SQL).
// Raw codes stay backend-canonical; UI labels are i18n. `null` ⇒ no
// snapshot/no evaluation (LEFT JOIN supplied NULL), distinct from the
// explicit domain value 'NO_EVALUATION' (compliance evaluation absent
// per server contract).
const PROHIBITED_STATUS_VALUES = ['NO_EVALUATION', 'OK'] as const;
// Domain backed by backend `ComplianceDecision` enum
// (com.example.endpointadmin.model.ComplianceDecision) + the persisted
// `prohibited_decision` column projected by DeviceGridColumns
// (`pe.decision`). The ladder is UNAUTHORIZED > UNKNOWN > NON_COMPLIANT >
// COMPLIANT; the LIVE WEB-015 v2-a smoke surfaced a row with
// `decision=UNKNOWN` (telemetry-insufficient legitimate path: snapshot
// missing / apps unavailable / hard-stale / catalog gap / egress
// unsupported — `EndpointComplianceService.decide`) which the v0 tuple
// hid from the Set Filter. The original v0 tuple's `INSUFFICIENT_DATA`
// was a draft-time guess that the backend never emits — replaced here
// by the two backend-canonical codes the ladder can actually produce.
const PROHIBITED_DECISION_VALUES = [
  'COMPLIANT',
  'NON_COMPLIANT',
  'UNAUTHORIZED',
  'UNKNOWN',
] as const;
const WDAC_MODE_VALUES = ['OFF', 'AUDIT', 'ENFORCE', 'UNKNOWN'] as const;
const APP_ID_SVC_STATE_VALUES = ['RUNNING', 'STOPPED', 'DISABLED', 'UNKNOWN'] as const;

// Codex 019e87aa iter-2 P1 must_fix: `prohibited_status.OK` means
// "an evaluation row exists" (pe.id IS NOT NULL) — NOT compliance success.
// Real compliance verdict lives in `prohibited_decision` (which can be
// UNAUTHORIZED). Using success-green on OK would render contradictory
// rows ("Yasaklı Yazılım Durumu = Uygun" while decision = Yetkisiz).
// Both states are neutral/info: presence-only signal, not a verdict.
const PROHIBITED_STATUS_COLOR: Record<string, string> = {
  OK: 'var(--text-primary, var(--text-secondary))',
  NO_EVALUATION: 'var(--text-secondary)',
};

const formatTimestamp = (value: unknown): string => {
  if (value == null || value === '') return '—';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
};

const formatBool = (value: unknown, yes: string, no: string): string => {
  if (value == null) return '—';
  return value ? yes : no;
};

export interface EndpointDevicesPagePreset {
  gridId: string;
  dataTestId: string;
  headingKey: string;
  subtitleKey: string;
  exportFileBaseName: string;
  exportSheetName: string;
  quickFilterPlaceholderKey?: string;
  forceVisibleColumns?: readonly string[];
  initialFilterModel?: Record<string, unknown>;
}

const DEFAULT_PRESET: EndpointDevicesPagePreset = {
  gridId: GRID_ID,
  dataTestId: 'endpoint-admin-devices-page',
  headingKey: 'endpointAdmin.devices.heading',
  subtitleKey: 'endpointAdmin.devices.subtitle',
  exportFileBaseName: 'endpoint-devices',
  exportSheetName: 'Cihazlar',
  quickFilterPlaceholderKey: 'endpointAdmin.devices.quickFilterPlaceholder',
};

/** Stream a blob to disk via a transient anchor (no library). */
function triggerDownload(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}

export interface EndpointDevicesPageProps {
  preset?: EndpointDevicesPagePreset;
}

export const EndpointDevicesPage: React.FC<EndpointDevicesPageProps> = ({
  preset = DEFAULT_PRESET,
}) => {
  const { t } = useEndpointAdminI18n();
  const gridApiRef = React.useRef<GridApi<DeviceGridRow> | null>(null);
  const initialFilterAppliedRef = React.useRef(false);
  const [selectedDeviceId, setSelectedDeviceId] = React.useState<string | null>(null);
  const [loadError, setLoadError] = React.useState<DeviceGridExportError | null>(null);
  const [exportNotice, setExportNotice] = React.useState<string | null>(null);
  const forcedVisibleColumns = React.useMemo(
    () => new Set(preset.forceVisibleColumns ?? []),
    [preset.forceVisibleColumns],
  );

  // Row click fetches the full EndpointDevice by id (the flat grid row lacks
  // tenantId/machineFingerprint/enrolledAt/createdAt/updatedAt the drawer
  // reads). Skipped until a row is selected.
  const { data: selectedDevice } = useGetEndpointDeviceQuery(selectedDeviceId ?? '', {
    skip: selectedDeviceId == null,
  });

  const forbidden = loadError?.code === '403';

  const statusLabel = React.useCallback(
    (status: string) => t(`endpointAdmin.devices.status.${status}`),
    [t],
  );

  const columnDefs = React.useMemo<ColDef<DeviceGridRow>[]>(() => {
    const cols: ColDef<DeviceGridRow>[] = [
      {
        field: 'hostname',
        headerName: t('endpointAdmin.devices.col.hostname'),
        minWidth: 200,
        filter: 'agTextColumnFilter',
        cellStyle: { fontFamily: 'monospace' },
        valueGetter: (params) => {
          const row = params.data;
          if (!row) return '';
          const display = row.display_name;
          return display && display !== row.hostname
            ? `${row.hostname} (${display})`
            : row.hostname;
        },
      },
      {
        field: 'os_type',
        headerName: t('endpointAdmin.devices.col.os'),
        minWidth: 160,
        filter: 'agSetColumnFilter',
        filterParams: {
          values: OS_VALUES,
          valueFormatter: (p: ValueFormatterParams<DeviceGridRow>) =>
            OS_LABEL[p.value as OsType] ?? String(p.value),
        },
        valueGetter: (params) => {
          const row = params.data;
          if (!row) return '';
          const label = OS_LABEL[row.os_type as OsType] ?? row.os_type;
          return row.os_version ? `${label} ${row.os_version}` : label;
        },
      },
      {
        field: 'agent_version',
        headerName: t('endpointAdmin.devices.col.agentVersion'),
        minWidth: 140,
        filter: 'agTextColumnFilter',
        cellStyle: { fontFamily: 'monospace' },
        valueFormatter: (p) => (p.value ? String(p.value) : '—'),
      },
      {
        field: 'domain_name',
        headerName: t('endpointAdmin.devices.col.domain'),
        minWidth: 140,
        filter: 'agTextColumnFilter',
        hide: true,
        valueFormatter: (p) => (p.value ? String(p.value) : '—'),
      },
      {
        field: 'status',
        headerName: t('endpointAdmin.devices.col.status'),
        minWidth: 140,
        filter: 'agSetColumnFilter',
        filterParams: {
          values: STATUS_VALUES,
          valueFormatter: (p: ValueFormatterParams<DeviceGridRow>) => statusLabel(String(p.value)),
        },
        cellRenderer: (params: { value: string; data?: DeviceGridRow }) => {
          const status = params.value;
          if (!status) return null;
          const color = STATUS_VARIANT_MAP[status as DeviceStatus] ?? 'var(--text-secondary)';
          return (
            <span data-testid={`device-status-${status}`} style={{ color, fontWeight: 500 }}>
              {statusLabel(status)}
            </span>
          );
        },
      },
      {
        field: 'last_seen_at',
        headerName: t('endpointAdmin.devices.col.lastSeenAt'),
        minWidth: 180,
        filter: false,
        valueFormatter: (p) => formatTimestamp(p.value),
      },
      // ── v2 device-health (AG-033) — visible key columns + toggleable rest ──
      {
        field: 'health_memory_used_percent',
        headerName: t('endpointAdmin.devices.col.memoryUsedPercent'),
        minWidth: 120,
        filter: 'agNumberColumnFilter',
        valueFormatter: (p) => (p.value == null ? '—' : `%${p.value}`),
      },
      {
        field: 'health_any_low_disk',
        headerName: t('endpointAdmin.devices.col.lowDisk'),
        minWidth: 120,
        filter: false,
        valueFormatter: (p) =>
          formatBool(p.value, t('endpointAdmin.export.val.yes'), t('endpointAdmin.export.val.no')),
      },
      {
        field: 'health_uptime_days',
        headerName: t('endpointAdmin.devices.col.uptimeDays'),
        minWidth: 130,
        filter: 'agNumberColumnFilter',
        hide: true,
        valueFormatter: (p) => (p.value == null ? '—' : `${p.value}`),
      },
      {
        field: 'health_long_uptime_warning',
        headerName: t('endpointAdmin.devices.col.longUptime'),
        minWidth: 130,
        filter: false,
        hide: true,
        valueFormatter: (p) =>
          formatBool(p.value, t('endpointAdmin.export.val.yes'), t('endpointAdmin.export.val.no')),
      },
      // ── v2 outdated-software (AG-036) ──
      {
        field: 'outdated_upgrade_count',
        headerName: t('endpointAdmin.devices.col.upgradeCount'),
        minWidth: 150,
        filter: 'agNumberColumnFilter',
        valueFormatter: (p) => (p.value == null ? '—' : `${p.value}`),
      },
      {
        field: 'outdated_upgrade_truncated',
        headerName: t('endpointAdmin.devices.col.upgradeTruncated'),
        minWidth: 130,
        filter: false,
        hide: true,
        valueFormatter: (p) =>
          formatBool(p.value, t('endpointAdmin.export.val.yes'), t('endpointAdmin.export.val.no')),
      },
      // ── WEB-015 v2-a (DeviceGridColumns SCHEMA_VERSION = 3) ──
      // BE-025 prohibited-software latest evaluation + AG-041 latest
      // app-control snapshot. All 5 hide:true by default — toggleable via
      // the column tool panel; default-visible would crowd the grid for
      // tenants with high NO_EVALUATION / UNKNOWN density (Codex
      // 019e87aa AGREE guardrail).
      {
        field: 'prohibited_status',
        headerName: t('endpointAdmin.devices.col.prohibitedStatus'),
        minWidth: 170,
        filter: 'agSetColumnFilter',
        hide: true,
        filterParams: {
          values: PROHIBITED_STATUS_VALUES,
          valueFormatter: (p: ValueFormatterParams<DeviceGridRow>) =>
            p.value == null ? '—' : t(`endpointAdmin.devices.prohibitedStatus.${String(p.value)}`),
        },
        // Codex 019e87aa: explicit `Değerlendirilmedi` for the domain
        // value NO_EVALUATION; tire (—) reserved for null/missing.
        valueFormatter: (p) =>
          p.value == null ? '—' : t(`endpointAdmin.devices.prohibitedStatus.${String(p.value)}`),
        cellRenderer: (params: { value: string | null }) => {
          const status = params.value;
          if (status == null) return '—';
          const color = PROHIBITED_STATUS_COLOR[status] ?? 'var(--text-secondary)';
          const label = t(`endpointAdmin.devices.prohibitedStatus.${status}`);
          return (
            <span data-testid={`prohibited-status-${status}`} style={{ color, fontWeight: 500 }}>
              {label}
            </span>
          );
        },
      },
      {
        field: 'prohibited_decision',
        headerName: t('endpointAdmin.devices.col.prohibitedDecision'),
        minWidth: 150,
        filter: 'agSetColumnFilter',
        hide: true,
        filterParams: {
          values: PROHIBITED_DECISION_VALUES,
          valueFormatter: (p: ValueFormatterParams<DeviceGridRow>) =>
            p.value == null
              ? '—'
              : t(`endpointAdmin.devices.prohibitedDecision.${String(p.value)}`),
        },
        valueFormatter: (p) =>
          p.value == null ? '—' : t(`endpointAdmin.devices.prohibitedDecision.${String(p.value)}`),
      },
      {
        field: 'prohibited_findings_count',
        headerName: t('endpointAdmin.devices.col.prohibitedFindingsCount'),
        minWidth: 160,
        filter: 'agNumberColumnFilter',
        hide: true,
        // Codex 019e87aa: 0 !== null (real "no prohibited installs found"
        // vs "no evaluation row"); preserve the distinction in the UI.
        valueFormatter: (p) => (p.value == null ? '—' : String(p.value)),
      },
      {
        field: 'app_control_wdac_mode',
        headerName: t('endpointAdmin.devices.col.wdacMode'),
        minWidth: 130,
        filter: 'agSetColumnFilter',
        hide: true,
        filterParams: {
          values: WDAC_MODE_VALUES,
          valueFormatter: (p: ValueFormatterParams<DeviceGridRow>) =>
            p.value == null ? '—' : t(`endpointAdmin.devices.wdacMode.${String(p.value)}`),
        },
        valueFormatter: (p) =>
          p.value == null ? '—' : t(`endpointAdmin.devices.wdacMode.${String(p.value)}`),
      },
      {
        field: 'app_control_app_id_svc_state',
        headerName: t('endpointAdmin.devices.col.appIdSvcState'),
        minWidth: 150,
        filter: 'agSetColumnFilter',
        hide: true,
        filterParams: {
          values: APP_ID_SVC_STATE_VALUES,
          valueFormatter: (p: ValueFormatterParams<DeviceGridRow>) =>
            p.value == null ? '—' : t(`endpointAdmin.devices.appIdSvcState.${String(p.value)}`),
        },
        valueFormatter: (p) =>
          p.value == null ? '—' : t(`endpointAdmin.devices.appIdSvcState.${String(p.value)}`),
      },
      // ── WEB-015 v2-b (DeviceGridColumns SCHEMA_VERSION = 4) ──
      // AG-038 diagnostics + AG-040 startup-exposure + AG-039 services
      // sentinels. All 6 hide:true default (toggleable from the column
      // tool panel — mirrors v2-a discipline; not every operator surfaces
      // diagnostics latency by default).
      {
        field: 'diagnostics_last_poll_latency_ms',
        headerName: t('endpointAdmin.devices.col.diagnosticsLatency'),
        minWidth: 150,
        filter: 'agNumberColumnFilter',
        hide: true,
        // Distinguish null (no diagnostics snapshot) from 0 (theoretically
        // valid but operationally suspicious) the same way v2-a kept 0 vs
        // null distinct for prohibited_findings_count.
        valueFormatter: (p) => (p.value == null ? '—' : `${p.value}`),
      },
      {
        field: 'diagnostics_last_error_code',
        headerName: t('endpointAdmin.devices.col.diagnosticsLastErrorCode'),
        minWidth: 200,
        // TEXT filter — backend DiagnosticsPayloadPolicy.CODE_RE is
        // `^[A-Z][A-Z0-9_]{2,64}$`, NOT a closed enum. The agent emits
        // codes like NEXT_COMMAND_TIMEOUT / DNS_TIMEOUT /
        // UNSUPPORTED_PLATFORM that a Set Filter tuple would silently
        // drop (Codex 019e87bc iter-1 #2).
        filter: 'agTextColumnFilter',
        hide: true,
        cellStyle: { fontFamily: 'monospace' },
        valueFormatter: (p) => (p.value == null ? '—' : String(p.value)),
      },
      {
        field: 'diagnostics_last_error_at',
        headerName: t('endpointAdmin.devices.col.diagnosticsLastErrorAt'),
        minWidth: 180,
        filter: false,
        hide: true,
        valueFormatter: (p) => formatTimestamp(p.value),
      },
      {
        field: 'startup_rdp_enabled',
        headerName: t('endpointAdmin.devices.col.startupRdpEnabled'),
        minWidth: 150,
        filter: false,
        hide: true,
        // The backend CASE guard projects NULL when no snapshot /
        // unsupported / probe-incomplete — false here means the actual
        // measured "RDP off" reading (Codex 019e87bc iter-1 #4).
        valueFormatter: (p) =>
          formatBool(p.value, t('endpointAdmin.export.val.yes'), t('endpointAdmin.export.val.no')),
      },
      {
        field: 'startup_windows_firewall_event_log_enabled',
        headerName: t('endpointAdmin.devices.col.startupFirewallEventLog'),
        minWidth: 220,
        filter: false,
        hide: true,
        valueFormatter: (p) =>
          formatBool(p.value, t('endpointAdmin.export.val.yes'), t('endpointAdmin.export.val.no')),
      },
      {
        field: 'services_critical_stopped_count',
        headerName: t('endpointAdmin.devices.col.servicesCriticalStopped'),
        minWidth: 200,
        filter: 'agNumberColumnFilter',
        hide: true,
        // 0 !== null preserved: 0 = "all 6 canonical critical services
        // running"; null = "not measurable yet" (Codex 019e87bc iter-1 #4).
        valueFormatter: (p) => (p.value == null ? '—' : `${p.value}`),
      },
      // ── WEB-015 v2-d (backend DeviceGridColumns SCHEMA_VERSION = 5) ──
      // BE-024c DiffCache 9 cache-fed columns. All hidden by default — the
      // operator opts in via the column toolbar. null = "cache row absent /
      // not yet computed by listener or worker"; 'NO_HISTORY' status =
      // "cache row exists but device has 0 captures yet"; counts in
      // 'NO_HISTORY' state = 0 (per backend writer contract).
      {
        field: 'software_diff_status',
        headerName: t('endpointAdmin.devices.col.softwareDiffStatus'),
        minWidth: 200,
        filter: 'agSetColumnFilter',
        hide: true,
        valueFormatter: (p) => (p.value == null ? '—' : String(p.value)),
      },
      {
        field: 'software_diff_added_count',
        headerName: t('endpointAdmin.devices.col.softwareDiffAdded'),
        minWidth: 160,
        filter: 'agNumberColumnFilter',
        hide: true,
        valueFormatter: (p) => (p.value == null ? '—' : `${p.value}`),
      },
      {
        field: 'software_diff_removed_count',
        headerName: t('endpointAdmin.devices.col.softwareDiffRemoved'),
        minWidth: 160,
        filter: 'agNumberColumnFilter',
        hide: true,
        valueFormatter: (p) => (p.value == null ? '—' : `${p.value}`),
      },
      {
        field: 'software_diff_version_changed_count',
        headerName: t('endpointAdmin.devices.col.softwareDiffVersionChanged'),
        minWidth: 200,
        filter: 'agNumberColumnFilter',
        hide: true,
        valueFormatter: (p) => (p.value == null ? '—' : `${p.value}`),
      },
      {
        field: 'outdated_diff_status',
        headerName: t('endpointAdmin.devices.col.outdatedDiffStatus'),
        minWidth: 200,
        filter: 'agSetColumnFilter',
        hide: true,
        valueFormatter: (p) => (p.value == null ? '—' : String(p.value)),
      },
      {
        field: 'outdated_diff_added_count',
        headerName: t('endpointAdmin.devices.col.outdatedDiffAdded'),
        minWidth: 160,
        filter: 'agNumberColumnFilter',
        hide: true,
        valueFormatter: (p) => (p.value == null ? '—' : `${p.value}`),
      },
      {
        field: 'outdated_diff_removed_count',
        headerName: t('endpointAdmin.devices.col.outdatedDiffRemoved'),
        minWidth: 160,
        filter: 'agNumberColumnFilter',
        hide: true,
        valueFormatter: (p) => (p.value == null ? '—' : `${p.value}`),
      },
      {
        field: 'outdated_diff_version_changed_count',
        headerName: t('endpointAdmin.devices.col.outdatedDiffVersionChanged'),
        minWidth: 200,
        filter: 'agNumberColumnFilter',
        hide: true,
        valueFormatter: (p) => (p.value == null ? '—' : `${p.value}`),
      },
      {
        field: 'outdated_diff_available_version_bumped_count',
        headerName: t('endpointAdmin.devices.col.outdatedDiffAvailableBumped'),
        minWidth: 220,
        filter: 'agNumberColumnFilter',
        hide: true,
        valueFormatter: (p) => (p.value == null ? '—' : `${p.value}`),
      },
    ];
    // Flat-only server grid: the /query datasource sends no
    // rowGroupCols/pivot/valueCols, so grouping/pivot/aggregation MUST be
    // disabled per-column — otherwise the toolbar QuickGroupMenu (which
    // filters on `enableRowGroup !== false`) + the row-group panel would let
    // the user enter SSRM grouping mode against a flat backend and break
    // (Codex 019e7f89). Per-column false also wins over GridShell's
    // enableRowGroup:true default.
    return cols.map((c) => {
      const colId = typeof c.field === 'string' ? c.field : undefined;
      return {
        enableRowGroup: false,
        enablePivot: false,
        enableValue: false,
        ...c,
        hide: colId != null && forcedVisibleColumns.has(colId) ? false : c.hide,
      };
    });
  }, [t, statusLabel, forcedVisibleColumns]);

  const createServerSideDatasource = React.useCallback(
    (): IServerSideDatasource => ({
      getRows: async (params: IServerSideGetRowsParams) => {
        const req = params.request;
        const quickFilterText =
          (params.api.getGridOption('quickFilterText') as string | undefined) ?? '';
        try {
          const response = await queryDevices({
            startRow: req.startRow ?? 0,
            endRow: req.endRow ?? 100,
            filterModel: (req.filterModel as Record<string, unknown>) ?? {},
            sortModel: (req.sortModel as unknown[]) ?? [],
            quickFilterText,
          });
          setLoadError(null);
          params.success({
            rowData: response.rows,
            // -1 ⇒ more blocks remain (AG Grid treats undefined the same way).
            rowCount: response.lastRow === -1 ? undefined : response.lastRow,
          });
        } catch (error) {
          if (error instanceof DeviceGridExportError) {
            setLoadError(error);
          } else {
            setLoadError(new DeviceGridExportError({ code: 'UNKNOWN', message: String(error) }));
          }
          params.fail();
        }
      },
    }),
    [],
  );

  const exportConfig = React.useMemo<GridExportConfig<DeviceGridRow>>(
    () => ({
      fileBaseName: preset.exportFileBaseName,
      sheetName: preset.exportSheetName,
      csvColumnSeparator: ';',
      csvBom: true,
    }),
    [preset.exportFileBaseName, preset.exportSheetName],
  );

  const handleServerExport = React.useCallback(
    async (
      format: 'excel' | 'csv',
      params: {
        filterModel: Record<string, unknown>;
        sortModel: unknown[];
        quickFilterText: string;
        exportMode?: 'raw' | 'view';
      },
    ): Promise<void> => {
      const exportMode = params.exportMode ?? 'view';
      const isView = exportMode === 'view';
      // Export contract (Codex 019e7f89): VIEW exports the BACKEND values of
      // the currently-visible columns (filter/sort/quick-filter applied) — the
      // grid's combined display cells (e.g. "hostname (display_name)") are a
      // render concern, so VIEW carries the canonical hostname/os_type values.
      // RAW ships EVERY canonical column (incl. display_name + os_version), so
      // those derived sub-fields are always available via the Ham veri export.
      // VIEW exports the visible backend columns; exportViewColumns drops AG
      // Grid's internal columns (selection/auto-group) which the server would
      // otherwise reject with INVALID_GRID_FILTER (the live 400 the PR-4
      // browser smoke caught). RAW ships every canonical column.
      const visibleColumns = isView
        ? exportViewColumns(gridApiRef.current?.getColumnState() ?? [])
        : undefined;
      const args: DeviceGridExportArgs = {
        format: format === 'excel' ? 'xlsx' : 'csv',
        exportMode,
        filterModel: isView ? params.filterModel : undefined,
        sortModel: isView ? params.sortModel : undefined,
        quickFilterText: isView ? params.quickFilterText : undefined,
        columns: visibleColumns,
      };
      setExportNotice(null);
      try {
        const { blob, filename } = await exportDevices(args);
        triggerDownload(blob, filename);
      } catch (error) {
        if (error instanceof DeviceGridExportError && error.code === 'EXPORT_ROW_LIMIT_EXCEEDED') {
          setExportNotice(
            t('endpointAdmin.export.rowLimitExceeded').replace(
              '{limit}',
              String(error.limit ?? ''),
            ),
          );
        } else {
          setExportNotice(t('endpointAdmin.export.failed'));
        }
      }
    },
    [t],
  );

  const gridOptions = React.useMemo<GridOptions<DeviceGridRow>>(
    () => ({
      multiSortKey: 'ctrl' as const,
      onRowClicked: (event) => {
        const ev = event.event as MouseEvent | undefined;
        if (ev && ev.button !== undefined && ev.button !== 0) return;
        if (ev && ev.defaultPrevented) return;
        if (event.node.group) return;
        const deviceId = event.data?.device_id;
        if (typeof deviceId !== 'string') return;

        const target = (event.event?.target as HTMLElement | null) ?? null;
        if (target) {
          if (target.closest('button, a, input, select, textarea, [contenteditable="true"]'))
            return;
          if (target.closest('[role="button"], [role="menuitem"]')) return;
          if (target.closest('[data-no-row-open]')) return;
          if (
            target.closest(
              '.ag-checkbox-input-wrapper, .ag-selection-checkbox, .ag-group-expanded, .ag-group-contracted',
            )
          ) {
            return;
          }
        }
        setSelectedDeviceId(deviceId);
      },
    }),
    [],
  );

  const onGridReady = React.useCallback(
    (event: GridReadyEvent<DeviceGridRow>) => {
      gridApiRef.current = event.api;
      if (initialFilterAppliedRef.current || !preset.initialFilterModel) return;
      initialFilterAppliedRef.current = true;
      window.queueMicrotask(() => {
        event.api.setFilterModel(
          preset.initialFilterModel as Parameters<GridApi<DeviceGridRow>['setFilterModel']>[0],
        );
        event.api.onFilterChanged();
      });
    },
    [preset.initialFilterModel],
  );

  if (forbidden) {
    return (
      <section role="alert" aria-live="polite" style={{ padding: 24 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{t(preset.headingKey)}</h2>
        <p style={{ marginTop: 12, color: 'var(--danger-color)' }}>
          {t('endpointAdmin.devices.forbidden')} (HTTP 403)
        </p>
      </section>
    );
  }

  return (
    <section style={{ padding: 24 }} data-testid={preset.dataTestId}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{t(preset.headingKey)}</h2>
          <p style={{ marginTop: 4, color: 'var(--text-secondary)', fontSize: 13 }}>
            {t(preset.subtitleKey)}
          </p>
        </div>
        {exportNotice ? (
          <span
            role="status"
            aria-live="polite"
            data-testid="export-notice"
            style={{
              fontSize: 12,
              color: 'var(--state-warning-text, #b54708)',
              maxWidth: 360,
              textAlign: 'right',
            }}
          >
            {exportNotice}
          </span>
        ) : null}
      </div>
      {loadError && !forbidden ? (
        <p
          role="alert"
          data-testid="grid-load-error"
          style={{ marginTop: 12, color: 'var(--danger-color)', fontSize: 13 }}
        >
          {t('endpointAdmin.devices.error')}
        </p>
      ) : null}
      <div style={{ marginTop: 16, height: 'calc(100vh - 200px)', minHeight: 400 }}>
        <React.Suspense fallback={<div style={{ height: 400 }} />}>
          <EntityGridTemplate<DeviceGridRow>
            gridId={preset.gridId}
            gridSchemaVersion={GRID_SCHEMA_VERSION}
            columnDefs={columnDefs}
            gridOptions={gridOptions}
            dataSourceMode="server"
            createServerSideDatasource={createServerSideDatasource}
            onGridReady={onGridReady}
            exportConfig={exportConfig}
            onServerExport={handleServerExport}
            supportsViewExport
            themeLabel="Tema"
            quickFilterLabel="Hızlı Filtre"
            quickFilterPlaceholder={
              preset.quickFilterPlaceholderKey
                ? t(preset.quickFilterPlaceholderKey)
                : 'Hostname, durum, ajan sürümü…'
            }
            resetFiltersLabel="Filtreleri Temizle"
          />
        </React.Suspense>
      </div>
      <DeviceDetailDrawer
        open={selectedDevice != null}
        device={selectedDevice ?? null}
        onClose={() => setSelectedDeviceId(null)}
      />
    </section>
  );
};

export default EndpointDevicesPage;
