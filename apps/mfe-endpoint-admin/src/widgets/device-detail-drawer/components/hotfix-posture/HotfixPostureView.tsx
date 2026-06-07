import React from 'react';

import { endpointAdminApi } from '../../../../app/services/endpointAdminApi';
import type {
  HotfixAgentHealth,
  HotfixInstalled,
  HotfixPending,
  HotfixPendingByCategory,
  HotfixPostureSnapshot,
  HotfixPostureSnapshotSummary,
  HotfixProbeError,
  HotfixServiceState,
  HotfixSeverity,
} from '../../../../entities/endpoint-hotfix-posture/types';
import {
  isInstalledPossiblyTruncated,
  isPendingPossiblyTruncated,
} from '../../../../entities/endpoint-hotfix-posture/truncation';
import { useEndpointAdminI18n } from '../../../../i18n';

/**
 * WEB hotfix-posture view — Faz 22.5 Track C (WEB-014G; AG-037 →
 * backend ingest → web view). Mirrors the AG-036 OutdatedSoftwareView
 * + AG-033 DeviceHealthView precedents exactly (404 → empty state,
 * currentData stale-guard, render-time device-change reset, lazy history
 * accordion, i18n via useEndpointAdminI18n).
 *
 * Read-only hotfix-posture surface for the selected device. Backend
 * lives at the gateway-external path
 *   /api/v1/endpoint-admin/endpoint-devices/{deviceId}/hotfix-posture/latest
 * which rewrites endpoint-admin→admin to the service-internal route.
 *
 * Render contract (from platform-agent docs/COMMAND-CONTRACT.md §16 +
 * platform-backend AG-037-be PR #354):
 * - Meta row: 3 sourceUsed (installed/pending/health) + collectedAt + duration.
 * - Installed-hotfix table: kbId + installedOn (nullable "—") + description
 *   (nullable "—") + N-installed badge + installedPossiblyTruncated hint.
 * - Pending-update table: kbIds (comma-joined monospace wrap) +
 *   primaryCategory chip + severity chip (static color-coded, no animation).
 * - Pending-by-category rollup list: full pre-truncation distribution
 *   preserved when per-item pending list is capped.
 * - Agent-health panel: WUA + BITS ServiceState badges +
 *   lastDetectAt + lastInstallAt + AU policy/effective tri-state +
 *   notificationLevel (AUOptions exact-string explainer or raw "(unrecognized)").
 * - Probe errors list: code + source + summary (text-only, never dangerouslySetInnerHTML).
 * - History accordion below: paginated summary list (lazy on open).
 *
 * Redaction boundary (do NOT widen): only the contract-allowed scalars
 * render — NO update title / install client / product code / supersedence
 * / install command / install account (none exist on the wire).
 *
 * State precedence (strict order — no two states overlap):
 *  - 403 → forbidden (lost module:endpoint-admin can_view tuple),
 *  - 404 → empty ("no hotfix posture snapshot ingested yet — COLLECT_INVENTORY
 *    includeHotfixPosture:true gerekli; İşlemler tab'ı"),
 *  - other error → generic error,
 *  - supported=false → "probe not supported on this device" (non-Windows runtime),
 *  - probeComplete=false → "evidence incomplete" (fail-closed —
 *    NEVER render the (possibly empty) installed/pending lists as
 *    "fully patched / no pending updates"),
 *  - full render.
 *
 * The COLLECT_INVENTORY trigger lives in the İşlemler tab — this view
 * deliberately does not expose a button (scope boundary mirrors the
 * device-health + outdated-software views).
 */
export interface HotfixPostureViewProps {
  deviceId: string;
  active: boolean;
}

const HISTORY_PAGE_SIZE = 20;

function resolveStatus(error: unknown): number | null {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: unknown }).status;
    if (typeof status === 'number') return status;
    if (typeof status === 'string') {
      const parsed = Number(status);
      return Number.isFinite(parsed) ? parsed : null;
    }
  }
  return null;
}

