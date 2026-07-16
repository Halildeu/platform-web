import React from 'react';

import {
  useGetComplianceGapQuery,
  useListEndpointDevicesQuery,
} from '../../app/services/endpointAdminApi';
import { useEndpointAdminI18n } from '../../i18n';
import type {
  ComplianceGapWire,
  DeviceComplianceGap,
  GapDetail,
} from '../../entities/endpoint-compliance-gap/types';
import type { EndpointDevice } from '../../entities/endpoint-device/types';
import { DeviceDetailDrawer } from '../../widgets/device-detail-drawer';
import {
  CapabilityState,
  classifyCapabilityError,
  FLEET_CAPABILITY_POLICY,
  RETRYABLE_KINDS,
} from '../../widgets/capability-state';

/**
 * Faz 22.7 D3 — Compliance Gap Mart explorer (Codex 019e88b0 D2 backend
 * AGREE + P1/P2/P2-low absorbed at backend layer).
 *
 * Backed by the Faz 22.7 D2 endpoint:
 *   gateway GET /api/v1/endpoint-admin/endpoint-devices/compliance-gap?
 *           gapTypes=...&freshnessWindow=...&page=&pageSize=
 *   → service /api/v1/admin/endpoint-devices/compliance-gap
 *   @RequireModule(ENDPOINT_ADMIN, VIEWER)
 *
 * Surfaces devices with at least one ACTIVE gap (rdp_enabled,
 * pending_security_updates) matching the requested gap-type filter,
 * within the freshness window. "Observed devices only" — devices with
 * zero contributing snapshots in the window are silently out-of-scope
 * (filterEcho displays the sample boundary).
 *
 * HARD RULE No Fake Work alignment: all aggregation is DB-side; this
 * page renders the response 1:1 without client-side reduce. Filtering
 * gap types client-side would silently break pagination totals (same
 * pattern as WEB-014B Codex 019e6db0 P2: server is authoritative for
 * filter+page+total).
 *
 * Row click → opens `DeviceDetailDrawer` with `initialTab="compliance"`
 * (same hydrate pattern as WEB-014B — pre-warm device list cache, fall
 * back to minimal stub if device list is cold).
 *
 * Scope discipline: no gap-strength filter UI (D2 MVP all strong), no
 * stale-component drill-down (D2 MVP staleComponents=[]). Future D4
 * may introduce weak/stale-window devices + multi-gap drill-down.
 */

const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_FRESHNESS_WINDOW = 'P7D';

const ALL_GAP_TYPES: ComplianceGapWire[] = ['rdp_enabled', 'pending_security_updates'];

const FRESHNESS_PRESETS: Array<{ value: string; key: string }> = [
  { value: 'P7D', key: 'endpointAdmin.complianceGap.filter.freshnessWindow.7d' },
  { value: 'P30D', key: 'endpointAdmin.complianceGap.filter.freshnessWindow.30d' },
  { value: 'P90D', key: 'endpointAdmin.complianceGap.filter.freshnessWindow.90d' },
  { value: 'P366D', key: 'endpointAdmin.complianceGap.filter.freshnessWindow.366d' },
];

function gapBadgeLabel(type: ComplianceGapWire, t: (k: string) => string): string {
  return t(`endpointAdmin.complianceGap.filter.gapType.${type}`);
}

