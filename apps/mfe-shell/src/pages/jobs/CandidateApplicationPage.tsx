import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  createApplicationIdempotencyKey,
  createCandidateAccessToken,
  getPublicJob,
  saveCandidateSession,
  submitApplication,
  type ApplicationReceiptDto,
  type PublicJobDto,
} from '../../features/ats-portals/api/application-api';

type ApplicationValues = {
  fullName: string;
  email: string;
  phone: string;
  city: string;
  linkedIn: string;
  portfolio: string;
  summary: string;
  experience: string;
  education: string;
  skills: string;
  note: string;
};

type LocalFileMeta = {
  size: number;
};

type View = 'form' | 'preview' | 'receipt';

const EMPTY_VALUES: ApplicationValues = {
  fullName: '',
  email: '',
  phone: '',
  city: '',
  linkedIn: '',
  portfolio: '',
  summary: '',
  experience: '',
  education: '',
  skills: '',
  note: '',
};

const SYNTHETIC_VALUES: ApplicationValues = {
  fullName: 'Deniz Yılmaz',
  email: 'deniz.yilmaz@example.test',
  phone: '+90 555 000 00 00',
  city: 'İstanbul',
  linkedIn: 'https://www.linkedin.com/in/deniz-yilmaz-demo',
  portfolio: 'https://portfolio.example.test/deniz',
  summary:
    'Kullanıcı ihtiyaçlarını erişilebilir ve ölçülebilir ürün deneyimlerine dönüştüren, ekipler arası çalışmaya odaklı ürün profesyoneli.',
  experience: 'Ürün Uzmanı · Örnek Teknoloji · 2022–2026\nÜrün Analisti · Demo Yazılım · 2020–2022',
  education: 'Yönetim Bilişim Sistemleri · Örnek Üniversitesi · 2020',
  skills: 'Ürün keşfi, kullanıcı araştırması, analitik, yol haritası, erişilebilirlik',
  note: 'İlanın kullanıcı odaklı ürün geliştirme yaklaşımıyla özellikle ilgileniyorum.',
};

const REQUIRED_FIELDS: Array<keyof ApplicationValues> = [
  'fullName',
  'email',
  'phone',
  'city',
  'summary',
  'experience',
  'education',
  'skills',
];

const inputClassName =
  'min-h-11 w-full rounded-xl border border-border-subtle bg-surface-default px-3.5 py-2.5 text-sm text-text-primary shadow-xs outline-hidden transition placeholder:text-text-subtle focus:border-action-primary focus:ring-2 focus:ring-selection-outline';
const labelClassName = 'text-sm font-semibold text-text-primary';
const sectionClassName =
  'rounded-2xl border border-border-subtle bg-surface-default p-5 shadow-xs sm:p-6';

const humanizeSlug = (slug: string) =>
  slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase('tr-TR') + part.slice(1))
    .join(' ');

