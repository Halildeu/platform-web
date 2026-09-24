import { chunkToSegment, collapseFoldedFragments, type LiveTranscriptChunk } from '../../apps/mfe-meeting/src/meeting-live-transcript-sse';
import type { TranscriptSegment } from '../../apps/mfe-meeting/src/meeting-workbench';
import type { PanelSession } from './auth';
import { UUID, isRecord } from './config';

export class AccessError extends Error {}
export class UnavailableError extends Error {}
export type LiveAnalysis = { summary: string; decisions: string[]; actions: { text: string; owner: string | null; dueDate: string | null }[]; raw: Record<string, unknown> };
export type Meeting = { id: string; title: string };

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    promise.then(value => { signal.removeEventListener('abort', abort); resolve(value); },
      error => { signal.removeEventListener('abort', abort); reject(error); });
  });
}

const pathFor = (id: string, stream: 'transcript' | 'analysis') => {
  if (!UUID.test(id)) throw new Error('invalid_meeting');
  return `/api/v1/audio-gateway/meetings/${id}/live-${stream}/stream`;
};

export async function authorizedFetch(path: string, session: PanelSession, signal: AbortSignal): Promise<Response> {
  // Callers cannot move a bearer token to another origin, including a redirect.
  if (!path.startsWith('/api/') || path.includes('\\') || new URL(path, location.origin).origin !== location.origin)
    throw new Error('invalid_endpoint');
  const deadline = new AbortController();
  const requestSignal = AbortSignal.any([signal, deadline.signal]);
  const timer = setTimeout(() => deadline.abort(new DOMException('Timed out', 'TimeoutError')), 15_000);
  try {
    let token: string;
    try { token = await abortable(session.token(), requestSignal); }
    catch { throw new AccessError('Oturum doğrulanamadı. Yeniden giriş yapın.'); }
    requestSignal.throwIfAborted();
    const response = await abortable(fetch(path, { headers: { Authorization: `Bearer ${token}` },
      credentials: 'omit', cache: 'no-store', redirect: 'error', signal: requestSignal }), requestSignal);
    if (response.status === 401 || response.status === 403) throw new AccessError('Bu toplantıya erişim izniniz yok veya oturumunuz sona erdi.');
    if (response.status === 404) throw new UnavailableError('Toplantı veya canlı yayın kullanıma açık değil.');
    if (!response.ok) throw new Error('Bağlantı kurulamadı.');
    return response;
  } finally { clearTimeout(timer); }
}

export async function loadMeeting(id: string, session: PanelSession, signal: AbortSignal): Promise<Meeting> {
  if (!UUID.test(id)) throw new Error('invalid_meeting');
  const response = await authorizedFetch(`/api/v1/admin/meetings/${id}`, session, signal);
  const data: unknown = await response.json();
  if (!isRecord(data) || data.id !== id || typeof data.title !== 'string') throw new Error('invalid_meeting_response');
  return { id, title: data.title };
}

export async function findMeetings(title: string, session: PanelSession, signal: AbortSignal): Promise<Meeting[]> {
  const response = await authorizedFetch(`/api/v1/admin/meetings?size=25&page=0&title=${encodeURIComponent(title)}`, session, signal);
  const data: unknown = await response.json();
  if (!isRecord(data) || !Array.isArray(data.content) || data.content.length > 25) throw new Error('invalid_meetings');
  return data.content.map(item => {
    if (!isRecord(item) || typeof item.id !== 'string' || !UUID.test(item.id) || typeof item.title !== 'string')
      throw new Error('invalid_meeting');
    return { id: item.id, title: item.title };
  });
}

