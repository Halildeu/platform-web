import React from 'react';

import {
  useApproveEndpointCommandMutation,
  useListEndpointCommandsQuery,
} from '../../app/services/endpointAdminApi';
import { useCurrentEndpointAdminActor } from '../../app/services/useCurrentEndpointAdminActor';
import type { ApprovalDecision, EndpointCommand } from '../../entities/endpoint-command/types';
import { useEndpointAdminI18n } from '../../i18n';

/**
 * BE-017 — dual-control inbox for destructive endpoint commands.
 *
 * Board: platform-web#982. The backend has enforced dual control since
 * BE-017 (`POST /endpoint-commands/{id}/approval`, approver ≠ issuer,
 * covered by `EndpointAdminCommandDualControlTest`), and the device drawer
 * has always been able to *raise* a lock / unlock / local-password /
 * credential-rotation command. Nothing could ever record the second
 * decision, so every one of those commands sat PENDING forever and the four
 * highest-risk actions were startable but not completable from the product.
 *
 * Why a dedicated page rather than the generic `ApprovalInboxPage`: that
 * inbox still runs on the policy-change pilot's mock actor and
 * browser-localStorage store. Mixing a real, server-enforced maker-checker
 * queue into a mock surface would make it impossible to tell which rows are
 * authoritative.
 *
 * Self-approve guard: the disable check compares the CANONICAL authenticated
 * subject (JWT `sub` via `useCurrentEndpointAdminActor`) with the command's
 * `issuedBySubject`. That guard is UX only — the backend 403 is always caught
 * and surfaced, including when the client subject cannot be resolved.
 */

const PENDING_POLL_MS = 30_000;

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

/**
 * Destructive commands carry the affected local account in
 * `payload.username`. Surfacing it is the whole point of a second pair of
 * eyes — "lock a user" is not reviewable without knowing which user.
 */
