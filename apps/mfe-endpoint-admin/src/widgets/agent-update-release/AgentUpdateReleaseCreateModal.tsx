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
import { useCreateAgentUpdateReleaseMutation } from '../../app/services/endpointAdminApi';
import type {
  AgentUpdateChannel,
  AgentUpdateReleaseRequest,
  AgentUpdateSigningTier,
} from '../../entities/agent-update/types';

export interface AgentUpdateReleaseCreateModalProps {
  open: boolean;
  onCancel: () => void;
  onCreated: (releaseId: string) => void;
}

const CHANNELS: AgentUpdateChannel[] = ['STAGING', 'PILOT', 'STABLE'];
const TIERS: AgentUpdateSigningTier[] = ['TRUSTED_SIGNED', 'LAB_ONLY_EVIDENCE'];

// Client-side hard checks (Codex 019ea0a6). The backend stays authoritative;
// these catch obvious operator mistakes before trust material is submitted.
const RELEASE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SHA256_RE = /^[A-Fa-f0-9]{64}$/;
const SHA512_RE = /^[A-Fa-f0-9]{128}$/;
const THUMBPRINT_RE = /^[A-Fa-f0-9]+$/;

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

type Fields = {
  releaseId: string;
  channel: AgentUpdateChannel;
  targetVersion: string;
  binaryUrl: string;
  manifestUrl: string;
  sha256: string;
  sha512: string;
  signerThumbprint: string;
  signingTier: AgentUpdateSigningTier;
  releaseNotes: string;
};

const EMPTY: Fields = {
  releaseId: '',
  channel: 'STAGING',
  targetVersion: '',
  binaryUrl: '',
  manifestUrl: '',
  sha256: '',
  sha512: '',
  signerThumbprint: '',
  signingTier: 'TRUSTED_SIGNED',
  releaseNotes: '',
};

/**
 * BE-031 create-release form. Deliberately collects trust material
 * (binaryUrl / sha256 / sha512 / signerThumbprint / signingTier) — this is the
 * trust-establishment surface, unlike the dispatch modal. The backend creates
 * the release as DRAFT; the trust decision is sealed only at /approve.
 */
