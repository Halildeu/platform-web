/**
 * WEB-014A — Faz 22.5 Compliance State (Codex 019e6d68 plan-time
 * AGREE iter-1).
 *
 * Mirrors the platform-backend BE-023 admin REST DTOs:
 *
 *   - ComplianceStateResponse
 *   - ComplianceStateResponse.StalenessReport
 *   - ComplianceStateResponse.ComplianceEvidence
 *
 * Backend JSON field casing is camelCase; the frontend keeps the same
 * casing so RTK Query bodies are consumable without a normaliser pass.
 *
 * WEB-014A scope: read latest state + force evaluate. Cross-device
 * list (WEB-014B), evaluation history (WEB-014B), and policy CRUD
 * (WEB-014C) are out of scope for this PR.
 */

export type ComplianceDecision = 'COMPLIANT' | 'NON_COMPLIANT' | 'UNAUTHORIZED' | 'UNKNOWN';

export type StalenessSeverity = 'FRESH' | 'SOFT' | 'HARD' | 'UNAVAILABLE';

export interface ComplianceStalenessReport {
  summary: StalenessSeverity;
  apps: StalenessSeverity;
  wingetEgress: StalenessSeverity;
  worst: StalenessSeverity;
}

export interface ComplianceEvidence {
  inventorySnapshotId: string | null;
  inventorySnapshotRowVersion: number | null;
  inventoryUpdatedAt: string | null;
  summaryCollectedAt: string | null;
  appsCollectedAt: string | null;
  latestSummaryCommandResultId: string | null;
  latestFullCommandResultId: string | null;
  latestWingetEgressCommandResultId: string | null;
  wingetEgressCollectedAt: string | null;
  wingetEgressSchemaVersion: number | null;
  matchedItems: Record<string, unknown>;
}

export interface ComplianceStateResponse {
  deviceId: string;
  latestEvaluationId: string;
  decision: ComplianceDecision;
  evaluatedAt: string;
  staleness: ComplianceStalenessReport;
  reasons: string[];
  blockingReasons: string[];
  warnings: string[];
  evidence: ComplianceEvidence;
  catalogPolicyHash: string | null;
  catalogPolicyHashCurrent: string | null;
  policyDrift: boolean | null;
  catalogRowVersionMax: number | null;
  policyRowVersionMax: number | null;
}

export interface GetDeviceComplianceArgs {
  deviceId: string;
}

export interface ForceEvaluateDeviceComplianceArgs {
  deviceId: string;
}

/* ------------------------------------------------------------------ */
/*  WEB-014B — Cross-device compliance list + evaluation history       */
/*  (Codex 019e6db0 plan-time iter-2 AGREE / ready_for_impl=true).     */
/*                                                                     */
/*  Mirrors the BE-023 admin endpoints:                                 */
/*    GET /api/v1/admin/compliance/devices?decision=&page=&size=       */
/*    GET /api/v1/admin/endpoint-devices/{id}/compliance/evaluations   */
/*                                                                     */
/*  Backend envelope is NOT Spring Page<T> — it is a custom shape       */
/*  emitted by ComplianceEvaluationListResponse.java:                   */
/*    { items, page, size, totalElements, totalPages }                  */
/* ------------------------------------------------------------------ */

/**
 * Custom pagination envelope returned by the BE-023 list endpoints.
 * NOT Spring `Page<T>` (no `content` / `number` fields).
 */
export interface ComplianceEvaluationListResponse<T> {
  items: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

/**
 * Cross-device compliance list row. Backed by
 * `endpoint_device_compliance_states` (latest pointer) joined with
 * the matching evaluation. WorstStaleness and policyDrift are surfaced
 * as columns; they are NOT server-side filter parameters in this PR
 * (Codex iter-2: filtering them would break pagination totals because
 * they are computed at GET time, not stored as repository columns).
 */
export interface ComplianceDeviceListItem {
  deviceId: string;
  hostname: string | null;
  latestEvaluationId: string;
  decision: ComplianceDecision;
  evaluatedAt: string;
  worstStaleness: StalenessSeverity;
  policyDrift: boolean | null;
}

/**
 * Per-device evaluation history row. Backed by the append-only
 * `endpoint_compliance_evaluations` table; one row per evaluation.
 * Returned newest-first by the backend.
 */
export interface ComplianceEvaluationHistoryItem {
  evaluationId: string;
  decision: ComplianceDecision;
  evaluatedAt: string;
  worstStaleness: StalenessSeverity;
  reasons: string[];
  blockingReasons: string[];
  warnings: string[];
  policyDrift: boolean | null;
  catalogPolicyHash: string | null;
}

export interface GetComplianceDeviceListArgs {
  decision?: ComplianceDecision;
  page?: number;
  size?: number;
}

export interface GetDeviceComplianceEvaluationsArgs {
  deviceId: string;
  page?: number;
  size?: number;
}
