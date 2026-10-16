import type { PanelSession } from './auth';
import { isRecord, UUID } from './config';

export type RecordingTerms = { version: string; text: string; sha256: string; locale: string; maximumLifetimeSeconds: number };
export type RecordingRequest = { requestKey: string; consentVersion: string; consentTextHash: string; locale: string; expiresAt: string };
export type RecordingView = { intentId: string; meetingId: string; requestKey: string; state: 'GRANTED' | 'BOUND' | 'REVOKED';
  revision: number; createdAt: string; expiresAt: string; revokedAt: string | null; consentVersion: string; consentTextHash: string };
export type RecordingReceipt = { terms: RecordingTerms; request: RecordingRequest };
export class RecordingError extends Error {
  constructor(public readonly status: number, message: string, public readonly serverTime: number | null = null) { super(message); }
}
const invalid = () => new RecordingError(502, 'Kayıt onayı yanıtı doğrulanamadı.');
const hashValid = (x: unknown): x is string => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const timeValid = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(x) && Number.isFinite(Date.parse(x));

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const stop = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', stop, { once: true }); if (signal.aborted) stop();
    promise.then(value => { signal.removeEventListener('abort', stop); resolve(value); },
      error => { signal.removeEventListener('abort', stop); reject(error); });
  });
}
async function request(id: string, route: string, method: 'GET' | 'POST' | 'DELETE', session: PanelSession,
  signal: AbortSignal, body?: RecordingRequest): Promise<unknown> {
  if (!UUID.test(id) || !(route === '' || route === '/terms' || /^\/(?:requests\/)?[0-9a-f-]{36}$/i.test(route)
    || /^\?beforeIntentId=[0-9a-f-]{36}$/i.test(route))) throw invalid();
  const deadline = new AbortController(); const combined = AbortSignal.any([signal, deadline.signal]);
  const timer = setTimeout(() => deadline.abort(new DOMException('Timed out', 'TimeoutError')), 30_000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const token = await abortable(session.token(), combined); combined.throwIfAborted();
    const response = await abortable(fetch(`/api/v1/meetings/${id}/bot-recording-intents${route}`, {
      method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined, credentials: 'omit', redirect: 'error', cache: 'no-store', signal: combined,
    }), combined);
    if (response.status !== 200) {
      void response.body?.cancel().catch(() => undefined);
      throw new RecordingError(response.status, response.status === 401 ? 'Oturum sona erdi. Yeniden giriş yapın.'
        : response.status === 403 ? 'Yeni kayıt onayı verme yetkiniz yok.'
          : response.status === 404 ? 'Onay sonucu henüz bulunamadı. Aynı isteğin durumunu tekrar kontrol edin.'
            : response.status === 409 ? 'Onay bilgileri değişmiş. Mevcut isteğin durumunu kontrol edin.'
              : 'Kayıt onayı işlemi doğrulanamadı. Durumu tekrar kontrol edin.',
      Number.isFinite(Date.parse(response.headers.get('date') ?? '')) ? Date.parse(response.headers.get('date')!) : null);
    }
    if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '') || !response.body) throw invalid();
    reader = response.body.getReader(); const decoder = new TextDecoder('utf-8', { fatal: true }); let size = 0; let text = '';
    while (true) {
      const part = await abortable(reader.read(), combined); if (part.done) break;
      size += part.value.byteLength; if (size > 65_536) throw invalid();
      text += decoder.decode(part.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } finally {
    clearTimeout(timer); if (reader) { void reader.cancel().catch(() => undefined); reader.releaseLock(); } deadline.abort();
  }
}
async function terms(value: unknown): Promise<RecordingTerms> {
  if (!isRecord(value) || typeof value.version !== 'string' || !/^[A-Za-z0-9._:-]{1,100}$/.test(value.version)
    || typeof value.text !== 'string' || !value.text.trim() || value.text.length > 16_384 || !hashValid(value.sha256)
    || typeof value.locale !== 'string' || !/^[A-Za-z0-9-]{1,35}$/.test(value.locale)
    || !Number.isInteger(value.maximumLifetimeSeconds) || Number(value.maximumLifetimeSeconds) < 60 || Number(value.maximumLifetimeSeconds) > 86400) throw invalid();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value.text));
  if (Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('') !== value.sha256) throw invalid();
  return value as RecordingTerms;
}
function view(value: unknown, id: string, original: RecordingRequest, intentId?: string): RecordingView {
  if (!isRecord(value) || typeof value.intentId !== 'string' || !UUID.test(value.intentId) || (intentId && intentId !== value.intentId)
    || value.meetingId !== id || value.requestKey !== original.requestKey || value.consentVersion !== original.consentVersion
    || value.consentTextHash !== original.consentTextHash || !timeValid(value.expiresAt) || Date.parse(value.expiresAt) !== Date.parse(original.expiresAt)
    || !timeValid(value.createdAt) || Date.parse(value.createdAt) >= Date.parse(value.expiresAt)
    || !['GRANTED', 'BOUND', 'REVOKED'].includes(String(value.state))
    || (value.state === 'GRANTED' && value.revision !== 1) || (value.state === 'BOUND' && value.revision !== 2)
    || (value.state === 'REVOKED' && (value.revision !== 2 && value.revision !== 3))
    || (value.state === 'REVOKED' ? !timeValid(value.revokedAt) : value.revokedAt !== null)) throw invalid();
  return value as RecordingView;
}
export async function loadRecordingTerms(id: string, session: PanelSession, signal: AbortSignal) {
  return terms(await request(id, '/terms', 'GET', session, signal));
}
export async function grantRecording(id: string, original: RecordingRequest, session: PanelSession, signal: AbortSignal) {
  return view(await request(id, '', 'POST', session, signal, original), id, original);
}
export async function findRecording(id: string, original: RecordingRequest, session: PanelSession, signal: AbortSignal) {
  if (!UUID.test(original.requestKey)) throw invalid();
  return view(await request(id, `/requests/${original.requestKey}`, 'GET', session, signal), id, original);
}
export async function recordingHistory(id: string, session: PanelSession, signal: AbortSignal, before?: string) {
  if (before && !UUID.test(before)) throw invalid();
  const result = await request(id, before ? `?beforeIntentId=${before}` : '', 'GET', session, signal);
  if (!isRecord(result) || !Array.isArray(result.items) || result.items.length > 10) throw invalid();
  const ids = new Set<string>();
  const items = result.items.map((item: unknown) => {
    if (!isRecord(item) || typeof item.requestKey !== 'string' || !UUID.test(item.requestKey)
      || typeof item.consentVersion !== 'string' || !/^[A-Za-z0-9._:-]{1,100}$/.test(item.consentVersion)
      || !hashValid(item.consentTextHash) || !timeValid(item.expiresAt)) throw invalid();
    const value = view(item, id, { requestKey: item.requestKey, consentVersion: item.consentVersion,
      consentTextHash: item.consentTextHash, expiresAt: item.expiresAt, locale: '' });
    if (ids.has(value.intentId) || value.intentId === before) throw invalid();
    ids.add(value.intentId); return value;
  });
  if (result.nextBeforeIntentId !== null && (items.length !== 10 || result.nextBeforeIntentId !== items.at(-1)?.intentId)) throw invalid();
  return { items, nextBeforeIntentId: result.nextBeforeIntentId as string | null };
}
export async function withdrawHistoricalRecording(id: string, original: RecordingView, session: PanelSession, signal: AbortSignal) {
  return revokeRecording(id, { requestKey: original.requestKey, consentVersion: original.consentVersion,
    consentTextHash: original.consentTextHash, expiresAt: original.expiresAt, locale: '' }, original.intentId, session, signal);
}
export async function revokeRecording(id: string, original: RecordingRequest, intentId: string, session: PanelSession, signal: AbortSignal) {
  if (!UUID.test(intentId)) throw invalid();
  const result = view(await request(id, `/${intentId}`, 'DELETE', session, signal), id, original, intentId);
  if (result.state !== 'REVOKED') throw invalid(); return result;
}
function storageKey(id: string, session: PanelSession) {
  if (!UUID.test(id) || !hashValid(session.recordingStorageScope)) throw new RecordingError(0, 'Onay geçmişi bu oturumda açılamadı. Yeniden giriş yapın.');
  return `teams-recording-v1:${session.recordingStorageScope}:${id.toLowerCase()}`;
}
/** Retain only non-secret request evidence, partitioned by account and meeting. Never treat it as authorization. */
export async function readRecordingReceipt(id: string, session: PanelSession): Promise<RecordingReceipt | null> {
  const raw = sessionStorage.getItem(storageKey(id, session)); if (!raw) return null;
  if (raw.length > 65_536) throw invalid(); const saved: unknown = JSON.parse(raw);
  if (!isRecord(saved) || !isRecord(saved.request)) throw invalid();
  const shown = await terms(saved.terms); const r = saved.request;
  if (typeof r.requestKey !== 'string' || !UUID.test(r.requestKey) || r.consentVersion !== shown.version
    || r.consentTextHash !== shown.sha256 || r.locale !== shown.locale || !timeValid(r.expiresAt)) throw invalid();
  return { terms: shown, request: { requestKey: r.requestKey, consentVersion: shown.version, consentTextHash: shown.sha256,
    locale: shown.locale, expiresAt: r.expiresAt } };
}
export function saveRecordingReceipt(id: string, session: PanelSession, receipt: RecordingReceipt) {
  const key = storageKey(id, session); const raw = JSON.stringify(receipt);
  sessionStorage.setItem(key, raw);
  if (sessionStorage.getItem(key) !== raw) throw new RecordingError(0, 'Onay isteği saklanamadı; onay gönderilmedi.');
}
export function clearRecordingReceipt(id: string, session: PanelSession) { sessionStorage.removeItem(storageKey(id, session)); }
