/**
 * WEB prohibited-software entity types — Faz 22.5 P2-A slice-2 BE-025
 * (backend MERGED; this file is the missing web link).
 *
 * Mirrors backend DTO names verbatim
 * (DeviceProhibitedSoftwareResponse + ProhibitedSoftwareFindingResponse,
 * platform-backend endpoint-admin-service). No mapping layer needed.
 *
 * Backend contract source of truth:
 * - GET /api/v1/admin/endpoint-devices/{deviceId}/prohibited-software
 * - Always 200 (no-existence-leak: NO_EVALUATION also returned for
 *   unknown / cross-tenant device — mirrors BE-022Q / BE-024 discipline)
 * - GET does NOT recompute live (Codex 019e7623 (d) absorb); reads the
 *   last persisted EndpointComplianceEvaluation.evidence projection
 * - 2-status enum (OK / NO_EVALUATION) — UI MUST render distinct states
 * - findings is the ordered list per evaluation (possibly empty when
 *   status=OK and the evaluator found no matches)
 *
 * Security invariant (do NOT widen — redaction boundary):
 * - Per finding: EXACTLY {ruleId, matchType, matchMode, matchedName,
 *   matchedPublisher, matchedVersion}. Rule notes / createdBySubject /
 *   raw install path / registry key / uninstall string / MSI GUID are
 *   NOT in the wire contract.
 * - No "remediation" or "automatic uninstall" CTA is rendered by this
 *   view (Codex 019e84ca adversarial guardrail). Copy stays at
 *   "tespit edildi / detected" level — UI does NOT advertise actions
 *   the backend cannot perform.
 * - Rule names / publishers / versions are echoed as-is from the
 *   matched inventory item — backend already fail-closed sanitized at
 *   ingest; the view honors the contract.
 *
 * Wire shape additions require an explicit backend contract bump.
 */

/**
 * Match-type enum — which inventory field(s) the rule asserted on.
 * String form on the wire (backend contract stable across enum renames).
 * Surface known values; future-added values fall through to UI labels
 * that show the raw enum text (drift-safe).
 */
export type ProhibitedSoftwareMatchType = 'NAME' | 'PUBLISHER' | 'NAME_AND_PUBLISHER';

/**
 * Match-mode enum — how the rule's pattern compared against the
 * matched-field. String form on the wire.
 */
export type ProhibitedSoftwareMatchMode = 'EXACT' | 'CONTAINS';

export interface ProhibitedSoftwareFinding {
  /** UUID — the denylist rule that matched. Opaque from the UI's
   *  perspective; an admin can correlate via the rule-listing endpoint. */
  ruleId: string;
  matchType: ProhibitedSoftwareMatchType | string;
  matchMode: ProhibitedSoftwareMatchMode | string;
  matchedName: string;
  matchedPublisher: string | null;
  matchedVersion: string | null;
}

/**
 * 2-status enum — OK (an evaluation exists; findings is the list,
 * possibly empty) vs NO_EVALUATION (none yet, OR unknown/cross-tenant
 * device — no-existence-leak).
 *
 * UI MUST render the two states distinctly so operators can tell
 * "evaluator ran, no denylist matches" apart from "no evaluation yet".
 */
export type ProhibitedSoftwareStatus = 'OK' | 'NO_EVALUATION';

export interface DeviceProhibitedSoftwareSnapshot {
  deviceId: string;
  status: ProhibitedSoftwareStatus;
  /**
   * Persisted device compliance decision at the evaluation that
   * produced these findings, string form. May be null when status
   * is NO_EVALUATION. Common values: COMPLIANT, NONCOMPLIANT,
   * UNAUTHORIZED (a prohibited match drove it), etc.
   */
  decision: string | null;
  evaluatedAt: string | null;
  inventorySnapshotId: string | null;
  findings: ProhibitedSoftwareFinding[];
}

/**
 * Helper: stale-arg guard mirrors AG-038..AG-041 + BE-024 precedent.
 */
export function isProhibitedSoftwareForDevice(
  snapshot: DeviceProhibitedSoftwareSnapshot | null | undefined,
  deviceId: string,
): snapshot is DeviceProhibitedSoftwareSnapshot {
  if (!snapshot) return false;
  return snapshot.deviceId === deviceId;
}

/**
 * Helper: is the device unauthorised by a denylist match (operator
 * dashboard tone vector input).
 */
export function isProhibitedSoftwareUnauthorized(
  snapshot: DeviceProhibitedSoftwareSnapshot | null | undefined,
): boolean {
  if (!snapshot) return false;
  return snapshot.status === 'OK' && snapshot.decision === 'UNAUTHORIZED';
}
