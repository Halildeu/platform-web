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
  // different catalog) regenerates.
  //
  // WEB-014D-followup (Codex 019e830b REVISE must_fix #3): the per-
  // intent reset effect below runs as a `useLayoutEffect` so the key
  // is set BEFORE the browser paints. Previously the effect was a
  // post-paint `useEffect`, meaning the first paint observed
  // `idempotencyKey=''` and the confirm button was disabled via the
  // `!idempotencyKey` gate — visible as a "silik" (muted) frame to
  // operators when the lazy `React.Suspense` parent delayed the
  // effect long enough. The empty initial state is preserved (not a
  // lazy `useState` initialiser) to keep the per-intent counter
  // single-source-of-truth in the layout effect — the layout effect
  // generates one key per intent and the existing tests pass.
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

  /* ------------------------------------------------------------------ */
  /* Codex 019e6ff0 post-impl must-fix #1 — in-flight POST race guard.  */
  /*                                                                     */
  /* Background: cancel button was already gated on `createState.       */
  /* isLoading` (see footer), but ESC + overlay click still routed       */
  /* straight to onClose. If the operator pressed ESC after Confirm,    */
  /* the parent would close the modal while the install POST was still  */
  /* in flight; the eventual 201/409 resolution would then fire         */
  /* `onInstalled` / `setLocalBlock` on a closed (or re-opened with a    */
  /* different catalog) modal, leaking commands and producing stale     */
  /* toasts on the next intent. Two defences combine below:             */
  /*                                                                     */
  /*  (a) `guardedOnClose` — ESC / overlay / explicit cancel-style      */
  /*      callers route through this; when the mutation is in flight,   */
  /*      close requests are absorbed (matching the disabled cancel     */
  /*      button semantics so the UI is internally consistent).         */
  /*                                                                     */
  /*  (b) `intentRef` — every mutation captures the active intent       */
  /*      `(deviceId, catalogItemId, idempotencyKey)` at submit time.   */
  /*      A late resolve / reject is dropped if the active intent has   */
  /*      since changed (reopen, different catalog, fresh key). Pairs   */
  /*      with mountedRef so unmount-during-flight also drops the       */
  /*      resolution silently (no state update on unmounted component). */
  /*                                                                     */
  /* Hook ordering note: `useEscapeKey(open, guardedOnClose, ...)` and  */
  /* the `useCallback` it depends on must be declared AFTER             */
  /* `useCreateInstallMutation` because the callback closes over        */
  /* `createState.isLoading`. The refs are declared early so the        */
  /* per-intent reset effect below can write to `intentRef.current`.    */
  /* ------------------------------------------------------------------ */

  const intentRef = React.useRef<string>('');
  const mountedRef = React.useRef<boolean>(true);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Must-fix #5: per-intent state reset. Keyed on (open, deviceId,
  // catalogItemId) so reopening the modal for the same catalog item
  // also issues a fresh idempotency key (treated as a new intent).
  //
  // WEB-014D-followup (Codex 019e830b REVISE must_fix #3): runs as
  // `useLayoutEffect` so the key is set synchronously AFTER React
  // commits the mount but BEFORE the browser paints. Operators no
  // longer see a "silik" (visually-muted) first frame where the
  // confirm button is disabled because `idempotencyKey === ''`.
  React.useLayoutEffect(() => {
    if (open) {
      const nextKey = generateIdempotencyKey();
      setIdempotencyKey(nextKey);
      setReason('');
      setLocalBlock(null);
      setToast(null);
      intentRef.current = `${deviceId}:${catalogItemId}:${nextKey}`;
    } else {
      // Modal closed (parent-driven or via guardedOnClose). Invalidate
      // the current intent so any still-in-flight resolution returning
      // after close also drops to the no-op branch in handleSubmit.
      intentRef.current = '';
    }
  }, [open, deviceId, catalogItemId]);

  // Codex 019e6fd1 must-fix #3 + WEB-014D perf follow-up (Codex
  // 019e707e iter-2): the endpoint config already pins
  // `keepUnusedDataFor: 0` (see `endpointAdminApi.ts`), so unmounting
  // the modal evicts the cache entry immediately and the next open
  // always issues a fresh preflight. Pairing that with
  // `refetchOnMountOrArgChange: true` here caused duplicate requests
  // (live testai network log: 2 install-preflight requests per
  // modal open) without any additional freshness guarantee. The
  // double-fetch is removed; the safety contract (every modal open
  // sees a fresh evaluate) is preserved by the endpoint-level setting.
  //
  // WEB-014D-followup (Codex 019e830b REVISE must_fix #2): use RTK
  // Query's `currentData` instead of `data` so the submit gate is
  // anchored to the active intent. `data` is the LAST SUCCESSFUL
  // response (may be stale across arg changes), while `currentData`
  // is the response for the CURRENT args (undefined during refetch
  // on arg change). With the `preflightFetching` gate removed
  // (must_fix #4), `currentData` is what stops a leftover PASS from
  // a prior catalog row from authorising a submit on the active row.
  // The error-path logic (`preflightError && !effectivePreflight`)
  // works off `effectivePreflight` itself, so the `data` destructure
  // is no longer needed here.
  const {
    currentData: currentServerPreflight,
    error: preflightError,
    isLoading: preflightLoading,
    isFetching: preflightFetching,
  } = useGetInstallPreflightQuery({ deviceId, catalogItemId }, { skip: !open });

  const [createInstall, createState] = useCreateInstallMutation();

  // guardedOnClose declared after `createState` so the closure can
  // observe the live `isLoading` flag. `useEscapeKey` is registered
  // here so the modal mounts with the guard already in place.
  const guardedOnClose = React.useCallback(() => {
    if (createState.isLoading) return;
    onClose();
  }, [createState.isLoading, onClose]);

  useEscapeKey(open, guardedOnClose, { layerId });

  // Must-fix #4 + #C answer: local BLOCK override has priority over
  // any server preflight render. A 409 BLOCK recompute mutates only
  // localBlock; the underlying query data is not invalidated.
  //
  // WEB-014D-followup (Codex 019e830b REVISE must_fix #2): prefer
  // `currentServerPreflight` (arg-anchored to the live intent) over
  // `serverPreflight` (last-successful-data, may be a previous catalog
  // row's PASS hanging around during arg change). With the
  // `preflightFetching` gate removed, this distinction is what keeps
  // the submit honest — the operator can never click Confirm on a
  // PASS that was computed for a *different* catalog row.
  const effectivePreflight: InstallPreflightResponse | null =
    localBlock ?? currentServerPreflight ?? null;

  if (!open) return null;

  const handleSubmit = async () => {
    setToast(null);
    // Capture the active intent at submit time. A late resolve / reject
    // returning after the operator has closed the modal or reopened it
    // for a different catalog must be dropped (must-fix #1).
    const submittedIntent = intentRef.current;
    try {
      const command = await createInstall({
        deviceId,
        body: {
          catalogItemId,
          idempotencyKey,
          reason: reason.trim() ? reason.trim() : undefined,
        },
      }).unwrap();
      if (!mountedRef.current || intentRef.current !== submittedIntent) return;
      onInstalled(command);
    } catch (err: unknown) {
      if (!mountedRef.current || intentRef.current !== submittedIntent) return;
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
    // WEB-014D-followup (Codex 019e830b REVISE must_fix #1): render
    // and gate semantics must agree. Previously this branch returned
    // a loading placeholder whenever `preflightFetching` was true,
    // which collapsed the body during background refetches — but the
    // confirm gate also locked on `preflightFetching`, so render and
    // submit stayed consistent at the cost of UX (the operator saw
    // the PASS body disappear during recompute). With the fetching
    // gate removed from `confirmDisabled`, we keep the existing PASS
    // body rendered during a background refetch when we still have a
    // last-successful-data snapshot; the initial-load placeholder
    // only renders when we have NOTHING to show yet.
    if (preflightLoading && !effectivePreflight) {
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

  // WEB-014D-followup (Codex 019e830b REVISE must_fix #4 + #5):
  // single source-of-truth for "why is the confirm button disabled" —
  // a `confirmDisabledReason` string that drives BOTH the `disabled`
  // attribute AND a production-visible `data-confirm-disabled-reason`
  // DOM attribute so operators can DOM-inspect a regression instead
  // of guessing. `'ok'` means clickable.
  //
  // History:
  //  - Codex 019e6fe4 must-fix #2 originally added (a) `preflightFetching`
  //    to guard against submit-on-stale-PASS during recompute, and
  //    (b) `preflightLoading` + `!idempotencyKey` for initial-render
  //    race.
  //  - 019e830b REVISE removes the `preflightFetching` gate: the
  //    backend POST `/installs` always recomputes preflight server-side
  //    and returns 409 with a fresh BLOCK payload if the decision
  //    flipped during refetch; the modal already handles that path via
  //    `tryReadBlockRecompute(error.data)` + `setLocalBlock`. The gate
  //    is belt-and-suspenders that locks the UI even when no recompute
  //    is happening, producing the "silik" (visually-muted) regression
  //    operators reported 2026-06-01.
  //  - `idempotencyKey` per-intent reset is now `useLayoutEffect` so
  //    the key is set BEFORE the browser paints. `!idempotencyKey` can
  //    no longer fire as a visible disabled-reason on a modal that's
  //    actually open with PASS data — the layout effect runs after
  //    commit and before paint, populating the key in the same frame.
  //  - `effectivePreflight` now uses `currentServerPreflight` so the
  //    decision driving this gate is anchored to the CURRENT intent,
  //    not a leftover `data` from a prior catalog row.
  const confirmDisabledReason: 'no-data' | 'block' | 'in-flight' | 'loading' | 'no-key' | 'ok' =
    !effectivePreflight
      ? preflightLoading
        ? 'loading'
        : 'no-data'
      : effectivePreflight.decision === 'BLOCK'
        ? 'block'
        : createState.isLoading
          ? 'in-flight'
          : !idempotencyKey
            ? 'no-key'
            : 'ok';
  const confirmDisabled = confirmDisabledReason !== 'ok';

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
      <div
        className="absolute inset-0 bg-surface-overlay/60"
        onClick={guardedOnClose}
        aria-hidden
      />
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
            onClick={guardedOnClose}
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
            data-confirm-disabled-reason={confirmDisabledReason}
            data-preflight-fetching={preflightFetching ? 'true' : undefined}
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
