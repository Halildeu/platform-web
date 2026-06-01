import React from 'react';

import { useGetAppControlLatestQuery } from '../../../../app/services/endpointAdminApi';
import type {
  AppControlSnapshot,
  AppControlProbeError,
  AppLockerEnforcementMode,
  ServiceStartupMode,
  ServiceState,
  WdacMode,
} from '../../../../entities/endpoint-app-control/types';
import {
  APPLOCKER_RULE_KEYS,
  isAppControlForDevice,
  isAppControlFullyEvaluable,
} from '../../../../entities/endpoint-app-control/types';
import { useEndpointAdminI18n } from '../../../../i18n';

/**
 * WEB Application Control (WDAC + AppLocker) view — Faz 22.5 AG-041
 * (agent probe MERGED platform-agent #49; backend ingest MERGED
 * platform-backend #368; this file is the missing web link).
 *
 * Mirrors the AG-038/AG-039/AG-040 precedents:
 * - `currentData`-anchored snapshot + `isForDevice` stale guard
 * - `if (error) ...` cuts BEFORE the `!snapshot` fall-through
 * - Fail-closed branches keep `meta` + `probeErrors` visible INSIDE
 *   the `app-control-view` container; only the scalar-grid table is
 *   hidden when not fully-evaluable
 * - Plain-text XSS guards (React text-escape) on every operator-
 *   visible string field (`summary`, `source`)
 * - Production-visible `data-*` attrs for operator DOM-inspection
 *
 * Read-only "Uygulama Kontrolü" tab. Backend endpoint:
 *   /api/v1/endpoint-admin/endpoint-devices/{deviceId}/app-control/latest
 *
 * Render contract (from platform-agent docs + backend AG-041-be):
 * - Scan-meta panel: collectedAt + probeDurationMs.
 * - WDAC panel: WdacMode badge + 4 evidence rows (boot enforcement,
 *   active CIP policy count, legacy SIPolicy, multi-policy mode).
 *   Evidence values are tri-state — `null` renders as `—` to keep
 *   "not queryable" distinct from `false`.
 * - AppLocker panel: 5 per-collection chips (Exe/Dll/Script/Msi/Appx)
 *   + AppIDSvc state + startup + present tri-state.
 * - probeErrors table: rowOrdinal + code + source fallback "—" +
 *   summary fallback "—". Visible in fail-closed branches.
 *
 * Redaction boundary: only contract-allowed scalars + enum values
 * appear; per-rule list bodies are NEVER persisted (HARD BOUNDARY in
 * agent app_control.go); no policy names, no publishers, no file
 * paths, no event-log content.
 *
 * State precedence (strict order):
 *  - active=false → null
 *  - isLoading → loading placeholder
 *  - 403 → forbidden
 *  - 404 → empty + `includeAppControl:true` operator hint
 *  - error (other 4xx/5xx) → cuts BEFORE snapshot fall-through
 *  - !snapshot → null
 *  - !isAppControlForDevice → stale-arg warning
 *  - supported=false OR probeComplete=false → fail-closed inside the
 *    `app-control-view` container with `data-fully-evaluable="false"`,
 *    scalar grid hidden, meta + probeErrors visible
 *  - happy → meta + WDAC + AppLocker + probeErrors
 */
