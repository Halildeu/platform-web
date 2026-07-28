import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  closeMailbox,
  createReport,
  declareEvidence,
  getMailbox,
  listEvidence,
  newAccessSecret,
  openMailbox,
  sendReporterMessage,
  uploadEvidence,
  validateEvidenceFile,
  type EvidenceState,
  type EvidenceStatus,
  type Message,
  type ReporterCaseStatus,
  type Receipt,
} from './public-api';

type View =
  | 'home'
  | 'report'
  | 'receipt'
  | 'mailbox-login'
  | 'mailbox'
  | 'privacy'
  | 'accessibility';

const initialView = (): View => {
  if (window.location.pathname === '/privacy') return 'privacy';
  if (window.location.pathname === '/accessibility') return 'accessibility';
  return 'home';
};

export default function App() {
  const [view, setView] = useState<View>(initialView);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [mailboxStatus, setMailboxStatus] = useState<ReporterCaseStatus | null>(null);
  // Kept beside the status because it answers the other half of "nerede duruyor":
  // the status says what stage the case is at, this says whether the promise made
  // when it was filed is still being kept.
  const [acknowledgement, setAcknowledgement] = useState<ReturnType<typeof reporterAcknowledgement> | null>(null);
  const [attachments, setAttachments] = useState<EvidenceStatus[]>([]);
  const [attachmentError, setAttachmentError] = useState('');
  const [mailboxReply, setMailboxReply] = useState('');
  const [receiptSaved, setReceiptSaved] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const intakeOperation = useRef({ key: crypto.randomUUID(), secret: newAccessSecret() });
  const replyOperation = useRef<{ body: string; key: string } | null>(null);
  const attachmentOperation = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    const heading = document.querySelector<HTMLElement>('#main-content h1');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus();
    }
  }, [view]);

  useEffect(() => {
    if (view !== 'receipt' || receiptSaved) return undefined;
    const guardUnsavedReceipt = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', guardUnsavedReceipt);
    return () => window.removeEventListener('beforeunload', guardUnsavedReceipt);
  }, [receiptSaved, view]);

  useEffect(() => {
    if (view !== 'mailbox') return undefined;
    const refresh = async () => {
      try {
        setAttachments(await listEvidence());
        setAttachmentError('');
      } catch {
        setAttachmentError(
          'Kanıt dosyası durumları şu anda doğrulanamıyor. Mesaj ve takip işlemleri kullanılabilir.',
        );
      }
    };
    const interval = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(interval);
  }, [view]);

  const loadMailbox = async () => {
    const mailbox = await getMailbox();
    setMessages(mailbox.messages);
    setMailboxStatus(mailbox.status);
    setAcknowledgement(reporterAcknowledgement(mailbox));
    try {
      setAttachments(await listEvidence());
      setAttachmentError('');
    } catch {
      setAttachments([]);
      setAttachmentError(
        'Kanıt dosyası özelliği henüz etkin değil veya durumları doğrulanamıyor. Mesajlarınızı kullanmaya devam edebilirsiniz.',
      );
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const operation = intakeOperation.current;
      const result = await createReport(
        {
          mode: form.get('mode'),
          category: form.get('category'),
          subject: form.get('subject'),
          description: form.get('description'),
          locale: 'tr',
        },
        operation.key,
        operation.secret,
      );
      setReceipt(result);
      setReceiptSaved(false);
      intakeOperation.current = { key: crypto.randomUUID(), secret: newAccessSecret() };
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
      await loadMailbox();
      setView('mailbox');
    } catch {
      setError(
        'Erişim bilgileri doğrulanamadı veya geçici olarak kilitlendi. Bilgileri kontrol edip daha sonra yeniden deneyin.',
      );
    } finally {
      setBusy(false);
    }
  };
  const openReceiptMailbox = async () => {
    if (!receipt || !receiptSaved) return;
    setBusy(true);
    setError('');
    try {
      await openMailbox(receipt.receiptId, receipt.accessSecret);
      await loadMailbox();
      setReceipt(null);
      setView('mailbox');
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const reply = async () => {
    if (!mailboxReply.trim()) return;
    setBusy(true);
    setError('');
    const body = mailboxReply.trim();
    if (!replyOperation.current || replyOperation.current.body !== body)
      replyOperation.current = { body, key: crypto.randomUUID() };
    try {
      await sendReporterMessage(body, replyOperation.current.key);
      replyOperation.current = null;
      setMailboxReply('');
      await loadMailbox();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const uploadAttachments = async (files: File[]) => {
    // Strictly sequential. The idempotency key lives in a single ref, so
    // concurrent uploads would hand two files the same key; and a reporter
    // adding five pages should see them settle one by one, not all at once.
    setUploadBusy(true);
    setAttachmentError('');
    for (const file of files) {
      // eslint-disable-next-line no-await-in-loop
      await uploadOne(file);
    }
    setUploadBusy(false);
  };

  const uploadOne = async (file: File) => {
    try {
      validateEvidenceFile(file);
      const fingerprint = `${file.type}\n${file.size}\n${file.lastModified}`;
      if (!attachmentOperation.current || attachmentOperation.current.fingerprint !== fingerprint)
        attachmentOperation.current = { fingerprint, key: crypto.randomUUID() };
      const declaration = await declareEvidence(file, attachmentOperation.current.key);
      if (declaration.uploadCapability) await uploadEvidence(declaration, file);
      attachmentOperation.current = null;
      setAttachments(await listEvidence());
    } catch (e) {
      try {
        setAttachments(await listEvidence());
      } catch {
        // The user-facing error below remains authoritative when status read-back also fails.
      }
      setAttachmentError(message(e));
    }
  };

  return (
    <div className="public-shell">
      <a className="skip-link" href="#main-content">
        Ana içeriğe geç
      </a>
      <header className="public-header">
        <button
          className="brand"
          onClick={() => {
            if (view === 'receipt' && !receiptSaved) {
              setError(
                'Ana sayfaya dönmeden önce erişim bilgisini indirin veya kaydettiğinizi onaylayın.',
              );
              return;
            }
            setView('home');
          }}
          aria-label="Etik Speak ana sayfa"
        >
          <span className="brand-mark" aria-hidden="true">
            e
          </span>
          <span>Etik Speak</span>
        </button>
        <span className="security-note">Hesapsız test pilotu · Yalnız sentetik veri</span>
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
        {view === 'receipt' && receipt && (
          <ReceiptView
            receipt={receipt}
            saved={receiptSaved}
            busy={busy}
            onSaved={setReceiptSaved}
            onMailbox={() => void openReceiptMailbox()}
          />
        )}{' '}
        {view === 'mailbox-login' && <MailboxLogin busy={busy} onSubmit={login} />}{' '}
        {view === 'mailbox' && (
          <Mailbox
            status={mailboxStatus}
            acknowledgement={acknowledgement}
            messages={messages}
            attachments={attachments}
            attachmentError={attachmentError}
            reply={mailboxReply}
            setReply={setMailboxReply}
            busy={busy}
            uploadBusy={uploadBusy}
            onSend={reply}
            onUpload={(files) => void uploadAttachments(files)}
            onClose={async () => {
              try {
                await closeMailbox();
              } finally {
                setMessages([]);
                setMailboxStatus(null);
                setAttachments([]);
                setAttachmentError('');
                setMailboxReply('');
                setReceipt(null);
                replyOperation.current = null;
                attachmentOperation.current = null;
                setView('home');
              }
            }}
          />
        )}
        {view === 'privacy' && <PrivacyNotice />}
        {view === 'accessibility' && <AccessibilityNotice />}
      </main>
      <footer>
        <p>
          Acil tehlike durumunda ilgili acil yardım kanallarını kullanın. Bu kanal acil müdahale
          hattı değildir.
        </p>
        <nav aria-label="Yasal bağlantılar">
          <a href="/privacy">Test pilotu veri kullanımı</a>
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
        İlk test pilotunda yalnız sentetik bir etik bildirimini hesap açmadan iletin. Bu ortam
        gerçek kişi veya olay verisi kabulü için henüz açılmamıştır.
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
          <h2>İlk dilim anonimdir</h2>
          <p>Kimlik kasası onaylanana kadar gizli ve isimli modlar veri toplamaz.</p>
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
          <legend>Ek dosya</legend>
          <p id="attachment-state" role="status">
            Önce bildiriminiz kalıcı olarak kaydedilir. Ardından receipt ile açılan güvenli
            mailbox’ta kanıt dosyanızı karantina ve zararlı içerik taramasına gönderebilirsiniz.
          </p>
        </fieldset>
        <label className="check">
          <input type="checkbox" required />
          <span>
            <a href="/privacy" target="_blank" rel="noreferrer">
              Test pilotu veri kullanımı ve sınırını
            </a>{' '}
            okudum; yalnız sentetik veri gireceğim.
          </span>
        </label>
        <button className="primary full" disabled={busy}>
          {busy ? 'Güvenli şekilde kaydediliyor…' : 'Bildirimi gönder'}
        </button>
      </form>
    </section>
  );
}
function ReceiptView({
  receipt,
  saved,
  busy,
  onSaved,
  onMailbox,
}: {
  receipt: Receipt;
  saved: boolean;
  busy: boolean;
  onSaved: (value: boolean) => void;
  onMailbox: () => void;
}) {
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
    onSaved(true);
  };
  return (
    <section className="panel receipt" aria-labelledby="receipt-title">
      <div className="success-mark" aria-hidden="true">
        ✓
      </div>
      <h1 id="receipt-title">Test bildiriminiz kalıcı olarak kaydedildi.</h1>
      <p>
        Bu iki değeri şimdi kaydedin. Erişim sırrı tekrar gösterilmeyecek ve kaybolursa geri
        alınamayacaktır.
      </p>
      <dl>
        <div>
          <dt>Bildirim numarası</dt>
          <dd data-testid="etik-receipt-id">{receipt.receiptId}</dd>
        </div>
        <div>
          <dt>Erişim sırrı</dt>
          <dd data-testid="etik-access-secret">{receipt.accessSecret}</dd>
        </div>
      </dl>
      <button className="primary full" onClick={download}>
        Erişim bilgisini indir
      </button>
      <label className="check">
        <input
          type="checkbox"
          checked={saved}
          onChange={(event) => onSaved(event.target.checked)}
        />
        <span>Bildirim numarası ile erişim sırrını güvenli bir yere kaydettim.</span>
      </label>
      <button className="secondary full" disabled={!saved || busy} onClick={onMailbox}>
        {busy ? 'Güvenli mailbox açılıyor…' : 'Mailbox’a geç ve kanıt dosyası ekle'}
      </button>
      <p className="help">
        Bu ekranın görüntüsünü ortak cihazda bırakmayın ve bilgileri e-postayla göndermeyin.
      </p>
    </section>
  );
}
/**
 * Reads back the file the success screen offered.
 *
 * We hand the reporter a file and then used to ask them to retype both values
 * out of it — two long opaque strings, often on a shared device, at the most
 * stressful point in the flow. Accepting the file we ourselves produced closes
 * that loop.
 *
 * Deliberately lenient about line endings and spacing, and deliberately strict
 * about nothing else: the file is parsed in the browser and never uploaded.
 */
export const parseAccessFile = (text: string): { receiptId: string; accessSecret: string } | null => {
  const read = (label: string) => {
    const match = text.match(new RegExp(`^\\s*${label}\\s*:\\s*(.+?)\\s*$`, 'im'));
    return match ? match[1] : '';
  };
  const receiptId = read('Receipt');
  const accessSecret = read('Access secret');
  if (!receiptId || !accessSecret) return null;
  return { receiptId, accessSecret };
};

function MailboxLogin({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  const [fileError, setFileError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  const readAccessFile = async (file: File) => {
    setFileError('');
    // The access file is tiny; anything larger is not the file we produced.
    if (file.size > 4096) {
      setFileError('Bu dosya erişim bilgisi dosyasına benzemiyor.');
      return;
    }
    const parsed = parseAccessFile(await file.text());
    if (!parsed) {
      setFileError('Dosyada bildirim numarası ve erişim sırrı bulunamadı.');
      return;
    }
    const form = formRef.current;
    if (!form) return;
    (form.elements.namedItem('receiptId') as HTMLInputElement).value = parsed.receiptId;
    (form.elements.namedItem('accessSecret') as HTMLInputElement).value = parsed.accessSecret;
  };

  return (
    <section className="panel" aria-labelledby="mailbox-login-title">
      <h1 id="mailbox-login-title">Bildirimi takip et</h1>
      <p>
        Başarı ekranında indirdiğiniz dosyayı seçin ya da iki bilgiyi elle girin. Bilgiler URL'ye
        veya tarayıcı depolamasına yazılmaz; dosya yalnız bu cihazda okunur, sunucuya gönderilmez.
      </p>
      <label className="access-file-picker">
        Erişim bilgisi dosyasını seç
        <input
          type="file"
          accept=".txt,text/plain"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void readAccessFile(file);
          }}
        />
      </label>
      <div role={fileError ? 'alert' : 'status'} className="access-file-feedback">
        {fileError}
      </div>
      <form ref={formRef} onSubmit={onSubmit}>
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
  status,
  acknowledgement,
  messages,
  attachments,
  attachmentError,
  reply,
  setReply,
  busy,
  uploadBusy,
  onSend,
  onUpload,
  onClose,
}: {
  status: ReporterCaseStatus | null;
  acknowledgement: ReturnType<typeof reporterAcknowledgement> | null;
  messages: Message[];
  attachments: EvidenceStatus[];
  attachmentError: string;
  reply: string;
  setReply: (v: string) => void;
  busy: boolean;
  uploadBusy: boolean;
  onSend: () => void;
  onUpload: (files: File[]) => void;
  onClose: () => void;
}) {
  return (
    <section className="panel mailbox" aria-labelledby="mailbox-title">
      <h1 id="mailbox-title">Güvenli mailbox</h1>
      {status && (
        <p className="case-status" data-testid="etik-case-status">
          Bildirim durumu: <strong>{reporterStatusLabel(status)}</strong>
        </p>
      )}
      {/* The status says which stage the case is at; this says whether the promise made
          when it was filed is being kept. A reporter with no channel back has no other
          way to learn it — they cannot be told, so the page has to say it when they come. */}
      {acknowledgement?.known && (
        <p
          className={`case-acknowledgement${acknowledgement.overdue ? ' is-overdue' : ''}`}
          data-testid="etik-case-acknowledgement"
          data-overdue={acknowledgement.overdue}
          role={acknowledgement.overdue ? 'alert' : undefined}
        >
          {acknowledgement.text}
        </p>
      )}
      <p className="help">
        Bu oturum kısa sürelidir. Ortak cihazda işiniz bitince pencereyi kapatın.
      </p>
      <section className="mailbox-evidence" aria-labelledby="mailbox-evidence-title">
        <h2 id="mailbox-evidence-title">Kanıt dosyaları</h2>
        <p className="help">
          Yalnız sentetik UTF-8 TXT, JPEG veya PNG; en fazla 25 MiB. Dosya adı sunucuya gönderilmez.
          Yönetici yalnız taranmış ve metadata’dan arındırılmış türevi görebilir.
        </p>
        <label className="evidence-picker">
          {attachments.length === 0 ? 'Kanıt dosyası seç' : 'Başka bir kanıt dosyası ekle'}
          <input
            type="file"
            accept=".txt,text/plain,.jpg,.jpeg,image/jpeg,.png,image/png"
            // Several files at once, and the picker stays open afterwards: a
            // reporter usually has more than one page of evidence, and deciding
            // when the set is complete belongs to them, not to the first upload.
            multiple
            disabled={uploadBusy}
            onChange={(event) => {
              const chosen = Array.from(event.target.files ?? []);
              event.target.value = '';
              if (chosen.length) onUpload(chosen);
            }}
          />
        </label>
        <div role={attachmentError ? 'alert' : 'status'} className="attachment-feedback">
          {attachmentError ||
            (uploadBusy
              ? 'Dosya özeti hesaplanıyor ve karantinaya alınıyor…'
              : attachments.length > 0
                ? 'İstediğiniz kadar dosya ekleyebilirsiniz. Bitirdiğinizde oturumu kapatın; ekler kaydınızda kalır.'
                : '')}
        </div>
        <ol className="evidence-list" aria-label="Kanıt dosyası durumları">
          {attachments.length === 0 && <li className="empty">Henüz kanıt dosyası yok.</li>}
          {attachments.map((attachment, index) => (
            <li key={attachment.attachmentId}>
              <strong>Kanıt {index + 1}</strong>
              <span>
                {evidenceMediaLabel(attachment.mediaType)} · {formatBytes(attachment.size)}
              </span>
              <span
                className={`evidence-state is-${attachment.state.toLowerCase().replaceAll('_', '-')}`}
              >
                {evidenceStateLabel(attachment.state)}
              </span>
            </li>
          ))}
        </ol>
      </section>
      <ol>
        {messages.length === 0 && <li className="empty">Henüz mesaj yok.</li>}
        {messages.map((m) => (
          <li key={m.id} className={m.authorType === 'STAFF' ? 'staff' : 'reporter'}>
            <strong>{m.authorType === 'STAFF' ? 'Etik ekibi' : 'Siz'}</strong>
            <p>{m.body}</p>
            <time dateTime={m.createdAt}>{new Date(m.createdAt).toLocaleString('tr-TR')}</time>
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
      <button className="secondary" disabled={busy} onClick={onClose}>
        Mailbox oturumunu kapat
      </button>
    </section>
  );
}

// Every state the service can emit needs a sentence a reporter can act on. A
// missing entry is not a cosmetic gap: the badge renders empty, and the reader
// is left unable to tell "still working" from "refused".
const EVIDENCE_STATE_LABELS: Record<EvidenceState, string> = {
  DECLARED: 'Yükleme bekliyor',
  UPLOADING: 'Yükleme bekliyor',
  UPLOAD_CAPABILITY_EXPIRED: 'Yükleme süresi doldu, yeniden deneyin',
  QUARANTINED: 'Karantinada',
  INTEGRITY_VERIFIED: 'Bütünlük doğrulandı, işleniyor',
  ORIGINAL_SEALED: 'Orijinal mühürlendi, işleniyor',
  SCAN_PENDING: 'Tarama yeniden denenecek',
  SCANNING: 'Zararlı içerik taranıyor',
  SANITIZING: 'Metadata temizleniyor',
  DERIVATIVE_READY: 'Güvenli türev hazırlanıyor',
  AVAILABLE: 'Güvenli türev hazır',
  MALICIOUS_QUARANTINED: 'Zararlı içerik bulundu, dosya paylaşılmadı',
  REJECTED_INTEGRITY: 'Dosya bildirilen içerikle uyuşmuyor, reddedildi',
  REJECTED_POLICY: 'Dosya türü veya boyutu kabul edilmiyor',
  SANITIZE_FAILED: 'Dosya güvenli hale getirilemedi, reddedildi',
  EXPIRED_UNBOUND: 'Yükleme süresi doldu',
};

function evidenceStateLabel(state: EvidenceStatus['state']) {
  // Total by construction, but a service that ships a new state before this UI
  // does must not produce a blank badge.
  return EVIDENCE_STATE_LABELS[state] ?? 'Durum güncelleniyor';
}

const evidenceMediaLabel = (mediaType: string) =>
  ({ 'text/plain': 'Metin', 'image/jpeg': 'JPEG görsel', 'image/png': 'PNG görsel' })[mediaType] ??
  'Dosya';

const formatBytes = (size: number) =>
  size < 1024 ? `${size} bayt` : `${(size / 1024 / 1024).toFixed(2)} MiB`;

function reporterStatusLabel(status: ReporterCaseStatus) {
  return {
    NEW: 'Alındı',
    IN_REVIEW: 'İncelemede',
    CLOSED: 'Sonuçlandırıldı',
  }[status];
}

const ACKNOWLEDGEMENT_DEADLINE_DAYS = 7;
const DAY_MS = 86_400_000;

/**
 * Where the seven-day promise stands, said to the person it was made to.
 *
 * <p>The case has carried `acknowledgedAt` since the beginning and the handler's screen
 * marks it overdue in red. The reporter — who is the one the deadline protects — was
 * never told any of it. A case answered on day three and a case ignored for three weeks
 * read the same here, so the only way to find out was to keep coming back and re-reading
 * the message list.
 *
 * <p>Absent is not null. A bundle deployed ahead of the service gets neither timestamp,
 * and a countdown computed from a missing date would still read as a statement about a
 * legal deadline — so it says it cannot tell instead.
 *
 * <p>The overdue wording deliberately does not apologise or promise a new date. It states
 * what is true and what the reporter can do about it; a reassurance this page cannot keep
 * would be worth less than the fact.
 */
export function reporterAcknowledgement(
  view: { filedAt?: string | null; acknowledgedAt?: string | null },
  now: number = Date.now(),
): { text: string; overdue: boolean; known: boolean } {
  if (view.filedAt === undefined || view.acknowledgedAt === undefined) {
    return { text: '', overdue: false, known: false };
  }
  const filed = view.filedAt === null ? NaN : Date.parse(view.filedAt);
  if (Number.isNaN(filed)) return { text: '', overdue: false, known: false };

  if (view.acknowledgedAt) {
    const answered = Date.parse(view.acknowledgedAt);
    if (Number.isNaN(answered)) return { text: '', overdue: false, known: false };
    const days = Math.max(0, Math.floor((answered - filed) / DAY_MS));
    return {
      known: true,
      overdue: false,
      text:
        days === 0
          ? 'Bildiriminiz aynı gün yanıtlandı.'
          : `Bildiriminiz ${days} gün içinde yanıtlandı.`,
    };
  }

  const elapsed = Math.floor((now - filed) / DAY_MS);
  const remaining = ACKNOWLEDGEMENT_DEADLINE_DAYS - elapsed;
  if (remaining > 0) {
    return {
      known: true,
      overdue: false,
      text: `Yetkili ekip henüz yanıt yazmadı. Yanıt süresi ${ACKNOWLEDGEMENT_DEADLINE_DAYS} gündür; ${remaining} gün kaldı.`,
    };
  }
  return {
    known: true,
    overdue: true,
    text: `Yetkili ekip ${elapsed} gündür yanıt yazmadı. ${ACKNOWLEDGEMENT_DEADLINE_DAYS} günlük yanıt süresi aşıldı; bu ekranı ve bildirim numaranızı kayıt olarak saklayın.`,
  };
}

function PrivacyNotice() {
  return (
    <section className="panel legal" aria-labelledby="privacy-title">
      <h1 id="privacy-title">Test pilotu veri kullanımı</h1>
      <p>
        Bu sayfa production aydınlatma metni değildir. Faz 35 ilk test kabulünde yalnız yetkili test
        kullanıcıları ve sentetik vaka verileri kullanılabilir; gerçek kişi, sağlık, finans,
        iletişim veya olay verisi girilmemelidir.
      </p>
      <h2>Bu testte hangi kayıtlar oluşur?</h2>
      <ul>
        <li>Kategori, konu, sentetik anlatım ve seçili bildirim modu</li>
        <li>Tek yönlü hash ile korunan erişim sırrı ve kısa süreli mailbox oturumu</li>
        <li>Reporter/staff mesajları ile işlem audit kayıtları</li>
        <li>
          İsteğe bağlı sentetik TXT/JPEG/PNG kanıt dosyası; karantina, bütünlük doğrulama ve zararlı
          içerik taramasından sonra mühürlü orijinal ile metadata’dan arındırılmış güvenli türev
          ayrı tutulur. Yöneticiye yalnız güvenli türev açılır.
        </li>
      </ul>
      <p>
        Gerçek kullanıcı açılışı; onaylı KVKK aydınlatma metni, retention/silme politikası ve isimli
        Legal/DPO kabulü tamamlanana kadar yapılmaz. Pilot notice sürümü: tr-test-pilot-v1.
      </p>
      <a className="secondary legal-link" href="/">
        Ana sayfaya dön
      </a>
    </section>
  );
}

function AccessibilityNotice() {
  return (
    <section className="panel legal" aria-labelledby="accessibility-title">
      <h1 id="accessibility-title">Erişilebilirlik</h1>
      <p>
        Kritik pilot yolu klavye, görünür odak, semantik başlık ve ekran okuyucu durum mesajlarıyla
        kullanılacak şekilde hazırlanır. Bir engelle karşılaşırsanız gerçek veya hassas veri
        girmeden test sorumlusuna kullandığınız adımı ve tarayıcıyı bildirin.
      </p>
      <p>
        Production erişilebilirlik kabulü, gerçek browser E2E ve WCAG kontrolü sonrasında ilan
        edilir.
      </p>
      <a className="secondary legal-link" href="/">
        Ana sayfaya dön
      </a>
    </section>
  );
}
const message = (e: unknown) => (e instanceof Error ? e.message : 'İşlem tamamlanamadı.');
