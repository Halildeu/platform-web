import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RecordingConsent } from './RecordingConsent';
import { saveRecordingReceipt, type RecordingRequest } from './recording';
import { Panel } from './Panel';
import { signIn } from './auth';
vi.mock('./auth', () => ({ signIn: vi.fn() }));
const id = '87c6d43e-ead5-40fe-8e74-e976655bb2f6';
const intent = '00000000-0000-0000-0000-000000000002';
let shown: { version: string; text: string; sha256: string; locale: string; maximumLifetimeSeconds: number };
beforeEach(async () => {
  vi.stubGlobal('crypto', webcrypto); sessionStorage.clear();
  const text = 'Kayıt için gösterilen onay metni.';
  shown = { version: 'v1', text, sha256: Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(text))).toString('hex'),
    locale: 'tr-TR', maximumLifetimeSeconds: 86400 };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); sessionStorage.clear(); history.replaceState({}, '', '/'); });
function setup() {
  const session = { token: async () => 'token', close: vi.fn(), recordingStorageScope: 'a'.repeat(64) }; const deny = vi.fn();
  let original: RecordingRequest | null = null; let state = 'GRANTED'; let lost = false; let status = 0;
  const snapshot = () => ({ ...original, intentId: intent, meetingId: id, state, revision: state === 'REVOKED' ? 2 : 1,
    createdAt: new Date(Date.now() - 1000).toISOString(), revokedAt: state === 'REVOKED' ? new Date().toISOString() : null });
  const fetcher = vi.fn(async (path: string, init: RequestInit) => {
    if (status) return new Response(null, { status });
    if (path.endsWith('/terms')) return Response.json(shown);
    if (init.method === 'GET' && path.endsWith('/bot-recording-intents')) return Response.json({ items: original ? [snapshot()] : [], nextBeforeIntentId: null });
    if (init.method === 'POST') {
      original = JSON.parse(String(init.body));
      expect(sessionStorage.length).toBe(1); // Request was durably retained before submission.
      if (lost) throw new TypeError('Network lost after commit');
    }
    if (init.method === 'DELETE') state = 'REVOKED';
    return original ? Response.json(snapshot()) : new Response(null, { status: 404, headers: { Date: new Date().toUTCString() } });
  });
  vi.stubGlobal('fetch', fetcher);
  const props = { id, session, enabled: true, deny };
  const result = render(<RecordingConsent {...props} />);
  return { ...result, props, fetcher, deny, loseResponse() { lost = true; }, fail(value: number) { status = value; } };
}
const consent = async () => {
  await screen.findByRole('checkbox'); fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Kayıt onayını ver' }));
};
describe('actual panel consent control', () => {
  it('opening never grants; checkbox gates an explicit single POST and withdrawal is a DELETE', async () => {
    const run = setup(); await screen.findByRole('checkbox');
    expect((screen.getByRole('button', { name: 'Kayıt onayını ver' }) as HTMLButtonElement).disabled).toBe(true);
    expect(run.fetcher.mock.calls.every(([, init]) => init.method === 'GET')).toBe(true);
    await consent(); await screen.findByText('Onay sunucuda kayıtlı.');
    expect(run.fetcher.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Kayıt onayını geri al' }));
    await screen.findByText('Onay geri alındı.');
    expect(run.fetcher.mock.calls.filter(([, init]) => init.method === 'DELETE')).toHaveLength(1);
  });
  it('recovers a lost grant response after remount with GET only, preserving request and expiry', async () => {
    const run = setup(); run.loseResponse(); await consent();
    await screen.findByText(/Önceki onay isteğinin sonucu/);
    const originalBody = run.fetcher.mock.calls.find(([, init]) => init.method === 'POST')![1].body;
    run.unmount(); render(<RecordingConsent {...run.props} />);
    await screen.findByText('Onay sunucuda kayıtlı.');
    expect(run.fetcher.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(1);
    expect(run.fetcher.mock.calls.at(-1)![0]).toContain('/requests/');
    expect(JSON.parse(sessionStorage.getItem(sessionStorage.key(0)!)!).request).toEqual(JSON.parse(String(originalBody)));
  });
  it('keeps withdrawal available after the new-grant feature flag is disabled', async () => {
    const run = setup(); await consent(); await screen.findByText('Onay sunucuda kayıtlı.');
    run.rerender(<RecordingConsent {...run.props} enabled={false} />);
    await waitFor(() => expect((screen.getByRole('button', { name: 'Kayıt onayını geri al' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Kayıt onayını geri al' })); await screen.findByText('Onay geri alındı.');
    expect(screen.queryByRole('button', { name: 'Yeni onay metnini aç' })).toBeNull();
  });
  it('does not POST if browser receipt storage is unavailable', async () => {
    const run = setup(); await screen.findByRole('checkbox');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    await consent(); await screen.findByText(/Onay işlemi doğrulanamadı/);
    expect(run.fetcher.mock.calls.some(([, init]) => init.method === 'POST')).toBe(false);
  });
  it.each(['empty', 'unavailable', 'corrupt'])('recovers and withdraws from server on a new device with %s local storage', async storage => {
    const run = setup(); await consent(); await screen.findByText('Onay sunucuda kayıtlı.'); run.unmount();
    if (storage === 'empty') sessionStorage.clear();
    if (storage === 'unavailable') vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('storage denied'); });
    if (storage === 'corrupt') sessionStorage.setItem(sessionStorage.key(0)!, 'invalid');
    render(<RecordingConsent {...run.props} enabled={false} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Bu önceki onayı geri al' }));
    await screen.findByText('Onay geri alındı.');
    expect(run.fetcher.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(1);
    expect(run.fetcher.mock.calls.filter(([, init]) => init.method === 'DELETE')).toHaveLength(1);
  });
  it('does not borrow another meeting receipt or continue a pending request after unmount', async () => {
    const run = setup(); await consent(); await screen.findByText('Onay sunucuda kayıtlı.');
    run.rerender(<RecordingConsent {...run.props} id={intent} />);
    expect(screen.queryByText('Onay sunucuda kayıtlı.')).toBeNull();
    await screen.findByRole('checkbox');
    const pending = vi.fn((_path: string, _init: RequestInit) => new Promise<Response>(() => {})); vi.stubGlobal('fetch', pending);
    fireEvent.click(screen.getByRole('button', { name: 'Onay durumunu kontrol et' }));
    await act(async () => { await Promise.resolve(); });
    run.unmount(); expect(pending.mock.calls[0][1].signal!.aborted).toBe(true);
  });
  it('requires fresh acceptance when the server replaces the displayed text', async () => {
    const run = setup(); await screen.findByRole('checkbox'); fireEvent.click(screen.getByRole('checkbox'));
    const text = 'Yeni onay koşulları.';
    shown = { ...shown, version: 'consent:2026', text,
      sha256: Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(text))).toString('hex') };
    fireEvent.click(screen.getByRole('button', { name: 'Onay durumunu kontrol et' }));
    await screen.findByText(text);
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole('button', { name: 'Kayıt onayını ver' }) as HTMLButtonElement).disabled).toBe(true);
    expect(run.fetcher.mock.calls.some(([, init]) => init.method === 'POST')).toBe(false);
  });
  it('offers an explicit new form after server confirms an absent request is past its expiry, without POST', async () => {
    const run = setup(); await screen.findByRole('checkbox'); run.unmount();
    saveRecordingReceipt(id, run.props.session, { terms: shown, request: { requestKey: intent, consentVersion: shown.version,
      consentTextHash: shown.sha256, locale: shown.locale, expiresAt: new Date(Date.now() - 120_000).toISOString() } });
    render(<RecordingConsent {...run.props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Süresi dolan isteği kapat, yeni onay metnini aç' }));
    await screen.findByRole('checkbox');
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    expect(sessionStorage.length).toBe(0);
    expect(run.fetcher.mock.calls.some(([, init]) => init.method === 'POST')).toBe(false);
  });
  it('keeps actual Panel authenticated for withdrawal when the sibling live view returns403', async () => {
    const run = setup(); await consent(); await screen.findByText('Onay sunucuda kayıtlı.'); run.unmount();
    vi.mocked(signIn).mockResolvedValue(run.props.session);
    vi.stubGlobal('fetch', (path: string, init: RequestInit) => path.includes('/bot-recording-intents')
      ? run.fetcher(path, init) : Promise.resolve(new Response(null, { status: 403 })));
    history.replaceState({}, '', `/?meetingId=${id}`);
    render(<Panel config={{ keycloak: { url: 'https://login.example', realm: 'platform', clientId: 'panel' }, botRecordingEnabled: false }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Giriş yap' }));
    await screen.findByText('Bu toplantının canlı içeriğini görme yetkiniz yok.');
    fireEvent.click(await screen.findByRole('button', { name: 'Kayıt onayını geri al' }));
    await screen.findByText('Onay geri alındı.');
    expect(run.props.session.close).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Panel oturumunu kapat' })).toBeTruthy();
  });
});
