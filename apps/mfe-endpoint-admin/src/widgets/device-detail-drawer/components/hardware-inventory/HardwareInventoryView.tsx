import React from 'react';

import { endpointAdminApi } from '../../../../app/services/endpointAdminApi';
import type {
  HardwareInventoryDisk,
  HardwareInventoryNetworkInterface,
  HardwareInventoryProbeError,
  HardwareInventorySnapshot,
} from '../../../../entities/endpoint-hardware-inventory/types';
import { useEndpointAdminI18n } from '../../../../i18n';

/**
 * WEB-013 — Hardware inventory view (Faz 22.5.2 / 22.5.5 frontend
 * closure). Codex 019e70ce plan-time PARTIAL AGREE absorb.
 *
 * Read-only hardware snapshot for the selected device. Backend
 * surface lives at gateway-external path
 *   /api/v1/endpoint-admin/endpoint-devices/{deviceId}/hardware-inventory/latest
 * which BE-022Q's controller wires to the service-internal route.
 *
 * 404 is the canonical "no hardware snapshot ingested yet" empty
 * state (matches the WEB-011 software-inventory pattern). 403 is
 * surfaced as a dedicated forbidden message because the same
 * {@code module:endpoint-admin} {@code can_view} relation that opens
 * the software view also opens the hardware view — a 403 here means
 * the operator lost the RBAC tuple, not that hardware is somehow
 * blocked.
 *
 * COLLECT_INVENTORY trigger lives in the İşlemler tab — this view
 * deliberately does not expose a button (Codex must-fix #4 scope
 * boundary).
 */
export interface HardwareInventoryViewProps {
  deviceId: string;
  active: boolean;
}

const HISTORY_PAGE_SIZE = 20;

