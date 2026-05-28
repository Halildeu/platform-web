import React from 'react';

import {
  useCreateCompliancePolicyItemMutation,
  useListCatalogItemsQuery,
} from '../../app/services/endpointAdminApi';
import { useEndpointAdminI18n } from '../../i18n';
import type { ComplianceEnforcementMode } from '../../entities/endpoint-device-compliance/types';

export interface CreatePolicyDialogProps {
  open: boolean;
  onClose: () => void;
  canManage: boolean;
}

/**
 * WEB-014C — Create compliance policy dialog.
 *
 * Catalog dropdown loads from the BE-020 list endpoint
 *   GET /endpoint-admin/endpoint-software-catalog?status=APPROVED&enabled=true&page=0&size=200
 * (Spring `Page<AdminCatalogItemSummary>` envelope; consumed via the
 * `content` field — distinct from the BE-023 `items` envelope).
 *
 * Form submits a `CompliancePolicyItemRequest` body
 *   { catalogItemId: <AdminCatalogItemSummary.id UUID>,
 *     enforcementMode: REQUIRED | ALLOWED | FORBIDDEN,
 *     enabled: boolean }
 *
 * Codex 019e6dff guards baked in:
 *   - §A: dropdown not free-text; value = AdminCatalogItemSummary.id
 *     (the UUID), display = `displayName + ' (' + catalogItemId + ')'`
 *   - §B: dialog only opens via the page's MANAGE-gated "create"
 *     button, but the Save button also short-circuits when
 *     `canManage === false` for defense in depth
 *   - §1 (iter-2): no invented DTOs — `AdminCatalogItemSummary` field
 *     names match backend record verbatim
 *   - 409 (catalog duplicate) -> toast; 403 -> toast
 */
export const CreatePolicyDialog: React.FC<CreatePolicyDialogProps> = ({
  open,
  onClose,
  canManage,
}) => {
  const { t } = useEndpointAdminI18n();
  const [catalogItemId, setCatalogItemId] = React.useState<string>('');
  const [enforcementMode, setEnforcementMode] =
    React.useState<ComplianceEnforcementMode>('REQUIRED');
  const [enabled, setEnabled] = React.useState<boolean>(true);
  const [toast, setToast] = React.useState<string | null>(null);

  const catalogQuery = useListCatalogItemsQuery(
    { status: 'APPROVED', enabled: true, page: 0, size: 200 },
    { skip: !open },
  );
  const [createPolicy, createState] = useCreateCompliancePolicyItemMutation();

  // Reset form fields on close.
  React.useEffect(() => {
    if (!open) {
      setCatalogItemId('');
      setEnforcementMode('REQUIRED');
      setEnabled(true);
      setToast(null);
    }
  }, [open]);

  // Toast auto-dismiss.
  React.useEffect(() => {
    if (!toast) return undefined;
    const handle = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(handle);
  }, [toast]);

  const onSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!canManage) {
        setToast('endpointAdmin.compliance.policies.toast.forbidden');
        return;
      }
      if (!catalogItemId) {
        setToast('endpointAdmin.compliance.policies.toast.catalogRequired');
        return;
      }
      try {
        await createPolicy({ catalogItemId, enforcementMode, enabled }).unwrap();
        onClose();
      } catch (err) {
        const status = (err as { status?: number | string } | null)?.status;
        if (status === 409) {
          setToast('endpointAdmin.compliance.policies.toast.duplicate');
        } else if (status === 403) {
          setToast('endpointAdmin.compliance.policies.toast.forbidden');
        } else if (status === 400) {
          setToast('endpointAdmin.compliance.policies.toast.invalid');
        } else {
          setToast('endpointAdmin.compliance.policies.toast.createFailed');
        }
      }
    },
    [canManage, catalogItemId, createPolicy, enabled, enforcementMode, onClose],
  );

  if (!open) return null;

  const catalogOptions = catalogQuery.data?.content ?? [];

  return (
    <div
      className="compliance-policy-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={t('endpointAdmin.compliance.policies.createDialog.title')}
      data-testid="create-policy-dialog"
    >
      <div className="compliance-policy-dialog__backdrop" onClick={onClose} />
      <form className="compliance-policy-dialog__content" onSubmit={onSubmit}>
        <header className="compliance-policy-dialog__header">
          <h2>{t('endpointAdmin.compliance.policies.createDialog.title')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('endpointAdmin.drawer.close')}
            data-testid="create-policy-dialog-close"
          >
            ✕
          </button>
        </header>

        <label htmlFor="create-policy-catalog">
          {t('endpointAdmin.compliance.policies.createDialog.catalogLabel')}
        </label>
        {catalogQuery.isLoading ? (
          <span data-testid="create-policy-dialog-catalog-loading">
            {t('endpointAdmin.compliance.policies.createDialog.catalogLoading')}
          </span>
        ) : (
          <select
            id="create-policy-catalog"
            value={catalogItemId}
            onChange={(e) => setCatalogItemId(e.target.value)}
            data-testid="create-policy-dialog-catalog"
            required
          >
            <option value="">
              {t('endpointAdmin.compliance.policies.createDialog.catalogPlaceholder')}
            </option>
            {catalogOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.displayName} ({item.catalogItemId})
              </option>
            ))}
          </select>
        )}

        <label htmlFor="create-policy-enforcement">
          {t('endpointAdmin.compliance.policies.createDialog.enforcementLabel')}
        </label>
        <select
          id="create-policy-enforcement"
          value={enforcementMode}
          onChange={(e) => setEnforcementMode(e.target.value as ComplianceEnforcementMode)}
          data-testid="create-policy-dialog-enforcement"
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
            data-testid="create-policy-dialog-enabled"
          />
          {t('endpointAdmin.compliance.policies.createDialog.enabledLabel')}
        </label>

        {toast ? (
          <div
            role="status"
            aria-live="polite"
            data-testid="create-policy-dialog-toast"
            className="compliance-policy-dialog__toast"
          >
            {t(toast)}
          </div>
        ) : null}

        <div className="compliance-policy-dialog__footer">
          <button type="button" onClick={onClose} data-testid="create-policy-dialog-cancel">
            {t('endpointAdmin.compliance.policies.createDialog.cancel')}
          </button>
          <button
            type="submit"
            disabled={!canManage || createState.isLoading || !catalogItemId}
            data-testid="create-policy-dialog-submit"
          >
            {createState.isLoading
              ? t('endpointAdmin.compliance.policies.createDialog.saving')
              : t('endpointAdmin.compliance.policies.createDialog.save')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreatePolicyDialog;
