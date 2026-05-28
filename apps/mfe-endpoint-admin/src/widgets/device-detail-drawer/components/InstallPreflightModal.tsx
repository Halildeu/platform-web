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
  useCreateInstallMutation,
  useGetInstallPreflightQuery,
} from '../../../app/services/endpointAdminApi';
import {
  tryReadBlockRecompute,
  type CreateInstallSuccess,
  type InstallPreflightDecision,
  type InstallPreflightResponse,
} from '../../../entities/endpoint-install/types';
import { useEndpointAdminI18n } from '../../../i18n';

/**
 * WEB-014D — Install preflight + confirm modal.
 *
 * Lifecycle (Codex 019e6fd1 must-fix #5 absorb):
 * 1. Parent toggles `open` true → mount fetches preflight.
 * 2. PASS/WARN → "Kurulumu Onayla" enabled. Submit POSTs install.
 *    - 201 → toast + onInstalled(commandId) → parent closes modal.
 *    - 409 + shape-guarded BLOCK preflight → modal re-renders BLOCK
 *      in place using `tryReadBlockRecompute(error.data)` (must-fix #4).
 *    - 400 / 403 / 404 / other → toast.
 * 3. ESC / overlay click / cancel button → onClose. Parent owns lifecycle.
 *
 * State reset (must-fix #5): any change to `deviceId` / `catalogItemId`
 * clears local block override, reason text, toast, and the stable
 * idempotency key. `open=false → true` also re-keys idempotency so a
 * fresh modal intent never reuses the previous intent's key. Same
 * intent retries (e.g. user clicks Confirm a second time after a
 * transient 5xx) reuse the same key — the backend deduplicates by
 * `admin-install:{device}:{catalog}:{suffix}`.
 */
export interface InstallPreflightModalProps {
  open: boolean;
  deviceId: string;
  catalogItemId: string;
  catalogDisplayName: string;
  onClose: () => void;
  onInstalled: (command: CreateInstallSuccess) => void;
}

