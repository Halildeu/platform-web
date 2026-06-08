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
  useDecommissionDeviceMutation,
  useReactivateDeviceMutation,
} from '../../../app/services/endpointAdminApi';

export type DeviceLifecycleAction = 'decommission' | 'reactivate';

export interface DeviceLifecycleModalProps {
  open: boolean;
  deviceId: string;
  action: DeviceLifecycleAction;
  onCancel: () => void;
  onDone: () => void;
}

/**
 * Device lifecycle (V56) confirm modal — DECOMMISSION ("Pasif Al", KVKK
 * reversible deactivate) / REACTIVATE ("Yeniden Etkinleştir"). Captures a
 * required reason (max 512 chars, mirrors backend `@NotBlank @Size(max = 512)`)
 * and POSTs to the dedicated lifecycle endpoint. Follows the RolloutRingModal
 * overlay-engine pattern (own `layerId` for LIFO ESC, focus trap, scroll lock)
 * so a nested ESC closes THIS modal before the drawer.
 */
export const DeviceLifecycleModal: React.FC<DeviceLifecycleModalProps> = ({
  open,
  deviceId,
  action,
  onCancel,
  onDone,
}) => {
  const { t } = useEndpointAdminI18n();
  const layerId = React.useId();
  const [reason, setReason] = React.useState('');
  const [submitted, setSubmitted] = React.useState(false);
  const [decommission, decommissionState] = useDecommissionDeviceMutation();
  const [reactivate, reactivateState] = useReactivateDeviceMutation();
  const isLoading = decommissionState.isLoading || reactivateState.isLoading;
  const error = decommissionState.error || reactivateState.error;

  const panelRef = useFocusTrap({ active: open, autoFocus: true, restoreFocus: true, layerId });
  useSiblingIsolation({ active: open, layerId, panelRef });
  useScrollLock(open);
  React.useEffect(() => {
    if (open) registerLayer(layerId, 'modal');
    return () => {
      if (open) unregisterLayer(layerId);
    };
  }, [open, layerId]);
  useEscapeKey(open, onCancel, { layerId });
  React.useEffect(() => {
    if (open) {
      setReason('');
      setSubmitted(false);
    }
  }, [open, action]);

  if (!open) return null;

  const isDecommission = action === 'decommission';
  const trimmedReason = reason.trim();
  const reasonError = submitted && trimmedReason.length === 0;
  const reasonTooLong = trimmedReason.length > 512;

  const titleKey = isDecommission
    ? 'endpointAdmin.lifecycle.modal.title.decommission'
    : 'endpointAdmin.lifecycle.modal.title.reactivate';
  const warningKey = isDecommission
    ? 'endpointAdmin.lifecycle.modal.warning.decommission'
    : 'endpointAdmin.lifecycle.modal.warning.reactivate';
  const submitKey = isDecommission
    ? 'endpointAdmin.lifecycle.modal.submit.decommission'
    : 'endpointAdmin.lifecycle.modal.submit.reactivate';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!trimmedReason || reasonTooLong) return;
    const run = isDecommission ? decommission : reactivate;
    try {
      await run({ deviceId, body: { reason: trimmedReason } }).unwrap();
      onDone();
    } catch {
      /* inline error surfaced below */
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t(titleKey)}
      data-testid="device-lifecycle-modal"
      data-layer-id={layerId}
      className="fixed inset-0 z-[1400] flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-surface-overlay/60" onClick={onCancel} aria-hidden />
      <form
        ref={panelRef as unknown as React.RefObject<HTMLFormElement>}
        onSubmit={handleSubmit}
        tabIndex={-1}
        className="relative w-full max-w-md bg-surface-default rounded-xl shadow-2xl p-6 mx-4 space-y-3"
        data-testid="device-lifecycle-form"
      >
        <h3 className="text-lg font-semibold text-text-primary">{t(titleKey)}</h3>
        <p
          className={`text-xs ${isDecommission ? 'text-state-danger-text' : 'text-text-secondary'}`}
          data-testid="device-lifecycle-warning"
        >
          {t(warningKey)}
        </p>

        <label className="block">
          <span className="text-sm text-text-secondary block mb-1">
            {t('endpointAdmin.modal.field.reason')}
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('endpointAdmin.modal.field.reasonPlaceholder')}
            data-testid="device-lifecycle-reason"
            aria-invalid={reasonError || reasonTooLong}
            rows={3}
            maxLength={600}
            className="w-full rounded-md border border-border-default px-3 py-2 text-sm bg-surface-default"
          />
          <div className="flex items-center justify-between mt-1">
            {reasonError ? (
              <span className="text-xs text-danger" data-testid="device-lifecycle-reason-error">
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

        {error && (
          <div className="text-sm text-danger" role="alert" data-testid="device-lifecycle-error">
            {t('endpointAdmin.lifecycle.modal.error')}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            data-testid="device-lifecycle-cancel"
            className="px-4 py-2 rounded-md border border-border-default text-sm text-text-primary"
          >
            {t('endpointAdmin.modal.cancel')}
          </button>
          <button
            type="submit"
            disabled={isLoading}
            data-testid="device-lifecycle-submit"
            className={`px-4 py-2 rounded-md text-white text-sm font-medium disabled:opacity-50 ${
              isDecommission ? 'bg-danger' : 'bg-brand-primary'
            }`}
          >
            {t(submitKey)}
          </button>
        </div>
      </form>
    </div>
  );
};

DeviceLifecycleModal.displayName = 'DeviceLifecycleModal';
