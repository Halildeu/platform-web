import React from 'react';

import { endpointAdminApi } from '../../../../app/services/endpointAdminApi';
import type {
  DeviceHealthFixedDisk,
  DeviceHealthProbeError,
  DeviceHealthSnapshot,
} from '../../../../entities/endpoint-device-health/types';
import { useEndpointAdminI18n } from '../../../../i18n';

/**
 * WEB device-health view — Faz 22.5 second wave (AG-033 device
 * health). Mirrors the WEB-013 hardware-inventory view precedent
 * exactly (404 → empty state, currentData stale-guard, lazy history,
 * i18n via useEndpointAdminI18n).
 *
 * Read-only device-health surface for the selected device. Backend
 * lives at the gateway-external path
 *   /api/v1/endpoint-admin/endpoint-devices/{deviceId}/device-health/latest
 * which rewrites endpoint-admin→admin to the service-internal route.
 *
 * Render contract (from the wire contract
 *   schema/endpoint-device-health-payload-v1.schema.json):
 *  - per-disk free % + low-disk badge,
 *  - memory used % + high-pressure badge,
 *  - uptime + long-uptime badge.
 *
 * State precedence:
 *  - 403 → forbidden (lost the module:endpoint-admin can_view tuple),
 *  - 404 → empty ("no device-health snapshot ingested yet"),
 *  - other error → generic error,
 *  - supported=false → "probe not supported on this device",
 *  - probeComplete=false → "evidence incomplete" (fail-closed:
 *    NEVER render the zero-values as a healthy device).
 *
 * The COLLECT_INVENTORY trigger lives in the İşlemler tab — this view
 * deliberately does not expose a button (scope boundary mirrors the
 * WEB-013 hardware view).
 */