function readTargetUsername(payload: Record<string, unknown> | null): string | null {
  const value = payload?.username;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Only dual-control command types have a translated label today. A future
 * type that starts requiring approval must still be readable here, so an
 * unmapped key falls back to the raw type rather than rendering the key.
 */
function describeCommandType(type: string, t: (key: string) => string): string {
  const key = `endpointAdmin.modal.title.${type}`;
  const translated = t(key);
  return translated === key ? type : translated;
}

export const CommandApprovalInboxPage: React.FC = () => {
  const { t } = useEndpointAdminI18n();
  const { subject: currentSubject } = useCurrentEndpointAdminActor();

  const listQuery = useListEndpointCommandsQuery(undefined, {
    pollingInterval: PENDING_POLL_MS,
  });
  const [approveCommand, approveState] = useApproveEndpointCommandMutation();

  const [openId, setOpenId] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<{ commandId: string; message: string } | null>(null);
  const [done, setDone] = React.useState<{ commandId: string; decision: ApprovalDecision } | null>(
    null,
  );

  const pending: EndpointCommand[] = React.useMemo(
    () => (listQuery.data ?? []).filter((c) => c.approvalStatus === 'PENDING'),
    [listQuery.data],
  );

  const trimmedReason = reason.trim();
  const reasonTooLong = trimmedReason.length > 512;

  const submit = async (command: EndpointCommand, decision: ApprovalDecision) => {
    // The backend requires a reason for REJECT and accepts one for APPROVE.
    if (decision === 'REJECT' && !trimmedReason) return;
    if (reasonTooLong) return;
    setError(null);
    try {
      await approveCommand({
        commandId: command.id,
        deviceId: command.deviceId,
        body: { decision, ...(trimmedReason ? { reason: trimmedReason } : {}) },
      }).unwrap();
      setDone({ commandId: command.id, decision });
      setOpenId(null);
      setReason('');
    } catch (e) {
      // 403 is the maker-checker gate doing its job, not a malfunction —
      // it deserves its own sentence rather than a generic failure toast.
      const status = (e as { status?: number } | undefined)?.status;
      setError({
        commandId: command.id,
        message:
          status === 403
            ? t('endpointAdmin.commandApproval.error.selfApprove')
            : status === 409
              ? t('endpointAdmin.commandApproval.error.conflict')
              : t('endpointAdmin.commandApproval.error.generic'),
      });
    }
  };

  if (listQuery.isLoading) {
    return (
      <p className="p-4 text-sm text-text-secondary" data-testid="command-approval-loading">
        {t('endpointAdmin.commandApproval.loading')}
      </p>
    );
  }

  if (listQuery.isError) {
    return (
      <p className="p-4 text-sm text-state-danger-text" data-testid="command-approval-error">
        {t('endpointAdmin.commandApproval.loadError')}
      </p>
    );
  }

  return (
    <section className="p-4 space-y-4" data-testid="command-approval-inbox">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold text-text-primary">
          {t('endpointAdmin.commandApproval.title')}
        </h1>
        <p className="text-sm text-text-secondary">{t('endpointAdmin.commandApproval.subtitle')}</p>
      </header>

      {pending.length === 0 ? (
        <p className="text-sm text-text-secondary" data-testid="command-approval-empty">
          {t('endpointAdmin.commandApproval.empty')}
        </p>
      ) : (
        <ul className="space-y-3" data-testid="command-approval-list">
          {pending.map((c) => {
            const isOwn = !!currentSubject && c.issuedBySubject === currentSubject;
            const username = readTargetUsername(c.payload);
            const open = openId === c.id;
            return (
              <li
                key={c.id}
                className="rounded-md border border-border-default p-3 space-y-2"
                data-testid={`command-approval-row-${c.id}`}
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-sm font-medium text-text-primary">
                    {describeCommandType(c.type, t)}
                  </span>
                  {username && (
                    <span
                      className="font-mono text-xs text-text-secondary"
                      data-testid={`command-approval-username-${c.id}`}
                    >
                      {username}
                    </span>
                  )}
                  <span className="text-xs text-text-subtle">
                    {t('endpointAdmin.commandApproval.issuedBy')} {c.issuedBySubject ?? '—'} ·{' '}
                    {formatTimestamp(c.issuedAt)}
                  </span>
                </div>
                <div className="font-mono text-xs text-text-subtle">{c.deviceId}</div>

                {isOwn && (
                  <p
                    className="text-xs text-state-warning-text"
                    data-testid={`command-approval-own-${c.id}`}
                  >
                    {t('endpointAdmin.commandApproval.ownCommand')}
                  </p>
                )}

                {done?.commandId === c.id && (
                  <p
                    className="text-xs text-state-success-text"
                    data-testid={`command-approval-done-${c.id}`}
                  >
                    {t(`endpointAdmin.commandApproval.done.${done.decision}`)}
                  </p>
                )}

                {error?.commandId === c.id && (
                  <p
                    role="alert"
                    className="text-xs text-state-danger-text"
                    data-testid={`command-approval-error-${c.id}`}
                  >
                    {error.message}
                  </p>
                )}

                {open ? (
                  <div className="space-y-2">
                    <label className="block">
                      <span className="text-xs text-text-secondary block mb-1">
                        {t('endpointAdmin.commandApproval.reasonLabel')}
                      </span>
                      <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={2}
                        maxLength={600}
                        aria-invalid={reasonTooLong}
                        data-testid={`command-approval-reason-${c.id}`}
                        className="w-full rounded-md border border-border-default px-3 py-2 text-sm bg-surface-default"
                      />
                      {reasonTooLong && (
                        <span className="text-xs text-state-danger-text">
                          {t('endpointAdmin.modal.reasonTooLong')}
                        </span>
                      )}
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={isOwn || approveState.isLoading || reasonTooLong}
                        onClick={() => submit(c, 'APPROVE')}
                        data-testid={`command-approval-approve-${c.id}`}
                        className="px-3 py-1.5 rounded-md bg-brand-primary text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {t('endpointAdmin.commandApproval.approve')}
                      </button>
                      <button
                        type="button"
                        disabled={
                          isOwn || approveState.isLoading || reasonTooLong || !trimmedReason
                        }
                        onClick={() => submit(c, 'REJECT')}
                        data-testid={`command-approval-reject-${c.id}`}
                        className="px-3 py-1.5 rounded-md border border-state-danger-border text-state-danger-text text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {t('endpointAdmin.commandApproval.reject')}
                      </button>
                      {!trimmedReason && (
                        <span className="text-xs text-text-secondary">
                          {t('endpointAdmin.commandApproval.rejectNeedsReason')}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setOpenId(null);
                          setReason('');
                        }}
                        data-testid={`command-approval-cancel-${c.id}`}
                        className="px-3 py-1.5 rounded-md border border-border-default text-sm text-text-primary"
                      >
                        {t('endpointAdmin.modal.cancel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setOpenId(c.id);
                      setReason('');
                      setError(null);
                    }}
                    data-testid={`command-approval-open-${c.id}`}
                    className="px-3 py-1.5 rounded-md border border-border-default text-sm text-text-primary"
                  >
                    {t('endpointAdmin.commandApproval.decide')}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

CommandApprovalInboxPage.displayName = 'CommandApprovalInboxPage';

export default CommandApprovalInboxPage;
