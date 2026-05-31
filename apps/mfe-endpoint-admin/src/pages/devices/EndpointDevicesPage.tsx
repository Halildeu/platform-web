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
const GRID_SCHEMA_VERSION = 2; // bumped: server-mode flat colId schema

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

export const EndpointDevicesPage: React.FC = () => {
  const { t } = useEndpointAdminI18n();
  const gridApiRef = React.useRef<GridApi<DeviceGridRow> | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = React.useState<string | null>(null);
  const [loadError, setLoadError] = React.useState<DeviceGridExportError | null>(null);
  const [exportNotice, setExportNotice] = React.useState<string | null>(null);

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
    ];
    // Flat-only server grid: the /query datasource sends no
    // rowGroupCols/pivot/valueCols, so grouping/pivot/aggregation MUST be
    // disabled per-column — otherwise the toolbar QuickGroupMenu (which
    // filters on `enableRowGroup !== false`) + the row-group panel would let
    // the user enter SSRM grouping mode against a flat backend and break
    // (Codex 019e7f89). Per-column false also wins over GridShell's
    // enableRowGroup:true default.
    return cols.map((c) => ({
      enableRowGroup: false,
      enablePivot: false,
      enableValue: false,
      ...c,
    }));
  }, [t, statusLabel]);

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
      fileBaseName: 'endpoint-devices',
      sheetName: 'Cihazlar',
      csvColumnSeparator: ';',
      csvBom: true,
    }),
    [],
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

  const onGridReady = React.useCallback((event: GridReadyEvent<DeviceGridRow>) => {
    gridApiRef.current = event.api;
  }, []);

  if (forbidden) {
    return (
      <section role="alert" aria-live="polite" style={{ padding: 24 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
          {t('endpointAdmin.devices.heading')}
        </h2>
        <p style={{ marginTop: 12, color: 'var(--danger-color)' }}>
          {t('endpointAdmin.devices.forbidden')} (HTTP 403)
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
            {t('endpointAdmin.devices.subtitle')}
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
            gridId={GRID_ID}
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
            quickFilterPlaceholder="Hostname, durum, ajan sürümü…"
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
