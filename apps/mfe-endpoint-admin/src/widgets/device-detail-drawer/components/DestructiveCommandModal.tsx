import React from 'react';
import type {
  CommandType,
  CreateEndpointCommandBody,
} from '../../../entities/endpoint-command/types';
import { useEndpointAdminI18n } from '../../../i18n';

export interface DestructiveCommandModalProps {
  open: boolean;
  type: Extract<
    CommandType,
    'LOCK_USER_LOGIN' | 'UNLOCK_USER_LOGIN' | 'CHANGE_LOCAL_PASSWORD' | 'ROTATE_CREDENTIAL'
  >;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (body: CreateEndpointCommandBody) => void;
}

/**
 * Confirmation modal for dual-control destructive commands.
 *
 * Captures the target `username` and a free-text `reason` (audit
 * payload). Intentionally does **not** capture passwords, secrets, or
 * any other privileged material — the agent / Vault / backend perform
 * credential rotation server-side after the command is approved.
 * Putting a `newPassword` in the command payload would persist it in
 * the command store and the audit chain, which is unacceptable.
 */
export const DestructiveCommandModal: React.FC<DestructiveCommandModalProps> = ({
  open,
  type,
  isSubmitting,
  onCancel,
  onSubmit,
}) => {
  const { t } = useEndpointAdminI18n();
  const [username, setUsername] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [submitted, setSubmitted] = React.useState(false);

  // Reset state every time the modal opens or the command type changes.
  React.useEffect(() => {
    if (open) {
      setUsername('');
      setReason('');
      setSubmitted(false);
    }
  }, [open, type]);

  if (!open) return null;

  const trimmedUsername = username.trim();
  const trimmedReason = reason.trim();
  const usernameError = submitted && trimmedUsername.length === 0;
  const reasonError = submitted && trimmedReason.length === 0;
  const reasonTooLong = trimmedReason.length > 512;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!trimmedUsername || !trimmedReason || reasonTooLong) return;
    onSubmit({
      type,
      reason: trimmedReason,
      payload: { username: trimmedUsername },
    });
  };

  const titleKey =
    type === 'LOCK_USER_LOGIN'
      ? 'endpointAdmin.modal.title.LOCK_USER_LOGIN'
      : type === 'UNLOCK_USER_LOGIN'
        ? 'endpointAdmin.modal.title.UNLOCK_USER_LOGIN'
        : type === 'CHANGE_LOCAL_PASSWORD'
          ? 'endpointAdmin.modal.title.CHANGE_LOCAL_PASSWORD'
          : 'endpointAdmin.modal.title.ROTATE_CREDENTIAL';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t(titleKey)}
      data-testid="destructive-command-modal"
      className="fixed inset-0 z-[1400] flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-surface-overlay/60" onClick={onCancel} aria-hidden />
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-md bg-surface-default rounded-xl shadow-2xl p-6 mx-4"
        data-testid="destructive-command-modal-form"
      >
        <h3 className="text-lg font-semibold text-text-primary mb-4">{t(titleKey)}</h3>

        <label className="block mb-3">
          <span className="text-sm text-text-secondary block mb-1">
            {t('endpointAdmin.modal.field.username')}
          </span>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t('endpointAdmin.modal.field.usernamePlaceholder')}
            data-testid="destructive-command-username"
            aria-invalid={usernameError}
            className="w-full rounded-md border border-border-default px-3 py-2 text-sm bg-surface-default"
            autoFocus
          />
          {usernameError && (
            <span
              className="text-xs text-danger mt-1 block"
              data-testid="destructive-command-username-error"
            >
              {t('endpointAdmin.modal.requiredField')}
            </span>
          )}
        </label>

        <label className="block mb-4">
          <span className="text-sm text-text-secondary block mb-1">
            {t('endpointAdmin.modal.field.reason')}
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('endpointAdmin.modal.field.reasonPlaceholder')}
            data-testid="destructive-command-reason"
            aria-invalid={reasonError || reasonTooLong}
            rows={3}
            maxLength={600}
            className="w-full rounded-md border border-border-default px-3 py-2 text-sm bg-surface-default"
          />
          <div className="flex items-center justify-between mt-1">
            {reasonError ? (
              <span className="text-xs text-danger" data-testid="destructive-command-reason-error">
                {t('endpointAdmin.modal.requiredField')}
              </span>
            ) : reasonTooLong ? (
              <span className="text-xs text-danger">{t('endpointAdmin.modal.reasonTooLong')}</span>
            ) : (
              <span />
            )}
            <span className="text-xs text-text-subtle">{trimmedReason.length}/512</span>
          </div>
        </label>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            data-testid="destructive-command-cancel"
            className="px-4 py-2 rounded-md border border-border-default text-sm text-text-primary"
          >
            {t('endpointAdmin.modal.cancel')}
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            data-testid="destructive-command-submit"
            className="px-4 py-2 rounded-md bg-danger text-white text-sm font-medium disabled:opacity-50"
          >
            {t('endpointAdmin.modal.submit')}
          </button>
        </div>
      </form>
    </div>
  );
};

DestructiveCommandModal.displayName = 'DestructiveCommandModal';
