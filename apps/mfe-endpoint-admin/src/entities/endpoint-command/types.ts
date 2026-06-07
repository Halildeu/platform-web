/**
 * Backend DTO mirror — `EndpointCommandDto` (record).
 *
 * Source-of-truth (platform-backend):
 *   endpoint-admin-service/src/main/java/com/example/endpointadmin/
 *     dto/v1/admin/EndpointCommandDto.java
 *     dto/v1/admin/EndpointCommandResultDto.java
 *     dto/v1/admin/CreateEndpointCommandRequest.java
 *     dto/v1/admin/ApproveEndpointCommandRequest.java
 *     model/CommandType.java
 *     model/CommandStatus.java
 *     model/ApprovalStatus.java
 *     model/ApprovalDecision.java
 *     model/CommandResultStatus.java
 *
 * `Instant` fields serialize as ISO-8601 strings (Jackson default).
 * `Map<String, Object>` fields arrive as JSON objects with unknown shape.
 */

export type CommandType =
  | 'COLLECT_INVENTORY'
  | 'LOCK_USER_LOGIN'
  | 'UNLOCK_USER_LOGIN'
  | 'CHANGE_LOCAL_PASSWORD'
  | 'ROTATE_CREDENTIAL'
  | 'SMB_LIST_ALLOWED_PATH'
  | 'SMB_READ_FILE_METADATA'
  | 'SMB_DOWNLOAD_FILE'
  | 'SMB_UPLOAD_FILE'
  | 'INSTALL_SOFTWARE'
  // AG-029 (Faz 22.5) — catalog-bound signed agent self-update. Dispatched
  // via the dedicated BE-032 endpoint (NOT the generic /commands surface);
  // surfaced as a recent command in the device drawer, so it is part of the
  // union for type-safe "Son komutlar" rendering.
  | 'UPDATE_AGENT';

export type CommandStatus =
  | 'QUEUED'
  | 'DELIVERED'
  | 'ACKED'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'EXPIRED'
  | 'CANCELLED';

export type ApprovalStatus = 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED';

export type ApprovalDecision = 'APPROVE' | 'REJECT';

// Backend-exact mirror of platform-backend
// `endpoint-admin-service/.../model/CommandResultStatus.java` —
// `SUCCEEDED | FAILED | PARTIAL | UNSUPPORTED`. Old `TIMEOUT | CANCELLED`
// values were drift; Codex 019e6b16 iter-2 must-fix #2 (WEB-011 review).
// `CommandStatus.CANCELLED` is a separate domain (delivery lifecycle) and
// is left untouched above.
export type CommandResultStatus = 'SUCCEEDED' | 'FAILED' | 'PARTIAL' | 'UNSUPPORTED';

export interface EndpointCommandResult {
  id: string;
  status: CommandResultStatus;
  payload: Record<string, unknown> | null;
  errorCode: string | null;
  errorMessage: string | null;
  exitCode: number | null;
  /** ISO-8601 timestamp from `Instant`. */
  reportedAt: string;
  /** ISO-8601 timestamp from `Instant`. */
  createdAt: string;
}

export interface EndpointCommand {
  id: string;
  tenantId: string;
  deviceId: string;
  type: CommandType;
  idempotencyKey: string | null;
  status: CommandStatus;
  approvalStatus: ApprovalStatus;
  payload: Record<string, unknown> | null;
  priority: number | null;
  attemptCount: number | null;
  maxAttempts: number | null;
  lockedBy: string | null;
  /** ISO-8601 timestamp from `Instant`. */
  lockedUntil: string | null;
  /** ISO-8601 timestamp from `Instant`. */
  visibleAfterAt: string | null;
  /** ISO-8601 timestamp from `Instant`. */
  expiresAt: string | null;
  issuedBySubject: string | null;
  /** ISO-8601 timestamp from `Instant`. */
  issuedAt: string | null;
  /** ISO-8601 timestamp from `Instant`. */
  deliveredAt: string | null;
  /** ISO-8601 timestamp from `Instant`. */
  ackedAt: string | null;
  /** ISO-8601 timestamp from `Instant`. */
  startedAt: string | null;
  /** ISO-8601 timestamp from `Instant`. */
  completedAt: string | null;
  /** ISO-8601 timestamp from `Instant`. */
  cancelledAt: string | null;
  lastError: string | null;
  /** ISO-8601 timestamp from `Instant`. */
  createdAt: string;
  /** ISO-8601 timestamp from `Instant`. */
  updatedAt: string;
  result: EndpointCommandResult | null;
}

/**
 * Backend `CreateEndpointCommandRequest` body. The `deviceId` field is
 * present in the DTO for the alternate `POST /endpoint-commands` route but
 * is omitted here because we always call the path-scoped
 * `POST /endpoint-devices/{deviceId}/commands` variant.
 */
export interface CreateEndpointCommandBody {
  type: CommandType;
  idempotencyKey?: string;
  /** Max 512 chars (backend `@Size(max=512)`). */
  reason?: string;
  payload?: Record<string, unknown>;
  /** 0..1000 (backend `@Min(0)` / `@Max(1000)`). */
  priority?: number;
  /** 1..10 (backend `@Min(1)` / `@Max(10)`). */
  maxAttempts?: number;
  visibleAfterAt?: string;
  expiresAt?: string;
}

/**
 * Backend `CreateLocalPasswordChangeRequest` body. This dedicated path is
 * intentionally separate from `CreateEndpointCommandRequest`: the browser
 * supplies only local username + reason, while the backend generates and
 * stores the one-time password through its encrypted command-secret path.
 */
export interface CreateLocalPasswordChangeBody {
  username: string;
  idempotencyKey?: string;
  /** Max 512 chars. */
  reason: string;
  notBefore?: string;
  expiresAt?: string;
}

/** Backend `CreateLocalPasswordChangeResponse` body. */
export interface CreateLocalPasswordChangeResponse {
  command: EndpointCommand;
  /**
   * Returned only on first create. Idempotency replay must return null so
   * the browser cannot redisplay an old generated secret.
   */
  oneTimePassword: string | null;
}

/** Backend `ApproveEndpointCommandRequest` body. */
export interface ApproveEndpointCommandBody {
  decision: ApprovalDecision;
  /** Required for REJECT, optional for APPROVE. Max 512 chars. */
  reason?: string;
}

/* ------------------------------------------------------------------ */
/*  UI classification helpers                                          */
/* ------------------------------------------------------------------ */

/**
 * Destructive command types require dual-control approval. They surface
 * as a confirmation modal in the UI and are blocked when the device is
 * not online.
 */
export const DESTRUCTIVE_COMMAND_TYPES: readonly CommandType[] = [
  'LOCK_USER_LOGIN',
  'UNLOCK_USER_LOGIN',
  'CHANGE_LOCAL_PASSWORD',
  'ROTATE_CREDENTIAL',
] as const;

/**
 * Active (non-terminal) command statuses — drawer polling should keep
 * refreshing while a command is in any of these states.
 */
export const ACTIVE_COMMAND_STATUSES: readonly CommandStatus[] = [
  'QUEUED',
  'DELIVERED',
  'ACKED',
  'RUNNING',
] as const;

export function isDestructiveCommand(type: CommandType): boolean {
  return DESTRUCTIVE_COMMAND_TYPES.includes(type);
}

export function isCommandActive(status: CommandStatus): boolean {
  return ACTIVE_COMMAND_STATUSES.includes(status);
}
