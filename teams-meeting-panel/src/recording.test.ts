import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseConfig } from './config';
import { findRecording, grantRecording, loadRecordingTerms, readRecordingReceipt, revokeRecording, saveRecordingReceipt,
  recordingHistory, type RecordingReceipt } from './recording';
const id = '87c6d43e-ead5-40fe-8e74-e976655bb2f6';
const key = '00000000-0000-0000-0000-000000000001';
const intent = '00000000-0000-0000-0000-000000000002';
const session = { token: async () => 'opaque-platform-token', close() {}, recordingStorageScope: 'a'.repeat(64) };
let receipt: RecordingReceipt;
const signal = () => new AbortController().signal;
const response = () => ({ intentId: intent, meetingId: id, requestKey: key, state: 'GRANTED', revision: 1,
  createdAt: '2026-10-07T10:00:00Z', expiresAt: receipt.request.expiresAt, revokedAt: null,
  consentVersion: receipt.request.consentVersion, consentTextHash: receipt.request.consentTextHash });
beforeEach(async () => {
  vi.stubGlobal('crypto', webcrypto); sessionStorage.clear();
  const text = 'Toplantı sesi ve canlı metin için onay metni.';
  const hash = Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(text))).toString('hex');
  receipt = { terms: { version: 'v1', text, sha256: hash, locale: 'tr-TR', maximumLifetimeSeconds: 86400 },
    request: { requestKey: key, consentVersion: 'v1', consentTextHash: hash, locale: 'tr-TR', expiresAt: '2026-10-07T11:00:00.000Z' } };
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); sessionStorage.clear(); });
describe('bot consent HTTP and retry evidence', () => {
  it('is default off and rejects truthy nonboolean configuration', () => {
    const keycloak = { url: 'https://login.example', realm: 'platform', clientId: 'frontend' };
    expect(parseConfig({ keycloak }).botRecordingEnabled).toBe(false);
    expect(parseConfig({ keycloak, botRecordingEnabled: true }).botRecordingEnabled).toBe(true);
    expect(() => parseConfig({ keycloak, botRecordingEnabled: 'true' })).toThrow();
  });
  it('verifies the shown text hash instead of accepting a matching version alone', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(receipt.terms)));
    expect(await loadRecordingTerms(id, session, signal())).toEqual(receipt.terms);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ...receipt.terms, text: 'different' })));
    await expect(loadRecordingTerms(id, session, signal())).rejects.toThrow();
  });
  it('sends only the exact consent request; readonly recovery never posts or renews expiry', async () => {
    const fetcher = vi.fn(async () => Response.json(response())); vi.stubGlobal('fetch', fetcher);
    await grantRecording(id, receipt.request, session, signal());
    await findRecording(id, receipt.request, session, signal());
    const calls = fetcher.mock.calls as unknown as [string, RequestInit][];
    expect(calls[0][1]).toMatchObject({ method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error', body: JSON.stringify(receipt.request) });
    expect(calls[1][0]).toBe(`/api/v1/meetings/${id}/bot-recording-intents/requests/${key}`);
    expect(calls[1][1].method).toBe('GET'); expect(calls[1][1].body).toBeUndefined();
  });
  it.each(['meetingId', 'requestKey', 'intentId', 'consentTextHash', 'expiresAt', 'state', 'revision'])('rejects mismatched %s', async field => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ...response(), [field]: 'wrong' })));
    await expect(findRecording(id, receipt.request, session, signal())).rejects.toThrow();
  });
  it('requires terminal withdrawal, not just a successful HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(response())));
    await expect(revokeRecording(id, receipt.request, intent, session, signal())).rejects.toThrow();
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ...response(), state: 'REVOKED', revision: 2, revokedAt: '2026-10-07T10:15:00Z' })));
    expect((await revokeRecording(id, receipt.request, intent, session, signal())).state).toBe('REVOKED');
  });
  it('validates history meeting, bounded pages, unique records and pagination cursor', async () => {
    const fetcher = vi.fn(async () => Response.json({ items: [response()], nextBeforeIntentId: null })); vi.stubGlobal('fetch', fetcher);
    expect((await recordingHistory(id, session, signal())).items).toHaveLength(1);
    for (const body of [
      { items: [{ ...response(), meetingId: key }], nextBeforeIntentId: null },
      { items: [response(), response()], nextBeforeIntentId: null },
      { items: Array(11).fill(response()), nextBeforeIntentId: null },
      { items: [response()], nextBeforeIntentId: intent },
    ]) {
      fetcher.mockImplementation(async () => Response.json(body));
      await expect(recordingHistory(id, session, signal())).rejects.toThrow();
    }
  });
  it('persists no tokens, separates accounts and meetings, and rejects corrupt local evidence', async () => {
    saveRecordingReceipt(id, session, receipt);
    expect(await readRecordingReceipt(id, session)).toEqual(receipt);
    expect(await readRecordingReceipt(id, { ...session, recordingStorageScope: 'b'.repeat(64) })).toBeNull();
    expect(await readRecordingReceipt(key, session)).toBeNull();
    const stored = sessionStorage.getItem(sessionStorage.key(0)!)!; expect(stored).not.toContain('opaque-platform-token');
    sessionStorage.setItem(sessionStorage.key(0)!, stored.replace('Toplantı', 'changed'));
    await expect(readRecordingReceipt(id, session)).rejects.toThrow();
  });
  it('redacts failure bodies and bounds success bodies', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('secret internal stack', { status: 503 })));
    await expect(findRecording(id, receipt.request, session, signal())).rejects.not.toThrow('secret');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x'.repeat(65537), { headers: { 'Content-Type': 'application/json' } })));
    await expect(findRecording(id, receipt.request, session, signal())).rejects.toThrow();
  });
  it('bounds token acquisition without starting HTTP after timeout', async () => {
    vi.useFakeTimers(); const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const work = loadRecordingTerms(id, { ...session, token: () => new Promise<string>(() => {}) }, signal());
    const assertion = expect(work).rejects.toThrow(); await vi.advanceTimersByTimeAsync(30_000); await assertion;
    expect(fetcher).not.toHaveBeenCalled();
  });
});
