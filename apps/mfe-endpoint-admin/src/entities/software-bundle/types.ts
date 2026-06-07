/**
 * BE-029 approved software bundles — web types.
 *
 * Backend source-of-truth (platform-backend endpoint-admin-service):
 *   - AdminEndpointSoftwareBundleController (/api/v1/admin/endpoint-software-bundles):
 *     GET list (Page<AdminSoftwareBundleSummary>), POST create (DRAFT),
 *     GET /{bundleId}, POST /{bundleId}/approve (maker-checker, no body),
 *     POST /{bundleId}/revoke ({ revocationReason }).
 *   - model/SoftwareBundleStatus: { DRAFT, APPROVED, REVOKED }.
 *   - dto AdminSoftwareBundleRequest + AdminSoftwareBundleRevokeRequest.
 *
 * A bundle is a named, approvable SET of catalog item IDs — no trust material,
 * unlike the agent-update release catalog. Trust/promotion is sealed at /approve
 * (DRAFT→APPROVED), which is maker-checker (approver ≠ creator, server-enforced).
 */

export type SoftwareBundleStatus = 'DRAFT' | 'APPROVED' | 'REVOKED';

/** Backend DTO mirror — AdminSoftwareBundleSummary (the LIST row). */
export interface SoftwareBundleSummary {
  bundleId: string;
  displayName: string;
  status: SoftwareBundleStatus;
  enabled: boolean;
  lastUpdatedAt: string;
}

/** Backend AdminSoftwareBundleRequest — create/update body. */
export interface SoftwareBundleRequest {
  bundleId: string;
  displayName: string;
  description?: string;
  catalogItemIds: string[];
}

export interface ListSoftwareBundlesArgs {
  status?: SoftwareBundleStatus;
  enabled?: boolean;
  page?: number;
  size?: number;
}

export interface CreateSoftwareBundleArgs {
  body: SoftwareBundleRequest;
}

export interface ApproveSoftwareBundleArgs {
  bundleId: string;
}

/** Backend AdminSoftwareBundleRevokeRequest — { revocationReason } only. */
export interface RevokeSoftwareBundleBody {
  revocationReason: string;
}

export interface RevokeSoftwareBundleArgs {
  bundleId: string;
  body: RevokeSoftwareBundleBody;
}