export interface AppControlViewProps {
  deviceId: string;
  active: boolean;
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function formatMillis(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${value} ms`;
}

function formatTriBool(
  v: boolean | null | undefined,
  tLabels: { trueLabel: string; falseLabel: string; nullLabel: string },
): string {
  if (v == null) return tLabels.nullLabel;
  return v ? tLabels.trueLabel : tLabels.falseLabel;
}

function formatTriCount(v: number | null | undefined): string {
  if (v == null) return '—';
  return String(v);
}

function wdacModeTone(mode: WdacMode | null | undefined): string {
  // ENFORCE = success-tone (most restrictive operator-positive signal);
  // AUDIT = warn-tone (collecting but not blocking); OFF = neutral
  // operator-OK signal (deliberate disable); UNKNOWN = warning (no
  // evidence). Tones are deliberately conservative — never paint
  // UNKNOWN as "success".
  switch (mode) {
    case 'ENFORCE':
      return 'success';
    case 'AUDIT':
      return 'warn';
    case 'OFF':
      return 'neutral';
    default:
      return 'unknown';
  }
}

function appLockerTone(mode: AppLockerEnforcementMode | null | undefined): string {
  switch (mode) {
    case 'ENFORCE':
      return 'success';
    case 'AUDIT_ONLY':
      return 'warn';
    case 'NOT_CONFIGURED':
      return 'neutral';
    default:
      return 'unknown';
  }
}

function serviceStateTone(state: ServiceState | null | undefined): string {
  switch (state) {
    case 'RUNNING':
      return 'success';
    case 'STOPPED':
      return 'warn';
    case 'DISABLED':
      return 'neutral';
    default:
      return 'unknown';
  }
}

function serviceStartupTone(mode: ServiceStartupMode | null | undefined): string {
  switch (mode) {
    case 'AUTO':
    case 'AUTO_DELAYED':
      return 'success';
    case 'MANUAL':
      return 'warn';
    case 'DISABLED':
      return 'neutral';
    default:
      return 'unknown';
  }
}

export const AppControlView: React.FC<AppControlViewProps> = ({ deviceId, active }) => {
  const { t } = useEndpointAdminI18n();

  const { currentData, isLoading, error } = useGetAppControlLatestQuery(
    { deviceId },
    { skip: !active || !deviceId },
  );

  const snapshot: AppControlSnapshot | undefined = currentData;

  if (!active) return null;

  if (isLoading) {
    return (
      <div
        className="app-control-view app-control-view--loading"
        data-testid="app-control-view-loading"
      >
        {t('endpointAdmin.drawer.appControl.loading')}
      </div>
    );
  }

  if (error) {
    const status = (error as { status?: number | string }).status;
    if (status === 403) {
      return (
        <div
          className="app-control-view app-control-view--forbidden"
          data-testid="app-control-view-forbidden"
        >
          {t('endpointAdmin.drawer.appControl.forbidden')}
        </div>
      );
    }
    if (status === 404) {
      return (
        <div
          className="app-control-view app-control-view--empty"
          data-testid="app-control-view-empty"
        >
          <p>{t('endpointAdmin.drawer.appControl.empty')}</p>
          <p className="app-control-view__hint">{t('endpointAdmin.drawer.appControl.emptyHint')}</p>
        </div>
      );
    }
    return (
      <div
        className="app-control-view app-control-view--error"
        data-testid="app-control-view-error"
      >
        {t('endpointAdmin.drawer.appControl.error')}
      </div>
    );
  }

  if (!snapshot) {
    return null;
  }

  if (!isAppControlForDevice(snapshot, deviceId)) {
    return (
      <div
        className="app-control-view app-control-view--stale"
        data-testid="app-control-view-stale"
      >
        {t('endpointAdmin.drawer.appControl.staleWarning')}
      </div>
    );
  }

  const fullyEvaluable = isAppControlFullyEvaluable(snapshot);

  const triLabels = {
    trueLabel: t('endpointAdmin.drawer.appControl.bool.true'),
    falseLabel: t('endpointAdmin.drawer.appControl.bool.false'),
    nullLabel: t('endpointAdmin.drawer.appControl.bool.null'),
  };

  return (
    <section
      className="app-control-view"
      data-testid="app-control-view"
      data-supported={String(snapshot.supported)}
      data-probe-complete={String(snapshot.probeComplete)}
      data-fully-evaluable={String(fullyEvaluable)}
      data-wdac-queryable={String(snapshot.wdacQueryable)}
      data-app-locker-queryable={String(snapshot.appLockerQueryable)}
    >
      <header className="app-control-view__meta" data-testid="app-control-view-meta">
        <dl>
          <dt>{t('endpointAdmin.drawer.appControl.meta.collectedAt')}</dt>
          <dd data-testid="app-control-view-meta-collected-at">
            {formatTimestamp(snapshot.collectedAt)}
          </dd>
          <dt>{t('endpointAdmin.drawer.appControl.meta.probeDurationMs')}</dt>
          <dd data-testid="app-control-view-meta-probe-duration">
            {formatMillis(snapshot.probeDurationMs)}
          </dd>
        </dl>
      </header>

      {fullyEvaluable && (
        <>
          <section
            className="app-control-view__wdac"
            data-testid="app-control-view-wdac"
            data-wdac-mode={snapshot.wdacMode ?? 'UNKNOWN'}
          >
            <h4>{t('endpointAdmin.drawer.appControl.wdac.title')}</h4>
            <div
              className={`badge badge--${wdacModeTone(snapshot.wdacMode)}`}
              data-testid="app-control-view-wdac-mode-badge"
            >
              {t(`endpointAdmin.drawer.appControl.wdac.mode.${snapshot.wdacMode ?? 'UNKNOWN'}`)}
            </div>
            <dl className="app-control-view__wdac-evidence">
              <dt>{t('endpointAdmin.drawer.appControl.wdac.bootEnforcement')}</dt>
              <dd data-testid="app-control-view-wdac-boot">
                {formatTriBool(snapshot.wdacBootEnforcementPresent, triLabels)}
              </dd>
              <dt>{t('endpointAdmin.drawer.appControl.wdac.cipPolicyCount')}</dt>
              <dd data-testid="app-control-view-wdac-cip-count">
                {formatTriCount(snapshot.wdacActiveCipPolicyCount)}
              </dd>
              <dt>{t('endpointAdmin.drawer.appControl.wdac.legacySipolicy')}</dt>
              <dd data-testid="app-control-view-wdac-legacy-sipolicy">
                {formatTriBool(snapshot.wdacLegacySipolicyPresent, triLabels)}
              </dd>
              <dt>{t('endpointAdmin.drawer.appControl.wdac.multiPolicyMode')}</dt>
              <dd data-testid="app-control-view-wdac-multi-policy">
                {formatTriBool(snapshot.wdacMultiPolicyMode, triLabels)}
              </dd>
            </dl>
          </section>

          <section
            className="app-control-view__app-locker"
            data-testid="app-control-view-app-locker"
          >
            <h4>{t('endpointAdmin.drawer.appControl.appLocker.title')}</h4>
            <div className="app-control-view__app-locker-chips">
              {APPLOCKER_RULE_KEYS.map(({ key, shortLabel }) => {
                const mode = snapshot[key] as AppLockerEnforcementMode | null;
                return (
                  <span
                    key={key}
                    className={`chip chip--${appLockerTone(mode)}`}
                    data-testid={`app-control-view-applocker-${shortLabel.toLowerCase()}`}
                    data-mode={mode ?? 'UNKNOWN'}
                  >
                    <strong>{shortLabel}</strong>:{' '}
                    {t(`endpointAdmin.drawer.appControl.appLocker.mode.${mode ?? 'UNKNOWN'}`)}
                  </span>
                );
              })}
            </div>
            <dl className="app-control-view__app-id-svc">
              <dt>{t('endpointAdmin.drawer.appControl.appLocker.appIdSvc.state')}</dt>
              <dd data-testid="app-control-view-appid-state">
                <span
                  className={`chip chip--${serviceStateTone(snapshot.appLockerAppIdSvcState)}`}
                  data-state={snapshot.appLockerAppIdSvcState ?? 'UNKNOWN'}
                >
                  {t(
                    `endpointAdmin.drawer.appControl.appLocker.appIdSvc.stateValue.${snapshot.appLockerAppIdSvcState ?? 'UNKNOWN'}`,
                  )}
                </span>
              </dd>
              <dt>{t('endpointAdmin.drawer.appControl.appLocker.appIdSvc.startup')}</dt>
              <dd data-testid="app-control-view-appid-startup">
                <span
                  className={`chip chip--${serviceStartupTone(snapshot.appLockerAppIdSvcStartup)}`}
                  data-startup={snapshot.appLockerAppIdSvcStartup ?? 'UNKNOWN'}
                >
                  {t(
                    `endpointAdmin.drawer.appControl.appLocker.appIdSvc.startupValue.${snapshot.appLockerAppIdSvcStartup ?? 'UNKNOWN'}`,
                  )}
                </span>
              </dd>
              <dt>{t('endpointAdmin.drawer.appControl.appLocker.appIdSvc.present')}</dt>
              <dd data-testid="app-control-view-appid-present">
                {formatTriBool(snapshot.appLockerAppIdSvcPresent, triLabels)}
              </dd>
            </dl>
          </section>
        </>
      )}

      {!fullyEvaluable && (
        <section
          className="app-control-view__fail-closed"
          data-testid="app-control-view-fail-closed"
        >
          <p>{t('endpointAdmin.drawer.appControl.failClosed.notice')}</p>
        </section>
      )}

      {snapshot.probeErrors && snapshot.probeErrors.length > 0 && (
        <section
          className="app-control-view__probe-errors"
          data-testid="app-control-view-probe-errors"
        >
          <h4>{t('endpointAdmin.drawer.appControl.probeErrors.title')}</h4>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>{t('endpointAdmin.drawer.appControl.probeErrors.col.code')}</th>
                <th>{t('endpointAdmin.drawer.appControl.probeErrors.col.source')}</th>
                <th>{t('endpointAdmin.drawer.appControl.probeErrors.col.summary')}</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.probeErrors.map((e: AppControlProbeError) => (
                <tr
                  key={`${e.rowOrdinal}-${e.code}`}
                  data-testid={`app-control-view-probe-error-row-${e.rowOrdinal}`}
                  data-code={e.code}
                >
                  <td>{e.rowOrdinal}</td>
                  <td>{e.code}</td>
                  <td>{e.source ?? '—'}</td>
                  <td>{e.summary ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </section>
  );
};