const DECISION_BADGE_CLASSES: Record<InstallPreflightDecision, string> = {
  PASS: 'bg-state-success-subtle text-state-success-text border-state-success-border',
  WARN: 'bg-state-warning-subtle text-state-warning-text border-state-warning-border',
  BLOCK: 'bg-state-danger-subtle text-state-danger-text border-state-danger-border',
};

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `inst-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function tKey<T extends string>(prefix: string, code: T): string {
  return `${prefix}.${code}`;
}

interface ReasonListProps {
  heading: string;
  codes: string[];
  tone: 'neutral' | 'warning' | 'danger';
  t: (key: string) => string;
  testId: string;
}

const ReasonList: React.FC<ReasonListProps> = ({ heading, codes, tone, t, testId }) => {
  if (codes.length === 0) return null;
  const toneClass =
    tone === 'danger'
      ? 'text-state-danger-text'
      : tone === 'warning'
        ? 'text-state-warning-text'
        : 'text-text-primary';
  return (
    <section className="space-y-1" data-testid={testId}>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
        {heading}
      </h4>
      <ul className={`list-disc list-inside text-sm ${toneClass}`}>
        {codes.map((code) => (
          <li key={code} data-testid={`${testId}-item-${code}`}>
            {t(tKey('endpointAdmin.drawer.install.reasonCode', code))}
          </li>
        ))}
      </ul>
    </section>
  );
};

interface RequirementsListProps {
  items: string[];
  t: (key: string) => string;
}

const RequirementsList: React.FC<RequirementsListProps> = ({ items, t }) => {
  if (items.length === 0) return null;
  return (
    <section className="space-y-1" data-testid="install-modal-requirements">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
        {t('endpointAdmin.drawer.install.requirements.heading')}
      </h4>
      <ul className="list-disc list-inside text-sm text-text-primary">
        {items.map((item, index) => (
          <li key={`${index}-${item}`}>{item}</li>
        ))}
      </ul>
    </section>
  );
};

interface EvidenceBlockProps {
  preflight: InstallPreflightResponse;
  t: (key: string) => string;
}

const EvidenceBlock: React.FC<EvidenceBlockProps> = ({ preflight, t }) => {
  const ev = preflight.evidence;
  const rows: { key: string; text: string }[] = [];
  if (ev.inventoryUpdatedAt) {
    rows.push({
      key: 'inv',
      text: t('endpointAdmin.drawer.install.evidence.inventoryUpdated').replace(
        '{timestamp}',
        formatTimestamp(ev.inventoryUpdatedAt),
      ),
    });
  }
  if (ev.summaryCollectedAt) {
    rows.push({
      key: 'summary',
      text: t('endpointAdmin.drawer.install.evidence.summaryCollected').replace(
        '{timestamp}',
        formatTimestamp(ev.summaryCollectedAt),
      ),
    });
  }
  if (ev.appsCollectedAt) {
    rows.push({
      key: 'apps',
      text: t('endpointAdmin.drawer.install.evidence.appsCollected').replace(
        '{timestamp}',
        formatTimestamp(ev.appsCollectedAt),
      ),
    });
  }
  if (ev.wingetEgressCollectedAt) {
    rows.push({
      key: 'egress',
      text: t('endpointAdmin.drawer.install.evidence.wingetEgress')
        .replace('{timestamp}', formatTimestamp(ev.wingetEgressCollectedAt))
        .replace(
          '{schemaVersion}',
          ev.wingetEgressSchemaVersion !== null ? String(ev.wingetEgressSchemaVersion) : '?',
        ),
    });
  }
  if (ev.catalogRowVersion !== null || ev.catalogLastUpdatedAt) {
    rows.push({
      key: 'catalog',
      text: t('endpointAdmin.drawer.install.evidence.catalogRev')
        .replace('{rowVersion}', ev.catalogRowVersion !== null ? String(ev.catalogRowVersion) : '?')
        .replace('{timestamp}', formatTimestamp(ev.catalogLastUpdatedAt)),
    });
  }
  if (rows.length === 0) return null;
  return (
    <section className="space-y-1" data-testid="install-modal-evidence">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
        {t('endpointAdmin.drawer.install.evidence.heading')}
      </h4>
      <ul className="text-xs text-text-secondary space-y-0.5">
        {rows.map((row) => (
          <li key={row.key}>{row.text}</li>
        ))}
      </ul>
    </section>
  );
};

export const InstallPreflightModal: React.FC<InstallPreflightModalProps> = ({
  open,
  deviceId,
  catalogItemId,
  catalogDisplayName,
  onClose,
  onInstalled,
}) => {
  const { t } = useEndpointAdminI18n();
  const layerId = React.useId();

  // Codex 019e6fd1 must-fix #6: stable per-intent idempotency key.
  // A retry of the same submit (modal open, same catalog item) reuses
  // the key so the backend deduplicates; a brand-new intent (reopen,
  // different catalog) regenerates. Initialised empty and assigned
  // by the per-intent reset effect below — the Confirm button stays
  // disabled until the preflight resolves, by which time the effect
  // has populated the key.
  const [idempotencyKey, setIdempotencyKey] = React.useState<string>('');
  const [reason, setReason] = React.useState('');
  const [localBlock, setLocalBlock] = React.useState<InstallPreflightResponse | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);

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
  useEscapeKey(open, onClose, { layerId });

  // Must-fix #5: per-intent state reset. Keyed on (open, deviceId,
  // catalogItemId) so reopening the modal for the same catalog item
  // also issues a fresh idempotency key (treated as a new intent).
  React.useEffect(() => {
    if (open) {
      setIdempotencyKey(generateIdempotencyKey());
      setReason('');
      setLocalBlock(null);
      setToast(null);
    }
  }, [open, deviceId, catalogItemId]);

  // Must-fix #3 defence-in-depth: refetch on every mount / args change
  // so a router-level cache cannot serve a stale preflight even with
  // `keepUnusedDataFor: 0` on the endpoint.
  const {
    data: serverPreflight,
    error: preflightError,
    isLoading: preflightLoading,
    isFetching: preflightFetching,
  } = useGetInstallPreflightQuery(
    { deviceId, catalogItemId },
    { skip: !open, refetchOnMountOrArgChange: true },
  );

  const [createInstall, createState] = useCreateInstallMutation();

  // Must-fix #4 + #C answer: local BLOCK override has priority over
  // any server preflight render. A 409 BLOCK recompute mutates only
  // localBlock; the underlying query data is not invalidated.
  const effectivePreflight: InstallPreflightResponse | null = localBlock ?? serverPreflight ?? null;

  if (!open) return null;

  const handleSubmit = async () => {
    setToast(null);
    try {
      const command = await createInstall({
        deviceId,
        body: {
          catalogItemId,
          idempotencyKey,
          reason: reason.trim() ? reason.trim() : undefined,
        },
      }).unwrap();
      onInstalled(command);
    } catch (err: unknown) {
      const status =
        err && typeof err === 'object' && 'status' in err
          ? (err as { status: unknown }).status
          : null;
      const errData =
        err && typeof err === 'object' && 'data' in err ? (err as { data: unknown }).data : null;

      if (status === 409) {
        const blockResp = tryReadBlockRecompute(errData);
        if (blockResp) {
          setLocalBlock(blockResp);
          setToast(t('endpointAdmin.drawer.install.toast.blockRecompute'));
          return;
        }
        // 409 was an idempotency-key collision or another non-BLOCK
        // case — surface as generic error.
        setToast(t('endpointAdmin.drawer.install.toast.error'));
        return;
      }
      if (status === 400) {
        setToast(t('endpointAdmin.drawer.install.toast.validation'));
        return;
      }
      if (status === 403) {
        setToast(t('endpointAdmin.drawer.install.toast.forbidden'));
        return;
      }
      if (status === 404) {
        setToast(t('endpointAdmin.drawer.install.toast.notFound'));
        return;
      }
      setToast(t('endpointAdmin.drawer.install.toast.error'));
    }
  };

  const renderPreflightBody = () => {
    if (preflightLoading || preflightFetching) {
      return (
        <p className="text-sm text-text-secondary py-4" data-testid="install-modal-loading">
          {t('endpointAdmin.drawer.install.modal.loading')}
        </p>
      );
    }
    if (preflightError && !effectivePreflight) {
      const status =
        typeof preflightError === 'object' && preflightError && 'status' in preflightError
          ? (preflightError as { status: unknown }).status
          : null;
      const messageKey =
        status === 403
          ? 'endpointAdmin.drawer.install.modal.forbidden'
          : status === 404
            ? 'endpointAdmin.drawer.install.modal.notFound'
            : 'endpointAdmin.drawer.install.modal.error';
      return (
        <p className="text-sm text-state-danger-text py-4" data-testid="install-modal-error">
          {t(messageKey)}
        </p>
      );
    }
    if (!effectivePreflight) {
      return null;
    }

    const decision = effectivePreflight.decision;
    const decisionBadgeClass = DECISION_BADGE_CLASSES[decision];
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            data-testid={`install-modal-decision-${decision}`}
            aria-label={t(`endpointAdmin.drawer.install.decision.${decision}.aria`)}
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${decisionBadgeClass}`}
          >
            {t(`endpointAdmin.drawer.install.decision.${decision}.label`)}
          </span>
          <span
            data-testid={`install-modal-installed-state-${effectivePreflight.installedState}`}
            className="inline-flex items-center rounded-full border border-border-default bg-surface-default px-3 py-1 text-xs text-text-secondary"
          >
            {t(`endpointAdmin.drawer.install.installedState.${effectivePreflight.installedState}`)}
          </span>
        </div>

        <ReasonList
          heading={t('endpointAdmin.drawer.install.blockingReasons.heading')}
          codes={effectivePreflight.blockingReasons}
          tone="danger"
          t={t}
          testId="install-modal-blocking-reasons"
        />
        <ReasonList
          heading={t('endpointAdmin.drawer.install.warnings.heading')}
          codes={effectivePreflight.warnings}
          tone="warning"
          t={t}
          testId="install-modal-warnings"
        />
        <ReasonList
          heading={t('endpointAdmin.drawer.install.reasons.heading')}
          codes={effectivePreflight.reasons.filter(
            (r) =>
              !effectivePreflight.blockingReasons.includes(r) &&
              !effectivePreflight.warnings.includes(r),
          )}
          tone="neutral"
          t={t}
          testId="install-modal-reasons"
        />
        <RequirementsList items={effectivePreflight.requirements} t={t} />
        <EvidenceBlock preflight={effectivePreflight} t={t} />
      </div>
    );
  };

  const confirmDisabled =
    !effectivePreflight ||
    effectivePreflight.decision === 'BLOCK' ||
    createState.isLoading ||
    preflightLoading;

  const title = t('endpointAdmin.drawer.install.modal.title').replace('{name}', catalogDisplayName);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="install-preflight-modal"
      data-layer-id={layerId}
      className="fixed inset-0 z-[1500] flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-surface-overlay/60" onClick={onClose} aria-hidden />
      <div
        ref={panelRef as React.RefObject<HTMLDivElement>}
        tabIndex={-1}
        className="relative w-full max-w-lg bg-surface-default rounded-xl shadow-2xl mx-4 max-h-[85vh] flex flex-col"
        data-testid="install-preflight-modal-panel"
      >
        <header className="px-6 py-4 border-b border-border-subtle">
          <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
        </header>
        <div className="px-6 py-4 space-y-4 overflow-y-auto">
          {renderPreflightBody()}

          {toast && (
            <div
              role="alert"
              data-testid="install-modal-toast"
              className="rounded-md border border-state-danger-border bg-state-danger-subtle px-3 py-2 text-sm text-state-danger-text"
            >
              {toast}
            </div>
          )}

          <label className="block">
            <span className="text-sm text-text-secondary block mb-1">
              {t('endpointAdmin.drawer.install.reason.label')}
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('endpointAdmin.drawer.install.reason.placeholder')}
              data-testid="install-modal-reason"
              rows={3}
              maxLength={512}
              className="w-full rounded-md border border-border-default px-3 py-2 text-sm bg-surface-default"
            />
            <div className="text-right text-xs text-text-subtle mt-1">{reason.length}/512</div>
          </label>
        </div>
        <footer className="px-6 py-4 border-t border-border-subtle flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={createState.isLoading}
            data-testid="install-modal-cancel"
            className="px-4 py-2 rounded-md border border-border-default text-sm text-text-primary"
          >
            {t('endpointAdmin.drawer.install.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={confirmDisabled}
            data-testid="install-modal-confirm"
            className="px-4 py-2 rounded-md bg-primary text-white text-sm font-medium disabled:opacity-50"
          >
            {t('endpointAdmin.drawer.install.confirm')}
          </button>
        </footer>
      </div>
    </div>
  );
};

InstallPreflightModal.displayName = 'InstallPreflightModal';
