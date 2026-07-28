/**
 * Faz 24 İ2-T — live transcript SSE broadcast client.
 *
 * Backend endpoint: GET /api/v1/audio-gateway/meetings/{meetingId}/live-transcript/stream
 * (See platform-backend#914 / LiveTranscriptStreamController.)
 *
 * This client is for viewers OTHER than the recording desktop — meeting
 * participants who open the meeting on the web while someone else is
 * recording. They subscribe to the same TranscriptResult stream the
 * recorder produces, ephemerally (no replay, no persistence at this
 * layer — canonical persistence is meeting-service's job).
 *
 * Contract:
 *   - Endpoint URL resolved from env var VITE_MEETING_LIVE_TRANSCRIPT_SSE_URL
 *     (contains "{meetingId}" placeholder); undefined = feature not wired.
 *   - Event name "transcript-chunk" carries a JSON TranscriptResult payload.
 *   - Heartbeat is an SSE comment (no data) — EventSource ignores it.
 *   - No PII in local storage or console logs (text is user-facing only).
 */

import type { TranscriptSegment, TranscriptSegmentStatus } from './meeting-workbench';

const DEFAULT_LIVE_TRANSCRIPT_SSE_ENV = 'VITE_MEETING_LIVE_TRANSCRIPT_SSE_URL';

/** Backend TranscriptResult JSON shape (mirrors audio-gateway dto). */
export interface LiveTranscriptChunk {
  text: string;
  language?: string | null;
  languageProbability?: number | null;
  duration?: number | null;
  elapsedMs?: number | null;
  model?: string | null;
  computeType?: string | null;
  device?: string | null;
  /**
   * Durable id this event was stored under — the same id space sourceEventIds
   * is written in. Absent on gateways older than platform-backend#982, in
   * which case folded fragments simply cannot be matched and stay on screen.
   */
  eventId?: string | null;
  /**
   * {@code DRAFT} for a raw committed chunk, {@code UTTERANCE} for a line the
   * gateway assembled from consecutive chunks (audio-gateway
   * LiveTranscriptEvent). Absent on older gateways.
   */
  status?: string | null;
  /** Why the assembled line closed; null for a raw chunk. */
  assemblyReason?: string | null;
  /** The chunks folded into the assembled line, in order; empty for a raw chunk. */
  sourceEventIds?: string[] | null;
}

export type LiveTranscriptSseState =
  | 'not-configured'
  | 'connecting'
  | 'open'
  | 'receiving'
  | 'closed'
  | 'error';

export interface LiveTranscriptSseSnapshot {
  state: LiveTranscriptSseState;
  endpoint?: string;
  lastChunkAt?: string;
  chunks: TranscriptSegment[];
  error?: string;
}

export function resolveLiveTranscriptSseEndpoint(meetingId: string): string | null {
  const env = import.meta.env as Record<string, string | undefined>;
  const configured = env[DEFAULT_LIVE_TRANSCRIPT_SSE_ENV]?.trim();
  if (!configured) {
    return null;
  }
  return configured.replace('{meetingId}', encodeURIComponent(meetingId));
}

/**
 * Backend transcript status -> UI segment status.
 *
 * The gateway folds consecutive chunks into whole lines and marks those
 * {@code UTTERANCE}; a raw chunk stays {@code DRAFT}. Until this mapping
 * existed every live segment was hardcoded to 'draft', so assembled lines
 * never became permanent — and, less obviously, no citation could ever anchor
 * to the live transcript at all, because a citation only counts against a
 * segment whose status is 'final' (see meeting-workbench evidence coverage).
 *
 * Anything we do not recognise stays 'draft' on purpose. 'final' is what makes
 * a line citable, so an unknown status must never be promoted into it.
 */
export function liveStatusToSegmentStatus(status?: string | null): TranscriptSegmentStatus {
  return status === 'UTTERANCE' ? 'final' : 'draft';
}

/**
 * Drop the raw fragments an assembled line folded in.
 *
 * The gateway publishes an assembled line under a NEW id, so without this the
 * viewer reads the same sentence twice — first split, then whole. Desktop hit
 * this first and the complaint was literal: "aynı cümleyi ön satırda
 * okuyorsun".
 *
 * Two deliberate restraints, both copied from the desktop implementation:
 *   - No ids to match means nothing is removed. Showing a duplicate for a
 *     moment beats deleting a line that was never folded.
 *   - Only raw drafts go. A fragment that had already been promoted stays,
 *     because accuracy outranks readability.
 */
