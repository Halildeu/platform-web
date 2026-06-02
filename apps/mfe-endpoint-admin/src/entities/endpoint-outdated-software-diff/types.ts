/**
 * WEB outdated-software diff entity types — Faz 22.5 P2-A slice-3b
 * BE-024b (backend MERGED, LIVE testai; this file is the missing
 * web link).
 *
 * Mirrors backend DTO names verbatim
 * (AdminOutdatedSoftwareDiffResponse + AdminOutdatedSoftwareDiffEntryResponse,
 * platform-backend endpoint-admin-service). No mapping layer needed.
 *
 * Backend contract source of truth:
 * - GET /api/v1/admin/endpoint-devices/{deviceId}/outdated-software/diff
 * - Always 200 (no-existence-leak: NO_HISTORY also returned for
 *   unknown / cross-tenant device — mirrors BE-024 / BE-025 discipline)
 * - 4-status DiffStatus enum (OK / NO_CHANGE / INSUFFICIENT_HISTORY /
 *   NO_HISTORY) — UI MUST render distinct states
 * - 4 ChangeType lists (added / removed / versionChanged /
 *   availableVersionBumped); VERSION_CHANGED entry carries BOTH
 *   installed AND available deltas (NOT duplicated to
 *   availableVersionBumped)
 *
 * Security invariant (do NOT widen — redaction boundary):
 * - Per entry: EXACTLY {packageId, fromInstalledVersion,
 *   toInstalledVersion, fromAvailableVersion, toAvailableVersion,
 *   changeType}. NO displayName / publisher / install log /
 *   uninstall string / MSI GUID.
 * - packageId is the CANONICAL winget identity (NOT the synthetic
 *   appKey BE-024 uses — outdated-software and software-inventory
 *   are different truth axes, Codex 019e8542 absorb).
 * - fromInstalledVersion null for ADDED; toInstalledVersion null for
 *   REMOVED; null fallback "—" in the UI.
 *
 * Wire shape additions require an explicit backend contract bump.
 */

/**
 * Change-type enum — mirrors backend
 * AdminOutdatedSoftwareDiffEntryResponse.ChangeType verbatim.
 *
 * Precedence (Codex 019e8542 iter-2 absorb):
 * - ADDED: packageId in latest, absent in previous
 * - REMOVED: packageId in previous, absent in latest
 * - VERSION_CHANGED: same packageId, installedVersion delta (entry
 *   carries BOTH installed AND available deltas on the wire; NOT
 *   duplicated to availableVersionBumped)
 * - AVAILABLE_VERSION_BUMPED: same packageId, installed unchanged,
 *   availableVersion delta
 */
export type OutdatedSoftwareDiffChangeType =
  | 'ADDED'
  | 'REMOVED'
  | 'VERSION_CHANGED'
  | 'AVAILABLE_VERSION_BUMPED';

export interface OutdatedSoftwareDiffEntry {
  /** Canonical winget packageId (NOT a synthetic appKey). */
  packageId: string;
  /** Previous capture's installed version; `null` for ADDED. */
  fromInstalledVersion: string | null;
  /** Latest capture's installed version; `null` for REMOVED. */
  toInstalledVersion: string | null;
  /** Previous capture's available version; `null` for ADDED. */
  fromAvailableVersion: string | null;
  /** Latest capture's available version; `null` for REMOVED. */
  toAvailableVersion: string | null;
  changeType: OutdatedSoftwareDiffChangeType;
}

/**
 * 4-status enum — UI MUST render distinct states so operators can tell
 * "no baseline yet" apart from "two snapshots identical" apart from
 * "device never reported outdated-software".
 */
export type OutdatedSoftwareDiffStatus = 'OK' | 'NO_CHANGE' | 'INSUFFICIENT_HISTORY' | 'NO_HISTORY';

export interface OutdatedSoftwareDiffSnapshot {
  deviceId: string;
  status: OutdatedSoftwareDiffStatus;
  fromSnapshotId: string | null;
  toSnapshotId: string | null;
  fromCollectedAt: string | null; // ISO-8601
  toCollectedAt: string | null;
  fromUpgradeCount: number | null;
  toUpgradeCount: number | null;
  /**
   * Single-source truncation hint computed at the backend via
   * OutdatedSnapshotTruncation.isPossiblyTruncated() —
   * upgradeTruncated OR upgradeCount >= maxUpgrade. UI MUST surface
   * this distinct from "no data" so the operator knows the list may
   * be incomplete (Codex 019e8542 iter-3 P1 absorb).
   */
  fromPossiblyTruncated: boolean | null;
  toPossiblyTruncated: boolean | null;
  added: OutdatedSoftwareDiffEntry[];
  removed: OutdatedSoftwareDiffEntry[];
  versionChanged: OutdatedSoftwareDiffEntry[];
  availableVersionBumped: OutdatedSoftwareDiffEntry[];
}

/**
 * Helper: stale-arg guard mirrors AG-038..AG-041 + BE-024 + BE-025
 * precedent.
 */
export function isOutdatedSoftwareDiffForDevice(
  snapshot: OutdatedSoftwareDiffSnapshot | null | undefined,
  deviceId: string,
): snapshot is OutdatedSoftwareDiffSnapshot {
  if (!snapshot) return false;
  return snapshot.deviceId === deviceId;
}

/**
 * Helper: total entry count across the four lists.
 */
export function totalOutdatedDiffEntries(
  snapshot: OutdatedSoftwareDiffSnapshot | null | undefined,
): number {
  if (!snapshot) return 0;
  return (
    (snapshot.added?.length ?? 0) +
    (snapshot.removed?.length ?? 0) +
    (snapshot.versionChanged?.length ?? 0) +
    (snapshot.availableVersionBumped?.length ?? 0)
  );
}
