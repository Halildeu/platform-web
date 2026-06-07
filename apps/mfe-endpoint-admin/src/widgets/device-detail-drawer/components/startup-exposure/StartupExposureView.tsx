import React from 'react';

import { useGetStartupExposureLatestQuery } from '../../../../app/services/endpointAdminApi';
import type {
  StartupApp,
  StartupAppLocation,
  StartupExposureProbeError,
  StartupExposureSnapshot,
  StartupProbeOrigin,
} from '../../../../entities/endpoint-startup-exposure/types';
import {
  getEffectiveFirewallEventLogEnabled,
  getEffectiveRdpEnabled,
  isStartupExposureForDevice,
  isStartupExposureFullyEvaluable,
  isStartupExposureRedactionOnly,
} from '../../../../entities/endpoint-startup-exposure/types';
import { useEndpointAdminI18n } from '../../../../i18n';

/**
 * WEB startup-exposure view — Faz 22.5 AG-040 (agent probe + backend
 * ingest already MERGED; this file is the missing web link).
 *
 * Mirrors the AG-038/AG-039 precedents verbatim:
 * - `currentData`-anchored snapshot + `isForDevice` stale guard.
 * - `if (error) ...` cuts BEFORE the `!snapshot` fall-through.
 * - Fail-closed branches keep `meta` + `probeErrors` visible INSIDE
 *   the `startup-exposure-view` container; only the startup-apps TABLE
 *   is hidden when not fully-evaluable.
 * - Plain-text XSS guards (React text-escape) on every operator-visible
 *   string field (`name`, `summary`, `source`).
 * - Production-visible `data-*` attrs for operator DOM-inspection.
 *
 * Read-only "Başlangıç + Maruziyet" tab. Backend endpoint:
 *   /api/v1/endpoint-admin/endpoint-devices/{deviceId}/startup-exposure/latest
 *
 * Render contract (from platform-agent docs + backend AG-040-be):
 * - Scan-meta panel: collectedAt + probeDurationMs.
 * - Exposure-summary panel: RDP enabled badge + Firewall event-log badge
 *   (tri-state: true / false / null).
 * - Startup-apps table (fully-evaluable only): rowOrdinal-ordered list
 *   of {name + location enum chip + enabled chip + probeOrigin chip}.
 *   `location` is the 10-slot autorun-anchor enum (HKLM/HKCU Run/RunOnce/
 *   Wow6432, common/user StartMenu Startup folder, TaskScheduler root/
 *   MS-Windows/custom).
 * - probeErrors table: rowOrdinal + code + source fallback "—" +
 *   summary fallback "—". Visible in fail-closed branches.
 *
 * Redaction boundary: only contract-allowed scalars — `name` is
 * extension-stripped, NEVER a raw file path; `location` is enum-only,
 * NEVER a raw registry path; no event-log content; no RDP session
 * enumeration; no firewall rule list.
 *
 * State precedence (strict order):
 *  - active=false → null
 *  - isLoading → loading placeholder
 *  - 403 → forbidden
 *  - 404 → empty + `includeStartupExposure:true` operator hint
 *  - error (other 4xx/5xx) → cuts BEFORE snapshot fall-through
 *  - !snapshot → null
 *  - !isStartupExposureForDevice → stale-arg warning
 *  - supported=false OR probeComplete=false → fail-closed inside the
 *    `startup-exposure-view` container with `data-fully-evaluable="false"`,
 *    table hidden, meta + exposure-summary + probeErrors visible — EXCEPT
 *    the redaction-only carve-out below.
 *  - redaction-only (probeComplete=false but every probeError is
 *    NAME_VALUE_REDACTED + survivors present; AG-040 v1, Codex 019ea174):
 *    render the surviving rows + a redaction banner; `data-fully-evaluable`
 *    STAYS "false" (survivors are partial, privacy-preserving evidence).
 *  - happy → meta + exposure-summary + table + probeErrors
 */
