import React from 'react';

import {
  registerLayer,
  unregisterLayer,
  useEscapeKey,
  useFocusTrap,
  useScrollLock,
  useSiblingIsolation,
} from '@mfe/design-system/internal/overlay-engine';
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
 * Codex 019e6e10 iter-1 §2 absorb: dialog now uses the shared overlay-
 * engine + Tailwind utility palette (matches DestructiveCommandModal).
 * Earlier BEM class strings had no CSS file backing them so the modal
 * rendered unstyled.
 *
 * Catalog dropdown loads from BE-020:
 *   GET /endpoint-admin/endpoint-software-catalog?status=APPROVED&enabled=true&page=0&size=200
 * (Spring `Page<AdminCatalogItemSummary>` envelope — consumed via
 * `content`, distinct from BE-023 `items`).
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
  const panelRef = React.useRef<HTMLFormElement>(null);
  const layerIdRef = React.useRef<string | null>(null);

  const catalogQuery = useListCatalogItemsQuery(
    { status: 'APPROVED', enabled: true, page: 0, size: 200 },
    { skip: !open },
  );
  const [createPolicy, createState] = useCreateCompliancePolicyItemMutation();

  React.useEffect(() => {
    if (!open) {
      setCatalogItemId('');
      setEnforcementMode('REQUIRED');
      setEnabled(true);
      setToast(null);
    }
  }, [open]);

  React.useEffect(() => {
    if (!toast) return undefined;
    const handle = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(handle);
  }, [toast]);

  React.useEffect(() => {
    if (!open) return undefined;
    const id = registerLayer({ name: 'CreatePolicyDialog' });
    layerIdRef.current = id;
    return () => {
      if (layerIdRef.current) {
        unregisterLayer(layerIdRef.current);
        layerIdRef.current = null;
      }
    };
  }, [open]);

  useFocusTrap(panelRef as React.RefObject<HTMLElement>, open);
  useScrollLock(open);
  useSiblingIsolation(panelRef as React.RefObject<HTMLElement>, open);
  useEscapeKey(open, onClose);

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
      role="dialog"
      aria-modal="true"
      aria-label={t('endpointAdmin.compliance.policies.createDialog.title')}
      data-testid="create-policy-dialog"
      data-layer-id={layerIdRef.current ?? undefined}
      className="fixed inset-0 z-[1400] flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-surface-overlay/60" onClick={onClose} aria-hidden />
      <form
        ref={panelRef}
        onSubmit={onSubmit}
        tabIndex={-1}
        className="relative w-full max-w-md bg-surface-default rounded-xl shadow-2xl p-6 mx-4"
      >
        <header className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text-primary">
            {t('endpointAdmin.compliance.policies.createDialog.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('endpointAdmin.drawer.close')}
            data-testid="create-policy-dialog-close"
            className="text-text-subtle hover:text-text-primary"
          >
            ✕
          </button>
        </header>

        <label className="block mb-3">
          <span className="text-sm text-text-secondary block mb-1">
            {t('endpointAdmin.compliance.policies.createDialog.catalogLabel')}
          </span>
          {catalogQuery.isLoading ? (
            <span
              data-testid="create-policy-dialog-catalog-loading"
              className="text-sm text-text-subtle"
            >
              {t('endpointAdmin.compliance.policies.createDialog.catalogLoading')}
            </span>
          ) : (
            <select
              value={catalogItemId}
              onChange={(e) => setCatalogItemId(e.target.value)}
              data-testid="create-policy-dialog-catalog"
              className="w-full rounded-md border border-border-default px-3 py-2 text-sm bg-surface-default"
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
        </label>

        <label className="block mb-3">
          <span className="text-sm text-text-secondary block mb-1">
            {t('endpointAdmin.compliance.policies.createDialog.enforcementLabel')}
          </span>
          <select
            value={enforcementMode}
            onChange={(e) => setEnforcementMode(e.target.value as ComplianceEnforcementMode)}
            data-testid="create-policy-dialog-enforcement"
            className="w-full rounded-md border border-border-default px-3 py-2 text-sm bg-surface-default"
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
        </label>

        <label className="flex items-center gap-2 mb-4 text-sm text-text-primary">
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
            className="text-sm text-danger mb-3"
          >
            {t(toast)}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            data-testid="create-policy-dialog-cancel"
            className="px-4 py-2 rounded-md border border-border-default text-sm text-text-primary"
          >
            {t('endpointAdmin.compliance.policies.createDialog.cancel')}
          </button>
          <button
            type="submit"
            disabled={!canManage || createState.isLoading || !catalogItemId}
            data-testid="create-policy-dialog-submit"
            className="px-4 py-2 rounded-md bg-primary text-white text-sm font-medium disabled:opacity-50"
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
