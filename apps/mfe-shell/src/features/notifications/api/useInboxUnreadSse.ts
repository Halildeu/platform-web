import { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { notifyInboxApi } from './notify-inbox.api';
import type { InboxRequestIdentity } from './notify-inbox.types';

/**
 * Live unread-count subscription via Server-Sent Events
 * (Faz 23.4 PR-E.5 v1 UI / PR4).
 *
 * The notification-orchestrator exposes
 * {@code GET /api/v1/notify/inbox/me/stream?orgId=...&subscriberId=...}
 * which emits a {@code "unread-count"} SSE event whenever a row in the
 * subscriber's inbox transitions through UNREAD/READ/ARCHIVED. The event
 * payload is JSON: {@code { unreadCount: <number> }}. Every 25 s the
 * server also emits an SSE comment (heartbeat) to keep intermediary
 * proxies from idling out.
 *
 * <h3>Why this hook (not just polling)</h3>
 *
 * RTK Query already exposes a {@code useGetUnreadCountQuery} hook that
 * could be polled with {@code refetchOnFocus} / {@code pollingInterval}.
 * But the badge is a live UX concern — users expect the count to drop the
 * moment they read a notification on another device or another tab.
 * Polling burns server cycles for an answer that is usually unchanged;
 * SSE pushes the new count exactly when it changes and lets the badge
 * update with sub-second latency.
 *
 * <h3>Cache integration</h3>
 *
 * On every {@code unread-count} event the hook patches the
 * {@code getUnreadCount} RTK Query cache directly (no refetch round
 * trip) and invalidates the {@code Inbox / LIST} tag so the drawer's
 * list view re-fetches whenever it is mounted. This keeps the
 * single-source-of-truth in the RTK Query store; consuming components
 * (NotificationBell, NotificationCenter) still read from the same hooks
 * they already used.
 *
 * <h3>Identity gating + reconnect</h3>
 *
 * The hook is a no-op until {@code identity} is non-null (matches the
 * "skip RTK Query while AuthBootstrapper is resolving" pattern in the
 * caller). On identity change or unmount the existing EventSource is
 * closed cleanly. On error the hook applies an exponential backoff
 * (1s → 2s → 4s → … capped at 30s) and reconnects, so a brief network
 * blip doesn't strand the badge in stale state. The backoff resets to
 * 1s on a successful open.
 *
 * <h3>Auth</h3>
 *
 * EventSource's standard constructor doesn't carry custom headers, so
 * {@code orgId / subscriberId} ride on the query string per the backend
 * controller's contract (see {@code InboxSseController} javadoc). The
 * hook passes {@code withCredentials: true} so the gateway httpOnly JWT
 * cookie travels with the connection — backend
 * {@link com.serban.notify.api.SubscriberIdentityGuard} matches the
 * query subscriberId against the JWT principal.
 */

/** Maximum backoff window between reconnects, in ms. */
const MAX_BACKOFF_MS = 30_000;
/** Initial backoff delay; doubles on each consecutive failure. */
const INITIAL_BACKOFF_MS = 1_000;

/** Public hook return shape — exposes a small status surface for tests / debug. */
export interface InboxUnreadSseStatus {
  /** {@code true} once the underlying EventSource reaches OPEN at least once. */
  connected: boolean;
  /**
   * Last unread count pushed by the server. {@code null} means the hook
   * has not yet received an event in this session — the badge should
   * fall back to {@code useGetUnreadCountQuery} or treat as 0.
   */
  lastUnreadCount: number | null;
  /** Number of consecutive reconnect attempts since the last success. */
  retryCount: number;
}

/**
 * Subscribe to the live unread-count SSE stream for the supplied
 * identity. Returns a small status object useful for telemetry / tests
 * and triggers as a side effect a cache update on every event.
 *
 * Pass {@code null} when the user is not authenticated; the hook becomes
 * a no-op and any prior connection is torn down.
 */
export function useInboxUnreadSse(identity: InboxRequestIdentity | null): InboxUnreadSseStatus {
  const dispatch = useDispatch();
  const [status, setStatus] = useState<InboxUnreadSseStatus>({
    connected: false,
    lastUnreadCount: null,
    retryCount: 0,
  });

  // Refs so the connect callback can be referenced inside its own
  // setTimeout closure without re-running the effect.
  const sourceRef = useRef<EventSource | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef<number>(INITIAL_BACKOFF_MS);
  const retryCountRef = useRef<number>(0);
  const cancelledRef = useRef<boolean>(false);

  useEffect(() => {
    if (!identity) {
      // Identity unresolved or signed out → tear down any existing
      // connection and stay idle until identity becomes truthy again.
      teardown();
      setStatus({ connected: false, lastUnreadCount: null, retryCount: 0 });
      return;
    }

    cancelledRef.current = false;
    backoffRef.current = INITIAL_BACKOFF_MS;
    retryCountRef.current = 0;

    const connect = () => {
      if (cancelledRef.current) return;

      const url = buildStreamUrl(identity);
      let es: EventSource;
      try {
        es = new EventSource(url, { withCredentials: true });
      } catch {
        // EventSource is not available (SSR / unsupported runtime). Bail
        // out silently — the badge falls back to polling via
        // useGetUnreadCountQuery.
        return;
      }
      sourceRef.current = es;

      es.addEventListener('open', () => {
        backoffRef.current = INITIAL_BACKOFF_MS;
        retryCountRef.current = 0;
        setStatus((prev) => ({ ...prev, connected: true, retryCount: 0 }));
      });

      es.addEventListener('unread-count', (event: MessageEvent) => {
        const parsed = parseUnreadEvent(event.data);
        if (parsed === null) return;
        // Patch the getUnreadCount cache so the bell re-renders
        // immediately, and invalidate the Inbox LIST tag so the next
        // drawer open re-fetches the row collection.
        dispatch(
          notifyInboxApi.util.upsertQueryData('getUnreadCount', identity, {
            unreadCount: parsed,
          }),
        );
        dispatch(notifyInboxApi.util.invalidateTags([{ type: 'Inbox', id: 'LIST' }]));
        setStatus((prev) => ({ ...prev, lastUnreadCount: parsed }));
      });

      es.addEventListener('error', () => {
        // EventSource dispatches 'error' both on transient blips and on
        // hard close. Treat both as a reconnect signal — the server is
        // designed to be reconnected to.
        retryCountRef.current += 1;
        setStatus((prev) => ({ ...prev, connected: false, retryCount: retryCountRef.current }));
        es.close();
        sourceRef.current = null;
        scheduleReconnect();
      });
    };

    const scheduleReconnect = () => {
      if (cancelledRef.current) return;
      const delay = Math.min(backoffRef.current, MAX_BACKOFF_MS);
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
      retryTimerRef.current = setTimeout(connect, delay);
    };

    connect();
    return () => teardown();

    function teardown() {
      cancelledRef.current = true;
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (sourceRef.current !== null) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
    }
    // Effect intentionally re-runs only when the identity *values* change
    // — listing `identity` itself would force a reconnect on every render
    // when the parent rebuilds the object reference, which is a much
    // worse UX than the trade-off of a stable orgId/subscriberId pair.
    // dispatch is from react-redux and is already stable across renders.
  }, [identity?.orgId, identity?.subscriberId, dispatch]);

  return status;
}

/**
 * Build the absolute SSE endpoint URL. Same pattern as
 * {@code resolveInboxBaseUrl} in {@code notify-inbox.api.ts} so
 * jsdom + production both resolve a valid URL for {@code EventSource},
 * which (unlike fetch) does not accept relative paths.
 */
function buildStreamUrl(identity: InboxRequestIdentity): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'http://localhost';
  const params = new URLSearchParams({
    orgId: identity.orgId,
    subscriberId: identity.subscriberId,
  });
  return `${origin}/api/v1/notify/inbox/me/stream?${params.toString()}`;
}

/**
 * Parse the {@code unread-count} event payload defensively. The backend
 * sends {@code { unreadCount: <number> }} but malformed payloads
 * (network noise, truncated frames) should not crash the badge.
 */
function parseUnreadEvent(raw: string): number | null {
  try {
    const parsed = JSON.parse(raw) as { unreadCount?: unknown };
    const value = parsed?.unreadCount;
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return value;
    }
    return null;
  } catch {
    return null;
  }
}
