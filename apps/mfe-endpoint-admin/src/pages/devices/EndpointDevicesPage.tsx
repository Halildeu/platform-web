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
import DeviceBulkActionsMenu, { type BulkSelectableDevice } from './DeviceBulkActionsMenu';
import {
  CapabilityState,
  classifyCapabilityError,
  FLEET_CAPABILITY_POLICY,
  RETRYABLE_KINDS,
} from '../../widgets/capability-state';

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
// "Active" lifecycle statuses = everything except DECOMMISSIONED ("Pasif" /
// Hizmet dışı). Used as the DEFAULT status filter so the everyday list hides
// decommissioned ("işi biten") devices without deleting them — operators
// reveal passive devices by editing the existing Durum (status) column filter.
const ACTIVE_STATUS_VALUES = STATUS_VALUES.filter((s) => s !== 'DECOMMISSIONED');

/**
 * Apply the default ACTIVE status floor to an SSRM query's filterModel
 * (#782 follow-up, Codex 019ea960 AGREE Option A).
 *
 * Why at the datasource layer and not via onGridReady setFilterModel: the
 * design-system EntityGridTemplate has a grid-VARIANT system that OWNS the
 * live filterModel — on mount it runs `applyVariantState` →
 * `setFilterModel(variant.state.filterModel ?? null)`, which clobbers any
 * page-level default applied in onGridReady (a saved variant with an empty
 * `{}` filterModel re-shows DECOMMISSIONED devices — the live bug this fixes).
 * Enforcing the default here, at every server query build, is robust against
 * the variant system, persistence and lifecycle timing.
 *
 * Semantics: inject `statusDefault` ONLY when the caller's filterModel has no
 * `status` KEY at all (field-level presence, NOT truthiness of `values`). An
 * explicit `status` filter — including a deliberate empty `values: []`
 * ("match nothing") or a full set that re-includes DECOMMISSIONED — is
 * respected verbatim. Pure + non-mutating: the input is never modified.
 */
export function withDefaultStatusFilter(
  filterModel: Record<string, unknown>,
  statusDefault: unknown,
): Record<string, unknown> {
  if (statusDefault == null) return filterModel;
  if (Object.prototype.hasOwnProperty.call(filterModel, 'status')) return filterModel;
  return { ...filterModel, status: statusDefault };
}

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

