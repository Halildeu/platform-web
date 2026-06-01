import React from 'react';

import { useGetDiagnosticsLatestQuery } from '../../../../app/services/endpointAdminApi';
import type { DiagnosticsSnapshot } from '../../../../entities/endpoint-agent-diagnostics/types';
import {
  isDiagnosticsForDevice,
  isDiagnosticsFullyEvaluable,
} from '../../../../entities/endpoint-agent-diagnostics/types';
import { useEndpointAdminI18n } from '../../../../i18n';

/**
 * WEB agent self-diagnostics view — Faz 22.5 (AG-038 → backend ingest
 * → web view; Codex 019e833d REVISE absorb).
 *
 * Mirrors the AG-037 hotfix-posture / AG-036 outdated-software /
 * AG-033 device-health precedents: 404 → empty + operator hint,
 * `currentData` stale-guard, render-time `deviceId` mismatch reset,
 * i18n via `useEndpointAdminI18n`.
 *
 * Read-only diagnostics surface. Backend lives at:
 *   /api/v1/endpoint-admin/endpoint-devices/{deviceId}/diagnostics/latest
 * which rewrites endpoint-admin→admin to the service-internal route.
 *
 * Render contract (from platform-agent docs/COMMAND-CONTRACT.md §17 +
 * platform-backend AG-038-be PR #357):
 * - Agent-meta panel: agentVersion + configHash (font-mono) +
 *   collectedAt timestamp + probeDurationMs.
 * - Connectivity panel (only when fully evaluable):
 *   lastPollLatencyMs (ms) + backendDnsReachable badge (true/false/null
 *   tri-state) + backendTlsValid badge (true/false/null).
 * - lastError facet (only when present — backend V23 triad CHECK
 *   guarantees all-or-nothing): occurredAt + code + summary text.
 * - probeErrors[] list (bounded by backend allowlist + server-derived
 *   rowOrdinal): rowOrdinal + code + summary (plain text only, NEVER
 *   dangerouslySetInnerHTML — Codex 019e833d must_fix #2 + #8).
 *
 * Redaction boundary (do NOT widen): only the contract-allowed scalars
 * render — NO raw HTTP body / stack trace / TLS cert chain / process
 * list / event log dump (none exist on the wire).
 *
 * State precedence (strict order — no two states overlap):
 *  - active=false → null (lazy mount, parent owns gate),
 *  - 403 → forbidden (lost module:endpoint-admin can_view tuple),
 *  - 404 → empty (operator hint: COLLECT_INVENTORY includeDiagnostics:true),
 *  - other error → generic error,
 *  - stale arg (currentData.deviceId !== deviceId) → "stale arg" hint
 *    (defends against RTK Query `data` leak across catalog rows; Codex
 *    019e833d must_fix #5 + WEB-014D-followup 019e830b precedent),
 *  - supported=false → "diagnostics not supported on this runtime",
 *  - probeComplete=false → fail-closed "evidence incomplete" — connectivity
 *    badges hidden so the view NEVER reads as "agent healthy" on
 *    incomplete data (Codex 019e833d must_fix #5),
 *  - happy path → render agent meta + connectivity + lastError + probeErrors.
 *
 * Cache policy: NO `keepUnusedDataFor: 0` (see endpointAdminApi for
 * deliberate freshness choice). The view defends against cross-arg
 * data leak via `currentData` + the deviceId-mismatch guard above.
 */
export interface DiagnosticsViewProps {
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
  // Codex 019e833d must_fix #5: use `value == null` (not falsy), since
  // 0 ms is a legitimate reading (cached DNS, loopback test).
  if (value == null) return '—';
  return `${value} ms`;
}

interface BooleanBadgeProps {
  value: boolean | null;
  trueLabel: string;
  falseLabel: string;
  unknownLabel: string;
  testId: string;
}

