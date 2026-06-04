import React from 'react';

import {
  useListCatalogItemsQuery,
  useListInstallAuditsQuery,
  useListUninstallAuditsQuery,
  useListUninstallRequestsQuery,
} from '../../../app/services/endpointAdminApi';
import type { AdminCatalogItemSummary } from '../../../entities/endpoint-software-catalog/types';
import type { EndpointDevice } from '../../../entities/endpoint-device/types';
import type {
  CreateInstallSuccess,
  EndpointInstallAuditDto,
  InstallPostVerification,
  InstallPreflightDecisionRecorded,
} from '../../../entities/endpoint-install/types';
import {
  isOpenUninstallRequest,
  type AdminUninstallAuditResponse,
  type AdminUninstallRequestResponse,
  type CreateUninstallSuccess,
} from '../../../entities/endpoint-uninstall/types';
import { useEndpointAdminI18n } from '../../../i18n';
import {
  UninstallResultStatusBadge,
  UninstallVerificationBadge,
} from '../components/UninstallBadges';

// WEB-014D perf follow-up (Codex 019e707e iter-2 PARTIAL absorb):
// load the install confirmation modal lazily so the catalog tab's cold
// render path does not pay for the modal's overlay-engine, focus-trap,
// idempotency, and preflight-evidence layer until the operator actually
// clicks "Kur" on a catalog row. The modal is rendered behind a
// `<React.Suspense fallback={null}>` because the click-to-open
// transition is fast; a visible fallback would flash on the first open.
const InstallPreflightModal = React.lazy(() =>
  import('../components/InstallPreflightModal').then((m) => ({
    default: m.InstallPreflightModal,
  })),
);

// AG-028 Phase 3 — uninstall confirm modal, lazy-loaded for the same
// cold-path reason as the install modal.
const UninstallConfirmModal = React.lazy(() =>
  import('../components/UninstallConfirmModal').then((m) => ({
    default: m.UninstallConfirmModal,
  })),
);

/**
 * WEB-014D + AG-028 Phase 3 — Software catalog tab for the device detail
 * drawer (Faz 22.5; Codex 019e6fd1 install plan + 019e93a4 uninstall
 * plan).
 *
 * Reads four queries — all skipped until `active`:
 *  - useListCatalogItemsQuery({ status: APPROVED, enabled: true, size:
 *    200 }) for the install/uninstall picker.
 *  - useListInstallAuditsQuery({ deviceId, page: 0, size: 10 }) for the
 *    "Son Kurulumlar" panel (30 s poll).
 *  - useListUninstallAuditsQuery({ deviceId, page: 0, size: 10 }) for
 *    the "Son Kaldırmalar" panel (30 s poll — terminal results from the
 *    agent arrive a few seconds to a minute after approve).
 *  - useListUninstallRequestsQuery({ deviceId, page: 0, size: 50 }) for
 *    the open-request ("Onay bekliyor") pills. Auto-refetches on
 *    createUninstall via the `EndpointUninstallRequest:device-{id}` tag.
 *
 * The drawer NEVER renders an approve button — the approve action lives
 * only in the approval center. Each open request links there.
 */
export interface SoftwareCatalogTabProps {
  device: EndpointDevice;
  active: boolean;
  /**
   * Relative path (within the endpoint-admin MFE) to the approval
   * center, surfaced as a link on each open uninstall request. The
   * drawer is mounted across pages so this is supplied by the host
   * rather than hard-coded; defaults to the canonical inbox route.
   */
  approvalsPath?: string;
}

