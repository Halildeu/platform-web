import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  useApproveUninstallMutation,
  useListUninstallRequestsQuery,
} from '../../app/services/endpointAdminApi';
import { useCurrentEndpointAdminActor } from '../../app/services/useCurrentEndpointAdminActor';
import {
  readErrorDetail,
  readErrorStatus,
  UNINSTALL_ERROR_HEADLINE_FALLBACK_KEY,
  UNINSTALL_ERROR_HEADLINE_KEY,
  type AdminUninstallRequestResponse,
} from '../../entities/endpoint-uninstall/types';
import { useEndpointAdminI18n } from '../../i18n';

/**
 * AG-028 Phase 3 — domain-specific, APPROVE-ONLY uninstall approval page
 * (Codex 019e93a4 plan point #5 + 019e93ab routing/guard ruling).
 *
 * Reached from the device drawer's "Onay bekliyor" deep-link:
 *   /endpoint-admin/approvals/uninstall/:deviceId/:requestId
 *
 * Why a dedicated page (not the generic ApprovalCaseView):
 *  - The uninstall endpoints are device-scoped; there is NO fleet-wide
 *    "list all pending uninstalls" API, so the generic mock inbox can't
 *    enumerate them. The drawer's per-device open-request list is the
 *    only truthful index; each row links here.
 *  - Uninstall is APPROVE-ONLY — there is NO reject/delegate/correction
 *    endpoint. Reusing the generic view (which renders Reddet / Düzeltme
 *    iste / Devret) would imply affordances the backend doesn't support.
 *
 * Self-approve guard (Codex 019e93ab must-fix): the disable check uses
 * the CANONICAL authenticated subject (JWT `sub` via
 * useCurrentEndpointAdminActor) compared to `request.createdBy` — NEVER
 * the policy-pilot mock CURRENT_USER. The client guard is UX only: a
 * backend 403 (maker-checker) is ALWAYS caught + surfaced, even when the
 * client subject can't be resolved.
 */
