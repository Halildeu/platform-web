import React from 'react';

import { useGetServicesLatestQuery } from '../../../../app/services/endpointAdminApi';
import type {
  ServiceEntry,
  ServiceState,
  ServicesProbeError,
  ServicesSnapshot,
  StartupMode,
} from '../../../../entities/endpoint-services/types';
import {
  isServicesForDevice,
  isServicesFullyEvaluable,
} from '../../../../entities/endpoint-services/types';
import { useEndpointAdminI18n } from '../../../../i18n';

/**
 * WEB critical services inventory view — Faz 22.5 AG-039 (probe → backend
 * ingest → web view; Codex 019e8389 PARTIAL absorb).
 *
 * Mirrors the AG-038 DiagnosticsView precedent (currentData-anchored,
 * fail-closed gates, plain-text XSS guards, production-visible DOM attrs).
 *
 * Read-only "Hizmetler" (Services) tab. Backend endpoint:
 *   /api/v1/endpoint-admin/endpoint-devices/{deviceId}/services/latest
 *
 * Render contract (from platform-agent docs/COMMAND-CONTRACT.md §18 +
 * platform-backend AG-039-be PR #362):
 * - Scan-meta panel: collectedAt + probeDurationMs (safe metadata, always
 *   rendered).
 * - Services table (fully-evaluable only): 6 rows × name + present chip +
 *   state badge (color-coded) + startupMode chip (RED for DISABLED per
 *   Codex 019e8389 must_fix #3 — pratikte STOPPED+startupMode=DISABLED
 *   "disabled service" pattern).
 * - probeErrors[] table: rowOrdinal + code + serviceName fallback "—" +
 *   summary fallback "—" (Codex 019e8389 must_fix #5). Visible BOTH in
 *   fully-evaluable AND incomplete branches so operators can diagnose
 *   why the probe failed (must_fix #2).
 *
 * Redaction boundary: only contract-allowed scalars render — NO raw
 * description / command line / account / SID / display name.
 *
 * State precedence (strict order):
 *  - active=false → null (parent owns gate)
 *  - isLoading → loading placeholder
 *  - 403 → forbidden
 *  - 404 → empty + operator hint ("COLLECT_INVENTORY includeServices:true")
 *  - error (other 4xx/5xx) → cuts BEFORE snapshot fall-through (AG-038
 *    iter-2 must_fix #2 precedent)
 *  - !snapshot → null (RTK transient)
 *  - !isServicesForDevice → stale-arg warning (defence-in-depth)
 *  - supported=false → unsupported notice + scan-meta only
 *  - probeComplete=false → fail-closed incomplete notice + table HIDDEN
 *    + probeErrors still visible (must_fix #2)
 *  - happy → meta + table + probeErrors
 */
