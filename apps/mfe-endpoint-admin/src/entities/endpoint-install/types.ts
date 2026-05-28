/**
 * WEB-014D — Install preflight + install command + install audit DTOs
 * (Faz 22.5; Codex 019e6fd1 plan-time PARTIAL absorb).
 *
 * Backend source-of-truth (platform-backend@endpoint-admin-service):
 *   - dto/v1/admin/InstallPreflightResponse.java (record + nested
 *     InstallPreflightEvidence record)
 *   - dto/v1/admin/CreateInstallRequest.java
 *   - dto/v1/admin/EndpointInstallAuditDto.java
 *   - service/EndpointInstallPreflightService.java (ReasonCode enum,
 *     full vocabulary mirrored below)
 *   - model/InstallPreflightDecisionRecorded.java (PASS | WARN only —
 *     BLOCK never reaches the audit table)
 *   - model/InstallPostVerification.java
 *
 * Nullability discipline (Codex 019e6fd1 must-fix #2): backend records
 * emit JSON `null` for missing values (not field-omitted). All optional
 * scalars are typed `T | null` so consumers cannot accidentally `undefined`-
 * gate around them.
 */
import type { EndpointCommand, CommandResultStatus } from '../endpoint-command/types';

export type InstallPreflightDecision = 'PASS' | 'WARN' | 'BLOCK';

export type InstalledState = 'INSTALLED' | 'NOT_INSTALLED' | 'UNKNOWN';

/**
 * Audit row decision: only PASS / WARN persist (BLOCK preflights never
 * create a command, hence never produce an audit row — backend returns
 * 409 instead).
 */
export type InstallPreflightDecisionRecorded = 'PASS' | 'WARN';

export type InstallPostVerification = 'SATISFIED' | 'UNSATISFIED' | 'UNKNOWN';

/**
 * Mirror of `EndpointInstallPreflightService$ReasonCode` (20 codes,
 * stable wire vocabulary). Unknown codes from a future backend roll-out
 * fall through to the raw string in the UI — the i18n `t()` resolver
 * already returns the key on miss.
 */
export type InstallPreflightReasonCode =
  | 'already_installed_different_version'
  | 'apps_unavailable'
  | 'catalog_item_disabled'
  | 'catalog_item_draft'
  | 'catalog_item_revoked'
  | 'device_decommissioned'
  | 'device_not_online'
  | 'installed_state_unknown'
  | 'installer_type_not_install_ready'
  | 'inventory_missing'
  | 'inventory_stale'
  | 'inventory_unsupported'
  | 'winget_egress_missing'
  | 'winget_egress_partial'
  | 'winget_egress_schema_unsupported'
  | 'winget_egress_unsupported'
  | 'winget_fixed_probe_package_mismatch'
  | 'winget_not_ready'
  | 'winget_package_query_not_found'
  | 'winget_source_list_warning';

export interface InstallPreflightEvidence {
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
  catalogRowVersion: number | null;
  catalogLastUpdatedAt: string | null;
}

export interface InstallPreflightResponse {
  decision: InstallPreflightDecision;
  catalogItemId: string;
  catalogItemUuid: string;
  deviceId: string;
  evaluatedAt: string;
  installedState: InstalledState;
  evidence: InstallPreflightEvidence;
  /** All reason codes (informational; order does not imply severity). */
  reasons: string[];
  /** Subset that drove BLOCK; empty for PASS / WARN. */
  blockingReasons: string[];
  /** Non-blocking codes (PASS-with-warning or WARN). */
  warnings: string[];
  /** Human-readable bullet items for the operator. */
  requirements: string[];
}

/**
 * POST body for `/endpoint-admin/endpoint-devices/{deviceId}/installs`.
 *
 * Backend constraints (CreateInstallRequest.java):
 *  - catalogItemId: @NotBlank @Size(max=128)
 *  - idempotencyKey: @Size(max=40) — caller-supplied SUFFIX only; backend
 *    builds `admin-install:{deviceId(36)}:{catalogUuid(36)}:{key}`
 *    (88-char prefix + supplied key). 36-char UUID v4 fits cleanly.
 *  - reason: @Size(max=512), optional
 */
export interface CreateInstallRequest {
  catalogItemId: string;
  idempotencyKey?: string;
  reason?: string;
}

export interface EndpointInstallAuditDto {
  auditId: string;
  tenantId: string;
  deviceId: string;
  commandId: string;
  /** Public catalog slug (joined from catalog row on read). May be null
   * if the catalog row has been deleted since the install ran. */
  catalogItemId: string | null;
  catalogItemUuid: string;
  catalogPackageId: string | null;
  catalogRowVersion: number | null;
  preflightDecision: InstallPreflightDecisionRecorded;
  preflightDecisionAt: string;
  preflightWarnCodes: string[];
  actorSubject: string;
  approvalSubject: string | null;
  resultStatus: CommandResultStatus | null;
  exitCode: number | null;
  reportedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  postVerification: InstallPostVerification | null;
  detectedPackageId: string | null;
  detectedVersion: string | null;
  postVerificationEvidence: Record<string, unknown> | null;
  redactedPayload: Record<string, unknown> | null;
  rowVersion: number;
  createdAt: string;
}

export interface GetInstallPreflightArgs {
  deviceId: string;
  catalogItemId: string;
}