export const AgentUpdateReleaseCreateModal: React.FC<AgentUpdateReleaseCreateModalProps> = ({
  open,
  onCancel,
  onCreated,
}) => {
  const { t } = useEndpointAdminI18n();
  const layerId = React.useId();
  const [f, setF] = React.useState<Fields>(EMPTY);
  const [submitted, setSubmitted] = React.useState(false);
  const [create, { isLoading, error }] = useCreateAgentUpdateReleaseMutation();

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
      setF(EMPTY);
      setSubmitted(false);
    }
  }, [open]);

  if (!open) return null;

  const set = (k: keyof Fields, v: string) => setF((p) => ({ ...p, [k]: v }));
  const errors: Partial<Record<keyof Fields, boolean>> = {
    releaseId: !RELEASE_ID_RE.test(f.releaseId.trim()) || f.releaseId.trim().length > 128,
    targetVersion: f.targetVersion.trim().length === 0 || f.targetVersion.trim().length > 64,
    binaryUrl: !isHttpsUrl(f.binaryUrl.trim()),
    manifestUrl: f.manifestUrl.trim().length > 0 && !isHttpsUrl(f.manifestUrl.trim()),
    sha256: !SHA256_RE.test(f.sha256.trim()),
    sha512: f.sha512.trim().length > 0 && !SHA512_RE.test(f.sha512.trim()),
    signerThumbprint:
      !THUMBPRINT_RE.test(f.signerThumbprint.trim()) || f.signerThumbprint.trim().length > 96,
    releaseNotes: f.releaseNotes.length > 2048,
  };
  const hasErrors = Object.values(errors).some(Boolean);
  const isLab = f.signingTier === 'LAB_ONLY_EVIDENCE';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (hasErrors) return;
    const body: AgentUpdateReleaseRequest = {
      releaseId: f.releaseId.trim(),
      channel: f.channel,
      targetVersion: f.targetVersion.trim(),
      binaryUrl: f.binaryUrl.trim(),
      sha256: f.sha256.trim(),
      signerThumbprint: f.signerThumbprint.trim(),
      signingTier: f.signingTier,
      ...(f.manifestUrl.trim() ? { manifestUrl: f.manifestUrl.trim() } : {}),
      ...(f.sha512.trim() ? { sha512: f.sha512.trim() } : {}),
      ...(f.releaseNotes.trim() ? { releaseNotes: f.releaseNotes.trim() } : {}),
    };
    try {
      const res = await create({ body }).unwrap();
      onCreated(res.releaseId ?? f.releaseId.trim());
    } catch {
      /* error rendered inline below */
    }
  };

  const fieldErr = (k: keyof Fields) => submitted && errors[k];
  const inputCls = (k: keyof Fields) =>
    `w-full rounded-md border px-3 py-2 text-sm bg-surface-default ${
      fieldErr(k) ? 'border-danger' : 'border-border-default'
    }`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('endpointAdmin.releases.create.title')}
      data-testid="release-create-modal"
      data-layer-id={layerId}
      className="fixed inset-0 z-[1400] flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-surface-overlay/60" onClick={onCancel} aria-hidden />
      <form
        ref={panelRef as unknown as React.RefObject<HTMLFormElement>}
        onSubmit={handleSubmit}
        tabIndex={-1}
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-surface-default rounded-xl shadow-2xl p-6 mx-4 space-y-3"
        data-testid="release-create-form"
      >
        <h3 className="text-lg font-semibold text-text-primary">
          {t('endpointAdmin.releases.create.title')}
        </h3>

        <label className="block">
          <span className="text-sm text-text-secondary block mb-1">
            {t('endpointAdmin.releases.field.releaseId')}
          </span>
          <input
            type="text"
            value={f.releaseId}
            onChange={(e) => set('releaseId', e.target.value)}
            data-testid="release-field-releaseId"
            aria-invalid={!!fieldErr('releaseId')}
            className={inputCls('releaseId')}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-text-secondary block mb-1">
              {t('endpointAdmin.releases.field.channel')}
            </span>
            <select
              value={f.channel}
              onChange={(e) => set('channel', e.target.value)}
              data-testid="release-field-channel"
              className="w-full rounded-md border border-border-default px-3 py-2 text-sm bg-surface-default"
            >
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-text-secondary block mb-1">
              {t('endpointAdmin.releases.field.targetVersion')}
            </span>
            <input
              type="text"
              value={f.targetVersion}
              onChange={(e) => set('targetVersion', e.target.value)}
              data-testid="release-field-targetVersion"
              aria-invalid={!!fieldErr('targetVersion')}
              className={inputCls('targetVersion')}
            />
          </label>
        </div>

        <label className="block">
          <span className="text-sm text-text-secondary block mb-1">
            {t('endpointAdmin.releases.field.binaryUrl')}
          </span>
          <input
            type="text"
            value={f.binaryUrl}
            onChange={(e) => set('binaryUrl', e.target.value)}
            placeholder="https://…"
            data-testid="release-field-binaryUrl"
            aria-invalid={!!fieldErr('binaryUrl')}
            className={inputCls('binaryUrl')}
          />
        </label>

        <label className="block">
          <span className="text-sm text-text-secondary block mb-1">
            {t('endpointAdmin.releases.field.manifestUrl')}
          </span>
          <input
            type="text"
            value={f.manifestUrl}
            onChange={(e) => set('manifestUrl', e.target.value)}
            placeholder="https://… (opsiyonel)"
            data-testid="release-field-manifestUrl"
            aria-invalid={!!fieldErr('manifestUrl')}
            className={inputCls('manifestUrl')}
          />
        </label>

        <label className="block">
          <span className="text-sm text-text-secondary block mb-1">
            {t('endpointAdmin.releases.field.sha256')}
          </span>
          <input
            type="text"
            value={f.sha256}
            onChange={(e) => set('sha256', e.target.value)}
            data-testid="release-field-sha256"
            aria-invalid={!!fieldErr('sha256')}
            className={`font-mono ${inputCls('sha256')}`}
          />
        </label>

        <label className="block">
          <span className="text-sm text-text-secondary block mb-1">
            {t('endpointAdmin.releases.field.sha512')}
          </span>
          <input
            type="text"
            value={f.sha512}
            onChange={(e) => set('sha512', e.target.value)}
            data-testid="release-field-sha512"
            aria-invalid={!!fieldErr('sha512')}
            className={`font-mono ${inputCls('sha512')}`}
          />
        </label>

        <label className="block">
          <span className="text-sm text-text-secondary block mb-1">
            {t('endpointAdmin.releases.field.signerThumbprint')}
          </span>
          <input
            type="text"
            value={f.signerThumbprint}
            onChange={(e) => set('signerThumbprint', e.target.value)}
            data-testid="release-field-signerThumbprint"
            aria-invalid={!!fieldErr('signerThumbprint')}
            className={`font-mono ${inputCls('signerThumbprint')}`}
          />
        </label>

        <label className="block">
          <span className="text-sm text-text-secondary block mb-1">
            {t('endpointAdmin.releases.field.signingTier')}
          </span>
          <select
            value={f.signingTier}
            onChange={(e) => set('signingTier', e.target.value)}
            data-testid="release-field-signingTier"
            className="w-full rounded-md border border-border-default px-3 py-2 text-sm bg-surface-default"
          >
            {TIERS.map((tier) => (
              <option key={tier} value={tier}>
                {t(`endpointAdmin.releases.tier.${tier}`)}
              </option>
            ))}
          </select>
        </label>

        {isLab && (
          <div
            role="status"
            data-testid="release-lab-warning"
            className="rounded-md border border-state-warning-border bg-state-warning-subtle px-3 py-2 text-sm text-state-warning-text"
          >
            {t('endpointAdmin.releases.create.labWarning')}
          </div>
        )}

        <label className="block">
          <span className="text-sm text-text-secondary block mb-1">
            {t('endpointAdmin.releases.field.releaseNotes')}
          </span>
          <textarea
            value={f.releaseNotes}
            onChange={(e) => set('releaseNotes', e.target.value)}
            rows={2}
            maxLength={2100}
            data-testid="release-field-releaseNotes"
            className={inputCls('releaseNotes')}
          />
        </label>

        {error && (
          <div className="text-sm text-danger" role="alert" data-testid="release-create-error">
            {t('endpointAdmin.releases.create.error')}
          </div>
        )}
        {submitted && hasErrors && (
          <div className="text-xs text-danger" data-testid="release-create-validation">
            {t('endpointAdmin.releases.create.validation')}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            data-testid="release-create-cancel"
            className="px-4 py-2 rounded-md border border-border-default text-sm text-text-primary"
          >
            {t('endpointAdmin.modal.cancel')}
          </button>
          <button
            type="submit"
            disabled={isLoading}
            data-testid="release-create-submit"
            className="px-4 py-2 rounded-md bg-brand-primary text-white text-sm font-medium disabled:opacity-50"
          >
            {t('endpointAdmin.releases.create.submit')}
          </button>
        </div>
      </form>
    </div>
  );
};

AgentUpdateReleaseCreateModal.displayName = 'AgentUpdateReleaseCreateModal';
