import React from 'react';

import {
  useListCatalogItemsQuery,
  useListInstallAuditsQuery,
} from '../../../app/services/endpointAdminApi';
import type { AdminCatalogItemSummary } from '../../../entities/endpoint-software-catalog/types';
import type { EndpointDevice } from '../../../entities/endpoint-device/types';
import type {
  CreateInstallSuccess,
  EndpointInstallAuditDto,
  InstallPostVerification,
  InstallPreflightDecisionRecorded,
} from '../../../entities/endpoint-install/types';
import { useEndpointAdminI18n } from '../../../i18n';

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

/**
 * WEB-014D — Software catalog tab for the device detail drawer (Faz
 * 22.5; Codex 019e6fd1 plan-time PARTIAL absorb).
 *
 * Reads two queries — both skipped until `active`:
 *  - useListCatalogItemsQuery({ status: APPROVED, enabled: true, size:
 *    200 }) for the install picker. Backend caps at 200 per page;
 *    server-side typeahead is a separate backlog (Codex iter §B).
 *  - useListInstallAuditsQuery({ deviceId, page: 0, size: 10 }) for
 *    the "Son Kurulumlar" panel. Auto-refetches on createInstall via
 *    the `EndpointInstallAudit:device-{id}` invalidation tag.
 *
 * Selecting an item opens the InstallPreflightModal in a nested
 * overlay layer (LIFO ESC closes the modal before the BottomSheet).
 */
export interface SoftwareCatalogTabProps {
  device: EndpointDevice;
  active: boolean;
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

interface SelectedItem {
  catalogItemId: string;
  displayName: string;
}

export const SoftwareCatalogTab: React.FC<SoftwareCatalogTabProps> = ({ device, active }) => {
  const { t } = useEndpointAdminI18n();
  const [selected, setSelected] = React.useState<SelectedItem | null>(null);
  const [toast, setToast] = React.useState<ToastState | null>(null);

  // Clear transient toast when tab becomes inactive or device changes.
  React.useEffect(() => {
    if (!active) {
      setToast(null);
      setSelected(null);
    }
  }, [active]);
  React.useEffect(() => {
    setToast(null);
    setSelected(null);
  }, [device.id]);

  const catalogQuery = useListCatalogItemsQuery(
    { status: 'APPROVED', enabled: true, page: 0, size: 200 },
    { skip: !active },
  );

  // Codex 019e6fe4 must-fix #3: the install audit row is created only
  // when the agent reports a terminal install result
  // (EndpointInstallAuditService writes from
  // EndpointAgentCommandService#reportResult). The `createInstall`
  // invalidation refetches immediately on POST, before the row exists;
  // the agent's later report does NOT trigger a fresh RTK tag
  // invalidation. The IslemlerTab command-list poll is on a different
  // cache.
  //
  // WEB-014D perf follow-up: poll interval relaxed from 10 s to 30 s.
  // Terminal install results from the Windows agent typically arrive
  // 5–60 s after the POST; a 30 s tab-active poll still surfaces them
  // promptly while cutting the background request rate by 3×.
  const installAuditQuery = useListInstallAuditsQuery(
    { deviceId: device.id, page: 0, size: 10 },
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

  const isOnline = device.status === 'ONLINE';

  const openInstallModal = (item: AdminCatalogItemSummary) => {
    setSelected({
      catalogItemId: item.catalogItemId,
      displayName: item.displayName,
    });
  };

  const closeInstallModal = () => {
    setSelected(null);
  };

  const handleInstalled = (command: CreateInstallSuccess) => {
    setSelected(null);
    setToast({
      kind: 'success',
      message: t('endpointAdmin.drawer.install.toast.success').replace('{commandId}', command.id),
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
            {catalogItems.map((item) => (
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
                </td>
              </tr>
            ))}
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
    </div>
  );
};

SoftwareCatalogTab.displayName = 'SoftwareCatalogTab';
