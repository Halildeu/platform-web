import React from 'react';

import { useUpdateCompliancePolicyItemMutation } from '../../app/services/endpointAdminApi';
import { useEndpointAdminI18n } from '../../i18n';
import type {
  ComplianceEnforcementMode,
  CompliancePolicyItem,
} from '../../entities/endpoint-device-compliance/types';

export interface EditPolicyDialogProps {
  open: boolean;
  item: CompliancePolicyItem | null;
  onClose: () => void;
  canManage: boolean;
}

/**
 * WEB-014C — Edit compliance policy dialog.
 *
 * IMMUTABLE catalog field (Codex 019e6dff iter-1 §3): backend
 * `EndpointCompliancePolicyService.update(...)` does NOT permit
 * changing `catalogItemId`; any attempt returns 400. The dialog
 * renders the existing `catalogDisplayName` + `catalogItemKey` as
 * read-only metadata, and the PUT body keeps the original
 * `catalogItemId`.
 *
 * NO `version` in the PUT body (Codex iter-1 §4): backend doesn't
 * honor optimistic concurrency on the request DTO. 409 surfaces as a
 * generic conflict toast — the user is asked to refresh the page.
 */
export const EditPolicyDialog: React.FC<EditPolicyDialogProps> = ({
  open,
  item,
  onClose,
  canManage,
}) => {
  const { t } = useEndpointAdminI18n();
  const [enforcementMode, setEnforcementMode] =
    React.useState<ComplianceEnforcementMode>('REQUIRED');
  const [enabled, setEnabled] = React.useState<boolean>(true);
  const [toast, setToast] = React.useState<string | null>(null);

  const [updatePolicy, updateState] = useUpdateCompliancePolicyItemMutation();

  React.useEffect(() => {
    if (open && item) {
      setEnforcementMode(item.enforcementMode);
      setEnabled(item.enabled);
      setToast(null);
    }
  }, [item, open]);

  React.useEffect(() => {
    if (!toast) return undefined;
    const handle = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(handle);
  }, [toast]);

  const onSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!item) return;
      if (!canManage) {
        setToast('endpointAdmin.compliance.policies.toast.forbidden');
        return;
      }
      try {
        await updatePolicy({
          id: item.id,
          body: {
            catalogItemId: item.catalogItemId,
            enforcementMode,
            enabled,
          },
        }).unwrap();
        onClose();
      } catch (err) {
        const status = (err as { status?: number | string } | null)?.status;
        if (status === 409) {
          setToast('endpointAdmin.compliance.policies.toast.conflict');
        } else if (status === 403) {
          setToast('endpointAdmin.compliance.policies.toast.forbidden');
        } else if (status === 400) {
          setToast('endpointAdmin.compliance.policies.toast.invalid');
        } else if (status === 404) {
          setToast('endpointAdmin.compliance.policies.toast.notFound');
        } else {
          setToast('endpointAdmin.compliance.policies.toast.updateFailed');
        }
      }
    },
    [canManage, enabled, enforcementMode, item, onClose, updatePolicy],
  );

  if (!open || !item) return null;

  return (
    <div
      className="compliance-policy-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={t('endpointAdmin.compliance.policies.editDialog.title')}
      data-testid="edit-policy-dialog"
    >
      <div className="compliance-policy-dialog__backdrop" onClick={onClose} />
      <form className="compliance-policy-dialog__content" onSubmit={onSubmit}>
        <header className="compliance-policy-dialog__header">
          <h2>{t('endpointAdmin.compliance.policies.editDialog.title')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('endpointAdmin.drawer.close')}
            data-testid="edit-policy-dialog-close"
          >
            ✕
          </button>
        </header>

        <div className="compliance-policy-dialog__readonly-row">
          <span className="compliance-policy-dialog__readonly-label">
            {t('endpointAdmin.compliance.policies.editDialog.catalogLabel')}
          </span>
          <span
            className="compliance-policy-dialog__readonly-value"
            data-testid="edit-policy-dialog-catalog"
          >
            {item.catalogDisplayName} ({item.catalogItemKey})
          </span>
        </div>

        <label htmlFor="edit-policy-enforcement">
          {t('endpointAdmin.compliance.policies.editDialog.enforcementLabel')}
        </label>
        <select
          id="edit-policy-enforcement"
          value={enforcementMode}
          onChange={(e) => setEnforcementMode(e.target.value as ComplianceEnforcementMode)}
          data-testid="edit-policy-dialog-enforcement"
        >
          <option value="REQUIRED">
            {t('endpointAdmin.compliance.policies.enforcement.required')}
          </option>
          <option value="ALLOWED">
            {t('endpointAdmin.compliance.policies.enforcement.allowed')}
          </option>
          <option value="FORBIDDEN">
            {t('endpointAdmin.compliance.policies.enforcement.forbidden')}
          </option>
        </select>

        <label className="compliance-policy-dialog__enabled-row">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            data-testid="edit-policy-dialog-enabled"
          />
          {t('endpointAdmin.compliance.policies.editDialog.enabledLabel')}
        </label>

        {toast ? (
          <div
            role="status"
            aria-live="polite"
            data-testid="edit-policy-dialog-toast"
            className="compliance-policy-dialog__toast"
          >
            {t(toast)}
          </div>
        ) : null}

        <div className="compliance-policy-dialog__footer">
          <button type="button" onClick={onClose} data-testid="edit-policy-dialog-cancel">
            {t('endpointAdmin.compliance.policies.editDialog.cancel')}
          </button>
          <button
            type="submit"
            disabled={!canManage || updateState.isLoading}
            data-testid="edit-policy-dialog-submit"
          >
            {updateState.isLoading
              ? t('endpointAdmin.compliance.policies.editDialog.saving')
              : t('endpointAdmin.compliance.policies.editDialog.save')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default EditPolicyDialog;
