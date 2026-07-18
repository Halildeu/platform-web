import { FormEvent, useState } from 'react';
import {
  createReport,
  listMessages,
  openMailbox,
  sendReporterMessage,
  type Message,
  type Receipt,
} from './public-api';

type View = 'home' | 'report' | 'receipt' | 'mailbox-login' | 'mailbox';

export default function App() {
  const [view, setView] = useState<View>('home');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [mailboxReply, setMailboxReply] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const result = await createReport(
        {
          mode: form.get('mode'),
          category: form.get('category'),
          subject: form.get('subject'),
          description: form.get('description'),
          locale: 'tr',
        },
        crypto.randomUUID(),
      );
      setReceipt(result);
      setView('receipt');
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      await openMailbox(String(form.get('receiptId')), String(form.get('accessSecret')));
      setMessages(await listMessages());
      setView('mailbox');
    } catch {
      setError(
        'Erişim bilgileri doğrulanamadı veya geçici olarak kilitlendi. Bilgileri kontrol edip daha sonra yeniden deneyin.',
      );
    } finally {
      setBusy(false);
    }
  };
  const reply = async () => {
    if (!mailboxReply.trim()) return;
    setBusy(true);
    setError('');
    try {
      await sendReporterMessage(mailboxReply.trim());
      setMailboxReply('');
      setMessages(await listMessages());
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="public-shell">
      <header className="public-header">
        <button className="brand" onClick={() => setView('home')} aria-label="Etik Speak ana sayfa">
          <span className="brand-mark" aria-hidden="true">
            e
          </span>
          <span>Etik Speak</span>
        </button>
        <span className="security-note">Güvenli · Gizli · Hesapsız</span>
      </header>
      <main id="main-content">
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        {view === 'home' && (
          <Home
            onReport={() => {
              setError('');
              setView('report');
            }}
            onMailbox={() => {
              setError('');
              setView('mailbox-login');
            }}
          />
        )}
        {view === 'report' && (
          <ReportForm busy={busy} onSubmit={submit} onBack={() => setView('home')} />
        )}{' '}
        {view === 'receipt' && receipt && <ReceiptView receipt={receipt} />}{' '}
        {view === 'mailbox-login' && <MailboxLogin busy={busy} onSubmit={login} />}{' '}
        {view === 'mailbox' && (
          <Mailbox
            messages={messages}
            reply={mailboxReply}
            setReply={setMailboxReply}
            busy={busy}
            onSend={reply}
          />
        )}
      </main>
      <footer>
        <p>
          Acil tehlike durumunda ilgili acil yardım kanallarını kullanın. Bu kanal acil müdahale
          hattı değildir.
        </p>
        <nav aria-label="Yasal bağlantılar">
          <a href="/privacy">Gizlilik ve aydınlatma</a>
          <a href="/accessibility">Erişilebilirlik</a>
        </nav>
      </footer>
    </div>
  );
}

