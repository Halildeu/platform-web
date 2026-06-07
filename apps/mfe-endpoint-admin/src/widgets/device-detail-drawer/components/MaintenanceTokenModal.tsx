import React from 'react';
import {
  registerLayer,
  unregisterLayer,
  useEscapeKey,
  useFocusTrap,
  useScrollLock,
  useSiblingIsolation,
} from '@mfe/design-system/internal/overlay-engine';
import { useEndpointAdminI18n } from '../../../i18n';
import {
  useCreateMaintenanceTokenMutation,
  useListMaintenanceTokensQuery,
  useRevokeMaintenanceTokenMutation,
} from '../../../app/services/endpointAdminApi';
import type {
  MaintenanceAction,
  MaintenanceTokenStatus,
} from '../../../entities/maintenance-token/types';

export interface MaintenanceTokenModalProps {
  open: boolean;
  deviceId: string;
  onClose: () => void;
}

const ACTIONS: MaintenanceAction[] = ['STOP_AGENT', 'UNINSTALL_AGENT'];
const EXPIRY_PRESETS = [15, 60, 480, 1440, 10080];
const MAX_REASON = 512;

/**
 * BE-027 — maintenance-token manager.
 *
 * SECURITY: a maintenance token is a one-time short-lived secret. The backend
 * hashes it at rest and returns the cleartext value ONLY in the create response.
 * This component reveals it exactly once (`revealed` state) with a copy button +
 * a "won't be shown again" warning, and drops it from memory on dismiss/close.
 * The cleartext is never logged, persisted, placed in a URL, or re-fetched.
 */
