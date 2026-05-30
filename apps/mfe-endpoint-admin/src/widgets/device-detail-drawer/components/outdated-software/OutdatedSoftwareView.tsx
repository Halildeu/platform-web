import React from 'react';

import { endpointAdminApi } from '../../../../app/services/endpointAdminApi';
import type {
  OutdatedSoftwarePackage,
  OutdatedSoftwareProbeError,
  OutdatedSoftwareSnapshot,
} from '../../../../entities/endpoint-outdated-software/types';
import { useEndpointAdminI18n } from '../../../../i18n';

/**
 * WEB outdated-software view — Faz 22.5 Track C (AG-036 → backend
 * ingest → web view). Mirrors the AG-033 DeviceHealthView precedent
 * exactly (404 → empty state, currentData stale-guard, lazy history,
 * i18n via useEndpointAdminI18n).
 *
 * Read-only outdated-software surface for the selected device. Backend
 * lives at the gateway-external path
 *   /api/v1/endpoint-admin/endpoint-devices/{deviceId}/outdated-software/latest
 * which rewrites endpoint-admin→admin to the service-internal route.
 *
 * Render contract (from the wire contract
 *   schema/endpoint-outdated-software-payload-v1.schema.json @ 73f0db0f):
 *  - per-package row: packageId + installedVersion → availableVersion,
 *  - an "N upgradeable" count badge,
 *  - a "possibly truncated" hint when upgradeCount == maxUpgrade (512).
 *
 * Redaction boundary (do NOT widen): only the three contract package
 * keys render — NO display name / publisher / install location /
 * license / download URL (none exist on the wire).
 *
 * State precedence:
 *  - 403 → forbidden (lost the module:endpoint-admin can_view tuple),
 *  - 404 → empty ("no outdated-software snapshot ingested yet"),
 *  - other error → generic error,
 *  - supported=false → "probe not supported on this device",
 *  - probeComplete=false → "evidence incomplete" (fail-closed:
 *    NEVER render the (possibly empty) upgrade list as "fully up to date").
 *
 * The COLLECT_INVENTORY trigger lives in the İşlemler tab — this view
 * deliberately does not expose a button (scope boundary mirrors the
 * device-health view).
 */