export interface DeviceHealthViewProps {
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

/** Unix-seconds → locale string. The wire carries epoch seconds only. */
function formatEpochSeconds(value: number | null | undefined): string {
  if (value == null || value <= 0) return '—';
  try {
    return new Date(value * 1000).toLocaleString();
  } catch {
    return String(value);
  }
}

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

export const DeviceHealthView: React.FC<DeviceHealthViewProps> = ({ deviceId, active }) => {
  const { t } = useEndpointAdminI18n();
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [historyPage, setHistoryPage] = React.useState(0);

  // Device change must reset history open + page so the previous
  // device's page does not bleed across into the new view (WEB-013
  // must-fix #6 precedent).
  const previousDeviceIdRef = React.useRef(deviceId);
  if (previousDeviceIdRef.current !== deviceId) {
    previousDeviceIdRef.current = deviceId;
    setHistoryOpen(false);
    setHistoryPage(0);
  }

  const latestResult = endpointAdminApi.useGetDeviceHealthLatestQuery(
    { deviceId },
    { skip: !active },
  );

  // History lazy: only subscribe when the accordion is open AND the
  // tab is active (WEB-013 history pattern).
  const historyResult = endpointAdminApi.useGetDeviceHealthHistoryQuery(
    { deviceId, page: historyPage, size: HISTORY_PAGE_SIZE },
    { skip: !active || !historyOpen },
  );

  if (!active) {
    return null;
  }

  return (
    <div data-testid="device-health-view">
      <h3>{t('endpointAdmin.drawer.deviceHealth.title')}</h3>

      {renderLatestState({
        isLoading: latestResult.isLoading,
        isError: latestResult.isError ?? false,
        error: latestResult.error,
        // WEB-013 stale-guard precedent: use currentData (the result
        // for the active arg) instead of data (the last successful
        // result, which can belong to a previous deviceId during a
        // refetch). Plus an explicit deviceId guard so a stale snapshot
        // for the previous device cannot render under the new drawer
        // header. The guard tolerates a snapshot without a deviceId
        // envelope field (golden-example verbatim) — only a non-null
        // deviceId that mismatches is rejected.
        snapshot:
          latestResult.currentData &&
          (latestResult.currentData.deviceId == null ||
            latestResult.currentData.deviceId === deviceId)
            ? latestResult.currentData
            : null,
        t,
      })}

      <section data-testid="device-health-history-section" style={{ marginTop: 24 }}>
        <details
          open={historyOpen}
          onToggle={(event) => {
            const target = event.target as HTMLDetailsElement;
            setHistoryOpen(target.open);
          }}
        >
          <summary data-testid="device-health-history-summary">
            {t('endpointAdmin.drawer.deviceHealth.history.title')}
          </summary>
          {historyOpen && historyResult.isLoading && (
            <p data-testid="device-health-history-loading">
              {t('endpointAdmin.drawer.deviceHealth.loading')}
            </p>
          )}
          {historyOpen && historyResult.isError && (
            <p data-testid="device-health-history-error">
              {t('endpointAdmin.drawer.deviceHealth.error')}
            </p>
          )}
          {historyOpen && historyResult.currentData && (
            <DeviceHealthHistoryPage
              page={historyResult.currentData}
              onPageChange={setHistoryPage}
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
  snapshot: DeviceHealthSnapshot | null;
  t: (key: string) => string;
}

/**
 * Strict precedence so error / empty / unsupported / incomplete
 * branches cannot co-exist with a stale snapshot panel.
 *
 * loading → error class → unsupported → incomplete → healthy panel.
 * The caller passes the deviceId-guarded snapshot, so on device switch
 * the new drawer renders the empty / forbidden / loading branch — never
 * the previous device's data.
 */
function renderLatestState(args: RenderLatestArgs): React.ReactNode {
  const { isLoading, isError, error, snapshot, t } = args;
  if (isLoading) {
    return (
      <p data-testid="device-health-loading">{t('endpointAdmin.drawer.deviceHealth.loading')}</p>
    );
  }
  if (isError) {
    const status = resolveStatus(error);
    if (status === 404) {
      return (
        <p data-testid="device-health-empty">{t('endpointAdmin.drawer.deviceHealth.empty')}</p>
      );
    }
    if (status === 403) {
      return (
        <p data-testid="device-health-forbidden">
          {t('endpointAdmin.drawer.deviceHealth.forbidden')}
        </p>
      );
    }
    return <p data-testid="device-health-error">{t('endpointAdmin.drawer.deviceHealth.error')}</p>;
  }
  if (snapshot) {
    // supported=false → probe not supported on this runtime.
    if (!snapshot.supported) {
      return (
        <div data-testid="device-health-unsupported">
          <p>{t('endpointAdmin.drawer.deviceHealth.unsupported')}</p>
          {snapshot.probeErrors && snapshot.probeErrors.length > 0 && (
            <DeviceHealthProbeErrorsList errors={snapshot.probeErrors} />
          )}
        </div>
      );
    }
    // probeComplete=false → evidence incomplete (fail-closed). Do NOT
    // render the (potentially degenerate) values as a healthy device.
    if (!snapshot.probeComplete) {
      return (
        <div data-testid="device-health-incomplete">
          <p>{t('endpointAdmin.drawer.deviceHealth.incomplete')}</p>
          {snapshot.probeErrors && snapshot.probeErrors.length > 0 && (
            <DeviceHealthProbeErrorsList errors={snapshot.probeErrors} />
          )}
        </div>
      );
    }
    return <DeviceHealthPanel snapshot={snapshot} />;
  }
  return null;
}

interface DeviceHealthPanelProps {
  snapshot: DeviceHealthSnapshot;
}

const DeviceHealthPanel: React.FC<DeviceHealthPanelProps> = ({ snapshot }) => {
  const { t } = useEndpointAdminI18n();
  const { memory, uptime } = snapshot;
  return (
    <div data-testid="device-health-panel">
      <DeviceHealthDisksList
        disks={snapshot.fixedDisks}
        truncated={snapshot.fixedDisksTruncated}
        fixedDiskCount={snapshot.fixedDiskCount}
        maxFixedDisks={snapshot.maxFixedDisks}
        anyLowDisk={snapshot.anyLowDisk}
      />

      <section data-testid="device-health-memory-section" style={{ marginTop: 16 }}>
        <h4>{t('endpointAdmin.drawer.deviceHealth.memory.title')}</h4>
        <dl
          data-testid="device-health-memory-grid"
          style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: 4, columnGap: 12 }}
        >
          <dt>{t('endpointAdmin.drawer.deviceHealth.memory.usedPercent')}</dt>
          <dd data-testid="device-health-memory-usedPercent">
            {memory.usedPercent}%
            {memory.highPressureWarning && (
              <span
                data-testid="device-health-memory-pressure-badge"
                style={{
                  marginLeft: 8,
                  padding: '1px 6px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  background: 'var(--color-danger-soft, #fde2e1)',
                  color: 'var(--color-danger-strong, #b42318)',
                }}
              >
                {t('endpointAdmin.drawer.deviceHealth.memory.highPressure')}
              </span>
            )}
          </dd>
          <dt>{t('endpointAdmin.drawer.deviceHealth.memory.total')}</dt>
          <dd>{formatBytes(memory.totalPhysicalBytes)}</dd>
          <dt>{t('endpointAdmin.drawer.deviceHealth.memory.available')}</dt>
          <dd>{formatBytes(memory.availableBytes)}</dd>
          <dt>{t('endpointAdmin.drawer.deviceHealth.memory.commit')}</dt>
          <dd>
            {formatBytes(memory.commitUsedBytes)} / {formatBytes(memory.commitLimitBytes)}
          </dd>
        </dl>
      </section>

      <section data-testid="device-health-uptime-section" style={{ marginTop: 16 }}>
        <h4>{t('endpointAdmin.drawer.deviceHealth.uptime.title')}</h4>
        <dl
          data-testid="device-health-uptime-grid"
          style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: 4, columnGap: 12 }}
        >
          <dt>{t('endpointAdmin.drawer.deviceHealth.uptime.days')}</dt>
          <dd data-testid="device-health-uptime-days">
            {uptime.uptimeDays}
            {uptime.longUptimeWarning && (
              <span
                data-testid="device-health-uptime-long-badge"
                style={{
                  marginLeft: 8,
                  padding: '1px 6px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  background: 'var(--color-warning-soft, #fef0c7)',
                  color: 'var(--color-warning-strong, #b54708)',
                }}
              >
                {t('endpointAdmin.drawer.deviceHealth.uptime.longUptime')}
              </span>
            )}
          </dd>
          <dt>{t('endpointAdmin.drawer.deviceHealth.uptime.lastBoot')}</dt>
          <dd>{formatEpochSeconds(uptime.lastBootEpochSec)}</dd>
        </dl>
      </section>

      <DeviceHealthMetaRow snapshot={snapshot} />

      {snapshot.probeErrors && snapshot.probeErrors.length > 0 && (
        <DeviceHealthProbeErrorsList errors={snapshot.probeErrors} />
      )}
    </div>
  );
};

interface DeviceHealthDisksListProps {
  disks: DeviceHealthFixedDisk[];
  truncated: boolean;
  fixedDiskCount: number;
  maxFixedDisks: number;
  anyLowDisk: boolean;
}

const DeviceHealthDisksList: React.FC<DeviceHealthDisksListProps> = ({
  disks,
  truncated,
  fixedDiskCount,
  maxFixedDisks,
  anyLowDisk,
}) => {
  const { t } = useEndpointAdminI18n();
  return (
    <section data-testid="device-health-disks-section">
      <h4>
        {t('endpointAdmin.drawer.deviceHealth.disks.title')}
        {anyLowDisk && (
          <span
            data-testid="device-health-anyLowDisk-badge"
            style={{
              marginLeft: 8,
              padding: '1px 6px',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
              background: 'var(--color-danger-soft, #fde2e1)',
              color: 'var(--color-danger-strong, #b42318)',
            }}
          >
            {t('endpointAdmin.drawer.deviceHealth.disks.anyLowDisk')}
          </span>
        )}
      </h4>
      {disks.length === 0 ? (
        <p data-testid="device-health-disks-empty">
          {t('endpointAdmin.drawer.deviceHealth.disks.empty')}
        </p>
      ) : (
        <table data-testid="device-health-disks-table">
          <thead>
            <tr>
              <th>{t('endpointAdmin.drawer.deviceHealth.disks.columns.driveLetter')}</th>
              <th>{t('endpointAdmin.drawer.deviceHealth.disks.columns.freePercent')}</th>
              <th>{t('endpointAdmin.drawer.deviceHealth.disks.columns.free')}</th>
              <th>{t('endpointAdmin.drawer.deviceHealth.disks.columns.total')}</th>
              <th>{t('endpointAdmin.drawer.deviceHealth.disks.columns.status')}</th>
            </tr>
          </thead>
          <tbody>
            {disks.map((disk) => (
              <tr key={disk.driveLetter} data-testid={`device-health-disk-row-${disk.driveLetter}`}>
                <td>{disk.driveLetter}</td>
                <td data-testid={`device-health-disk-freePercent-${disk.driveLetter}`}>
                  {disk.freePercent}%
                </td>
                <td>{formatBytes(disk.freeBytes)}</td>
                <td>{formatBytes(disk.totalBytes)}</td>
                <td>
                  {disk.lowDiskWarning ? (
                    <span
                      data-testid={`device-health-disk-lowDisk-badge-${disk.driveLetter}`}
                      style={{
                        padding: '1px 6px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        background: 'var(--color-danger-soft, #fde2e1)',
                        color: 'var(--color-danger-strong, #b42318)',
                      }}
                    >
                      {t('endpointAdmin.drawer.deviceHealth.disks.lowDisk')}
                    </span>
                  ) : (
                    <span data-testid={`device-health-disk-ok-${disk.driveLetter}`}>
                      {t('endpointAdmin.drawer.deviceHealth.disks.ok')}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {truncated && (
        <p data-testid="device-health-disks-truncated" style={{ marginTop: 8, fontSize: 12 }}>
          {t('endpointAdmin.drawer.deviceHealth.disks.truncated')} ({fixedDiskCount} /{' '}
          {maxFixedDisks})
        </p>
      )}
    </section>
  );
};

interface DeviceHealthMetaRowProps {
  snapshot: DeviceHealthSnapshot;
}

const DeviceHealthMetaRow: React.FC<DeviceHealthMetaRowProps> = ({ snapshot }) => {
  const { t } = useEndpointAdminI18n();
  return (
    <dl
      data-testid="device-health-meta-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr',
        rowGap: 4,
        columnGap: 12,
        marginTop: 16,
      }}
    >
      <dt>{t('endpointAdmin.drawer.deviceHealth.meta.sourceUsed')}</dt>
      <dd data-testid="device-health-meta-sourceUsed">{snapshot.sourceUsed}</dd>
      <dt>{t('endpointAdmin.drawer.deviceHealth.meta.probeDuration')}</dt>
      <dd>{snapshot.probeDurationMs} ms</dd>
    </dl>
  );
};

interface DeviceHealthProbeErrorsListProps {
  errors: DeviceHealthProbeError[];
}

const DeviceHealthProbeErrorsList: React.FC<DeviceHealthProbeErrorsListProps> = ({ errors }) => {
  const { t } = useEndpointAdminI18n();
  return (
    <section data-testid="device-health-probe-errors-section" style={{ marginTop: 16 }}>
      <h4>{t('endpointAdmin.drawer.deviceHealth.probeErrors.title')}</h4>
      <ul data-testid="device-health-probe-errors-list">
        {errors.map((error, index) => (
          <li key={`${error.code}-${index}`}>
            <strong>{error.code}</strong>
            {error.summary ? `: ${error.summary}` : ''}
          </li>
        ))}
      </ul>
    </section>
  );
};

interface DeviceHealthHistoryPageProps {
  page: {
    content: ReadonlyArray<{
      id: string;
      collectedAt: string;
      supported: boolean;
      probeComplete: boolean;
      anyLowDisk: boolean;
      fixedDiskCount: number;
      memoryUsedPercent: number | null;
      memoryHighPressure: boolean;
      uptimeDays: number | null;
      longUptimeWarning: boolean;
    }>;
    number: number;
    size: number;
    totalElements: number;
    totalPages: number;
    empty: boolean;
  };
  onPageChange: (page: number) => void;
}

const DeviceHealthHistoryPage: React.FC<DeviceHealthHistoryPageProps> = ({
  page,
  onPageChange,
}) => {
  // Bind the indicator to the response's own page number (WEB-013
  // iter-1 P2) so a stale page slice cannot render under the wrong
  // index while RTK Query refetches.
  const currentPage = page.number;
  const { t } = useEndpointAdminI18n();
  if (page.empty) {
    return (
      <p data-testid="device-health-history-empty">
        {t('endpointAdmin.drawer.deviceHealth.history.empty')}
      </p>
    );
  }
  return (
    <div data-testid="device-health-history-page">
      <ul data-testid="device-health-history-list">
        {page.content.map((row) => (
          <li key={row.id} data-testid={`device-health-history-row-${row.id}`}>
            <strong>{formatEpochSecondsFromIso(row.collectedAt)}</strong> —{' '}
            {row.memoryUsedPercent == null ? '—' : `${row.memoryUsedPercent}%`}{' '}
            {t('endpointAdmin.drawer.deviceHealth.history.memShort')}, {row.fixedDiskCount}{' '}
            {t('endpointAdmin.drawer.deviceHealth.history.disksShort')}
            {row.anyLowDisk && ` · ${t('endpointAdmin.drawer.deviceHealth.disks.lowDisk')}`}
            {row.longUptimeWarning &&
              ` · ${t('endpointAdmin.drawer.deviceHealth.uptime.longUptime')}`}
          </li>
        ))}
      </ul>
      <div data-testid="device-health-history-pagination" style={{ marginTop: 8 }}>
        <button
          type="button"
          data-testid="device-health-history-prev"
          disabled={currentPage === 0}
          onClick={() => onPageChange(Math.max(0, currentPage - 1))}
        >
          {t('endpointAdmin.drawer.deviceHealth.history.prev')}
        </button>
        <span data-testid="device-health-history-pageinfo" style={{ margin: '0 8px' }}>
          {t('endpointAdmin.drawer.deviceHealth.history.pageInfo')}: {currentPage + 1} /{' '}
          {page.totalPages}
        </span>
        <button
          type="button"
          data-testid="device-health-history-next"
          disabled={currentPage + 1 >= page.totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          {t('endpointAdmin.drawer.deviceHealth.history.next')}
        </button>
      </div>
    </div>
  );
};

/** History `collectedAt` is a persistence ISO timestamp, not epoch. */
function formatEpochSecondsFromIso(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}
