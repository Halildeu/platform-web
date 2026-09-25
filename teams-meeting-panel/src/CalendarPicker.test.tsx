import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CalendarPicker } from './CalendarPicker';
const id = '87c6d43e-ead5-40fe-8e74-e976655bb2f6';
const event = { eventId: 'opaque-one', title: 'Müşteri sunumu', startsAt: '2026-09-26T08:00:00Z', endsAt: '2026-09-26T09:00:00Z' };
const scheduled = { meetingId: id, state: 'pending', startsAt: event.startsAt, endsAt: event.endsAt };
const flush = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-25T08:00:00Z')); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function setup() {
  let result: unknown = null; let mutation: 'ok' | 'hang' | 'conflict' = 'ok'; let denial = 0;
  const session = { token: async () => 'platform-token', close: vi.fn() }; const deny = vi.fn();
  const fetcher = vi.fn(async (path: string, init: RequestInit) => {
    if (denial) return new Response(null, { status: denial });
    if (path.endsWith('/events')) return Response.json({ items: [event], truncated: true });
    if (init.method === 'POST') {
      result = scheduled;
      if (mutation === 'hang') return new Promise<Response>(() => {});
      if (mutation === 'conflict') return new Response(null, { status: 409 });
      return Response.json(result, { status: 202 });
    }
    if (init.method === 'DELETE') { result = { ...scheduled, state: 'cancelled' }; return new Response(null, { status: 204 }); }
    return result ? Response.json(result) : new Response(null, { status: 404 });
  });
  vi.stubGlobal('fetch', fetcher);
  const view = render(<CalendarPicker id={id} session={session} deny={deny} />);
  return { ...view, fetcher, session, deny, setResult(value: unknown) { result = value; },
    setMutation(value: typeof mutation) { mutation = value; }, setDenial(value: number) { denial = value; } };
}
const browse = async () => { fireEvent.click(screen.getByRole('button', { name: 'Outlook toplantılarını getir' })); await act(flush); };
const choose = () => fireEvent.click(screen.getByRole('radio', { name: /Müşteri sunumu/ }));
const plan = () => fireEvent.click(screen.getByRole('button', { name: 'Seçilen toplantıya katılımı planla' }));

describe('explicit calendar selection', () => {
  it('opening and browsing do not join; requires explicit selection then confirmation, preserves choices across status checks', async () => {
    const run = setup(); await act(flush); await browse();
    expect(screen.getByText(/Listenin tamamı gösterilemedi/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Seçilen toplantıya katılımı planla' }) as HTMLButtonElement).disabled).toBe(true);
    choose();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); await flush(); });
    expect((screen.getByRole('radio') as HTMLInputElement).checked).toBe(true);
    expect(run.fetcher.mock.calls.filter(([path, init]) => path.endsWith('/schedule') && init.method === 'POST')).toHaveLength(0);
    plan(); plan(); await act(flush);
    expect(run.fetcher.mock.calls.filter(([path, init]) => path.endsWith('/schedule') && init.method === 'POST')).toHaveLength(1);
    expect(screen.getByText('Katılım planlandı')).toBeTruthy();
    expect(screen.queryByRole('radio')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Planlanan katılımı iptal et' })); await act(flush);
    expect(screen.getByText('Planlanan katılım iptal edildi')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Outlook toplantılarını getir' })).toBeNull();
  });
  it.each(['hang', 'conflict'] as const)('reconciles %s mutation by reading state, never blindly resubmitting', async mode => {
    const run = setup(); await act(flush); await browse(); choose(); run.setMutation(mode); plan(); await act(flush);
    if (mode === 'hang') await act(async () => { await vi.advanceTimersByTimeAsync(30_000); await flush(); });
    expect(screen.getByText(/Son isteğin sonucu kesinleşmedi/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Seçilen toplantıya katılımı planla' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Katılım durumunu kontrol et' })); await act(flush);
    expect(screen.getByText('Katılım planlandı')).toBeTruthy();
    expect(run.fetcher.mock.calls.filter(([path, init]) => path.endsWith('/schedule') && init.method === 'POST')).toHaveLength(1);
  });
  it.each([401, 403, 503])('clears private choices on periodic HTTP %i without logging a read-only viewer out for calendar-only denial', async status => {
    const run = setup(); await act(flush); await browse(); choose(); run.setDenial(status);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); await flush(); });
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByText('Müşteri sunumu')).toBeNull();
    expect(run.deny).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
  });
  it('keeps joined state separate from proof of live audio and does not offer pending cancellation', async () => {
    const run = setup(); await act(flush); run.setResult({ ...scheduled, state: 'joined' });
    fireEvent.click(screen.getByRole('button', { name: 'Katılım durumunu kontrol et' })); await act(flush);
    expect(screen.getByText('Bot katıldı')).toBeTruthy();
    expect(screen.getByText(/ses ve analizin başladığını doğrulamaz/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Planlanan katılımı iptal et' })).toBeNull();
  });
  it('aborts a pending mutation on removal and ignores its eventual response', async () => {
    const run = setup(); await act(flush); await browse(); choose(); run.setMutation('hang'); plan(); await act(flush);
    const call = run.fetcher.mock.calls.at(-1)!; run.unmount(); await act(flush);
    expect((call[1].signal as AbortSignal).aborted).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(run.fetcher.mock.calls.at(-1)).toBe(call);
  });
  it('drops choices immediately when canonical meeting changes', async () => {
    const run = setup(); await act(flush); await browse(); choose();
    const other = '00000000-0000-0000-0000-000000000001';
    run.rerender(<CalendarPicker id={other} session={run.session} deny={run.deny} />);
    expect(screen.queryByRole('radio')).toBeNull(); await act(flush);
    expect(run.fetcher.mock.calls.at(-1)![0]).toContain(other);
  });
});
