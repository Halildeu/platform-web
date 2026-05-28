import React from 'react';

import {
  registerLayer,
  unregisterLayer,
  useEscapeKey,
  useFocusTrap,
  useScrollLock,
  useSiblingIsolation,
} from '@mfe/design-system/internal/overlay-engine';
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
 * WEB-014C — Edit compliance policy dialog. Tailwind + overlay-engine
 * pattern (Codex 019e6e10 iter-1 §2). IMMUTABLE catalog field, PUT body
 * omits version (Codex 019e6dff iter-1 §3 + §4).
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
  const panelRef = React.useRef<HTMLFormElement>(null);
  const layerIdRef = React.useRef<string | null>(null);

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

  React.useEffect(() => {
    if (!open) return undefined;
    const id = registerLayer({ name: 'EditPolicyDialog' });
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
      role="dialog"
      aria-modal="true"
      aria-label={t('endpointAdmin.compliance.policies.editDialog.title')}
      data-testid="edit-policy-dialog"
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
            {t('endpointAdmin.compliance.policies.editDialog.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('endpointAdmin.drawer.close')}
            data-testid="edit-policy-dialog-close"
            className="text-text-subtle hover:text-text-primary"
          >
            ✕
          </button>
        </header>

        <div className="mb-3">
          <span className="text-sm text-text-secondary block mb-1">
            {t('endpointAdmin.compliance.policies.editDialog.catalogLabel')}
          </span>
          <span
            className="text-sm text-text-primary block"
            data-testid="edit-policy-dialog-catalog"
          >
            {item.catalogDisplayName} ({item.catalogItemKey})
          </span>
        </div>

        <label className="block mb-3">
          <span className="text-sm text-text-secondary block mb-1">
            {t('endpointAdmin.compliance.policies.editDialog.enforcementLabel')}
          </span>
          <select
            value={enforcementMode}
            onChange={(e) => setEnforcementMode(e.target.value as ComplianceEnforcementMode)}
            data-testid="edit-policy-dialog-enforcement"
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
            data-testid="edit-policy-dialog-enabled"
          />
          {t('endpointAdmin.compliance.policies.editDialog.enabledLabel')}
        </label>

        {toast ? (
          <div
            role="status"
            aria-live="polite"
            data-testid="edit-policy-dialog-toast"
            className="text-sm text-danger mb-3"
          >
            {t(toast)}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            data-testid="edit-policy-dialog-cancel"
            className="px-4 py-2 rounded-md border border-border-default text-sm text-text-primary"
          >
            {t('endpointAdmin.compliance.policies.editDialog.cancel')}
          </button>
          <button
            type="submit"
            disabled={!canManage || updateState.isLoading}
            data-testid="edit-policy-dialog-submit"
            className="px-4 py-2 rounded-md bg-primary text-white text-sm font-medium disabled:opacity-50"
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