const BooleanBadge: React.FC<BooleanBadgeProps> = ({
  value,
  trueLabel,
  falseLabel,
  unknownLabel,
  testId,
}) => {
  // Tri-state: null is "unknown" (probe inconclusive), distinct from
  // true/false. Never collapse null into false — that would falsely
  // imply a failure when the probe didn't run.
  let label = unknownLabel;
  let toneClass = 'bg-surface-default text-text-secondary border-border-default';
  if (value === true) {
    label = trueLabel;
    toneClass = 'bg-state-success-subtle text-state-success-text border-state-success-border';
  } else if (value === false) {
    label = falseLabel;
    toneClass = 'bg-state-danger-subtle text-state-danger-text border-state-danger-border';
  }
  return (
    <span
      data-testid={testId}
      data-value={value === null ? 'null' : String(value)}
      className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs ${toneClass}`}
    >
      {label}
    </span>
  );
};

interface AgentMetaPanelProps {
  snapshot: DiagnosticsSnapshot;
  t: (key: string) => string;
}

const AgentMetaPanel: React.FC<AgentMetaPanelProps> = ({ snapshot, t }) => {
  return (
    <section className="space-y-2" data-testid="diagnostics-agent-meta">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
        {t('endpointAdmin.drawer.diagnostics.meta.heading')}
      </h4>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-text-secondary text-xs">
            {t('endpointAdmin.drawer.diagnostics.meta.agentVersion')}
          </dt>
          <dd className="font-mono">{snapshot.agentVersion ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-text-secondary text-xs">
            {t('endpointAdmin.drawer.diagnostics.meta.configHash')}
          </dt>
          <dd className="font-mono">{snapshot.configHash ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-text-secondary text-xs">
            {t('endpointAdmin.drawer.diagnostics.meta.collectedAt')}
          </dt>
          <dd>{formatTimestamp(snapshot.collectedAt)}</dd>
        </div>
        <div>
          <dt className="text-text-secondary text-xs">
            {t('endpointAdmin.drawer.diagnostics.meta.probeDuration')}
          </dt>
          <dd>{formatMillis(snapshot.probeDurationMs)}</dd>
        </div>
      </dl>
    </section>
  );
};

interface ConnectivityPanelProps {
  snapshot: DiagnosticsSnapshot;
  t: (key: string) => string;
}

const ConnectivityPanel: React.FC<ConnectivityPanelProps> = ({ snapshot, t }) => {
  return (
    <section className="space-y-2" data-testid="diagnostics-connectivity">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
        {t('endpointAdmin.drawer.diagnostics.connectivity.heading')}
      </h4>
      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt className="text-text-secondary text-xs">
            {t('endpointAdmin.drawer.diagnostics.connectivity.lastPollLatency')}
          </dt>
          <dd data-testid="diagnostics-last-poll-latency">
            {formatMillis(snapshot.lastPollLatencyMs)}
          </dd>
        </div>
        <div>
          <dt className="text-text-secondary text-xs">
            {t('endpointAdmin.drawer.diagnostics.connectivity.dns')}
          </dt>
          <dd>
            <BooleanBadge
              value={snapshot.backendDnsReachable}
              trueLabel={t('endpointAdmin.drawer.diagnostics.badge.reachable')}
              falseLabel={t('endpointAdmin.drawer.diagnostics.badge.unreachable')}
              unknownLabel={t('endpointAdmin.drawer.diagnostics.badge.unknown')}
              testId="diagnostics-dns-badge"
            />
          </dd>
        </div>
        <div>
          <dt className="text-text-secondary text-xs">
            {t('endpointAdmin.drawer.diagnostics.connectivity.tls')}
          </dt>
          <dd>
            <BooleanBadge
              value={snapshot.backendTlsValid}
              trueLabel={t('endpointAdmin.drawer.diagnostics.badge.valid')}
              falseLabel={t('endpointAdmin.drawer.diagnostics.badge.invalid')}
              unknownLabel={t('endpointAdmin.drawer.diagnostics.badge.unknown')}
              testId="diagnostics-tls-badge"
            />
          </dd>
        </div>
      </dl>
    </section>
  );
};

interface LastErrorPanelProps {
  snapshot: DiagnosticsSnapshot;
  t: (key: string) => string;
}

const LastErrorPanel: React.FC<LastErrorPanelProps> = ({ snapshot, t }) => {
  // Codex 019e833d must_fix #1: lastError is `null` when none of the
  // three legs are populated (backend V23 triad CHECK). Hide whole
  // facet rather than rendering empty rows.
  if (!snapshot.lastError) return null;
  const { occurredAt, code, summary } = snapshot.lastError;
  return (
    <section className="space-y-2" data-testid="diagnostics-last-error">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
        {t('endpointAdmin.drawer.diagnostics.lastError.heading')}
      </h4>
      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-text-secondary text-xs">
            {t('endpointAdmin.drawer.diagnostics.lastError.occurredAt')}
          </dt>
          <dd data-testid="diagnostics-last-error-occurredAt">{formatTimestamp(occurredAt)}</dd>
        </div>
        <div>
          <dt className="text-text-secondary text-xs">
            {t('endpointAdmin.drawer.diagnostics.lastError.code')}
          </dt>
          <dd className="font-mono" data-testid="diagnostics-last-error-code">
            {code}
          </dd>
        </div>
        <div className="sm:col-span-3">
          <dt className="text-text-secondary text-xs">
            {t('endpointAdmin.drawer.diagnostics.lastError.summary')}
          </dt>
          {/* Codex 019e833d must_fix #2 + #8: plain-text only. Render
              `summary` via React children so any markup-like content is
              escaped, NEVER via dangerouslySetInnerHTML. */}
          <dd data-testid="diagnostics-last-error-summary" className="whitespace-pre-wrap">
            {summary}
          </dd>
        </div>
      </dl>
    </section>
  );
};

interface ProbeErrorsPanelProps {
  snapshot: DiagnosticsSnapshot;
  t: (key: string) => string;
}

const ProbeErrorsPanel: React.FC<ProbeErrorsPanelProps> = ({ snapshot, t }) => {
  if (!snapshot.probeErrors || snapshot.probeErrors.length === 0) {
    return (
      <section className="space-y-2" data-testid="diagnostics-probe-errors-empty">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          {t('endpointAdmin.drawer.diagnostics.probeErrors.heading')}
        </h4>
        <p className="text-sm text-text-secondary">
          {t('endpointAdmin.drawer.diagnostics.probeErrors.empty')}
        </p>
      </section>
    );
  }
  return (
    <section className="space-y-2" data-testid="diagnostics-probe-errors">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
        {t('endpointAdmin.drawer.diagnostics.probeErrors.heading')}
      </h4>
      <div className="rounded-md border border-border-default overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-text-secondary text-xs">
            <tr>
              <th className="text-left px-3 py-2 w-12">
                {t('endpointAdmin.drawer.diagnostics.probeErrors.col.rowOrdinal')}
              </th>
              <th className="text-left px-3 py-2 w-40">
                {t('endpointAdmin.drawer.diagnostics.probeErrors.col.code')}
              </th>
              <th className="text-left px-3 py-2">
                {t('endpointAdmin.drawer.diagnostics.probeErrors.col.summary')}
              </th>
            </tr>
          </thead>
          <tbody>
            {snapshot.probeErrors.map((err) => (
              <tr
                key={err.rowOrdinal}
                className="border-t border-border-subtle"
                data-testid={`diagnostics-probe-error-row-${err.rowOrdinal}`}
              >
                <td className="px-3 py-2 font-mono text-xs">{err.rowOrdinal}</td>
                {/* Plain text only — see lastError-summary note above. */}
                <td className="px-3 py-2 font-mono text-xs">{err.code}</td>
                <td className="px-3 py-2 whitespace-pre-wrap">{err.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export const DiagnosticsView: React.FC<DiagnosticsViewProps> = ({ deviceId, active }) => {
  const { t } = useEndpointAdminI18n();

  // Codex 019e833d must_fix #5 + WEB-014D-followup (Codex 019e830b
  // precedent): use `currentData` instead of `data` so a leftover
  // response from a previously-selected device cannot leak into the
  // active intent's render. `data` (last-successful) is intentionally
  // not destructured here — `currentData` is the arg-anchored truth.
  const {
    currentData: snapshot,
    error,
    isLoading,
  } = useGetDiagnosticsLatestQuery({ deviceId }, { skip: !active });

  if (!active) return null;

  if (isLoading) {
    return (
      <div className="px-6 py-4" data-testid="diagnostics-loading">
        <p className="text-sm text-text-secondary">
          {t('endpointAdmin.drawer.diagnostics.loading')}
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
      <div className="px-6 py-4" data-testid="diagnostics-forbidden">
        <p className="text-sm text-text-secondary">
          {t('endpointAdmin.drawer.diagnostics.forbidden')}
        </p>
      </div>
    );
  }

  if (status === 404) {
    return (
      <div className="px-6 py-4" data-testid="diagnostics-empty">
        <p className="text-sm text-text-secondary">{t('endpointAdmin.drawer.diagnostics.empty')}</p>
      </div>
    );
  }

  if (error && !snapshot) {
    return (
      <div className="px-6 py-4" data-testid="diagnostics-error">
        <p className="text-sm text-state-danger-text">
          {t('endpointAdmin.drawer.diagnostics.error')}
        </p>
      </div>
    );
  }

  if (!snapshot) {
    // No data, no error, not loading — RTK transient gap (e.g.
    // post-invalidation refetch). Render nothing rather than a flash.
    return null;
  }

  // Codex 019e833d must_fix #5: stale-arg guard. RTK Query keeps the
  // last successful `data` across arg changes; `currentData` snaps to
  // `undefined` while the new args resolve. We already use `currentData`
  // above, so this branch fires only on the rare case where the cache
  // is mis-tagged (defence-in-depth + a visible diagnostic for ops).
  if (!isDiagnosticsForDevice(snapshot, deviceId)) {
    return (
      <div className="px-6 py-4" data-testid="diagnostics-stale-arg">
        <p className="text-sm text-state-warning-text">
          {t('endpointAdmin.drawer.diagnostics.staleArg')}
        </p>
      </div>
    );
  }

  // supported=false → render unsupported-state notice, NOT empty/healthy.
  if (snapshot.supported === false) {
    return (
      <div className="px-6 py-4 space-y-4" data-testid="diagnostics-unsupported">
        <p className="text-sm text-text-secondary">
          {t('endpointAdmin.drawer.diagnostics.unsupported')}
        </p>
        {/* Even when unsupported, render the agent meta panel so the
            operator can see WHICH agent version reported "not supported"
            — useful for debugging cross-platform expansion. */}
        <AgentMetaPanel snapshot={snapshot} t={t} />
      </div>
    );
  }

  const fullyEvaluable = isDiagnosticsFullyEvaluable(snapshot);

  return (
    <div
      className="px-6 py-4 space-y-6"
      data-testid="diagnostics-view"
      data-fully-evaluable={fullyEvaluable ? 'true' : 'false'}
    >
      <header>
        <h3 className="text-base font-semibold text-text-primary">
          {t('endpointAdmin.drawer.diagnostics.title')}
        </h3>
        <p className="text-xs text-text-secondary">
          {t('endpointAdmin.drawer.diagnostics.subtitle')}
        </p>
      </header>

      {/* Agent meta always renders — agentVersion / configHash /
          collectedAt are safe even when probeComplete is false. */}
      <AgentMetaPanel snapshot={snapshot} t={t} />

      {/* Fail-closed: probeComplete=false hides connectivity badges so
          the view NEVER reads as "agent healthy" on partial data. The
          incomplete notice + probeErrors below explain why. */}
      {fullyEvaluable ? (
        <ConnectivityPanel snapshot={snapshot} t={t} />
      ) : (
        <p
          className="text-sm text-state-warning-text border-l-4 border-state-warning-border pl-3 py-1"
          data-testid="diagnostics-incomplete"
        >
          {t('endpointAdmin.drawer.diagnostics.incomplete')}
        </p>
      )}

      <LastErrorPanel snapshot={snapshot} t={t} />

      <ProbeErrorsPanel snapshot={snapshot} t={t} />
    </div>
  );
};

DiagnosticsView.displayName = 'DiagnosticsView';