function Home({ onReport, onMailbox }: { onReport: () => void; onMailbox: () => void }) {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="eyebrow">Güvenli bildirim kanalı</div>
      <h1 id="hero-title">Sesinizi güvenle duyurun.</h1>
      <p className="lead">
        Etik ihlal, uygunsuz davranış veya endişenizi hesap açmadan iletin. Kimliğinizi paylaşmak
        zorunda değilsiniz.
      </p>
      <div className="hero-actions">
        <button className="primary" onClick={onReport}>
          Yeni bildirim yap
        </button>
        <button className="secondary" onClick={onMailbox}>
          Bildirimi takip et
        </button>
      </div>
      <div className="trust-grid">
        <article>
          <span aria-hidden="true">◌</span>
          <h2>Kimlik tercihi sizde</h2>
          <p>Anonim, gizli veya isimli bildirim yapabilirsiniz.</p>
        </article>
        <article>
          <span aria-hidden="true">↔</span>
          <h2>İki yönlü iletişim</h2>
          <p>Hesap açmadan etik ekibinin yanıtlarını okuyabilirsiniz.</p>
        </article>
        <article>
          <span aria-hidden="true">◇</span>
          <h2>Erişim bilgisi yalnız sizde</h2>
          <p>Başarıdan sonra verilen bilgiyi güvenli yerde saklayın.</p>
        </article>
      </div>
    </section>
  );
}
function ReportForm({
  busy,
  onSubmit,
  onBack,
}: {
  busy: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onBack: () => void;
}) {
  return (
    <section className="panel" aria-labelledby="report-title">
      <button className="back" onClick={onBack}>
        ← Geri
      </button>
      <div className="step">1 / 1</div>
      <h1 id="report-title">Yeni etik bildirimi</h1>
      <p>İlk test dilimi anonim bildirim içindir; yalnız gerekli bilgileri yazın.</p>
      <form onSubmit={onSubmit}>
        <fieldset>
          <legend>Bildirim biçimi</legend>
          <div className="radio-grid">
            <label>
              <input type="radio" name="mode" value="ANONYMOUS" defaultChecked />
              <strong>Anonim</strong>
              <span>Kimlik bilgisi istemez.</span>
            </label>
            <label aria-disabled="true">
              <input type="radio" name="mode" value="CONFIDENTIAL" disabled />
              <strong>Gizli · sonraki dilim</strong>
              <span>Kimlik kasası etkinleşmeden veri toplanmaz.</span>
            </label>
            <label aria-disabled="true">
              <input type="radio" name="mode" value="NAMED" disabled />
              <strong>İsimli · sonraki dilim</strong>
              <span>Kimlik kasası etkinleşmeden veri toplanmaz.</span>
            </label>
          </div>
        </fieldset>
        <label>
          Kategori
          <select name="category" required defaultValue="">
            <option value="" disabled>
              Seçin
            </option>
            <option value="WORKPLACE_CONDUCT">İş yeri davranışı</option>
            <option value="FRAUD_CORRUPTION">Usulsüzlük / yolsuzluk</option>
            <option value="HARASSMENT_DISCRIMINATION">Taciz / ayrımcılık</option>
            <option value="OTHER">Diğer</option>
          </select>
        </label>
        <label>
          Kısa konu
          <input name="subject" required maxLength={240} />
        </label>
        <label>
          Ne oldu?
          <textarea
            name="description"
            required
            maxLength={16000}
            rows={8}
            aria-describedby="privacy-help attachment-state"
          />
        </label>
        <p id="privacy-help" className="help">
          Gerekmedikçe kimlik, sağlık veya finans bilgisi yazmayın. Gönderimden sonra kayıt kalıcı
          hale gelir.
        </p>
        <fieldset className="attachment-state" aria-describedby="attachment-state">
          <legend>Ek dosya durumu</legend>
          <input type="file" disabled aria-label="Ek dosya" />
          <p id="attachment-state" role="status">
            Güvenli karantina ve zararlı içerik taraması bu test diliminde henüz etkin değil. Dosya
            sessizce kabul edilmez; bildiriminizi metinle tamamlayın.
          </p>
        </fieldset>
        <label className="check">
          <input type="checkbox" required />
          <span>Gizlilik ve aydınlatma metnini okudum.</span>
        </label>
        <button className="primary full" disabled={busy}>
          {busy ? 'Güvenli şekilde kaydediliyor…' : 'Bildirimi gönder'}
        </button>
      </form>
    </section>
  );
}
function ReceiptView({ receipt }: { receipt: Receipt }) {
  const download = () => {
    const blob = new Blob(
      [
        `Etik Speak erişim bilgisi\nReceipt: ${receipt.receiptId}\nAccess secret: ${receipt.accessSecret}\n`,
      ],
      { type: 'text/plain' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'etik-speak-erisim-bilgisi.txt';
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className="panel receipt" aria-labelledby="receipt-title">
      <div className="success-mark" aria-hidden="true">
        ✓
      </div>
      <h1 id="receipt-title">Bildiriminiz güvenle kaydedildi.</h1>
      <p>
        Bu iki değeri şimdi kaydedin. Erişim sırrı tekrar gösterilmeyecek ve kaybolursa geri
        alınamayacaktır.
      </p>
      <dl>
        <div>
          <dt>Bildirim numarası</dt>
          <dd>{receipt.receiptId}</dd>
        </div>
        <div>
          <dt>Erişim sırrı</dt>
          <dd>{receipt.accessSecret}</dd>
        </div>
      </dl>
      <button className="primary full" onClick={download}>
        Erişim bilgisini indir
      </button>
      <p className="help">
        Bu ekranın görüntüsünü ortak cihazda bırakmayın ve bilgileri e-postayla göndermeyin.
      </p>
    </section>
  );
}
function MailboxLogin({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="panel" aria-labelledby="mailbox-login-title">
      <h1 id="mailbox-login-title">Bildirimi takip et</h1>
      <p>
        Başarı ekranında sakladığınız iki bilgiyi girin. Bilgiler URL'ye veya tarayıcı depolamasına
        yazılmaz.
      </p>
      <form onSubmit={onSubmit}>
        <label>
          Bildirim numarası
          <input name="receiptId" autoComplete="off" required />
        </label>
        <label>
          Erişim sırrı
          <input name="accessSecret" type="password" autoComplete="off" required />
        </label>
        <button className="primary full" disabled={busy}>
          {busy ? 'Doğrulanıyor…' : 'Güvenli mailbox aç'}
        </button>
      </form>
    </section>
  );
}
function Mailbox({
  messages,
  reply,
  setReply,
  busy,
  onSend,
}: {
  messages: Message[];
  reply: string;
  setReply: (v: string) => void;
  busy: boolean;
  onSend: () => void;
}) {
  return (
    <section className="panel mailbox" aria-labelledby="mailbox-title">
      <h1 id="mailbox-title">Güvenli mailbox</h1>
      <p className="help">
        Bu oturum kısa sürelidir. Ortak cihazda işiniz bitince pencereyi kapatın.
      </p>
      <ol>
        {messages.length === 0 && <li className="empty">Henüz mesaj yok.</li>}
        {messages.map((m) => (
          <li key={m.id} className={m.authorType === 'STAFF' ? 'staff' : 'reporter'}>
            <strong>{m.authorType === 'STAFF' ? 'Etik ekibi' : 'Siz'}</strong>
            <p>{m.body}</p>
            <time>{new Date(m.createdAt).toLocaleString('tr-TR')}</time>
          </li>
        ))}
      </ol>
      <label>
        Yanıtınız
        <textarea
          rows={5}
          value={reply}
          maxLength={16000}
          onChange={(e) => setReply(e.target.value)}
        />
      </label>
      <button className="primary" disabled={busy || !reply.trim()} onClick={onSend}>
        Yanıtı gönder
      </button>
    </section>
  );
}
const message = (e: unknown) => (e instanceof Error ? e.message : 'İşlem tamamlanamadı.');
