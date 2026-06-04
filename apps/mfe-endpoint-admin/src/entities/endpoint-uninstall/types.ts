/**
 * AG-028 Phase 3 — Managed Uninstall propose/approve + audit DTOs
 * (Faz 22.5.6; Codex 019e93a4 plan-time AGREE + 019e93ab gap ruling).
 *
 * Backend source-of-truth (platform-backend@endpoint-admin-service):
 *   - dto/v1/admin/AdminUninstallRequestResponse.java
 *   - dto/v1/admin/AdminUninstallAuditResponse.java
 *   - dto/v1/admin/AdminUninstallRequestCreate.java (propose body)
 *   - dto/v1/admin/AdminUninstallRequestApproval.java (approve body)
 *   - model/UninstallRequestState.java
 *   - model/UninstallResultStatus.java
 *   - model/UninstallVerification.java
 *   - controller/AdminEndpointUninstallController.java
 *     (gateway paths under /api/v1/endpoint-admin/...)
 *
 * Nullability discipline (mirror of endpoint-install): backend records
 * emit JSON `null` (not field-omitted) for missing values. All optional
 * scalars are typed `T | null` so consumers cannot accidentally
 * `undefined`-gate around them.
 *
 * Key contract notes vs. the install surface:
 *  - There is NO uninstall-preflight endpoint. The propose endpoint
 *    enforces every gate (provenance / catalog status /
 *    uninstall_supported / uninstall_protected / detection-rule
 *    authority / feature-flag / OpenFGA) INLINE and returns 4xx on a
 *    gate failure (see `UNINSTALL_ERROR_STATUS` below for the HTTP-status
 *    → headline mapping).
 *  - Maker-checker is enforced at APPROVE time (createdBy must differ
 *    from approver subject → 403). There is NO reject endpoint.
 *  - `commandId` is null until the request is APPROVED.
 */

/**
 * Mirror of `UninstallRequestState` (backend enum, V32 DB CHECK).
 * State machine:
 *   PENDING_APPROVAL → APPROVED → QUEUED → CLAIMED → RUNNING → TERMINAL
 * The UI renders an "open request" pill for PENDING_APPROVAL / APPROVED
 * (and the intermediate dispatch states); TERMINAL rows surface their
 * per-result detail through the immutable audit row instead.
 */
export type UninstallRequestState =
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'QUEUED'
  | 'CLAIMED'
  | 'RUNNING'
  | 'TERMINAL';

/**
 * Mirror of `UninstallResultStatus` (backend enum, V32 DB CHECK).
 * Absence-aware terminal taxonomy — distinct from the install
 * `result_status` because a successful uninstall proves ABSENCE.
 */
export type UninstallResultStatus =
  | 'SUCCEEDED_VERIFIED'
  | 'SKIP_ALREADY_ABSENT'
  | 'FAILED_VERIFY_GHOST'
  | 'FAILED_EXIT'
  | 'PARTIAL_RESIDUE'
  | 'PARTIAL_INCONCLUSIVE'
  | 'FAILED_PRECHECK_INCONCLUSIVE'
  | 'FAILED_UNSUPPORTED_PLATFORM'
  | 'FAILED_UNSUPPORTED_VERIFICATION';

/**
 * Mirror of `UninstallVerification` (backend enum, V32 DB CHECK).
 * Absence-aware probe verdict — cannot collapse "package absent" with
 * "detection failed".
 */
export type UninstallVerification =
  | 'ABSENT_VERIFIED'
  | 'PRESENT_VERIFIED'
  | 'RESIDUE_PRESENT'
  | 'VERIFY_INCONCLUSIVE'
  | 'NOT_RUN';

/**
 * REST projection of an `endpoint_uninstall_requests` row.
 *
 * Returned by:
 *  - POST .../uninstalls (201 — PENDING_APPROVAL, commandId null)
 *  - POST .../uninstalls/{requestId}/approve (200 — APPROVED, commandId set)
 *  - GET .../uninstalls/{requestId} (200)
 *  - GET .../uninstalls (200 — List)
 *
 * Backend record component types:
 *  - requestId / tenantId / deviceId / catalogItemId: UUID
 *  - commandId: UUID | null (null until APPROVED)
 *  - state: UninstallRequestState
 *  - idempotencyKey / createdBy: String (createdBy = proposer subject)
 *  - reason / approvedBy: String | null
 *  - createdAt / stateUpdatedAt: Instant ISO string
 */
