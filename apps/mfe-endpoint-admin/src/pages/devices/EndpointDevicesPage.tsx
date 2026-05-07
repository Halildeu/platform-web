import React from 'react';
import { useListEndpointDevicesQuery } from '../../app/services/endpointAdminApi';
import { useEndpointAdminI18n } from '../../i18n';
import type { DeviceStatus, OsType } from '../../entities/endpoint-device/types';

/**
 * Read-only devices surface — backed by `AdminEndpointDeviceController.listDevices`.
 *
 * FE-001 scope keeps the table flat: hostname, OS, agent version,
 * status, lastSeenAt. Filtering, drawer, mutations belong to FE-002+.
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

export const EndpointDevicesPage: React.FC = () => {
  const { t } = useEndpointAdminI18n();
  const { data, isLoading, isError, error } = useListEndpointDevicesQuery();

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

  const rows = data ?? [];
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
    <section style={{ padding: 24 }}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
        {t('endpointAdmin.devices.heading')}
      </h2>
      <p style={{ marginTop: 4, color: 'var(--text-secondary)', fontSize: 13 }}>
        {t('endpointAdmin.devices.countLabel')}: {rows.length}
      </p>
      <div
        role="region"
        aria-label={t('endpointAdmin.devices.heading')}
        style={{ marginTop: 16, overflowX: 'auto' }}
      >
        <table
          data-testid="endpoint-admin-devices-table"
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 13,
          }}
        >
          <thead>
            <tr
              style={{
                textAlign: 'left',
                color: 'var(--text-secondary)',
                borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              <th style={{ padding: '8px 12px' }}>{t('endpointAdmin.devices.col.hostname')}</th>
              <th style={{ padding: '8px 12px' }}>{t('endpointAdmin.devices.col.os')}</th>
              <th style={{ padding: '8px 12px' }}>{t('endpointAdmin.devices.col.agentVersion')}</th>
              <th style={{ padding: '8px 12px' }}>{t('endpointAdmin.devices.col.status')}</th>
              <th style={{ padding: '8px 12px' }}>{t('endpointAdmin.devices.col.lastSeenAt')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>
                  {row.hostname}
                  {row.displayName && row.displayName !== row.hostname ? (
                    <span
                      style={{
                        color: 'var(--text-secondary)',
                        marginLeft: 8,
                        fontFamily: 'inherit',
                      }}
                    >
                      ({row.displayName})
                    </span>
                  ) : null}
                </td>
                <td style={{ padding: '8px 12px' }}>
                  {OS_LABEL[row.osType] ?? row.osType}
                  {row.osVersion ? (
                    <span style={{ color: 'var(--text-secondary)', marginLeft: 6 }}>
                      {row.osVersion}
                    </span>
                  ) : null}
                </td>
                <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{row.agentVersion}</td>
                <td style={{ padding: '8px 12px' }}>
                  <span
                    data-testid={`device-status-${row.status}`}
                    style={{
                      color: STATUS_VARIANT_MAP[row.status],
                      fontWeight: 500,
                    }}
                  >
                    {t(`endpointAdmin.devices.status.${row.status}` as never)}
                  </span>
                </td>
                <td style={{ padding: '8px 12px' }}>{formatTimestamp(row.lastSeenAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default EndpointDevicesPage;