export interface ServicesViewProps {
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

const STATE_BADGE_CLASSES: Record<ServiceState, string> = {
  RUNNING: 'bg-state-success-subtle text-state-success-text border-state-success-border',
  STOPPED: 'bg-state-warning-subtle text-state-warning-text border-state-warning-border',
  DISABLED: 'bg-state-danger-subtle text-state-danger-text border-state-danger-border',
  UNKNOWN: 'bg-surface-default text-text-secondary border-border-default',
};

// Codex 019e8389 must_fix #3: startupMode=DISABLED → danger chip
// (operationally the disabled-service signal is conveyed by startup
// config, not just runtime state — state=STOPPED+startup=DISABLED is
// the common "policy-disabled service" pattern).
const STARTUP_BADGE_CLASSES: Record<StartupMode, string> = {
  AUTO: 'bg-state-success-subtle text-state-success-text border-state-success-border',
  AUTO_DELAYED: 'bg-state-info-subtle text-state-info-text border-state-info-border',
  MANUAL: 'bg-surface-muted text-text-primary border-border-default',
  DISABLED: 'bg-state-danger-subtle text-state-danger-text border-state-danger-border',
  UNKNOWN: 'bg-surface-default text-text-secondary border-border-default',
};

interface MetaPanelProps {
  snapshot: ServicesSnapshot;
  t: (key: string) => string;
}

const MetaPanel: React.FC<MetaPanelProps> = ({ snapshot, t }) => {
  return (
    <section className="space-y-2" data-testid="services-meta">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
        {t('endpointAdmin.drawer.services.meta.heading')}
      </h4>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-text-secondary text-xs">
            {t('endpointAdmin.drawer.services.meta.collectedAt')}
          </dt>
          <dd>{formatTimestamp(snapshot.collectedAt)}</dd>
        </div>
        <div>
          <dt className="text-text-secondary text-xs">
            {t('endpointAdmin.drawer.services.meta.probeDuration')}
          </dt>
          <dd>{formatMillis(snapshot.probeDurationMs)}</dd>
        </div>
      </dl>
    </section>
  );
};

interface ServicesTableProps {
  services: ServiceEntry[];
  t: (key: string) => string;
}

const ServicesTable: React.FC<ServicesTableProps> = ({ services, t }) => {
  const presentLabel = (value: boolean | null): string => {
    if (value === true) return t('endpointAdmin.drawer.services.present.true');
    if (value === false) return t('endpointAdmin.drawer.services.present.false');
    return t('endpointAdmin.drawer.services.present.unknown');
  };
  return (
    <section className="space-y-2" data-testid="services-table">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
        {t('endpointAdmin.drawer.services.table.heading')}
      </h4>
      <div className="rounded-md border border-border-default overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-text-secondary text-xs">
            <tr>
              <th className="text-left px-3 py-2">
                {t('endpointAdmin.drawer.services.table.col.name')}
              </th>
              <th className="text-left px-3 py-2 w-24">
                {t('endpointAdmin.drawer.services.table.col.present')}
              </th>
              <th className="text-left px-3 py-2 w-36">
                {t('endpointAdmin.drawer.services.table.col.state')}
              </th>
              <th className="text-left px-3 py-2 w-44">
                {t('endpointAdmin.drawer.services.table.col.startupMode')}
              </th>
            </tr>
          </thead>
          <tbody>
            {services.map((svc) => (
              <tr
                key={svc.rowOrdinal}
                className="border-t border-border-subtle"
                data-testid={`services-row-${svc.name}`}
                data-row-ordinal={svc.rowOrdinal}
              >
                {/* Plain text only — never dangerouslySetInnerHTML.
                    Backend allowlist guarantees `name` is from the
                    canonical SCM-name list, but React text escaping is
                    the redaction last-line. */}
                <td className="px-3 py-2 font-mono text-xs">{svc.name}</td>
                <td
                  className="px-3 py-2"
                  data-testid={`services-present-${svc.name}`}
                  data-present={svc.present === null ? 'null' : String(svc.present)}
                >
                  {presentLabel(svc.present)}
                </td>
                <td className="px-3 py-2">
                  <span
                    data-testid={`services-state-${svc.name}`}
                    data-state={svc.state}
                    className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs ${STATE_BADGE_CLASSES[svc.state]}`}
                  >
                    {t(`endpointAdmin.drawer.services.state.${svc.state}`)}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span
                    data-testid={`services-startup-${svc.name}`}
                    data-startup={svc.startupMode}
                    className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs ${STARTUP_BADGE_CLASSES[svc.startupMode]}`}
                  >
                    {t(`endpointAdmin.drawer.services.startupMode.${svc.startupMode}`)}
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
  probeErrors: ServicesProbeError[];
  t: (key: string) => string;
}

const ProbeErrorsPanel: React.FC<ProbeErrorsPanelProps> = ({ probeErrors, t }) => {
  if (!probeErrors || probeErrors.length === 0) {
    return (
      <section className="space-y-2" data-testid="services-probe-errors-empty">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          {t('endpointAdmin.drawer.services.probeErrors.heading')}
        </h4>
        <p className="text-sm text-text-secondary">
          {t('endpointAdmin.drawer.services.probeErrors.empty')}
        </p>
      </section>
    );
  }
  return (
    <section className="space-y-2" data-testid="services-probe-errors">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
        {t('endpointAdmin.drawer.services.probeErrors.heading')}
      </h4>
      <div className="rounded-md border border-border-default overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-text-secondary text-xs">
            <tr>
              <th className="text-left px-3 py-2 w-12">
                {t('endpointAdmin.drawer.services.probeErrors.col.rowOrdinal')}
              </th>
              <th className="text-left px-3 py-2 w-40">
                {t('endpointAdmin.drawer.services.probeErrors.col.code')}
              </th>
              <th className="text-left px-3 py-2 w-40">
                {t('endpointAdmin.drawer.services.probeErrors.col.serviceName')}
              </th>
              <th className="text-left px-3 py-2">
                {t('endpointAdmin.drawer.services.probeErrors.col.summary')}
              </th>
            </tr>
          </thead>
          <tbody>
            {probeErrors.map((err) => (
              <tr
                key={err.rowOrdinal}
                className="border-t border-border-subtle"
                data-testid={`services-probe-error-row-${err.rowOrdinal}`}
              >
                <td className="px-3 py-2 font-mono text-xs">{err.rowOrdinal}</td>
                {/* Plain text only — backend allowlist constrains code +
                    serviceName, but React escaping is last-line defence. */}
                <td className="px-3 py-2 font-mono text-xs">{err.code}</td>
                <td className="px-3 py-2 font-mono text-xs">{err.serviceName ?? '—'}</td>
                <td className="px-3 py-2 whitespace-pre-wrap">{err.summary ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export const ServicesView: React.FC<ServicesViewProps> = ({ deviceId, active }) => {
  const { t } = useEndpointAdminI18n();

  // Codex 019e833d AG-038 precedent: use `currentData` not `data` so a
  // leftover response from a different device cannot leak.
  const {
    currentData: snapshot,
    error,
    isLoading,
  } = useGetServicesLatestQuery({ deviceId }, { skip: !active });

  if (!active) return null;

  if (isLoading) {
    return (
      <div className="px-6 py-4" data-testid="services-loading">
        <p className="text-sm text-text-secondary">{t('endpointAdmin.drawer.services.loading')}</p>
      </div>
    );
  }

  const status =
    error && typeof error === 'object' && 'status' in error
      ? (error as { status: unknown }).status
      : null;

  if (status === 403) {
    return (
      <div className="px-6 py-4" data-testid="services-forbidden">
        <p className="text-sm text-text-secondary">
          {t('endpointAdmin.drawer.services.forbidden')}
        </p>
      </div>
    );
  }

  if (status === 404) {
    return (
      <div className="px-6 py-4" data-testid="services-empty">
        <p className="text-sm text-text-secondary">{t('endpointAdmin.drawer.services.empty')}</p>
      </div>
    );
  }

  // Codex 019e833d AG-038 iter-2 must_fix #2: cut on `error` BEFORE
  // checking `!snapshot`. Transient 5xx during refetch must not render
  // the stale snapshot as live.
  if (error) {
    return (
      <div className="px-6 py-4" data-testid="services-error">
        <p className="text-sm text-state-danger-text">{t('endpointAdmin.drawer.services.error')}</p>
      </div>
    );
  }

  if (!snapshot) return null;

  if (!isServicesForDevice(snapshot, deviceId)) {
    return (
      <div className="px-6 py-4" data-testid="services-stale-arg">
        <p className="text-sm text-state-warning-text">
          {t('endpointAdmin.drawer.services.staleArg')}
        </p>
      </div>
    );
  }

  if (snapshot.supported === false) {
    return (
      <div className="px-6 py-4 space-y-4" data-testid="services-unsupported">
        <p className="text-sm text-text-secondary">
          {t('endpointAdmin.drawer.services.unsupported')}
        </p>
        {/* Even when unsupported, render scan meta + probeErrors so the
            operator can see WHICH agent reported "not supported". */}
        <MetaPanel snapshot={snapshot} t={t} />
        <ProbeErrorsPanel probeErrors={snapshot.probeErrors} t={t} />
      </div>
    );
  }

  const fullyEvaluable = isServicesFullyEvaluable(snapshot);

  return (
    <div
      className="px-6 py-4 space-y-6"
      data-testid="services-view"
      data-fully-evaluable={fullyEvaluable ? 'true' : 'false'}
    >
      <header>
        <h3 className="text-base font-semibold text-text-primary">
          {t('endpointAdmin.drawer.services.title')}
        </h3>
        <p className="text-xs text-text-secondary">{t('endpointAdmin.drawer.services.subtitle')}</p>
      </header>

      <MetaPanel snapshot={snapshot} t={t} />

      {/* Codex 019e8389 must_fix #2: fail-closed branches keep meta +
          probeErrors visible inside the services-view container so the
          operator can diagnose WHY the probe failed. Only the services
          TABLE is hidden when not fully-evaluable. */}
      {fullyEvaluable ? (
        <ServicesTable services={snapshot.services} t={t} />
      ) : (
        <p
          className="text-sm text-state-warning-text border-l-4 border-state-warning-border pl-3 py-1"
          data-testid="services-incomplete"
        >
          {t('endpointAdmin.drawer.services.incomplete')}
        </p>
      )}

      <ProbeErrorsPanel probeErrors={snapshot.probeErrors} t={t} />
    </div>
  );
};

ServicesView.displayName = 'ServicesView';
