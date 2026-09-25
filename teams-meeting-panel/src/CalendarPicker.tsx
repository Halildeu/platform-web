import { useEffect, useRef, useState } from 'react';
import type { PanelSession } from './auth';
import { browseEvents, CalendarError, cancelSchedule, readSchedule, selectEvent, type CalendarChoices, type CalendarSchedule } from './calendar';

type Props = { id: string; session: PanelSession; deny: (message: string) => void };
const dateValue = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const localDay = (value: string) => {
  if (!/^\d{4}-\d\d-\d\d$/.test(value)) throw new Error('invalid_day');
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (dateValue(date) !== value) throw new Error('invalid_day');
  return date;
};
const dateTime = (value: string) => new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
const states = { pending: 'Katılım planlandı', dispatching: 'Katılım başlatılıyor', joined: 'Bot katıldı',
  cancelled: 'Planlanan katılım iptal edildi', expired: 'Toplantının zamanı geçti', failed: 'Bot katılımı tamamlanamadı' };

// A new canonical meeting mounts fresh state, including any unresolved mutation.
export function CalendarPicker(props: Props) { return <CalendarView key={props.id} {...props} />; }
function CalendarView({ id, session, deny }: Props) {
  const [from, setFrom] = useState(() => dateValue(new Date()));
  const [to, setTo] = useState(() => { const date = new Date(); date.setDate(date.getDate() + 6); return dateValue(date); });
  const [choices, setChoices] = useState<CalendarChoices | null>(null);
  const [selected, setSelected] = useState('');
  const [current, setCurrent] = useState<CalendarSchedule | null>(null);
  const [known, setKnown] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Katılım durumu kontrol ediliyor…');
  const operation = useRef<AbortController | null>(null);
  const denyRef = useRef(deny); denyRef.current = deny;

  async function run(kind: 'status' | 'browse' | 'select' | 'cancel') {
    if (operation.current) return; // synchronous guard also prevents rapid duplicate clicks
    const controller = new AbortController(); operation.current = controller;
    const { signal } = controller;
    setBusy(true); setMessage('Kontrol ediliyor…');
    if (kind === 'browse') { setChoices(null); setSelected(''); }
    try {
      if (kind === 'browse') {
        const start = localDay(from); const end = localDay(to); end.setDate(end.getDate() + 1);
        const result = await browseEvents(id, new Date(Math.max(start.getTime(), Date.now())).toISOString(), end.toISOString(), session, signal);
        if (signal.aborted) return;
        setChoices(result); setMessage(result.items.length ? 'Botun katılacağı Outlook toplantısını seçin.' : 'Bu aralıkta düzenlediğiniz uygun bir Teams toplantısı bulunamadı.');
      } else {
        let result: CalendarSchedule | null;
        if (kind === 'select') result = await selectEvent(id, selected, session, signal);
        else {
          if (kind === 'cancel') await cancelSchedule(id, session, signal);
          result = await readSchedule(id, session, signal);
        }
        if (signal.aborted) return;
        setCurrent(result); setKnown(true); setUncertain(false);
        if (kind !== 'status' || result || uncertain) { setChoices(null); setSelected(''); }
        setMessage(result ? states[result.state] : 'Bu toplantı için size ait planlanmış bot katılımı bulunamadı.');
      }
    } catch (error) {
      if (signal.aborted) return;
      setChoices(null); setSelected(''); setCurrent(null); setKnown(false);
      if (kind === 'select' || kind === 'cancel') setUncertain(true);
      if (error instanceof CalendarError && error.status === 401) { denyRef.current(error.message); return; }
      setMessage(error instanceof CalendarError ? error.message : 'Bağlantı doğrulanamadı. Katılım durumunu yeniden kontrol edin.');
    } finally {
      if (!signal.aborted) setBusy(false);
      controller.abort();
      if (operation.current === controller) operation.current = null;
    }
  }
  const statusRef = useRef(() => void run('status')); statusRef.current = () => void run('status');
  useEffect(() => {
    statusRef.current();
    const timer = setInterval(() => statusRef.current(), 60_000);
    return () => { clearInterval(timer); operation.current?.abort(); operation.current = null; };
  }, [id, session]);
  const canChoose = known && !current && !uncertain;
  return <section className="calendar content" aria-label="Bot katılımı">
    <h2>Bot katılımı</h2>
    <p>Outlook takviminizde düzenlediğiniz Teams toplantısını seçerek botun katılımını planlayın.</p>
    <p className="notice">Saatler cihazınızın saat dilimindedir: {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p>
    <p role="status">{message}</p>
    {uncertain && <p role="alert">Son isteğin sonucu kesinleşmedi. Tekrar işlem yapmadan önce katılım durumunu kontrol edin.</p>}
    {current && <><p>{dateTime(current.startsAt)} – {dateTime(current.endsAt)}</p>
      {current.state === 'pending' && <button disabled={busy} onClick={() => void run('cancel')}>Planlanan katılımı iptal et</button>}
      {current.state === 'joined' && <p className="notice">Botun katılmış olması ses ve analizin başladığını doğrulamaz. Canlı sonuçları aşağıdan izleyebilirsiniz.</p>}
      {['cancelled', 'expired', 'failed'].includes(current.state) && <p className="notice">Yeni bir katılım planlamak için ayrı bir platform toplantısı seçin.</p>}</>}
    <button className="quiet" disabled={busy} onClick={() => void run('status')}>Katılım durumunu kontrol et</button>
    {canChoose && <form onSubmit={event => { event.preventDefault(); void run('browse'); }}>
      <label>Başlangıç günü<input type="date" required value={from} disabled={busy} onChange={event => { setFrom(event.target.value); setChoices(null); setSelected(''); }} /></label>
      <label>Son gün<input type="date" required value={to} disabled={busy} onChange={event => { setTo(event.target.value); setChoices(null); setSelected(''); }} /></label>
      <button disabled={busy}>Outlook toplantılarını getir</button>
    </form>}
    {canChoose && choices && <>
      {choices.truncated && <p role="alert">Listenin tamamı gösterilemedi. Aradığınız toplantı yoksa tarih aralığını daraltın.</p>}
      <fieldset disabled={busy}><legend>Teams toplantısı</legend>
        {choices.items.map(item => <label className="calendar-choice" key={item.eventId}>
          <input type="radio" name={`calendar-${id}`} value={item.eventId} checked={selected === item.eventId} onChange={() => setSelected(item.eventId)} />
          <span>{item.title || 'Başlıksız toplantı'}<small>{dateTime(item.startsAt)} – {dateTime(item.endsAt)}</small></span>
        </label>)}
      </fieldset>
      {!!choices.items.length && <button disabled={busy || !selected} onClick={() => void run('select')}>Seçilen toplantıya katılımı planla</button>}
    </>}
  </section>;
}
