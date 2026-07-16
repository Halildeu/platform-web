import React from 'react';

import {
  useGetComplianceDeviceListQuery,
  useListEndpointDevicesQuery,
} from '../../app/services/endpointAdminApi';
import { useEndpointAdminI18n } from '../../i18n';
import type {
  ComplianceDecision,
  ComplianceStateResponse,
} from '../../entities/endpoint-device-compliance/types';
import type { EndpointDevice } from '../../entities/endpoint-device/types';
import { DeviceDetailDrawer } from '../../widgets/device-detail-drawer';
import {
  CapabilityState,
  classifyCapabilityError,
  FLEET_CAPABILITY_POLICY,
} from '../../widgets/capability-state';

/**
 * WEB-014B — Cross-device compliance list (Codex 019e6db0 plan-time
 * iter-2 AGREE / ready_for_impl=true).
 *
 * Backed by the BE-023 admin endpoint:
 *   gateway GET /api/v1/endpoint-admin/compliance/devices?decision=&page=&size=
 *   → service /api/v1/admin/compliance/devices
 *
 * Response envelope is the BE-023 custom shape
 *   `{ items, page, size, totalElements, totalPages }`
 * (NOT Spring `Page<T>`).
 *
 * Filters: only `decision` is server-side. `worstStaleness` and
 * `policyDrift` are surfaced as columns/badges only — they are
 * computed at GET time on the backend, so filtering them client-side
 * would silently break pagination totals (Codex iter-1 P2).
 *
 * Row click → opens `DeviceDetailDrawer` with `initialTab="compliance"`
 * so the operator lands on the Compliance tab instead of the default
 * `detay`. The drawer's `useEffect` re-applies the initialTab on every
 * `open || deviceId || initialTab` change so consecutive row clicks
 * (without closing the drawer) keep the Compliance tab selected.
 *
 * Lazy device-name resolution: BE-023 surfaces `hostname` on the row
 * directly. The drawer needs the full `EndpointDevice` object (rich
 * fields like `displayName`, `osType`, `status`) — we hydrate it from
 * the existing `useListEndpointDevicesQuery` cache and fall back to a
 * minimal stub if the device list is not yet warm.
 *
 * Scope discipline (Codex iter-2): no `worstStaleness` / `policyDrift`
 * filter UI, no history view here (that lives inside the Compliance
 * tab), no policy CRUD (WEB-014C).
 */

const DEFAULT_PAGE_SIZE = 20;

const DECISION_OPTIONS: ComplianceDecision[] = [
  'COMPLIANT',
  'NON_COMPLIANT',
  'UNAUTHORIZED',
  'UNKNOWN',
];

function decisionBadgeClass(decision: ComplianceDecision): string {
  switch (decision) {
    case 'COMPLIANT':
      return 'compliance-list__decision compliance-list__decision--compliant';
    case 'NON_COMPLIANT':
      return 'compliance-list__decision compliance-list__decision--non-compliant';
    case 'UNAUTHORIZED':
      return 'compliance-list__decision compliance-list__decision--unauthorized';
    case 'UNKNOWN':
    default:
      return 'compliance-list__decision compliance-list__decision--unknown';
  }
}