export const DEFAULT_PRESET: EndpointDevicesPagePreset = {
  gridId: GRID_ID,
  dataTestId: 'endpoint-admin-devices-page',
  headingKey: 'endpointAdmin.devices.heading',
  subtitleKey: 'endpointAdmin.devices.subtitle',
  exportFileBaseName: 'endpoint-devices',
  exportSheetName: 'Cihazlar',
  quickFilterPlaceholderKey: 'endpointAdmin.devices.quickFilterPlaceholder',
  // Default the grid to ACTIVE devices only (hide DECOMMISSIONED / "Pasif").
  // The default lives in the existing Durum (status) set-filter semantics (no
  // separate toggle/control) but is ENFORCED at the SSRM datasource layer via
  // `withDefaultStatusFilter` — NOT onGridReady — because the EntityGridTemplate
  // variant system owns the live filterModel and would clobber a UI-level
  // default (see the helper's docblock). `.status` here is the canonical
  // default-floor source consumed by the datasource; the operator re-includes
  // DECOMMISSIONED by selecting it in the Durum filter (an explicit status key
  // is respected verbatim). Backend treats this as `status IN (active values)`.
  initialFilterModel: {
    status: { filterType: 'set', values: ACTIVE_STATUS_VALUES },
  },
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
  const [selectedDeviceId, setSelectedDeviceId] = React.useState<string | null>(null);
  const [loadError, setLoadError] = React.useState<DeviceGridExportError | null>(null);
  const [exportNotice, setExportNotice] = React.useState<string | null>(null);
  const [bulkNotice, setBulkNotice] = React.useState<{
    message: string;
    kind: 'success' | 'error' | 'info';
  } | null>(null);
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

  // Feed the grid's DeviceGridExportError to the ONE classifier: its transport
  // `httpStatus` (kept apart from the app `code`, so `403 { code: 'ACCESS_DENIED' }`
  // still classifies as forbidden — Codex P1-2) drives the kind, and any structured
  // `code` takes the durable problem-code path.
  const loadErrorKind = loadError
    ? classifyCapabilityError(
        { status: loadError.httpStatus, data: { code: loadError.code } },
        FLEET_CAPABILITY_POLICY,
      )
    : undefined;
  // Keep the grid MOUNTED only when the error is retryable (so `refreshServerSide`
  // can recover). A non-retryable state (forbidden/notEnabled/disabled) must
  // SUPPRESS the grid — no stale rows / export / bulk-actions under "no access"
  // (Codex P1-3); those states offer no retry, so unmounting dead-ends nothing.
  const showGrid = loadErrorKind === undefined || RETRYABLE_KINDS.has(loadErrorKind);

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
        field: 'active_user',
        headerName: t('endpointAdmin.devices.col.activeUser'),
        minWidth: 160,
        filter: 'agTextColumnFilter',
        valueFormatter: (p) => (p.value ? String(p.value) : '—'),
      },
      {
        field: 'domain_name',
        headerName: t('endpointAdmin.devices.col.domain'),
        minWidth: 140,
        filter: 'agTextColumnFilter',
        // Faz 22.5 #517: surfaced by default + text-filterable so operators
        // can filter the device fleet cross-machine by AD domain. Backed by
        // the endpoint_devices.domain_name filter cache (inventory-projected
        // server-side; see platform-backend #519).
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
        // Default ACTIVE status floor: when the operator has set no explicit
        // Durum (status) filter, hide DECOMMISSIONED ("Pasif") devices. Enforced
        // here (not onGridReady) so the variant system can't clobber it; a
        // quickFilter text search stays within the default view (status is a
        // separate filterModel key). Codex 019ea960 AGREE Option A.
        const effectiveFilterModel = withDefaultStatusFilter(
          (req.filterModel as Record<string, unknown>) ?? {},
          preset.initialFilterModel?.status,
        );
        try {
          const response = await queryDevices({
            startRow: req.startRow ?? 0,
            endRow: req.endRow ?? 100,
            filterModel: effectiveFilterModel,
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
    [preset.initialFilterModel],
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
      // VIEW export must carry the SAME default-active status floor as the live
      // grid (Codex 019ea960 REVISE): otherwise a saved variant with an empty
      // `{}` filterModel hides DECOMMISSIONED on screen (datasource floor) but a
      // "view export" with no status filter would re-include them — breaking the
      // "export the visible view" contract. RAW export is unaffected (ships every
      // canonical row regardless of filter).
      const viewFilterModel = isView
        ? withDefaultStatusFilter(params.filterModel ?? {}, preset.initialFilterModel?.status)
        : undefined;
      const args: DeviceGridExportArgs = {
        format: format === 'excel' ? 'xlsx' : 'csv',
        exportMode,
        filterModel: viewFilterModel,
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
    [t, preset.initialFilterModel],
  );

  const gridOptions = React.useMemo<GridOptions<DeviceGridRow>>(
    () => ({
      multiSortKey: 'ctrl' as const,
      // Stable row identity so grid selection survives SSRM block reloads and
      // refreshServerSide({ purge }) (Codex 019ea756 selection-scope hardening).
      getRowId: (params) => params.data.device_id,
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

  const onGridReady = React.useCallback((event: GridReadyEvent<DeviceGridRow>) => {
    gridApiRef.current = event.api;
    // The default ACTIVE status floor is NOT applied here: the EntityGridTemplate
    // variant system owns the live filterModel and clobbers any onGridReady
    // setFilterModel (a saved variant with an empty `{}` filter re-shows
    // DECOMMISSIONED). It is enforced at the SSRM datasource layer instead — see
    // `withDefaultStatusFilter` + createServerSideDatasource (Codex 019ea960).
  }, []);

  const getSelectedDevices = React.useCallback((): BulkSelectableDevice[] => {
    const rows = gridApiRef.current?.getSelectedRows() ?? [];
    return rows
      .filter((r): r is DeviceGridRow => typeof r?.device_id === 'string')
      .map((r) => ({
        device_id: r.device_id,
        hostname: r.hostname,
        status: r.status as DeviceStatus,
      }));
  }, []);

  const refreshGrid = React.useCallback(() => {
    gridApiRef.current?.refreshServerSide({ purge: true });
  }, []);

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
      {bulkNotice ? (
        <p
          role="status"
          aria-live="polite"
          data-testid="bulk-notice"
          style={{
            marginTop: 12,
            fontSize: 13,
            color:
              bulkNotice.kind === 'error'
                ? 'var(--danger-color)'
                : bulkNotice.kind === 'success'
                  ? 'var(--state-success-text, #027a48)'
                  : 'var(--text-secondary)',
          }}
        >
          {bulkNotice.message}
        </p>
      ) : null}
      {loadErrorKind ? (
        <CapabilityState kind={loadErrorKind} onRetry={refreshGrid} testId="devices-load-state" />
      ) : null}
      {showGrid ? (
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
              exportLeadingExtras={
                <DeviceBulkActionsMenu
                  getSelectedDevices={getSelectedDevices}
                  onNotice={(message, kind) => setBulkNotice({ message, kind })}
                  onAfterRun={refreshGrid}
                />
              }
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
      ) : null}
      {/* Gate the detail drawer on the SAME non-retryable suppression as the grid:
          a forbidden/notEnabled/disabled load error must not leave a cached device
          drawer (its inventory/compliance/audit tabs + command-mutation surface +
          polling) open under "no access" (Codex S4a P1-3 follow-up). */}
      {showGrid ? (
        <DeviceDetailDrawer
          open={selectedDevice != null}
          device={selectedDevice ?? null}
          onClose={() => setSelectedDeviceId(null)}
        />
      ) : null}
    </section>
  );
};

export default EndpointDevicesPage;
