/**
 * Backend wire types for the notification-orchestrator inbox REST API
 * (Faz 23.4 PR-E.5 frontend identity bootstrap).
 *
 * Mirrors the Spring DTOs verbatim:
 * - {@code InboxItemResponse} → {@link InboxItemDto}
 * - {@code InboxListResponse} → {@link InboxListResponseDto}
 * - {@code InboxController.UnreadCountResponse} → {@link UnreadCountDto}
 *
 * Field naming follows the backend record (camelCase) — the Spring
 * controller already serializes JSON with camelCase keys; no transformer
 * is required.
 *
 * Reference (notification-orchestrator/src/main/java/com/serban/notify/api/dto):
 * - InboxItemResponse.java
 * - InboxListResponse.java
 *
 * Keep this file dependency-free; it is imported by the RTK Query slice
 * and any UI component that consumes the response shape.
 */

/** Inbox row state machine — server-authoritative. */
export type InboxItemState = 'UNREAD' | 'READ' | 'ARCHIVED';

/**
 * Severity ladder mirrored from the backend NotificationIntent.Severity
 * enum. Values are case-sensitive and lowercase.
 */
export type InboxItemSeverity = 'info' | 'warning' | 'critical';

/**
 * Single inbox row as returned by GET /api/v1/notify/inbox/me and the
 * mark-read / archive POST endpoints.
 *
 * Note: the backend deliberately excludes raw {@code subscriber_id} and
 * {@code org_id} from the response — the caller already knows them from
 * the JWT/header context. This DTO is inbox-specific surface only.
 */
export interface InboxItemDto {
  /** Numeric primary key — used by mark-read / archive endpoints. */
  id: number;
  /** Producer-supplied intent identifier (correlates with audit / DLR). */
  intentId: string | null;
  /** Notification subject line — short, suitable for the list header. */
  subject: string | null;
  /** Plain-text body — preferred for the drawer preview. */
  bodyText: string | null;
  /** HTML body — used when the UI renders rich content (sanitized). */
  bodyHtml: string | null;
  /** Locale tag (e.g. "tr-TR") — UI may pick a localized display style. */
  locale: string | null;
  /** Topic key (e.g. "report.export.ready"). */
  topicKey: string;
  /** Severity ladder. */
  severity: InboxItemSeverity;
  /** Current state. */
  state: InboxItemState;
  /** ISO-8601 timestamp when the row transitioned to READ (null if UNREAD). */
  readAt: string | null;
  /** ISO-8601 timestamp when the row was archived (null if active). */
  archivedAt: string | null;
  /** ISO-8601 timestamp the row was inserted. */
  createdAt: string;
  /** ISO-8601 timestamp after which the row should not be shown
   *  (null if no expiry). UI may filter expired rows client-side. */
  expiresAt: string | null;
}

/**
 * GET /api/v1/notify/inbox/me response shape.
 *
 * Field names match the backend record exactly: {@code page} and
 * {@code size} (NOT pageNumber/pageSize — that was an earlier draft).
 */
export interface InboxListResponseDto {
  items: InboxItemDto[];
  /** Zero-based page index. */
  page: number;
  /** Page size requested. */
  size: number;
  /** Total active rows (UNREAD + READ; ARCHIVED filtered out). */
  totalElements: number;
  totalPages: number;
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
