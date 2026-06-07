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
import { useCreateSoftwareBundleMutation } from '../../app/services/endpointAdminApi';
import type { SoftwareBundleRequest } from '../../entities/software-bundle/types';

export interface SoftwareBundleCreateModalProps {
  open: boolean;
  onCancel: () => void;
  onCreated: (bundleId: string) => void;
}

// Mirror of backend AdminSoftwareBundleRequest validation (Codex slice-2 gate):
// the backend stays authoritative; these catch obvious operator mistakes.
const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MAX_ITEMS = 32;

/** Split a free-text catalog-item-id list on commas/whitespace/newlines. */
function parseIds(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * BE-029 create-bundle form. A bundle is a named, approvable SET of catalog item
 * IDs — no trust material. The backend creates it DRAFT; promotion is sealed at
 * /approve (maker-checker).
 */
export const SoftwareBundleCreateModal: React.FC<SoftwareBundleCreateModalProps> = ({
  open,
  onCancel,
  onCreated,
}) => {
  const { t } = useEndpointAdminI18n();
  const layerId = React.useId();
  const [bundleId, setBundleId] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [itemsRaw, setItemsRaw] = React.useState('');
  const [submitted, setSubmitted] = React.useState(false);
  const [create, { isLoading, error }] = useCreateSoftwareBundleMutation();

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
      setBundleId('');
      setDisplayName('');
      setDescription('');
      setItemsRaw('');
      setSubmitted(false);
    }
  }, [open]);

  if (!open) return null;

  const ids = parseIds(itemsRaw);
  const errors = {
    bundleId: !SLUG_RE.test(bundleId.trim()) || bundleId.trim().length > 128,
    displayName: displayName.trim().length === 0 || displayName.trim().length > 256,
    description: description.length > 1024,
    items: ids.length === 0 || ids.length > MAX_ITEMS || ids.some((i) => !SLUG_RE.test(i)),
  };
  const hasErrors = Object.values(errors).some(Boolean);
  const cls = (bad: boolean) =>
    `w-full rounded-md border px-3 py-2 text-sm bg-surface-default ${
      submitted && bad ? 'border-danger' : 'border-border-default'
    }`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (hasErrors) return;
    const body: SoftwareBundleRequest = {
      bundleId: bundleId.trim(),
      displayName: displayName.trim(),
      catalogItemIds: ids,
      ...(description.trim() ? { description: description.trim() } : {}),
    };
    try {
      const res = await create({ body }).unwrap();
      onCreated(res.bundleId ?? bundleId.trim());
    } catch {
      /* inline error below */
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('endpointAdmin.bundles.create.title')}
      data-testid="bundle-create-modal"
      data-layer-id={layerId}
      className="fixed inset-0 z-[1400] flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-surface-overlay/60" onClick={onCancel} aria-hidden />
      <form
        ref={panelRef as unknown as React.RefObject<HTMLFormElement>}
        onSubmit={handleSubmit}
        tabIndex={-1}
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-surface-default rounded-xl shadow-2xl p-6 mx-4 space-y-3"
        data-testid="bundle-create-form"
      >
        <h3 className="text-lg font-semibold text-text-primary">
          {t('endpointAdmin.bundles.create.title')}
        </h3>

        <label className="block">
          <span className="text-sm text-text-secondary block mb-1">
            {t('endpointAdmin.bundles.field.bundleId')}
          </span>
          <input
            type="text"
            value={bundleId}
            onChange={(e) => setBundleId(e.target.value)}
            data-testid="bundle-field-bundleId"
            aria-invalid={submitted && errors.bundleId}
            className={cls(errors.bundleId)}
          />
        </label>

        <label className="block">
          <span className="text-sm text-text-secondary block mb-1">
            {t('endpointAdmin.bundles.field.displayName')}
          </span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            data-testid="bundle-field-displayName"
            aria-invalid={submitted && errors.displayName}
            className={cls(errors.displayName)}
          />
        </label>

        <label className="block">
          <span className="text-sm text-text-secondary block mb-1">
            {t('endpointAdmin.bundles.field.description')}
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            maxLength={1100}
            data-testid="bundle-field-description"
            className={cls(errors.description)}
          />
        </label>

        <label className="block">
          <span className="text-sm text-text-secondary block mb-1">
            {t('endpointAdmin.bundles.field.catalogItemIds')}
          </span>
          <textarea
            value={itemsRaw}
            onChange={(e) => setItemsRaw(e.target.value)}
            rows={3}
            placeholder={t('endpointAdmin.bundles.field.catalogItemIdsHint')}
            data-testid="bundle-field-catalogItemIds"
            aria-invalid={submitted && errors.items}
            className={`font-mono ${cls(errors.items)}`}
          />
          <span className="text-xs text-text-subtle">{ids.length}/32</span>
        </label>

        {error && (
          <div className="text-sm text-danger" role="alert" data-testid="bundle-create-error">
            {t('endpointAdmin.bundles.create.error')}
          </div>
        )}
        {submitted && hasErrors && (
          <div className="text-xs text-danger" data-testid="bundle-create-validation">
            {t('endpointAdmin.bundles.create.validation')}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            data-testid="bundle-create-cancel"
            className="px-4 py-2 rounded-md border border-border-default text-sm text-text-primary"
          >
            {t('endpointAdmin.modal.cancel')}
          </button>
          <button
            type="submit"
            disabled={isLoading}
            data-testid="bundle-create-submit"
            className="px-4 py-2 rounded-md bg-brand-primary text-white text-sm font-medium disabled:opacity-50"
          >
            {t('endpointAdmin.bundles.create.submit')}
          </button>
        </div>
      </form>
    </div>
  );
};

SoftwareBundleCreateModal.displayName = 'SoftwareBundleCreateModal';
