import { useEffect, useRef, useState } from 'react';
import type { PanelSession } from './auth';
import { clearRecordingReceipt, findRecording, grantRecording, loadRecordingTerms, readRecordingReceipt, RecordingError,
  revokeRecording, saveRecordingReceipt, recordingHistory, withdrawHistoricalRecording,
  type RecordingReceipt, type RecordingTerms, type RecordingView } from './recording';

type Props = { id: string; session: PanelSession; enabled?: boolean; deny: (message: string) => void };
export function RecordingConsent(props: Props) { return <RecordingControls key={`${props.id}:${props.session.recordingStorageScope ?? ''}`} {...props} />; }
function RecordingControls(props: Props) {
  const [current, setCurrent] = useState<RecordingView | null>(null);
  return <div><RecordingHistory {...props} current={current} /><Consent {...props} onCurrent={setCurrent} /></div>;
}

/** Withdrawal depends on server ownership, never on browser storage or new-grant permissions. */
function RecordingHistory({ id, session, deny, current }: Props & { current: RecordingView | null }) {
  const [items, setItems] = useState<RecordingView[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const operation = useRef<AbortController | null>(null); const denyRef = useRef(deny); denyRef.current = deny;
  const latest = useRef(new Map<string, RecordingView>());
  function remember(value: RecordingView) {
    const known = latest.current.get(value.intentId);
    if (known && known.revision > value.revision) return known;
    latest.current.set(value.intentId, value); return value;
  }
  useEffect(() => {
    if (current) {
      const value = remember(current);
      setItems(previous => previous.map(item => item.intentId === value.intentId ? value : item));
    }
  }, [current]);
  async function run(action: (signal: AbortSignal) => Promise<void>) {
    if (operation.current) return;
    const controller = new AbortController(); operation.current = controller; setBusy(true); setMessage('');
    try { await action(controller.signal); }
    catch (error) {
      if (!controller.signal.aborted) {
        setMessage('Önceki kayıt onayları doğrulanamadı. Yeniden kontrol edin.');
        if (error instanceof RecordingError && error.status === 401) denyRef.current(error.message);
      }
    } finally {
      if (operation.current === controller) { operation.current = null; if (!controller.signal.aborted) setBusy(false); }
    }
  }
  async function load(signal: AbortSignal, before?: string) {
    const page = await recordingHistory(id, session, signal, before);
    if (!signal.aborted) { setItems(page.items.map(remember)); setNext(page.nextBeforeIntentId); }
  }
  useEffect(() => {
    void run(signal => load(signal));
    return () => { operation.current?.abort(); operation.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, session]);
  return <section className="recording content" aria-label="Önceki kayıt onayları">
    <h2>Önceki kayıt onayları</h2>
    <p>Bu toplantı için hesabınızla verdiğiniz onayları başka cihazdan da kontrol edip geri alabilirsiniz.</p>
    {message && <p role="status">{message}</p>}
    {items.filter(item => item.intentId !== current?.intentId).map(item => <div key={item.intentId}>
      <p>Onay zamanı: {new Date(item.createdAt).toLocaleString('tr-TR')}. Son geçerlilik: {new Date(item.expiresAt).toLocaleString('tr-TR')}.</p>
      <p>{item.state === 'REVOKED' ? 'Onay geri alındı.' : 'Sunucuda saklanan onay; ses kaydının başladığını doğrulamaz.'}</p>
      {item.state !== 'REVOKED' && <button disabled={busy} onClick={() => void run(async signal => {
        const result = await withdrawHistoricalRecording(id, item, session, signal);
        if (!signal.aborted) { const known = remember(result); setItems(previous => previous.map(value => value.intentId === known.intentId ? known : value)); }
      })}>Bu önceki onayı geri al</button>}
    </div>)}
    <button disabled={busy} onClick={() => void run(signal => load(signal))}>Önceki onayları yenile</button>
    {next && <button disabled={busy} onClick={() => void run(signal => load(signal, next))}>Daha eski onayları göster</button>}
  </section>;
}
function Consent({ id, session, enabled, deny, onCurrent }: Props & { onCurrent: (value: RecordingView | null) => void }) {
  const [shown, setShown] = useState<RecordingTerms | null>(null);
  const [receipt, setReceipt] = useState<RecordingReceipt | null>(null);
  const [current, setCurrent] = useState<RecordingView | null>(null);
  const [accepted, setAccepted] = useState(false); const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(''); const [ready, setReady] = useState(false);
  const [absentExpired, setAbsentExpired] = useState(false);
  useEffect(() => { onCurrent(current); }, [current, onCurrent]);
  const operation = useRef<AbortController | null>(null); const denyRef = useRef(deny); denyRef.current = deny;

  async function run(action: (signal: AbortSignal) => Promise<void>) {
    if (operation.current) return;
    const controller = new AbortController(); operation.current = controller; setBusy(true); setMessage('');
    try { await action(controller.signal); }
    catch (error) {
      if (!controller.signal.aborted) {
        setMessage(error instanceof RecordingError ? error.message : 'Onay işlemi doğrulanamadı. Durumu tekrar kontrol edin.');
        if (error instanceof RecordingError && error.status === 401) denyRef.current(error.message);
      }
    } finally {
      if (operation.current === controller) { operation.current = null; if (!controller.signal.aborted) setBusy(false); }
    }
  }
  async function refresh(signal: AbortSignal, saved: RecordingReceipt) {
    setAbsentExpired(false);
    try {
      const result = await findRecording(id, saved.request, session, signal);
      if (!signal.aborted) { setCurrent(result); setMessage('Onay durumu sunucudan doğrulandı.'); }
    } catch (error) {
      // A local clock alone cannot retire an ambiguous request. Require a fresh server
      // not-found response beyond its absolute creation window, including clock margin.
      if (!signal.aborted && !current && error instanceof RecordingError && error.status === 404
        && error.serverTime !== null && error.serverTime > Date.parse(saved.request.expiresAt) + 60_000) setAbsentExpired(true);
      throw error;
    }
  }
  useEffect(() => {
    if (!enabled && !session.recordingStorageScope) return;
    void run(async signal => {
      const saved = await readRecordingReceipt(id, session); if (signal.aborted) return;
      setReceipt(saved); setReady(true);
      if (saved) { setShown(saved.terms); await refresh(signal, saved); }
      else if (enabled) { const value = await loadRecordingTerms(id, session, signal); if (!signal.aborted) { setShown(value); setAccepted(false); } }
    });
    return () => { operation.current?.abort(); operation.current = null; };
    // The keyed component owns the meeting; callback identity must not restart a mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, session, enabled]);

  function submit() {
    if (!ready || !shown || !accepted || !enabled || current || operation.current) return;
    void run(async signal => {
      const saved = receipt ?? { terms: shown, request: { requestKey: crypto.randomUUID(), consentVersion: shown.version,
        consentTextHash: shown.sha256, locale: shown.locale,
        expiresAt: new Date(Date.now() + Math.min(shown.maximumLifetimeSeconds, 3600) * 1000).toISOString() } };
      // Persist before POST. Lost responses/page reloads reuse this exact key and absolute expiry.
      saveRecordingReceipt(id, session, saved); setReceipt(saved); setAccepted(false);
      const result = await grantRecording(id, saved.request, session, signal);
      if (!signal.aborted) { setCurrent(result); setMessage('Onay kaydedildi.'); }
    });
  }
  function withdraw() {
    if (!receipt || !current || current.state === 'REVOKED') return;
    void run(async signal => {
      const result = await revokeRecording(id, receipt.request, current.intentId, session, signal);
      if (!signal.aborted) { setCurrent(result); setMessage('Kayıt onayı geri alındı.'); }
    });
  }
  function startNew() {
    if (!enabled || (current?.state !== 'REVOKED' && !absentExpired)) return;
    void run(async signal => {
      const next = await loadRecordingTerms(id, session, signal); if (signal.aborted) return;
      clearRecordingReceipt(id, session); setReceipt(null); setCurrent(null); setShown(next); setAccepted(false); setAbsentExpired(false);
    });
  }
  if (!enabled && !receipt && !message) return null;
  const expiry = receipt ? Date.parse(receipt.request.expiresAt) : null;
  const canRetry = !receipt || (expiry !== null && expiry > Date.now());
  return <section className="recording content" aria-label="Bot kayıt onayı">
    <h2>Bot kayıt onayı</h2>
    <p>Bu onay seçili toplantı içindir. Onay vermek tek başına botu toplantıya katmaz veya kaydı başlatmaz.</p>
    {message && <p role="status">{message}</p>}
    {shown && <><p className="consent-text">{shown.text}</p><small>Onay metni sürümü: {shown.version}</small></>}
    {receipt && <p>Bu onayın son geçerlilik zamanı: {new Date(receipt.request.expiresAt).toLocaleString('tr-TR')}</p>}
    {current ? <>
      <p>{current.state === 'REVOKED' ? 'Onay geri alındı.' : current.state === 'BOUND'
        ? 'Onay bir bot oturumuna bağlandı. Bu durum ses kaydının başladığını doğrulamaz.' : 'Onay sunucuda kayıtlı.'}</p>
      {current.state !== 'REVOKED' && <button disabled={busy} onClick={withdraw}>Kayıt onayını geri al</button>}
      {current.state === 'REVOKED' && enabled && <button disabled={busy} onClick={startNew}>Yeni onay metnini aç</button>}
    </> : receipt && <p>Önceki onay isteğinin sonucu doğrulanamadı. Durum kontrolü yeni bir onay oluşturmaz.</p>}
    {absentExpired && enabled && <button disabled={busy} onClick={startNew}>Süresi dolan isteği kapat, yeni onay metnini aç</button>}
    {shown && !current && enabled && ready && canRetry && <>
      <label className="calendar-choice"><input type="checkbox" checked={accepted} disabled={busy}
        onChange={event => setAccepted(event.target.checked)} /><span>Yukarıdaki metni okudum ve seçili toplantı için kabul ediyorum.</span></label>
      {!receipt && <p>Onay en fazla {Math.min(shown.maximumLifetimeSeconds, 3600) / 60} dakika geçerlidir; kendiliğinden yenilenmez.</p>}
      <button disabled={busy || !accepted} onClick={submit}>{receipt ? 'Aynı onay isteğini yeniden gönder' : 'Kayıt onayını ver'}</button>
    </>}
    <button disabled={busy} onClick={() => void run(async signal => {
      if (receipt) await refresh(signal, receipt);
      else {
        const saved = await readRecordingReceipt(id, session); if (signal.aborted) return;
        setReady(true); setReceipt(saved);
        if (saved) { setShown(saved.terms); await refresh(signal, saved); }
        else if (enabled) { const next = await loadRecordingTerms(id, session, signal); if (!signal.aborted) { setShown(next); setAccepted(false); } }
      }
    })}>Onay durumunu kontrol et</button>
  </section>;
}
