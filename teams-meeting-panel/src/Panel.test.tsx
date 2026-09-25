import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LiveMeeting } from './Panel';

const id = '87c6d43e-ead5-40fe-8e74-e976655bb2f6';
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function setup() {
  const feeds: Partial<Record<'analysis' | 'transcript', ReadableStreamDefaultController<Uint8Array>>> = {};
  const cancelled = { transcript: vi.fn(), analysis: vi.fn() };
  let analysisRequests = 0;
  let probe: 'allow' | 'deny' | 'hang' = 'allow';
  const token = vi.fn(async () => 'platform-token');
  const session = { token, close: vi.fn() };
  const deny = vi.fn();
  const fetcher = vi.fn(async (path: string) => {
    if (path === `/api/v1/admin/meetings/${id}`) return Response.json({ id, title: 'Müşteri sunumu' });
    const kind = path.includes('live-analysis') ? 'analysis' : 'transcript';
    if (kind === 'analysis') {
      analysisRequests++;
      if (analysisRequests !== 2) {
        if (probe === 'deny') return new Response(null, { status: 403 });
        if (probe === 'hang') return new Promise<Response>(() => {});
        return new Response(null, { headers: { 'Content-Type': 'text/event-stream' } });
      }
    }
    return new Response(new ReadableStream<Uint8Array>({
      start(controller) { feeds[kind] = controller; }, cancel: cancelled[kind],
    }), { headers: { 'Content-Type': 'text/event-stream' } });
  });
  vi.stubGlobal('fetch', fetcher);
  const view = render(<LiveMeeting id={id} session={session} deny={deny} />);
  const emit = async (kind: 'analysis' | 'transcript', payload: unknown) => act(async () => {
    const event = kind === 'analysis' ? 'analysis' : 'transcript-chunk';
    feeds[kind]!.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
    await flush();
  });
  return { ...view, emit, feeds, fetcher, cancelled, token, deny,
    setProbe(value: typeof probe) { probe = value; } };
}

describe('meeting panel with real SSE parser and authorization requests', () => {
  it('can open live content after a scheduled meeting becomes available, with a fresh access check', async () => {
    const session = { token: async () => 'platform-token', close: vi.fn() }; const deny = vi.fn();
    let available = false;
    const fetcher = vi.fn(async (path: string) => {
      if (!available) return new Response(null, { status: 404 });
      if (path === `/api/v1/admin/meetings/${id}`) return Response.json({ id, title: 'Planlanan toplantı' });
      return new Response(new ReadableStream({}), { headers: { 'Content-Type': 'text/event-stream' } });
    });
    vi.stubGlobal('fetch', fetcher);
    render(<LiveMeeting id={id} session={session} deny={deny} />); await act(flush);
    expect(screen.queryByText('Planlanan toplantı')).toBeNull();
    available = true;
    fireEvent.click(screen.getByRole('button', { name: 'Canlı görünümü yeniden aç' })); await act(flush);
    expect(screen.getByText('Planlanan toplantı')).toBeTruthy();
    expect(fetcher.mock.calls.filter(([path]) => path.includes('live-analysis'))).toHaveLength(2);
    expect(deny).not.toHaveBeenCalled();
  });
  it('renders and updates decisions and assigned actions from the live stream while it remains open', async () => {
    const run = setup(); await act(flush);
    expect(screen.getByText('Müşteri sunumu')).toBeTruthy();
    await run.emit('transcript', { eventId: 't1', text: 'Zeynep sunumu hazırlayacak.', status: 'UTTERANCE' });
    expect(screen.getByText('Zeynep sunumu hazırlayacak.')).toBeTruthy();
    await run.emit('analysis', { summary: 'Müşteri sunumu hazırlanıyor.', decisions: ['Çevrimiçi sunum yapılacak.'],
      action_items: [{ text: 'Sunumu hazırlayacak.', owner: 'Zeynep', due_date: '25 Eylül 2026' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Kararlar' }));
    expect(screen.getByText('Çevrimiçi sunum yapılacak.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Aksiyonlar' }));
    expect(screen.getByText('Sunumu hazırlayacak.')).toBeTruthy();
    expect(screen.getByText(/Sorumlu: Zeynep/)).toBeTruthy();
    await run.emit('analysis', { summary: 'Güncellendi.', decisions: [], action_items: [{ text: 'Bütçe kontrol edilecek.', owner: null, due_date: null }] });
    expect(screen.queryByText('Sunumu hazırlayacak.')).toBeNull();
    expect(screen.getByText('Sorumlu: Belirtilmedi')).toBeTruthy();
    expect(run.cancelled.transcript).not.toHaveBeenCalled(); expect(run.cancelled.analysis).not.toHaveBeenCalled();
    expect(run.fetcher.mock.calls.every(([path]) => path.includes('live-') || path === `/api/v1/admin/meetings/${id}`)).toBe(true);
  });

  it.each(['deny', 'hang', 'token'] as const)('clears content and closes both streams when periodic access fails: %s', async failure => {
    const run = setup(); await act(flush);
    await run.emit('transcript', { eventId: 'private', text: 'Özel toplantı içeriği.', status: 'UTTERANCE' });
    await run.emit('analysis', { summary: 'Özel özet.', decisions: [], action_items: [{ text: 'Özel görev.', owner: 'Zeynep' }] });
    if (failure === 'token') run.token.mockImplementation(() => new Promise<string>(() => {}));
    else run.setProbe(failure);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); await flush(); });
    if (failure !== 'deny') {
      await act(async () => { await vi.advanceTimersByTimeAsync(14_999); });
      expect(screen.getByText('Özel toplantı içeriği.')).toBeTruthy();
      await act(async () => { await vi.advanceTimersByTimeAsync(1); await flush(); });
    }
    expect(screen.queryByText('Müşteri sunumu')).toBeNull();
    expect(screen.queryByText('Özel toplantı içeriği.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Aksiyonlar' }));
    expect(screen.queryByText('Özel görev.')).toBeNull();
    expect(run.cancelled.transcript).toHaveBeenCalledOnce(); expect(run.cancelled.analysis).toHaveBeenCalledOnce();
    expect(screen.getByText('Analiz: Kapalı')).toBeTruthy();
    if (failure !== 'hang') expect(run.deny).toHaveBeenCalledOnce();
  });

  it('closes the active feeds when the panel is removed', async () => {
    const run = setup(); await act(flush);
    run.unmount(); await act(flush);
    expect(run.cancelled.transcript).toHaveBeenCalledOnce(); expect(run.cancelled.analysis).toHaveBeenCalledOnce();
  });
});
