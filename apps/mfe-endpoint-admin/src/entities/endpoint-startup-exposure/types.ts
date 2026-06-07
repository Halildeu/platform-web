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
 * Per-probe error row. Both `source` and `summary` are nullable.
 *
 * Codex 019e83a6 iter-2 P2 absorb: `source` is the autorun-anchor enum
 * (StartupAppLocation), NOT a freeform facet name. The backend policy
 * (`StartupExposurePayloadPolicy`) enforces source against the same
 * canonical allowlist as `StartupApp.location`. When the probe error
 * concerns the RDP / firewall scalars (not an autorun anchor), the
 * agent emits `source` as `null` and the `code` carries the semantic
 * (e.g. `RDP_PROBE_FAILED`, `FIREWALL_PROBE_FAILED`, `NO_EVIDENCE`).
 */
export interface StartupExposureProbeError {
  rowOrdinal: number;
  code: string;
  source?: StartupAppLocation | null;
  summary?: string | null;
}

/**
 * Codex 019e83a6 iter-2 P1 absorb — exposure-scalar evidence enum.
 *
 * The agent emits typed probe-error codes that flag the
 * top-level scalars as untrustworthy:
 * - `RDP_PROBE_FAILED` — `rdpEnabled` is untrustworthy
 * - `FIREWALL_PROBE_FAILED` — `windowsFirewallEventLogEnabled` is
 *   untrustworthy
 * - `NO_EVIDENCE` — the whole probe failed; BOTH scalars are
 *   untrustworthy
 *
 * The non-Windows stub also returns `supported=false` + `false/false`
 * scalars; the view MUST NOT show a "Kapalı (success)" badge on
 * unsupported runtime or on a scalar whose corresponding probe error
 * is present — that would turn fail-closed evidence into a positive
 * operator signal. Use these helpers to derive the display value:
 * `null` (unknown) suppresses the badge tone instead of rendering a
 * false-confidence "closed" state.
 */
export const PROBE_ERROR_CODE_RDP_FAILED = 'RDP_PROBE_FAILED';
export const PROBE_ERROR_CODE_FIREWALL_FAILED = 'FIREWALL_PROBE_FAILED';
export const PROBE_ERROR_CODE_NO_EVIDENCE = 'NO_EVIDENCE';

/**
 * Returns the trustworthy effective value of `rdpEnabled`, or `null`
 * when the agent evidence says the scalar is untrustworthy. Codex
 * 019e83a6 iter-2 P1 absorb.
 */
export function getEffectiveRdpEnabled(
  snapshot: StartupExposureSnapshot | null | undefined,
): boolean | null {
  if (!snapshot) return null;
  if (snapshot.supported !== true) return null;
  if (
    snapshot.probeErrors?.some(
      (e) => e.code === PROBE_ERROR_CODE_RDP_FAILED || e.code === PROBE_ERROR_CODE_NO_EVIDENCE,
    )
  ) {
    return null;
  }
  return snapshot.rdpEnabled;
}

/**
 * Returns the trustworthy effective value of
 * `windowsFirewallEventLogEnabled`, or `null` when untrustworthy.
 * Codex 019e83a6 iter-2 P1 absorb.
 */
export function getEffectiveFirewallEventLogEnabled(
  snapshot: StartupExposureSnapshot | null | undefined,
): boolean | null {
  if (!snapshot) return null;
  if (snapshot.supported !== true) return null;
  if (
    snapshot.probeErrors?.some(
      (e) => e.code === PROBE_ERROR_CODE_FIREWALL_FAILED || e.code === PROBE_ERROR_CODE_NO_EVIDENCE,
    )
  ) {
    return null;
  }
  return snapshot.windowsFirewallEventLogEnabled;
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
 * Probe-error code emitted by the agent when an autorun/task NAME matched
 * the forbidden-value denylist (path / executable extension / braced MSI
 * GUID / SID / control char) and the entry was OMITTED from the wire.
 * (platform-agent internal/inventory/startup_exposure.go)
 */
export const STARTUP_EXPOSURE_NAME_VALUE_REDACTED = 'NAME_VALUE_REDACTED';

/**
 * Helper: "redaction-only partial-visible" state (AG-040 v1 UX fix; Codex
 * 019ea174 AGREE Option A). The probe ENUMERATION succeeded but `probeComplete`
 * is false SOLELY because some entry NAMES were redacted for privacy — NOT
 * because of a real probe/enumeration failure.
 *
 * Distinguished by: every probe error is `NAME_VALUE_REDACTED`. Genuine
 * failures emit DISTINCT codes (REGISTRY_QUERY_FAILED, STARTUP_FOLDER_UNREADABLE,
 * TASK_SCHEDULER_UNAVAILABLE/QUERY_FAILED, NO_EVIDENCE, ENTRY_CAP_APPLIED, …),
 * and `NAME_VALUE_REDACTED` is appended only AFTER a successful enumeration, so
 * "all errors are redactions" reliably means the surviving rows are trustworthy.
 *
 * The snapshot stays `fullyEvaluable === false` (NOT widened); this only lets
 * the caller render the surviving rows + a redaction banner instead of hiding
 * the whole table. Requires at least one surviving row to be meaningful.
 */
export function isStartupExposureRedactionOnly(
  snapshot: StartupExposureSnapshot | null | undefined,
): boolean {
  if (!snapshot) return false;
  return (
    snapshot.supported === true &&
    snapshot.probeComplete === false &&
    snapshot.startupApps.length > 0 &&
    snapshot.probeErrors.length > 0 &&
    snapshot.probeErrors.every((e) => e.code === STARTUP_EXPOSURE_NAME_VALUE_REDACTED)
  );
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
