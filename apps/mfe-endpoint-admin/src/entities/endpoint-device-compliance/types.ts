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