export interface AdminUninstallRequestResponse {
  requestId: string;
  tenantId: string;
  deviceId: string;
  /** Internal catalog UUID (NOT the public slug). */
  catalogItemId: string;
  commandId: string | null;
  state: UninstallRequestState;
  idempotencyKey: string;
  reason: string | null;
  /** Canonical subject of the proposer (the maker). */
  createdBy: string;
  /** Canonical subject of the approver (the checker); null until APPROVED. */
  approvedBy: string | null;
  createdAt: string;
  stateUpdatedAt: string;
}

/**
 * REST projection of an `endpoint_uninstall_audit` row (terminal
 * results), returned by GET .../uninstalls/history.
 *
 * Backend record component types:
 *  - auditId / requestId / tenantId / deviceId / commandId /
 *    catalogItemId: UUID
 *  - resultStatus: UninstallResultStatus
 *  - verification: UninstallVerification
 *  - exitCode: Integer | null
 *  - reportedAt: Instant ISO string
 *  - redactedPayload / detectionEvidence: Map<String,Object> (JSONB)
 *  - createdAt: Instant ISO string
 */
export interface AdminUninstallAuditResponse {
  auditId: string;
  requestId: string;
  tenantId: string;
  deviceId: string;
  commandId: string;
  /** Internal catalog UUID. */
  catalogItemId: string;
  resultStatus: UninstallResultStatus;
  verification: UninstallVerification;
  exitCode: number | null;
  reportedAt: string;
  redactedPayload: Record<string, unknown> | null;
  detectionEvidence: Record<string, unknown> | null;
  createdAt: string;
}

/**
 * POST body for `/endpoint-admin/endpoint-devices/{deviceId}/uninstalls`.
 *
 * Backend constraints (AdminUninstallRequestCreate.java):
 *  - catalogItemId: @NotBlank @Size(max=128) — the public catalog SLUG
 *    (e.g. "be026-smoke-7zip-registry"), NOT the UUID. Backend resolves
 *    the internal UUID + package id from the catalog row.
 *  - idempotencyKey: @Size(max=40) — caller-supplied SUFFIX only; backend
 *    builds `admin-uninstall:{deviceId(36)}:{catalogUuid(36)}:{key}`.
 *    A 36-char UUID v4 fits cleanly (the >38 fall-through SHA-prefix
 *    only matters for non-DTO programmatic callers).
 *  - reason: @Size(max=512), optional.
 */
export interface CreateUninstallRequest {
  catalogItemId: string;
  idempotencyKey?: string;
  reason?: string;
}

/**
 * POST body for `.../uninstalls/{requestId}/approve`.
 * `reason` is the approver's optional justification (max 512). The
 * maker-checker invariant (approver != proposer) is enforced
 * server-side from the request tenant context — NOT carried in the body
 * (anti-spoof).
 */
export interface ApproveUninstallRequest {
  reason?: string;
}

export interface CreateUninstallArgs {
  deviceId: string;
  body: CreateUninstallRequest;
}

export interface ApproveUninstallArgs {
  deviceId: string;
  requestId: string;
  body?: ApproveUninstallRequest;
}

export interface ListUninstallRequestsArgs {
  deviceId: string;
  page?: number;
  size?: number;
}

export interface ListUninstallAuditsArgs {
  deviceId: string;
  page?: number;
  size?: number;
}

/**
 * RTK Query mutation success surface for `createUninstall` /
 * `approveUninstall`. Both return an `AdminUninstallRequestResponse`
 * (201 PENDING_APPROVAL on propose, 200 APPROVED + commandId on
 * approve).
 */
export type CreateUninstallSuccess = AdminUninstallRequestResponse;
export type ApproveUninstallSuccess = AdminUninstallRequestResponse;

