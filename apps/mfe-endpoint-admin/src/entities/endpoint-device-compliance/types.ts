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
 * Both BE-023 list endpoints — cross-device latest list and per-device
 * append-only history — return the SAME row DTO: `ComplianceStateResponse`.
 *
 *   GET /api/v1/admin/compliance/devices
 *     -> ComplianceEvaluationListResponse<ComplianceStateResponse>
 *   GET /api/v1/admin/endpoint-devices/{id}/compliance/evaluations
 *     -> ComplianceEvaluationListResponse<ComplianceStateResponse>
 *
 * (Codex 019e6dd9 post-impl RED absorb — initial WEB-014B types
 * invented sibling DTOs with top-level `worstStaleness` /
 * `evaluationId` / `hostname` that the backend never emits. Aligning
 * the type chain to the actual contract makes accessors
 * `item.staleness.worst` and `item.latestEvaluationId`; hostname is
 * resolved from the device list cache that
 * `EndpointCompliancePage` already pre-warms.)
 */

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

/* ------------------------------------------------------------------ */
/*  WEB-014C — Compliance Policy CRUD (Codex 019e6dff plan-time iter-2 */
/*  AGREE-with-minor-revisions / ready_for_impl=true).                 */
/*                                                                     */
/*  Mirrors the BE-023 admin policy endpoints:                          */
/*    GET    /api/v1/admin/compliance/policy-items?page=&size=         */
/*    GET    /api/v1/admin/compliance/policy-items/{id}                */
/*    POST   /api/v1/admin/compliance/policy-items                     */
/*    PUT    /api/v1/admin/compliance/policy-items/{id}                */
/*    DELETE /api/v1/admin/compliance/policy-items/{id}                */
/*                                                                     */
/*  List response is the SAME custom envelope as WEB-014B              */
/*  (ComplianceEvaluationListResponse<T>) — NOT Spring Page<T>.        */
/* ------------------------------------------------------------------ */

/**
 * Per-catalog-item enforcement intent. Backend interprets a missing
 * policy row as `ALLOWED` for backward compatibility.
 *   REQUIRED  -> catalog item MUST be installed
 *   ALLOWED   -> catalog item approved but optional
 *   FORBIDDEN -> catalog item MUST NOT be installed
 */
export type ComplianceEnforcementMode = 'REQUIRED' | 'ALLOWED' | 'FORBIDDEN';

/**
 * Read shape for a compliance policy item. Mirrors BE-023
 * `CompliancePolicyItemResponse` 1:1.
 */
export interface CompliancePolicyItem {
  id: string;
  tenantId: string;
  catalogItemId: string;
  catalogItemKey: string;
  catalogDisplayName: string;
  enforcementMode: ComplianceEnforcementMode;
  enabled: boolean;
  createdBySubject: string | null;
  createdAt: string;
  lastUpdatedBySubject: string | null;
  lastUpdatedAt: string;
  /** Hibernate `@Version` — surfaced for audit but NOT sent back in
   *  PUT body (backend does not honor optimistic concurrency on the
   *  request DTO; Codex 019e6dff iter-1 §4). */
  version: number;
}

/**
 * Create / update request body. `version` intentionally excluded.
 * Backend enforces `catalogItemId` immutability on update (changing it
 * returns 400); EditDialog disables the catalog field accordingly.
 */
export interface CompliancePolicyItemRequest {
  catalogItemId: string;
  enforcementMode: ComplianceEnforcementMode;
  enabled?: boolean;
}

export interface GetCompliancePolicyItemsArgs {
  page?: number;
  size?: number;
}

export interface GetCompliancePolicyItemArgs {
  id: string;
}

export interface DeleteCompliancePolicyItemArgs {
  id: string;
}

export interface UpdateCompliancePolicyItemArgs {
  id: string;
  body: CompliancePolicyItemRequest;
}
