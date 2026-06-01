/**
 * WEB Application Control (WDAC + AppLocker) entity types — Faz 22.5
 * AG-041 (agent probe → backend ingest → web view).
 *
 * Mirrors the AG-038/AG-039/AG-040 precedents. Wire shape frozen by the
 * cross-repo contract:
 *   platform-agent docs/COMMAND-CONTRACT.md §20 (AG-041 v1,
 *   schemaVersion=1; source of truth =
 *   platform-agent internal/inventory/app_control.go
 *   AppControlResult, PR #49 MERGED 2026-06-01).
 *
 * Field names match backend DTO names
 * (AdminAppControlSnapshotResponse + AdminAppControlProbeErrorResponse,
 * platform-backend V26__endpoint_app_control.sql) exactly — no mapping
 * layer needed.
 *
 * Security invariant (do NOT widen — redaction boundary):
 * - The wire shape carries 20 top-level keys ONLY (no policyName,
 *   policyId, ruleName, publisher, exePath, etc.).
 * - WDAC mode is a 4-value enum (OFF/AUDIT/ENFORCE/UNKNOWN);
 *   UNKNOWN is the dominant return — evidence bits never drive mode.
 * - AppLocker per-collection enforcement is a 4-value enum
 *   (NOT_CONFIGURED/AUDIT_ONLY/ENFORCE/UNKNOWN); the rule bodies are
 *   NEVER persisted.
 * - AppIDSvc state + startup enums match AG-039 services (4-value
 *   state + 5-value startup including AUTO_DELAYED).
 * - Per probeError: EXACTLY {rowOrdinal, code, source?, summary?}.
 * Wire shape additions require an explicit contract bump (server
 * policy strict allowlist).
 */

/** WDAC operational mode 4-value enum (UNKNOWN dominant). */
export type WdacMode = 'OFF' | 'AUDIT' | 'ENFORCE' | 'UNKNOWN';

/** AppLocker per-rule-collection enforcement 4-value enum. */
export type AppLockerEnforcementMode = 'NOT_CONFIGURED' | 'AUDIT_ONLY' | 'ENFORCE' | 'UNKNOWN';

/**
 * Service state 4-value enum — matches AG-039 endpoint services
 * (V24 endpoint_services_service_state CHECK).
 */
export type ServiceState = 'RUNNING' | 'STOPPED' | 'DISABLED' | 'UNKNOWN';

/**
 * Service startup mode 5-value enum — matches AG-039 endpoint services
 * (V24 endpoint_services_startup_mode CHECK). AUTO_DELAYED is emitted
 * by the agent for AppIDSvc on Windows Server SKUs.
 */
export type ServiceStartupMode = 'AUTO' | 'AUTO_DELAYED' | 'MANUAL' | 'DISABLED' | 'UNKNOWN';

/**
 * AG-041 probe-error code 8-value enum (matches platform-agent
 * `AppControlErr*` constants verbatim).
 *
 * `NO_EVIDENCE` is the "overall probe failed" sentinel — the agent
 * non-Windows stub emits it with supported=false + probeComplete=false.
 * Backend policy rejects probeComplete=true alongside NO_EVIDENCE.
 *
 * `PROBE_ERRORS_TRUNCATED` is the cap-reached sentinel; agent emits
 * it as the last entry when 16+ errors would otherwise be dropped.
 */
export type AppControlProbeErrorCode =
  | 'NO_EVIDENCE'
  | 'REGISTRY_DENIED'
  | 'FILESYSTEM_DENIED'
  | 'CIP_POLICIES_DIR_UNREADABLE'
  | 'APPLOCKER_KEY_UNREADABLE'
  | 'APP_ID_SVC_QUERY_FAILED'
  | 'WDAC_SCALAR_UNREADABLE'
  | 'PROBE_ERRORS_TRUNCATED';

/**
 * Probe-error source 3-value lowercase enum (matches platform-agent
 * `AppControlProbeErrorSource` constants verbatim).
 */
export type AppControlProbeErrorSource = 'wdac' | 'appLocker' | 'filesystem';

export interface AppControlProbeError {
  rowOrdinal: number;
  code: AppControlProbeErrorCode;
  source?: AppControlProbeErrorSource | null;
  summary?: string | null;
}

/**
 * Full Application Control snapshot — mirrors backend
 * `AdminAppControlSnapshotResponse`. All `Boolean`/`Integer` Java
 * wrappers are nullable on the wire; consumers MUST use `value == null`
 * checks (NOT falsy).
 */
export interface AppControlSnapshot {
  snapshotId: string;
  deviceId: string;
  schemaVersion: number | null;
  supported: boolean | null;
  probeComplete: boolean | null;

  /** Whether the WDAC facet was queryable at all. */
  wdacQueryable: boolean | null;
  /** Whether the AppLocker facet was queryable at all. */
  appLockerQueryable: boolean | null;

  /** WDAC operational decision; UNKNOWN dominant when not queryable. */
  wdacMode: WdacMode | null;
  /** WDAC evidence — bounded capability bits + count. */
  wdacBootEnforcementPresent: boolean | null;
  wdacActiveCipPolicyCount: number | null;
  wdacLegacySipolicyPresent: boolean | null;
  wdacMultiPolicyMode: boolean | null;

  /** AppLocker per-rule-collection enforcement mode. */
  appLockerExeRule: AppLockerEnforcementMode | null;
  appLockerDllRule: AppLockerEnforcementMode | null;
  appLockerScriptRule: AppLockerEnforcementMode | null;
  appLockerMsiRule: AppLockerEnforcementMode | null;
  appLockerAppxRule: AppLockerEnforcementMode | null;

  /** AppIDSvc (the SCM service AppLocker depends on) state + startup. */
  appLockerAppIdSvcState: ServiceState | null;
  appLockerAppIdSvcStartup: ServiceStartupMode | null;
  appLockerAppIdSvcPresent: boolean | null;

  probeDurationMs: number | null;
  payloadHashSha256: string | null;
  collectedAt: string; // ISO-8601, NOT NULL per backend V26
  createdAt: string; // ISO-8601, NOT NULL per backend V26
  probeErrors: AppControlProbeError[];
}

/**
 * Helper: strict `supported === true && probeComplete === true` gate.
 */
export function isAppControlFullyEvaluable(
  snapshot: AppControlSnapshot | null | undefined,
): boolean {
  if (!snapshot) return false;
  return snapshot.supported === true && snapshot.probeComplete === true;
}

/**
 * Helper: stale-arg guard (currentData.deviceId === active deviceId).
 * Follows the AG-038 → AG-039 → AG-040 precedent (Codex 019e830b).
 */
export function isAppControlForDevice(
  snapshot: AppControlSnapshot | null | undefined,
  deviceId: string,
): snapshot is AppControlSnapshot {
  if (!snapshot) return false;
  return snapshot.deviceId === deviceId;
}

/**
 * The 5 AppLocker collections we render in the UI as a tuple of
 * (label, accessor key). Stable order across all renders + tests.
 */
export const APPLOCKER_RULE_KEYS = [
  { key: 'appLockerExeRule', shortLabel: 'EXE' },
  { key: 'appLockerDllRule', shortLabel: 'DLL' },
  { key: 'appLockerScriptRule', shortLabel: 'Script' },
  { key: 'appLockerMsiRule', shortLabel: 'MSI' },
  { key: 'appLockerAppxRule', shortLabel: 'Appx' },
] as const;

export type AppLockerRuleKey = (typeof APPLOCKER_RULE_KEYS)[number]['key'];