function decisionLabel(decision: ComplianceDecision, t: (key: string) => string): string {
  switch (decision) {
    case 'COMPLIANT':
      return t('endpointAdmin.drawer.compliance.decision.compliant.label');
    case 'NON_COMPLIANT':
      return t('endpointAdmin.drawer.compliance.decision.nonCompliant.label');
    case 'UNAUTHORIZED':
      return t('endpointAdmin.drawer.compliance.decision.unauthorized.label');
    case 'UNKNOWN':
    default:
      return t('endpointAdmin.drawer.compliance.decision.unknown.label');
  }
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function stalenessChipClass(severity: string): string {
  return `compliance-list__staleness-chip compliance-list__staleness-chip--${severity.toLowerCase()}`;
}

function stalenessLabel(severity: string, t: (key: string) => string): string {
  switch (severity) {
    case 'FRESH':
      return t('endpointAdmin.drawer.compliance.staleness.stream.fresh');
    case 'SOFT':
      return t('endpointAdmin.drawer.compliance.staleness.stream.soft');
    case 'HARD':
      return t('endpointAdmin.drawer.compliance.staleness.stream.hard');
    case 'UNAVAILABLE':
      return t('endpointAdmin.drawer.compliance.staleness.stream.unavailable');
    default:
      return severity;
  }
}

/**
 * Minimal stub when the device list cache is cold and the
 * cross-device list returns a `deviceId` we don't have full metadata
 * for yet. The drawer's DetayTab and similar components handle null /
 * missing fields, so a stub with id + hostname is enough to keep the
 * smoke path open. The drawer subscribes to its own queries (commands,
 * compliance, inventory) keyed off `id`, so the rich rendering arrives
 * once those load.
 *
 * Hostname is taken from `hostnameByDeviceId` (the EndpointCompliancePage
 * resolves it from the device list cache); we fall back to the deviceId
 * itself when the cache is cold so the drawer's title still renders.
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

export const EndpointCompliancePage: React.FC = () => {
  const { t } = useEndpointAdminI18n();
  const [decisionFilter, setDecisionFilter] = React.useState<ComplianceDecision | ''>('');
  const [page, setPage] = React.useState(0);
  const [selectedDeviceId, setSelectedDeviceId] = React.useState<string | null>(null);

  // Pre-warm the device list so row click can hydrate the full
  // `EndpointDevice` for the drawer. This is the same query the
  // devices page already subscribes to, so RTK Query keeps a single
  // shared cache — no duplicate request.
  const { data: deviceList } = useListEndpointDevicesQuery();

  const { data, error, isLoading, isFetching, refetch } = useGetComplianceDeviceListQuery({
    decision: decisionFilter || undefined,
    page,
    size: DEFAULT_PAGE_SIZE,
  });

  // Filter change resets page in the same render cycle as the filter
  // value update so the request that goes out targets page 0 of the
  // new filter, not page N of the old one.
  const onDecisionChange = React.useCallback((next: ComplianceDecision | '') => {
    setDecisionFilter(next);
    setPage(0);
  }, []);

  const onRowClick = React.useCallback((deviceId: string) => {
    setSelectedDeviceId(deviceId);
  }, []);

  const onDrawerClose = React.useCallback(() => {
    setSelectedDeviceId(null);
  }, []);

  // Device id → hostname map from the pre-warmed device list cache.
  // Resolves the `hostname` column for cross-device rows, because the
  // BE-023 list endpoint returns `ComplianceStateResponse` rows (no
  // `hostname` field on the row itself).
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
    const fromCompliance = data?.items.find((item) => item.deviceId === selectedDeviceId);
    return fromCompliance
      ? buildStubDevice(
          fromCompliance.deviceId,
          hostnameByDeviceId[fromCompliance.deviceId] ?? null,
        )
      : null;
  }, [data, deviceList, hostnameByDeviceId, selectedDeviceId]);

  return (
    <div className="compliance-list" data-testid="compliance-list">
      <header className="compliance-list__header">
        <h1>{t('endpointAdmin.compliance.list.title')}</h1>
        <p className="compliance-list__subtitle">{t('endpointAdmin.compliance.list.subtitle')}</p>
      </header>

      <div className="compliance-list__filters">
        <label htmlFor="compliance-decision-filter">
          {t('endpointAdmin.compliance.list.filter.decision')}
        </label>
        <select
          id="compliance-decision-filter"
          value={decisionFilter}
          onChange={(e) => onDecisionChange(e.target.value as ComplianceDecision | '')}
          data-testid="compliance-list-decision-filter"
        >
          <option value="">{t('endpointAdmin.compliance.list.filter.decisionAll')}</option>
          {DECISION_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {decisionLabel(d, t)}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <CapabilityState
          kind={classifyCapabilityError(error, FLEET_CAPABILITY_POLICY)}
          onRetry={refetch}
          testId="compliance-list-state"
        />
      ) : null}
      {!error && (isLoading || isFetching) ? (
        <div className="compliance-list__loading" data-testid="compliance-list-loading">
          {t('endpointAdmin.compliance.list.loading')}
        </div>
      ) : null}
      {!error && !isLoading && !isFetching && data && data.items.length === 0 ? (
        <div className="compliance-list__empty" data-testid="compliance-list-empty">
          {t('endpointAdmin.compliance.list.empty')}
        </div>
      ) : null}
      {!error && !isLoading && !isFetching && data && data.items.length > 0 ? (
        <>
          <table className="compliance-list__table" data-testid="compliance-list-table">
            <thead>
              <tr>
                <th>{t('endpointAdmin.compliance.list.col.hostname')}</th>
                <th>{t('endpointAdmin.compliance.list.col.decision')}</th>
                <th>{t('endpointAdmin.compliance.list.col.evaluatedAt')}</th>
                <th>{t('endpointAdmin.compliance.list.col.worstStaleness')}</th>
                <th>{t('endpointAdmin.compliance.list.col.policyDrift')}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item: ComplianceStateResponse) => {
                const hostname = hostnameByDeviceId[item.deviceId] ?? item.deviceId;
                const worst = item.staleness.worst;
                return (
                  <tr
                    key={item.deviceId}
                    className="compliance-list__row"
                    data-testid={`compliance-list-row-${item.deviceId}`}
                    onClick={() => onRowClick(item.deviceId)}
                    tabIndex={0}
                    role="button"
                    aria-label={t('endpointAdmin.compliance.list.rowAria').replace(
                      '{hostname}',
                      hostname,
                    )}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onRowClick(item.deviceId);
                      }
                    }}
                  >
                    <td className="compliance-list__hostname">{hostname}</td>
                    <td>
                      <span className={decisionBadgeClass(item.decision)}>
                        {decisionLabel(item.decision, t)}
                      </span>
                    </td>
                    <td>{formatTimestamp(item.evaluatedAt)}</td>
                    <td>
                      <span className={stalenessChipClass(worst)}>{stalenessLabel(worst, t)}</span>
                    </td>
                    <td>
                      {item.policyDrift ? (
                        <span
                          className="compliance-list__drift-chip"
                          data-testid={`compliance-list-drift-${item.deviceId}`}
                        >
                          {t('endpointAdmin.compliance.list.policyDriftBadge')}
                        </span>
                      ) : (
                        <span className="compliance-list__drift-none">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {data.totalPages > 1 ? (
            <nav
              className="compliance-list__pagination"
              aria-label={t('endpointAdmin.compliance.list.paginationAria')}
              data-testid="compliance-list-pagination"
            >
              <button
                type="button"
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page <= 0}
                data-testid="compliance-list-prev"
              >
                {t('endpointAdmin.compliance.list.prev')}
              </button>
              <span data-testid="compliance-list-page-indicator">
                {t('endpointAdmin.compliance.list.pageIndicator')
                  .replace('{page}', String(data.page + 1))
                  .replace('{totalPages}', String(data.totalPages))
                  .replace('{totalElements}', String(data.totalElements))}
              </span>
              <button
                type="button"
                onClick={() => setPage(Math.min(data.totalPages - 1, page + 1))}
                disabled={page + 1 >= data.totalPages}
                data-testid="compliance-list-next"
              >
                {t('endpointAdmin.compliance.list.next')}
              </button>
            </nav>
          ) : null}
        </>
      ) : null}

      <DeviceDetailDrawer
        open={Boolean(selectedDevice)}
        device={selectedDevice}
        onClose={onDrawerClose}
        initialTab="compliance"
      />
    </div>
  );
};

export default EndpointCompliancePage;
