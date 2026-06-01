/**
 * WEB startup-exposure entity types — Faz 22.5 AG-040 (agent probe →
 * backend ingest → web view).
 *
 * Mirrors the AG-038/AG-039 precedents. Wire shape frozen by the
 * cross-repo contract:
 *   platform-agent docs/COMMAND-CONTRACT.md §19 (AG-040 v1,
 *   schemaVersion=1; source of truth =
 *   platform-agent internal/inventory/startup_exposure.go
 *   StartupExposureResult, commit 92320cd).
 *
 * Field names match backend DTO names
 * (AdminStartupExposureSnapshotResponse + AdminStartupAppResponse +
 * AdminStartupExposureProbeErrorResponse, platform-backend commit
 * b6daaee2 V25__endpoint_startup_exposure.sql) exactly — no mapping
 * layer needed.
 *
 * Security invariant (do NOT widen — redaction boundary):
 * - Per startup app: EXACTLY {rowOrdinal, name, location, enabled,
 *   probeOrigin}. `name` is registry value-name / task-name / folder-
 *   basename WITH the extension stripped — NEVER a raw file path.
 * - `location` is the 10-slot autorun-anchor enum — NEVER a raw
 *   registry path or filesystem location.
 * - Per probeError: EXACTLY {rowOrdinal, code, source?, summary?}.
 * - Top-level scalars `rdpEnabled` + `windowsFirewallEventLogEnabled`
 *   are presence booleans only — NO event-log content, NO firewall
 *   rule enumeration, NO RDP session list.
 * Wire shape additions require an explicit contract bump (server
 * policy strict allowlist).
 */

/**
 * Canonical 10-slot autorun-anchor enum (matches
 * platform-agent internal/inventory/startup_exposure.go
 * CanonicalStartupLocations allowlist verbatim).
 */
export type StartupAppLocation =
  | 'HKLM_RUN'
  | 'HKLM_RUNONCE'
  | 'HKLM_WOW6432_RUN'
  | 'HKCU_RUN'
  | 'HKCU_RUNONCE'
  | 'STARTUP_FOLDER_COMMON'
  | 'STARTUP_FOLDER_USER'
  | 'TASK_SCHEDULER:ROOT'
  | 'TASK_SCHEDULER:MICROSOFT_WINDOWS'
  | 'TASK_SCHEDULER:CUSTOM';

/**
 * Discovery channel for a startup-app entry.
 *
 * REGISTRY = found via one of the HKLM/HKCU Run/RunOnce/Wow6432
 * registry keys or one of the StartMenu Startup folders.
 * SCHEDULED_TASK = found via Task Scheduler (root / MS\Windows /
 * custom subfolder).
 */
export type StartupProbeOrigin = 'REGISTRY' | 'SCHEDULED_TASK';

export interface StartupApp {
  rowOrdinal: number;
  name: string;
  location: StartupAppLocation;
  enabled: boolean | null;
  probeOrigin: StartupProbeOrigin;
}

/**
 * Per-probe error row. Both `source` and `summary` are nullable: the
 * backend column + policy allow probe errors with just a code.
 * `source` when set is one of the facet-source enum keys (e.g.
 * "registry", "scheduledTask", "firewallEventLog", "rdp") — bounded
 * string, NOT freeform.
 */
export interface StartupExposureProbeError {
  rowOrdinal: number;
  code: string;
  source?: string | null;
  summary?: string | null;
}

/**
 * Full startup-exposure snapshot — mirrors backend
 * `AdminStartupExposureSnapshotResponse`. All `Boolean`/`Integer`
 * Java wrappers are nullable on the wire; consumers MUST use
 * `value == null` checks (NOT falsy).
 */
export interface StartupExposureSnapshot {
  id: string;
  tenantId: string;
  deviceId: string;
  sourceCommandResultId: string | null;
  schemaVersion: number | null;
  supported: boolean | null;
  probeComplete: boolean | null;
  rdpEnabled: boolean | null;
  windowsFirewallEventLogEnabled: boolean | null;
  probeDurationMs: number | null;
  payloadHashSha256: string | null;
  collectedAt: string; // ISO-8601, NOT NULL per backend V25
  createdAt: string; // ISO-8601, NOT NULL per backend V25
  startupApps: StartupApp[];
  probeErrors: StartupExposureProbeError[];
}

/**
 * Helper: strict `supported === true && probeComplete === true` gate.
 */
export function isStartupExposureFullyEvaluable(
  snapshot: StartupExposureSnapshot | null | undefined,
): boolean {
  if (!snapshot) return false;
  return snapshot.supported === true && snapshot.probeComplete === true;
}

/**
 * Helper: stale-arg guard (currentData.deviceId === active deviceId).
 * WEB-014D-followup precedent (Codex 019e830b) applied to AG-038, then
 * AG-039, now AG-040.
 */
export function isStartupExposureForDevice(
  snapshot: StartupExposureSnapshot | null | undefined,
  deviceId: string,
): snapshot is StartupExposureSnapshot {
  if (!snapshot) return false;
  return snapshot.deviceId === deviceId;
}
