import React from 'react';

import { useGetSoftwareInventoryDiffQuery } from '../../../../app/services/endpointAdminApi';
import type {
  SoftwareInventoryDiffEntry,
  SoftwareInventoryDiffSnapshot,
} from '../../../../entities/endpoint-software-inventory-diff/types';
import {
  isSoftwareDiffForDevice,
  totalDiffEntries,
} from '../../../../entities/endpoint-software-inventory-diff/types';
import { useEndpointAdminI18n } from '../../../../i18n';

/**
 * WEB Software-Inventory Diff view — Faz 22.5 P2-A BE-024 (backend
 * MERGED `/software-inventory/diff` endpoint; this is the missing web
 * link that makes the operator-visible evidence loop complete).
 *
 * Mirrors the AG-038/AG-039/AG-040/AG-041 precedents:
 * - `currentData`-anchored snapshot + `isForDevice` stale guard
 * - `if (error) ...` cuts BEFORE the `!snapshot` fall-through
 * - Distinct render for each 4-status branch (NEVER collapse
 *   NO_CHANGE / INSUFFICIENT_HISTORY / NO_HISTORY into a single
 *   "no data" message — operator needs to know "no baseline yet"
 *   vs "two captures identical")
 * - Plain-text XSS guards (React text-escape) on every operator-
 *   visible string field (`displayName`, `publisher`, `fromVersion`,
 *   `toVersion`)
 * - Production-visible `data-*` attrs for operator DOM-inspection
 *
 * Read-only "Yazılım Değişimleri" tab. Backend endpoint:
 *   /api/v1/endpoint-admin/endpoint-devices/{deviceId}/software-inventory/diff
 *
 * Render contract:
 * - Status badge: OK (success-tone if any change else neutral) /
 *   NO_CHANGE (success-tone — two captures identical) /
 *   INSUFFICIENT_HISTORY (warn — only one capture yet) /
 *   NO_HISTORY (neutral — zero captures or unknown/cross-tenant
 *   device; no-existence-leak)
 * - Capture-window header: fromCapturedAt → toCapturedAt (or
 *   "—" when missing); fromAppCount → toAppCount
 * - Counts row: added / removed / versionChanged
 * - 3 tables — added (displayName + publisher + toVersion),
 *   removed (displayName + publisher + fromVersion),
 *   versionChanged (displayName + publisher + fromVersion →
 *   toVersion). Each section hidden if its list is empty.
 *
 * Redaction boundary: appKey is SHA-256 synthetic identity (NOT
 * winget packageId — UI MUST NOT label it as one). No user path,
 * install log, uninstall string, or raw MSI GUID is ever rendered
 * (fail-closed at backend ingest; UI honors the contract).
 *
 * State precedence (strict order):
 *  - active=false → null
 *  - isLoading → loading placeholder
 *  - 403 → forbidden
 *  - error (other 4xx/5xx) → cuts BEFORE snapshot fall-through
 *    (note: 404 is NOT expected — backend always returns 200 with
 *    NO_HISTORY for unknown device, per BE-024 no-existence-leak)
 *  - !snapshot → null
 *  - !isSoftwareDiffForDevice → stale-arg warning
 *  - render by status (OK / NO_CHANGE / INSUFFICIENT_HISTORY /
 *    NO_HISTORY) — each branch keeps the container visible with
 *    `data-status` attr for operator inspection
 */