export function collapseFoldedFragments(
  segments: readonly TranscriptSegment[],
  sourceEventIds: readonly string[] | null | undefined,
): TranscriptSegment[] {
  if (!sourceEventIds || sourceEventIds.length === 0) {
    return [...segments];
  }
  const folded = new Set(sourceEventIds);
  return segments.filter((segment) => !folded.has(segment.id) || segment.status !== 'draft');
}

/** Convert a backend LiveTranscriptChunk into a UI TranscriptSegment. */
export function chunkToSegment(
  chunk: LiveTranscriptChunk,
  seq: number,
  receivedAtMs: number,
): TranscriptSegment {
  const sourceEventIds = chunk.sourceEventIds ?? undefined;
  return {
    // The gateway id when we have one: it is the id sourceEventIds refers to,
    // so carrying it is what makes an assembled line able to find the
    // fragments it replaced. The local id is only a fallback for gateways
    // that do not send one.
    id: chunk.eventId?.trim() ? chunk.eventId.trim() : `live-sse-${receivedAtMs}-${seq}`,
    speaker: 'Kayıtçı',
    startedAtMs: receivedAtMs,
    status: liveStatusToSegmentStatus(chunk.status),
    text: chunk.text ?? '',
    // Audit trail back to the fragments the gateway folded, so a citation on
    // an assembled line can be traced to the chunks it came from.
    assemblyReason: chunk.assemblyReason ?? undefined,
    sourceEventIds: sourceEventIds && sourceEventIds.length > 0 ? sourceEventIds : undefined,
  };
}

export interface LiveTranscriptSseController {
  close: () => void;
  snapshot: () => LiveTranscriptSseSnapshot;
}

export interface LiveTranscriptSseHandlers {
  onSnapshot?: (snapshot: LiveTranscriptSseSnapshot) => void;
  onError?: (error: string) => void;
}

/**
 * Connect to the live-transcript SSE for {@code meetingId}. Returns a
 * controller with {@code close()} to tear the connection down when the
 * viewer navigates away or the meeting ends.
 *
 * When the endpoint is not configured the returned controller yields a
 * {@code not-configured} snapshot and is a no-op (never opens a socket).
 */
export function connectLiveTranscriptSse(
  meetingId: string,
  handlers: LiveTranscriptSseHandlers = {},
  factory: (url: string) => EventSource = (url) => new EventSource(url, { withCredentials: true }),
): LiveTranscriptSseController {
  const endpoint = resolveLiveTranscriptSseEndpoint(meetingId);
  const chunks: TranscriptSegment[] = [];
  let seq = 0;
  let state: LiveTranscriptSseState = endpoint ? 'connecting' : 'not-configured';
  let lastChunkAt: string | undefined;
  let error: string | undefined;
  let source: EventSource | null = null;

  const snapshot = (): LiveTranscriptSseSnapshot => ({
    state,
    endpoint: endpoint ?? undefined,
    lastChunkAt,
    chunks: [...chunks],
    error,
  });

  const emit = () => {
    handlers.onSnapshot?.(snapshot());
  };

  if (!endpoint) {
    return {
      close: () => {},
      snapshot,
    };
  }

  try {
    source = factory(endpoint);
  } catch (err) {
    state = 'error';
    error = err instanceof Error ? err.message : String(err);
    handlers.onError?.(error);
    emit();
    return { close: () => {}, snapshot };
  }

  source.onopen = () => {
    state = 'open';
    emit();
  };

  source.addEventListener('transcript-chunk', (raw) => {
    try {
      const messageEvent = raw as MessageEvent;
      const parsed = JSON.parse(messageEvent.data) as LiveTranscriptChunk;
      const receivedAtMs = Date.now();
      const segment = chunkToSegment(parsed, seq++, receivedAtMs);
      // Remove what this line folded in BEFORE appending it, so the assembled
      // sentence takes the fragments' place instead of stacking on top of them.
      const remaining = collapseFoldedFragments(chunks, parsed.sourceEventIds);
      chunks.length = 0;
      chunks.push(...remaining, segment);
      lastChunkAt = new Date(receivedAtMs).toISOString();
      state = 'receiving';
      emit();
    } catch (parseErr) {
      // Malformed frame → surface but keep the connection.
      const message = parseErr instanceof Error ? parseErr.message : String(parseErr);
      handlers.onError?.(`transcript-chunk parse: ${message}`);
    }
  });

  source.onerror = () => {
    // Native EventSource retries automatically; we surface the outage but do
    // not tear the source down unless the caller closes.
    state = 'error';
    error = 'SSE bağlantısı geçici olarak koptu; otomatik yeniden bağlanıyor.';
    handlers.onError?.(error);
    emit();
  };

  return {
    close: () => {
      state = 'closed';
      source?.close();
      emit();
    },
    snapshot,
  };
}
