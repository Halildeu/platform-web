import React from 'react';

import { useGetOutdatedSoftwareDiffQuery } from '../../../../app/services/endpointAdminApi';
import type {
  OutdatedSoftwareDiffEntry,
  OutdatedSoftwareDiffSnapshot,
} from '../../../../entities/endpoint-outdated-software-diff/types';
import {
  isOutdatedSoftwareDiffForDevice,
  totalOutdatedDiffEntries,
} from '../../../../entities/endpoint-outdated-software-diff/types';
import { useEndpointAdminI18n } from '../../../../i18n';

/**
 * WEB Outdated-Software diff view — Faz 22.5 P2-A slice-3b BE-024b
 * (backend MERGED + LIVE testai; this file is the missing web link).
 *
 * Mirrors AG-038..AG-041 + BE-024 + BE-025 precedents:
 * - `currentData`-anchored snapshot + `isForDevice` stale guard
 * - `if (error) ...` cuts BEFORE the `!snapshot` fall-through
 * - 4-status enum DISTINCT render (NEVER collapse NO_CHANGE /
 *   INSUFFICIENT_HISTORY / NO_HISTORY into a single "no data" state
 *   — operator needs to tell "evaluator ran, no delta" apart from
 *   "no baseline yet" apart from "device never reported")
 * - Plain-text XSS guards (React text-escape) on every operator-
 *   visible string field
 *
 * Read-only "Güncel Olmayan Değişimler" tab. Backend endpoint:
 *   /api/v1/endpoint-admin/endpoint-devices/{deviceId}/outdated-software/diff
 *
 * Render contract:
 * - Status badge (4-tone): OK populated=success, OK empty=neutral,
 *   NO_CHANGE=success, INSUFFICIENT_HISTORY=warn, NO_HISTORY=neutral
 * - Capture-window header: fromCollectedAt → toCollectedAt with
 *   upgradeCount + possiblyTruncated badge when truncation hint set
 * - Counts row: added / removed / versionChanged /
 *   availableVersionBumped
 * - 4 hidden-when-empty tables (added / removed / versionChanged /
 *   availableVersionBumped); each renders packageId + relevant
 *   version columns
 *
 * Redaction boundary: only contract-allowed scalars + enum values.
 * packageId is the CANONICAL winget identity (NOT a synthetic
 * appKey — outdated-software and software-inventory are different
 * truth axes per Codex 019e8542).
 */
