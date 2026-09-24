import { describe, it, expect, vi, afterEach } from 'vitest';
import { AccessError, authorizedFetch, readEvents, receiveAnalysis, receiveTranscript, streamOnce } from './live';
import { parseConfig, selectedMeeting } from './config';
import { parseLoginResult } from './auth';
import type { PanelSession } from './auth';

const id = '87c6d43e-ead5-40fe-8e74-e976655bb2f6';
const session: PanelSession = { token: async () => 'platform-token', close() {} };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('identity and meeting boundaries', () => {
  it('requires an HTTPS public-client configuration with no credentials or redirect query', () => {
    expect(parseConfig({ keycloak: { url: 'https://login.example/identity/', realm: 'platform', clientId: 'frontend' } }).keycloak.url).toBe('https://login.example/identity');
    for (const url of ['http://login.example', 'https://name:secret@login.example', 'https://login.example/?redirect=elsewhere', 'https://login.example/#token'])
      expect(() => parseConfig({ keycloak: { url, realm: 'platform', clientId: 'frontend' } })).toThrow();
  });
  it('rejects duplicate IDs and Teams context identifiers as canonical UUIDs', () => {
    expect(selectedMeeting(`?meetingId=${id}`)).toBe(id);
    expect(selectedMeeting(`?meetingId=${id}&meetingId=${id}`)).toBeNull();
    expect(selectedMeeting('?meetingId=19:meeting_chat@thread.v2')).toBeNull();
  });
  it('accepts only the login response for the current popup challenge', () => {
    const result = { request: id, token: 'access', idToken: 'identity', refreshToken: 'refresh' };
    expect(parseLoginResult(JSON.stringify(result), id)).toEqual(result);
    expect(() => parseLoginResult(JSON.stringify(result), crypto.randomUUID())).toThrow();
    expect(() => parseLoginResult(JSON.stringify({ ...result, refreshToken: '' }), id)).toThrow();
  });
  it('never sends an access token to another origin or follows redirects', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetcher);
    for (const url of ['https://evil.example/api/', '//evil.example/api/', '/api/\\evil.example'])
      await expect(authorizedFetch(url, session, new AbortController().signal)).rejects.toThrow('invalid_endpoint');
    expect(fetcher).not.toHaveBeenCalled();
    await authorizedFetch('/api/v1/admin/meetings', session, new AbortController().signal);
    expect(fetcher).toHaveBeenCalledWith('/api/v1/admin/meetings', expect.objectContaining({
      credentials: 'omit', redirect: 'error', cache: 'no-store', headers: { Authorization: 'Bearer platform-token' },
    }));
  });
  it.each([401, 403])('turns HTTP %i into a terminal access failure', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status })));
    await expect(authorizedFetch('/api/v1/admin/meetings', session, new AbortController().signal)).rejects.toBeInstanceOf(AccessError);
  });
  it('does not start a request after token refresh finished for a cancelled view', async () => {
    const controller = new AbortController(); const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const delayed = { ...session, token: async () => { controller.abort(); return 'token'; } };
    await expect(authorizedFetch('/api/v1/admin/meetings', delayed, controller.signal)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['token', 'headers'])('bounds an unresponsive %s operation without waiting for its promise', async stage => {
    vi.useFakeTimers();
    const never = new Promise<string>(() => {});
    const fetcher = vi.fn().mockImplementation(() => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', fetcher);
    const pending = authorizedFetch('/api/v1/admin/meetings',
      stage === 'token' ? { ...session, token: () => never } : session, new AbortController().signal);
    const rejected = expect(pending).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(15_000);
    await rejected;
    if (stage === 'token') expect(fetcher).not.toHaveBeenCalled();
    else expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it('keeps an established SSE open past the header deadline but honors caller cancellation', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { headers: { 'Content-Type': 'text/event-stream' } }));
    vi.stubGlobal('fetch', fetcher);
    const caller = new AbortController();
    await authorizedFetch('/api/v1/test/stream', session, caller.signal);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(false);
    caller.abort();
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  });
});