export const HotfixPostureView: React.FC<HotfixPostureViewProps> = ({ deviceId, active }) => {
  const { t } = useEndpointAdminI18n();
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [historyPage, setHistoryPage] = React.useState(0);

  // Render-time device-change reset (Codex 019e8245 iter-3 P1.1):
  // useEffect would let one render pass with stale historyOpen/page
  // subscribe to the new deviceId; the ref guard resets BEFORE the
  // history hook subscription resolves. Mirror OutdatedSoftwareView
  // line 145.
  const previousDeviceIdRef = React.useRef(deviceId);
  if (previousDeviceIdRef.current !== deviceId) {
    previousDeviceIdRef.current = deviceId;
    setHistoryOpen(false);
    setHistoryPage(0);
  }

  const latestResult = endpointAdminApi.useGetHotfixPostureLatestQuery(
    { deviceId },
    { skip: !active },
  );

  // History lazy: only subscribe when the accordion is open AND the tab
  // is active (accordion-gated, NOT tab-activation-gated — RTK cache
  // hit acceptable across tab switches per Codex 019e8245 iter-2 P1.5).
  const historyResult = endpointAdminApi.useGetHotfixPostureHistoryQuery(
    { deviceId, page: historyPage, size: HISTORY_PAGE_SIZE },
    { skip: !active || !historyOpen },
  );

  if (!active) {
    return null;
  }

  return (
    <div data-testid="hotfix-posture-view">
      <h3>{t('endpointAdmin.drawer.hotfixPosture.title')}</h3>

      {renderLatestState({
        isLoading: latestResult.isLoading,
        isError: latestResult.isError ?? false,
        error: latestResult.error,
        // Stale-guard precedent: use currentData (the result for the
        // active arg), plus an explicit deviceId guard so a stale
        // snapshot for the previous device cannot render under the new
        // drawer header.
        snapshot:
          latestResult.currentData &&
          (latestResult.currentData.deviceId == null ||
            latestResult.currentData.deviceId === deviceId)
            ? latestResult.currentData
            : null,
        t,
      })}

      <section data-testid="hotfix-posture-history-section" style={{ marginTop: 24 }}>
        <details
          open={historyOpen}
          onToggle={(event) => {
            const target = event.target as HTMLDetailsElement;
            setHistoryOpen(target.open);
          }}
        >
          <summary data-testid="hotfix-posture-history-summary">
            {t('endpointAdmin.drawer.hotfixPosture.history.title')}
          </summary>
          {historyOpen && historyResult.isLoading && (
            <p data-testid="hotfix-posture-history-loading">
              {t('endpointAdmin.drawer.hotfixPosture.loading')}
            </p>
          )}
          {historyOpen && historyResult.isError && (
            <p data-testid="hotfix-posture-history-error">
              {t('endpointAdmin.drawer.hotfixPosture.error')}
            </p>
          )}
          {historyOpen && historyResult.currentData && (
            <HotfixPostureHistoryPageView
              page={historyResult.currentData}
              onPageChange={setHistoryPage}
              t={t}
            />
          )}
        </details>
      </section>
    </div>
  );
};

interface RenderLatestArgs {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  snapshot: HotfixPostureSnapshot | null;
  t: (key: string) => string;
}

/**
 * Strict precedence so error / empty / unsupported / incomplete branches
 * cannot co-exist with a stale snapshot panel.
 *
 * loading → error class → unsupported → incomplete → full panel.
 * `supported=false` wins over `probeComplete=false` (non-Windows runtime
 * cannot have a meaningful probeComplete signal anyway — Codex 019e8245
 * iter-1 acceptance).
 */
