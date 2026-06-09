import React from 'react';
import type { EndpointDevice } from '../../../entities/endpoint-device/types';
import { useEndpointAdminI18n } from '../../../i18n';

export interface DetayTabProps {
  device: EndpointDevice;
}

function formatTimestamp(value: string | null): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

const STATUS_TOKEN: Record<string, string> = {
  ONLINE: 'var(--state-success-text)',
  STALE: 'var(--state-warning-text)',
  OFFLINE: 'var(--text-tertiary)',
  PENDING_ENROLLMENT: 'var(--state-info-text)',
  DECOMMISSIONED: 'var(--danger-color)',
};

const Row: React.FC<{ label: string; value: React.ReactNode; testId?: string }> = ({
  label,
  value,
  testId,
}) => (
  <div className="grid grid-cols-[160px_1fr] gap-3 py-1 text-sm" data-testid={testId}>
    <dt className="text-text-secondary">{label}</dt>
    <dd className="text-text-primary break-all">{value ?? '—'}</dd>
  </div>
);

export const DetayTab: React.FC<DetayTabProps> = ({ device }) => {
  const { t } = useEndpointAdminI18n();
  const statusColor = STATUS_TOKEN[device.status] ?? 'var(--text-secondary)';
  const statusLabel = t(`endpointAdmin.devices.status.${device.status}`);

  return (
    <dl className="px-6 py-4" data-testid="device-detay-tab">
      <Row
        label={t('endpointAdmin.drawer.detay.hostname')}
        value={<span className="font-mono">{device.hostname}</span>}
        testId="detay-hostname"
      />
      <Row
        label={t('endpointAdmin.drawer.detay.displayName')}
        value={device.displayName ?? '—'}
        testId="detay-displayname"
      />
      <Row
        label={t('endpointAdmin.drawer.detay.status')}
        value={
          <span style={{ color: statusColor, fontWeight: 500 }} data-testid="detay-status">
            {statusLabel}
          </span>
        }
      />
      <Row
        label={t('endpointAdmin.drawer.detay.osType')}
        value={device.osType}
        testId="detay-ostype"
      />
      <Row
        label={t('endpointAdmin.drawer.detay.osVersion')}
        value={device.osVersion}
        testId="detay-osversion"
      />
      <Row
        label={t('endpointAdmin.drawer.detay.agentVersion')}
        value={device.agentVersion ? <span className="font-mono">{device.agentVersion}</span> : '—'}
        testId="detay-agentversion"
      />
      <Row
        label={t('endpointAdmin.drawer.detay.activeUser')}
        value={device.activeUser ? <span className="font-mono">{device.activeUser}</span> : '—'}
        testId="detay-activeuser"
      />
      <Row
        label={t('endpointAdmin.drawer.detay.deviceId')}
        value={<span className="font-mono text-xs">{device.id}</span>}
        testId="detay-deviceid"
      />
      <Row
        label={t('endpointAdmin.drawer.detay.tenantId')}
        value={<span className="font-mono text-xs">{device.tenantId}</span>}
      />
      <Row
        label={t('endpointAdmin.drawer.detay.machineFingerprint')}
        value={
          device.machineFingerprint ? (
            <span className="font-mono text-xs">{device.machineFingerprint}</span>
          ) : (
            '—'
          )
        }
      />
      <Row
        label={t('endpointAdmin.drawer.detay.enrolledAt')}
        value={formatTimestamp(device.enrolledAt)}
      />
      <Row
        label={t('endpointAdmin.drawer.detay.lastSeenAt')}
        value={formatTimestamp(device.lastSeenAt)}
        testId="detay-lastseen"
      />
      <Row
        label={t('endpointAdmin.drawer.detay.createdAt')}
        value={formatTimestamp(device.createdAt)}
      />
      <Row
        label={t('endpointAdmin.drawer.detay.updatedAt')}
        value={formatTimestamp(device.updatedAt)}
      />
    </dl>
  );
};

DetayTab.displayName = 'DetayTab';