describe('live content preserves sources', () => {
  it('replaces gateway-folded drafts without inventing punctuation or changing final source IDs', () => {
    const first = receiveTranscript([], { eventId: 'word-1', text: 'Mehmet', status: 'DRAFT' }, 1);
    const second = receiveTranscript(first, { eventId: 'word-2', text: '.', status: 'DRAFT' }, 2);
    const final = receiveTranscript(second, { eventId: 'sentence-1', text: 'Mehmet.', status: 'UTTERANCE', sourceEventIds: ['word-1', 'word-2'] }, 3);
    expect(final).toHaveLength(1); expect(final[0]).toMatchObject({ id: 'sentence-1', text: 'Mehmet.', sourceEventIds: ['word-1', 'word-2'], status: 'final' });
    expect(receiveTranscript(final, { eventId: 'sentence-1', text: 'Mehmet.', status: 'UTTERANCE' })).toHaveLength(1);
  });
  it('does not delete already-final source segments', () => {
    const source = receiveTranscript([], { eventId: 'old', text: 'Karar.', status: 'UTTERANCE' });
    expect(receiveTranscript(source, { eventId: 'new', text: 'Yeni karar.', status: 'UTTERANCE', sourceEventIds: ['old'] })).toHaveLength(2);
  });
  it('rejects another meeting and preserves source evidence without assigning missing owners', () => {
    const raw = { summary: 'Sunum.', decisions: ['Çevrimiçi yapılacak.'], action_items: [{ text: 'Bütçeyi kontrol edecek.', owner: null, due_date: null }], citations: [{ source_hash: 'unchanged' }] };
    const result = receiveAnalysis(raw, id);
    expect(result.actions[0].owner).toBeNull(); expect(result.raw).toBe(raw);
    expect(() => receiveAnalysis({ ...raw, meetingId: crypto.randomUUID() }, id)).toThrow('wrong_meeting_analysis');
  });
  it('rejects malformed transcript and action payloads', () => {
    expect(() => receiveTranscript([], { eventId: '', status: 'UTTERANCE', text: 'x' })).toThrow();
    expect(() => receiveTranscript([], { eventId: 'x', status: 'UTTERANCE', text: 'x', sourceEventIds: [null] })).toThrow();
    expect(() => receiveAnalysis({ summary: '', decisions: [], action_items: [{ text: 'x', owner: {} }] }, id)).toThrow();
  });
});

describe('stream framing and cancellation', () => {
  const response = (parts: Uint8Array[]) => new Response(new ReadableStream({ start(controller) {
    for (const part of parts) controller.enqueue(part); controller.close();
  } }), { headers: { 'Content-Type': 'text/event-stream' } });
  it('handles UTF-8 split across bytes, CRLF, comments and multiline data', async () => {
    const bytes = new TextEncoder().encode(': heartbeat\r\nevent: analysis\r\ndata: {"summary":"Türkçe",\r\ndata: "decisions":[]}\r\n\r\n');
    const events: string[] = [];
    await readEvents(response([...bytes].map(byte => new Uint8Array([byte]))), 'analysis', data => events.push(data), new AbortController().signal);
    expect(JSON.parse(events[0]).summary).toBe('Türkçe'); expect(events).toHaveLength(1);
  });
  it('does not deliver other event types or unfinished EOF frames', async () => {
    const data = new TextEncoder().encode('event: transcript-chunk\ndata: wrong\n\nevent: analysis\ndata: unfinished');
    const receive = vi.fn(); await readEvents(response([data]), 'analysis', receive, new AbortController().signal);
    expect(receive).not.toHaveBeenCalled();
  });
  it('bounds a frame and cancels the underlying body on abort', async () => {
    await expect(readEvents(response([new TextEncoder().encode('data: ' + 'x'.repeat(1_000_001))]), 'analysis', () => {}, new AbortController().signal)).rejects.toThrow('stream_frame_too_large');
    const cancel = vi.fn(); const controller = new AbortController();
    const pending = readEvents(new Response(new ReadableStream({ cancel }), { headers: { 'Content-Type': 'text/event-stream' } }), 'analysis', () => {}, controller.signal);
    controller.abort(); await pending; expect(cancel).toHaveBeenCalledOnce();
  });
  it('connects to the authorized live endpoint and never reads a saved-result endpoint', async () => {
    const fetcher = vi.fn().mockResolvedValue(response([new TextEncoder().encode('event: analysis\ndata: {"summary":"canlı"}\n\n')]));
    vi.stubGlobal('fetch', fetcher); const receive = vi.fn();
    await streamOnce(id, 'analysis', session, new AbortController().signal, () => {}, receive);
    expect(fetcher.mock.calls[0][0]).toBe(`/api/v1/audio-gateway/meetings/${id}/live-analysis/stream`);
    expect(receive).toHaveBeenCalledWith({ summary: 'canlı' });
  });
});
