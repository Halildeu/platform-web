import React from 'react';
// WEB-014D perf follow-up: pull EntityGridTemplate from the
// `advanced/data-grid` subpath instead of the design-system barrel.
// The barrel re-exports `./charts` which transitively imports ECharts
// + @mfe/x-charts — none of which the devices grid needs at runtime
// (Codex 019e707e iter-2 must-fix #1).
import { EntityGridTemplate } from '@mfe/design-system/advanced/data-grid';
import type { ColDef, GridOptions } from 'ag-grid-community';
import { useListEndpointDevicesQuery } from '../../app/services/endpointAdminApi';
import { useEndpointAdminI18n } from '../../i18n';
import type { DeviceStatus, EndpointDevice, OsType } from '../../entities/endpoint-device/types';
import { DeviceDetailDrawer } from '../../widgets/device-detail-drawer';
import { InventoryExportButton } from '../../widgets/inventory-export/InventoryExportButton';
import { buildDeviceInventoryColumns } from '../../widgets/inventory-export/deviceInventoryColumns';

/**
 * Devices surface — backed by `AdminEndpointDeviceController.listDevices`.
 *
 * Faz 22.2: upgraded from a plain HTML table to `EntityGridTemplate`
 * (AG Grid v34.3.1) to bring the platform grid contract — column
 * filter/sort/group, density toggle, export (CSV/Excel), quick filter,
 * variant integration. Row click opens a bottom-sheet drawer (see
 * `widgets/device-detail-drawer/DeviceDetailDrawer.tsx`) with 4 tabs:
 * Detay, İşlemler, Audit Geçmişi, Inventory.
 *
 * Single-click row open (vs the platform `onRowDoubleClick` default in
 * RolesGrid) is intentional: bottom-sheet is mobile-first and tap-to-
 * open is the natural touch semantic. Guards on the click handler
 * prevent accidental drawer opens from button/checkbox/link clicks.
 *
 * Auth model: backend enforces JWT role + OpenFGA `module:endpoint-admin`
 * `can_view`. The shell-side `<ProtectedRoute requiredModule="ENDPOINT_ADMIN">`
 * gates the route entry; this page only differentiates the render-time
 * states (loading / error / empty / list).
 */

const STATUS_VARIANT_MAP: Record<DeviceStatus, string> = {
  PENDING_ENROLLMENT: 'var(--state-warning-text)',
  ONLINE: 'var(--state-success-text)',
  STALE: 'var(--state-warning-text)',
  OFFLINE: 'var(--text-secondary)',
  DECOMMISSIONED: 'var(--danger-color)',
};

const OS_LABEL: Record<OsType, string> = {
  WINDOWS: 'Windows',
  MACOS: 'macOS',
  LINUX: 'Linux',
  UNKNOWN: '—',
};

const formatTimestamp = (value: string | null): string => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
};

const GRID_ID = 'endpoint-admin-devices';
const GRID_SCHEMA_VERSION = 1;

