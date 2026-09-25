import type { PanelSession } from './auth';
import { isRecord, UUID } from './config';

export type CalendarEvent = { eventId: string; title: string; startsAt: string; endsAt: string };
export type CalendarChoices = { items: CalendarEvent[]; truncated: boolean };
export type ScheduleState = 'pending' | 'dispatching' | 'joined' | 'cancelled' | 'expired' | 'failed';
export type CalendarSchedule = { meetingId: string; state: ScheduleState; startsAt: string; endsAt: string };
export class CalendarError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    promise.then(value => { signal.removeEventListener('abort', abort); resolve(value); },
      error => { signal.removeEventListener('abort', abort); reject(error); });
  });
}

/** Deadline covers token acquisition, response headers AND the bounded response body. */
async function request(id: string, route: 'events' | 'schedule', method: 'GET' | 'POST' | 'DELETE',
  session: PanelSession, signal: AbortSignal, body?: unknown): Promise<unknown> {
  if (!UUID.test(id)) throw new CalendarError(400, 'Geçersiz toplantı.');
  const deadline = new AbortController();
  const combined = AbortSignal.any([signal, deadline.signal]);
  const timer = setTimeout(() => deadline.abort(new DOMException('Timed out', 'TimeoutError')), 30_000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const token = await abortable(session.token(), combined);
    combined.throwIfAborted();
    const response = await abortable(fetch(`/api/v1/admin/meetings/${id}/teams-calendar/${route}`, {
      method, headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body), credentials: 'omit', cache: 'no-store', redirect: 'error', signal: combined,
    }), combined);
    const expected = method === 'DELETE' ? 204 : method === 'POST' && route === 'schedule' ? 202 : 200;
    if (response.status !== expected) {
      void response.body?.cancel().catch(() => undefined);
      // No server error content, internal IDs or credentials are rendered.
      const message = response.status === 401 ? 'Oturum sona erdi. Yeniden giriş yapın.'
        : response.status === 403 ? 'Bu toplantının bot katılımını yönetme yetkiniz yok.'
          : response.status === 409 ? 'Katılım durumu değişmiş. Güncel durumu kontrol edin.'
            : 'Takvim bağlantısı doğrulanamadı. Yeniden kontrol edin.';
      throw new CalendarError(response.status, message);
    }
    if (expected === 204) return null;
    if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '') || !response.body)
      throw new CalendarError(502, 'Takvim yanıtı okunamadı.');
    reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let text = ''; let size = 0;
    while (true) {
      const part = await abortable(reader.read(), combined);
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 1_048_576) throw new CalendarError(502, 'Takvim yanıtı çok büyük.');
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } finally {
    clearTimeout(timer);
    if (reader) { void reader.cancel().catch(() => undefined); reader.releaseLock(); }
    deadline.abort();
  }
}

const eventIdValid = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_+=/\-]{1,2048}$/.test(value);
const timeValid = (value: unknown): value is string => typeof value === 'string'
  && /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,9})?)?(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
function schedule(value: unknown, id: string): CalendarSchedule {
  if (!isRecord(value) || value.meetingId !== id || !['pending', 'dispatching', 'joined', 'cancelled', 'expired', 'failed'].includes(String(value.state))
    || !timeValid(value.startsAt) || !timeValid(value.endsAt) || Date.parse(value.endsAt) <= Date.parse(value.startsAt))
    throw new CalendarError(502, 'Katılım durumu doğrulanamadı.');
  return { meetingId: id, state: value.state as ScheduleState, startsAt: value.startsAt, endsAt: value.endsAt };
}

export async function readSchedule(id: string, session: PanelSession, signal: AbortSignal): Promise<CalendarSchedule | null> {
  try { return schedule(await request(id, 'schedule', 'GET', session, signal), id); }
  catch (error) { if (error instanceof CalendarError && error.status === 404) return null; throw error; }
}
export async function selectEvent(id: string, eventId: string, session: PanelSession, signal: AbortSignal): Promise<CalendarSchedule> {
  if (!eventIdValid(eventId)) throw new CalendarError(400, 'Geçersiz takvim seçimi.');
  return schedule(await request(id, 'schedule', 'POST', session, signal, { eventId }), id);
}
export async function cancelSchedule(id: string, session: PanelSession, signal: AbortSignal): Promise<void> {
  await request(id, 'schedule', 'DELETE', session, signal);
}
export async function browseEvents(id: string, from: string, to: string, session: PanelSession, signal: AbortSignal): Promise<CalendarChoices> {
  if (!timeValid(from) || !timeValid(to) || Date.parse(to) <= Date.parse(from) || Date.parse(to) - Date.parse(from) > 31 * 86400_000)
    throw new CalendarError(400, 'En fazla 31 günlük bir tarih aralığı seçin.');
  const value = await request(id, 'events', 'POST', session, signal, { from, to });
  if (!isRecord(value) || !Array.isArray(value.items) || value.items.length > 500 || typeof value.truncated !== 'boolean')
    throw new CalendarError(502, 'Takvim listesi doğrulanamadı.');
  const seen = new Set<string>();
  const items = value.items.map(item => {
    if (!isRecord(item) || !eventIdValid(item.eventId) || seen.has(item.eventId) || typeof item.title !== 'string' || item.title.length > 1024
      || !timeValid(item.startsAt) || !timeValid(item.endsAt) || Date.parse(item.endsAt) <= Date.parse(item.startsAt)
      || Date.parse(item.startsAt) < Date.parse(from) || Date.parse(item.startsAt) >= Date.parse(to))
      throw new CalendarError(502, 'Takvim listesi doğrulanamadı.');
    seen.add(item.eventId);
    return { eventId: item.eventId, title: item.title, startsAt: item.startsAt, endsAt: item.endsAt };
  });
  return { items, truncated: value.truncated };
}