export interface CreateInstallArgs {
  deviceId: string;
  body: CreateInstallRequest;
}

export interface ListInstallAuditsArgs {
  deviceId: string;
  page?: number;
  size?: number;
}

export interface GetInstallAuditArgs {
  auditId: string;
}

/**
 * RTK Query mutation success surface for `createInstall`. Backend
 * returns an `EndpointCommandDto` on 201 (INSTALL_SOFTWARE command
 * queued). Alias keeps the call site readable without polluting the
 * shared command type with install-only naming.
 */
export type CreateInstallSuccess = EndpointCommand;

const INSTALLED_STATES: ReadonlySet<InstalledState> = new Set<InstalledState>([
  'INSTALLED',
  'NOT_INSTALLED',
  'UNKNOWN',
]);

/* ------------------------------------------------------------------ */
/* Codex 019e6ff0 post-impl must-fix #2 — strict shape validators.    */
/*                                                                     */
/* Background: the previous `tryReadBlockRecompute` only checked       */
/* `Array.isArray(...)` for the four reason/requirements arrays and    */
/* `typeof candidate.evidence === 'object'` for the evidence sub-      */
/* object. A malformed 409 body — e.g. `requirements: [{}, null]` or   */
/* `evidence: { inventorySnapshotRowVersion: "1" }` — therefore        */
/* passed the guard and would crash the modal render at the first      */
/* `.toString()` / `.replace(...)` / `String(rowVersion)` call.        */
/*                                                                     */
/* The validators below mirror the backend record shape one-to-one     */
/* (InstallPreflightEvidence: 12 nullable scalar fields, four          */
/* string-array fields on InstallPreflightResponse). A future backend  */
/* expansion that adds a new scalar to InstallPreflightEvidence is     */
/* allowed (additional properties are accepted), but every key the     */
/* modal already references must satisfy the exact type contract.     */
/* ------------------------------------------------------------------ */

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((item) => typeof item === 'string');
}

function isStringOrNull(v: unknown): v is string | null {
  return v === null || typeof v === 'string';
}

function isNumberOrNull(v: unknown): v is number | null {
  return v === null || typeof v === 'number';
}

function isValidEvidence(v: unknown): v is InstallPreflightEvidence {
  if (!v || typeof v !== 'object') return false;
  const e = v as Partial<InstallPreflightEvidence>;
  if (!isStringOrNull(e.inventorySnapshotId)) return false;
  if (!isNumberOrNull(e.inventorySnapshotRowVersion)) return false;
  if (!isStringOrNull(e.inventoryUpdatedAt)) return false;
  if (!isStringOrNull(e.summaryCollectedAt)) return false;
  if (!isStringOrNull(e.appsCollectedAt)) return false;
  if (!isStringOrNull(e.latestSummaryCommandResultId)) return false;
  if (!isStringOrNull(e.latestFullCommandResultId)) return false;
  if (!isStringOrNull(e.latestWingetEgressCommandResultId)) return false;
  if (!isStringOrNull(e.wingetEgressCollectedAt)) return false;
  if (!isNumberOrNull(e.wingetEgressSchemaVersion)) return false;
  if (!isNumberOrNull(e.catalogRowVersion)) return false;
  if (!isStringOrNull(e.catalogLastUpdatedAt)) return false;
  return true;
}

/**
 * Helper — narrow an unknown RTK Query mutation error payload to an
 * `InstallPreflightResponse` when the backend returned 409 + BLOCK
 * recompute.
 *
 * Codex review chain:
 *  - 019e6fd1 must-fix #4 + 019e6fe4 must-fix #1: shape guard before
 *    mounting the new preflight state.
 *  - 019e6ff0 post-impl must-fix #2: array elements must be strings;
 *    evidence sub-object must satisfy `InstallPreflightEvidence` field
 *    types one-by-one. A malformed body (e.g. `requirements: [{}]` or
 *    `evidence: { inventoryUpdatedAt: 42 }`) now falls through to the
 *    generic error toast instead of crashing render.
 *
 * Validates EVERY field the modal dereferences (decision /
 * catalogItemId / catalogItemUuid / deviceId / evaluatedAt /
 * installedState (enum) / evidence object FIELD-BY-FIELD / reasons /
 * blockingReasons / warnings / requirements arrays-of-string).
 * Returns the response or null.
 */
export function tryReadBlockRecompute(data: unknown): InstallPreflightResponse | null {
  if (!data || typeof data !== 'object') return null;
  const candidate = data as Partial<InstallPreflightResponse>;
  if (candidate.decision !== 'BLOCK') return null;
  if (typeof candidate.catalogItemId !== 'string') return null;
  if (typeof candidate.catalogItemUuid !== 'string') return null;
  if (typeof candidate.deviceId !== 'string') return null;
  if (typeof candidate.evaluatedAt !== 'string') return null;
  if (
    typeof candidate.installedState !== 'string' ||
    !INSTALLED_STATES.has(candidate.installedState as InstalledState)
  ) {
    return null;
  }
  if (!isValidEvidence(candidate.evidence)) return null;
  if (!isStringArray(candidate.reasons)) return null;
  if (!isStringArray(candidate.blockingReasons)) return null;
  if (!isStringArray(candidate.warnings)) return null;
  if (!isStringArray(candidate.requirements)) return null;
  return candidate as InstallPreflightResponse;
}
