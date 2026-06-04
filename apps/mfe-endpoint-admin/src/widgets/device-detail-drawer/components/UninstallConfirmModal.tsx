import React from 'react';
import {
  registerLayer,
  unregisterLayer,
  useEscapeKey,
  useFocusTrap,
  useScrollLock,
  useSiblingIsolation,
} from '@mfe/design-system/internal/overlay-engine';
import { useCreateUninstallMutation } from '../../../app/services/endpointAdminApi';
import {
  readErrorDetail,
  readErrorStatus,
  UNINSTALL_ERROR_HEADLINE_FALLBACK_KEY,
  UNINSTALL_ERROR_HEADLINE_KEY,
  type CreateUninstallSuccess,
} from '../../../entities/endpoint-uninstall/types';
import { useEndpointAdminI18n } from '../../../i18n';

/**
 * AG-028 Phase 3 — managed-uninstall confirm modal (Codex 019e93a4
 * plan point #3 + 019e93ab gap ruling).
 *
 * There is NO uninstall-preflight (unlike install). This is a pure
 * confirmation dialog with a REQUIRED reason textarea (the destructive
 * counterpart to install's OPTIONAL reason — an uninstall should always
 * carry a justification). Submit POSTs `/uninstalls`:
 *  - 201 → onProposed(request) → parent toasts + closes
 *  - gate failure (422 / 409 / 503 / 403 / 424 / 400 / 404) → inline
 *    error block: localized headline keyed on HTTP status + the server's
 *    verbatim `message` as actionable detail (Codex 019e93ab b3 — the
 *    five 422 sub-reasons share one HTTP status with no stable machine
 *    code, so we DO NOT substring-match the English sentence). Unknown /
 *    missing body shape never crashes render.
 *
 * Idempotency-key stability (mirror of InstallPreflightModal must-fix
 * #6): a stable per-intent key is generated when the modal opens (in a
 * `useLayoutEffect` so it's set before first paint). A retry of the
 * same submit (same modal open) reuses the key so the backend
 * deduplicates; reopening regenerates a fresh key.
 *
 * In-flight race guard (mirror of InstallPreflightModal must-fix #1):
 * ESC / overlay / cancel are absorbed while the POST is in flight, and
 * an `intentRef` + `mountedRef` drop a late resolution if the active
 * intent changed (reopen / different catalog) or the modal unmounted.
 */
export interface UninstallConfirmModalProps {
  open: boolean;
  deviceId: string;
  /** Public catalog slug (sent as `catalogItemId` in the POST body). */
  catalogItemId: string;
  catalogDisplayName: string;
  onClose: () => void;
  onProposed: (request: CreateUninstallSuccess) => void;
}

const REASON_MAX = 512;