/* ------------------------------------------------------------------ */
/* Badge tone taxonomy (Codex 019e93a4 plan point #4).                */
/*                                                                     */
/* Every UninstallResultStatus + UninstallVerification value is        */
/* assigned a semantic tone. Unknown/future enum codes fall through to */
/* a neutral 'muted' tone in the renderer (the lookup helpers below    */
/* return 'muted' on a miss) and the raw code is rendered verbatim —   */
/* the UI never crashes on an unrecognised value.                      */
/* ------------------------------------------------------------------ */

export type BadgeTone = 'success' | 'warning' | 'danger' | 'muted';

/**
 * Result-status → semantic tone.
 *  - success: authoritative absence proven (SUCCEEDED_VERIFIED) or a
 *    legitimate no-op (SKIP_ALREADY_ABSENT — already gone).
 *  - danger: the package is still present after a "successful" command
 *    (FAILED_VERIFY_GHOST), the command failed outright (FAILED_EXIT),
 *    or residue remains (PARTIAL_RESIDUE).
 *  - muted: we could not assert absence but also cannot assert presence
 *    (every *_INCONCLUSIVE + the unsupported-platform/verification
 *    stubs). Distinct from danger — fail-to-verify, not fail-present.
 */
const UNINSTALL_RESULT_STATUS_TONE: Record<UninstallResultStatus, BadgeTone> = {
  SUCCEEDED_VERIFIED: 'success',
  SKIP_ALREADY_ABSENT: 'success',
  FAILED_VERIFY_GHOST: 'danger',
  FAILED_EXIT: 'danger',
  PARTIAL_RESIDUE: 'danger',
  PARTIAL_INCONCLUSIVE: 'muted',
  FAILED_PRECHECK_INCONCLUSIVE: 'muted',
  FAILED_UNSUPPORTED_PLATFORM: 'muted',
  FAILED_UNSUPPORTED_VERIFICATION: 'muted',
};

/**
 * Verification → semantic tone.
 *  - success: ABSENT_VERIFIED (authoritative absence).
 *  - danger: PRESENT_VERIFIED (still installed) / RESIDUE_PRESENT
 *    (partial leftovers detected).
 *  - muted: VERIFY_INCONCLUSIVE / NOT_RUN.
 */
const UNINSTALL_VERIFICATION_TONE: Record<UninstallVerification, BadgeTone> = {
  ABSENT_VERIFIED: 'success',
  PRESENT_VERIFIED: 'danger',
  RESIDUE_PRESENT: 'danger',
  VERIFY_INCONCLUSIVE: 'muted',
  NOT_RUN: 'muted',
};

/**
 * Known result-status set, used by the renderer to decide between an
 * i18n label (known) and the raw code verbatim (unknown — future
 * backend roll-out).
 */
const KNOWN_RESULT_STATUSES: ReadonlySet<string> = new Set<UninstallResultStatus>([
  'SUCCEEDED_VERIFIED',
  'SKIP_ALREADY_ABSENT',
  'FAILED_VERIFY_GHOST',
  'FAILED_EXIT',
  'PARTIAL_RESIDUE',
  'PARTIAL_INCONCLUSIVE',
  'FAILED_PRECHECK_INCONCLUSIVE',
  'FAILED_UNSUPPORTED_PLATFORM',
  'FAILED_UNSUPPORTED_VERIFICATION',
]);

const KNOWN_VERIFICATIONS: ReadonlySet<string> = new Set<UninstallVerification>([
  'ABSENT_VERIFIED',
  'PRESENT_VERIFIED',
  'RESIDUE_PRESENT',
  'VERIFY_INCONCLUSIVE',
  'NOT_RUN',
]);

/** Open (non-terminal) request states — drive the "Onay bekliyor" pill. */
const OPEN_REQUEST_STATES: ReadonlySet<string> = new Set<UninstallRequestState>([
  'PENDING_APPROVAL',
  'APPROVED',
  'QUEUED',
  'CLAIMED',
  'RUNNING',
]);

export function isKnownUninstallResultStatus(value: string): value is UninstallResultStatus {
  return KNOWN_RESULT_STATUSES.has(value);
}

