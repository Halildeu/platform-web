import React from 'react';
import {
  registerLayer,
  unregisterLayer,
  useEscapeKey,
  useFocusTrap,
  useScrollLock,
  useSiblingIsolation,
} from '@mfe/design-system/internal/overlay-engine';
import { useEndpointAdminI18n } from '../../i18n';

export type BulkLifecycleAction = 'decommission' | 'reactivate';

/**
 * Above this many eligible devices a bulk DECOMMISSION additionally requires
 * an explicit "I understand" checkbox (Codex 019ea938 (b) — sensible extra
 * guardrail for large fleet selections; reactivate is non-destructive so it is
 * exempt).
 */
export const BULK_DECOMMISSION_CONFIRM_THRESHOLD = 10;

export interface BulkDeviceLifecycleModalProps {
  open: boolean;
  action: BulkLifecycleAction;
  /** Counts are a FROZEN snapshot taken when the menu item was clicked
   *  (Codex 019ea938 must-fix #2) — the confirm runs on the same set. */
  selectedCount: number;
  eligibleCount: number;
  skippedCount: number;
  running: boolean;
  error: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

/**
 * Bulk device lifecycle confirm modal — DECOMMISSION ("Toplu Pasif Al") /
 * REACTIVATE ("Toplu Yeniden Etkinleştir") for the grid-selected devices.
 *
 * Mirrors the per-device {@link DeviceLifecycleModal} reason/overlay pattern
 * (own layerId for LIFO ESC, focus trap, scroll lock; required reason max 512
 * matching backend `@NotBlank @Size(max = 512)`) but is selection-aware: it
 * shows the FROZEN selected / eligible / skipped counts and (Codex 019ea938)
 * carries the real decommission side-effects (pending commands, maintenance
 * tokens and open uninstall requests are cancelled — reversibility is about
 * lifecycle state, not those operational artefacts). ESC/backdrop do NOT close
 * while a bulk run is in flight.
 */
export const BulkDeviceLifecycleModal: React.FC<BulkDeviceLifecycleModalProps> = ({
  open,
  action,
  selectedCount,
  eligibleCount,
  skippedCount,
  running,
  error,
  onCancel,
  onConfirm,
}) => {
  const { t } = useEndpointAdminI18n();
  const layerId = React.useId();
  const [reason, setReason] = React.useState('');
  const [submitted, setSubmitted] = React.useState(false);
  const [acknowledged, setAcknowledged] = React.useState(false);

  // Block ESC/backdrop-driven close while a run is in flight (Codex #5).
  const requestCancel = React.useCallback(() => {
    if (running) return;
    onCancel();
  }, [running, onCancel]);

  const panelRef = useFocusTrap({ active: open, autoFocus: true, restoreFocus: true, layerId });
  useSiblingIsolation({ active: open, layerId, panelRef });
  useScrollLock(open);
  React.useEffect(() => {
    if (open) registerLayer(layerId, 'modal');
    return () => {
      if (open) unregisterLayer(layerId);
    };
  }, [open, layerId]);
  useEscapeKey(open, requestCancel, { layerId });
  React.useEffect(() => {
    if (open) {
      setReason('');
      setSubmitted(false);
      setAcknowledged(false);
    }
  }, [open, action]);

  if (!open) return null;

  const isDecommission = action === 'decommission';
  const trimmedReason = reason.trim();
  const reasonError = submitted && trimmedReason.length === 0;
  const reasonTooLong = trimmedReason.length > 512;
  const needsAck = isDecommission && eligibleCount > BULK_DECOMMISSION_CONFIRM_THRESHOLD;
  const ackMissing = needsAck && !acknowledged;
  const nothingEligible = eligibleCount === 0;

  const titleKey = isDecommission
    ? 'endpointAdmin.devices.bulk.lifecycle.modal.title.decommission'
    : 'endpointAdmin.devices.bulk.lifecycle.modal.title.reactivate';
  const warningKey = isDecommission
    ? 'endpointAdmin.devices.bulk.lifecycle.modal.warning.decommission'
    : 'endpointAdmin.devices.bulk.lifecycle.modal.warning.reactivate';
  const submitKey = isDecommission
    ? 'endpointAdmin.devices.bulk.lifecycle.decommission.label'
    : 'endpointAdmin.devices.bulk.lifecycle.reactivate.label';

  const counts = t('endpointAdmin.devices.bulk.lifecycle.modal.counts')
    .replace('{selected}', String(selectedCount))
    .replace('{eligible}', String(eligibleCount))
    .replace('{skipped}', String(skippedCount));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (running || nothingEligible || !trimmedReason || reasonTooLong || ackMissing) return;
    onConfirm(trimmedReason);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t(titleKey)}
      data-testid="bulk-lifecycle-modal"
      data-layer-id={layerId}
      className="fixed inset-0 z-[1400] flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-surface-overlay/60" onClick={requestCancel} aria-hidden />
      <form
        ref={panelRef as unknown as React.RefObject<HTMLFormElement>}
        onSubmit={handleSubmit}
        tabIndex={-1}
        className="relative w-full max-w-md bg-surface-default rounded-xl shadow-2xl p-6 mx-4 space-y-3"
        data-testid="bulk-lifecycle-form"
      >
        <h3 className="text-lg font-semibold text-text-primary">{t(titleKey)}</h3>

