import { useEffect, useRef, useState } from 'react';
import { pages } from '@microsoft/teams-js';
import { BASE, selectedMeeting, type PanelConfig } from './config';
import { signIn, type PanelSession } from './auth';
import { AccessError, UnavailableError, checkLiveAccess, findMeetings, loadMeeting, receiveAnalysis,
  receiveTranscript, streamOnce, type LiveAnalysis, type Meeting } from './live';
import { expandSpeakerTurns } from '../../apps/mfe-meeting/src/speaker-attribution';
import type { TranscriptSegment } from '../../apps/mfe-meeting/src/meeting-workbench';
import { CalendarPicker } from './CalendarPicker';

type Tab = 'Metin' | 'Özet' | 'Kararlar' | 'Aksiyonlar';
const pause = (signal: AbortSignal, ms: number) => new Promise<void>(resolve => {
  const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); };
  const timer = setTimeout(done, ms);
  signal.addEventListener('abort', done, { once: true });
  if (signal.aborted) done();
});

export function Panel({ config }: { config: PanelConfig }) {
  const [session, setSession] = useState<PanelSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => () => session?.close(), [session]);
  async function login() {
    const epoch = ++generation.current;
    setBusy(true); setError('');
    try {
      const next = await signIn(config);
      if (generation.current !== epoch) { next.close(); return; }
      setSession(next);
    } catch { if (generation.current === epoch) setError('Giriş tamamlanamadı. Yeniden deneyin.'); }
    finally { if (generation.current === epoch) setBusy(false); }
  }
  function exit(message = '') { generation.current++; session?.close(); setSession(null); setError(message); }
  const configuring = new URLSearchParams(location.search).get('configure') === '1';
  const id = selectedMeeting(location.search);
  return <main>
    <header><p className="eyebrow">MEETING INTELLIGENCE</p><h1>Toplantı</h1></header>
    {error && <p role="alert">{error}</p>}
    {!session ? <section><p>Toplantı içeriğini görmek için platform hesabınızla giriş yapın.</p>
      <button onClick={() => void login()} disabled={busy}>{busy ? 'Giriş bekleniyor…' : 'Giriş yap'}</button></section>
      : <><button className="quiet" onClick={() => exit()}>Panel oturumunu kapat</button>
        {configuring ? <Configure session={session} deny={exit} calendarEnabled={config.calendarEnabled} /> : id
          ? <>{config.calendarEnabled && <CalendarPicker id={id} session={session} deny={exit} />}
            <LiveMeeting key={id} id={id} session={session} deny={exit} /></>
          : <p role="alert">Bu sekme bir toplantıya bağlanmamış. Toplantıyı düzenleyen kişi sekme ayarından toplantıyı seçebilir.</p>}</>}
  </main>;
}

function Configure({ session, deny, calendarEnabled }: { session: PanelSession; deny: (message: string) => void; calendarEnabled?: boolean }) {
  const [query, setQuery] = useState('');
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [chosen, setChosen] = useState<Meeting | null>(null);
  const [message, setMessage] = useState('');
  const operation = useRef<AbortController | null>(null);
  useEffect(() => {
    pages.config.setValidityState(false);
    return () => { operation.current?.abort(); pages.config.setValidityState(false); };
  }, []);
  useEffect(() => {
    pages.config.setValidityState(!!chosen);
    pages.config.registerOnSaveHandler(async event => {
      if (!chosen) { event.notifyFailure('Önce bir toplantı seçin.'); return; }
      operation.current?.abort();
      const controller = new AbortController(); operation.current = controller;
      try {
        await checkLiveAccess(chosen.id, session, controller.signal);
        if (controller.signal.aborted) throw new Error('cancelled');
        await pages.config.setConfig({ entityId: `meeting:${chosen.id}`, suggestedDisplayName: 'Meeting Intelligence',
          contentUrl: `${location.origin}${BASE}index.html?meetingId=${encodeURIComponent(chosen.id)}` });
        event.notifySuccess();
      } catch { event.notifyFailure('Toplantı erişimi doğrulanamadı.'); }
      finally { controller.abort(); }
    });
  }, [chosen, session]);
  async function search() {
    operation.current?.abort();
    const controller = new AbortController(); operation.current = controller;
    setChosen(null); setMeetings([]); setMessage('Toplantılar aranıyor…');
    try {
      const result = await findMeetings(query, session, controller.signal);
      if (controller.signal.aborted) return;
      setMeetings(result); setMessage(result.length ? 'Bu sekmede gösterilecek toplantıyı seçin.' : 'Erişebildiğiniz bir toplantı bulunamadı.');
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof AccessError) deny(err.message); else setMessage('Toplantılar yüklenemedi.');
    }
  }
  async function choose(meeting: Meeting) {
    operation.current?.abort(); const controller = new AbortController(); operation.current = controller;
    setChosen(null); setMessage('Toplantı erişimi doğrulanıyor…');
    try {
      await checkLiveAccess(meeting.id, session, controller.signal);
      if (controller.signal.aborted) return;
      setChosen(meeting); setMessage(`Seçildi: ${meeting.title}. Teams’te Kaydet’e basın.`);
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof AccessError) deny(err.message); else setMessage('Bu toplantının canlı görünümü açılamıyor.');
    }
  }
  return <section><h2>Toplantıyı bağla</h2><p>Bu seçim panelde gösterilecek toplantıyı belirler. Botun katılımını başlatmaz.</p>
    <form onSubmit={event => { event.preventDefault(); void search(); }}><label htmlFor="meeting-search">Toplantı adı</label>
      <input id="meeting-search" value={query} maxLength={200} onChange={event => setQuery(event.target.value)} /><button>Ara</button></form>
    <p role="status">{message}</p><ul className="meeting-list">{meetings.map(meeting => <li key={meeting.id}>
      <button onClick={() => void choose(meeting)} aria-pressed={chosen?.id === meeting.id}>{meeting.title}</button></li>)}</ul>
    {calendarEnabled && chosen && <CalendarPicker id={chosen.id} session={session} deny={deny} />}
  </section>;
}