function strengthLabel(strength: 'strong' | 'weak', t: (k: string) => string): string {
  return strength === 'weak'
    ? t('endpointAdmin.complianceGap.strength.weak')
    : t('endpointAdmin.complianceGap.strength.strong');
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

/**
 * Same stub pattern as WEB-014B cross-device list — minimal
 * EndpointDevice when the device cache is cold; drawer subscribes to
 * its own queries off `id` so rich rendering arrives once those load.
 */
function buildStubDevice(deviceId: string, hostname: string | null): EndpointDevice {
  return {
    id: deviceId,
    hostname: hostname ?? deviceId,
    displayName: null,
    osType: 'UNKNOWN',
    osVersion: null,
    agentVersion: null,
    status: 'OFFLINE',
    lastSeen: null,
    enrolledAt: null,
    domain: null,
    primaryUser: null,
    primaryUserEmail: null,
    machineFingerprint: null,
    publicIp: null,
    privateIp: null,
    location: null,
    tags: [],
    tenantId: null,
    organizationId: null,
  } as unknown as EndpointDevice;
}

export const EndpointComplianceGapPage: React.FC = () => {
  const { t } = useEndpointAdminI18n();
  const [selectedGapTypes, setSelectedGapTypes] = React.useState<Set<ComplianceGapWire>>(
    () => new Set<ComplianceGapWire>(ALL_GAP_TYPES),
  );
  const [freshnessWindow, setFreshnessWindow] = React.useState<string>(DEFAULT_FRESHNESS_WINDOW);
  const [page, setPage] = React.useState(1); // backend is 1-based
  const [selectedDeviceId, setSelectedDeviceId] = React.useState<string | null>(null);

  // Pre-warm device list cache (shared with WEB-014B + Devices page).
  const { data: deviceList } = useListEndpointDevicesQuery();

  const gapTypesArray = React.useMemo<ComplianceGapWire[]>(
    () => [...selectedGapTypes].sort() as ComplianceGapWire[],
    [selectedGapTypes],
  );

  const { data, error, isLoading, isFetching, refetch } = useGetComplianceGapQuery({
    gapTypes: gapTypesArray.length > 0 ? gapTypesArray : undefined,
    freshnessWindow,
    page,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  const onGapTypeToggle = React.useCallback((gap: ComplianceGapWire) => {
    setSelectedGapTypes((prev) => {
      const next = new Set(prev);
      if (next.has(gap)) {
        // Codex 019e88db P1 absorb: refuse to unselect the LAST gap type.
        // Backend treats empty gapTypes as "all" — operator-facing semantics
        // would silently flip back to all-selected, which contradicts the
        // visible empty filter state. Keep at least one always selected.
        if (next.size <= 1) return prev;
        next.delete(gap);
      } else {
        next.add(gap);
      }
      return next;
    });
    setPage(1);
  }, []);

  const onWindowChange = React.useCallback((value: string) => {
    setFreshnessWindow(value);
    setPage(1);
  }, []);

  const onRowClick = React.useCallback((deviceId: string) => {
    setSelectedDeviceId(deviceId);
  }, []);

  const onDrawerClose = React.useCallback(() => {
    setSelectedDeviceId(null);
  }, []);

  const hostnameByDeviceId = React.useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    deviceList?.forEach((d) => {
      if (d.hostname) map[d.id] = d.hostname;
    });
    return map;
  }, [deviceList]);

  const selectedDevice = React.useMemo<EndpointDevice | null>(() => {
    if (!selectedDeviceId) return null;
    const fromList = deviceList?.find((d) => d.id === selectedDeviceId) ?? null;
    if (fromList) return fromList;
    return buildStubDevice(selectedDeviceId, hostnameByDeviceId[selectedDeviceId] ?? null);
  }, [selectedDeviceId, deviceList, hostnameByDeviceId]);

  // Codex 019e88db P1 absorb: gate render on `!isFetching` so a filter/window/
  // page change does NOT briefly render stale items + filterEcho + total under
  // the new control state. WEB-014B canonical pattern (compliance device list).
  const stale = isLoading || isFetching;
  const items: DeviceComplianceGap[] = stale ? [] : (data?.items ?? []);
  const total = stale ? 0 : (data?.total ?? 0);
  // Codex 019e88db P2 absorb: derive totalPages from backend effective pageSize
  // (filterEcho.pageSize) rather than the client constant — single source of
  // truth on the server.
  const effectivePageSize = data?.filterEcho?.pageSize ?? DEFAULT_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / effectivePageSize));

  return (
    <div data-testid="endpoint-admin-compliance-gap-page" style={{ padding: 16 }}>
      <header style={{ marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 4px 0' }}>{t('endpointAdmin.complianceGap.title')}</h2>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 14 }}>
          {t('endpointAdmin.complianceGap.subtitle')}
        </p>
      </header>

      <div
        data-testid="compliance-gap-filters"
        style={{
          display: 'flex',
          gap: 16,
          marginBottom: 16,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <fieldset
          style={{ border: '1px solid var(--border-color, #ccc)', padding: 8, borderRadius: 4 }}
        >
          <legend style={{ fontSize: 13, padding: '0 4px' }}>
            {t('endpointAdmin.complianceGap.filter.gapTypes')}
          </legend>
          {ALL_GAP_TYPES.map((gap) => (
            <label key={gap} style={{ marginRight: 12, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={selectedGapTypes.has(gap)}
                onChange={() => onGapTypeToggle(gap)}
                data-testid={`compliance-gap-filter-${gap}`}
              />{' '}
              {gapBadgeLabel(gap, t)}
            </label>
          ))}
        </fieldset>
        <label style={{ fontSize: 13 }}>
          {t('endpointAdmin.complianceGap.filter.freshnessWindow')}{' '}
          <select
            value={freshnessWindow}
            onChange={(e) => onWindowChange(e.target.value)}
            data-testid="compliance-gap-window-select"
          >
            {FRESHNESS_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {t(preset.key)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* filterEcho gated on !stale so old echo doesn't survive a control
          change while the next response is in flight. */}
      {!stale && data?.filterEcho && (
        <div
          data-testid="compliance-gap-filter-echo"
          style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}
        >
          {t('endpointAdmin.complianceGap.filterEcho.window')} {data.filterEcho.freshnessWindow}
          {' · '}
          {t('endpointAdmin.complianceGap.filterEcho.gapTypes')}{' '}
          {data.filterEcho.gapTypes.length === 0 ? '—' : data.filterEcho.gapTypes.join(', ')}
          {' · '}
          {t('endpointAdmin.complianceGap.filterEcho.computedAt')}{' '}
          {formatTimestamp(data.computedAt)}
        </div>
      )}

      {stale && !error && (
        <div data-testid="compliance-gap-loading" role="status" aria-live="polite">
          {t('endpointAdmin.complianceGap.loading')}
        </div>
      )}

      {!stale && error && (
        <CapabilityState
          kind={classifyCapabilityError(error, FLEET_CAPABILITY_POLICY)}
          onRetry={refetch}
          testId="compliance-gap-state"
        />
      )}

      {!stale && !error && items.length === 0 && (
        <div data-testid="compliance-gap-empty" style={{ padding: 24 }}>
          {t('endpointAdmin.complianceGap.empty')}
        </div>
      )}

      {!stale && !error && items.length > 0 && (
        <>
          <table
            data-testid="compliance-gap-table"
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 13,
            }}
          >
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                <th style={{ padding: 8 }}>{t('endpointAdmin.complianceGap.col.hostname')}</th>
                <th style={{ padding: 8 }}>{t('endpointAdmin.complianceGap.col.gapCount')}</th>
                <th style={{ padding: 8 }}>{t('endpointAdmin.complianceGap.col.gaps')}</th>
                <th style={{ padding: 8 }}>{t('endpointAdmin.complianceGap.col.gapStrength')}</th>
                <th style={{ padding: 8 }}>{t('endpointAdmin.complianceGap.col.lastSeen')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.deviceId}
                  data-testid={`compliance-gap-row-${item.deviceId}`}
                  onClick={() => onRowClick(item.deviceId)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onRowClick(item.deviceId);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={t('endpointAdmin.complianceGap.rowAria').replace(
                    '{hostname}',
                    item.deviceName,
                  )}
                  style={{
                    cursor: 'pointer',
                    borderBottom: '1px solid #eee',
                  }}
                >
                  <td style={{ padding: 8 }}>{item.deviceName}</td>
                  <td style={{ padding: 8 }}>{item.gapCount}</td>
                  <td style={{ padding: 8 }}>
                    {item.gaps.map((g: GapDetail) => (
                      <span
                        key={g.type}
                        data-testid={`compliance-gap-badge-${g.type}`}
                        style={{
                          display: 'inline-block',
                          padding: '2px 6px',
                          marginRight: 4,
                          fontSize: 12,
                          background: 'var(--danger-bg, rgba(220, 53, 69, 0.12))',
                          borderRadius: 3,
                        }}
                      >
                        {g.label}
                      </span>
                    ))}
                  </td>
                  <td style={{ padding: 8 }}>{strengthLabel(item.gapStrength, t)}</td>
                  <td style={{ padding: 8 }}>{formatTimestamp(item.lastSeen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <nav
            data-testid="compliance-gap-pagination"
            aria-label={t('endpointAdmin.complianceGap.paginationAria')}
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              gap: 8,
              marginTop: 12,
              fontSize: 13,
            }}
          >
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || isFetching}
              data-testid="compliance-gap-prev"
            >
              {t('endpointAdmin.complianceGap.prev')}
            </button>
            <span data-testid="compliance-gap-page-indicator">
              {t('endpointAdmin.complianceGap.pageIndicator')
                .replace('{page}', String(page))
                .replace('{totalPages}', String(totalPages))
                .replace('{total}', String(total))}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages || isFetching}
              data-testid="compliance-gap-next"
            >
              {t('endpointAdmin.complianceGap.next')}
            </button>
          </nav>
        </>
      )}

      {/* Suppress the cached device drawer under a NON-retryable capability state
          (forbidden/notEnabled/disabled) — mirrors the list (Codex S4a P1-3). */}
      {selectedDevice &&
        (!error ||
          RETRYABLE_KINDS.has(classifyCapabilityError(error, FLEET_CAPABILITY_POLICY))) && (
          <DeviceDetailDrawer
            open
            device={selectedDevice}
            onClose={onDrawerClose}
            initialTab="compliance"
          />
        )}
    </div>
  );
};

export default EndpointComplianceGapPage;
