import { afterEach, describe, expect, it, vi } from 'vitest';
import { browseEvents, cancelSchedule, readSchedule, selectEvent } from './calendar';
import { parseConfig } from './config';
const id = '87c6d43e-ead5-40fe-8e74-e976655bb2f6';
const session = { token: async () => 'platform-token', close() {} };
const signal = () => new AbortController().signal;
const from = '2026-09-25T08:00:00Z'; const to = '2026-09-26T08:00:00Z';
const event = { eventId: 'opaque/+/=', title: 'Müşteri sunumu', startsAt: from, endsAt: '2026-09-25T09:00:00Z' };
const scheduled = { meetingId: id, state: 'pending', startsAt: from, endsAt: event.endsAt };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('calendar transport scope and contracts', () => {
  it('keeps calendar disabled by default and rejects ambiguous configuration', () => {
    const keycloak = { url: 'https://login.example', realm: 'platform', clientId: 'frontend' };
    expect(parseConfig({ keycloak }).calendarEnabled).toBe(false);
    expect(parseConfig({ keycloak, calendarEnabled: true }).calendarEnabled).toBe(true);
    expect(() => parseConfig({ keycloak, calendarEnabled: 'true' })).toThrow();
  });
  it('uses the canonical meeting path, platform token and only event ID for an explicit selection', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ...scheduled, callId: 'private', organizerId: 'private' }, { status: 202 }));
    vi.stubGlobal('fetch', fetcher);
    expect(await selectEvent(id, event.eventId, session, signal())).toEqual(scheduled);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(`/api/v1/admin/meetings/${id}/teams-calendar/schedule`, expect.objectContaining({
      method: 'POST', body: JSON.stringify({ eventId: event.eventId }), credentials: 'omit', redirect: 'error', cache: 'no-store',
      headers: { Authorization: 'Bearer platform-token', 'Content-Type': 'application/json' },
    }));
  });
  it('reads absent schedules and cancels pending schedules through separate methods', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 })).mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetcher);
    expect(await readSchedule(id, session, signal())).toBeNull();
    await cancelSchedule(id, session, signal());
    expect(fetcher.mock.calls.map(call => call[1].method)).toEqual(['GET', 'DELETE']);
  });
  it('preserves truncation and drops unrelated fields without creating a selection', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ items: [{ ...event, joinUrl: 'secret' }], truncated: true }));
    vi.stubGlobal('fetch', fetcher);
    expect(await browseEvents(id, from, to, session, signal())).toEqual({ items: [event], truncated: true });
    expect(fetcher.mock.calls[0][1].body).toBe(JSON.stringify({ from, to }));
    expect(fetcher.mock.calls[0][0].endsWith('/events')).toBe(true);
  });
  it.each([
    { ...scheduled, meetingId: '00000000-0000-0000-0000-000000000001' },
    { ...scheduled, state: 'confirmed' }, { ...scheduled, endsAt: from }, { ...scheduled, startsAt: 'tomorrow' },
  ])('rejects foreign or invalid schedule responses: %j', async value => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(value)));
    await expect(readSchedule(id, session, signal())).rejects.toThrow('doğrulanamadı');
  });
  it.each([
    { items: [event, event], truncated: false }, { items: [event] },
    { items: [{ ...event, startsAt: '2026-09-24T08:00:00Z' }], truncated: false },
    { items: [{ ...event, eventId: 'https://evil.example' }], truncated: false },
  ])('rejects malformed or duplicate choices: %j', async value => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(value)));
    await expect(browseEvents(id, from, to, session, signal())).rejects.toThrow('doğrulanamadı');
  });
  it.each([401, 403, 409, 503, 302])('does not retry mutations or expose upstream details for HTTP %i', async status => {
    const fetcher = vi.fn().mockResolvedValue(new Response('upstream-secret', { status })); vi.stubGlobal('fetch', fetcher);
    await expect(selectEvent(id, event.eventId, session, signal())).rejects.toMatchObject({ status });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('never sends a token for invalid paths, IDs or an aborted caller', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(readSchedule('https://evil.example', session, signal())).rejects.toThrow();
    await expect(selectEvent(id, '../bad', session, signal())).rejects.toThrow();
    const controller = new AbortController(); controller.abort();
    await expect(readSchedule(id, session, controller.signal)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['token', 'headers', 'body'])('bounds a hung %s without automatic retries', async stage => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const fetcher = vi.fn().mockImplementation(async () => stage === 'headers' ? new Promise(() => {}) : new Response(
      new ReadableStream({ cancel }), { headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetcher);
    const pending = readSchedule(id, stage === 'token' ? { ...session, token: () => new Promise(() => {}) } : session, signal());
    const rejected = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
    for (let i = 0; i < 30; i++) await Promise.resolve();
    await vi.advanceTimersByTimeAsync(30_000); await rejected;
    expect(fetcher).toHaveBeenCalledTimes(stage === 'token' ? 0 : 1);
    if (stage === 'body') expect(cancel).toHaveBeenCalledOnce();
  });
  it('rejects oversized bodies, HTML and trailing JSON content', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('x'.repeat(1_048_577), { headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response('<html>login</html>', { headers: { 'Content-Type': 'text/html' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(scheduled) + '{}', { headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetcher);
    for (let i = 0; i < 3; i++) await expect(readSchedule(id, session, signal())).rejects.toThrow();
  });
});
