/**
 * WEB software-inventory diff entity types — Faz 22.5 P2-A BE-024
 * (backend MERGED; this file is the missing web link).
 *
 * Mirrors backend DTO names verbatim
 * (AdminSoftwareInventoryDiffResponse + AdminSoftwareInventoryDiffEntryResponse,
 * platform-backend endpoint-admin-service). No mapping layer needed.
 *
 * Security invariant (do NOT widen — redaction boundary):
 * - Per entry: EXACTLY {appKey, displayName, publisher, fromVersion,
 *   toVersion, changeType}. No user path / install log / uninstall
 *   string / raw MSI GUID — source data fail-closed sanitized at ingest.
 * - `appKey` is a SYNTHETIC SHA-256 over
 *   `lower(displayName)|lower(publisher)|msiProductCodeHash` — NOT the
 *   winget catalog packageId. UI MUST NOT advertise it as a catalog id.
 * - `fromVersion` null for ADDED; `toVersion` null for REMOVED.
 * - 4-status enum is the canonical "why the lists are (or are not)
 *   populated" — UI MUST render distinct states (NOT collapse them).
 *
 * Wire status enum (backend source of truth: DiffStatus):
 * - `OK` — two captures compared; added/removed/versionChanged
 *   populated (any may be empty).
 * - `NO_CHANGE` — two captures compared but identical; all empty.
 * - `INSUFFICIENT_HISTORY` — exactly one capture; nothing to compare.
 * - `NO_HISTORY` — zero captures (also returned for unknown/cross-
 *   tenant device — no-existence-leak; Codex 019e75a5 (d) absorb).
 *
 * Wire shape additions require an explicit backend contract bump.
 */

/**
 * Per-app change classification. Mirrors backend
 * `SoftwareInventoryChangeType` enum verbatim.
 */
export type SoftwareInventoryChangeType = 'ADDED' | 'REMOVED' | 'VERSION_CHANGED';

export interface SoftwareInventoryDiffEntry {
  /**
   * SYNTHETIC stable identity (SHA-256 over
   * `lower(displayName)|lower(publisher)|msiProductCodeHash`).
   * Opaque from the UI's perspective; show displayName+publisher.
   */
  appKey: string;
  displayName: string;
  publisher: string | null;
  /** Previous capture's version; `null` for ADDED. */
  fromVersion: string | null;
  /** Latest capture's version; `null` for REMOVED. */
  toVersion: string | null;
  changeType: SoftwareInventoryChangeType;
}

/**
 * 4-status enum — UI MUST render distinct states so operators can
 * tell "no change" apart from "no baseline yet" and from "device
 * never reported".
 */
export type SoftwareInventoryDiffStatus =
  | 'OK'
  | 'NO_CHANGE'
  | 'INSUFFICIENT_HISTORY'
  | 'NO_HISTORY';

export interface SoftwareInventoryDiffSnapshot {
  deviceId: string;
  status: SoftwareInventoryDiffStatus;
  fromCapturedAt: string | null; // ISO-8601 — null when no prior capture
  toCapturedAt: string | null;
  fromAppCount: number | null;
  toAppCount: number | null;
  added: SoftwareInventoryDiffEntry[];
  removed: SoftwareInventoryDiffEntry[];
  versionChanged: SoftwareInventoryDiffEntry[];
}

/**
 * Helper: stale-arg guard. Mirrors AG-038/039/040/041 precedent
 * (Codex 019e830b: currentData.deviceId === active deviceId).
 */
export function isSoftwareDiffForDevice(
  snapshot: SoftwareInventoryDiffSnapshot | null | undefined,
  deviceId: string,
): snapshot is SoftwareInventoryDiffSnapshot {
  if (!snapshot) return false;
  return snapshot.deviceId === deviceId;
}

/**
 * Helper: total entry count across the three lists.
 */
export function totalDiffEntries(
  snapshot: SoftwareInventoryDiffSnapshot | null | undefined,
): number {
  if (!snapshot) return 0;
  return (
    (snapshot.added?.length ?? 0) +
    (snapshot.removed?.length ?? 0) +
    (snapshot.versionChanged?.length ?? 0)
  );
}
