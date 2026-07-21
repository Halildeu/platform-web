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

import type { TranscriptSegment } from './meeting-workbench';

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

/** Convert a backend LiveTranscriptChunk into a UI TranscriptSegment. */
export function chunkToSegment(
  chunk: LiveTranscriptChunk,
  seq: number,
  receivedAtMs: number,
): TranscriptSegment {
  return {
    id: `live-sse-${receivedAtMs}-${seq}`,
    speaker: 'Kayıtçı',
    startedAtMs: receivedAtMs,
    status: 'draft',
    text: chunk.text ?? '',
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
      chunks.push(chunkToSegment(parsed, seq++, receivedAtMs));
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