function renderLatestState(args: RenderLatestArgs): React.ReactNode {
  const { isLoading, isError, error, snapshot, t } = args;
  if (isLoading) {
    return (
      <p data-testid="hotfix-posture-loading">{t('endpointAdmin.drawer.hotfixPosture.loading')}</p>
    );
  }
  if (isError) {
    const status = resolveStatus(error);
    if (status === 404) {
      return (
        <p data-testid="hotfix-posture-empty">{t('endpointAdmin.drawer.hotfixPosture.empty')}</p>
      );
    }
    if (status === 403) {
      return (
        <p data-testid="hotfix-posture-forbidden">
          {t('endpointAdmin.drawer.hotfixPosture.forbidden')}
        </p>
      );
    }
    return (
      <p data-testid="hotfix-posture-error">{t('endpointAdmin.drawer.hotfixPosture.error')}</p>
    );
  }
  if (snapshot) {
    if (!snapshot.supported) {
      return (
        <div data-testid="hotfix-posture-unsupported">
          <p>{t('endpointAdmin.drawer.hotfixPosture.unsupported')}</p>
          {(snapshot.probeErrors ?? []).length > 0 && (
            <HotfixProbeErrorsList errors={snapshot.probeErrors ?? []} t={t} />
          )}
        </div>
      );
    }
    if (!snapshot.probeComplete) {
      return (
        <div data-testid="hotfix-posture-incomplete">
          <p>{t('endpointAdmin.drawer.hotfixPosture.incomplete')}</p>
          {(snapshot.probeErrors ?? []).length > 0 && (
            <HotfixProbeErrorsList errors={snapshot.probeErrors ?? []} t={t} />
          )}
        </div>
      );
    }
    return <HotfixPosturePanel snapshot={snapshot} t={t} />;
  }
  return null;
}

interface PanelProps {
  snapshot: HotfixPostureSnapshot;
  t: (key: string) => string;
}

const HotfixPosturePanel: React.FC<PanelProps> = ({ snapshot, t }) => {
  const installed = snapshot.installedHotfixes ?? [];
  const pending = snapshot.pendingUpdates ?? [];
  const pendingByCategory = snapshot.pendingByCategory ?? [];
  const installedTruncated = isInstalledPossiblyTruncated(snapshot);
  const pendingTruncated = isPendingPossiblyTruncated(snapshot);
  return (
    <div data-testid="hotfix-posture-panel">
      <HotfixMetaRow snapshot={snapshot} t={t} />

      <HotfixInstalledTable
        installed={installed}
        installedCount={snapshot.installedCount}
        possiblyTruncated={installedTruncated}
        maxInstalled={snapshot.maxInstalled}
        t={t}
      />

      <HotfixPendingTable
        pending={pending}
        pendingTotalCount={snapshot.pendingTotalCount}
        possiblyTruncated={pendingTruncated}
        maxPending={snapshot.maxPending}
        t={t}
      />

      {pendingByCategory.length > 0 && (
        <HotfixPendingByCategoryList categories={pendingByCategory} t={t} />
      )}

      <HotfixAgentHealthPanel agentHealth={snapshot.agentHealth} t={t} />

      {(snapshot.probeErrors ?? []).length > 0 && (
        <HotfixProbeErrorsList errors={snapshot.probeErrors ?? []} t={t} />
      )}
    </div>
  );
};

const HotfixMetaRow: React.FC<{ snapshot: HotfixPostureSnapshot; t: (k: string) => string }> = ({
  snapshot,
  t,
}) => (
  <div data-testid="hotfix-posture-meta" className="text-xs text-text-secondary mb-3">
    <span data-testid="hotfix-posture-meta-installed-source">
      {t('endpointAdmin.drawer.hotfixPosture.meta.installedSource')}: {snapshot.installedSourceUsed}
    </span>
    {' · '}
    <span data-testid="hotfix-posture-meta-pending-source">
      {t('endpointAdmin.drawer.hotfixPosture.meta.pendingSource')}: {snapshot.pendingSourceUsed}
    </span>
    {' · '}
    <span data-testid="hotfix-posture-meta-health-source">
      {t('endpointAdmin.drawer.hotfixPosture.meta.healthSource')}: {snapshot.healthSourceUsed}
    </span>
    {' · '}
    <span data-testid="hotfix-posture-meta-collected">
      {t('endpointAdmin.drawer.hotfixPosture.meta.collectedAt')}: {snapshot.collectedAt}
    </span>
    {snapshot.probeDurationMs != null && (
      <>
        {' · '}
        <span data-testid="hotfix-posture-meta-duration">{snapshot.probeDurationMs} ms</span>
      </>
    )}
  </div>
);

