import * as React from 'react';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';
import {
  useGetDisplayPolicyQuery,
  useSetDisplayPolicyMutation,
  useClearDisplayPolicyMutation,
} from '../../../../app/services/endpointAdminApi';
import { useEndpointAdminI18n } from '../../../../i18n';
import {
  ALLOWED_SCR_PATHS,
  WALLPAPER_STYLES,
  type DisplayPolicyResponse,
  type SetDisplayPolicyRequest,
} from '../../../../entities/endpoint-display-policy/types';

export interface DisplayPolicyViewProps {
  deviceId: string;
  active: boolean;
}

function httpStatus(error: unknown): number | null {
  if (error && typeof error === 'object' && 'status' in error) {
    const s = (error as FetchBaseQueryError).status;
    return typeof s === 'number' ? s : null;
  }
  return null;
}

/**
 * #508 Endpoint Display Policy (Faz 22.5) — operator surface for the device's
 * managed screensaver + wallpaper Group-Policy desired state.
 *
 * Reads the current desired-state + any open (pending-approval) proposal, and
 * lets an operator PROPOSE an ENFORCE change or CLEAR the managed keys. Every
 * change is maker-checker: it creates a PENDING SET_DISPLAY_POLICY command that
 * a SECOND admin approves from the İşlemler (commands) tab before it dispatches.
 * The backend is dark-shipped behind a feature flag → a 503 renders a
 * "feature disabled" notice; a 404 means no policy/proposal yet.
 */