interface ToastState {
  kind: 'success' | 'error';
  message: string;
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

// `-subtle` is NOT in the @theme-inline token registry (only text/border/
// surface-subtle exist), so `bg-state-*-subtle` emits no background — the
// app-wide convention is `bg-state-*-bg` (oklch with built-in alpha, 100+
// usages). These were the rare broken outliers; migrated to `-bg` so the
// badges actually render a filled pill next to the new verification badge.
const RISK_TIER_BADGE_CLASSES: Record<AdminCatalogItemSummary['riskTier'], string> = {
  LOW: 'bg-state-success-bg text-state-success-text border-state-success-border',
  MEDIUM: 'bg-state-warning-bg text-state-warning-text border-state-warning-border',
  HIGH: 'bg-state-danger-bg text-state-danger-text border-state-danger-border',
};

const DECISION_RECORDED_BADGE: Record<InstallPreflightDecisionRecorded, string> = {
  PASS: 'bg-state-success-bg text-state-success-text',
  WARN: 'bg-state-warning-bg text-state-warning-text',
};

// BE-028 (platform-backend #347, LIVE 2026-05-31): install audit now
// carries a post-install verification verdict. REGISTRY detection is
// authoritative (SATISFIED); WINGET confirm-only under Session-0 stays
// UNKNOWN even on a SUCCEEDED command; UNSATISFIED = expected package
// absent after a SUCCEEDED install. Surfacing the verdict lets operators
// distinguish an authoritative install from a confirm-only one — both
// previously rendered only "Başarılı".
const POST_VERIFICATION_BADGE: Record<InstallPostVerification, string> = {
  SATISFIED: 'bg-state-success-bg text-state-success-text',
  UNSATISFIED: 'bg-state-danger-bg text-state-danger-text',
  UNKNOWN: 'bg-surface-muted text-text-secondary',
};

const DEFAULT_APPROVALS_PATH = '/endpoint-admin/approvals';

interface SelectedItem {
  catalogItemId: string;
  displayName: string;
}

export const SoftwareCatalogTab: React.FC<SoftwareCatalogTabProps> = ({
  device,
  active,
  approvalsPath = DEFAULT_APPROVALS_PATH,
}) => {
  const { t } = useEndpointAdminI18n();
  const [selected, setSelected] = React.useState<SelectedItem | null>(null);
  const [uninstallSelected, setUninstallSelected] = React.useState<SelectedItem | null>(null);
  const [toast, setToast] = React.useState<ToastState | null>(null);

  // Clear transient toast when tab becomes inactive or device changes.
  React.useEffect(() => {
    if (!active) {
      setToast(null);
      setSelected(null);
      setUninstallSelected(null);
    }
  }, [active]);
  React.useEffect(() => {
    setToast(null);
    setSelected(null);
    setUninstallSelected(null);
  }, [device.id]);

  const catalogQuery = useListCatalogItemsQuery(
    { status: 'APPROVED', enabled: true, page: 0, size: 200 },
    { skip: !active },
  );

  // Codex 019e6fe4 must-fix #3: the install audit row is created only
  // when the agent reports a terminal install result. The `createInstall`
  // invalidation refetches immediately on POST, before the row exists;
  // the agent's later report does NOT trigger a fresh RTK tag
  // invalidation. The 30 s tab-active poll surfaces them.
  const installAuditQuery = useListInstallAuditsQuery(
    { deviceId: device.id, page: 0, size: 10 },
    { skip: !active, pollingInterval: active ? 30_000 : 0 },
  );

  // AG-028 Phase 3 — uninstall terminal-result history (30 s poll, same
  // rationale as install: the audit row lands only when the agent
  // reports a terminal uninstall result, after the POST invalidation).
  const uninstallAuditQuery = useListUninstallAuditsQuery(
    { deviceId: device.id, page: 0, size: 10 },
    { skip: !active, pollingInterval: active ? 30_000 : 0 },
  );

  // AG-028 Phase 3 — open uninstall requests (drives the "Onay
  // bekliyor" pills). Polled so an approval in the approval center
  // surfaces here too without a manual refresh.
  const uninstallRequestsQuery = useListUninstallRequestsQuery(
    { deviceId: device.id, page: 0, size: 50 },
    { skip: !active, pollingInterval: active ? 30_000 : 0 },
  );

  if (!active) return null;

  const catalogStatus =
    catalogQuery.error && typeof catalogQuery.error === 'object' && 'status' in catalogQuery.error
      ? (catalogQuery.error as { status: unknown }).status
      : null;
  const isCatalogForbidden = catalogStatus === 403;
  const isCatalogLoading = catalogQuery.isLoading;
  const catalogPage = catalogQuery.data;
  const catalogItems: AdminCatalogItemSummary[] = catalogPage?.content ?? [];

  const auditPage = installAuditQuery.data;
  const auditRows: EndpointInstallAuditDto[] = auditPage?.content ?? [];
  const isAuditLoading = installAuditQuery.isLoading;

  const uninstallAuditRows: AdminUninstallAuditResponse[] = uninstallAuditQuery.data ?? [];
  const isUninstallAuditLoading = uninstallAuditQuery.isLoading;

  const uninstallRequests: AdminUninstallRequestResponse[] = uninstallRequestsQuery.data ?? [];
  // Open requests, newest first (the list already returns createdAt DESC).
  const openUninstallRequests = uninstallRequests.filter((r) => isOpenUninstallRequest(r.state));

  const isOnline = device.status === 'ONLINE';

  const openInstallModal = (item: AdminCatalogItemSummary) => {
    setSelected({ catalogItemId: item.catalogItemId, displayName: item.displayName });
  };
  const closeInstallModal = () => setSelected(null);

  const openUninstallModal = (item: AdminCatalogItemSummary) => {
    setUninstallSelected({ catalogItemId: item.catalogItemId, displayName: item.displayName });
  };
  const closeUninstallModal = () => setUninstallSelected(null);

  const handleInstalled = (command: CreateInstallSuccess) => {
    setSelected(null);
    setToast({
      kind: 'success',
      message: t('endpointAdmin.drawer.install.toast.success').replace('{commandId}', command.id),
    });
  };

  const handleProposedUninstall = (_request: CreateUninstallSuccess) => {
    setUninstallSelected(null);
    setToast({
      kind: 'success',
      message: t('endpointAdmin.drawer.uninstall.toast.success'),
    });
  };

  const renderCatalog = () => {
    if (isCatalogForbidden) {
      return (
        <p className="text-sm text-text-secondary py-4" data-testid="software-catalog-forbidden">
          {t('endpointAdmin.drawer.softwareCatalog.forbidden')}
        </p>
      );
    }
    if (isCatalogLoading) {
      return (
        <p className="text-sm text-text-secondary py-4" data-testid="software-catalog-loading">
          {t('endpointAdmin.drawer.softwareCatalog.loading')}
        </p>
      );
    }
    if (catalogQuery.error && !isCatalogForbidden) {
      return (
        <p className="text-sm text-state-danger-text py-4" data-testid="software-catalog-error">
          {t('endpointAdmin.drawer.softwareCatalog.error')}
        </p>
      );
    }
    if (catalogItems.length === 0) {
      return (
        <p className="text-sm text-text-secondary py-4" data-testid="software-catalog-empty">
          {t('endpointAdmin.drawer.softwareCatalog.empty')}
        </p>
      );
    }

    return (
      <div className="rounded-md border border-border-default overflow-hidden">
        <table className="w-full text-sm" data-testid="software-catalog-table">
          <thead className="bg-surface-muted text-text-secondary text-xs">
            <tr>
              <th className="text-left px-3 py-2">
                {t('endpointAdmin.drawer.softwareCatalog.col.displayName')}
              </th>
              <th className="text-left px-3 py-2">
                {t('endpointAdmin.drawer.softwareCatalog.col.publisher')}
              </th>
              <th className="text-left px-3 py-2">
                {t('endpointAdmin.drawer.softwareCatalog.col.packageId')}
              </th>
              <th className="text-left px-3 py-2">
                {t('endpointAdmin.drawer.softwareCatalog.col.riskTier')}
              </th>
              <th className="text-right px-3 py-2">
                {t('endpointAdmin.drawer.softwareCatalog.col.actions')}
              </th>
            </tr>
          </thead>
          <tbody>
            {catalogItems.map((item) => {
              // Codex 019e93ab Q1 = B: render "Kaldır" UNLESS the flag is
              // explicitly false. The backend summary DTO does not emit
              // this field today (so it is `undefined` → render); the
              // server propose 422 is the authoritative gate. NEVER
              // default to false.
              const canUninstall = item.uninstallSupported !== false;
              return (
                <tr
                  key={item.id}
                  className="border-t border-border-subtle"
                  data-testid={`catalog-row-${item.catalogItemId}`}
                >
                  <td className="px-3 py-2">{item.displayName}</td>
                  <td className="px-3 py-2">{item.publisher ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{item.packageId}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${RISK_TIER_BADGE_CLASSES[item.riskTier]}`}
                    >
                      {t(`endpointAdmin.drawer.softwareCatalog.riskTier.${item.riskTier}`)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openInstallModal(item)}
                        data-testid={`kur-button-${item.catalogItemId}`}
                        title={
                          isOnline
                            ? undefined
                            : t('endpointAdmin.drawer.softwareCatalog.kur.offlineHint')
                        }
                        className="px-3 py-1 rounded-md border border-primary text-primary text-xs hover:bg-state-success-bg"
                      >
                        {t('endpointAdmin.drawer.softwareCatalog.kur')}
                      </button>
                      {canUninstall && (
                        <button
                          type="button"
                          onClick={() => openUninstallModal(item)}
                          data-testid={`kaldir-button-${item.catalogItemId}`}
                          title={
                            isOnline
                              ? undefined
                              : t('endpointAdmin.drawer.softwareCatalog.kaldir.offlineHint')
                          }
                          className="px-3 py-1 rounded-md border border-state-danger-border text-state-danger-text text-xs hover:bg-state-danger-bg"
                        >
                          {t('endpointAdmin.drawer.softwareCatalog.kaldir')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderRecentInstalls = () => {
    if (isAuditLoading) {
      return (
        <p className="text-sm text-text-secondary py-2" data-testid="install-audit-loading">
          {t('endpointAdmin.drawer.softwareCatalog.recentInstalls.loading')}
        </p>
      );
    }
    if (auditRows.length === 0) {
      return (
        <p className="text-sm text-text-secondary py-2" data-testid="install-audit-empty">
          {t('endpointAdmin.drawer.softwareCatalog.recentInstalls.empty')}
        </p>
      );
    }
    return (
      <div className="rounded-md border border-border-default overflow-hidden">
        <table className="w-full text-sm" data-testid="install-audit-table">
          <thead className="bg-surface-muted text-text-secondary text-xs">
            <tr>
              <th className="text-left px-3 py-2">
                {t('endpointAdmin.drawer.softwareCatalog.recentInstalls.col.app')}
              </th>
              <th className="text-left px-3 py-2">
                {t('endpointAdmin.drawer.softwareCatalog.recentInstalls.col.decision')}
              </th>
              <th className="text-left px-3 py-2">
                {t('endpointAdmin.drawer.softwareCatalog.recentInstalls.col.result')}
              </th>
              <th className="text-left px-3 py-2">
                {t('endpointAdmin.drawer.softwareCatalog.recentInstalls.col.verification')}
              </th>
              <th className="text-left px-3 py-2">
                {t('endpointAdmin.drawer.softwareCatalog.recentInstalls.col.reportedAt')}
              </th>
            </tr>
          </thead>
          <tbody>
            {auditRows.map((row) => (
              <tr
                key={row.auditId}
                className="border-t border-border-subtle"
                data-testid={`install-audit-row-${row.auditId}`}
              >
                <td className="px-3 py-2">{row.catalogItemId ?? row.catalogItemUuid}</td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${DECISION_RECORDED_BADGE[row.preflightDecision]}`}
                  >
                    {row.preflightDecision}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {row.resultStatus
                    ? t(`endpointAdmin.drawer.install.resultStatus.${row.resultStatus}`)
                    : t('endpointAdmin.drawer.install.resultStatus.pending')}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-col gap-0.5">
                    {row.postVerification ? (
                      <span
                        data-testid={`install-audit-postverif-${row.auditId}`}
                        className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs ${POST_VERIFICATION_BADGE[row.postVerification]}`}
                        title={t(
                          `endpointAdmin.drawer.install.postVerification.${row.postVerification}.aria`,
                        )}
                      >
                        {t(`endpointAdmin.drawer.install.postVerification.${row.postVerification}`)}
                      </span>
                    ) : (
                      <span
                        data-testid={`install-audit-postverif-${row.auditId}`}
                        className="text-xs text-text-secondary"
                      >
                        {t('endpointAdmin.drawer.install.postVerification.pending')}
                      </span>
                    )}
                    {row.detectedVersion && (
                      <span
                        data-testid={`install-audit-detected-version-${row.auditId}`}
                        className="font-mono text-xs text-text-secondary"
                        title={t(
                          'endpointAdmin.drawer.softwareCatalog.recentInstalls.detectedVersion',
                        ).replace('{version}', row.detectedVersion)}
                      >
                        {row.detectedVersion}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 text-xs text-text-secondary">
                  {formatTimestamp(row.reportedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderOpenUninstalls = () => {
    if (openUninstallRequests.length === 0) return null;
    return (
      <div
        className="rounded-md border border-state-warning-border bg-state-warning-bg px-3 py-2"
        data-testid="uninstall-open-requests"
      >
        <h5 className="text-xs font-semibold uppercase tracking-wider text-state-warning-text mb-1">
          {t('endpointAdmin.drawer.uninstall.openRequests.heading')}
        </h5>
        <ul className="space-y-1">
          {openUninstallRequests.map((req) => (
            <li
              key={req.requestId}
              className="flex flex-wrap items-center gap-2 text-sm"
              data-testid={`uninstall-open-request-${req.requestId}`}
            >
              <span className="inline-flex items-center rounded-full border border-state-warning-border bg-state-warning-bg px-2 py-0.5 text-xs text-state-warning-text">
                {t(`endpointAdmin.drawer.uninstall.state.${req.state}`)}
              </span>
              <a
                href={`${approvalsPath}/uninstall/${encodeURIComponent(
                  device.id,
                )}/${encodeURIComponent(req.requestId)}`}
                data-testid={`uninstall-open-request-link-${req.requestId}`}
                className="text-primary text-xs underline"
              >
                {t('endpointAdmin.drawer.uninstall.openRequests.approveLink')}
              </a>
              <span className="text-xs text-text-secondary">{formatTimestamp(req.createdAt)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const renderRecentUninstalls = () => {
    if (isUninstallAuditLoading) {
      return (
        <p className="text-sm text-text-secondary py-2" data-testid="uninstall-audit-loading">
          {t('endpointAdmin.drawer.uninstall.recentUninstalls.loading')}
        </p>
      );
    }
    if (uninstallAuditRows.length === 0) {
      return (
        <p className="text-sm text-text-secondary py-2" data-testid="uninstall-audit-empty">
          {t('endpointAdmin.drawer.uninstall.recentUninstalls.empty')}
        </p>
      );
    }
    return (
      <div className="rounded-md border border-border-default overflow-hidden">
        <table className="w-full text-sm" data-testid="uninstall-audit-table">
          <thead className="bg-surface-muted text-text-secondary text-xs">
            <tr>
              <th className="text-left px-3 py-2">
                {t('endpointAdmin.drawer.uninstall.recentUninstalls.col.result')}
              </th>
              <th className="text-left px-3 py-2">
                {t('endpointAdmin.drawer.uninstall.recentUninstalls.col.verification')}
              </th>
              <th className="text-left px-3 py-2">
                {t('endpointAdmin.drawer.uninstall.recentUninstalls.col.exitCode')}
              </th>
              <th className="text-left px-3 py-2">
                {t('endpointAdmin.drawer.uninstall.recentUninstalls.col.reportedAt')}
              </th>
            </tr>
          </thead>
          <tbody>
            {uninstallAuditRows.map((row) => (
              <tr
                key={row.auditId}
                className="border-t border-border-subtle"
                data-testid={`uninstall-audit-row-${row.auditId}`}
              >
                <td className="px-3 py-2">
                  <UninstallResultStatusBadge
                    value={row.resultStatus}
                    testIdPrefix={`uninstall-audit-result-${row.auditId}`}
                  />
                </td>
                <td className="px-3 py-2">
                  <UninstallVerificationBadge
                    value={row.verification}
                    testIdPrefix={`uninstall-audit-verification-${row.auditId}`}
                  />
                </td>
                <td className="px-3 py-2 font-mono text-xs text-text-secondary">
                  {row.exitCode === null ? '—' : row.exitCode}
                </td>
                <td className="px-3 py-2 text-xs text-text-secondary">
                  {formatTimestamp(row.reportedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="px-6 py-4 space-y-6" data-testid="device-software-catalog-tab">
      {toast && (
        <div
          role="status"
          data-testid="software-catalog-toast"
          className={`rounded-md border px-4 py-2 text-sm ${
            toast.kind === 'success'
              ? 'border-state-success-border bg-state-success-bg text-state-success-text'
              : 'border-state-danger-border bg-state-danger-bg text-state-danger-text'
          }`}
        >
          {toast.message}
        </div>
      )}

      <section>
        <h4 className="text-sm font-semibold uppercase tracking-wider text-text-secondary mb-1">
          {t('endpointAdmin.drawer.softwareCatalog.heading')}
        </h4>
        <p className="text-xs text-text-secondary mb-3">
          {t('endpointAdmin.drawer.softwareCatalog.subtitle')}
        </p>
        {renderCatalog()}
      </section>

      <section>
        <h4 className="text-sm font-semibold uppercase tracking-wider text-text-secondary mb-2">
          {t('endpointAdmin.drawer.softwareCatalog.recentInstalls.heading')}
        </h4>
        {renderRecentInstalls()}
      </section>

      <section>
        <h4 className="text-sm font-semibold uppercase tracking-wider text-text-secondary mb-2">
          {t('endpointAdmin.drawer.uninstall.recentUninstalls.heading')}
        </h4>
        <div className="space-y-2">
          {renderOpenUninstalls()}
          {renderRecentUninstalls()}
        </div>
      </section>

      {selected && (
        <React.Suspense fallback={null}>
          <InstallPreflightModal
            open={selected !== null}
            deviceId={device.id}
            catalogItemId={selected.catalogItemId}
            catalogDisplayName={selected.displayName}
            onClose={closeInstallModal}
            onInstalled={handleInstalled}
          />
        </React.Suspense>
      )}

      {uninstallSelected && (
        <React.Suspense fallback={null}>
          <UninstallConfirmModal
            open={uninstallSelected !== null}
            deviceId={device.id}
            catalogItemId={uninstallSelected.catalogItemId}
            catalogDisplayName={uninstallSelected.displayName}
            onClose={closeUninstallModal}
            onProposed={handleProposedUninstall}
          />
        </React.Suspense>
      )}
    </div>
  );
};

SoftwareCatalogTab.displayName = 'SoftwareCatalogTab';
