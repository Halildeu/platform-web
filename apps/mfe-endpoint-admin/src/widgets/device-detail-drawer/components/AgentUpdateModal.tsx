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
import {
  useDispatchAgentUpdateMutation,
  useListAgentUpdateReleasesQuery,
} from '../../../app/services/endpointAdminApi';

export interface AgentUpdateModalProps {
  open: boolean;
  deviceId: string;
  onCancel: () => void;
  /** Fires with the new UPDATE_AGENT command id after a successful dispatch. */
  onDispatched: (commandId: string) => void;
}

/**
 * AG-029 (Faz 22.5) — catalog-bound signed agent self-update dispatch modal.
 *
 * SECURITY (Codex 019ea0a6): the operator only PICKS an approved+enabled
 * release; the dispatch body is EXACTLY `{ releaseId, reason }`. No trust
 * material (binaryUrl / hash / signer / tier) is ever collected or sent — the
 * trust decision was made at release-approve time (maker-checker on the
 * catalog), and the backend (BE-032) re-resolves everything server-side and
 * rejects caller-supplied trust fields with HTTP 400. The submit handler
 * constructs the body explicitly and never spreads the selected release.
 *
 * This is deliberately NOT placed under the dual-control destructive header:
 * BE-032 is a direct dispatch of an already-approved artifact, so the UI must
 * not imply a second per-dispatch approval gate it does not enforce.
 */
export const AgentUpdateModal: React.FC<AgentUpdateModalProps> = ({
  open,
  deviceId,
  onCancel,
  onDispatched,
}) => {
  const { t } = useEndpointAdminI18n();
  const layerId = React.useId();
  const [selectedReleaseId, setSelectedReleaseId] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState('');
  const [submitted, setSubmitted] = React.useState(false);

  const {
    data: releases,
    isLoading: releasesLoading,
    isError: releasesError,
  } = useListAgentUpdateReleasesQuery(
    { status: 'APPROVED', enabled: true, size: 50 },
    { skip: !open },
  );
  const [dispatchAgentUpdate, { isLoading: dispatching, error: dispatchError }] =
    useDispatchAgentUpdateMutation();

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
      setSelectedReleaseId(null);
      setReason('');
      setSubmitted(false);
    }
  }, [open]);

  if (!open) return null;

  // BE-031 returns a Spring Page envelope ({ content, ... }); unwrap to the rows.
  const dispatchable = releases?.content ?? [];
  const trimmedReason = reason.trim();
  const reasonError = submitted && trimmedReason.length === 0;
  const reasonTooLong = trimmedReason.length > 512;
  const noReleases = !releasesLoading && !releasesError && dispatchable.length === 0;
  const canDispatch =
    !!selectedReleaseId && trimmedReason.length > 0 && !reasonTooLong && !dispatching;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!selectedReleaseId || !trimmedReason || reasonTooLong) return;
    try {
      // SECURITY: construct the body EXPLICITLY — never spread the release.
      const cmd = await dispatchAgentUpdate({
        deviceId,
        body: { releaseId: selectedReleaseId, reason: trimmedReason },
      }).unwrap();
      onDispatched(cmd.id);
    } catch {
      // RTK keeps `dispatchError`; the inline error block renders it.
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('endpointAdmin.modal.title.UPDATE_AGENT')}
      data-testid="agent-update-modal"
      data-layer-id={layerId}
      className="fixed inset-0 z-[1400] flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-surface-overlay/60" onClick={onCancel} aria-hidden />
      <form
        ref={panelRef as React.RefObject<HTMLFormElement>}
        onSubmit={handleSubmit}
        tabIndex={-1}
        className="relative w-full max-w-md bg-surface-default rounded-xl shadow-2xl p-6 mx-4"
        data-testid="agent-update-modal-form"
      >
        <h3 className="text-lg font-semibold text-text-primary mb-1">
          {t('endpointAdmin.modal.title.UPDATE_AGENT')}
        </h3>
        <p className="text-xs text-text-secondary mb-4">
          {t('endpointAdmin.modal.agentUpdate.note')}
        </p>

        <div className="block mb-4">
          <span className="text-sm text-text-secondary block mb-2">
            {t('endpointAdmin.modal.agentUpdate.releaseLabel')}
          </span>

          {releasesLoading && (
            <div
              className="text-sm text-text-secondary"
              data-testid="agent-update-releases-loading"
            >
              {t('endpointAdmin.modal.agentUpdate.loading')}
            </div>
          )}
          {releasesError && (
            <div className="text-sm text-danger" data-testid="agent-update-releases-error">
              {t('endpointAdmin.modal.agentUpdate.releasesError')}
            </div>
          )}
          {noReleases && (
            <div
              className="rounded-md border border-state-warning-border bg-state-warning-subtle px-3 py-2 text-sm text-state-warning-text"
              data-testid="agent-update-no-releases"
            >
              {t('endpointAdmin.modal.agentUpdate.noReleases')}
            </div>
          )}

          {dispatchable.length > 0 && (
            <ul className="space-y-2" data-testid="agent-update-release-list">
              {dispatchable.map((r) => (
                <li key={r.releaseId}>
                  <label
                    className="flex items-start gap-2 rounded-md border border-border-default px-3 py-2 cursor-pointer hover:bg-surface-hover"
                    data-testid={`agent-update-release-${r.releaseId}`}
                  >
                    <input
                      type="radio"
                      name="agent-update-release"
                      value={r.releaseId}
                      checked={selectedReleaseId === r.releaseId}
                      onChange={() => setSelectedReleaseId(r.releaseId)}
                      className="mt-1"
                      data-testid={`agent-update-release-radio-${r.releaseId}`}
                    />
                    <span className="flex-1">
                      <span className="font-mono text-sm text-text-primary">{r.targetVersion}</span>
                      <span className="flex flex-wrap gap-1 mt-1">
                        <span
                          className={
                            r.signingTier === 'TRUSTED_SIGNED'
                              ? 'text-xs rounded bg-state-success-subtle px-1.5 py-0.5 text-state-success-text'
                              : 'text-xs rounded bg-state-warning-subtle px-1.5 py-0.5 text-state-warning-text'
                          }
                        >
                          {t(`endpointAdmin.modal.agentUpdate.tier.${r.signingTier}`)}
                        </span>
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <label className="block mb-4">
          <span className="text-sm text-text-secondary block mb-1">
            {t('endpointAdmin.modal.field.reason')}
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('endpointAdmin.modal.field.reasonPlaceholder')}
            data-testid="agent-update-reason"
            aria-invalid={reasonError || reasonTooLong}
            rows={3}
            maxLength={600}
            className="w-full rounded-md border border-border-default px-3 py-2 text-sm bg-surface-default"
          />
          <div className="flex items-center justify-between mt-1">
            {reasonError ? (
              <span className="text-xs text-danger" data-testid="agent-update-reason-error">
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

        {dispatchError && (
          <div
            className="text-sm text-danger mb-3"
            role="alert"
            data-testid="agent-update-dispatch-error"
          >
            {t('endpointAdmin.modal.agentUpdate.dispatchError')}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={dispatching}
            data-testid="agent-update-cancel"
            className="px-4 py-2 rounded-md border border-border-default text-sm text-text-primary"
          >
            {t('endpointAdmin.modal.cancel')}
          </button>
          <button
            type="submit"
            disabled={!canDispatch}
            data-testid="agent-update-submit"
            className="px-4 py-2 rounded-md bg-brand-primary text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('endpointAdmin.modal.agentUpdate.dispatch')}
          </button>
        </div>
      </form>
    </div>
  );
};

AgentUpdateModal.displayName = 'AgentUpdateModal';
