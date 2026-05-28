import React from 'react';

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
 * WEB-014C — Delete policy confirmation modal.
 *
 * Hard delete (kalıcı kaldırma). Codex 019e6dff iter-1 §D:
 * `enabled=false` is the soft-disable semantic — evaluator skips the
 * row but the audit history stays; delete is the hard remove. Modal
 * text clarifies this so operators don't reach for delete to mute a
 * policy.
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
      className="compliance-policy-confirm"
      role="dialog"
      aria-modal="true"
      aria-label={t('endpointAdmin.compliance.policies.deleteDialog.title')}
      data-testid="delete-policy-confirm"
    >
      <div className="compliance-policy-confirm__backdrop" onClick={onClose} />
      <div className="compliance-policy-confirm__content">
        <h2>{t('endpointAdmin.compliance.policies.deleteDialog.title')}</h2>
        <p>
          {t('endpointAdmin.compliance.policies.deleteDialog.body').replace(
            '{catalog}',
            `${item.catalogDisplayName} (${item.catalogItemKey})`,
          )}
        </p>
        <p className="compliance-policy-confirm__hint">
          {t('endpointAdmin.compliance.policies.deleteDialog.softDisableHint')}
        </p>

        {errorKey ? (
          <div
            role="status"
            aria-live="polite"
            data-testid="delete-policy-confirm-toast"
            className="compliance-policy-confirm__toast"
          >
            {t(errorKey)}
          </div>
        ) : null}

        <div className="compliance-policy-confirm__footer">
          <button type="button" onClick={onClose} data-testid="delete-policy-confirm-cancel">
            {t('endpointAdmin.compliance.policies.deleteDialog.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            data-testid="delete-policy-confirm-submit"
            className="compliance-policy-confirm__danger"
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