export interface OutdatedSoftwareViewProps {
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

/**
 * Read the upgradeable package list from a snapshot regardless of whether
 * it arrived under the backend response key (`packages`) or the contract
 * golden-example key (`upgrade`).
 *
 * Envelope split (same shape as the AG-033 device-health #705 precedent):
 * the backend ingest folds a persistence envelope (id / deviceId /
 * collectedAt + a child `packages[]` association) around the validated
 * wire block, so the live response surfaces the list under
 * `AdminOutdatedSoftwareSnapshotResponse.packages`; the contract golden
 * examples carry the identical data under the wire key `upgrade`.
 *
 * Selection rule — packages-canonical, but mixed-payload-safe:
 *  1. `packages` is canonical for the LIVE path (the backend response is
 *     the source of truth there), so it is preferred when present.
 *  2. BUT a contradictory payload (`packages: []` + a populated `upgrade`)
 *     must NOT silently drop the populated list just because `[]` is
 *     non-nullish (the `??` trap). When exactly one of the two is
 *     non-empty, return that one — the populated list can never be
 *     dropped by an empty sibling.
 *  3. Both empty (clean snapshot) or both absent → []. Always returns an
 *     array so callers iterate unconditionally (the contract guarantees
 *     `upgrade` is never null on the wire).
 */
function readPackages(snapshot: OutdatedSoftwareSnapshot): OutdatedSoftwarePackage[] {
  const fromPackages = snapshot.packages;
  const fromUpgrade = snapshot.upgrade;

  // Mixed/contradictory guard: when exactly one source carries entries,
  // use it so a populated list is never dropped by an empty sibling.
  if (fromPackages && fromPackages.length > 0) {
    return fromPackages;
  }
  if (fromUpgrade && fromUpgrade.length > 0) {
    return fromUpgrade;
  }

  // Neither carries entries: prefer the present-but-empty key (preserves
  // "packages present" semantics) before the [] fallback.
  return fromPackages ?? fromUpgrade ?? [];
}

/**
 * Derive the "possibly truncated" signal FAIL-CLOSED. The contract rule is
 * authoritative: `upgradeCount == maxUpgrade (512)` ⇒ possibly truncated
 * (the agent parser caps at 512 before `upgradeTruncated` is evaluated, so a
 * host with >512 pending upgrades is reported with upgradeTruncated=false).
 *
 * The backend folds a computed `possiblyTruncated` boolean into the response,
 * but we do NOT trust that flag as absolute: derive the contract condition
 * locally and OR it in. This way a wrong/stale/false backend flag can never
 * SUPPRESS the hint when the count is at the cap — the hint shows whenever
 * EITHER the backend says so OR the contract condition holds.
 */
function isPossiblyTruncated(snapshot: OutdatedSoftwareSnapshot): boolean {
  return snapshot.possiblyTruncated === true || snapshot.upgradeCount === snapshot.maxUpgrade;
}

export const OutdatedSoftwareView: React.FC<OutdatedSoftwareViewProps> = ({ deviceId, active }) => {
  const { t } = useEndpointAdminI18n();
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [historyPage, setHistoryPage] = React.useState(0);

  // Device change must reset history open + page so the previous
  // device's page does not bleed across into the new view (device-health
  // must-fix precedent).
  const previousDeviceIdRef = React.useRef(deviceId);
  if (previousDeviceIdRef.current !== deviceId) {
    previousDeviceIdRef.current = deviceId;
    setHistoryOpen(false);
    setHistoryPage(0);
  }

  const latestResult = endpointAdminApi.useGetOutdatedSoftwareLatestQuery(
    { deviceId },
    { skip: !active },
  );

  // History lazy: only subscribe when the accordion is open AND the
  // tab is active (device-health history pattern).
  const historyResult = endpointAdminApi.useGetOutdatedSoftwareHistoryQuery(
    { deviceId, page: historyPage, size: HISTORY_PAGE_SIZE },
    { skip: !active || !historyOpen },
  );

  if (!active) {
    return null;
  }

  return (
    <div data-testid="outdated-software-view">
      <h3>{t('endpointAdmin.drawer.outdatedSoftware.title')}</h3>

      {renderLatestState({
        isLoading: latestResult.isLoading,
        isError: latestResult.isError ?? false,
        error: latestResult.error,
        // Stale-guard precedent: use currentData (the result for the
        // active arg) instead of data (the last successful result, which
        // can belong to a previous deviceId during a refetch). Plus an
        // explicit deviceId guard so a stale snapshot for the previous
        // device cannot render under the new drawer header. The guard
        // tolerates a snapshot without a deviceId envelope field
        // (golden-example verbatim) — only a non-null deviceId that
        // mismatches is rejected.
        snapshot:
          latestResult.currentData &&
          (latestResult.currentData.deviceId == null ||
            latestResult.currentData.deviceId === deviceId)
            ? latestResult.currentData
            : null,
        t,
      })}

      <section data-testid="outdated-software-history-section" style={{ marginTop: 24 }}>
        <details
          open={historyOpen}
          onToggle={(event) => {
            const target = event.target as HTMLDetailsElement;
            setHistoryOpen(target.open);
          }}
        >
          <summary data-testid="outdated-software-history-summary">
            {t('endpointAdmin.drawer.outdatedSoftware.history.title')}
          </summary>
          {historyOpen && historyResult.isLoading && (
            <p data-testid="outdated-software-history-loading">
              {t('endpointAdmin.drawer.outdatedSoftware.loading')}
            </p>
          )}
          {historyOpen && historyResult.isError && (
            <p data-testid="outdated-software-history-error">
              {t('endpointAdmin.drawer.outdatedSoftware.error')}
            </p>
          )}
          {historyOpen && historyResult.currentData && (
            <OutdatedSoftwareHistoryPageView
              page={historyResult.currentData}
              onPageChange={setHistoryPage}
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
  snapshot: OutdatedSoftwareSnapshot | null;
  t: (key: string) => string;
}

/**
 * Strict precedence so error / empty / unsupported / incomplete
 * branches cannot co-exist with a stale snapshot panel.
 *
 * loading → error class → unsupported → incomplete → upgradeable panel.
 * The caller passes the deviceId-guarded snapshot, so on device switch
 * the new drawer renders the empty / forbidden / loading branch — never
 * the previous device's data.
 */
function renderLatestState(args: RenderLatestArgs): React.ReactNode {
  const { isLoading, isError, error, snapshot, t } = args;
  if (isLoading) {
    return (
      <p data-testid="outdated-software-loading">
        {t('endpointAdmin.drawer.outdatedSoftware.loading')}
      </p>
    );
  }
  if (isError) {
    const status = resolveStatus(error);
    if (status === 404) {
      return (
        <p data-testid="outdated-software-empty">
          {t('endpointAdmin.drawer.outdatedSoftware.empty')}
        </p>
      );
    }
    if (status === 403) {
      return (
        <p data-testid="outdated-software-forbidden">
          {t('endpointAdmin.drawer.outdatedSoftware.forbidden')}
        </p>
      );
    }
    return (
      <p data-testid="outdated-software-error">
        {t('endpointAdmin.drawer.outdatedSoftware.error')}
      </p>
    );
  }
  if (snapshot) {
    // supported=false → probe not supported on this runtime.
    if (!snapshot.supported) {
      return (
        <div data-testid="outdated-software-unsupported">
          <p>{t('endpointAdmin.drawer.outdatedSoftware.unsupported')}</p>
          {snapshot.probeErrors && snapshot.probeErrors.length > 0 && (
            <OutdatedSoftwareProbeErrorsList errors={snapshot.probeErrors} />
          )}
        </div>
      );
    }
    // probeComplete=false → evidence incomplete (fail-closed). Do NOT
    // render the (possibly empty) upgrade list as a fully-up-to-date
    // device.
    if (!snapshot.probeComplete) {
      return (
        <div data-testid="outdated-software-incomplete">
          <p>{t('endpointAdmin.drawer.outdatedSoftware.incomplete')}</p>
          {snapshot.probeErrors && snapshot.probeErrors.length > 0 && (
            <OutdatedSoftwareProbeErrorsList errors={snapshot.probeErrors} />
          )}
        </div>
      );
    }
    return <OutdatedSoftwarePanel snapshot={snapshot} />;
  }
  return null;
}

interface OutdatedSoftwarePanelProps {
  snapshot: OutdatedSoftwareSnapshot;
}

const OutdatedSoftwarePanel: React.FC<OutdatedSoftwarePanelProps> = ({ snapshot }) => {
  const packages = readPackages(snapshot);
  const possiblyTruncated = isPossiblyTruncated(snapshot);
  return (
    <div data-testid="outdated-software-panel">
      <OutdatedSoftwarePackagesList
        packages={packages}
        upgradeCount={snapshot.upgradeCount}
        possiblyTruncated={possiblyTruncated}
        maxUpgrade={snapshot.maxUpgrade}
      />

      <OutdatedSoftwareMetaRow snapshot={snapshot} />

      {snapshot.probeErrors && snapshot.probeErrors.length > 0 && (
        <OutdatedSoftwareProbeErrorsList errors={snapshot.probeErrors} />
      )}
    </div>
  );
};

interface OutdatedSoftwarePackagesListProps {
  packages: OutdatedSoftwarePackage[];
  upgradeCount: number;
  possiblyTruncated: boolean;
  maxUpgrade: number;
}

const OutdatedSoftwarePackagesList: React.FC<OutdatedSoftwarePackagesListProps> = ({
  packages,
  upgradeCount,
  possiblyTruncated,
  maxUpgrade,
}) => {
  const { t } = useEndpointAdminI18n();
  return (
    <section data-testid="outdated-software-packages-section">
      <h4>
        {t('endpointAdmin.drawer.outdatedSoftware.packages.title')}
        <span
          data-testid="outdated-software-upgradeCount-badge"
          style={{
            marginLeft: 8,
            padding: '1px 6px',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            background:
              upgradeCount > 0
                ? 'var(--color-warning-soft, #fef0c7)'
                : 'var(--color-success-soft, #dcfae6)',
            color:
              upgradeCount > 0
                ? 'var(--color-warning-strong, #b54708)'
                : 'var(--color-success-strong, #067647)',
          }}
        >
          {upgradeCount} {t('endpointAdmin.drawer.outdatedSoftware.packages.upgradeable')}
        </span>
      </h4>
      {packages.length === 0 ? (
        <p data-testid="outdated-software-packages-empty">
          {t('endpointAdmin.drawer.outdatedSoftware.packages.empty')}
        </p>
      ) : (
        <table data-testid="outdated-software-packages-table">
          <thead>
            <tr>
              <th>{t('endpointAdmin.drawer.outdatedSoftware.packages.columns.packageId')}</th>
              <th>
                {t('endpointAdmin.drawer.outdatedSoftware.packages.columns.installedVersion')}
              </th>
              <th>
                {t('endpointAdmin.drawer.outdatedSoftware.packages.columns.availableVersion')}
              </th>
            </tr>
          </thead>
          <tbody>
            {packages.map((pkg) => (
              <tr
                key={pkg.packageId}
                data-testid={`outdated-software-package-row-${pkg.packageId}`}
              >
                <td data-testid={`outdated-software-package-id-${pkg.packageId}`}>
                  {pkg.packageId}
                </td>
                <td data-testid={`outdated-software-package-installed-${pkg.packageId}`}>
                  {pkg.installedVersion}
                </td>
                <td data-testid={`outdated-software-package-available-${pkg.packageId}`}>
                  {pkg.availableVersion}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {possiblyTruncated && (
        <p data-testid="outdated-software-possiblyTruncated" style={{ marginTop: 8, fontSize: 12 }}>
          {t('endpointAdmin.drawer.outdatedSoftware.packages.possiblyTruncated')} ({upgradeCount} /{' '}
          {maxUpgrade})
        </p>
      )}
    </section>
  );
};

interface OutdatedSoftwareMetaRowProps {
  snapshot: OutdatedSoftwareSnapshot;
}

const OutdatedSoftwareMetaRow: React.FC<OutdatedSoftwareMetaRowProps> = ({ snapshot }) => {
  const { t } = useEndpointAdminI18n();
  return (
    <dl
      data-testid="outdated-software-meta-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr',
        rowGap: 4,
        columnGap: 12,
        marginTop: 16,
      }}
    >
      <dt>{t('endpointAdmin.drawer.outdatedSoftware.meta.sourceUsed')}</dt>
      <dd data-testid="outdated-software-meta-sourceUsed">{snapshot.sourceUsed}</dd>
      <dt>{t('endpointAdmin.drawer.outdatedSoftware.meta.probeDuration')}</dt>
      <dd>{snapshot.probeDurationMs} ms</dd>
    </dl>
  );
};

interface OutdatedSoftwareProbeErrorsListProps {
  errors: OutdatedSoftwareProbeError[];
}

const OutdatedSoftwareProbeErrorsList: React.FC<OutdatedSoftwareProbeErrorsListProps> = ({
  errors,
}) => {
  const { t } = useEndpointAdminI18n();
  return (
    <section data-testid="outdated-software-probe-errors-section" style={{ marginTop: 16 }}>
      <h4>{t('endpointAdmin.drawer.outdatedSoftware.probeErrors.title')}</h4>
      <ul data-testid="outdated-software-probe-errors-list">
        {errors.map((error, index) => (
          <li key={`${error.code}-${index}`}>
            <strong>{error.code}</strong>
            {error.summary ? `: ${error.summary}` : ''}
          </li>
        ))}
      </ul>
    </section>
  );
};

interface OutdatedSoftwareHistoryPageViewProps {
  page: {
    content: ReadonlyArray<{
      id: string;
      collectedAt: string;
      supported: boolean;
      probeComplete: boolean;
      upgradeCount: number;
      upgradeTruncated: boolean;
      possiblyTruncated: boolean;
      packageCount: number;
      probeErrorCount: number;
    }>;
    number: number;
    size: number;
    totalElements: number;
    totalPages: number;
    empty: boolean;
  };
  onPageChange: (page: number) => void;
}

const OutdatedSoftwareHistoryPageView: React.FC<OutdatedSoftwareHistoryPageViewProps> = ({
  page,
  onPageChange,
}) => {
  // Bind the indicator to the response's own page number so a stale page
  // slice cannot render under the wrong index while RTK Query refetches.
  const currentPage = page.number;
  const { t } = useEndpointAdminI18n();
  if (page.empty) {
    return (
      <p data-testid="outdated-software-history-empty">
        {t('endpointAdmin.drawer.outdatedSoftware.history.empty')}
      </p>
    );
  }
  return (
    <div data-testid="outdated-software-history-page">
      <ul data-testid="outdated-software-history-list">
        {page.content.map((row) => (
          <li key={row.id} data-testid={`outdated-software-history-row-${row.id}`}>
            <strong>{formatIsoTimestamp(row.collectedAt)}</strong> — {row.upgradeCount}{' '}
            {t('endpointAdmin.drawer.outdatedSoftware.history.upgradeableShort')}
            {!row.probeComplete &&
              ` · ${t('endpointAdmin.drawer.outdatedSoftware.history.incompleteShort')}`}
            {row.possiblyTruncated &&
              ` · ${t('endpointAdmin.drawer.outdatedSoftware.history.truncatedShort')}`}
          </li>
        ))}
      </ul>
      <div data-testid="outdated-software-history-pagination" style={{ marginTop: 8 }}>
        <button
          type="button"
          data-testid="outdated-software-history-prev"
          disabled={currentPage === 0}
          onClick={() => onPageChange(Math.max(0, currentPage - 1))}
        >
          {t('endpointAdmin.drawer.outdatedSoftware.history.prev')}
        </button>
        <span data-testid="outdated-software-history-pageinfo" style={{ margin: '0 8px' }}>
          {t('endpointAdmin.drawer.outdatedSoftware.history.pageInfo')}: {currentPage + 1} /{' '}
          {page.totalPages}
        </span>
        <button
          type="button"
          data-testid="outdated-software-history-next"
          disabled={currentPage + 1 >= page.totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          {t('endpointAdmin.drawer.outdatedSoftware.history.next')}
        </button>
      </div>
    </div>
  );
};

/** History `collectedAt` is a persistence ISO timestamp, not epoch. */
function formatIsoTimestamp(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}
