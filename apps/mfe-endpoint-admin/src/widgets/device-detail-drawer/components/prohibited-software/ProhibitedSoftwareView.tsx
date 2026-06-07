import React from 'react';

import { useGetProhibitedSoftwareQuery } from '../../../../app/services/endpointAdminApi';
import type {
  DeviceProhibitedSoftwareSnapshot,
  ProhibitedSoftwareFinding,
} from '../../../../entities/endpoint-prohibited-software/types';
import {
  isProhibitedSoftwareForDevice,
  isProhibitedSoftwareUnauthorized,
} from '../../../../entities/endpoint-prohibited-software/types';
import { useEndpointAdminI18n } from '../../../../i18n';

/**
 * WEB Prohibited-Software finding view — Faz 22.5 P2-A slice-2 BE-025
 * (backend MERGED `/endpoint-devices/{id}/prohibited-software`; this is
 * the missing web link that turns BE-024 delta evidence into policy
 * evidence in the operator workflow).
 *
 * Mirrors the AG-038/AG-039/AG-040/AG-041/BE-024 precedents:
 * - `currentData`-anchored snapshot + `isForDevice` stale guard
 * - `if (error) ...` cuts BEFORE the `!snapshot` fall-through
 * - 2-status enum distinct render (OK vs NO_EVALUATION — operator can
 *   tell "evaluator ran, no matches" apart from "no evaluation yet
 *   / unknown device" thanks to backend no-existence-leak)
 * - Plain-text XSS guards (React text-escape) on every operator-
 *   visible string field
 *
 * Read-only "Yasaklı Yazılım" tab. Backend endpoint:
 *   /api/v1/endpoint-admin/endpoint-devices/{deviceId}/prohibited-software
 *
 * Render contract:
 * - Status badge: OK with findings → warn-tone (denylist matched);
 *   OK with empty findings → success-tone (evaluator ran, nothing
 *   matched); NO_EVALUATION → neutral-tone.
 * - Decision badge (when status=OK + decision present): UNAUTHORIZED
 *   → warn-tone, others → neutral.
 * - Header: evaluatedAt + inventorySnapshotId (correlate with BE-024
 *   diff / software-inventory snapshot).
 * - Findings table: ruleId (truncated) + matchType + matchMode +
 *   matchedName + matchedPublisher (— if null) + matchedVersion
 *   (— if null). Hidden when findings list is empty.
 *
 * Adversarial guardrails (Codex 019e84ca slice-2):
 * - NO "automatic uninstall" / "remediation" / "block" CTA — the
 *   backend has no such surface; the UI does NOT pretend to.
 * - Copy stays at "tespit edildi / detected" level — never "kaldırıldı"
 *   / "engellendi" (UI does not advertise actions the backend
 *   cannot perform).
 *
 * Redaction boundary: only the wire-contract fields render; never
 * displays rule notes / createdBySubject / raw install path /
 * registry key / uninstall string / MSI GUID.
 *
 * State precedence (strict order):
 *  - active=false → null
 *  - isLoading → loading placeholder
 *  - 403 → forbidden
 *  - error (other 4xx/5xx) → cuts BEFORE snapshot fall-through
 *    (note: 404 is NOT expected — backend always returns 200 with
 *    NO_EVALUATION for unknown device per BE-025 no-existence-leak)
 *  - !snapshot → null
 *  - !isProhibitedSoftwareForDevice → stale-arg warning
 *  - render by status — OK (header + findings or "no matches" state)
 *    vs NO_EVALUATION (distinct copy: "no evaluation yet")
 */