export const MaintenanceTokenModal: React.FC<MaintenanceTokenModalProps> = ({
  open,
  deviceId,
  onClose,
}) => {
  const { t } = useEndpointAdminI18n();
  const layerId = React.useId();

  const [action, setAction] = React.useState<MaintenanceAction>('STOP_AGENT');
  const [reason, setReason] = React.useState('');
  const [expiresInMinutes, setExpiresInMinutes] = React.useState(60);
  const [submitted, setSubmitted] = React.useState(false);
  // The one-time cleartext secret. Lives ONLY here; cleared on dismiss/close.
  const [revealed, setRevealed] = React.useState<{ token: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [revokeId, setRevokeId] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const { data: tokens, isLoading } = useListMaintenanceTokensQuery({ deviceId }, { skip: !open });
  const [create, { isLoading: creating, reset: resetCreate }] = useCreateMaintenanceTokenMutation();
  const [revoke, { isLoading: revoking }] = useRevokeMaintenanceTokenMutation();

  const panelRef = useFocusTrap({ active: open, autoFocus: true, restoreFocus: true, layerId });
  useSiblingIsolation({ active: open, layerId, panelRef });
  useScrollLock(open);
  React.useEffect(() => {
    if (open) registerLayer(layerId, 'modal');
    return () => {
      if (open) unregisterLayer(layerId);
    };
  }, [open, layerId]);

  // Drop the cleartext secret whenever the modal closes — defence in depth on
  // top of the parent's conditional unmount.
  const dismiss = React.useCallback(() => {
    setRevealed(null);
    setCopied(false);
    // Clear the RTK Query mutation cache too — the create response held the
    // cleartext token; without reset() it would linger in the Redux store.
    resetCreate();
    onClose();
  }, [onClose, resetCreate]);
  useEscapeKey(open, dismiss, { layerId });

  if (!open) return null;

  const reasonInvalid = reason.trim().length === 0 || reason.length > MAX_REASON;
  const expiryInvalid = expiresInMinutes < 1 || expiresInMinutes > 10080;
  const formInvalid = reasonInvalid || expiryInvalid;

  const statusBadge = (s: MaintenanceTokenStatus): string => {
    const base = 'text-xs rounded px-1.5 py-0.5 ';
    if (s === 'PENDING') return base + 'bg-state-warning-subtle text-state-warning-text';
    if (s === 'CONSUMED') return base + 'bg-state-success-subtle text-state-success-text';
    return base + 'bg-surface-subtle text-text-secondary';
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setActionError(null);
    if (formInvalid) return;
    try {
      const res = await create({
        deviceId,
        body: { action, reason: reason.trim(), expiresInMinutes },
      }).unwrap();
      // Reveal ONCE. Do not log res.token.
      setRevealed({ token: res.token, expiresAt: res.expiresAt });
      setCopied(false);
      setReason('');
      setSubmitted(false);
      // Immediately drop the cleartext from the RTK Query mutation cache so the
      // secret lives only in `revealed` state (mirrors CreateEnrollmentDialog).
      resetCreate();
    } catch {
      setActionError(t('endpointAdmin.maint.create.error'));
    }
  };

  const handleCopy = async () => {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed.token);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const handleRevoke = async (tokenId: string) => {
    setActionError(null);
    try {
      await revoke({ tokenId, deviceId }).unwrap();
      setRevokeId(null);
    } catch {
      setActionError(t('endpointAdmin.maint.revoke.error'));
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('endpointAdmin.maint.title')}
      data-testid="maintenance-token-modal"
      data-layer-id={layerId}
      className="fixed inset-0 z-[1400] flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-surface-overlay/60" onClick={dismiss} aria-hidden />
      <div
        ref={panelRef as unknown as React.RefObject<HTMLDivElement>}
        tabIndex={-1}
        className="relative w-full max-w-2xl bg-surface-default rounded-xl shadow-2xl p-6 mx-4 space-y-4 max-h-[85vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-primary">
            {t('endpointAdmin.maint.title')}
          </h3>
          <button
            type="button"
            onClick={dismiss}
            data-testid="maintenance-close"
            className="text-text-secondary hover:text-text-primary text-xl leading-none"
            aria-label={t('endpointAdmin.modal.cancel')}
          >
            ×
          </button>
        </div>

        {/* ONE-TIME reveal — shown only immediately after a successful create. */}
        {revealed && (
          <div
            data-testid="maintenance-reveal"
            className="rounded-lg border-2 border-state-warning-border bg-state-warning-subtle p-4 space-y-2"
          >
            <p className="text-sm font-semibold text-state-warning-text">
              {t('endpointAdmin.maint.reveal.warning')}
            </p>
            <div className="flex items-center gap-2">
              <code
                data-testid="maintenance-reveal-value"
                className="flex-1 font-mono text-sm bg-surface-default rounded px-3 py-2 break-all select-all border border-border-default"
              >
                {revealed.token}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                data-testid="maintenance-reveal-copy"
                className="px-3 py-2 rounded-md bg-brand-primary text-white text-sm font-medium whitespace-nowrap"
              >
                {copied
                  ? t('endpointAdmin.maint.reveal.copied')
                  : t('endpointAdmin.maint.reveal.copy')}
              </button>
            </div>
            <p className="text-xs text-text-secondary">
              {t('endpointAdmin.maint.reveal.expiresAt')}:{' '}
              {new Date(revealed.expiresAt).toLocaleString()}
            </p>
            <button
              type="button"
              onClick={() => {
                setRevealed(null);
                setCopied(false);
                resetCreate();
              }}
              data-testid="maintenance-reveal-dismiss"
              className="px-4 py-2 rounded-md border border-border-default text-sm text-text-primary"
            >
              {t('endpointAdmin.maint.reveal.ack')}
            </button>
          </div>
        )}

        {actionError && (
          <p role="alert" data-testid="maintenance-action-error" className="text-sm text-danger">
            {actionError}
          </p>
        )}

        {/* Create form — hidden while a fresh secret is being revealed. */}
        {!revealed && (
          <form onSubmit={handleCreate} data-testid="maintenance-create-form" className="space-y-3">
            <h4 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
              {t('endpointAdmin.maint.create.heading')}
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm text-text-secondary block mb-1">
                  {t('endpointAdmin.maint.field.action')}
                </span>
                <select
                  value={action}
                  onChange={(e) => setAction(e.target.value as MaintenanceAction)}
                  data-testid="maintenance-field-action"
                  className="w-full rounded-md border border-border-default px-3 py-2 text-sm bg-surface-default"
                >
                  {ACTIONS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm text-text-secondary block mb-1">
                  {t('endpointAdmin.maint.field.expiry')}
                </span>
                <select
                  value={expiresInMinutes}
                  onChange={(e) => setExpiresInMinutes(Number(e.target.value))}
                  data-testid="maintenance-field-expiry"
                  className="w-full rounded-md border border-border-default px-3 py-2 text-sm bg-surface-default"
                >
                  {EXPIRY_PRESETS.map((m) => (
                    <option key={m} value={m}>
                      {t(`endpointAdmin.maint.expiry.${m}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {action === 'UNINSTALL_AGENT' && (
              <p
                className="text-xs text-state-warning-text"
                data-testid="maintenance-uninstall-warning"
              >
                {t('endpointAdmin.maint.uninstallWarning')}
              </p>
            )}
            <label className="block">
              <span className="text-sm text-text-secondary block mb-1">
                {t('endpointAdmin.maint.field.reason')}
              </span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={MAX_REASON}
                data-testid="maintenance-field-reason"
                aria-invalid={submitted && reasonInvalid}
                className={`w-full rounded-md border px-3 py-2 text-sm bg-surface-default ${
                  submitted && reasonInvalid ? 'border-danger' : 'border-border-default'
                }`}
              />
            </label>
            {submitted && formInvalid && (
              <p className="text-xs text-danger" data-testid="maintenance-validation">
                {t('endpointAdmin.maint.create.validation')}
              </p>
            )}
            <button
              type="submit"
              disabled={creating}
              data-testid="maintenance-create-submit"
              className="px-4 py-2 rounded-md bg-brand-primary text-white text-sm font-medium disabled:opacity-50"
            >
              {t('endpointAdmin.maint.create.submit')}
            </button>
          </form>
        )}

        {/* Existing tokens — metadata only (no cleartext). */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
            {t('endpointAdmin.maint.list.heading')}
          </h4>
          {isLoading && <p className="text-sm text-text-secondary">…</p>}
          {!isLoading && (tokens?.length ?? 0) === 0 && (
            <p className="text-sm text-text-secondary" data-testid="maintenance-empty">
              {t('endpointAdmin.maint.list.empty')}
            </p>
          )}
          {!isLoading && (tokens?.length ?? 0) > 0 && (
            <table className="w-full text-sm" data-testid="maintenance-table">
              <thead>
                <tr className="text-left text-text-secondary border-b border-border-subtle">
                  <th className="py-1">{t('endpointAdmin.maint.col.action')}</th>
                  <th>{t('endpointAdmin.maint.col.status')}</th>
                  <th>{t('endpointAdmin.maint.col.reason')}</th>
                  <th>{t('endpointAdmin.maint.col.expiresAt')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tokens!.map((tok) => (
                  <tr
                    key={tok.id}
                    className="border-b border-border-subtle"
                    data-testid={`maintenance-row-${tok.id}`}
                  >
                    <td className="py-1 font-mono">{tok.action}</td>
                    <td>
                      <span className={statusBadge(tok.status)}>{tok.status}</span>
                    </td>
                    <td className="max-w-[14rem] truncate" title={tok.reason}>
                      {tok.reason}
                    </td>
                    <td>{new Date(tok.expiresAt).toLocaleString()}</td>
                    <td>
                      {tok.status === 'PENDING' &&
                        (revokeId === tok.id ? (
                          <span className="inline-flex gap-1">
                            <button
                              type="button"
                              onClick={() => handleRevoke(tok.id)}
                              disabled={revoking}
                              data-testid={`maintenance-revoke-confirm-${tok.id}`}
                              className="text-xs px-2 py-1 rounded bg-danger text-white disabled:opacity-50"
                            >
                              {t('endpointAdmin.maint.revoke.confirm')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setRevokeId(null)}
                              className="text-xs px-2 py-1 rounded border border-border-default"
                            >
                              {t('endpointAdmin.modal.cancel')}
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setRevokeId(tok.id)}
                            data-testid={`maintenance-revoke-${tok.id}`}
                            className="text-xs px-2 py-1 rounded border border-danger text-danger"
                          >
                            {t('endpointAdmin.maint.action.revoke')}
                          </button>
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

MaintenanceTokenModal.displayName = 'MaintenanceTokenModal';
