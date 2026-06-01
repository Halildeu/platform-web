/**
 * WEB critical services inventory entity types — Faz 22.5 (AG-039
 * agent probe → backend ingest → web view).
 *
 * Mirrors the AG-038 agent-diagnostics precedent. Wire shape frozen by
 * the cross-repo contract:
 *   platform-agent docs/COMMAND-CONTRACT.md §18 (AG-039 v1,
 *   schemaVersion=1; source of truth =
 *   platform-agent internal/inventory/services.go ServicesResult,
 *   PR #47 merged 0d8e7b4).
 *
 * Field names match backend DTO names
 * (AdminServicesSnapshotResponse + AdminServiceEntryResponse +
 * AdminServicesProbeErrorResponse, platform-backend PR #362 `65d9fbd5`)
 * exactly — no mapping layer needed.
 *
 * Security invariant (do NOT widen — redaction boundary):
 * - Per service: EXACTLY {rowOrdinal, name, present, state, startupMode}.
 *   NO raw description / command line / account / SID / display name.
 * - Per probeError: EXACTLY {rowOrdinal, code, serviceName?, summary?}.
 *   serviceName when present MUST come from the canonical allowlist;
 *   summary is bounded operator text (200-char cap, CRLF stripped).
 * - The 6-service allowlist is HARD-CODED in the agent:
 *   WinDefend / wuauserv / BITS / EventLog / EndpointAgent / MpsSvc.
 * Wire shape additions require an explicit contract bump (server policy
 * strict allowlist).
 */

/**
 * Windows service runtime state (SCM-derived).
 *
 * `UNKNOWN` is the fail-closed sentinel — emitted both when the service
 * is present-but-query-failed AND for the explicit v1 non-disambiguated
 * paused/pending transitions (Codex 019e8302 iter-2 #4: PAUSED → UNKNOWN
 * not STOPPED). Operators MUST NOT interpret UNKNOWN as "healthy".
 */
export type ServiceState = 'RUNNING' | 'STOPPED' | 'DISABLED' | 'UNKNOWN';

/**
 * Windows service startup configuration.
 *
 * `AUTO_DELAYED` is kept distinct from `AUTO` so EndpointAgent's
 * delayed-auto installer configuration is observably regression-checked
 * (Codex 019e8302 iter-2 #3). Collapsing into AUTO would hide a
 * legitimate operational signal.
 */
export type StartupMode = 'AUTO' | 'AUTO_DELAYED' | 'MANUAL' | 'DISABLED' | 'UNKNOWN';

/**
 * Per-service entry. `rowOrdinal` is backend-derived for stable
 * ordering across queries (matches the canonical allowlist index).
 */
export interface ServiceEntry {
  rowOrdinal: number;
  name: string; // canonical SCM name from CanonicalServiceAllowlist
  present: boolean | null;
  state: ServiceState;
  startupMode: StartupMode;
}

/**
 * Per-probe error row. `serviceName` and `summary` are nullable: the
 * backend column + policy allow probe errors with just a code (Codex
 * 019e8389 iter-1 must_fix #5; `ServicesPayloadPolicy` accepts
 * `summaryNotMandatory` + `serviceNameNotMandatory`).
 */
export interface ServicesProbeError {
  rowOrdinal: number;
  code: string;
  serviceName?: string | null;
  summary?: string | null;
}

/**
 * Full services snapshot wire shape — mirrors backend
 * `AdminServicesSnapshotResponse`. All `Boolean`/`Integer` Java
 * wrappers are nullable on the wire; consumers MUST use `value == null`
 * checks (NOT falsy) because `0` is a legitimate `probeDurationMs`
 * reading on a fast SCM enumerate.
 */
export interface ServicesSnapshot {
  id: string;
  tenantId: string;
  deviceId: string;
  sourceCommandResultId: string | null;
  schemaVersion: number | null;
  supported: boolean | null;
  probeComplete: boolean | null;
  probeDurationMs: number | null;
  payloadHashSha256: string | null;
  collectedAt: string; // ISO-8601, NOT NULL per backend V24
  createdAt: string; // ISO-8601, NOT NULL per backend V24
  services: ServiceEntry[];
  probeErrors: ServicesProbeError[];
}

/**
 * Helper: "snapshot looks fully healthy" predicate. Strict
 * `supported === true && probeComplete === true`. Used to gate the
 * services-table render (fail-closed when probe incomplete: never show
 * the per-service state badges based on stale/partial data).
 */
export function isServicesFullyEvaluable(snapshot: ServicesSnapshot | null | undefined): boolean {
  if (!snapshot) return false;
  return snapshot.supported === true && snapshot.probeComplete === true;
}

/**
 * Helper: "this snapshot belongs to the device we're rendering"
 * predicate. Defends against the RTK Query `data`-vs-`currentData` stale-
 * arg leak (WEB-014D-followup Codex 019e830b precedent, applied to AG-038
 * and now AG-039). Render-time check; `currentData` already snaps to
 * undefined on arg change but this is the explicit guard.
 */
export function isServicesForDevice(
  snapshot: ServicesSnapshot | null | undefined,
  deviceId: string,
): snapshot is ServicesSnapshot {
  if (!snapshot) return false;
  return snapshot.deviceId === deviceId;
}