interface InstalledTableProps {
  installed: HotfixInstalled[];
  installedCount: number;
  possiblyTruncated: boolean;
  maxInstalled: number;
  t: (k: string) => string;
}

const HotfixInstalledTable: React.FC<InstalledTableProps> = ({
  installed,
  installedCount,
  possiblyTruncated,
  maxInstalled,
  t,
}) => (
  <section data-testid="hotfix-posture-installed-section" style={{ marginTop: 16 }}>
    <h4>
      {t('endpointAdmin.drawer.hotfixPosture.installed.title')}
      <span data-testid="hotfix-posture-installed-count" style={{ marginLeft: 8 }}>
        ({installedCount})
      </span>
    </h4>
    {possiblyTruncated && (
      <p data-testid="hotfix-posture-installed-truncated" className="text-warning text-xs">
        {t('endpointAdmin.drawer.hotfixPosture.installed.truncated')} (max {maxInstalled})
      </p>
    )}
    {installed.length === 0 ? (
      <p data-testid="hotfix-posture-installed-empty">
        {t('endpointAdmin.drawer.hotfixPosture.installed.empty')}
      </p>
    ) : (
      <table
        data-testid="hotfix-posture-installed-table"
        className="w-full text-sm [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium [&_td]:px-3 [&_td]:py-2 [&_td]:align-top"
      >
        <thead>
          <tr>
            <th>{t('endpointAdmin.drawer.hotfixPosture.installed.col.kbId')}</th>
            <th>{t('endpointAdmin.drawer.hotfixPosture.installed.col.installedOn')}</th>
            <th>{t('endpointAdmin.drawer.hotfixPosture.installed.col.description')}</th>
          </tr>
        </thead>
        <tbody>
          {installed.map((row) => (
            <tr key={row.kbId} data-testid={`hotfix-posture-installed-row-${row.kbId}`}>
              <td>{row.kbId}</td>
              <td>{row.installedOn ?? '—'}</td>
              <td>{row.description ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </section>
);

interface PendingTableProps {
  pending: HotfixPending[];
  pendingTotalCount: number;
  possiblyTruncated: boolean;
  maxPending: number;
  t: (k: string) => string;
}

const HotfixPendingTable: React.FC<PendingTableProps> = ({
  pending,
  pendingTotalCount,
  possiblyTruncated,
  maxPending,
  t,
}) => (
  <section data-testid="hotfix-posture-pending-section" style={{ marginTop: 16 }}>
    <h4>
      {t('endpointAdmin.drawer.hotfixPosture.pending.title')}
      <span data-testid="hotfix-posture-pending-count" style={{ marginLeft: 8 }}>
        ({pendingTotalCount})
      </span>
    </h4>
    {possiblyTruncated && (
      <p data-testid="hotfix-posture-pending-truncated" className="text-warning text-xs">
        {t('endpointAdmin.drawer.hotfixPosture.pending.truncated')} (max {maxPending})
      </p>
    )}
    {pending.length === 0 ? (
      <p data-testid="hotfix-posture-pending-empty">
        {t('endpointAdmin.drawer.hotfixPosture.pending.empty')}
      </p>
    ) : (
      <table
        data-testid="hotfix-posture-pending-table"
        className="w-full text-sm [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium [&_td]:px-3 [&_td]:py-2 [&_td]:align-top"
      >
        <thead>
          <tr>
            <th>{t('endpointAdmin.drawer.hotfixPosture.pending.col.kbIds')}</th>
            <th>{t('endpointAdmin.drawer.hotfixPosture.pending.col.primaryCategory')}</th>
            <th>{t('endpointAdmin.drawer.hotfixPosture.pending.col.severity')}</th>
          </tr>
        </thead>
        <tbody>
          {pending.map((row, idx) => (
            <tr
              key={`${row.kbIds.join(',')}-${idx}`}
              data-testid={`hotfix-posture-pending-row-${idx}`}
            >
              <td
                data-testid={`hotfix-posture-pending-kbids-${idx}`}
                style={{ fontFamily: 'monospace', whiteSpace: 'normal', wordBreak: 'break-word' }}
              >
                {row.kbIds.length > 0 ? row.kbIds.join(', ') : '—'}
              </td>
              <td>
                <span
                  data-testid={`hotfix-posture-pending-category-${idx}`}
                  className={CATEGORY_BADGE_CLASS}
                >
                  {row.primaryCategory}
                </span>
              </td>
              <td>
                <span
                  data-testid={`hotfix-posture-pending-severity-${idx}`}
                  className={SEVERITY_CLASS[row.severity]}
                >
                  {row.severity}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </section>
);

/**
 * Severity design-system token map (Codex 019e8245 iter-2 P2). Static
 * tone classes (NO animate/pulse/flash). CRITICAL/IMPORTANT/MODERATE
 * use danger+warning tones; LOW + UNSPECIFIED render as muted neutral.
 */
const CHIP_BASE = 'inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold';
const SEVERITY_CLASS: Record<HotfixSeverity, string> = {
  CRITICAL: `${CHIP_BASE} bg-state-danger-subtle text-state-danger-text border-state-danger-border`,
  IMPORTANT: `${CHIP_BASE} bg-state-warning-subtle text-state-warning-text border-state-warning-border`,
  MODERATE: `${CHIP_BASE} bg-state-warning-subtle text-state-warning-text border-state-warning-border`,
  LOW: `${CHIP_BASE} bg-surface-muted text-text-secondary border-border-default`,
  UNSPECIFIED: `${CHIP_BASE} bg-surface-default text-text-secondary border-border-default`,
};

/** Category chip — neutral muted tone (categories are classifiers, not
 *  severity signals; UX should not draw the eye away from severity). */
const CATEGORY_BADGE_CLASS = `${CHIP_BASE} bg-surface-default text-text-primary border-border-default`;

/** Tri-state AU bool design-system token map (Codex 019e8245 iter-2 P2).
 *  TRUE → success (green check); FALSE → danger (red); NULL → muted. */
const TRI_STATE_BADGE = 'inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold';
const TRI_STATE_TRUE_CLASS = `${TRI_STATE_BADGE} bg-state-success-subtle text-state-success-text border-state-success-border`;
const TRI_STATE_FALSE_CLASS = `${TRI_STATE_BADGE} bg-state-danger-subtle text-state-danger-text border-state-danger-border`;
const TRI_STATE_UNKNOWN_CLASS = `${TRI_STATE_BADGE} bg-surface-muted text-text-secondary border-border-default`;

const HotfixPendingByCategoryList: React.FC<{
  categories: HotfixPendingByCategory[];
  t: (k: string) => string;
}> = ({ categories, t }) => (
  <section data-testid="hotfix-posture-by-category-section" style={{ marginTop: 16 }}>
    <h4>{t('endpointAdmin.drawer.hotfixPosture.byCategory.title')}</h4>
    <ul data-testid="hotfix-posture-by-category-list">
      {categories.map((entry) => (
        <li key={entry.category} data-testid={`hotfix-posture-by-category-${entry.category}`}>
          <span>{entry.category}</span>: <span>{entry.count}</span>
        </li>
      ))}
    </ul>
  </section>
);

/**
 * Agent-health panel — Codex 019e8245 iter-3 P1.8: agentHealth null
 * tolerated (panel renders "—" / unknown without crash). Tri-state AU
 * bools rendered independently (NOT derived). notificationLevel exact-
 * string match (no parseInt normalize).
 */
const AU_OPTIONS_LABELS: Record<string, string> = {
  '1': 'endpointAdmin.drawer.hotfixPosture.health.auOptions.1',
  '2': 'endpointAdmin.drawer.hotfixPosture.health.auOptions.2',
  '3': 'endpointAdmin.drawer.hotfixPosture.health.auOptions.3',
  '4': 'endpointAdmin.drawer.hotfixPosture.health.auOptions.4',
};

/**
 * Service-state design-system token map (Codex 019e8245 iter-2 P2).
 * RUNNING = success (green); STOPPED = danger (red); DISABLED = warning
 * (orange); UNKNOWN = muted (default secondary text). Bespoke class names
 * replaced with repo design-system tokens so colour-coding actually
 * renders.
 */
const SERVICE_STATE_BADGE = 'inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold';
const SERVICE_STATE_CLASS: Record<HotfixServiceState, string> = {
  RUNNING: `${SERVICE_STATE_BADGE} bg-state-success-subtle text-state-success-text border-state-success-border`,
  STOPPED: `${SERVICE_STATE_BADGE} bg-state-danger-subtle text-state-danger-text border-state-danger-border`,
  DISABLED: `${SERVICE_STATE_BADGE} bg-state-warning-subtle text-state-warning-text border-state-warning-border`,
  UNKNOWN: `${SERVICE_STATE_BADGE} bg-surface-muted text-text-secondary border-border-default`,
};

const HotfixAgentHealthPanel: React.FC<{
  agentHealth: HotfixAgentHealth | null;
  t: (k: string) => string;
}> = ({ agentHealth, t }) => {
  if (agentHealth == null) {
    return (
      <section data-testid="hotfix-posture-health-section" style={{ marginTop: 16 }}>
        <h4>{t('endpointAdmin.drawer.hotfixPosture.health.title')}</h4>
        <p data-testid="hotfix-posture-health-unknown">
          {t('endpointAdmin.drawer.hotfixPosture.health.unknown')}
        </p>
      </section>
    );
  }
  const notificationLevelLabel = resolveNotificationLevelLabel(agentHealth.notificationLevel, t);
  return (
    <section data-testid="hotfix-posture-health-section" style={{ marginTop: 16 }}>
      <h4>{t('endpointAdmin.drawer.hotfixPosture.health.title')}</h4>
      <dl data-testid="hotfix-posture-health-panel">
        <dt>{t('endpointAdmin.drawer.hotfixPosture.health.wua')}</dt>
        <dd>
          <span
            data-testid="hotfix-posture-health-wua"
            className={SERVICE_STATE_CLASS[agentHealth.wuaServiceState]}
          >
            {agentHealth.wuaServiceState}
          </span>
        </dd>
        <dt>{t('endpointAdmin.drawer.hotfixPosture.health.bits')}</dt>
        <dd>
          <span
            data-testid="hotfix-posture-health-bits"
            className={SERVICE_STATE_CLASS[agentHealth.bitsServiceState]}
          >
            {agentHealth.bitsServiceState}
          </span>
        </dd>
        <dt>{t('endpointAdmin.drawer.hotfixPosture.health.lastDetect')}</dt>
        <dd data-testid="hotfix-posture-health-last-detect">{agentHealth.lastDetectAt ?? '—'}</dd>
        <dt>{t('endpointAdmin.drawer.hotfixPosture.health.lastInstall')}</dt>
        <dd data-testid="hotfix-posture-health-last-install">{agentHealth.lastInstallAt ?? '—'}</dd>
        <dt>{t('endpointAdmin.drawer.hotfixPosture.health.autoUpdatePolicy')}</dt>
        <dd data-testid="hotfix-posture-health-au-policy">
          {renderTriStateBool(agentHealth.autoUpdatePolicyEnabled, t)}
        </dd>
        <dt>{t('endpointAdmin.drawer.hotfixPosture.health.autoUpdateEffective')}</dt>
        <dd data-testid="hotfix-posture-health-au-effective">
          {renderTriStateBool(agentHealth.autoUpdateEffectiveEnabled, t)}
        </dd>
        <dt>{t('endpointAdmin.drawer.hotfixPosture.health.notificationLevel')}</dt>
        <dd data-testid="hotfix-posture-health-notification-level">{notificationLevelLabel}</dd>
      </dl>
    </section>
  );
};

function renderTriStateBool(value: boolean | null, t: (k: string) => string): React.ReactNode {
  if (value === true) {
    return (
      <span className={TRI_STATE_TRUE_CLASS}>
        {t('endpointAdmin.drawer.hotfixPosture.health.enabled')}
      </span>
    );
  }
  if (value === false) {
    return (
      <span className={TRI_STATE_FALSE_CLASS}>
        {t('endpointAdmin.drawer.hotfixPosture.health.disabled')}
      </span>
    );
  }
  return (
    <span className={TRI_STATE_UNKNOWN_CLASS}>
      {t('endpointAdmin.drawer.hotfixPosture.health.unknown')}
    </span>
  );
}

/**
 * AUOptions exact-string matcher — no parseInt normalize (per Codex
 * 019e8245 iter-2 P1.8). '1'/'2'/'3'/'4' match the documented enum;
 * anything else (including '0' / '00' / '1000') renders verbatim with
 * "(unrecognized)" tooltip text appended.
 */
function resolveNotificationLevelLabel(level: string | null, t: (k: string) => string): string {
  if (level == null || level.trim() === '') {
    return t('endpointAdmin.drawer.hotfixPosture.health.unknown');
  }
  const key = AU_OPTIONS_LABELS[level];
  if (key) {
    return `${level} — ${t(key)}`;
  }
  return `${level} (${t('endpointAdmin.drawer.hotfixPosture.health.notificationLevel.unrecognized')})`;
}

const HotfixProbeErrorsList: React.FC<{
  errors: HotfixProbeError[];
  t: (k: string) => string;
}> = ({ errors, t }) => (
  <section data-testid="hotfix-posture-probe-errors-section" style={{ marginTop: 16 }}>
    <h4>{t('endpointAdmin.drawer.hotfixPosture.probeErrors.title')}</h4>
    <ul data-testid="hotfix-posture-probe-errors-list">
      {errors.map((err, idx) => (
        <li key={`${err.code}-${idx}`} data-testid={`hotfix-posture-probe-error-${idx}`}>
          <strong>{err.code}</strong>
          {err.source != null && <span> ({err.source})</span>}
          {err.summary != null && <span>: {err.summary}</span>}
        </li>
      ))}
    </ul>
  </section>
);

interface HistoryPageProps {
  page: import('../../../../entities/endpoint-hotfix-posture/types').HotfixPostureHistoryPage;
  onPageChange: (page: number) => void;
  t: (k: string) => string;
}

const HotfixPostureHistoryPageView: React.FC<HistoryPageProps> = ({ page, onPageChange, t }) => {
  if (page.empty || page.totalElements === 0) {
    return (
      <p data-testid="hotfix-posture-history-empty">
        {t('endpointAdmin.drawer.hotfixPosture.history.empty')}
      </p>
    );
  }
  return (
    <div data-testid="hotfix-posture-history-rows">
      <table
        data-testid="hotfix-posture-history-table"
        className="w-full text-sm [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium [&_td]:px-3 [&_td]:py-2 [&_td]:align-top"
      >
        <thead>
          <tr>
            <th>{t('endpointAdmin.drawer.hotfixPosture.history.col.collectedAt')}</th>
            <th>{t('endpointAdmin.drawer.hotfixPosture.history.col.installedCount')}</th>
            <th>{t('endpointAdmin.drawer.hotfixPosture.history.col.pendingTotal')}</th>
            <th>{t('endpointAdmin.drawer.hotfixPosture.history.col.probeErrors')}</th>
            <th>{t('endpointAdmin.drawer.hotfixPosture.history.col.flags')}</th>
          </tr>
        </thead>
        <tbody>
          {page.content.map((row) => (
            <HotfixPostureHistoryRow key={row.id} row={row} t={t} />
          ))}
        </tbody>
      </table>
      <nav data-testid="hotfix-posture-history-pagination" style={{ marginTop: 8 }}>
        <button
          type="button"
          data-testid="hotfix-posture-history-prev"
          disabled={page.first}
          onClick={() => onPageChange(Math.max(0, page.number - 1))}
        >
          ←
        </button>
        <span style={{ margin: '0 8px' }}>
          {page.number + 1} / {page.totalPages}
        </span>
        <button
          type="button"
          data-testid="hotfix-posture-history-next"
          disabled={page.last}
          onClick={() => onPageChange(page.number + 1)}
        >
          →
        </button>
      </nav>
    </div>
  );
};

const HotfixPostureHistoryRow: React.FC<{
  row: HotfixPostureSnapshotSummary;
  t: (k: string) => string;
}> = ({ row, t }) => {
  const installedTrunc = isInstalledPossiblyTruncated(row);
  const pendingTrunc = isPendingPossiblyTruncated(row);
  const installedChildHidden = installedTrunc && row.installedChildCount < row.installedCount;
  const pendingChildHidden = pendingTrunc && row.pendingChildCount < row.pendingTotalCount;
  return (
    <tr data-testid={`hotfix-posture-history-row-${row.id}`}>
      <td>{row.collectedAt}</td>
      <td>
        <span>{row.installedCount}</span>
        {installedChildHidden && (
          <span
            aria-label={t('endpointAdmin.drawer.hotfixPosture.history.storedAria')}
            className="text-xs text-text-secondary"
            style={{ marginLeft: 4 }}
          >
            ({row.installedChildCount} {t('endpointAdmin.drawer.hotfixPosture.history.stored')})
          </span>
        )}
      </td>
      <td>
        <span>{row.pendingTotalCount}</span>
        {pendingChildHidden && (
          <span
            aria-label={t('endpointAdmin.drawer.hotfixPosture.history.storedAria')}
            className="text-xs text-text-secondary"
            style={{ marginLeft: 4 }}
          >
            ({row.pendingChildCount} {t('endpointAdmin.drawer.hotfixPosture.history.stored')})
          </span>
        )}
      </td>
      <td>{row.probeErrorCount}</td>
      <td>
        {!row.supported && (
          <span
            className="hotfix-posture-flag-unsupported"
            data-testid={`hotfix-posture-history-flag-unsupported-${row.id}`}
          >
            {t('endpointAdmin.drawer.hotfixPosture.history.flag.unsupported')}
          </span>
        )}
        {!row.probeComplete && (
          <span
            className="hotfix-posture-flag-incomplete"
            data-testid={`hotfix-posture-history-flag-incomplete-${row.id}`}
          >
            {t('endpointAdmin.drawer.hotfixPosture.history.flag.incomplete')}
          </span>
        )}
        {installedTrunc && (
          <span
            className="hotfix-posture-flag-truncated-installed"
            data-testid={`hotfix-posture-history-flag-trunc-inst-${row.id}`}
          >
            {t('endpointAdmin.drawer.hotfixPosture.history.flag.truncatedInstalled')}
          </span>
        )}
        {pendingTrunc && (
          <span
            className="hotfix-posture-flag-truncated-pending"
            data-testid={`hotfix-posture-history-flag-trunc-pend-${row.id}`}
          >
            {t('endpointAdmin.drawer.hotfixPosture.history.flag.truncatedPending')}
          </span>
        )}
      </td>
    </tr>
  );
};

// Re-export severity type for tests.
export type { HotfixSeverity };
