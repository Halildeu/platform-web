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
import type { CompliancePolicyItem } from '../../entities/endpoint-device-compliance/types';

export interface DeletePolicyConfirmProps {
  open: boolean;
  item: CompliancePolicyItem | null;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
  error: number | string | undefined;
}

/**
 * WEB-014C — Delete policy confirmation modal. Tailwind + overlay-engine
 * canonical pattern (Codex 019e6e10 iter-2 absorb). Hard delete with
 * soft-disable hint (Codex 019e6dff iter-1 §D).
 */
export const DeletePolicyConfirm: React.FC<DeletePolicyConfirmProps> = ({
  open,
  item,
  onClose,
  onConfirm,
  isLoading,
  error,
}) => {
  const { t } = useEndpointAdminI18n();
  const layerId = React.useId();
  const panelRef = useFocusTrap({
    active: open,
    autoFocus: true,
    restoreFocus: true,
    layerId,
  });

  useSiblingIsolation({ active: open, layerId, panelRef });
  useScrollLock(open);

  React.useEffect(() => {
    if (!open) return undefined;
    registerLayer(layerId, 'modal');
    return () => unregisterLayer(layerId);
  }, [open, layerId]);

  useEscapeKey(open, onClose, { layerId });

  if (!open || !item) return null;

  const errorKey =
    error === 403
      ? 'endpointAdmin.compliance.policies.toast.forbidden'
      : error === 404
        ? 'endpointAdmin.compliance.policies.toast.notFound'
        : error
          ? 'endpointAdmin.compliance.policies.toast.deleteFailed'
          : null;

  return (
    <div
      data-testid="delete-policy-confirm"
      data-layer-id={layerId}
      className="fixed inset-0 z-[1400] flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-surface-overlay/60" onClick={onClose} aria-hidden />
      <div
        ref={panelRef as React.RefObject<HTMLDivElement>}
        role="dialog"
        aria-modal="true"
        aria-label={t('endpointAdmin.compliance.policies.deleteDialog.title')}
        tabIndex={-1}
        className="relative w-full max-w-md bg-surface-default rounded-xl shadow-2xl p-6 mx-4"
      >
        <h2 className="text-lg font-semibold text-text-primary mb-3">
          {t('endpointAdmin.compliance.policies.deleteDialog.title')}
        </h2>
        <p className="text-sm text-text-primary mb-2">
          {t('endpointAdmin.compliance.policies.deleteDialog.body').replace(
            '{catalog}',
            `${item.catalogDisplayName} (${item.catalogItemKey})`,
          )}
        </p>
        <p className="text-xs text-text-subtle mb-4">
          {t('endpointAdmin.compliance.policies.deleteDialog.softDisableHint')}
        </p>

        {errorKey ? (
          <div
            role="status"
            aria-live="polite"
            data-testid="delete-policy-confirm-toast"
            className="text-sm text-danger mb-3"
          >
            {t(errorKey)}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            data-testid="delete-policy-confirm-cancel"
            className="px-4 py-2 rounded-md border border-border-default text-sm text-text-primary"
          >
            {t('endpointAdmin.compliance.policies.deleteDialog.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            data-testid="delete-policy-confirm-submit"
            className="px-4 py-2 rounded-md bg-danger text-white text-sm font-medium disabled:opacity-50"
          >
            {isLoading
              ? t('endpointAdmin.compliance.policies.deleteDialog.deleting')
              : t('endpointAdmin.compliance.policies.deleteDialog.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeletePolicyConfirm;