/** No punctuation rewrite: reuse the canonical web fragment-folding helpers. */
export function receiveTranscript(segments: readonly TranscriptSegment[], raw: unknown, at = Date.now()): TranscriptSegment[] {
  if (!isRecord(raw) || typeof raw.text !== 'string' || raw.text.length > 100_000
    || typeof raw.eventId !== 'string' || !raw.eventId.trim() || raw.eventId.length > 200
    || !['DRAFT', 'UTTERANCE'].includes(String(raw.status))) throw new Error('invalid_transcript');
  if (raw.sourceEventIds !== undefined && raw.sourceEventIds !== null && (!Array.isArray(raw.sourceEventIds)
    || raw.sourceEventIds.length > 2000 || !raw.sourceEventIds.every(id => typeof id === 'string' && id.length <= 200)))
    throw new Error('invalid_sources');
  const chunk = raw as unknown as LiveTranscriptChunk;
  const segment = chunkToSegment(chunk, segments.length, at);
  return [...collapseFoldedFragments(segments.filter(item => item.id !== segment.id), chunk.sourceEventIds), segment];
}

export function receiveAnalysis(raw: unknown, meetingId: string): LiveAnalysis {
  if (!isRecord(raw) || typeof raw.summary !== 'string' || !Array.isArray(raw.decisions)
    || !raw.decisions.every(item => typeof item === 'string') || !Array.isArray(raw.action_items)
    || raw.decisions.length > 1000 || raw.action_items.length > 1000) throw new Error('invalid_analysis');
  for (const key of ['meetingId', 'meeting_id'])
    if (raw[key] != null && raw[key] !== meetingId) throw new Error('wrong_meeting_analysis');
  const nullable = (value: unknown) => value == null ? null : typeof value === 'string' ? value : (() => { throw new Error('invalid_action'); })();
  const actions = raw.action_items.map(item => {
    if (typeof item === 'string') return { text: item, owner: null, dueDate: null };
    if (!isRecord(item) || typeof item.text !== 'string') throw new Error('invalid_action');
    return { text: item.text, owner: nullable(item.owner), dueDate: nullable(item.due_date) };
  });
  return { summary: raw.summary, decisions: raw.decisions as string[], actions, raw };
}

/** Bounded streaming SSE parser: frames, UTF-8 and CRLF may span network chunks. */
export async function readEvents(response: Response, eventName: string, onData: (data: string) => void, signal: AbortSignal): Promise<void> {
  if (!response.headers.get('content-type')?.startsWith('text/event-stream') || !response.body)
    throw new Error('invalid_stream');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let pending = '';
  let event = '';
  let data: string[] = [];
  let size = 0;
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    while (!signal.aborted) {
      const next = await reader.read();
      if (next.done) break;
      pending += decoder.decode(next.value, { stream: true });
      if (pending.length + size > 1_000_000) throw new Error('stream_frame_too_large');
      let end: number;
      while ((end = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, end).replace(/\r$/, '');
        pending = pending.slice(end + 1);
        if (!line) {
          if (event === eventName && data.length && !signal.aborted) onData(data.join('\n'));
          event = ''; data = []; size = 0;
        } else if (!line.startsWith(':')) {
          const colon = line.indexOf(':');
          const field = colon < 0 ? line : line.slice(0, colon);
          const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
          size += line.length;
          if (size > 1_000_000) throw new Error('stream_frame_too_large');
          if (field === 'event') event = value;
          if (field === 'data') data.push(value);
        }
      }
    }
    // An unfinished event at EOF is deliberately not delivered.
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function streamOnce(id: string, kind: 'transcript' | 'analysis', session: PanelSession,
  signal: AbortSignal, onOpen: () => void, onData: (data: unknown) => void): Promise<void> {
  const response = await authorizedFetch(pathFor(id, kind), session, signal);
  onOpen();
  await readEvents(response, kind === 'transcript' ? 'transcript-chunk' : 'analysis',
    data => onData(JSON.parse(data)), signal);
}

/** Re-check the existing server object authorization without interrupting the feed. */
export async function checkLiveAccess(id: string, session: PanelSession, signal: AbortSignal): Promise<void> {
  const response = await authorizedFetch(pathFor(id, 'analysis'), session, signal);
  await response.body?.cancel();
}
