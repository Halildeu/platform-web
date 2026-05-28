import React from 'react';

import { endpointAdminApi } from '../../../app/services/endpointAdminApi';
import type {
  ComplianceDecision,
  ComplianceStalenessReport,
  StalenessSeverity,
} from '../../../entities/endpoint-device-compliance/types';
import { useEndpointAdminI18n } from '../../../i18n';

/**
 * WEB-014A — Faz 22.5 Compliance State Tab (Codex 019e6d68 plan-time
 * AGREE / ready_for_impl=true after split into WEB-014A/B/C).
 *
 * Read latest BE-023 compliance state + offer a force-evaluate CTA for
 * the operator. Backed by the platform-backend BE-023 endpoints
 * exposed through the gateway:
 *
 *   GET  /api/v1/endpoint-admin/endpoint-devices/{deviceId}/compliance
 *   POST /api/v1/endpoint-admin/endpoint-devices/{deviceId}/compliance/evaluate
 *
 * 404 is the canonical "never evaluated" empty state — the tab
 * renders a single CTA that triggers POST evaluate so the operator
 * can prime the state without leaving the drawer. 409 from POST
 * evaluate surfaces a 5 s cooldown toast ("Retry-After: 5"). 403
 * surfaces a permission toast.
 *
 * Cross-device list (WEB-014B), evaluation history (WEB-014B), and
 * policy CRUD (WEB-014C) are out of scope for this PR.
 */
export interface ComplianceTabProps {
  deviceId: string;
  active: boolean;
}

const COOLDOWN_SECONDS = 5;

function decisionToneClass(decision: ComplianceDecision | undefined): string {
  switch (decision) {
    case 'COMPLIANT':
      return 'compliance-decision compliance-decision--compliant';
    case 'NON_COMPLIANT':
      return 'compliance-decision compliance-decision--non-compliant';
    case 'UNAUTHORIZED':
      return 'compliance-decision compliance-decision--unauthorized';
    case 'UNKNOWN':
      return 'compliance-decision compliance-decision--unknown';
    default:
      return 'compliance-decision';
  }
}

function decisionAriaLabel(
  decision: ComplianceDecision | undefined,
  t: (key: string) => string,
): string {
  switch (decision) {
    case 'COMPLIANT':
      return t('endpointAdmin.drawer.compliance.decision.compliant.aria');
    case 'NON_COMPLIANT':
      return t('endpointAdmin.drawer.compliance.decision.nonCompliant.aria');
    case 'UNAUTHORIZED':
      return t('endpointAdmin.drawer.compliance.decision.unauthorized.aria');
    case 'UNKNOWN':
      return t('endpointAdmin.drawer.compliance.decision.unknown.aria');
    default:
      return '';
  }
}