export interface OutdatedSoftwareDiffViewProps {
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

function formatCount(value: number | null | undefined): string {
  if (value == null) return '—';
  return String(value);
}

export const OutdatedSoftwareDiffView: React.FC<OutdatedSoftwareDiffViewProps> = ({
  deviceId,
  active,
}) => {
  const { t } = useEndpointAdminI18n();

  const { currentData, isLoading, error } = useGetOutdatedSoftwareDiffQuery(
    { deviceId },
    { skip: !active || !deviceId },
  );

  const snapshot: OutdatedSoftwareDiffSnapshot | undefined = currentData;

  if (!active) return null;

  if (isLoading) {
    return (
      <div
        className="outdated-software-diff-view outdated-software-diff-view--loading"
        data-testid="outdated-software-diff-view-loading"
      >
        {t('endpointAdmin.drawer.outdatedSoftwareDiff.loading')}
      </div>
    );
  }

  if (error) {
    const status = (error as { status?: number | string }).status;
    if (status === 403) {
      return (
        <div
          className="outdated-software-diff-view outdated-software-diff-view--forbidden"
          data-testid="outdated-software-diff-view-forbidden"
        >
          {t('endpointAdmin.drawer.outdatedSoftwareDiff.forbidden')}
        </div>
      );
    }
    return (
      <div
        className="outdated-software-diff-view outdated-software-diff-view--error"
        data-testid="outdated-software-diff-view-error"
      >
        {t('endpointAdmin.drawer.outdatedSoftwareDiff.error')}
      </div>
    );
  }

  if (!snapshot) {
    return null;
  }

  if (!isOutdatedSoftwareDiffForDevice(snapshot, deviceId)) {
    return (
      <div
        className="outdated-software-diff-view outdated-software-diff-view--stale"
        data-testid="outdated-software-diff-view-stale"
      >
        {t('endpointAdmin.drawer.outdatedSoftwareDiff.staleWarning')}
      </div>
    );
  }

  const totalEntries = totalOutdatedDiffEntries(snapshot);
  const statusKey = `endpointAdmin.drawer.outdatedSoftwareDiff.status.${snapshot.status}` as const;
  const statusTone =
    snapshot.status === 'OK'
      ? totalEntries > 0
        ? 'success'
        : 'neutral'
      : snapshot.status === 'NO_CHANGE'
        ? 'success'
        : snapshot.status === 'INSUFFICIENT_HISTORY'
          ? 'warn'
          : 'neutral';

  return (
    <section
      className="outdated-software-diff-view"
      data-testid="outdated-software-diff-view"
      data-status={snapshot.status}
      data-total-entries={String(totalEntries)}
    >
      <header
        className="outdated-software-diff-view__header"
        data-testid="outdated-software-diff-view-header"
      >
        <span
          className={`badge badge--${statusTone}`}
          data-testid="outdated-software-diff-view-status-badge"
        >
          {t(statusKey)}
        </span>
        <dl className="outdated-software-diff-view__capture-window">
          <dt>{t('endpointAdmin.drawer.outdatedSoftwareDiff.window.from')}</dt>
          <dd data-testid="outdated-software-diff-view-from-captured-at">
            {formatTimestamp(snapshot.fromCollectedAt)} ({formatCount(snapshot.fromUpgradeCount)}
            {snapshot.fromPossiblyTruncated === true ? '*' : ''})
          </dd>
          <dt>{t('endpointAdmin.drawer.outdatedSoftwareDiff.window.to')}</dt>
          <dd data-testid="outdated-software-diff-view-to-captured-at">
            {formatTimestamp(snapshot.toCollectedAt)} ({formatCount(snapshot.toUpgradeCount)}
            {snapshot.toPossiblyTruncated === true ? '*' : ''})
          </dd>
        </dl>
        {(snapshot.fromPossiblyTruncated === true || snapshot.toPossiblyTruncated === true) && (
          <p
            className="outdated-software-diff-view__truncation-hint"
            data-testid="outdated-software-diff-view-truncation-hint"
          >
            {t('endpointAdmin.drawer.outdatedSoftwareDiff.truncation.notice')}
          </p>
        )}
      </header>

      <section
        className="outdated-software-diff-view__counts"
        data-testid="outdated-software-diff-view-counts"
      >
        <span data-testid="outdated-software-diff-view-count-added">
          {t('endpointAdmin.drawer.outdatedSoftwareDiff.counts.added')}: {snapshot.added.length}
        </span>
        <span data-testid="outdated-software-diff-view-count-removed">
          {t('endpointAdmin.drawer.outdatedSoftwareDiff.counts.removed')}: {snapshot.removed.length}
        </span>
        <span data-testid="outdated-software-diff-view-count-version-changed">
          {t('endpointAdmin.drawer.outdatedSoftwareDiff.counts.versionChanged')}:{' '}
          {snapshot.versionChanged.length}
        </span>
        <span data-testid="outdated-software-diff-view-count-available-version-bumped">
          {t('endpointAdmin.drawer.outdatedSoftwareDiff.counts.availableVersionBumped')}:{' '}
          {snapshot.availableVersionBumped.length}
        </span>
      </section>

      {snapshot.added.length > 0 && (
        <SimpleEntryTable
          testIdPrefix="outdated-software-diff-view-added"
          title={t('endpointAdmin.drawer.outdatedSoftwareDiff.added.title')}
          colPackageLabel={t('endpointAdmin.drawer.outdatedSoftwareDiff.col.packageId')}
          colInstalledLabel={t('endpointAdmin.drawer.outdatedSoftwareDiff.col.toInstalled')}
          colAvailableLabel={t('endpointAdmin.drawer.outdatedSoftwareDiff.col.toAvailable')}
          entries={snapshot.added}
          installedExtractor={(e) => e.toInstalledVersion}
          availableExtractor={(e) => e.toAvailableVersion}
        />
      )}

      {snapshot.removed.length > 0 && (
        <SimpleEntryTable
          testIdPrefix="outdated-software-diff-view-removed"
          title={t('endpointAdmin.drawer.outdatedSoftwareDiff.removed.title')}
          colPackageLabel={t('endpointAdmin.drawer.outdatedSoftwareDiff.col.packageId')}
          colInstalledLabel={t('endpointAdmin.drawer.outdatedSoftwareDiff.col.fromInstalled')}
          colAvailableLabel={t('endpointAdmin.drawer.outdatedSoftwareDiff.col.fromAvailable')}
          entries={snapshot.removed}
          installedExtractor={(e) => e.fromInstalledVersion}
          availableExtractor={(e) => e.fromAvailableVersion}
        />
      )}

      {snapshot.versionChanged.length > 0 && (
        <DoubleEntryTable
          testIdPrefix="outdated-software-diff-view-version-changed"
          title={t('endpointAdmin.drawer.outdatedSoftwareDiff.versionChanged.title')}
          colPackageLabel={t('endpointAdmin.drawer.outdatedSoftwareDiff.col.packageId')}
          colFromInstalledLabel={t('endpointAdmin.drawer.outdatedSoftwareDiff.col.fromInstalled')}
          colToInstalledLabel={t('endpointAdmin.drawer.outdatedSoftwareDiff.col.toInstalled')}
          colFromAvailableLabel={t('endpointAdmin.drawer.outdatedSoftwareDiff.col.fromAvailable')}
          colToAvailableLabel={t('endpointAdmin.drawer.outdatedSoftwareDiff.col.toAvailable')}
          entries={snapshot.versionChanged}
        />
      )}

      {snapshot.availableVersionBumped.length > 0 && (
        <DoubleEntryTable
          testIdPrefix="outdated-software-diff-view-available-version-bumped"
          title={t('endpointAdmin.drawer.outdatedSoftwareDiff.availableVersionBumped.title')}
          colPackageLabel={t('endpointAdmin.drawer.outdatedSoftwareDiff.col.packageId')}
          colFromInstalledLabel={t('endpointAdmin.drawer.outdatedSoftwareDiff.col.installed')}
          colToInstalledLabel={t('endpointAdmin.drawer.outdatedSoftwareDiff.col.installed')}
          colFromAvailableLabel={t('endpointAdmin.drawer.outdatedSoftwareDiff.col.fromAvailable')}
          colToAvailableLabel={t('endpointAdmin.drawer.outdatedSoftwareDiff.col.toAvailable')}
          entries={snapshot.availableVersionBumped}
          installedSingleColumn
        />
      )}
    </section>
  );
};

interface SimpleEntryTableProps {
  testIdPrefix: string;
  title: string;
  colPackageLabel: string;
  colInstalledLabel: string;
  colAvailableLabel: string;
  entries: OutdatedSoftwareDiffEntry[];
  installedExtractor: (e: OutdatedSoftwareDiffEntry) => string | null;
  availableExtractor: (e: OutdatedSoftwareDiffEntry) => string | null;
}

function SimpleEntryTable({
  testIdPrefix,
  title,
  colPackageLabel,
  colInstalledLabel,
  colAvailableLabel,
  entries,
  installedExtractor,
  availableExtractor,
}: SimpleEntryTableProps): JSX.Element {
  return (
    <section className="outdated-software-diff-view__table" data-testid={testIdPrefix}>
      <h4>{title}</h4>
      <table className="w-full text-sm [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium [&_td]:px-3 [&_td]:py-2 [&_td]:align-top">
        <thead>
          <tr>
            <th>{colPackageLabel}</th>
            <th>{colInstalledLabel}</th>
            <th>{colAvailableLabel}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr
              key={e.packageId}
              data-testid={`${testIdPrefix}-row-${e.packageId}`}
              data-package-id={e.packageId}
            >
              <td>{e.packageId}</td>
              <td>{installedExtractor(e) ?? '—'}</td>
              <td>{availableExtractor(e) ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

interface DoubleEntryTableProps {
  testIdPrefix: string;
  title: string;
  colPackageLabel: string;
  colFromInstalledLabel: string;
  colToInstalledLabel: string;
  colFromAvailableLabel: string;
  colToAvailableLabel: string;
  entries: OutdatedSoftwareDiffEntry[];
  installedSingleColumn?: boolean;
}

function DoubleEntryTable({
  testIdPrefix,
  title,
  colPackageLabel,
  colFromInstalledLabel,
  colToInstalledLabel,
  colFromAvailableLabel,
  colToAvailableLabel,
  entries,
  installedSingleColumn,
}: DoubleEntryTableProps): JSX.Element {
  return (
    <section className="outdated-software-diff-view__table" data-testid={testIdPrefix}>
      <h4>{title}</h4>
      <table className="w-full text-sm [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium [&_td]:px-3 [&_td]:py-2 [&_td]:align-top">
        <thead>
          <tr>
            <th>{colPackageLabel}</th>
            {installedSingleColumn ? (
              <th>{colFromInstalledLabel}</th>
            ) : (
              <>
                <th>{colFromInstalledLabel}</th>
                <th>{colToInstalledLabel}</th>
              </>
            )}
            <th>{colFromAvailableLabel}</th>
            <th>{colToAvailableLabel}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr
              key={e.packageId}
              data-testid={`${testIdPrefix}-row-${e.packageId}`}
              data-package-id={e.packageId}
            >
              <td>{e.packageId}</td>
              {installedSingleColumn ? (
                // installed unchanged for AVAILABLE_VERSION_BUMPED;
                // render single column from the to-side (same value).
                <td>{e.toInstalledVersion ?? e.fromInstalledVersion ?? '—'}</td>
              ) : (
                <>
                  <td>{e.fromInstalledVersion ?? '—'}</td>
                  <td>{e.toInstalledVersion ?? '—'}</td>
                </>
              )}
              <td>{e.fromAvailableVersion ?? '—'}</td>
              <td>{e.toAvailableVersion ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