export const DisplayPolicyView: React.FC<DisplayPolicyViewProps> = ({ deviceId, active }) => {
  const { t } = useEndpointAdminI18n();
  const { data, error, isLoading, isFetching, refetch } = useGetDisplayPolicyQuery(deviceId, {
    skip: !active,
  });
  const [setPolicy, setState] = useSetDisplayPolicyMutation();
  const [clearPolicy, clearState] = useClearDisplayPolicyMutation();

  // ── ENFORCE proposal form state ──────────────────────────────────────────
  const [ssEnabled, setSsEnabled] = React.useState(true);
  const [ssTimeout, setSsTimeout] = React.useState(600);
  const [ssSecure, setSsSecure] = React.useState(true);
  const [ssScrPath, setSsScrPath] = React.useState<string>(ALLOWED_SCR_PATHS[0]);
  const [wpEnabled, setWpEnabled] = React.useState(false);
  const [wpStyle, setWpStyle] = React.useState<string>('FILL');
  const [wpUserCannotChange, setWpUserCannotChange] = React.useState(true);
  const [wpAssetRef, setWpAssetRef] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);
  const [lastMutationData, setLastMutationData] = React.useState<DisplayPolicyResponse | null>(
    null,
  );

  React.useEffect(() => {
    setLastMutationData(null);
  }, [deviceId]);

  React.useEffect(() => {
    setLastMutationData(null);
  }, [data]);

  const effectiveData = lastMutationData ?? data;
  const effectiveError = effectiveData ? null : error;
  const status = httpStatus(effectiveError);
  const featureDisabled = status === 503;
  const noPolicy = status === 404;
  const busy = setState.isLoading || clearState.isLoading;

  const submitEnforce = async () => {
    setFormError(null);
    if (!reason.trim()) {
      setFormError(t('endpointAdmin.displayPolicy.reasonRequired'));
      return;
    }
    if (ssEnabled && (!Number.isFinite(ssTimeout) || ssTimeout < 60 || ssTimeout > 86400)) {
      setFormError(t('endpointAdmin.displayPolicy.timeoutInvalid'));
      return;
    }
    const body: SetDisplayPolicyRequest = {
      operation: 'ENFORCE',
      reason: reason.trim(),
      screensaver: {
        enabled: ssEnabled,
        timeoutSeconds: ssTimeout,
        secureOnResume: ssSecure,
        scrPath: ssEnabled ? ssScrPath : null,
      },
      wallpaper: wpEnabled
        ? {
            enabled: true,
            style: wpStyle,
            userCannotChange: wpUserCannotChange,
            assetRef: wpAssetRef.trim() || null,
          }
        : null,
    };
    try {
      const response = await setPolicy({ deviceId, body }).unwrap();
      setLastMutationData(response);
      setReason('');
      refetch();
    } catch (e) {
      const s = httpStatus(e);
      setFormError(t('endpointAdmin.displayPolicy.error.generic') + (s ? ` (${s})` : ''));
    }
  };

  const submitClear = async () => {
    setFormError(null);
    if (!reason.trim()) {
      setFormError(t('endpointAdmin.displayPolicy.reasonRequired'));
      return;
    }
    try {
      const response = await clearPolicy({ deviceId, reason: reason.trim() }).unwrap();
      setLastMutationData(response);
      setReason('');
      refetch();
    } catch (e) {
      const s = httpStatus(e);
      setFormError(t('endpointAdmin.displayPolicy.error.generic') + (s ? ` (${s})` : ''));
    }
  };

  if (isLoading || (isFetching && !effectiveData && !effectiveError)) {
    return (
      <div className="px-6 py-4 text-sm text-text-secondary" data-testid="display-policy-loading">
        {t('endpointAdmin.displayPolicy.loading')}
      </div>
    );
  }

  if (featureDisabled) {
    return (
      <div
        className="px-6 py-4 text-sm text-text-secondary"
        data-testid="display-policy-feature-disabled"
      >
        {t('endpointAdmin.displayPolicy.featureDisabled')}
      </div>
    );
  }

  // Any GET error that is NOT 404 (no policy) / 503 (handled above) — 403/500/
  // network — must surface as an error, never as "no policy" (Codex 019ea99b).
  if (effectiveError && !noPolicy) {
    return (
      <div
        className="px-6 py-4 text-sm text-danger"
        role="alert"
        data-testid="display-policy-error"
      >
        {t('endpointAdmin.displayPolicy.error.generic')}
        {status ? ` (${status})` : ''}
      </div>
    );
  }

  const op = effectiveData?.operation ?? null;
  const proposal = effectiveData?.openProposal ?? null;

  return (
    <div className="px-6 py-4 space-y-4" data-testid="display-policy-view">
      <h3 className="text-base font-semibold text-text-primary">
        {t('endpointAdmin.displayPolicy.title')}
      </h3>

      {/* current desired-state */}
      <section className="rounded-md border border-border-subtle p-3 text-sm space-y-1">
        <div className="font-medium text-text-primary">
          {t('endpointAdmin.displayPolicy.current.heading')}
        </div>
        {noPolicy || (!op && !proposal) ? (
          <div className="text-text-secondary" data-testid="display-policy-none">
            {t('endpointAdmin.displayPolicy.noPolicy')}
          </div>
        ) : (
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
            <dt className="text-text-secondary">
              {t('endpointAdmin.displayPolicy.current.operation')}
            </dt>
            <dd data-testid="display-policy-operation">{op ?? '—'}</dd>
            <dt className="text-text-secondary">
              {t('endpointAdmin.displayPolicy.current.screensaver')}
            </dt>
            <dd data-testid="display-policy-screensaver">
              {effectiveData?.screensaver
                ? `${effectiveData.screensaver.enabled ? '✓' : '✗'} ${
                    effectiveData.screensaver.timeoutSeconds ?? '—'
                  }s ${effectiveData.screensaver.scrPath ?? ''}`
                : '—'}
            </dd>
            <dt className="text-text-secondary">
              {t('endpointAdmin.displayPolicy.current.wallpaper')}
            </dt>
            <dd data-testid="display-policy-wallpaper">
              {effectiveData?.wallpaper
                ? `${effectiveData.wallpaper.enabled ? '✓' : '✗'} ${
                    effectiveData.wallpaper.style ?? ''
                  }`
                : '—'}
            </dd>
            <dt className="text-text-secondary">
              {t('endpointAdmin.displayPolicy.current.lastEnforcement')}
            </dt>
            <dd data-testid="display-policy-last-enforcement">
              {effectiveData?.lastEnforcementStatus ?? '—'}
            </dd>
          </dl>
        )}
        {proposal && (
          <div
            className="mt-2 rounded bg-warning-subtle px-2 py-1 text-warning"
            data-testid="display-policy-open-proposal"
          >
            {t('endpointAdmin.displayPolicy.openProposal')}: {proposal.operation} ·{' '}
            {proposal.approvalStatus} ({proposal.commandStatus})
          </div>
        )}
      </section>

      {/* propose ENFORCE */}
      <section className="rounded-md border border-border-subtle p-3 text-sm space-y-2">
        <div className="font-medium text-text-primary">
          {t('endpointAdmin.displayPolicy.form.enforceHeading')}
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={ssEnabled}
            onChange={(e) => setSsEnabled(e.target.checked)}
            data-testid="dp-ss-enabled"
          />
          {t('endpointAdmin.displayPolicy.form.screensaverEnabled')}
        </label>
        <label className="flex items-center gap-2">
          {t('endpointAdmin.displayPolicy.form.timeoutSeconds')}
          <input
            type="number"
            min={60}
            max={86400}
            value={ssTimeout}
            onChange={(e) => setSsTimeout(Number(e.target.value))}
            className="w-24 rounded border border-border-subtle px-1"
            data-testid="dp-ss-timeout"
          />
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={ssSecure}
            onChange={(e) => setSsSecure(e.target.checked)}
            data-testid="dp-ss-secure"
          />
          {t('endpointAdmin.displayPolicy.form.secureOnResume')}
        </label>
        <label className="flex items-center gap-2">
          {t('endpointAdmin.displayPolicy.form.scrPath')}
          <select
            value={ssScrPath}
            onChange={(e) => setSsScrPath(e.target.value)}
            className="rounded border border-border-subtle px-1"
            data-testid="dp-ss-scrpath"
          >
            {ALLOWED_SCR_PATHS.map((p) => (
              <option key={p} value={p}>
                {p.split('\\').pop()}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 pt-1">
          <input
            type="checkbox"
            checked={wpEnabled}
            onChange={(e) => setWpEnabled(e.target.checked)}
            data-testid="dp-wp-enabled"
          />
          {t('endpointAdmin.displayPolicy.form.wallpaperEnabled')}
        </label>
        {wpEnabled && (
          <>
            <label className="flex items-center gap-2">
              {t('endpointAdmin.displayPolicy.form.style')}
              <select
                value={wpStyle}
                onChange={(e) => setWpStyle(e.target.value)}
                className="rounded border border-border-subtle px-1"
                data-testid="dp-wp-style"
              >
                {WALLPAPER_STYLES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={wpUserCannotChange}
                onChange={(e) => setWpUserCannotChange(e.target.checked)}
                data-testid="dp-wp-lock"
              />
              {t('endpointAdmin.displayPolicy.form.userCannotChange')}
            </label>
            <label className="flex items-center gap-2">
              {t('endpointAdmin.displayPolicy.form.assetRef')}
              <input
                type="text"
                value={wpAssetRef}
                onChange={(e) => setWpAssetRef(e.target.value)}
                className="flex-1 rounded border border-border-subtle px-1"
                data-testid="dp-wp-assetref"
              />
            </label>
          </>
        )}

        <label className="flex items-center gap-2 pt-1">
          {t('endpointAdmin.displayPolicy.form.reason')}
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="flex-1 rounded border border-border-subtle px-1"
            data-testid="dp-reason"
          />
        </label>

        {formError && (
          <div className="text-danger" role="alert" data-testid="display-policy-form-error">
            {formError}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            disabled={busy}
            onClick={submitEnforce}
            className="rounded bg-primary px-3 py-1 text-white disabled:opacity-50"
            data-testid="display-policy-propose"
          >
            {setState.isLoading
              ? t('endpointAdmin.displayPolicy.action.proposing')
              : t('endpointAdmin.displayPolicy.action.propose')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={submitClear}
            className="rounded border border-border-subtle px-3 py-1 disabled:opacity-50"
            data-testid="display-policy-clear"
          >
            {clearState.isLoading
              ? t('endpointAdmin.displayPolicy.action.clearing')
              : t('endpointAdmin.displayPolicy.action.clear')}
          </button>
        </div>
        <p className="text-xs text-text-secondary">
          {t('endpointAdmin.displayPolicy.makerCheckerHint')}
        </p>
      </section>
    </div>
  );
};