function decisionLabel(
  decision: ComplianceDecision | undefined,
  t: (key: string) => string,
): string {
  switch (decision) {
    case 'COMPLIANT':
      return t('endpointAdmin.drawer.compliance.decision.compliant.label');
    case 'NON_COMPLIANT':
      return t('endpointAdmin.drawer.compliance.decision.nonCompliant.label');
    case 'UNAUTHORIZED':
      return t('endpointAdmin.drawer.compliance.decision.unauthorized.label');
    case 'UNKNOWN':
      return t('endpointAdmin.drawer.compliance.decision.unknown.label');
    default:
      return '';
  }
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function stalenessBannerClass(worst: StalenessSeverity): string {
  switch (worst) {
    case 'SOFT':
      return 'compliance-banner compliance-banner--info';
    case 'HARD':
      return 'compliance-banner compliance-banner--warning';
    case 'UNAVAILABLE':
      return 'compliance-banner compliance-banner--neutral';
    default:
      return 'compliance-banner compliance-banner--hidden';
  }
}

function stalenessBannerText(worst: StalenessSeverity, t: (key: string) => string): string {
  switch (worst) {
    case 'SOFT':
      return t('endpointAdmin.drawer.compliance.staleness.soft');
    case 'HARD':
      return t('endpointAdmin.drawer.compliance.staleness.hard');
    case 'UNAVAILABLE':
      return t('endpointAdmin.drawer.compliance.staleness.unavailable');
    default:
      return '';
  }
}

function streamStalenessLabel(severity: StalenessSeverity, t: (key: string) => string): string {
  switch (severity) {
    case 'FRESH':
      return t('endpointAdmin.drawer.compliance.staleness.stream.fresh');
    case 'SOFT':
      return t('endpointAdmin.drawer.compliance.staleness.stream.soft');
    case 'HARD':
      return t('endpointAdmin.drawer.compliance.staleness.stream.hard');
    case 'UNAVAILABLE':
      return t('endpointAdmin.drawer.compliance.staleness.stream.unavailable');
    default:
      return '';
  }
}

export const ComplianceTab: React.FC<ComplianceTabProps> = ({ deviceId, active }) => {
  const { t } = useEndpointAdminI18n();
  const [cooldownRemainingSeconds, setCooldownRemainingSeconds] = React.useState(0);
  const [toast, setToast] = React.useState<{ tone: 'error' | 'success'; key: string } | null>(null);

  // Cooldown ticker: when 409 Retry-After fires, count down to enable
  // the evaluate button again. React 18 strict-mode safe because the
  // setInterval is cleared on every dependency change.
  React.useEffect(() => {
    if (cooldownRemainingSeconds <= 0) return undefined;
    const handle = window.setInterval(() => {
      setCooldownRemainingSeconds((prev) => (prev <= 0 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(handle);
  }, [cooldownRemainingSeconds]);

  const queryResult = endpointAdminApi.useGetDeviceComplianceQuery(
    { deviceId },
    {
      // Skip when the drawer is hidden so closing the drawer does not
      // keep a stale poll alive.
      skip: !active || !deviceId,
    },
  );

  const [forceEvaluate, evaluateState] =
    endpointAdminApi.useForceEvaluateDeviceComplianceMutation();

  // ─── Toast auto-dismiss ──────────────────────────────────────────
  React.useEffect(() => {
    if (!toast) return undefined;
    const handle = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(handle);
  }, [toast]);

  // ─── Force-evaluate handler ──────────────────────────────────────
  const onEvaluate = React.useCallback(async () => {
    if (cooldownRemainingSeconds > 0) return;
    try {
      await forceEvaluate({ deviceId }).unwrap();
      setToast({ tone: 'success', key: 'endpointAdmin.drawer.compliance.toast.evaluated' });
    } catch (err) {
      const status = (err as { status?: number | string } | null)?.status;
      if (status === 409) {
        setCooldownRemainingSeconds(COOLDOWN_SECONDS);
        setToast({ tone: 'error', key: 'endpointAdmin.drawer.compliance.toast.locked' });
      } else if (status === 403) {
        setToast({ tone: 'error', key: 'endpointAdmin.drawer.compliance.toast.forbidden' });
      } else if (status === 404) {
        setToast({ tone: 'error', key: 'endpointAdmin.drawer.compliance.toast.deviceMissing' });
      } else {
        setToast({ tone: 'error', key: 'endpointAdmin.drawer.compliance.toast.error' });
      }
    }
  }, [cooldownRemainingSeconds, deviceId, forceEvaluate]);

  if (!active || !deviceId || queryResult.isUninitialized) {
    return null;
  }

  // ─── Loading ────────────────────────────────────────────────────
  if (queryResult.isLoading || queryResult.isFetching) {
    return (
      <div className="compliance-tab compliance-tab--loading" data-testid="compliance-tab-loading">
        {t('endpointAdmin.drawer.compliance.loading')}
      </div>
    );
  }

  // ─── 403 forbidden ──────────────────────────────────────────────
  const errStatus =
    (queryResult.error && 'status' in queryResult.error
      ? (queryResult.error.status as number | string)
      : null) ?? null;
  if (errStatus === 403) {
    return (
      <div
        className="compliance-tab compliance-tab--forbidden"
        data-testid="compliance-tab-forbidden"
      >
        {t('endpointAdmin.drawer.compliance.forbidden')}
      </div>
    );
  }

  // ─── 404 empty state ────────────────────────────────────────────
  if (errStatus === 404) {
    const evaluateDisabled = cooldownRemainingSeconds > 0 || evaluateState.isLoading;
    return (
      <div className="compliance-tab compliance-tab--empty" data-testid="compliance-tab-empty">
        <p>{t('endpointAdmin.drawer.compliance.empty')}</p>
        <button
          type="button"
          onClick={onEvaluate}
          disabled={evaluateDisabled}
          data-testid="compliance-evaluate-button-empty"
        >
          {cooldownRemainingSeconds > 0
            ? t('endpointAdmin.drawer.compliance.evaluate.cooldown').replace(
                '{seconds}',
                String(cooldownRemainingSeconds),
              )
            : t('endpointAdmin.drawer.compliance.evaluate.cta')}
        </button>
        {toast ? (
          <div
            role="status"
            aria-live="polite"
            data-testid={`compliance-toast-${toast.tone}`}
            className={`compliance-toast compliance-toast--${toast.tone}`}
          >
            {t(toast.key)}
          </div>
        ) : null}
      </div>
    );
  }

  // ─── Other error ────────────────────────────────────────────────
  if (queryResult.error || !queryResult.data) {
    return (
      <div className="compliance-tab compliance-tab--error" data-testid="compliance-tab-error">
        {t('endpointAdmin.drawer.compliance.error')}
      </div>
    );
  }

  // ─── Happy path ─────────────────────────────────────────────────
  const state = queryResult.data;
  const evaluateDisabled = cooldownRemainingSeconds > 0 || evaluateState.isLoading;
  const policyDrift = Boolean(state.policyDrift);

  return (
    <div className="compliance-tab" data-testid="compliance-tab">
      <header className="compliance-tab__header">
        <span
          className={decisionToneClass(state.decision)}
          role="status"
          aria-label={decisionAriaLabel(state.decision, t)}
          data-testid={`compliance-decision-${state.decision.toLowerCase().replace('_', '-')}`}
        >
          {decisionLabel(state.decision, t)}
        </span>
        <span className="compliance-tab__evaluated-at">
          {t('endpointAdmin.drawer.compliance.evaluatedAt')}
          {': '}
          {formatTimestamp(state.evaluatedAt)}
        </span>
      </header>

      {state.staleness.worst !== 'FRESH' ? (
        <div
          className={stalenessBannerClass(state.staleness.worst)}
          role={state.staleness.worst === 'HARD' ? 'alert' : 'status'}
          aria-live={state.staleness.worst === 'HARD' ? 'assertive' : 'polite'}
          data-testid={`compliance-staleness-${state.staleness.worst.toLowerCase()}`}
        >
          {stalenessBannerText(state.staleness.worst, t)}
        </div>
      ) : null}

      {policyDrift ? (
        <div
          className="compliance-banner compliance-banner--info"
          role="status"
          aria-live="polite"
          data-testid="compliance-policy-drift"
        >
          {t('endpointAdmin.drawer.compliance.policyDrift')}
        </div>
      ) : null}

      <ComplianceReasons blocking={state.blockingReasons} warnings={state.warnings} t={t} />

      <StalenessDetails staleness={state.staleness} t={t} />

      <div className="compliance-tab__actions">
        <button
          type="button"
          onClick={onEvaluate}
          disabled={evaluateDisabled}
          data-testid="compliance-evaluate-button"
        >
          {cooldownRemainingSeconds > 0
            ? t('endpointAdmin.drawer.compliance.evaluate.cooldown').replace(
                '{seconds}',
                String(cooldownRemainingSeconds),
              )
            : t('endpointAdmin.drawer.compliance.evaluate.cta')}
        </button>
      </div>

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          data-testid={`compliance-toast-${toast.tone}`}
          className={`compliance-toast compliance-toast--${toast.tone}`}
        >
          {t(toast.key)}
        </div>
      ) : null}
    </div>
  );
};

interface ComplianceReasonsProps {
  blocking: string[];
  warnings: string[];
  t: (key: string) => string;
}

const ComplianceReasons: React.FC<ComplianceReasonsProps> = ({ blocking, warnings, t }) => {
  if (blocking.length === 0 && warnings.length === 0) {
    return null;
  }
  return (
    <section
      className="compliance-reasons"
      aria-label={t('endpointAdmin.drawer.compliance.reasons.heading')}
    >
      {blocking.length > 0 ? (
        <div className="compliance-reasons__group">
          <h4>{t('endpointAdmin.drawer.compliance.reasons.blocking')}</h4>
          <ul data-testid="compliance-blocking-list">
            {blocking.map((reason) => (
              <li
                key={reason}
                className="compliance-reasons__chip compliance-reasons__chip--blocking"
              >
                {t(`endpointAdmin.drawer.compliance.reason.${reason}`)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {warnings.length > 0 ? (
        <div className="compliance-reasons__group">
          <h4>{t('endpointAdmin.drawer.compliance.reasons.warnings')}</h4>
          <ul data-testid="compliance-warnings-list">
            {warnings.map((reason) => (
              <li
                key={reason}
                className="compliance-reasons__chip compliance-reasons__chip--warning"
              >
                {t(`endpointAdmin.drawer.compliance.reason.${reason}`)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
};

interface StalenessDetailsProps {
  staleness: ComplianceStalenessReport;
  t: (key: string) => string;
}

const StalenessDetails: React.FC<StalenessDetailsProps> = ({ staleness, t }) => {
  return (
    <details className="compliance-staleness-details" data-testid="compliance-staleness-details">
      <summary>{t('endpointAdmin.drawer.compliance.staleness.heading')}</summary>
      <dl>
        <dt>{t('endpointAdmin.drawer.compliance.staleness.stream.summary')}</dt>
        <dd>{streamStalenessLabel(staleness.summary, t)}</dd>
        <dt>{t('endpointAdmin.drawer.compliance.staleness.stream.apps')}</dt>
        <dd>{streamStalenessLabel(staleness.apps, t)}</dd>
        <dt>{t('endpointAdmin.drawer.compliance.staleness.stream.wingetEgress')}</dt>
        <dd>{streamStalenessLabel(staleness.wingetEgress, t)}</dd>
      </dl>
    </details>
  );
};