export interface StartupExposureViewProps {
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

// Codex 019e83a6 iter-2 must_fix #2 absorb: the two exposure scalars
// have DIFFERENT operator semantics for the same boolean value, so they
// need different tone policies — one shared BoolBadge would either flip
// firewall logging to a warning when it's on (wrong) or flip RDP to a
// success when it's on (also wrong). We split into two tone vectors.
type ExposureTonePolarity = 'rdp' | 'firewall-event-log';

interface ExposureBadgeProps {
  value: boolean | null;
  polarity: ExposureTonePolarity;
  trueLabel: string;
  falseLabel: string;
  unknownLabel: string;
  testId: string;
}

const ExposureBadge: React.FC<ExposureBadgeProps> = ({
  value,
  polarity,
  trueLabel,
  falseLabel,
  unknownLabel,
  testId,
}) => {
  let label = unknownLabel;
  let toneClass = 'bg-surface-default text-text-secondary border-border-default';
  if (value === true) {
    label = trueLabel;
    if (polarity === 'rdp') {
      // RDP enabled → higher exposure → warning
      toneClass = 'bg-state-warning-subtle text-state-warning-text border-state-warning-border';
    } else {
      // Firewall event-log enabled → audit/visibility is healthy → success
      toneClass = 'bg-state-success-subtle text-state-success-text border-state-success-border';
    }
  } else if (value === false) {
    label = falseLabel;
    if (polarity === 'rdp') {
      // RDP disabled → lower exposure → success
      toneClass = 'bg-state-success-subtle text-state-success-text border-state-success-border';
    } else {
      // Firewall event-log disabled → operator should notice → warning
      toneClass = 'bg-state-warning-subtle text-state-warning-text border-state-warning-border';
    }
  }
  return (
    <span
      data-testid={testId}
      data-value={value === null ? 'null' : String(value)}
      data-polarity={polarity}
      className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs ${toneClass}`}
    >
      {label}
    </span>
  );
};

interface MetaPanelProps {
  snapshot: StartupExposureSnapshot;
  t: (key: string) => string;
}

const MetaPanel: React.FC<MetaPanelProps> = ({ snapshot, t }) => (
  <section className="space-y-2" data-testid="startup-exposure-meta">
    <h4 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
      {t('endpointAdmin.drawer.startupExposure.meta.heading')}
    </h4>
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
      <div>
        <dt className="text-text-secondary text-xs">
          {t('endpointAdmin.drawer.startupExposure.meta.collectedAt')}
        </dt>
        <dd>{formatTimestamp(snapshot.collectedAt)}</dd>
      </div>
      <div>
        <dt className="text-text-secondary text-xs">
          {t('endpointAdmin.drawer.startupExposure.meta.probeDuration')}
        </dt>
        <dd>{formatMillis(snapshot.probeDurationMs)}</dd>
      </div>
    </dl>
  </section>
);

interface ExposurePanelProps {
  snapshot: StartupExposureSnapshot;
  t: (key: string) => string;
}

const ExposurePanel: React.FC<ExposurePanelProps> = ({ snapshot, t }) => {
  // Codex 019e83a6 iter-2 must_fix #1: derive trustworthy values via
  // the per-scalar effective getters. supported=false / RDP_PROBE_FAILED
  // / FIREWALL_PROBE_FAILED / NO_EVIDENCE all flip the relevant scalar
  // to "unknown" so the badge never renders a confident success-tone
  // "Kapalı" on fail-closed evidence.
  const effectiveRdp = getEffectiveRdpEnabled(snapshot);
  const effectiveFirewall = getEffectiveFirewallEventLogEnabled(snapshot);
  return (
    <section className="space-y-2" data-testid="startup-exposure-summary">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
        {t('endpointAdmin.drawer.startupExposure.exposure.heading')}
      </h4>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt className="text-text-secondary text-xs">
            {t('endpointAdmin.drawer.startupExposure.exposure.rdp')}
          </dt>
          <dd>
            <ExposureBadge
              value={effectiveRdp}
              polarity="rdp"
              trueLabel={t('endpointAdmin.drawer.startupExposure.badge.enabled')}
              falseLabel={t('endpointAdmin.drawer.startupExposure.badge.disabled')}
              unknownLabel={t('endpointAdmin.drawer.startupExposure.badge.unknown')}
              testId="startup-exposure-rdp-badge"
            />
          </dd>
        </div>
        <div>
          <dt className="text-text-secondary text-xs">
            {t('endpointAdmin.drawer.startupExposure.exposure.firewallEventLog')}
          </dt>
          <dd>
            <ExposureBadge
              value={effectiveFirewall}
              polarity="firewall-event-log"
              trueLabel={t('endpointAdmin.drawer.startupExposure.badge.enabled')}
              falseLabel={t('endpointAdmin.drawer.startupExposure.badge.disabled')}
              unknownLabel={t('endpointAdmin.drawer.startupExposure.badge.unknown')}
              testId="startup-exposure-firewall-badge"
            />
          </dd>
        </div>
      </dl>
    </section>
  );
};

const LOCATION_BADGE_CLASS: Record<StartupAppLocation, string> = {
  HKLM_RUN: 'bg-surface-muted text-text-primary border-border-default',
  HKLM_RUNONCE: 'bg-surface-muted text-text-primary border-border-default',
  HKLM_WOW6432_RUN: 'bg-surface-muted text-text-primary border-border-default',
  HKCU_RUN: 'bg-state-info-subtle text-state-info-text border-state-info-border',
  HKCU_RUNONCE: 'bg-state-info-subtle text-state-info-text border-state-info-border',
  STARTUP_FOLDER_COMMON: 'bg-surface-muted text-text-primary border-border-default',
  STARTUP_FOLDER_USER: 'bg-state-info-subtle text-state-info-text border-state-info-border',
  'TASK_SCHEDULER:ROOT':
    'bg-state-warning-subtle text-state-warning-text border-state-warning-border',
  'TASK_SCHEDULER:MICROSOFT_WINDOWS': 'bg-surface-muted text-text-primary border-border-default',
  'TASK_SCHEDULER:CUSTOM':
    'bg-state-warning-subtle text-state-warning-text border-state-warning-border',
};

const PROBE_ORIGIN_BADGE_CLASS: Record<StartupProbeOrigin, string> = {
  REGISTRY: 'bg-state-info-subtle text-state-info-text border-state-info-border',
  SCHEDULED_TASK: 'bg-state-warning-subtle text-state-warning-text border-state-warning-border',
};

interface AppsTableProps {
  apps: StartupApp[];
  t: (key: string) => string;
}

const AppsTable: React.FC<AppsTableProps> = ({ apps, t }) => {
  if (apps.length === 0) {
    return (
      <section className="space-y-2" data-testid="startup-exposure-table-empty">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          {t('endpointAdmin.drawer.startupExposure.table.heading')}
        </h4>
        <p className="text-sm text-text-secondary">
          {t('endpointAdmin.drawer.startupExposure.table.empty')}
        </p>
      </section>
    );
  }
  const enabledLabel = (value: boolean | null): string => {
    if (value === true) return t('endpointAdmin.drawer.startupExposure.enabled.true');
    if (value === false) return t('endpointAdmin.drawer.startupExposure.enabled.false');
    return t('endpointAdmin.drawer.startupExposure.enabled.unknown');
  };
  return (
    <section className="space-y-2" data-testid="startup-exposure-table">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
        {t('endpointAdmin.drawer.startupExposure.table.heading')}
      </h4>
      <div className="rounded-md border border-border-default overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-text-secondary text-xs">
            <tr>
              <th className="text-left px-3 py-2 w-12">#</th>
              <th className="text-left px-3 py-2">
                {t('endpointAdmin.drawer.startupExposure.table.col.name')}
              </th>
              <th className="text-left px-3 py-2 w-56">
                {t('endpointAdmin.drawer.startupExposure.table.col.location')}
              </th>
              <th className="text-left px-3 py-2 w-24">
                {t('endpointAdmin.drawer.startupExposure.table.col.enabled')}
              </th>
              <th className="text-left px-3 py-2 w-40">
                {t('endpointAdmin.drawer.startupExposure.table.col.probeOrigin')}
              </th>
            </tr>
          </thead>
          <tbody>
            {apps.map((app) => (
              <tr
                key={app.rowOrdinal}
                className="border-t border-border-subtle"
                data-testid={`startup-exposure-row-${app.rowOrdinal}`}
                data-location={app.location}
                data-probe-origin={app.probeOrigin}
              >
                <td className="px-3 py-2 font-mono text-xs">{app.rowOrdinal}</td>
                {/* Plain text only — name is registry-value-name /
                    task-name / folder-basename per backend redaction
                    contract, but React escaping is last-line defence. */}
                <td className="px-3 py-2 font-mono text-xs">{app.name}</td>
                <td className="px-3 py-2">
                  <span
                    data-testid={`startup-exposure-location-${app.rowOrdinal}`}
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-mono ${LOCATION_BADGE_CLASS[app.location]}`}
                  >
                    {t(`endpointAdmin.drawer.startupExposure.location.${app.location}`)}
                  </span>
                </td>
                <td
                  className="px-3 py-2"
                  data-testid={`startup-exposure-enabled-${app.rowOrdinal}`}
                  data-enabled={app.enabled === null ? 'null' : String(app.enabled)}
                >
                  {enabledLabel(app.enabled)}
                </td>
                <td className="px-3 py-2">
                  <span
                    data-testid={`startup-exposure-origin-${app.rowOrdinal}`}
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] ${PROBE_ORIGIN_BADGE_CLASS[app.probeOrigin]}`}
                  >
                    {t(`endpointAdmin.drawer.startupExposure.probeOrigin.${app.probeOrigin}`)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

interface ProbeErrorsPanelProps {
  probeErrors: StartupExposureProbeError[];
  t: (key: string) => string;
}

const ProbeErrorsPanel: React.FC<ProbeErrorsPanelProps> = ({ probeErrors, t }) => {
  if (!probeErrors || probeErrors.length === 0) {
    return (
      <section className="space-y-2" data-testid="startup-exposure-probe-errors-empty">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          {t('endpointAdmin.drawer.startupExposure.probeErrors.heading')}
        </h4>
        <p className="text-sm text-text-secondary">
          {t('endpointAdmin.drawer.startupExposure.probeErrors.empty')}
        </p>
      </section>
    );
  }
  return (
    <section className="space-y-2" data-testid="startup-exposure-probe-errors">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
        {t('endpointAdmin.drawer.startupExposure.probeErrors.heading')}
      </h4>
      <div className="rounded-md border border-border-default overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-text-secondary text-xs">
            <tr>
              <th className="text-left px-3 py-2 w-12">
                {t('endpointAdmin.drawer.startupExposure.probeErrors.col.rowOrdinal')}
              </th>
              <th className="text-left px-3 py-2 w-40">
                {t('endpointAdmin.drawer.startupExposure.probeErrors.col.code')}
              </th>
              <th className="text-left px-3 py-2 w-40">
                {t('endpointAdmin.drawer.startupExposure.probeErrors.col.source')}
              </th>
              <th className="text-left px-3 py-2">
                {t('endpointAdmin.drawer.startupExposure.probeErrors.col.summary')}
              </th>
            </tr>
          </thead>
          <tbody>
            {probeErrors.map((err) => (
              <tr
                key={err.rowOrdinal}
                className="border-t border-border-subtle"
                data-testid={`startup-exposure-probe-error-row-${err.rowOrdinal}`}
              >
                <td className="px-3 py-2 font-mono text-xs">{err.rowOrdinal}</td>
                <td className="px-3 py-2 font-mono text-xs">{err.code}</td>
                {/* Codex 019e83a6 iter-2 P2 absorb: source is the
                    autorun-anchor enum (StartupAppLocation) when set —
                    render via the existing location i18n label so
                    known values display the same as table location
                    chips. Null/absent fallback "—". */}
                <td className="px-3 py-2 font-mono text-xs">
                  {err.source
                    ? t(`endpointAdmin.drawer.startupExposure.location.${err.source}`)
                    : '—'}
                </td>
                <td className="px-3 py-2 whitespace-pre-wrap">{err.summary ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export const StartupExposureView: React.FC<StartupExposureViewProps> = ({ deviceId, active }) => {
  const { t } = useEndpointAdminI18n();
  const {
    currentData: snapshot,
    error,
    isLoading,
  } = useGetStartupExposureLatestQuery({ deviceId }, { skip: !active });

  if (!active) return null;

  if (isLoading) {
    return (
      <div className="px-6 py-4" data-testid="startup-exposure-loading">
        <p className="text-sm text-text-secondary">
          {t('endpointAdmin.drawer.startupExposure.loading')}
        </p>
      </div>
    );
  }

  const status =
    error && typeof error === 'object' && 'status' in error
      ? (error as { status: unknown }).status
      : null;

  if (status === 403) {
    return (
      <div className="px-6 py-4" data-testid="startup-exposure-forbidden">
        <p className="text-sm text-text-secondary">
          {t('endpointAdmin.drawer.startupExposure.forbidden')}
        </p>
      </div>
    );
  }

  if (status === 404) {
    return (
      <div className="px-6 py-4" data-testid="startup-exposure-empty">
        <p className="text-sm text-text-secondary">
          {t('endpointAdmin.drawer.startupExposure.empty')}
        </p>
      </div>
    );
  }

  if (error) {
    // Codex AG-038 iter-2 #2 precedent: cut on error BEFORE
    // !snapshot fall-through.
    return (
      <div className="px-6 py-4" data-testid="startup-exposure-error">
        <p className="text-sm text-state-danger-text">
          {t('endpointAdmin.drawer.startupExposure.error')}
        </p>
      </div>
    );
  }

  if (!snapshot) return null;

  if (!isStartupExposureForDevice(snapshot, deviceId)) {
    return (
      <div className="px-6 py-4" data-testid="startup-exposure-stale-arg">
        <p className="text-sm text-state-warning-text">
          {t('endpointAdmin.drawer.startupExposure.staleArg')}
        </p>
      </div>
    );
  }

  // Codex AG-039 iter-2 P1 precedent: both fail-closed flavours
  // (supported=false / probeComplete=false) share the same view
  // container + data-fully-evaluable contract; only the apps TABLE
  // is hidden. Meta + exposure-summary + probeErrors visible.
  const fullyEvaluable = isStartupExposureFullyEvaluable(snapshot);
  // AG-040 v1 UX (Codex 019ea174 AGREE Option A): when probeComplete=false
  // SOLELY because some entry names were redacted (no real probe failure),
  // render the surviving rows + a banner instead of hiding the whole table.
  // The snapshot stays data-fully-evaluable="false" (NOT widened).
  const redactionOnly = isStartupExposureRedactionOnly(snapshot);
  const showStartupAppsTable = fullyEvaluable || redactionOnly;
  const isUnsupported = snapshot.supported === false;

  return (
    <div
      className="px-6 py-4 space-y-6"
      data-testid="startup-exposure-view"
      data-fully-evaluable={fullyEvaluable ? 'true' : 'false'}
    >
      <header>
        <h3 className="text-base font-semibold text-text-primary">
          {t('endpointAdmin.drawer.startupExposure.title')}
        </h3>
        <p className="text-xs text-text-secondary">
          {t('endpointAdmin.drawer.startupExposure.subtitle')}
        </p>
      </header>

      <MetaPanel snapshot={snapshot} t={t} />
      <ExposurePanel snapshot={snapshot} t={t} />

      {showStartupAppsTable ? (
        <>
          {redactionOnly ? (
            <p
              className="text-sm text-state-warning-text border-l-4 border-state-warning-border pl-3 py-1"
              data-testid="startup-exposure-redaction-banner"
            >
              {t('endpointAdmin.drawer.startupExposure.redactionBanner')}
            </p>
          ) : null}
          <AppsTable apps={snapshot.startupApps} t={t} />
        </>
      ) : isUnsupported ? (
        <p
          className="text-sm text-text-secondary border-l-4 border-border-default pl-3 py-1"
          data-testid="startup-exposure-unsupported"
        >
          {t('endpointAdmin.drawer.startupExposure.unsupported')}
        </p>
      ) : (
        <p
          className="text-sm text-state-warning-text border-l-4 border-state-warning-border pl-3 py-1"
          data-testid="startup-exposure-incomplete"
        >
          {t('endpointAdmin.drawer.startupExposure.incomplete')}
        </p>
      )}

      <ProbeErrorsPanel probeErrors={snapshot.probeErrors} t={t} />
    </div>
  );
};

StartupExposureView.displayName = 'StartupExposureView';
