import type { NotificationSurfaceItem } from '@mfe/design-system';
import type { InboxItemDto, InboxItemSeverity } from '../api/notify-inbox.types';

/**
 * Maps a backend {@link InboxItemDto} into a design-system
 * {@link NotificationSurfaceItem} so the existing NotificationDrawer
 * UI can render inbox rows alongside (or instead of) local UI events
 * (Faz 23.4 PR-E.5).
 *
 * <h3>Why a mapper</h3>
 *
 * The shell's existing NotificationCenter is tightly coupled to
 * {@code NotificationSurfaceItem}, the design-system shape used by the
 * shared drawer / item card components. The notification-orchestrator
 * inbox surface uses a different DTO. Rather than refactoring the
 * shared UI around a new union type (large blast radius), we adapt the
 * backend DTO at the edge and keep the UI shape stable.
 *
 * <h3>ID prefixing</h3>
 *
 * Local UI events use opaque string ids; backend inbox rows have
 * numeric primary keys. To prevent accidental collision in a 2-tab UX
 * where both lists may flow through the same drawer state, backend
 * items get an {@code "inbox-"} prefix. Consumers can detect a backend
 * item by the prefix or by reading {@code meta.source === "inbox"}.
 *
 * <h3>Severity → priority + type</h3>
 *
 * Backend severity is a 3-level enum (info/warning/critical). The
 * design-system surface has separate {@code type} (visual category)
 * and {@code priority} (sort/emphasis) axes. We map both from severity
 * with the same source so callers don't need to know the mapping.
 */

/** Stable prefix used to distinguish backend rows from local UI events. */
export const INBOX_ITEM_ID_PREFIX = 'inbox-' as const;

/** Reverse the prefix to read the backend row's numeric id. */
export const extractInboxRowId = (surfaceId: string): number | null => {
  if (!surfaceId.startsWith(INBOX_ITEM_ID_PREFIX)) return null;
  const raw = surfaceId.slice(INBOX_ITEM_ID_PREFIX.length);
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Severity → priority mapping (Codex iter-5 RED absorb).
 *
 * NotificationSurfaceItem.priority only accepts {@code "normal" | "high"} —
 * the design-system panel grouping/filter logic treats {@code "high"} as
 * the special "pinned to top" bucket and everything else as ordinary.
 *
 * info/warning collapse to {@code "normal"} (visual distinction is carried
 * by the {@code type} axis: info / warning / error). Only critical
 * promotes to {@code "high"} so it floats to the top alongside being
 * marked {@code pinned}.
 */
const PRIORITY_BY_SEVERITY = {
  info: 'normal',
  warning: 'normal',
  critical: 'high',
} as const;

const TYPE_BY_SEVERITY = {
  info: 'info',
  warning: 'warning',
  critical: 'error',
} as const;

/**
 * Build a NotificationSurfaceItem from an InboxItemDto. The resulting
 * object is stable: same input produces same output (modulo
 * {@code Date.parse} on createdAt). Safe to use in
 * {@code useMemo(() => items.map(toSurfaceItem), [items])}.
 */
export const inboxItemToSurfaceItem = (row: InboxItemDto): NotificationSurfaceItem => {
  const severity: InboxItemSeverity = row.severity ?? 'info';
  const { message, description } = pickMessageAndDescription(row);
  return {
    id: `${INBOX_ITEM_ID_PREFIX}${row.id}`,
    message,
    description,
    type: TYPE_BY_SEVERITY[severity] ?? 'info',
    priority: PRIORITY_BY_SEVERITY[severity] ?? 'normal',
    pinned: severity === 'critical',
    createdAt: parseTimestamp(row.createdAt),
    read: row.state === 'READ',
    meta: {
      source: 'inbox',
      backendId: row.id,
      intentId: row.intentId ?? undefined,
      topicKey: row.topicKey,
      severity,
      locale: row.locale ?? undefined,
      readAt: row.readAt ?? undefined,
      archivedAt: row.archivedAt ?? undefined,
    },
  };
};

/**
 * Build the (message, description) pair from the most informative
 * available DTO fields.
 *
 * Rules (in order):
 * 1. If subject is non-empty, message = subject AND description =
 *    bodyText excerpt when bodyText differs from subject.
 * 2. If subject is empty but bodyText is non-empty, message = bodyText
 *    excerpt AND description is omitted (we already used bodyText for
 *    the message; echoing it would be redundant).
 * 3. Final fallback: message = topicKey, description omitted.
 */
const pickMessageAndDescription = (
  row: InboxItemDto,
): { message: string; description?: string } => {
  const subjectTrim = row.subject?.trim() ?? '';
  const bodyTrim = row.bodyText?.trim() ?? '';

  if (subjectTrim.length > 0) {
    const description =
      bodyTrim.length > 0 && bodyTrim !== subjectTrim ? excerpt(bodyTrim, 240) : undefined;
    return { message: subjectTrim, description };
  }
  if (bodyTrim.length > 0) {
    return { message: excerpt(bodyTrim, 120) };
  }
  return { message: row.topicKey };
};

const excerpt = (text: string, max: number): string => {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
};

const parseTimestamp = (iso: string): number | undefined => {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : undefined;
};
