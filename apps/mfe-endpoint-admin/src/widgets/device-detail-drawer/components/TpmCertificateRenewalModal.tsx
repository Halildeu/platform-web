import React from 'react';
import { useRenewTpmCertificateMutation } from '../../../app/services/endpointAdminApi';
import { useEndpointAdminI18n } from '../../../i18n';

export interface TpmCertificateRenewalModalProps {
  open: boolean;
  deviceId: string;
  onCancel: () => void;
  onDispatched: (commandId: string) => void;
}

const createIdempotencyKey = (): string => {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `browser-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const TpmCertificateRenewalModal: React.FC<TpmCertificateRenewalModalProps> = ({
  open,
  deviceId,
  onCancel,
  onDispatched,
}) => {
  const { t } = useEndpointAdminI18n();
  const [reason, setReason] = React.useState('');
  const [dispatchRenewal, dispatchState] = useRenewTpmCertificateMutation();
  const idempotencyKey = React.useRef(createIdempotencyKey());

  if (!open) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedReason = reason.trim();
    if (!normalizedReason || dispatchState.isLoading) return;
    try {
      const command = await dispatchRenewal({
        deviceId,
        body: {
          idempotencyKey: idempotencyKey.current,
          reason: normalizedReason,
        },
      }).unwrap();
      onDispatched(command.id);
    } catch {
      // RTK Query state renders the bounded error below. No token or backend
      // payload is copied into component state.
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tpm-renewal-modal-title"
      data-testid="tpm-renewal-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-lg rounded-md border border-border-default bg-surface-default p-5 shadow-xl"
      >
        <h2 id="tpm-renewal-modal-title" className="text-base font-semibold text-text-primary">
          {t('endpointAdmin.modal.tpmRenewal.title')}
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          {t('endpointAdmin.modal.tpmRenewal.note')}
        </p>

        <label className="mt-4 block text-sm font-medium text-text-primary">
          {t('endpointAdmin.modal.tpmRenewal.reasonLabel')}
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={512}
            rows={3}
            required
            data-testid="tpm-renewal-reason"
            className="mt-1 w-full rounded-md border border-border-default bg-surface-default px-3 py-2 text-sm"
          />
        </label>

        {dispatchState.isError && (
          <div
            role="alert"
            data-testid="tpm-renewal-error"
            className="mt-3 rounded-md border border-state-danger-border bg-state-danger-subtle px-3 py-2 text-sm text-state-danger-text"
          >
            {t('endpointAdmin.modal.tpmRenewal.dispatchError')}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={dispatchState.isLoading}
            className="rounded-md border border-border-default px-4 py-2 text-sm"
          >
            {t('endpointAdmin.modal.tpmRenewal.cancel')}
          </button>
          <button
            type="submit"
            disabled={!reason.trim() || dispatchState.isLoading}
            data-testid="tpm-renewal-submit"
            className="rounded-md bg-brand-primary px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {dispatchState.isLoading
              ? t('endpointAdmin.modal.tpmRenewal.dispatching')
              : t('endpointAdmin.modal.tpmRenewal.dispatch')}
          </button>
        </div>
      </form>
    </div>
  );
};

TpmCertificateRenewalModal.displayName = 'TpmCertificateRenewalModal';
