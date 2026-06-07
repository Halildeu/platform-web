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
import { usePatchDeviceRolloutMutation } from '../../../app/services/endpointAdminApi';
import type { DeploymentRing } from '../../../entities/endpoint-device/types';

export interface RolloutRingModalProps {
  open: boolean;
  deviceId: string;
  currentRing: DeploymentRing | null;
  currentTags: string[];
  onCancel: () => void;
  onSaved: () => void;
}

const RINGS: DeploymentRing[] = ['PILOT', 'IT', 'DEPARTMENT', 'ALL'];
const TAG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function parseTags(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * BE-026 — set a device's deployment ring + rollout tags.
 * PATCH /endpoint-devices/{deviceId}/rollout with { deploymentRing, deviceTags }.
 */
export const RolloutRingModal: React.FC<RolloutRingModalProps> = ({
  open,
  deviceId,
  currentRing,
  currentTags,
  onCancel,
  onSaved,
}) => {
  const { t } = useEndpointAdminI18n();
  const layerId = React.useId();
  const [ring, setRing] = React.useState<DeploymentRing | ''>(currentRing ?? '');
  const [tagsRaw, setTagsRaw] = React.useState((currentTags ?? []).join(', '));
  const [submitted, setSubmitted] = React.useState(false);
  const [patch, { isLoading, error }] = usePatchDeviceRolloutMutation();

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
      setRing(currentRing ?? '');
      setTagsRaw((currentTags ?? []).join(', '));
      setSubmitted(false);
    }
  }, [open, currentRing, currentTags]);

  if (!open) return null;

  const tags = parseTags(tagsRaw);
  const tagsInvalid = tags.length > 32 || tags.some((tag) => !TAG_RE.test(tag) || tag.length > 64);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (tagsInvalid) return;
    try {
      await patch({
        deviceId,
        body: { deploymentRing: ring === '' ? null : ring, deviceTags: tags },
      }).unwrap();
      onSaved();
    } catch {
      /* inline error below */
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('endpointAdmin.rollout.modal.title')}
      data-testid="rollout-ring-modal"
      data-layer-id={layerId}
      className="fixed inset-0 z-[1400] flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-surface-overlay/60" onClick={onCancel} aria-hidden />
      <form
        ref={panelRef as unknown as React.RefObject<HTMLFormElement>}
        onSubmit={handleSubmit}
        tabIndex={-1}
        className="relative w-full max-w-md bg-surface-default rounded-xl shadow-2xl p-6 mx-4 space-y-3"
        data-testid="rollout-ring-form"
      >
        <h3 className="text-lg font-semibold text-text-primary">
          {t('endpointAdmin.rollout.modal.title')}
        </h3>

        <label className="block">
          <span className="text-sm text-text-secondary block mb-1">
            {t('endpointAdmin.rollout.field.ring')}
          </span>
          <select
            value={ring}
            onChange={(e) => setRing(e.target.value as DeploymentRing | '')}
            data-testid="rollout-field-ring"
            className="w-full rounded-md border border-border-default px-3 py-2 text-sm bg-surface-default"
          >
            <option value="">{t('endpointAdmin.rollout.ring.unassigned')}</option>
            {RINGS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm text-text-secondary block mb-1">
            {t('endpointAdmin.rollout.field.tags')}
          </span>
          <textarea
            value={tagsRaw}
            onChange={(e) => setTagsRaw(e.target.value)}
            rows={2}
            placeholder={t('endpointAdmin.rollout.field.tagsHint')}
            data-testid="rollout-field-tags"
            aria-invalid={submitted && tagsInvalid}
            className={`w-full rounded-md border px-3 py-2 text-sm bg-surface-default ${
              submitted && tagsInvalid ? 'border-danger' : 'border-border-default'
            }`}
          />
          <span className="text-xs text-text-subtle">{tags.length}/32</span>
        </label>

        {submitted && tagsInvalid && (
          <div className="text-xs text-danger" data-testid="rollout-validation">
            {t('endpointAdmin.rollout.modal.validation')}
          </div>
        )}
        {error && (
          <div className="text-sm text-danger" role="alert" data-testid="rollout-error">
            {t('endpointAdmin.rollout.modal.error')}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            data-testid="rollout-cancel"
            className="px-4 py-2 rounded-md border border-border-default text-sm text-text-primary"
          >
            {t('endpointAdmin.modal.cancel')}
          </button>
          <button
            type="submit"
            disabled={isLoading}
            data-testid="rollout-submit"
            className="px-4 py-2 rounded-md bg-brand-primary text-white text-sm font-medium disabled:opacity-50"
          >
            {t('endpointAdmin.rollout.modal.submit')}
          </button>
        </div>
      </form>
    </div>
  );
};

RolloutRingModal.displayName = 'RolloutRingModal';