export interface ProhibitedSoftwareViewProps {
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

function truncateUuid(value: string): string {
  if (value.length <= 12) return value;
  return `${value.slice(0, 12)}…`;
}

export const ProhibitedSoftwareView: React.FC<ProhibitedSoftwareViewProps> = ({
  deviceId,
  active,
}) => {
  const { t } = useEndpointAdminI18n();

  const { currentData, isLoading, error } = useGetProhibitedSoftwareQuery(
    { deviceId },
    { skip: !active || !deviceId },
  );

  const snapshot: DeviceProhibitedSoftwareSnapshot | undefined = currentData;

  if (!active) return null;

  if (isLoading) {
    return (
      <div
        className="prohibited-software-view prohibited-software-view--loading"
        data-testid="prohibited-software-view-loading"
      >
        {t('endpointAdmin.drawer.prohibitedSoftware.loading')}
      </div>
    );
  }

  if (error) {
    const status = (error as { status?: number | string }).status;
    if (status === 403) {
      return (
        <div
          className="prohibited-software-view prohibited-software-view--forbidden"
          data-testid="prohibited-software-view-forbidden"
        >
          {t('endpointAdmin.drawer.prohibitedSoftware.forbidden')}
        </div>
      );
    }
    return (
      <div
        className="prohibited-software-view prohibited-software-view--error"
        data-testid="prohibited-software-view-error"
      >
        {t('endpointAdmin.drawer.prohibitedSoftware.error')}
      </div>
    );
  }

  if (!snapshot) {
    return null;
  }

  if (!isProhibitedSoftwareForDevice(snapshot, deviceId)) {
    return (
      <div
        className="prohibited-software-view prohibited-software-view--stale"
        data-testid="prohibited-software-view-stale"
      >
        {t('endpointAdmin.drawer.prohibitedSoftware.staleWarning')}
      </div>
    );
  }

  const findingsCount = snapshot.findings.length;
  const unauthorized = isProhibitedSoftwareUnauthorized(snapshot);
  const statusKey = `endpointAdmin.drawer.prohibitedSoftware.status.${snapshot.status}` as const;
  const statusTone =
    snapshot.status === 'NO_EVALUATION' ? 'neutral' : findingsCount > 0 ? 'warn' : 'success';

  return (
    <section
      className="prohibited-software-view"
      data-testid="prohibited-software-view"
      data-status={snapshot.status}
      data-findings-count={String(findingsCount)}
      data-unauthorized={String(unauthorized)}
    >
      <header
        className="prohibited-software-view__header"
        data-testid="prohibited-software-view-header"
      >
        <span
          className={`badge badge--${statusTone}`}
          data-testid="prohibited-software-view-status-badge"
        >
          {t(statusKey)}
        </span>
        {snapshot.status === 'OK' && snapshot.decision && (
          <span
            className={`badge badge--${unauthorized ? 'warn' : 'neutral'}`}
            data-testid="prohibited-software-view-decision-badge"
            data-decision={snapshot.decision}
          >
            {snapshot.decision}
          </span>
        )}
        {snapshot.status === 'OK' && (
          <dl className="prohibited-software-view__eval-meta">
            <dt>{t('endpointAdmin.drawer.prohibitedSoftware.meta.evaluatedAt')}</dt>
            <dd data-testid="prohibited-software-view-evaluated-at">
              {formatTimestamp(snapshot.evaluatedAt)}
            </dd>
            <dt>{t('endpointAdmin.drawer.prohibitedSoftware.meta.inventorySnapshotId')}</dt>
            <dd data-testid="prohibited-software-view-inventory-snapshot-id">
              {snapshot.inventorySnapshotId ? truncateUuid(snapshot.inventorySnapshotId) : '—'}
            </dd>
          </dl>
        )}
      </header>

      {snapshot.status === 'NO_EVALUATION' && (
        <p
          className="prohibited-software-view__no-eval"
          data-testid="prohibited-software-view-no-eval"
        >
          {t('endpointAdmin.drawer.prohibitedSoftware.noEvaluation.notice')}
        </p>
      )}

      {snapshot.status === 'OK' && findingsCount === 0 && (
        <p
          className="prohibited-software-view__no-findings"
          data-testid="prohibited-software-view-no-findings"
        >
          {t('endpointAdmin.drawer.prohibitedSoftware.noFindings.notice')}
        </p>
      )}

      {snapshot.status === 'OK' && findingsCount > 0 && (
        <section
          className="prohibited-software-view__findings"
          data-testid="prohibited-software-view-findings"
        >
          <h4>{t('endpointAdmin.drawer.prohibitedSoftware.findings.title')}</h4>
          <table className="w-full text-sm [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium [&_td]:px-3 [&_td]:py-2 [&_td]:align-top">
            <thead>
              <tr>
                <th>{t('endpointAdmin.drawer.prohibitedSoftware.col.ruleId')}</th>
                <th>{t('endpointAdmin.drawer.prohibitedSoftware.col.matchType')}</th>
                <th>{t('endpointAdmin.drawer.prohibitedSoftware.col.matchMode')}</th>
                <th>{t('endpointAdmin.drawer.prohibitedSoftware.col.matchedName')}</th>
                <th>{t('endpointAdmin.drawer.prohibitedSoftware.col.matchedPublisher')}</th>
                <th>{t('endpointAdmin.drawer.prohibitedSoftware.col.matchedVersion')}</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.findings.map((f: ProhibitedSoftwareFinding, idx: number) => (
                <tr
                  key={`${f.ruleId}-${idx}`}
                  data-testid={`prohibited-software-view-finding-row-${idx}`}
                  data-rule-id={f.ruleId}
                  data-match-type={f.matchType}
                  data-match-mode={f.matchMode}
                >
                  <td>{truncateUuid(f.ruleId)}</td>
                  <td>{f.matchType}</td>
                  <td>{f.matchMode}</td>
                  <td>{f.matchedName}</td>
                  <td>{f.matchedPublisher ?? '—'}</td>
                  <td>{f.matchedVersion ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </section>
  );
};
