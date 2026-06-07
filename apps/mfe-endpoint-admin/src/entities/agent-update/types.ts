/**
 * AG-029 (Faz 22.5) — signed agent self-update web types.
 *
 * Backend source-of-truth (platform-backend endpoint-admin-service):
 *   - BE-031 release catalog: model/EndpointAgentUpdateRelease + the
 *     AdminEndpointAgentUpdateReleaseController CRUD/approve/revoke surface
 *     (GET /api/v1/admin/endpoint-agent-update-releases).
 *   - BE-032 dispatch: AdminEndpointCommandController
 *     POST /api/v1/admin/endpoint-devices/{deviceId}/agent-updates — the
 *     backend resolves the approved+enabled release server-side, re-checks
 *     fresh heartbeat + advertised UPDATE_AGENT capability, and BUILDS the
 *     payload itself. It REJECTS any caller-supplied trust field
 *     (binaryUrl / sha256 / signerThumbprint / signingTier) with HTTP 400.
 *
 * SECURITY (Codex 019ea0a6): the dispatch body the UI sends MUST be exactly
 * `{ releaseId, reason }`. Trust material is never collected or transmitted
 * by the client — the operator only PICKS an approved release; the trust
 * decision was already made at release-approve time (maker-checker on the
 * catalog), and the backend re-resolves everything from the releaseId. The
 * `DispatchAgentUpdateBody` type below pins this with `never`-typed forbidden
 * fields so a future edit cannot accidentally widen the wire.
 */

export type AgentUpdateSigningTier = 'TRUSTED' | 'LAB_ONLY_EVIDENCE';

export type AgentUpdateReleaseStatus = 'DRAFT' | 'APPROVED' | 'REVOKED';

/** Backend DTO mirror — a row of the agent-update release catalog (BE-031). */
export interface AgentUpdateRelease {
  releaseId: string;
  targetVersion: string;
  channel: string | null;
  ring: string | null;
  signingTier: AgentUpdateSigningTier;
  status: AgentUpdateReleaseStatus;
  enabled: boolean;
  // Trust/source fields exist on the backend row for audit but are NOT used
  // by the dispatch UI; kept optional + read-only for display/audit only.
  claimedSha256?: string | null;
  claimedSignerThumbprint?: string | null;
}

export interface ListAgentUpdateReleasesArgs {
  /** Server-side filter; the dispatch picker requests only dispatchable ones. */
  status?: AgentUpdateReleaseStatus;
  enabled?: boolean;
  channel?: string;
  page?: number;
  size?: number;
}

/**
 * The EXACT dispatch wire body — `{ releaseId, reason }` only.
 *
 * The forbidden trust fields are typed `never` so any attempt to populate
 * them is a compile error: the UI can never send trust material, mirroring
 * BE-032's 400-on-trust-fields guard. Do NOT spread a selected release
 * object into this body.
 */
export interface DispatchAgentUpdateBody {
  releaseId: string;
  reason: string;
  binaryUrl?: never;
  sha256?: never;
  signerThumbprint?: never;
  signingTier?: never;
}

export interface DispatchAgentUpdateArgs {
  deviceId: string;
  body: DispatchAgentUpdateBody;
}