function formatBytes(value: number | null | undefined): string {
  if (value == null) return '—';
  if (value < 1024) return `${value} B`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB'];
  let v = value / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function or(value: string | null | undefined, fallback = '—'): string {
  return value && value.trim() ? value : fallback;
}

export const HardwareInventoryView: React.FC<HardwareInventoryViewProps> = ({
  deviceId,
  active,
}) => {
  const { t } = useEndpointAdminI18n();
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [historyPage, setHistoryPage] = React.useState(0);

  // Codex must-fix #6: device change must reset history open + page so
  // the previous device's page does not bleed across into the new view.
  const previousDeviceIdRef = React.useRef(deviceId);
  if (previousDeviceIdRef.current !== deviceId) {
    previousDeviceIdRef.current = deviceId;
    setHistoryOpen(false);
    setHistoryPage(0);
  }

  const latestResult = endpointAdminApi.useGetDeviceHardwareInventoryLatestQuery(
    { deviceId },
    { skip: !active },
  );

  // Codex must-fix: history lazy. Only subscribe when the accordion is
  // open AND the tab is active — mirrors the ComplianceTab history
  // pattern.
  const historyResult = endpointAdminApi.useGetDeviceHardwareInventoryHistoryQuery(
    { deviceId, page: historyPage, size: HISTORY_PAGE_SIZE },
    { skip: !active || !historyOpen },
  );

  if (!active) {
    return null;
  }

  return (
    <div data-testid="hardware-inventory-view">
      <h3>{t('endpointAdmin.drawer.inventory.hardware.title')}</h3>

      {renderLatestState({
        isLoading: latestResult.isLoading,
        isError: latestResult.isError ?? false,
        error: latestResult.error,
        // Codex 019e70ce post-impl iter-1 P1: use currentData (the
        // result for the active arg) instead of data (the last
        // successful result, which can belong to a previous deviceId
        // during refetch). Plus an explicit deviceId guard so a stale
        // snapshot for the previous device cannot render under the
        // new drawer header.
        snapshot:
          latestResult.currentData && latestResult.currentData.deviceId === deviceId
            ? latestResult.currentData
            : null,
        deviceId,
        t,
        formatBytes,
        formatTimestamp,
      })}

      <section data-testid="hardware-history-section" style={{ marginTop: 24 }}>
        <details
          open={historyOpen}
          onToggle={(event) => {
            const target = event.target as HTMLDetailsElement;
            setHistoryOpen(target.open);
          }}
        >
          <summary data-testid="hardware-history-summary">
            {t('endpointAdmin.drawer.inventory.hardware.history.title')}
          </summary>
          {historyOpen && historyResult.isLoading && (
            <p data-testid="hardware-history-loading">
              {t('endpointAdmin.drawer.inventory.loading')}
            </p>
          )}
          {historyOpen && historyResult.isError && (
            <p data-testid="hardware-history-error">{t('endpointAdmin.drawer.inventory.error')}</p>
          )}
          {historyOpen && historyResult.currentData && (
            <HardwareHistoryPage
              // Codex iter-1 P2: bind the page indicator to the
              // response's own page.number so a stale page slice
              // does not render under the wrong index.
              page={historyResult.currentData}
              onPageChange={setHistoryPage}
              formatTimestamp={formatTimestamp}
            />
          )}
        </details>
      </section>
    </div>
  );
};

interface RenderLatestArgs {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  snapshot: HardwareInventorySnapshot | null;
  deviceId: string;
  t: (key: string) => string;
  formatBytes: (n: number | null | undefined) => string;
  formatTimestamp: (s: string | null | undefined) => string;
}

/**
 * Codex 019e70ce post-impl iter-1 P1 absorb — render the latest
 * snapshot state with strict precedence so error / empty / forbidden
 * branches cannot co-exist with a stale snapshot panel.
 *
 * Precedence: loading -> error class -> snapshot (only if it belongs
 * to the active deviceId). The caller passes the deviceId-guarded
 * snapshot (currentData with a deviceId check), so when the operator
 * switches device the new drawer renders the empty / forbidden /
 * loading branch — never the previous device's data.
 */
function renderLatestState(args: RenderLatestArgs): React.ReactNode {
  const { isLoading, isError, error, snapshot, t, formatBytes, formatTimestamp } = args;
  if (isLoading) {
    return <p data-testid="hardware-loading">{t('endpointAdmin.drawer.inventory.loading')}</p>;
  }
  if (isError) {
    const status = resolveStatus(error);
    if (status === 404) {
      return (
        <p data-testid="hardware-empty">{t('endpointAdmin.drawer.inventory.hardware.empty')}</p>
      );
    }
    if (status === 403) {
      return (
        <p data-testid="hardware-forbidden">{t('endpointAdmin.drawer.inventory.forbidden')}</p>
      );
    }
    return <p data-testid="hardware-error">{t('endpointAdmin.drawer.inventory.error')}</p>;
  }
  if (snapshot) {
    return (
      <HardwareSnapshotPanel
        snapshot={snapshot}
        formatBytes={formatBytes}
        formatTimestamp={formatTimestamp}
      />
    );
  }
  return null;
}

interface HardwareSnapshotPanelProps {
  snapshot: HardwareInventorySnapshot;
  formatBytes: (n: number | null | undefined) => string;
  formatTimestamp: (s: string | null | undefined) => string;
}

const HardwareSnapshotPanel: React.FC<HardwareSnapshotPanelProps> = ({
  snapshot,
  formatBytes,
  formatTimestamp,
}) => {
  const { t } = useEndpointAdminI18n();
  return (
    <div data-testid="hardware-snapshot-panel">
      <dl
        data-testid="hardware-summary-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          rowGap: 4,
          columnGap: 12,
        }}
      >
        <dt>{t('endpointAdmin.drawer.inventory.hardware.summary.cpu')}</dt>
        <dd>
          {or(snapshot.cpuModel)} ({snapshot.cpuCores ?? '—'} cores,{' '}
          {snapshot.cpuFrequencyMhz ?? '—'} MHz)
        </dd>
        <dt>{t('endpointAdmin.drawer.inventory.hardware.summary.ram')}</dt>
        <dd>
          {formatBytes(snapshot.ramTotalBytes)} ({formatBytes(snapshot.ramAvailableBytes)} free)
        </dd>
        <dt>{t('endpointAdmin.drawer.inventory.hardware.summary.os')}</dt>
        <dd>
          {or(snapshot.osName)} {or(snapshot.osVersion)} ({or(snapshot.osArch)})
        </dd>
        <dt>{t('endpointAdmin.drawer.inventory.hardware.summary.bios')}</dt>
        <dd>
          {or(snapshot.biosVendor)} {or(snapshot.biosVersion)}
        </dd>
        <dt>{t('endpointAdmin.drawer.inventory.hardware.summary.manufacturer')}</dt>
        <dd>
          {or(snapshot.manufacturer)} {or(snapshot.systemModel)}
        </dd>
        <dt>{t('endpointAdmin.drawer.inventory.hardware.summary.domain')}</dt>
        <dd>
          {/* Codex iter-1 P2: tri-state. null is unknown, not workgroup. */}
          {snapshot.domainJoined === true
            ? or(snapshot.domainName)
            : snapshot.domainJoined === false
              ? t('endpointAdmin.drawer.inventory.hardware.summary.workgroup')
              : '—'}
        </dd>
        <dt>{t('endpointAdmin.drawer.inventory.hardware.summary.lastBoot')}</dt>
        <dd>{formatTimestamp(snapshot.lastBootAt)}</dd>
        <dt>{t('endpointAdmin.drawer.inventory.hardware.summary.collectedAt')}</dt>
        <dd>{formatTimestamp(snapshot.collectedAt)}</dd>
      </dl>

      <HardwareDisksList disks={snapshot.disks} formatBytes={formatBytes} />
      <HardwareNetworkInterfacesList interfaces={snapshot.networkInterfaces} />

      {snapshot.probeErrors.length > 0 && <HardwareProbeErrorsList errors={snapshot.probeErrors} />}
    </div>
  );
};