const formatBytes = (value: number) => {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const isValidPhone = (value: string) => value.replace(/\D/g, '').length >= 7;

const isValidOptionalHttpUrl = (value: string) => {
  if (!value.trim()) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const CandidateApplicationPage = () => {
  const { jobSlug = 'urun-yoneticisi' } = useParams();
  const [job, setJob] = useState<PublicJobDto | null>(null);
  const [jobError, setJobError] = useState('');
  const [values, setValues] = useState<ApplicationValues>(EMPTY_VALUES);
  const [view, setView] = useState<View>('form');
  const [fileMeta, setFileMeta] = useState<LocalFileMeta | null>(null);
  const [fileError, setFileError] = useState('');
  const [formError, setFormError] = useState('');
  const [noticeAccepted, setNoticeAccepted] = useState(false);
  const [noticeAcceptedAt, setNoticeAcceptedAt] = useState('');
  const [accuracyConfirmed, setAccuracyConfirmed] = useState(false);
  const [accuracyConfirmedAt, setAccuracyConfirmedAt] = useState('');
  const [receipt, setReceipt] = useState<ApplicationReceiptDto | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [candidateSessionSaved, setCandidateSessionSaved] = useState(false);
  const idempotencyKeyRef = useRef(createApplicationIdempotencyKey());
  const candidateAccessTokenRef = useRef(createCandidateAccessToken());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewHeadingRef = useRef<HTMLHeadingElement>(null);
  const receiptHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const heading = view === 'preview' ? previewHeadingRef.current : receiptHeadingRef.current;
    if (!heading) return undefined;
    const timer = window.setTimeout(() => heading.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [view]);

  useEffect(() => {
    let cancelled = false;
    setJob(null);
    setJobError('');
    void getPublicJob(jobSlug)
      .then((loaded) => {
        if (!cancelled) setJob(loaded);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setJobError(loadError instanceof Error ? loadError.message : 'İlan yüklenemedi.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [jobSlug]);

  const updateValue =
    (
      field: keyof ApplicationValues,
    ): React.ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement> =>
    (event) => {
      setValues((current) => ({ ...current, [field]: event.target.value }));
      setFormError('');
      setSubmitError('');
    };

  const applySyntheticResume = () => {
    setValues(SYNTHETIC_VALUES);
    setFormError('');
  };

  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const file = event.target.files?.[0];
    setFileError('');
    setFileMeta(null);
    if (!file) return;

    const hasPdfExtension = file.name.toLowerCase().endsWith('.pdf');
    const hasAllowedPdfMime = file.type === '' || file.type === 'application/pdf';
    const looksLikePdf = hasPdfExtension && hasAllowedPdfMime;
    if (!looksLikePdf) {
      setFileError('Yalnız PDF dosyası seçebilirsiniz.');
      event.target.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setFileError('PDF dosyası en fazla 10 MB olabilir.');
      event.target.value = '';
      return;
    }

    // Privacy boundary: the filename is used transiently for client-side type
    // validation, but is never retained or rendered. Clearing the native input
    // also releases its FileList so the browser cannot keep showing the name.
    // File bytes are never read, persisted or sent over the network.
    setFileMeta({ size: file.size });
    event.target.value = '';
  };

  const removeFile = () => {
    setFileMeta(null);
    setFileError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openPreview: React.FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    const missing = REQUIRED_FIELDS.some((field) => values[field].trim().length === 0);
    if (missing) {
      setFormError('Önizlemeye geçmek için yıldızlı alanları doldurun.');
      return;
    }
    if (!isValidEmail(values.email)) {
      setFormError('Geçerli bir e-posta adresi girin.');
      return;
    }
    if (!values.email.trim().toLocaleLowerCase('tr-TR').endsWith('.test')) {
      setFormError(
        'Bu test sürümü gerçek aday verisine kapalıdır. Yalnız .test uzantılı sentetik e-posta kullanın.',
      );
      return;
    }
    if (!isValidPhone(values.phone)) {
      setFormError('Geçerli bir telefon numarası girin.');
      return;
    }
    if (!isValidOptionalHttpUrl(values.linkedIn) || !isValidOptionalHttpUrl(values.portfolio)) {
      setFormError('LinkedIn ve portföy adresleri http:// veya https:// ile başlamalıdır.');
      return;
    }
    setFormError('');
    setView('preview');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const createPersistentReceipt = async () => {
    if (
      !job ||
      !noticeAccepted ||
      !noticeAcceptedAt ||
      !accuracyConfirmed ||
      !accuracyConfirmedAt ||
      submitting
    )
      return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const saved = await submitApplication(
        jobSlug,
        idempotencyKeyRef.current,
        candidateAccessTokenRef.current,
        {
          fullName: values.fullName,
          email: values.email,
          phone: values.phone,
          city: values.city,
          linkedIn: values.linkedIn || undefined,
          portfolio: values.portfolio || undefined,
          summary: values.summary,
          experience: values.experience,
          education: values.education,
          skills: values.skills
            .split(',')
            .map((skill) => skill.trim())
            .filter(Boolean),
          note: values.note || undefined,
          noticeVersion: 'kvkk-application-v1',
          noticeAcceptedAt,
          accuracyConfirmedAt,
        },
      );
      setReceipt(saved);
      setCandidateSessionSaved(saveCandidateSession(saved));
      setView('receipt');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (submissionError) {
      setSubmitError(
        submissionError instanceof Error ? submissionError.message : 'Başvuru gönderilemedi.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const editApplication = () => {
    setNoticeAccepted(false);
    setNoticeAcceptedAt('');
    setAccuracyConfirmed(false);
    setAccuracyConfirmedAt('');
    setSubmitError('');
    idempotencyKeyRef.current = createApplicationIdempotencyKey();
    candidateAccessTokenRef.current = createCandidateAccessToken();
    setView('form');
  };

  const resetDemo = () => {
    setValues(EMPTY_VALUES);
    setFileMeta(null);
    setFileError('');
    setFormError('');
    setNoticeAccepted(false);
    setAccuracyConfirmed(false);
    setAccuracyConfirmedAt('');
    setNoticeAcceptedAt('');
    setReceipt(null);
    setSubmitError('');
    setCandidateSessionSaved(false);
    idempotencyKeyRef.current = createApplicationIdempotencyKey();
    candidateAccessTokenRef.current = createCandidateAccessToken();
    setView('form');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const renderField = (
    field: keyof ApplicationValues,
    label: string,
    options?: {
      type?: React.HTMLInputTypeAttribute;
      placeholder?: string;
      required?: boolean;
      autoComplete?: string;
    },
  ) => (
    <div className="flex flex-col gap-2">
      <label className={labelClassName} htmlFor={`candidate-${field}`}>
        {label} {options?.required ? <span className="text-danger">*</span> : null}
      </label>
      <input
        id={`candidate-${field}`}
        data-testid={`candidate-${field}`}
        className={inputClassName}
        type={options?.type ?? 'text'}
        value={values[field]}
        onChange={updateValue(field)}
        placeholder={options?.placeholder}
        required={options?.required}
        autoComplete={options?.autoComplete}
      />
    </div>
  );

  const renderTextArea = (
    field: keyof ApplicationValues,
    label: string,
    placeholder: string,
    required = false,
    rows = 4,
  ) => (
    <div className="flex flex-col gap-2">
      <label className={labelClassName} htmlFor={`candidate-${field}`}>
        {label} {required ? <span className="text-danger">*</span> : null}
      </label>
      <textarea
        id={`candidate-${field}`}
        data-testid={`candidate-${field}`}
        className={inputClassName}
        value={values[field]}
        onChange={updateValue(field)}
        placeholder={placeholder}
        required={required}
        rows={rows}
      />
    </div>
  );

  const previewRows: Array<[string, string]> = [
    ['Ad soyad', values.fullName],
    ['E-posta', values.email],
    ['Telefon', values.phone],
    ['Şehir', values.city],
    ['LinkedIn', values.linkedIn || 'Eklenmedi'],
    ['Portföy', values.portfolio || 'Eklenmedi'],
    ['Profesyonel özet', values.summary],
    ['Deneyim', values.experience],
    ['Eğitim', values.education],
    ['Beceriler', values.skills],
    ['Ek not', values.note || 'Eklenmedi'],
  ];

  return (
    <main
      className="min-h-screen bg-surface-subtle text-text-primary"
      data-testid="candidate-application-page"
    >
      <div className="border-b border-border-subtle bg-surface-default">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link
            to="/jobs"
            className="flex items-center gap-3"
            aria-label="Açık Kariyer ilan listesi"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-action-primary text-sm font-bold text-action-primary-text">
              A
            </span>
            <span>
              <span className="block text-sm font-bold">Açık Kariyer</span>
              <span className="block text-xs text-text-secondary">Aday başvuru merkezi</span>
            </span>
          </Link>
          <nav className="flex items-center gap-2" aria-label="Aday başvuru alanı">
            <Link
              to="/candidate"
              className="inline-flex min-h-10 items-center rounded-xl border border-border-subtle bg-surface-default px-3 py-2 text-xs font-bold text-text-primary hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 sm:text-sm"
            >
              Aday Alanım
            </Link>
            <span className="hidden rounded-full border border-border-subtle bg-surface-subtle px-3 py-1.5 text-xs font-semibold text-text-secondary sm:inline-flex">
              Güvenli form önizlemesi
            </span>
          </nav>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:py-10">
        <div className="min-w-0">
          <section className="mb-6 overflow-hidden rounded-3xl bg-text-primary px-5 py-7 text-white shadow-lg sm:px-8 sm:py-9">
            <div className="mb-4 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90">
              {job?.team ?? 'Açık Pozisyon'}
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">
              {(job?.title ?? humanizeSlug(jobSlug)) || 'İlan yükleniyor'}
            </h1>
            <div className="mt-4 flex flex-wrap gap-2 text-sm text-white/80">
              <span>{job?.location ?? 'Yükleniyor'}</span>
              <span aria-hidden="true">•</span>
              <span>{job?.mode ?? '—'}</span>
              <span aria-hidden="true">•</span>
              <span>{job?.employmentType ?? '—'}</span>
            </div>
            <p className="mt-5 max-w-2xl text-sm leading-6 text-white/80 sm:text-base">
              Başvurunuzu kendi hızınızda hazırlayın. Örnek alanları kontrol edin, istediğiniz
              bilgiyi değiştirin ve göndermeden önce tamamını önizleyin.
            </p>
          </section>

          {jobError ? (
            <p
              role="alert"
              className="mb-6 rounded-xl border border-state-danger-border bg-state-danger-bg px-4 py-3 text-sm font-semibold text-state-danger-text"
            >
              İlan servisine ulaşılamadı: {jobError}
            </p>
          ) : null}

          <nav aria-label="Başvuru adımları" className="mb-6 grid grid-cols-3 gap-2">
            {[
              ['form', '1', 'Bilgiler'],
              ['preview', '2', 'Önizleme'],
              ['receipt', '3', 'Makbuz'],
            ].map(([key, number, label]) => {
              const order: View[] = ['form', 'preview', 'receipt'];
              const active = order.indexOf(view) >= order.indexOf(key as View);
              return (
                <div
                  key={key}
                  className={`rounded-xl border px-3 py-3 text-center text-xs font-semibold sm:text-sm ${
                    active
                      ? 'border-action-primary bg-action-primary/5 text-text-primary'
                      : 'border-border-subtle bg-surface-default text-text-secondary'
                  }`}
                  aria-current={view === key ? 'step' : undefined}
                >
                  <span className="mr-1">{number}.</span> {label}
                </div>
              );
            })}
          </nav>

          {view === 'form' ? (
            <form className="flex flex-col gap-5" onSubmit={openPreview} noValidate>
              <section className={sectionClassName} aria-labelledby="resume-heading">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-action-primary">
                      Hızlı başlangıç
                    </p>
                    <h2 id="resume-heading" className="mt-1 text-xl font-bold">
                      CV’nizle başlayın
                    </h2>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-text-secondary">
                      PDF seçtiğinizde yalnız tür ve boyut bu tarayıcıda kontrol edilir. Dosya adı
                      tutulmaz; içerik okunmaz, kaydedilmez veya ağa gönderilmez.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={applySyntheticResume}
                    data-testid="fill-synthetic-resume"
                    className="shrink-0 rounded-xl border border-action-primary px-4 py-2.5 text-sm font-semibold text-action-primary hover:bg-action-primary/5"
                  >
                    Örnek CV ile doldur
                  </button>
                </div>

                <div className="mt-5 rounded-2xl border border-dashed border-border-strong bg-surface-subtle p-4 sm:p-5">
                  <label
                    className="flex cursor-pointer flex-col items-center gap-2 text-center"
                    htmlFor="candidate-resume"
                  >
                    <span className="text-sm font-bold">PDF özgeçmiş seçin</span>
                    <span className="text-xs text-text-secondary">En fazla 10 MB · yalnız PDF</span>
                  </label>
                  <input
                    ref={fileInputRef}
                    id="candidate-resume"
                    data-testid="candidate-resume"
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={handleFileChange}
                    className="mx-auto mt-3 block max-w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-action-primary file:px-4 file:py-2 file:font-semibold file:text-action-primary-text"
                    aria-describedby="candidate-resume-boundary candidate-resume-error"
                  />
                  <p
                    id="candidate-resume-boundary"
                    className="mt-3 text-center text-xs text-text-secondary"
                  >
                    Test ortamında gerçek kişisel veri içeren bir dosya kullanmayın.
                  </p>
                  {fileMeta ? (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-state-success-border bg-state-success-bg px-3 py-2 text-sm">
                      <span
                        data-testid="candidate-resume-meta"
                        className="font-medium text-state-success-text"
                      >
                        PDF seçildi · {formatBytes(fileMeta.size)} · dosya adı tutulmaz · yalnız bu
                        cihazda
                      </span>
                      <button
                        type="button"
                        onClick={removeFile}
                        className="font-semibold text-text-primary underline"
                      >
                        Kaldır
                      </button>
                    </div>
                  ) : null}
                  {fileError ? (
                    <p
                      id="candidate-resume-error"
                      role="alert"
                      className="mt-3 text-sm font-medium text-danger"
                    >
                      {fileError}
                    </p>
                  ) : null}
                </div>
              </section>

              <section className={sectionClassName} aria-labelledby="contact-heading">
                <div className="mb-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-action-primary">
                    Aday bilgileri
                  </p>
                  <h2 id="contact-heading" className="mt-1 text-xl font-bold">
                    Size nasıl ulaşalım?
                  </h2>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {renderField('fullName', 'Ad soyad', { required: true, autoComplete: 'name' })}
                  {renderField('email', 'E-posta', {
                    type: 'email',
                    required: true,
                    autoComplete: 'email',
                  })}
                  {renderField('phone', 'Telefon', {
                    type: 'tel',
                    required: true,
                    autoComplete: 'tel',
                  })}
                  {renderField('city', 'Şehir', { required: true, autoComplete: 'address-level2' })}
                  {renderField('linkedIn', 'LinkedIn', {
                    type: 'url',
                    placeholder: 'https://linkedin.com/in/...',
                  })}
                  {renderField('portfolio', 'Portföy / kişisel site', {
                    type: 'url',
                    placeholder: 'https://...',
                  })}
                </div>
              </section>

              <section className={sectionClassName} aria-labelledby="profile-heading">
                <div className="mb-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-action-primary">
                    Profil
                  </p>
                  <h2 id="profile-heading" className="mt-1 text-xl font-bold">
                    Deneyiminizi anlatın
                  </h2>
                </div>
                <div className="flex flex-col gap-4">
                  {renderTextArea(
                    'summary',
                    'Profesyonel özet',
                    'Kendinizi birkaç cümleyle anlatın',
                    true,
                    4,
                  )}
                  {renderTextArea(
                    'experience',
                    'İş deneyimi',
                    'Rol · Şirket · Tarih aralığı',
                    true,
                    5,
                  )}
                  {renderTextArea('education', 'Eğitim', 'Okul · Bölüm · Mezuniyet yılı', true, 3)}
                  {renderTextArea('skills', 'Beceriler', 'Virgülle ayırabilirsiniz', true, 3)}
                  {renderTextArea(
                    'note',
                    'Bu role neden başvuruyorsunuz?',
                    'İsteğe bağlı kısa not',
                    false,
                    4,
                  )}
                </div>
              </section>

              {formError ? (
                <p
                  role="alert"
                  className="rounded-xl border border-state-danger-border bg-state-danger-bg px-4 py-3 text-sm font-semibold text-state-danger-text"
                >
                  {formError}
                </p>
              ) : null}

              <button
                type="submit"
                className="min-h-12 rounded-xl bg-action-primary px-5 py-3 text-sm font-bold text-action-primary-text shadow-sm hover:opacity-90 focus:outline-hidden focus:ring-2 focus:ring-selection-outline focus:ring-offset-2"
              >
                Başvuruyu önizle
              </button>
            </form>
          ) : null}

          {view === 'preview' ? (
            <section
              className={sectionClassName}
              data-testid="candidate-application-preview"
              aria-labelledby="preview-heading"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-action-primary">
                    Göndermeden önce
                  </p>
                  <h2
                    ref={previewHeadingRef}
                    id="preview-heading"
                    className="mt-1 text-2xl font-bold outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                    tabIndex={-1}
                  >
                    Başvuru önizlemesi
                  </h2>
                  <p className="mt-2 text-sm text-text-secondary">
                    Her alanı kontrol edin; gerekirse forma dönüp düzenleyin.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={editApplication}
                  className="rounded-xl border border-border-strong px-4 py-2 text-sm font-semibold hover:bg-surface-subtle"
                >
                  Bilgileri düzenle
                </button>
              </div>

              <dl className="mt-6 divide-y divide-border-subtle rounded-2xl border border-border-subtle">
                {previewRows.map(([label, value]) => (
                  <div
                    key={label}
                    className="grid gap-1 px-4 py-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4"
                  >
                    <dt className="text-xs font-bold uppercase tracking-wide text-text-secondary">
                      {label}
                    </dt>
                    <dd className="whitespace-pre-wrap break-words text-sm text-text-primary">
                      {value}
                    </dd>
                  </div>
                ))}
                <div className="grid gap-1 px-4 py-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4">
                  <dt className="text-xs font-bold uppercase tracking-wide text-text-secondary">
                    PDF
                  </dt>
                  <dd className="text-sm text-text-primary">
                    {fileMeta
                      ? `PDF seçildi · ${formatBytes(fileMeta.size)} · dosya adı tutulmaz`
                      : 'Eklenmedi'}
                  </dd>
                </div>
              </dl>

              <div className="mt-6 flex flex-col gap-3 rounded-2xl bg-surface-subtle p-4">
                <label
                  className="flex items-start gap-3 text-sm leading-6"
                  htmlFor="candidate-notice-accepted"
                >
                  <input
                    id="candidate-notice-accepted"
                    type="checkbox"
                    checked={noticeAccepted}
                    onChange={(event) => {
                      setNoticeAccepted(event.target.checked);
                      setNoticeAcceptedAt(event.target.checked ? new Date().toISOString() : '');
                      if (!event.target.checked) {
                        setAccuracyConfirmed(false);
                        setAccuracyConfirmedAt('');
                      }
                      setSubmitError('');
                    }}
                    className="mt-1 h-4 w-4"
                  />
                  <span>
                    KVKK başvuru aydınlatma metnini okudum; bu test ortamında yalnız sentetik veri
                    kullanacağımı ve doğruladığım form alanlarının başvuru amacıyla kaydedileceğini
                    anladım.
                  </span>
                </label>
                <label
                  className="flex items-start gap-3 text-sm leading-6"
                  htmlFor="candidate-accuracy-confirmed"
                >
                  <input
                    id="candidate-accuracy-confirmed"
                    type="checkbox"
                    checked={accuracyConfirmed}
                    onChange={(event) => {
                      setAccuracyConfirmed(event.target.checked);
                      setAccuracyConfirmedAt(event.target.checked ? new Date().toISOString() : '');
                    }}
                    className="mt-1 h-4 w-4"
                  />
                  <span>
                    Önizlemedeki bilgileri kontrol ettim ve bu ilana başvuru olarak gönderilmesini
                    onaylıyorum.
                  </span>
                </label>
              </div>

              <button
                type="button"
                data-testid="create-application-receipt"
                onClick={() => void createPersistentReceipt()}
                disabled={
                  !job ||
                  !noticeAccepted ||
                  !noticeAcceptedAt ||
                  !accuracyConfirmed ||
                  !accuracyConfirmedAt ||
                  submitting
                }
                className="mt-5 min-h-12 w-full rounded-xl bg-action-primary px-5 py-3 text-sm font-bold text-action-primary-text shadow-sm disabled:cursor-not-allowed disabled:opacity-45"
              >
                {submitting ? 'Başvuru kaydediliyor…' : 'Başvuruyu gönder'}
              </button>
              {submitError ? (
                <p
                  role="alert"
                  className="mt-3 rounded-xl border border-state-danger-border bg-state-danger-bg px-4 py-3 text-sm font-semibold text-state-danger-text"
                >
                  Başvuru gönderilemedi: {submitError}
                </p>
              ) : null}
              <p className="mt-3 text-center text-xs text-text-secondary">
                Form alanları kalıcı test başvurusu olarak kaydedilir. PDF dosyası bu dilimde
                sunucuya gönderilmez.
              </p>
            </section>
          ) : null}

          {view === 'receipt' ? (
            <section
              className={`${sectionClassName} text-center`}
              data-testid="candidate-application-receipt"
              aria-labelledby="receipt-heading"
            >
              <div
                className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-state-success-border bg-state-success-bg text-lg font-bold text-state-success-text"
                aria-hidden="true"
              >
                ✓
              </div>
              <p className="mt-5 text-xs font-bold uppercase tracking-wider text-text-primary">
                Kalıcı test başvurusu
              </p>
              <h2
                ref={receiptHeadingRef}
                id="receipt-heading"
                className="mt-2 text-2xl font-bold outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                tabIndex={-1}
              >
                Başvurunuz kaydedildi
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-text-secondary">
                {values.fullName} için başvuru güvenli servise kaydedildi. İK çalışma alanında
                görünür ve durum değişikliklerini Aday Alanım’dan takip edebilirsiniz.
              </p>
              <div className="mx-auto mt-5 max-w-md rounded-xl border border-border-subtle bg-surface-subtle p-4">
                <span className="block text-xs font-semibold text-text-secondary">
                  Başvuru referansı
                </span>
                <strong className="mt-1 block font-mono text-lg" data-testid="candidate-receipt-id">
                  {receipt?.publicRef}
                </strong>
              </div>
              <div
                className={`mt-6 rounded-xl border p-4 text-left text-sm leading-6 text-text-primary ${
                  candidateSessionSaved
                    ? 'border-state-success-border bg-state-success-bg'
                    : 'border-state-warning-border bg-state-warning-bg'
                }`}
              >
                {candidateSessionSaved
                  ? 'Takip anahtarı yalnız bu tarayıcı sekmesinin güvenli oturumunda tutuldu. Aday Alanım ekranından durumu izleyebilirsiniz.'
                  : 'Başvuru kaydedildi ancak tarayıcı takip anahtarını oturumda saklayamadı. Referansınızı not edin.'}
              </div>
              <Link
                to="/candidate"
                className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-action-primary px-5 py-3 text-sm font-bold text-action-primary-text"
              >
                Aday Alanım’da durumu gör
              </Link>
              <button
                type="button"
                onClick={resetDemo}
                className="ml-0 mt-3 rounded-xl border border-action-primary px-5 py-3 text-sm font-bold text-action-primary hover:bg-action-primary/5 sm:ml-3 sm:mt-6"
              >
                Yeni başvuru formu
              </button>
            </section>
          ) : null}
        </div>

        <aside
          className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start"
          aria-label="Başvuru yardımı"
        >
          <section className={sectionClassName}>
            <h2 className="text-base font-bold">Başvurunuz sizde</h2>
            <ul className="mt-4 flex flex-col gap-3 text-sm leading-5 text-text-secondary">
              <li>• CV önerilerini değiştirebilirsiniz.</li>
              <li>• Gönder düğmesinden önce hiçbir şey kaydedilmez.</li>
              <li>• Testte gerçek kişisel veri kullanmayın.</li>
              <li>• Oturum açmanız gerekmez.</li>
            </ul>
          </section>
          <section className="rounded-2xl border border-state-info-border bg-state-info-bg p-5 text-sm leading-6 text-text-primary">
            <h2 className="font-bold">Yardıma mı ihtiyacınız var?</h2>
            <p className="mt-2">
              Formdaki bütün alanlara klavyeyle ulaşabilirsiniz. Zorunlu alanlar yıldızla
              işaretlidir.
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
};

export default CandidateApplicationPage;