export function LiveMeeting({ id, session, deny }: { id: string; session: PanelSession; deny: (message: string) => void }) {
  const [attempt, setAttempt] = useState(0);
  const [retryAvailable, setRetryAvailable] = useState(false);
  const [title, setTitle] = useState('');
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [analysis, setAnalysis] = useState<LiveAnalysis | null>(null);
  const [tab, setTab] = useState<Tab>('Metin');
  const [message, setMessage] = useState('Toplantı erişimi doğrulanıyor…');
  const [state, setState] = useState({ transcript: 'Bağlanıyor', analysis: 'Bağlanıyor' });
  const denyRef = useRef(deny); denyRef.current = deny;
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setRetryAvailable(false); setMessage('Toplantı erişimi doğrulanıyor…');
    setState({ transcript: 'Bağlanıyor', analysis: 'Bağlanıyor' });
    const clear = () => { setTitle(''); setSegments([]); setAnalysis(null); };
    function fatal(err: Error) {
      controller.abort(); clear(); setMessage(err.message);
      setState({ transcript: 'Kapalı', analysis: 'Kapalı' });
      if (err instanceof AccessError) denyRef.current(err.message);
      else setRetryAvailable(true);
    }
    async function feed(kind: 'transcript' | 'analysis') {
      while (!signal.aborted) {
        try {
          await streamOnce(id, kind, session, signal,
            () => { if (!signal.aborted) setState(prev => ({ ...prev, [kind]: 'Bağlandı; yeni sonuç bekleniyor' })); },
            raw => {
              if (signal.aborted) return;
              if (kind === 'transcript') {
                receiveTranscript([], raw); // Validate before entering React's deferred updater.
                setSegments(prev => receiveTranscript(prev, raw));
              }
              else setAnalysis(receiveAnalysis(raw, id));
              setState(prev => ({ ...prev, [kind]: 'Canlı sonuç alındı' }));
            });
        } catch (err) {
          if (signal.aborted) return;
          if (err instanceof AccessError || err instanceof UnavailableError) { fatal(err); return; }
        }
        if (signal.aborted) return;
        setState(prev => ({ ...prev, [kind]: 'Bağlantı kesildi; yeniden bağlanıyor' }));
        setMessage('Kesinti sırasında gönderilen sonuçlar bu canlı akışta tekrar gelmeyebilir.');
        await pause(signal, 5000);
      }
    }
    async function monitorAccess() {
      while (!signal.aborted) {
        await pause(signal, 60_000);
        if (signal.aborted) return;
        try { await checkLiveAccess(id, session, signal); }
        catch (err) {
          if (signal.aborted) return;
          // Fail closed if periodic server authorization cannot be verified.
          fatal(err instanceof Error ? err : new AccessError('Erişim doğrulanamadı.')); return;
        }
      }
    }
    void (async () => {
      try {
        const meeting = await loadMeeting(id, session, signal);
        await checkLiveAccess(id, session, signal);
        if (signal.aborted) return;
        setTitle(meeting.title); setMessage('Panel açıldıktan sonra gelen canlı sonuçlar gösterilir.');
        void feed('transcript'); void feed('analysis'); void monitorAccess();
      } catch (err) { if (!signal.aborted) fatal(err instanceof Error ? err : new Error('Toplantı açılamadı.')); }
    })();
    return () => controller.abort();
  }, [id, session, attempt]);
  const rendered = expandSpeakerTurns(segments);
  return <section>
    {title && <h2>{title}</h2>}
    <p role="status" className="notice">{message}</p>
    {retryAvailable && <button onClick={() => setAttempt(value => value + 1)}>Canlı görünümü yeniden aç</button>}
    <div className="connection"><span>Metin: {state.transcript}</span><span>Analiz: {state.analysis}</span></div>
    <nav aria-label="Toplantı bölümleri">{(['Metin', 'Özet', 'Kararlar', 'Aksiyonlar'] as Tab[]).map(label =>
      <button key={label} aria-pressed={tab === label} onClick={() => setTab(label)}>{label}</button>)}</nav>
    <div className="content" aria-label={tab}>
      {tab === 'Metin' ? <>{!segments.length && <p>Yeni konuşma metni bekleniyor.</p>}
        {rendered.map(segment => <p key={segment.id} data-source-id={segment.id}>
          {segment.speakerKey && <span className="speaker">{segment.speaker}: </span>}{segment.text}</p>)}</>
        : <><p className="draft">Toplantı sırasında gelen taslak; nihai kayıt değildir.</p>
          {!analysis ? <p>Yeni analiz sonucu bekleniyor.</p> : tab === 'Özet' ? <p>{analysis.summary || 'Henüz özet yok.'}</p>
            : tab === 'Kararlar' ? <>{!analysis.decisions.length && <p>Bu canlı sonuçta henüz karar yok.</p>}<ul>{analysis.decisions.map((text, index) => <li key={index}>{text}</li>)}</ul></>
              : <>{!analysis.actions.length && <p>Bu canlı sonuçta henüz aksiyon yok.</p>}<ul>{analysis.actions.map((item, index) => <li key={index}>
                <p>{item.text}</p><small>Sorumlu: {item.owner || 'Belirtilmedi'}{item.dueDate ? ` · Tarih: ${item.dueDate}` : ''}</small>
              </li>)}</ul></>}
        </>}
    </div>
  </section>;
}