interface HardwareDisksListProps {
  disks: HardwareInventoryDisk[];
  formatBytes: (n: number | null | undefined) => string;
}

const HardwareDisksList: React.FC<HardwareDisksListProps> = ({ disks, formatBytes }) => {
  const { t } = useEndpointAdminI18n();
  if (disks.length === 0) {
    return (
      <p data-testid="hardware-disks-empty">
        {t('endpointAdmin.drawer.inventory.hardware.disks.empty')}
      </p>
    );
  }
  return (
    <section data-testid="hardware-disks-section" style={{ marginTop: 16 }}>
      <h4>{t('endpointAdmin.drawer.inventory.hardware.disks.title')}</h4>
      <table data-testid="hardware-disks-table">
        <thead>
          <tr>
            <th>{t('endpointAdmin.drawer.inventory.hardware.disks.columns.devicePath')}</th>
            <th>{t('endpointAdmin.drawer.inventory.hardware.disks.columns.model')}</th>
            <th>{t('endpointAdmin.drawer.inventory.hardware.disks.columns.mediaType')}</th>
            <th>{t('endpointAdmin.drawer.inventory.hardware.disks.columns.busType')}</th>
            <th>{t('endpointAdmin.drawer.inventory.hardware.disks.columns.capacity')}</th>
            <th>{t('endpointAdmin.drawer.inventory.hardware.disks.columns.free')}</th>
            <th>{t('endpointAdmin.drawer.inventory.hardware.disks.columns.removable')}</th>
          </tr>
        </thead>
        <tbody>
          {disks.map((disk, index) => (
            <tr key={`${disk.devicePath ?? 'disk'}-${index}`}>
              <td>{or(disk.devicePath)}</td>
              <td>{or(disk.model)}</td>
              <td>{or(disk.mediaType, 'UNKNOWN')}</td>
              <td>{or(disk.busType, 'UNKNOWN')}</td>
              <td>{formatBytes(disk.capacityBytes)}</td>
              <td>{formatBytes(disk.freeBytes)}</td>
              <td>{disk.removable == null ? '—' : disk.removable ? '✓' : '✗'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};

interface HardwareNetworkInterfacesListProps {
  interfaces: HardwareInventoryNetworkInterface[];
}

const HardwareNetworkInterfacesList: React.FC<HardwareNetworkInterfacesListProps> = ({
  interfaces,
}) => {
  const { t } = useEndpointAdminI18n();
  if (interfaces.length === 0) {
    return (
      <p data-testid="hardware-nics-empty">
        {t('endpointAdmin.drawer.inventory.hardware.nics.empty')}
      </p>
    );
  }
  return (
    <section data-testid="hardware-nics-section" style={{ marginTop: 16 }}>
      <h4>{t('endpointAdmin.drawer.inventory.hardware.nics.title')}</h4>
      <table data-testid="hardware-nics-table">
        <thead>
          <tr>
            <th>{t('endpointAdmin.drawer.inventory.hardware.nics.columns.name')}</th>
            <th>{t('endpointAdmin.drawer.inventory.hardware.nics.columns.mac')}</th>
            <th>{t('endpointAdmin.drawer.inventory.hardware.nics.columns.ips')}</th>
            <th>{t('endpointAdmin.drawer.inventory.hardware.nics.columns.type')}</th>
            <th>{t('endpointAdmin.drawer.inventory.hardware.nics.columns.linkState')}</th>
          </tr>
        </thead>
        <tbody>
          {interfaces.map((nic, index) => (
            <tr key={`${nic.macAddress ?? nic.name ?? 'nic'}-${index}`}>
              <td>{or(nic.name)}</td>
              <td>{or(nic.macAddress)}</td>
              <td style={{ wordBreak: 'break-all' }}>{nic.ipAddresses.join(', ') || '—'}</td>
              <td>{or(nic.interfaceType, 'UNKNOWN')}</td>
              <td>{or(nic.linkState, 'UNKNOWN')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};

interface HardwareProbeErrorsListProps {
  errors: HardwareInventoryProbeError[];
}

const HardwareProbeErrorsList: React.FC<HardwareProbeErrorsListProps> = ({ errors }) => {
  const { t } = useEndpointAdminI18n();
  return (
    <section data-testid="hardware-probe-errors-section" style={{ marginTop: 16 }}>
      <h4>{t('endpointAdmin.drawer.inventory.hardware.probeErrors.title')}</h4>
      <ul data-testid="hardware-probe-errors-list">
        {errors.map((error, index) => (
          <li key={`${error.code ?? 'error'}-${index}`}>
            <strong>{or(error.code, 'UNKNOWN_PROBE_ERROR')}</strong>
            {error.summary ? `: ${error.summary}` : ''}
          </li>
        ))}
      </ul>
    </section>
  );
};

interface HardwareHistoryPageProps {
  page: {
    content: ReadonlyArray<{
      id: string;
      collectedAt: string;
      cpuModel: string | null;
      ramTotalBytes: number | null;
      osName: string | null;
      osVersion: string | null;
      diskCount: number;
      networkInterfaceCount: number;
      probeErrorCount: number;
    }>;
    number: number;
    size: number;
    totalElements: number;
    totalPages: number;
    empty: boolean;
  };
  onPageChange: (page: number) => void;
  formatTimestamp: (s: string | null | undefined) => string;
}

const HardwareHistoryPage: React.FC<HardwareHistoryPageProps> = ({
  page,
  onPageChange,
  formatTimestamp,
}) => {
  // Codex 019e70ce iter-1 P2: bind the indicator to the response's
  // own page number rather than the local request state, so a stale
  // page slice cannot render under the wrong index while RTK Query
  // refetches.
  const currentPage = page.number;
  const { t } = useEndpointAdminI18n();
  if (page.empty) {
    return (
      <p data-testid="hardware-history-empty">
        {t('endpointAdmin.drawer.inventory.hardware.history.empty')}
      </p>
    );
  }
  return (
    <div data-testid="hardware-history-page">
      <ul data-testid="hardware-history-list">
        {page.content.map((row) => (
          <li key={row.id} data-testid={`hardware-history-row-${row.id}`}>
            <strong>{formatTimestamp(row.collectedAt)}</strong> — {row.cpuModel ?? '—'} (
            {row.diskCount} disks, {row.networkInterfaceCount} NICs, {row.probeErrorCount} probe
            errors)
          </li>
        ))}
      </ul>
      <div data-testid="hardware-history-pagination" style={{ marginTop: 8 }}>
        <button
          type="button"
          data-testid="hardware-history-prev"
          disabled={currentPage === 0}
          onClick={() => onPageChange(Math.max(0, currentPage - 1))}
        >
          {t('endpointAdmin.drawer.inventory.hardware.history.prev')}
        </button>
        <span data-testid="hardware-history-pageinfo" style={{ margin: '0 8px' }}>
          {t('endpointAdmin.drawer.inventory.hardware.history.pageInfo')}: {currentPage + 1} /{' '}
          {page.totalPages}
        </span>
        <button
          type="button"
          data-testid="hardware-history-next"
          disabled={currentPage + 1 >= page.totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          {t('endpointAdmin.drawer.inventory.hardware.history.next')}
        </button>
      </div>
    </div>
  );
};

function resolveStatus(error: unknown): number | null {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: unknown }).status;
    if (typeof status === 'number') return status;
    if (typeof status === 'string') {
      const parsed = Number(status);
      return Number.isFinite(parsed) ? parsed : null;
    }
  }
  return null;
}