export const EndpointDevicesPage: React.FC = () => {
  const { t } = useEndpointAdminI18n();
  const { data, isLoading, isError, error } = useListEndpointDevicesQuery();
  const [selectedDeviceId, setSelectedDeviceId] = React.useState<string | null>(null);

  const rows = React.useMemo<EndpointDevice[]>(() => data ?? [], [data]);

  // WEB-015 — localised status label, shared between the grid cell
  // renderer and the CSV export column set so the exported value matches
  // exactly what the operator sees on screen.
  const statusLabel = React.useCallback(
    (status: DeviceStatus) => t(`endpointAdmin.devices.status.${status}`),
    [t],
  );

  // WEB-015 — CSV export columns (only already-fetched inventory fields;
  // no v2 device-health / diagnostics columns).
  const exportColumns = React.useMemo(
    () => buildDeviceInventoryColumns(t, statusLabel),
    [t, statusLabel],
  );

  // WEB-015 RBAC gate: there is no client-side capability list in this
  // MFE — `can_view` is enforced server-side via `@RequireModule`. We
  // derive the UI gate from the load outcome: a 403 means the operator
  // cannot view the inventory, so the export affordance is hidden.
  const forbidden =
    isError &&
    error &&
    'status' in error &&
    String((error as { status: unknown }).status) === '403';
  const canView = !forbidden;
  const selectedDevice = React.useMemo(
    () => rows.find((d) => d.id === selectedDeviceId) ?? null,
    [rows, selectedDeviceId],
  );

  const columnDefs = React.useMemo<ColDef<EndpointDevice>[]>(
    () => [
      {
        field: 'hostname',
        headerName: t('endpointAdmin.devices.col.hostname'),
        minWidth: 200,
        cellStyle: { fontFamily: 'monospace' },
        valueGetter: (params) => {
          const row = params.data;
          if (!row) return '';
          return row.displayName && row.displayName !== row.hostname
            ? `${row.hostname} (${row.displayName})`
            : row.hostname;
        },
      },
      {
        field: 'osType',
        headerName: t('endpointAdmin.devices.col.os'),
        minWidth: 160,
        valueGetter: (params) => {
          const row = params.data;
          if (!row) return '';
          const label = OS_LABEL[row.osType] ?? row.osType;
          return row.osVersion ? `${label} ${row.osVersion}` : label;
        },
      },
      {
        field: 'agentVersion',
        headerName: t('endpointAdmin.devices.col.agentVersion'),
        minWidth: 140,
        cellStyle: { fontFamily: 'monospace' },
        valueGetter: (params) => params.data?.agentVersion ?? '—',
      },
      {
        field: 'status',
        headerName: t('endpointAdmin.devices.col.status'),
        minWidth: 140,
        cellRenderer: (params: { value: DeviceStatus; data?: EndpointDevice }) => {
          const status = params.value;
          if (!status) return null;
          const color = STATUS_VARIANT_MAP[status] ?? 'var(--text-secondary)';
          return (
            <span data-testid={`device-status-${status}`} style={{ color, fontWeight: 500 }}>
              {t(`endpointAdmin.devices.status.${status}`)}
            </span>
          );
        },
      },
      {
        field: 'lastSeenAt',
        headerName: t('endpointAdmin.devices.col.lastSeenAt'),
        minWidth: 180,
        valueGetter: (params) => formatTimestamp(params.data?.lastSeenAt ?? null),
      },
    ],
    [t],
  );

  const gridOptions = React.useMemo<GridOptions<EndpointDevice>>(
    () => ({
      multiSortKey: 'ctrl' as const,
      onRowClicked: (event) => {
        const ev = event.event as MouseEvent | undefined;
        // Only the primary (left) mouse button opens the drawer.
        if (ev && ev.button !== undefined && ev.button !== 0) return;
        if (ev && ev.defaultPrevented) return;
        if (!event.data?.id) return;
        if (event.node.group) return;

        const target = (event.event?.target as HTMLElement | null) ?? null;
        if (target) {
          if (target.closest('button, a, input, select, textarea, [contenteditable="true"]')) {
            return;
          }
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

        setSelectedDeviceId(event.data.id);
      },
    }),
    [],
  );

  if (isLoading) {
    return (
      <section aria-busy="true" style={{ padding: 24 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
          {t('endpointAdmin.devices.heading')}
        </h2>
        <p style={{ marginTop: 12, color: 'var(--text-secondary)' }}>
          {t('endpointAdmin.devices.loading')}
        </p>
      </section>
    );
  }

  if (isError) {
    const status = error && 'status' in error ? String((error as { status: unknown }).status) : '';
    const isForbidden = status === '403';
    return (
      <section role="alert" aria-live="polite" style={{ padding: 24 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
          {t('endpointAdmin.devices.heading')}
        </h2>
        <p style={{ marginTop: 12, color: 'var(--danger-color)' }}>
          {isForbidden ? t('endpointAdmin.devices.forbidden') : t('endpointAdmin.devices.error')}
          {status ? ` (HTTP ${status})` : null}
        </p>
      </section>
    );
  }

  if (rows.length === 0) {
    return (
      <section style={{ padding: 24 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
          {t('endpointAdmin.devices.heading')}
        </h2>
        <p style={{ marginTop: 12, color: 'var(--text-secondary)' }}>
          {t('endpointAdmin.devices.empty')}
        </p>
      </section>
    );
  }

  return (
    <section style={{ padding: 24 }} data-testid="endpoint-admin-devices-page">
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
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            {t('endpointAdmin.devices.heading')}
          </h2>
          <p style={{ marginTop: 4, color: 'var(--text-secondary)', fontSize: 13 }}>
            {t('endpointAdmin.devices.countLabel')}: {rows.length}
          </p>
        </div>
        {/* WEB-015 — RBAC-gated CSV export of the current device inventory. */}
        <InventoryExportButton<EndpointDevice>
          canView={canView}
          rows={rows}
          columns={exportColumns}
          fileBaseName="endpoint-inventory"
        />
      </div>
      <div style={{ marginTop: 16, height: 'calc(100vh - 200px)', minHeight: 400 }}>
        <React.Suspense fallback={<div style={{ height: 400 }} />}>
          <EntityGridTemplate<EndpointDevice>
            gridId={GRID_ID}
            gridSchemaVersion={GRID_SCHEMA_VERSION}
            columnDefs={columnDefs}
            gridOptions={gridOptions}
            dataSourceMode="client"
            rowData={rows}
            total={rows.length}
            themeLabel="Tema"
            quickFilterLabel="Hızlı Filtre"
            quickFilterPlaceholder="Hostname, durum, ajan sürümü…"
            resetFiltersLabel="Filtreleri Temizle"
          />
        </React.Suspense>
      </div>
      <DeviceDetailDrawer
        open={selectedDevice !== null}
        device={selectedDevice}
        onClose={() => setSelectedDeviceId(null)}
      />
    </section>
  );
};

export default EndpointDevicesPage;