function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `uninst-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

interface ErrorState {
  headline: string;
  detail: string;
}

export const UninstallConfirmModal: React.FC<UninstallConfirmModalProps> = ({
  open,
  deviceId,
  catalogItemId,
  catalogDisplayName,
  onClose,
  onProposed,
}) => {
  const { t } = useEndpointAdminI18n();
  const layerId = React.useId();

  const [idempotencyKey, setIdempotencyKey] = React.useState<string>('');
  const [reason, setReason] = React.useState('');
  const [errorState, setErrorState] = React.useState<ErrorState | null>(null);

  const panelRef = useFocusTrap({
    active: open,
    autoFocus: true,
    restoreFocus: true,
    layerId,
  });
  useSiblingIsolation({ active: open, layerId, panelRef });
  useScrollLock(open);
  React.useEffect(() => {
    if (open) registerLayer(layerId, 'modal');
    return () => {
      if (open) unregisterLayer(layerId);
    };
  }, [open, layerId]);

  const intentRef = React.useRef<string>('');
  const mountedRef = React.useRef<boolean>(true);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Per-intent reset. Keyed on (open, deviceId, catalogItemId) so
  // reopening for the same catalog item also issues a fresh idempotency
  // key (treated as a new intent). Runs as `useLayoutEffect` so the key
  // is set synchronously after commit but BEFORE the browser paints —
  // the first visible frame already has a valid key (no "silik" frame
  // where submit is disabled because the key is empty — mirror of the
  // install modal's 019e830b fix).
  React.useLayoutEffect(() => {
    if (open) {
      const nextKey = generateIdempotencyKey();
      setIdempotencyKey(nextKey);
      setReason('');
      setErrorState(null);
      intentRef.current = `${deviceId}:${catalogItemId}:${nextKey}`;
    } else {
      intentRef.current = '';
    }
  }, [open, deviceId, catalogItemId]);

  const [createUninstall, createState] = useCreateUninstallMutation();

  const guardedOnClose = React.useCallback(() => {
    if (createState.isLoading) return;
    onClose();
  }, [createState.isLoading, onClose]);

  useEscapeKey(open, guardedOnClose, { layerId });

  if (!open) return null;

  const trimmedReason = reason.trim();
  const reasonValid = trimmedReason.length > 0 && trimmedReason.length <= REASON_MAX;

  const mapError = (err: unknown): ErrorState => {
    const status = readErrorStatus(err);
    const headlineKey =
      status !== null && UNINSTALL_ERROR_HEADLINE_KEY[status]
        ? UNINSTALL_ERROR_HEADLINE_KEY[status]
        : UNINSTALL_ERROR_HEADLINE_FALLBACK_KEY;
    const serverDetail = readErrorDetail(err);
    return {
      headline: t(headlineKey),
      // Codex 019e93ab b3: show the server's verbatim message as the
      // actionable detail; fall back to a generic localized line when
      // the body shape is unknown/missing (never crash).
      detail: serverDetail ?? t('endpointAdmin.drawer.uninstall.error.genericDetail'),
    };
  };

  const handleSubmit = async () => {
    if (!reasonValid || createState.isLoading || !idempotencyKey) return;
    setErrorState(null);
    const submittedIntent = intentRef.current;
    try {
      const request = await createUninstall({
        deviceId,
        body: {
          catalogItemId,
          idempotencyKey,
          reason: trimmedReason,
        },
      }).unwrap();
      if (!mountedRef.current || intentRef.current !== submittedIntent) return;
      onProposed(request);
    } catch (err: unknown) {
      if (!mountedRef.current || intentRef.current !== submittedIntent) return;
      setErrorState(mapError(err));
    }
  };

  const submitDisabledReason: 'reason' | 'in-flight' | 'no-key' | 'ok' = !reasonValid
    ? 'reason'
    : createState.isLoading
      ? 'in-flight'
      : !idempotencyKey
        ? 'no-key'
        : 'ok';
  const submitDisabled = submitDisabledReason !== 'ok';

  const title = t('endpointAdmin.drawer.uninstall.modal.title').replace(
    '{name}',
    catalogDisplayName,
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="uninstall-confirm-modal"
      data-layer-id={layerId}
      className="fixed inset-0 z-[1500] flex items-center justify-center"
    >
      <div
        className="absolute inset-0 bg-surface-overlay/60"
        onClick={guardedOnClose}
        aria-hidden
      />
      <div
        ref={panelRef as React.RefObject<HTMLDivElement>}
        tabIndex={-1}
        className="relative w-full max-w-lg bg-surface-default rounded-xl shadow-2xl mx-4 max-h-[85vh] flex flex-col"
        data-testid="uninstall-confirm-modal-panel"
      >
        <header className="px-6 py-4 border-b border-border-subtle">
          <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
        </header>
        <div className="px-6 py-4 space-y-4 overflow-y-auto">
          <p className="text-sm text-text-secondary" data-testid="uninstall-modal-warning">
            {t('endpointAdmin.drawer.uninstall.modal.warning')}
          </p>

          {errorState && (
            <div
              role="alert"
              data-testid="uninstall-modal-error"
              className="rounded-md border border-state-danger-border bg-state-danger-bg px-3 py-2 text-sm text-state-danger-text"
            >
              <p className="font-medium" data-testid="uninstall-modal-error-headline">
                {errorState.headline}
              </p>
              <p
                className="mt-0.5 text-xs text-state-danger-text/90"
                data-testid="uninstall-modal-error-detail"
              >
                {errorState.detail}
              </p>
            </div>
          )}

          <label className="block">
            <span className="text-sm text-text-secondary block mb-1">
              {t('endpointAdmin.drawer.uninstall.reason.label')}
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('endpointAdmin.drawer.uninstall.reason.placeholder')}
              data-testid="uninstall-modal-reason"
              rows={3}
              maxLength={REASON_MAX}
              aria-required="true"
              aria-invalid={!reasonValid}
              className="w-full rounded-md border border-border-default px-3 py-2 text-sm bg-surface-default"
            />
            <div className="flex items-center justify-between mt-1">
              {!reasonValid ? (
                <span
                  className="text-xs text-state-danger-text"
                  data-testid="uninstall-modal-reason-error"
                >
                  {t('endpointAdmin.drawer.uninstall.reason.required')}
                </span>
              ) : (
                <span />
              )}
              <span className="text-right text-xs text-text-subtle">
                {reason.length}/{REASON_MAX}
              </span>
            </div>
          </label>
        </div>
        <footer className="px-6 py-4 border-t border-border-subtle flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={guardedOnClose}
            disabled={createState.isLoading}
            data-testid="uninstall-modal-cancel"
            className="px-4 py-2 rounded-md border border-border-default text-sm text-text-primary"
          >
            {t('endpointAdmin.drawer.uninstall.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitDisabled}
            data-testid="uninstall-modal-confirm"
            data-confirm-disabled-reason={submitDisabledReason}
            className="px-4 py-2 rounded-md bg-state-danger-text text-white text-sm font-medium disabled:opacity-50"
          >
            {t('endpointAdmin.drawer.uninstall.confirm')}
          </button>
        </footer>
      </div>
    </div>
  );
};

UninstallConfirmModal.displayName = 'UninstallConfirmModal';
