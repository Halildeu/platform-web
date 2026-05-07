/**
 * Backend wire types for the notification-orchestrator inbox REST API
 * (Faz 23.4 PR-E.5 frontend identity bootstrap).
 *
 * Mirrors the Spring DTOs:
 * - InboxListResponse → InboxListResponseDto
 * - InboxItemResponse → InboxItemDto
 * - UnreadCountResponse → UnreadCountDto
 *
 * Keep this file dependency-free; it is imported by the RTK Query slice
 * and any UI component that consumes the response shape.
 */

/** Inbox row state machine — server-authoritative. */
export type InboxItemState = 'UNREAD' | 'READ' | 'ARCHIVED';

/** Severity ladder mirrored from the backend NotificationIntent.Severity enum. */
export type InboxItemSeverity = 'info' | 'warning' | 'critical';

/**
 * Single inbox row as returned by GET /api/v1/notify/inbox/me and the
 * mark-read / archive POST endpoints.
 *
 * Field naming follows the backend record (camelCase) — the Spring
 * controller already serializes to JSON with camelCase keys; no
 * transformer is required.
 */
export interface InboxItemDto {
  /** Numeric primary key — used by mark-read / archive endpoints. */
  id: number;
  /** Tenant id. Single-tenant for now ("default"). */
  orgId: string;
  /** Owning subscriber id (matches X-Subscriber-Id / current user). */
  subscriberId: string;
  /** Producer-supplied intent identifier (correlates with audit / DLR). */
  intentId: string | null;
  /** Topic key (e.g. "report.export.ready"). */
  topicKey: string;
  /** Severity ladder. */
  severity: InboxItemSeverity;
  /** ISO-8601 timestamp the row was inserted. */
  createdAt: string;
  /** ISO-8601 timestamp of the last state mutation. */
  updatedAt: string;
  /** Current state. */
  state: InboxItemState;
  /** Optional preview body. UI shows this if present. */
  preview: string | null;
  /** Optional structured payload — UI consumers may navigate to
   *  payload.pathname when present (mirrors NotificationCenter convention). */
  meta: Record<string, unknown> | null;
}

/** GET /api/v1/notify/inbox/me response shape (Spring Page<T> + unreadCount). */
export interface InboxListResponseDto {
  items: InboxItemDto[];
  /** Total active rows (UNREAD + READ; ARCHIVED filtered out). */
  totalElements: number;
  totalPages: number;
  pageNumber: number;
  pageSize: number;
  /** Unread count for the badge — distinct from totalElements because
   *  totalElements includes READ rows too. */
  unreadCount: number;
}

/** GET /api/v1/notify/inbox/me/unread-count response. */
export interface UnreadCountDto {
  unreadCount: number;
}

/** Common identity headers required by every "me" endpoint. */
export interface InboxRequestIdentity {
  orgId: string;
  subscriberId: string;
}

/** Pagination args for listMine. */
export interface InboxListArgs extends InboxRequestIdentity {
  page?: number;
  size?: number;
}

/** Path arg shared by mark-read and archive. */
export interface InboxItemActionArgs extends InboxRequestIdentity {
  id: number;
}
