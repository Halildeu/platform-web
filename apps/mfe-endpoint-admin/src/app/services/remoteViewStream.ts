/**
 * Faz 22.6 — fetch-based SSE client for the VIEW_ONLY operator viewer.
 *
 * WHY fetch-SSE and not the native `EventSource`: the viewer endpoint is
 * authenticated with the operator's bearer JWT, and the native `EventSource`
 * API cannot attach an `Authorization` header. WebSocket is also avoided —
 * the upstream is a one-way recording-OFF frame relay, so SSE-over-fetch
 * (request with the header + a `ReadableStream` body reader) is the minimal,
 * proxy-friendly transport. The reader parses the standard SSE framing
 * (`event:` / `data:` / `:comment` blocks separated by a blank line).
 *
 * This module is deliberately transport-only and side-effect-free at import:
 * `fetchImpl` is injectable so a unit test can feed a canned SSE stream, and
 * nothing connects until {@link openRemoteViewStream} is called.
 */
import type {
  RemoteViewFrame,
  RemoteViewMeta,
  RemoteViewStatus,
} from '../../entities/remote-view/types';

export interface RemoteViewStreamHandlers {
  onStatus?: (status: RemoteViewStatus) => void;
  onMeta?: (meta: RemoteViewMeta) => void;
  onFrame?: (frame: RemoteViewFrame) => void;
  onError?: (error: unknown) => void;
}

export interface RemoteViewStreamOptions extends RemoteViewStreamHandlers {
  url: string;
  token: string | null;
  /** Test seam — defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

export interface RemoteViewStreamHandle {
  /** Abort the stream; resolves to `closed` via `onStatus`. Idempotent. */
  close: () => void;
}

export interface RemoteViewRenderAckOptions {
  url: string;
  token: string | null;
  viewerId: string;
  frameSeq: number;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  timeoutMillis?: number;
}

/**
 * Report browser render completion as bounded metadata. The request deliberately carries no frame payload,
 * screen content or input data. Missing authority or any non-204 response fails closed and returns false.
 */
export async function acknowledgeRemoteViewRender(
  opts: RemoteViewRenderAckOptions,
): Promise<boolean> {
  if (!opts.token || !opts.viewerId || !Number.isSafeInteger(opts.frameSeq) || opts.frameSeq < 0) {
    return false;
  }
  const doFetch = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  if (opts.signal?.aborted) controller.abort();
  else opts.signal?.addEventListener('abort', abortFromParent, { once: true });
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMillis ?? 5_000);
  try {
    const response = await doFetch(opts.url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.token}`,
      },
      cache: 'no-store',
      signal: controller.signal,
      body: JSON.stringify({ viewerId: opts.viewerId, frameSeq: opts.frameSeq }),
    });
    return response.status === 204;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
    opts.signal?.removeEventListener('abort', abortFromParent);
  }
}

/**
 * Open the viewer SSE stream. Returns a handle whose `close()` aborts the
 * fetch (idempotent). All terminal outcomes are reported through `onStatus`:
 * `forbidden` (401/403), `busy` (409), `error` (other non-2xx / transport),
 * `closed` (clean end or caller abort).
 */
export function openRemoteViewStream(opts: RemoteViewStreamOptions): RemoteViewStreamHandle {
  const controller = new AbortController();
  const doFetch = opts.fetchImpl ?? fetch;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    controller.abort();
  };

  void (async () => {
    opts.onStatus?.('connecting');
    let response: Response;
    try {
      response = await doFetch(opts.url, {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
        },
        cache: 'no-store',
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) opts.onStatus?.('closed');
      else {
        opts.onError?.(error);
        opts.onStatus?.('error');
      }
      return;
    }

    if (response.status === 401 || response.status === 403) {
      opts.onStatus?.('forbidden');
      return;
    }
    if (response.status === 409) {
      opts.onStatus?.('busy');
      return;
    }
    if (!response.ok || !response.body) {
      opts.onStatus?.('error');
      return;
    }

    opts.onStatus?.('live');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep: number;
        // SSE events are separated by a blank line (\n\n). Handle \r\n\r\n too.
        while ((sep = indexOfEventBoundary(buffer)) >= 0) {
          const rawEvent = buffer.slice(0, sep);
          buffer = buffer.slice(sep + boundaryLength(buffer, sep));
          dispatchEvent(rawEvent, opts);
        }
      }
      opts.onStatus?.('closed');
    } catch (error) {
      if (controller.signal.aborted) opts.onStatus?.('closed');
      else {
        opts.onError?.(error);
        opts.onStatus?.('error');
      }
    }
  })();

  return { close };
}

function indexOfEventBoundary(buffer: string): number {
  const lf = buffer.indexOf('\n\n');
  const crlf = buffer.indexOf('\r\n\r\n');
  if (lf < 0) return crlf;
  if (crlf < 0) return lf;
  return Math.min(lf, crlf);
}

function boundaryLength(buffer: string, sep: number): number {
  return buffer.startsWith('\r\n\r\n', sep) ? 4 : 2;
}

/**
 * Parse one SSE event block and route it. Comment lines (`:` — used for the
 * server heartbeat) are ignored. Malformed JSON is swallowed (a bad frame
 * must never crash the live view).
 */
function dispatchEvent(raw: string, handlers: RemoteViewStreamHandlers): void {
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (line === '' || line.startsWith(':')) continue; // heartbeat / comment
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).replace(/^ /, ''));
    }
  }
  if (dataLines.length === 0) {
    if (event === 'close') handlers.onStatus?.('closed');
    return;
  }
  const data = dataLines.join('\n');
  if (event === 'meta') {
    try {
      const m = JSON.parse(data) as Partial<RemoteViewMeta>;
      handlers.onMeta?.({
        recording: Boolean(m.recording),
        attended: Boolean(m.attended),
        capability: typeof m.capability === 'string' ? m.capability : 'VIEW_ONLY',
        viewerId: typeof m.viewerId === 'string' ? m.viewerId : '',
      });
    } catch {
      /* ignore a malformed meta frame */
    }
  } else if (event === 'frame') {
    try {
      const f = JSON.parse(data) as Partial<RemoteViewFrame>;
      const seq = Number(f.seq);
      const observedAtEpochMillis = Number(f.observedAtEpochMillis);
      const sentAtEpochMillis = Number(f.sentAtEpochMillis);
      if (
        typeof f.dataB64 === 'string' &&
        f.dataB64.length > 0 &&
        typeof f.contentType === 'string' &&
        Number.isSafeInteger(seq) &&
        seq >= 0 &&
        Number.isFinite(observedAtEpochMillis) &&
        observedAtEpochMillis > 0 &&
        Number.isFinite(sentAtEpochMillis) &&
        sentAtEpochMillis >= observedAtEpochMillis
      ) {
        handlers.onFrame?.({
          seq,
          contentType: f.contentType,
          observedAtEpochMillis,
          sentAtEpochMillis,
          dataB64: f.dataB64,
        });
      }
    } catch {
      /* ignore a malformed frame */
    }
  } else if (event === 'close') {
    handlers.onStatus?.('closed');
  }
}