export interface SoftwareDiffViewProps {
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

export const SoftwareDiffView: React.FC<SoftwareDiffViewProps> = ({ deviceId, active }) => {
  const { t } = useEndpointAdminI18n();

  const { currentData, isLoading, error } = useGetSoftwareInventoryDiffQuery(
    { deviceId },
    { skip: !active || !deviceId },
  );

  const snapshot: SoftwareInventoryDiffSnapshot | undefined = currentData;

  if (!active) return null;

  if (isLoading) {
    return (
      <div
        className="software-diff-view software-diff-view--loading"
        data-testid="software-diff-view-loading"
      >
        {t('endpointAdmin.drawer.softwareDiff.loading')}
      </div>
    );
  }

  if (error) {
    const status = (error as { status?: number | string }).status;
    if (status === 403) {
      return (
        <div
          className="software-diff-view software-diff-view--forbidden"
          data-testid="software-diff-view-forbidden"
        >
          {t('endpointAdmin.drawer.softwareDiff.forbidden')}
        </div>
      );
    }
    return (
      <div
        className="software-diff-view software-diff-view--error"
        data-testid="software-diff-view-error"
      >
        {t('endpointAdmin.drawer.softwareDiff.error')}
      </div>
    );
  }

  if (!snapshot) {
    return null;
  }

  if (!isSoftwareDiffForDevice(snapshot, deviceId)) {
    return (
      <div
        className="software-diff-view software-diff-view--stale"
        data-testid="software-diff-view-stale"
      >
        {t('endpointAdmin.drawer.softwareDiff.staleWarning')}
      </div>
    );
  }

  const totalEntries = totalDiffEntries(snapshot);
  const statusKey = `endpointAdmin.drawer.softwareDiff.status.${snapshot.status}` as const;
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
      className="software-diff-view"
      data-testid="software-diff-view"
      data-status={snapshot.status}
      data-total-entries={String(totalEntries)}
    >
      <header className="software-diff-view__header" data-testid="software-diff-view-header">
        <span
          className={`badge badge--${statusTone}`}
          data-testid="software-diff-view-status-badge"
        >
          {t(statusKey)}
        </span>
        <dl className="software-diff-view__capture-window">
          <dt>{t('endpointAdmin.drawer.softwareDiff.window.from')}</dt>
          <dd data-testid="software-diff-view-from-captured-at">
            {formatTimestamp(snapshot.fromCapturedAt)} ({formatCount(snapshot.fromAppCount)})
          </dd>
          <dt>{t('endpointAdmin.drawer.softwareDiff.window.to')}</dt>
          <dd data-testid="software-diff-view-to-captured-at">
            {formatTimestamp(snapshot.toCapturedAt)} ({formatCount(snapshot.toAppCount)})
          </dd>
        </dl>
      </header>

      <section className="software-diff-view__counts" data-testid="software-diff-view-counts">
        <span data-testid="software-diff-view-count-added">
          {t('endpointAdmin.drawer.softwareDiff.counts.added')}: {snapshot.added.length}
        </span>
        <span data-testid="software-diff-view-count-removed">
          {t('endpointAdmin.drawer.softwareDiff.counts.removed')}: {snapshot.removed.length}
        </span>
        <span data-testid="software-diff-view-count-version-changed">
          {t('endpointAdmin.drawer.softwareDiff.counts.versionChanged')}:{' '}
          {snapshot.versionChanged.length}
        </span>
      </section>

      {snapshot.added.length > 0 && (
        <DiffEntryTable
          testIdPrefix="software-diff-view-added"
          title={t('endpointAdmin.drawer.softwareDiff.added.title')}
          colVersionLabel={t('endpointAdmin.drawer.softwareDiff.col.toVersion')}
          colDisplayNameLabel={t('endpointAdmin.drawer.softwareDiff.col.displayName')}
          colPublisherLabel={t('endpointAdmin.drawer.softwareDiff.col.publisher')}
          entries={snapshot.added}
          versionExtractor={(e) => e.toVersion}
        />
      )}

      {snapshot.removed.length > 0 && (
        <DiffEntryTable
          testIdPrefix="software-diff-view-removed"
          title={t('endpointAdmin.drawer.softwareDiff.removed.title')}
          colVersionLabel={t('endpointAdmin.drawer.softwareDiff.col.fromVersion')}
          colDisplayNameLabel={t('endpointAdmin.drawer.softwareDiff.col.displayName')}
          colPublisherLabel={t('endpointAdmin.drawer.softwareDiff.col.publisher')}
          entries={snapshot.removed}
          versionExtractor={(e) => e.fromVersion}
        />
      )}

      {snapshot.versionChanged.length > 0 && (
        <VersionChangedTable
          entries={snapshot.versionChanged}
          title={t('endpointAdmin.drawer.softwareDiff.versionChanged.title')}
          colNameLabel={t('endpointAdmin.drawer.softwareDiff.col.displayName')}
          colPublisherLabel={t('endpointAdmin.drawer.softwareDiff.col.publisher')}
          colFromLabel={t('endpointAdmin.drawer.softwareDiff.col.fromVersion')}
          colToLabel={t('endpointAdmin.drawer.softwareDiff.col.toVersion')}
        />
      )}
    </section>
  );
};

interface DiffEntryTableProps {
  testIdPrefix: string;
  title: string;
  colVersionLabel: string;
  colDisplayNameLabel: string;
  colPublisherLabel: string;
  entries: SoftwareInventoryDiffEntry[];
  versionExtractor: (e: SoftwareInventoryDiffEntry) => string | null;
}

function DiffEntryTable({
  testIdPrefix,
  title,
  colVersionLabel,
  colDisplayNameLabel,
  colPublisherLabel,
  entries,
  versionExtractor,
}: DiffEntryTableProps): JSX.Element {
  return (
    <section className="software-diff-view__table" data-testid={testIdPrefix}>
      <h4>{title}</h4>
      <table className="w-full text-sm [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium [&_td]:px-3 [&_td]:py-2 [&_td]:align-top">
        <thead>
          <tr>
            <th>{colDisplayNameLabel}</th>
            <th>{colPublisherLabel}</th>
            <th>{colVersionLabel}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr
              key={e.appKey}
              data-testid={`${testIdPrefix}-row-${e.appKey.slice(0, 12)}`}
              data-app-key={e.appKey}
            >
              <td>{e.displayName}</td>
              <td>{e.publisher ?? '—'}</td>
              <td>{versionExtractor(e) ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

interface VersionChangedTableProps {
  entries: SoftwareInventoryDiffEntry[];
  title: string;
  colNameLabel: string;
  colPublisherLabel: string;
  colFromLabel: string;
  colToLabel: string;
}

function VersionChangedTable({
  entries,
  title,
  colNameLabel,
  colPublisherLabel,
  colFromLabel,
  colToLabel,
}: VersionChangedTableProps): JSX.Element {
  return (
    <section className="software-diff-view__table" data-testid="software-diff-view-version-changed">
      <h4>{title}</h4>
      <table className="w-full text-sm [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium [&_td]:px-3 [&_td]:py-2 [&_td]:align-top">
        <thead>
          <tr>
            <th>{colNameLabel}</th>
            <th>{colPublisherLabel}</th>
            <th>{colFromLabel}</th>
            <th>{colToLabel}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr
              key={e.appKey}
              data-testid={`software-diff-view-version-changed-row-${e.appKey.slice(0, 12)}`}
              data-app-key={e.appKey}
            >
              <td>{e.displayName}</td>
              <td>{e.publisher ?? '—'}</td>
              <td>{e.fromVersion ?? '—'}</td>
              <td>{e.toVersion ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