export function isKnownUninstallVerification(value: string): value is UninstallVerification {
  return KNOWN_VERIFICATIONS.has(value);
}

/** Returns the badge tone for a result status; 'muted' for unknown codes. */
export function uninstallResultStatusTone(value: string): BadgeTone {
  return isKnownUninstallResultStatus(value) ? UNINSTALL_RESULT_STATUS_TONE[value] : 'muted';
}

/** Returns the badge tone for a verification; 'muted' for unknown codes. */
export function uninstallVerificationTone(value: string): BadgeTone {
  return isKnownUninstallVerification(value) ? UNINSTALL_VERIFICATION_TONE[value] : 'muted';
}

/** True when a request is in an open (awaiting completion) state. */
export function isOpenUninstallRequest(state: string): boolean {
  return OPEN_REQUEST_STATES.has(state);
}

/* ------------------------------------------------------------------ */
/* Error-body parsing (Codex 019e93ab Q2 = b3).                        */
/*                                                                     */
/* The propose/approve gate failures are ResponseStatusException, which */
/* the backend GlobalExceptionHandler serialises to                    */
/* `{ error, message, fieldErrors, meta }` where `error` and `message` */
/* are BOTH the full English sentence (NOT a stable machine code). The */
/* five distinct 422 sub-reasons therefore cannot be told apart by a   */
/* stable code, so we DO NOT substring-match the sentence. Instead the  */
/* UI shows a localized headline keyed on HTTP status + the server's    */
/* `message` verbatim as the actionable detail. This helper extracts    */
/* the verbatim detail string without ever crashing on an              */
/* unknown/missing body shape.                                         */
/* ------------------------------------------------------------------ */

/**
 * HTTP status → i18n headline-key suffix for an uninstall propose/approve
 * failure. Keep in sync with the `endpointAdmin.drawer.uninstall.error.*`
 * keys in `i18n/index.ts`.
 */
export const UNINSTALL_ERROR_HEADLINE_KEY: Record<number, string> = {
  400: 'endpointAdmin.drawer.uninstall.error.badRequest',
  403: 'endpointAdmin.drawer.uninstall.error.forbidden',
  404: 'endpointAdmin.drawer.uninstall.error.notFound',
  409: 'endpointAdmin.drawer.uninstall.error.conflict',
  422: 'endpointAdmin.drawer.uninstall.error.rejected',
  424: 'endpointAdmin.drawer.uninstall.error.dependency',
  503: 'endpointAdmin.drawer.uninstall.error.disabled',
};

/** Fallback headline key for any status not in the map above. */
export const UNINSTALL_ERROR_HEADLINE_FALLBACK_KEY = 'endpointAdmin.drawer.uninstall.error.generic';

/**
 * Extract a usable HTTP status from an RTK Query error object. RTK
 * surfaces transport errors as `{ status: number, data?: unknown }`;
 * non-HTTP failures (e.g. network) surface `status` as a string
 * ('FETCH_ERROR' / 'PARSING_ERROR' / 'TIMEOUT_ERROR'). Returns the
 * numeric status or null.
 */
export function readErrorStatus(err: unknown): number | null {
  if (err && typeof err === 'object' && 'status' in err) {
    const s = (err as { status: unknown }).status;
    if (typeof s === 'number') return s;
  }
  return null;
}

/**
 * Extract the verbatim server detail message from an RTK Query error
 * body. Reads `data.message` first, then `data.error` (both are the
 * full sentence for ResponseStatusException gate failures), and returns
 * null on any unknown/missing shape so the caller can fall back to a
 * generic localized detail. Never throws.
 */
export function readErrorDetail(err: unknown): string | null {
  if (!err || typeof err !== 'object' || !('data' in err)) return null;
  const data = (err as { data: unknown }).data;
  if (!data || typeof data !== 'object') return null;
  const body = data as { message?: unknown; error?: unknown };
  if (typeof body.message === 'string' && body.message.trim()) return body.message.trim();
  if (typeof body.error === 'string' && body.error.trim()) return body.error.trim();
  return null;
}
