/**
 * WEB-015 v1 — Device inventory CSV column set.
 *
 * STRICT SCOPE v1 (Codex guardrail): only fields already present on the
 * `EndpointDevice` DTO (i.e. data already fetched via
 * `useListEndpointDevicesQuery`). No AG-033 / AG-036 / AG-038 device
 * health / outdated / diagnostics columns — those are WEB-015 v2, gated
 * on later backend APIs. Keeping the column accessor pure means the same
 * rows the grid shows are exactly what the CSV serialises.
 */

import type { EndpointDevice, OsType } from '../../entities/endpoint-device/types';
import type { CsvColumn } from '../../lib/csv-export';

const OS_LABEL: Record<OsType, string> = {
  WINDOWS: 'Windows',
  MACOS: 'macOS',
  LINUX: 'Linux',
  UNKNOWN: '—',
};

/**
 * Render an ISO timestamp into a locale string for the CSV cell, leaving
 * blanks for null and passing through any unparseable value verbatim so
 * we never silently drop data.
 */
function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

/**
 * Build the localised CSV column set. `t` is the endpoint-admin i18n
 * `t(key)` accessor; `statusLabel` maps a {@link EndpointDevice.status}
 * enum to its localised badge text (the page already owns that mapping).
 */
export function buildDeviceInventoryColumns(
  t: (key: string) => string,
  statusLabel: (status: EndpointDevice['status']) => string,
): CsvColumn<EndpointDevice>[] {
  return [
    { key: 'hostname', header: t('endpointAdmin.devices.col.hostname'), value: (d) => d.hostname },
    {
      key: 'displayName',
      header: t('endpointAdmin.drawer.detay.displayName'),
      value: (d) => d.displayName,
    },
    {
      key: 'osType',
      header: t('endpointAdmin.devices.col.os'),
      value: (d) => OS_LABEL[d.osType] ?? d.osType,
    },
    {
      key: 'osVersion',
      header: t('endpointAdmin.drawer.detay.osVersion'),
      value: (d) => d.osVersion,
    },
    {
      key: 'agentVersion',
      header: t('endpointAdmin.devices.col.agentVersion'),
      value: (d) => d.agentVersion,
    },
    {
      key: 'status',
      header: t('endpointAdmin.devices.col.status'),
      value: (d) => statusLabel(d.status),
    },
    {
      key: 'domainName',
      header: t('endpointAdmin.drawer.detay.domainName'),
      value: (d) => d.domainName,
    },
    {
      key: 'lastSeenAt',
      header: t('endpointAdmin.devices.col.lastSeenAt'),
      value: (d) => formatTimestamp(d.lastSeenAt),
    },
    {
      key: 'enrolledAt',
      header: t('endpointAdmin.drawer.detay.enrolledAt'),
      value: (d) => formatTimestamp(d.enrolledAt),
    },
    {
      key: 'createdAt',
      header: t('endpointAdmin.drawer.detay.createdAt'),
      value: (d) => formatTimestamp(d.createdAt),
    },
    {
      key: 'updatedAt',
      header: t('endpointAdmin.drawer.detay.updatedAt'),
      value: (d) => formatTimestamp(d.updatedAt),
    },
  ];
}