        <p className="text-sm text-text-secondary" data-testid="bulk-lifecycle-counts">
          {counts}
        </p>

        <p
          className={`text-xs ${isDecommission ? 'text-state-danger-text' : 'text-text-secondary'}`}
          data-testid="bulk-lifecycle-warning"
        >
          {t(warningKey)}
        </p>

        {nothingEligible && (
          <p className="text-xs text-text-subtle" data-testid="bulk-lifecycle-none-eligible">
            {t('endpointAdmin.devices.bulk.lifecycle.noneEligible')}
          </p>
        )}

        <label className="block">
          <span className="text-sm text-text-secondary block mb-1">
            {t('endpointAdmin.modal.field.reason')}
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('endpointAdmin.modal.field.reasonPlaceholder')}
            data-testid="bulk-lifecycle-reason"
            aria-invalid={reasonError || reasonTooLong}
            disabled={running || nothingEligible}
            rows={3}
            maxLength={600}
            className="w-full rounded-md border border-border-default px-3 py-2 text-sm bg-surface-default"
          />
          <div className="flex items-center justify-between mt-1">
            {reasonError ? (
              <span className="text-xs text-danger" data-testid="bulk-lifecycle-reason-error">
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

        {needsAck && (
          <label className="flex items-start gap-2 text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              disabled={running}
              data-testid="bulk-lifecycle-ack"
              className="mt-0.5"
            />
            <span>
              {t('endpointAdmin.devices.bulk.lifecycle.modal.ack').replace(
                '{eligible}',
                String(eligibleCount),
              )}
            </span>
          </label>
        )}

        {error && (
          <div className="text-sm text-danger" role="alert" data-testid="bulk-lifecycle-error">
            {t('endpointAdmin.devices.bulk.lifecycle.modal.error')}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={requestCancel}
            disabled={running}
            data-testid="bulk-lifecycle-cancel"
            className="px-4 py-2 rounded-md border border-border-default text-sm text-text-primary"
          >
            {t('endpointAdmin.modal.cancel')}
          </button>
          <button
            type="submit"
            disabled={running || nothingEligible || ackMissing}
            data-testid="bulk-lifecycle-submit"
            className={`px-4 py-2 rounded-md text-white text-sm font-medium disabled:opacity-50 ${
              isDecommission ? 'bg-danger' : 'bg-brand-primary'
            }`}
          >
            {running ? t('endpointAdmin.devices.bulk.running') : t(submitKey)}
          </button>
        </div>
      </form>
    </div>
  );
};

export default BulkDeviceLifecycleModal;