export const UninstallApprovalPage: React.FC = () => {
  const { deviceId, requestId } = useParams<{ deviceId: string; requestId: string }>();
  const navigate = useNavigate();
  const { t } = useEndpointAdminI18n();
  const { subject: currentSubject } = useCurrentEndpointAdminActor();

  const [reason, setReason] = React.useState('');
  const [errorState, setErrorState] = React.useState<{ headline: string; detail: string } | null>(
    null,
  );
  const [approved, setApproved] = React.useState(false);

  const listQuery = useListUninstallRequestsQuery(
    { deviceId: deviceId ?? '', page: 0, size: 50 },
    { skip: !deviceId },
  );
  const [approveUninstall, approveState] = useApproveUninstallMutation();

  const request: AdminUninstallRequestResponse | undefined = React.useMemo(() => {
    if (!listQuery.data || !requestId) return undefined;
    return listQuery.data.find((r) => r.requestId === requestId);
  }, [listQuery.data, requestId]);

  const mapError = (err: unknown): { headline: string; detail: string } => {
    const status = readErrorStatus(err);
    // Approve context: a 403 is a maker-checker / forbidden-approver error,
    // NOT the propose-time "no permission to create" headline. Use the
    // approval-specific key; all other statuses share the uninstall map.
    const headlineKey =
      status === 403
        ? 'endpointAdmin.uninstallApproval.error.forbidden'
        : status !== null && UNINSTALL_ERROR_HEADLINE_KEY[status]
          ? UNINSTALL_ERROR_HEADLINE_KEY[status]
          : UNINSTALL_ERROR_HEADLINE_FALLBACK_KEY;
    return {
      headline: t(headlineKey),
      detail: readErrorDetail(err) ?? t('endpointAdmin.drawer.uninstall.error.genericDetail'),
    };
  };

  const handleApprove = async () => {
    if (!deviceId || !requestId || approveState.isLoading) return;
    setErrorState(null);
    try {
      await approveUninstall({
        deviceId,
        requestId,
        body: reason.trim() ? { reason: reason.trim() } : {},
      }).unwrap();
      setApproved(true);
    } catch (err: unknown) {
      setErrorState(mapError(err));
    }
  };

  if (!deviceId || !requestId) {
    return (
      <div className="p-6 max-w-2xl" data-testid="uninstall-approval-bad-params">
        <h1 className="text-xl font-semibold">{t('endpointAdmin.uninstallApproval.notFound')}</h1>
      </div>
    );
  }

  const isLoading = listQuery.isLoading;
  // Codex 019e93d2 must-fix #2 — fail-SAFE: an unresolved client subject
  // (bearer token absent / undecodable) must DISABLE approve; we must not
  // let an unidentified actor approve. The backend 403 stays authoritative.
  const actorResolved = Boolean(currentSubject);
  // Self-approve guard: treat as self-approval only when BOTH the canonical
  // client subject AND createdBy are resolvable AND they match.
  const isSelfApproval = Boolean(
    request && currentSubject && request.createdBy && request.createdBy === currentSubject,
  );
  const isPending = request?.state === 'PENDING_APPROVAL';
  // Approve is permitted only when the request is still PENDING_APPROVAL,
  // the active admin identity is resolved, it is not a (client-detected)
  // self-approval, and no submit is in flight (double-submit guard).
  const approveDisabled =
    !isPending || !actorResolved || isSelfApproval || approveState.isLoading || approved;

  const renderBody = () => {
    if (isLoading) {
      return (
        <p className="text-sm text-text-secondary py-4" data-testid="uninstall-approval-loading">
          {t('endpointAdmin.uninstallApproval.loading')}
        </p>
      );
    }
    if (!request) {
      return (
        <div className="space-y-3" data-testid="uninstall-approval-not-found">
          <p className="text-sm text-text-secondary py-2">
            {t('endpointAdmin.uninstallApproval.notFound')}
          </p>
          <button
            type="button"
            onClick={() => navigate('..')}
            className="rounded-lg border border-border-subtle px-3 py-1.5 text-sm"
          >
            {t('endpointAdmin.uninstallApproval.back')}
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-4" data-testid="uninstall-approval-detail">
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-text-secondary">
            {t('endpointAdmin.uninstallApproval.field.state')}
          </dt>
          <dd data-testid="uninstall-approval-state">
            {t(`endpointAdmin.drawer.uninstall.state.${request.state}`)}
          </dd>
          <dt className="text-text-secondary">
            {t('endpointAdmin.uninstallApproval.field.createdBy')}
          </dt>
          <dd className="font-mono text-xs" data-testid="uninstall-approval-created-by">
            {request.createdBy}
          </dd>
          <dt className="text-text-secondary">
            {t('endpointAdmin.uninstallApproval.field.requestId')}
          </dt>
          <dd className="font-mono text-xs">{request.requestId}</dd>
          <dt className="text-text-secondary">
            {t('endpointAdmin.uninstallApproval.field.proposeReason')}
          </dt>
          <dd data-testid="uninstall-approval-propose-reason">{request.reason ?? '—'}</dd>
        </dl>

        {!isPending && (
          <p
            className="rounded-md border border-border-default bg-surface-muted px-3 py-2 text-sm text-text-secondary"
            data-testid="uninstall-approval-not-pending"
          >
            {t('endpointAdmin.uninstallApproval.notPending')}
          </p>
        )}

        {isPending && !actorResolved && !isSelfApproval && (
          <p
            className="rounded-md border border-state-warning-border bg-state-warning-bg px-3 py-2 text-sm text-state-warning-text"
            data-testid="uninstall-approval-actor-unverified"
          >
            {t('endpointAdmin.uninstallApproval.actorUnverified')}
          </p>
        )}

        {isSelfApproval && (
          <p
            className="rounded-md border border-state-warning-border bg-state-warning-bg px-3 py-2 text-sm text-state-warning-text"
            data-testid="uninstall-approval-self"
          >
            {t('endpointAdmin.uninstallApproval.selfApproveBlocked')}
          </p>
        )}

        {approved && (
          <p
            role="status"
            className="rounded-md border border-state-success-border bg-state-success-bg px-3 py-2 text-sm text-state-success-text"
            data-testid="uninstall-approval-success"
          >
            {t('endpointAdmin.uninstallApproval.approved')}
          </p>
        )}

        {errorState && (
          <div
            role="alert"
            className="rounded-md border border-state-danger-border bg-state-danger-bg px-3 py-2 text-sm text-state-danger-text"
            data-testid="uninstall-approval-error"
          >
            <p className="font-medium" data-testid="uninstall-approval-error-headline">
              {errorState.headline}
            </p>
            <p className="mt-0.5 text-xs" data-testid="uninstall-approval-error-detail">
              {errorState.detail}
            </p>
          </div>
        )}

        {isPending && !approved && (
          <label className="block">
            <span className="text-sm text-text-secondary block mb-1">
              {t('endpointAdmin.uninstallApproval.reason.label')}
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('endpointAdmin.uninstallApproval.reason.placeholder')}
              data-testid="uninstall-approval-reason"
              rows={3}
              maxLength={512}
              className="w-full rounded-md border border-border-default px-3 py-2 text-sm bg-surface-default"
            />
            <div className="text-right text-xs text-text-subtle mt-1">{reason.length}/512</div>
          </label>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleApprove}
            disabled={approveDisabled}
            data-testid="uninstall-approval-approve"
            className="px-4 py-2 rounded-md bg-primary text-white text-sm font-medium disabled:opacity-50"
          >
            {t('endpointAdmin.uninstallApproval.approve')}
          </button>
          <button
            type="button"
            onClick={() => navigate('..')}
            className="px-4 py-2 rounded-md border border-border-default text-sm text-text-primary"
            data-testid="uninstall-approval-back"
          >
            {t('endpointAdmin.uninstallApproval.back')}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 max-w-2xl" data-testid="uninstall-approval-page">
      <h1 className="text-2xl font-semibold mb-1">
        {t('endpointAdmin.uninstallApproval.heading')}
      </h1>
      <p className="text-sm text-text-secondary mb-4">
        {t('endpointAdmin.uninstallApproval.subtitle')}
      </p>
      {renderBody()}
    </div>
  );
};

export default UninstallApprovalPage;
