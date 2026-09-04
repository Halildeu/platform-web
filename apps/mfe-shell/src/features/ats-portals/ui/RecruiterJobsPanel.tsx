import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Badge } from '@mfe/design-system/primitives';
import {
  createApplicationIdempotencyKey,
  createRecruiterJob,
  DEFAULT_APPLICATION_FIELDS,
  listRecruiterJobs,
  transitionRecruiterJob,
  updateRecruiterJob,
  MAX_JOB_QUESTION_OPTIONS,
  MAX_JOB_QUESTIONS,
  MIN_JOB_QUESTION_OPTIONS,
  RECRUITER_JOB_QUESTION_KINDS,
  type ApplicationFieldKey,
  type RecruiterJobDraftDto,
  type RecruiterJobDto,
  type RecruiterJobQuestionKind,
  type RecruiterJobQuestionWarningDto,
  type RecruiterJobStatus,
} from '../api/application-api';

/**
 * ats#240 A: form içindeki soru. `order` BURADA YOK — dizideki konum sıradır ve
 * gönderirken `order`'a çevrilir. Kimlik `questionId`'dir; mevcut sorularda
 * AYNEN taşınır, yeni soruda yoktur ve sunucu atar. Sıra değişimi kimliği
 * değiştirmez; bu, dilim B/C'de cevapların sorusuna bağlı kalmasının önkoşulu.
 */
type QuestionFormState = {
  questionId?: string;
  text: string;
  kind: RecruiterJobQuestionKind;
  required: boolean;
  options: Array<{ optionId?: string; label: string }>;
};

const QUESTION_KIND_LABELS: Record<RecruiterJobQuestionKind, string> = {
  SHORT_TEXT: 'Kısa metin',
  LONG_TEXT: 'Uzun metin',
  YES_NO: 'Evet / Hayır',
  SINGLE_CHOICE: 'Tek seçim',
};

const EMPTY_QUESTION: QuestionFormState = {
  text: '',
  kind: 'SHORT_TEXT',
  required: false,
  options: [{ label: '' }, { label: '' }],
};

type FormState = {
  slug: string;
  title: string;
  team: string;
  location: string;
  mode: string;
  employmentType: string;
  summary: string;
  highlights: string;
  applicationFields: ApplicationFieldKey[];
  questions: QuestionFormState[];
};

const EMPTY_FORM: FormState = {
  slug: '',
  title: '',
  team: '',
  location: '',
  mode: 'Hibrit',
  employmentType: 'Tam zamanlı',
  summary: '',
  highlights: '',
  applicationFields: DEFAULT_APPLICATION_FIELDS,
  questions: [],
};

const STATUS_LABELS: Record<RecruiterJobStatus, string> = {
  DRAFT: 'Taslak',
  PUBLISHED: 'Yayında',
  PAUSED: 'Duraklatıldı',
  CLOSED: 'Kapandı',
  ARCHIVED: 'Arşivlendi',
};

/**
 * #1043: durum filtresi. Ölçülen sorun — 21 ilanın 3'ü yayındaydı ama liste
 * filtresizdi ve `updatedAt DESC` sıralıydı, bu yüzden ilk açılışta yalnız
 * `Kapandı` kartlar görünüyordu: sayaç "3 Yayında" diyor, liste göstermiyordu.
 *
 * `PAUSED`/`ARCHIVED` ayrı sekme almıyor — canlıda hiç kullanılmıyorlar ve her
 * duruma sekme açmak ilkeyi (tek sayfa, eğitim gerektirmeden) bozar. İkisi
 * `Tümü` içinde görünür kalır; kaybolmazlar.
 */
const JOB_FILTERS = [
  { id: 'PUBLISHED', label: 'Yayında' },
  { id: 'DRAFT', label: 'Taslak' },
  { id: 'CLOSED', label: 'Kapandı' },
  { id: 'ALL', label: 'Tümü' },
] as const;

type JobFilterId = (typeof JOB_FILTERS)[number]['id'];

const matchesJobFilter = (job: RecruiterJobDto, filter: JobFilterId): boolean =>
  filter === 'ALL' || job.status === filter;

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );

const formFromJob = (job: RecruiterJobDto): FormState => ({
  slug: job.slug,
  title: job.title,
  team: job.team,
  location: job.location,
  mode: job.mode,
  employmentType: job.employmentType,
  summary: job.summary,
  highlights: job.highlights.join('\n'),
  applicationFields: job.applicationFields,
  // Sunucu `order` artan sırada döndürür; dizideki konum o sırayı temsil eder.
  //
  // `?? []` bilinçli: bu ekran, soruları destekleyen backend HENÜZ deploy
  // edilmemişken de açılabilir (frontend/backend deploy sırası garanti değil).
  // O durumda alan yanıtta hiç bulunmaz; `undefined.map` ilan düzenlemeyi
  // tamamen kilitlerdi. Sorusuz ilan zaten geçerli bir durum.
  questions: (job.questions ?? []).map((question) => ({
    questionId: question.questionId,
    text: question.text,
    kind: question.kind,
    required: question.required,
    options:
      question.kind === 'SINGLE_CHOICE' && question.options?.length
        ? question.options.map((option) => ({
            optionId: option.optionId,
            label: option.label,
          }))
        : [{ label: '' }, { label: '' }],
  })),
});

const payloadFromForm = (form: FormState): RecruiterJobDraftDto => ({
  ...(form.slug.trim() ? { slug: form.slug.trim() } : {}),
  title: form.title.trim(),
  team: form.team.trim(),
  location: form.location.trim(),
  mode: form.mode.trim(),
  employmentType: form.employmentType.trim(),
  summary: form.summary.trim(),
  highlights: form.highlights
    .split(/\n|,/u)
    .map((item) => item.trim())
    .filter((item, index, values) => item.length > 0 && values.indexOf(item) === index),
  applicationFields: form.applicationFields,
  // `order` dizideki konumdan TÜRETİLİR (1'den başlar). Sıra bir sunum kararıdır;
  // kimlik `questionId`'dir ve olduğu gibi geri gönderilir.
  questions: form.questions.map((question, index) => ({
    ...(question.questionId ? { questionId: question.questionId } : {}),
    order: index + 1,
    text: question.text.trim(),
    kind: question.kind,
    required: question.required,
    // Boş etiketler BURADA FİLTRELENMEZ. Sessizce düşürmek, ekranda "en az 2 seçenek"
    // yazarken isteği 0/1 seçenekle göndermeye ve backend 400'üne yol açıyordu. Gönderim
    // öncesi doğrulama (questionFormError) bu durumu görünür biçimde durdurur.
    ...(question.kind === 'SINGLE_CHOICE'
      ? {
          options: question.options.map((option) => ({
            ...(option.optionId ? { optionId: option.optionId } : {}),
            label: option.label.trim(),
          })),
        }
      : {}),
  })),
  noticeVersion: 'kvkk-application-v1',
});

/**
 * ats#240 A: gönderim ÖNCESİ soru doğrulaması.
 *
 * Ekran "en az 2, en fazla 8 seçenek" vaat ediyorsa istek de öyle gitmeli. Önceki hâli
 * boş etiketleri sessizce filtreliyordu: İK iki varsayılan alanı boş bırakıp ya da yalnız
 * birini doldurup gönderebiliyor, istek 0/1 seçenekle çıkıp backend 400'üne düşüyordu —
 * kullanıcı ise ekranda kuralı okumuş oluyordu. Otorite yine backend; buradaki kontrol
 * kuralı GÖRÜNÜR kılmak için, onun yerine geçmek için değil.
 *
 * @returns kullanıcıya gösterilecek hata; {@code null} = gönderilebilir
 */
const questionFormError = (questions: QuestionFormState[]): string | null => {
  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index];
    const position = index + 1;
    const text = question.text.trim();
    if (text.length < 2 || text.length > 500) {
      return `${position}. sorunun metni 2–500 karakter olmalı.`;
    }
    if (question.kind !== 'SINGLE_CHOICE') continue;

    const labels = question.options.map((option) => option.label.trim());
    if (labels.some((label) => label.length === 0)) {
      return `${position}. soruda boş seçenek var; doldurun ya da silin.`;
    }
    if (labels.length < MIN_JOB_QUESTION_OPTIONS || labels.length > MAX_JOB_QUESTION_OPTIONS) {
      return `${position}. soru ${MIN_JOB_QUESTION_OPTIONS}–${MAX_JOB_QUESTION_OPTIONS} seçenek ister.`;
    }
    const distinct = new Set(labels.map((label) => label.toLocaleLowerCase('tr')));
    if (distinct.size !== labels.length) {
      return `${position}. soruda aynı seçenek birden fazla kez var.`;
    }
  }
  return null;
};

const OPTIONAL_FIELD_OPTIONS: Array<{ key: ApplicationFieldKey; label: string }> = [
  { key: 'linkedIn', label: 'LinkedIn adresi' },
  { key: 'portfolio', label: 'Portföy / kişisel site' },
  { key: 'note', label: 'Başvuru motivasyonu notu' },
];

/**
 * #227 Dilim A: ilan satırında başvuru kırılımı.
 *
 * <p>Sahip ilkesi: bir iş tek sayfada, eğitim gerektirmeden yapılabilmeli ve bir
 * sayı gösteriliyorsa o sayının KİMLERDEN oluştuğu aynı yerden görülebilmeli.
 * Önceden ilana bakan İK "kaç kişi başvurmuş" sorusunun cevabını bu panelde
 * bulamıyordu; başvurular sekmesine geçip ilan filtresi uygulaması gerekiyordu.
 *
 * <p>Sayılar `applications` listesinden türetilir — yeni istek YOK, veri zaten
 * ekranda. Sayıya tıklamak başvuru görünümünü o ilan + o aşama filtresiyle açar,
 * yani sayı ile "hangileri" arasında gezinme kalmaz.
 */
type JobBreakdownStage = { id: string; label: string };

/** Görünen kırılım: yeni gelen, süreçte olan, kapanan. Tam liste başvuru
 *  görünümünde; burada İK'nın ilana bakarken sorduğu üç soru var. */
const JOB_BREAKDOWN_STAGES: readonly JobBreakdownStage[] = [
  { id: 'SUBMITTED', label: 'Yeni' },
  { id: 'UNDER_REVIEW', label: 'İncelemede' },
  // #227 B: recruiter dilinde bu asama KISA LISTE (bkz. RecruiterWorkspacePage).
  { id: 'INTERVIEW_PENDING', label: 'Kısa liste' },
  { id: 'REJECTED', label: 'Reddedildi' },
];

const RecruiterJobsPanel = ({
  canManage,
  applications = [],
  onDrillDown,
}: {
  canManage: boolean;
  /** Sayaçlar bundan türetilir; boşsa kırılım 0 gösterir (gizlenmez). */
  applications?: ReadonlyArray<{ jobSlug: string; status: string }>;
  /** Sayıya tıklandığında başvuru görünümünü bu ilan + aşama ile açar. */
  onDrillDown?: (jobSlug: string, stage: string) => void;
}) => {
  const [jobs, setJobs] = useState<RecruiterJobDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [success, setSuccess] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RecruiterJobDto | null>(null);
  const [previewing, setPreviewing] = useState<RecruiterJobDto | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  /**
   * ats#240 A: kaydedilen ilanın korunan-özellik uyarıları. Kayıt BAŞARILIDIR —
   * uyarı engellemez, görünür kılar. Boş dizi "uyarı yok" demektir; taranamama
   * hâli sunucudan ayrı bir kategori (`COVERAGE_UNKNOWN`) olarak gelir, sessizce
   * temiz görünmez.
   */
  const [questionWarnings, setQuestionWarnings] = useState<
    Array<{ order: number; category: string; signal: string }>
  >([]);
  const [saving, setSaving] = useState(false);
  const [transitioningJobId, setTransitioningJobId] = useState<string | null>(null);
  /**
   * İlk açılış AKTİF ilanlar: İK'nın en çok baktığı küme sayfanın altında
   * kalmasın. `null` = ilanlar henüz yüklenmedi, karar verilmedi.
   *
   * Yayında ilan YOKSA varsayılan `Tümü` olur: 21 ilanı olan bir tenant'ı boş
   * bir sayfayla karşılamak, sorunu çözmek yerine yerini değiştirmek olurdu.
   * Bu "sessiz" değil — hangi kümede olduğunu aktif filtre düğmesi gösterir.
   */
  const [jobFilter, setJobFilter] = useState<JobFilterId | null>(null);
  const activeFilter: JobFilterId = jobFilter ?? 'PUBLISHED';
  const visibleJobs = jobs.filter((job) => matchesJobFilter(job, activeFilter));
  const retryKeys = useRef(new Map<string, { key: string; payloadFingerprint: string }>());
  const previewDialogRef = useRef<HTMLDivElement>(null);
  const previewTriggerRef = useRef<HTMLElement | null>(null);
  const previewHeadingRef = useRef<HTMLHeadingElement>(null);

  const closePreview = useCallback(() => {
    setPreviewing(null);
    window.setTimeout(() => previewTriggerRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!previewing) return undefined;
    previewHeadingRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePreview();
    };
    const dialog = previewDialogRef.current;
    const backgrounds = Array.from(document.body.children)
      .filter(
        (element): element is HTMLElement =>
          element instanceof HTMLElement && element !== dialog && !element.contains(dialog),
      )
      .map((element) => ({
        element,
        previousAriaHidden: element.getAttribute('aria-hidden'),
        previousInert: element.inert,
      }));
    backgrounds.forEach(({ element }) => {
      element.inert = true;
      element.setAttribute('aria-hidden', 'true');
    });
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      backgrounds.forEach(({ element, previousAriaHidden, previousInert }) => {
        element.inert = previousInert;
        if (previousAriaHidden === null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', previousAriaHidden);
      });
    };
  }, [closePreview, previewing]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const loaded = await listRecruiterJobs();
      setJobs(loaded);
      // İlk yüklemede karar: yayında ilan varsa oraya odaklan, yoksa Tümü.
      // Kullanıcı bir filtre seçtiyse ona DOKUNMA (yenileme seçimi ezmez).
      setJobFilter((current) =>
        current ?? (loaded.some((job) => job.status === 'PUBLISHED') ? 'PUBLISHED' : 'ALL'),
      );
      return loaded;
    } catch (loadError) {
      setJobs([]);
      setError(loadError instanceof Error ? loadError.message : 'İlanlar yüklenemedi.');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const mutationKey = (operation: string, payload: unknown) => {
    const payloadFingerprint = JSON.stringify(payload);
    const existing = retryKeys.current.get(operation);
    if (existing?.payloadFingerprint === payloadFingerprint) return existing.key;
    const created = createApplicationIdempotencyKey();
    retryKeys.current.set(operation, { key: created, payloadFingerprint });
    return created;
  };

  const openCreate = () => {
    retryKeys.current.delete('create');
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
    setActionError('');
    setSuccess('');
    setQuestionWarnings([]);
  };

  const openEdit = (job: RecruiterJobDto) => {
    setEditing(job);
    setForm(formFromJob(job));
    setFormOpen(true);
    setActionError('');
    setSuccess('');
    setQuestionWarnings([]);
  };

  // --- ats#240 A: soru düzenleme -------------------------------------------------
  // Hepsi form state'i üzerinde çalışır; kaydedilene kadar sunucuya gitmez.

  const patchQuestion = (index: number, patch: Partial<QuestionFormState>) =>
    setForm((current) => ({
      ...current,
      questions: current.questions.map((question, position) =>
        position === index ? { ...question, ...patch } : question,
      ),
    }));

  const addQuestion = () =>
    setForm((current) =>
      current.questions.length >= MAX_JOB_QUESTIONS
        ? current
        : { ...current, questions: [...current.questions, { ...EMPTY_QUESTION }] },
    );

  const removeQuestion = (index: number) =>
    setForm((current) => ({
      ...current,
      questions: current.questions.filter((_, position) => position !== index),
    }));

  /**
   * Yeniden sıralama yalnız dizideki konumu değiştirir. `questionId` taşınır —
   * "3. soruyu yukarı al" işlemi soruyu değil, sırasını değiştirir.
   */
  const moveQuestion = (index: number, delta: -1 | 1) =>
    setForm((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.questions.length) return current;
      const questions = [...current.questions];
      [questions[index], questions[target]] = [questions[target], questions[index]];
      return { ...current, questions };
    });

  const patchOption = (questionIndex: number, optionIndex: number, label: string) =>
    setForm((current) => ({
      ...current,
      questions: current.questions.map((question, position) =>
        position !== questionIndex
          ? question
          : {
              ...question,
              options: question.options.map((option, slot) =>
                slot === optionIndex ? { ...option, label } : option,
              ),
            },
      ),
    }));

  const addOption = (questionIndex: number) =>
    setForm((current) => ({
      ...current,
      questions: current.questions.map((question, position) =>
        position !== questionIndex || question.options.length >= MAX_JOB_QUESTION_OPTIONS
          ? question
          : { ...question, options: [...question.options, { label: '' }] },
      ),
    }));

  const removeOption = (questionIndex: number, optionIndex: number) =>
    setForm((current) => ({
      ...current,
      questions: current.questions.map((question, position) =>
        position !== questionIndex
          ? question
          : {
              ...question,
              options: question.options.filter((_, slot) => slot !== optionIndex),
            },
      ),
    }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    // ats#240 A: kural ekranda yazıyorsa istek de ona uymalı — sessiz filtreleme yok.
    const questionError = questionFormError(form.questions);
    if (questionError) {
      setSuccess('');
      setActionError(questionError);
      return;
    }
    setSaving(true);
    setActionError('');
    setSuccess('');
    const operation = editing ? `update:${editing.jobId}:${editing.version}` : 'create';
    try {
      const payload = payloadFromForm(form);
      const updatePayload = editing
        ? { ...payload, slug: payload.slug ?? editing.slug }
        : undefined;
      const saved = editing
        ? await updateRecruiterJob(editing, updatePayload!, mutationKey(operation, updatePayload))
        : await createRecruiterJob(payload, mutationKey(operation, payload));
      retryKeys.current.delete(operation);
      setJobs((current) =>
        editing
          ? current.map((job) => (job.jobId === saved.jobId ? saved : job))
          : [saved, ...current],
      );
      setFormOpen(false);
      setEditing(null);
      // Kayıt başarılı; uyarılar İK'ya AYRICA gösterilir, kaydı geri almaz.
      //
      // Uyarı `questionId` taşır (kimlik), ekranda ise "kaçıncı soru" anlamlıdır.
      // Eşleme SUNUCUNUN döndürdüğü kayıt üzerinden yapılır: yeni sorularda form
      // state'inde henüz kimlik yoktur, kimliği sunucu bu yanıtta atar.
      const savedQuestions = saved.questions ?? [];
      setQuestionWarnings(
        (saved.questionWarnings ?? []).map((warning) => ({
          order:
            savedQuestions.find((question) => question.questionId === warning.questionId)?.order ??
            0,
          category: warning.category,
          signal: warning.signal,
        })),
      );
      setSuccess(
        editing
          ? `“${saved.title}” ilanı güncellendi.`
          : `“${saved.title}” taslak ilanı kalıcı olarak oluşturuldu.`,
      );
    } catch (saveError) {
      setActionError(
        saveError instanceof Error
          ? saveError.message
          : 'İlan kaydedilemedi; değişiklik yapılmadı.',
      );
      const refreshed = await load();
      if (editing) {
        const freshJob = refreshed.find((job) => job.jobId === editing.jobId);
        if (freshJob && freshJob.version !== editing.version) {
          setFormOpen(false);
          setEditing(null);
          setActionError(
            `“${freshJob.title}” başka bir işlemde güncellendi. Güncel ilanı yeniden açıp değişikliklerinizi tekrar uygulayın.`,
          );
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const transition = async (job: RecruiterJobDto, targetStatus: RecruiterJobStatus) => {
    if (transitioningJobId) return;
    const operation = `transition:${job.jobId}:${job.version}:${targetStatus}`;
    setTransitioningJobId(job.jobId);
    setActionError('');
    setSuccess('');
    try {
      const transitionPayload = { expectedVersion: job.version, targetStatus };
      const updated = await transitionRecruiterJob(
        job,
        targetStatus,
        mutationKey(operation, transitionPayload),
      );
      retryKeys.current.delete(operation);
      setJobs((current) => current.map((item) => (item.jobId === updated.jobId ? updated : item)));
      setSuccess(
        `“${updated.title}” artık ${STATUS_LABELS[updated.status].toLocaleLowerCase('tr-TR')}.`,
      );
    } catch (transitionError) {
      setActionError(
        transitionError instanceof Error ? transitionError.message : 'İlan durumu değiştirilemedi.',
      );
      await load();
    } finally {
      setTransitioningJobId(null);
    }
  };

  const openPreview = (job: RecruiterJobDto, trigger: HTMLButtonElement) => {
    previewTriggerRef.current = trigger;
    setPreviewing(job);
  };

  const trapPreviewFocus: React.KeyboardEventHandler<HTMLDivElement> = (event) => {
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      previewDialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
    if (focusable.length === 0) {
      event.preventDefault();
      previewHeadingRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <section
      id="recruiter-jobs"
      className="scroll-mt-24 rounded-3xl border border-border-subtle bg-surface-default p-4 shadow-xs sm:p-6"
      aria-labelledby="recruiter-jobs-heading"
      data-testid="recruiter-jobs-panel"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-text-primary">
            İlan yönetimi
          </p>
          <h2 id="recruiter-jobs-heading" className="mt-1 text-2xl font-bold text-text-primary">
            İlanlarım
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">
            Taslak oluşturun, içeriği kontrol edin ve hazır olduğunda yayınlayın. Yalnız “Yayında”
            durumundaki ilanlar yeni başvuru kabul eder.
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-action-primary px-5 py-2.5 text-sm font-bold text-action-primary-text"
          >
            Yeni ilan oluştur
          </button>
        ) : (
          <p className="rounded-xl border border-border-subtle bg-surface-muted px-4 py-3 text-sm font-semibold text-text-secondary">
            Salt-okuma erişimi
          </p>
        )}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3" aria-label="İlan sayıları">
        {[
          [jobs.length, 'Toplam ilan'],
          [jobs.filter((job) => job.status === 'PUBLISHED').length, 'Yayında'],
          [jobs.filter((job) => job.status === 'DRAFT').length, 'Taslak'],
        ].map(([value, label]) => (
          <div key={label} className="rounded-2xl border border-border-subtle bg-surface-muted p-4">
            <p className="text-2xl font-bold text-text-primary">{value}</p>
            <p className="mt-1 text-sm font-medium text-text-secondary">{label}</p>
          </div>
        ))}
      </div>

      {/* Sayıya tıklamak listeyi o kümeye indirir: "3 Yayında" yazıp onu
          göstermemek, kullanıcıyı kaydırmaya zorluyordu. */}
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="İlan durumu filtresi">
        {JOB_FILTERS.map((filter) => {
          const count =
            filter.id === 'ALL' ? jobs.length : jobs.filter((job) => job.status === filter.id).length;
          const active = activeFilter === filter.id;
          return (
            <button
              key={filter.id}
              type="button"
              data-testid={`recruiter-job-filter-${filter.id}`}
              aria-pressed={active}
              onClick={() => setJobFilter(filter.id)}
              className={`min-h-11 rounded-xl border px-4 py-2 text-sm font-bold ${
                active
                  ? 'border-action-primary bg-action-primary text-action-primary-text'
                  : 'border-border-subtle bg-surface-default text-text-primary'
              }`}
            >
              {filter.label} · {count}
            </button>
          );
        })}
      </div>

      {error ? (
        <div
          className="mt-5 rounded-2xl border border-state-danger-border bg-state-danger-bg p-4"
          role="alert"
        >
          <p className="font-semibold text-text-primary">İlanlar yüklenemedi.</p>
          <p className="mt-1 text-sm text-text-secondary">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 rounded-xl border border-border-strong bg-surface-default px-4 py-2 text-sm font-bold"
          >
            Yeniden dene
          </button>
        </div>
      ) : null}
      {actionError ? (
        <p
          className="mt-4 rounded-xl border border-state-danger-border bg-state-danger-bg p-3 text-sm font-semibold text-text-primary"
          role="alert"
        >
          {actionError}
        </p>
      ) : null}
      {success ? (
        <p
          className="mt-4 rounded-xl border border-state-success-border bg-state-success-bg p-3 text-sm font-semibold text-text-primary"
          role="status"
        >
          {success}
        </p>
      ) : null}

      {/*
        ats#240 A: korunan-özellik uyarıları. Kayıt BAŞARILIDIR — bu kutu onun
        yanında durur, yerine değil. Uyarı engellemez, görünür kılar; kararı İK
        verir. `COVERAGE_UNKNOWN`/`ADVISOR_UNAVAILABLE` "taranamadı" demektir ve
        sessizce "temiz" görünmemesi için sunucudan ayrı kategori olarak gelir.
      */}
      {questionWarnings.length > 0 ? (
        <div
          className="mt-4 rounded-xl border border-state-warning-border bg-state-warning-bg p-3"
          role="status"
          data-testid="job-question-warnings"
        >
          <p className="text-sm font-bold text-text-primary">
            Sorularınız gözden geçirilmeli
          </p>
          <p className="mt-1 text-xs leading-5 text-text-secondary">
            Aşağıdaki sorular korunan bir kişisel özelliğe değiyor olabilir. İlan kaydedildi;
            eleme yapılmadı. Soruların işle ilgili olduğundan emin olun.
          </p>
          <ul className="mt-2 grid gap-1">
            {questionWarnings.map((warning, index) => (
              <li
                key={`${warning.order}-${warning.category}-${index}`}
                className="text-xs text-text-primary"
              >
                <strong>{warning.order || '?'}. soru</strong>
                {' — '}
                {warning.category === 'COVERAGE_UNKNOWN' ||
                warning.category === 'ADVISOR_UNAVAILABLE'
                  ? 'tarama yapılamadı; uyarı yokluğu "risk yok" anlamına gelmez'
                  : `${warning.category} (${warning.signal})`}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {formOpen ? (
        <form
          onSubmit={(event) => void submit(event)}
          className="mt-6 rounded-2xl border border-border-strong bg-surface-muted p-4 sm:p-6"
          aria-label={editing ? 'İlanı düzenle' : 'Yeni ilan'}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-text-primary">
                {editing ? 'İlanı düzenle' : 'Yeni taslak ilan'}
              </h3>
              <p className="mt-1 text-sm text-text-secondary">
                Kaydetmek ilanı yayınlamaz; önce taslak oluşur.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="rounded-lg border border-border-subtle bg-surface-default px-3 py-2 text-sm font-semibold"
            >
              Formu kapat
            </button>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field
              label="İlan başlığı"
              value={form.title}
              onChange={(title) => setForm((current) => ({ ...current, title }))}
              required
              minLength={2}
              maxLength={180}
            />
            <Field
              label="URL kısa adı"
              value={form.slug}
              onChange={(slug) => setForm((current) => ({ ...current, slug }))}
              placeholder={editing ? undefined : 'Boş bırakılırsa otomatik üretilir'}
              required={Boolean(editing)}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
            />
            <Field
              label="Ekip"
              value={form.team}
              onChange={(team) => setForm((current) => ({ ...current, team }))}
              required
              minLength={2}
              maxLength={120}
            />
            <Field
              label="Konum"
              value={form.location}
              onChange={(location) => setForm((current) => ({ ...current, location }))}
              required
              minLength={2}
              maxLength={160}
            />
            <Field
              label="Çalışma modeli"
              value={form.mode}
              onChange={(mode) => setForm((current) => ({ ...current, mode }))}
              required
              minLength={2}
              maxLength={80}
            />
            <Field
              label="İstihdam türü"
              value={form.employmentType}
              onChange={(employmentType) => setForm((current) => ({ ...current, employmentType }))}
              required
              minLength={2}
              maxLength={80}
            />
          </div>
          <label className="mt-4 block text-sm font-semibold text-text-primary">
            İlan özeti
            <textarea
              value={form.summary}
              onChange={(event) =>
                setForm((current) => ({ ...current, summary: event.target.value }))
              }
              required
              minLength={20}
              maxLength={8000}
              rows={5}
              className="mt-2 w-full rounded-xl border border-border-subtle bg-surface-default px-3.5 py-3 text-sm"
            />
          </label>
          <label className="mt-4 block text-sm font-semibold text-text-primary">
            Öne çıkanlar
            <textarea
              value={form.highlights}
              onChange={(event) =>
                setForm((current) => ({ ...current, highlights: event.target.value }))
              }
              rows={3}
              placeholder="Her satıra bir madde"
              className="mt-2 w-full rounded-xl border border-border-subtle bg-surface-default px-3.5 py-3 text-sm"
            />
          </label>
          <fieldset className="mt-4 rounded-2xl border border-border-subtle bg-surface-default p-4">
            <legend className="px-1 text-sm font-bold text-text-primary">
              Başvuru formu alanları
            </legend>
            <p className="mt-1 text-xs leading-5 text-text-secondary">
              İletişim, özgeçmiş özeti, deneyim, eğitim ve beceri alanları güvenli başvuru için
              zorunludur. Aşağıdaki ek alanları aday formunda açıp kapatabilirsiniz.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {OPTIONAL_FIELD_OPTIONS.map((option) => (
                <label
                  key={option.key}
                  className="flex min-h-11 items-center gap-3 text-sm font-semibold"
                >
                  <input
                    type="checkbox"
                    checked={form.applicationFields.includes(option.key)}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        applicationFields: event.target.checked
                          ? [...current.applicationFields, option.key]
                          : current.applicationFields.filter((field) => field !== option.key),
                      }))
                    }
                    className="h-4 w-4"
                  />
                  {option.label}
                </label>
              ))}
            </div>
            <p className="mt-3 text-xs text-text-secondary">
              Aydınlatma metni sürümü: <strong>kvkk-application-v1</strong>
            </p>
          </fieldset>

          {/*
            ats#240 A: ilana özel başvuru soruları. Sahip talebi — "adaya sorular
            da yöneltebilmeliyiz". Öncesinde tek çıkış yolu adayın serbest not
            alanına yazmasıydı: ne sorulduğu belli değil, cevap yapısal değil.

            Sıra dizideki konumdur; kimlik değildir. Yukarı/aşağı taşımak soruyu
            değil sırasını değiştirir, `questionId` sabit kalır.
          */}
          <fieldset
            className="mt-4 rounded-2xl border border-border-subtle bg-surface-default p-4"
            data-testid="job-questions-editor"
          >
            <legend className="px-1 text-sm font-bold text-text-primary">
              Adaya sorulacak sorular
            </legend>
            <p className="mt-1 text-xs leading-5 text-text-secondary">
              Bu ilana özel, başvuru sırasında yanıtlanacak sorular. Cevaplar size gösterilir;
              <strong> otomatik eleme veya puanlama yapılmaz</strong> — kararı siz verirsiniz.
            </p>
            <p className="mt-1 text-xs font-semibold text-text-secondary">
              {form.questions.length} / {MAX_JOB_QUESTIONS} soru
            </p>

            {form.questions.length === 0 && (
              <p className="mt-3 text-xs text-text-secondary" data-testid="job-questions-empty">
                Henüz soru eklenmedi. Sorusuz ilan geçerlidir.
              </p>
            )}

            <ol className="mt-3 grid gap-3">
              {form.questions.map((question, index) => (
                <li
                  key={question.questionId ?? `new-${index}`}
                  className="rounded-xl border border-border-subtle p-3"
                  data-testid="job-question-row"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-text-secondary">{index + 1}. soru</span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => moveQuestion(index, -1)}
                        disabled={index === 0}
                        aria-label={`${index + 1}. soruyu yukarı taşı`}
                        className="min-h-11 min-w-11 rounded-lg border border-border-subtle px-2 text-sm font-bold disabled:opacity-40"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveQuestion(index, 1)}
                        disabled={index === form.questions.length - 1}
                        aria-label={`${index + 1}. soruyu aşağı taşı`}
                        className="min-h-11 min-w-11 rounded-lg border border-border-subtle px-2 text-sm font-bold disabled:opacity-40"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => removeQuestion(index)}
                        aria-label={`${index + 1}. soruyu sil`}
                        className="min-h-11 rounded-lg border border-border-subtle px-3 text-sm font-bold"
                      >
                        Sil
                      </button>
                    </div>
                  </div>

                  <label className="mt-2 block text-sm font-semibold text-text-primary">
                    Soru metni
                    <input
                      value={question.text}
                      onChange={(event) => patchQuestion(index, { text: event.target.value })}
                      required
                      minLength={2}
                      maxLength={500}
                      className="mt-2 min-h-11 w-full rounded-xl border border-border-subtle bg-surface-default px-3.5 text-sm"
                    />
                  </label>

                  <div className="mt-2 flex flex-wrap items-end gap-4">
                    <label className="block text-sm font-semibold text-text-primary">
                      Cevap biçimi
                      <select
                        value={question.kind}
                        onChange={(event) =>
                          patchQuestion(index, {
                            kind: event.target.value as RecruiterJobQuestionKind,
                          })
                        }
                        className="mt-2 min-h-11 rounded-xl border border-border-subtle bg-surface-default px-3 text-sm"
                      >
                        {RECRUITER_JOB_QUESTION_KINDS.map((kind) => (
                          <option key={kind} value={kind}>
                            {QUESTION_KIND_LABELS[kind]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                      <input
                        type="checkbox"
                        checked={question.required}
                        onChange={(event) =>
                          patchQuestion(index, { required: event.target.checked })
                        }
                        className="h-4 w-4"
                      />
                      Yanıtlanması zorunlu
                    </label>
                  </div>

                  {question.kind === 'SINGLE_CHOICE' && (
                    <div className="mt-3 rounded-lg border border-border-subtle p-3">
                      <p className="text-xs font-bold text-text-secondary">
                        Seçenekler (en az 2, en fazla {MAX_JOB_QUESTION_OPTIONS})
                      </p>
                      <div className="mt-2 grid gap-2">
                        {question.options.map((option, optionIndex) => (
                          <div
                            key={option.optionId ?? `new-option-${optionIndex}`}
                            className="flex items-center gap-2"
                          >
                            <input
                              value={option.label}
                              onChange={(event) =>
                                patchOption(index, optionIndex, event.target.value)
                              }
                              maxLength={120}
                              aria-label={`${index + 1}. soru, ${optionIndex + 1}. seçenek`}
                              className="min-h-11 flex-1 rounded-xl border border-border-subtle bg-surface-default px-3.5 text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => removeOption(index, optionIndex)}
                              disabled={question.options.length <= 2}
                              aria-label={`${optionIndex + 1}. seçeneği sil`}
                              className="min-h-11 rounded-lg border border-border-subtle px-3 text-sm font-bold disabled:opacity-40"
                            >
                              Sil
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => addOption(index)}
                        disabled={question.options.length >= MAX_JOB_QUESTION_OPTIONS}
                        className="mt-2 min-h-11 rounded-lg border border-border-subtle px-3 text-sm font-bold disabled:opacity-40"
                      >
                        Seçenek ekle
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ol>

            <button
              type="button"
              onClick={addQuestion}
              disabled={form.questions.length >= MAX_JOB_QUESTIONS}
              data-testid="job-question-add"
              className="mt-3 min-h-11 rounded-xl border border-border-subtle bg-surface-default px-4 text-sm font-bold disabled:opacity-40"
            >
              Soru ekle
            </button>
            {form.questions.length >= MAX_JOB_QUESTIONS && (
              <p className="mt-2 text-xs text-text-secondary">
                Üst sınıra ulaşıldı. Başvuru formunun uzunluğu adayın işini bozmamalı.
              </p>
            )}
          </fieldset>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving}
              className="min-h-11 rounded-xl bg-action-primary px-5 py-2.5 text-sm font-bold text-action-primary-text disabled:opacity-50"
            >
              {saving ? 'Kaydediliyor…' : editing ? 'Değişiklikleri kaydet' : 'Taslak oluştur'}
            </button>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="min-h-11 rounded-xl border border-border-subtle bg-surface-default px-5 py-2.5 text-sm font-bold"
            >
              Vazgeç
            </button>
          </div>
        </form>
      ) : null}

      {previewing
        ? createPortal(
            <div
              ref={previewDialogRef}
              className="fixed inset-0 z-[1700] flex items-start justify-center overflow-y-auto bg-black/60 p-3 sm:p-8"
              role="dialog"
              aria-modal="true"
              aria-labelledby="recruiter-job-preview-heading"
              data-testid="recruiter-job-preview"
              onKeyDown={trapPreviewFocus}
            >
              <article className="my-auto w-full max-w-4xl overflow-hidden rounded-3xl bg-surface-default shadow-2xl">
                <div className="bg-text-primary px-5 py-7 text-white sm:px-8 sm:py-9">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold text-white/75">{previewing.team}</p>
                      <h2
                        ref={previewHeadingRef}
                        id="recruiter-job-preview-heading"
                        tabIndex={-1}
                        className="mt-2 text-2xl font-bold outline-none sm:text-4xl"
                      >
                        {previewing.title}
                      </h2>
                      <p className="mt-4 text-sm text-white/80">
                        {previewing.location} · {previewing.mode} · {previewing.employmentType}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={closePreview}
                      className="min-h-11 rounded-xl border border-white/30 px-4 py-2 text-sm font-bold text-white"
                    >
                      Önizlemeyi kapat
                    </button>
                  </div>
                </div>
                <div className="grid gap-7 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_260px]">
                  <div>
                    <h3 className="text-lg font-bold">Pozisyon hakkında</h3>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-text-secondary">
                      {previewing.summary}
                    </p>
                    {previewing.highlights.length ? (
                      <ul className="mt-5 list-disc space-y-2 pl-5 text-sm text-text-secondary">
                        {previewing.highlights.map((highlight) => (
                          <li key={highlight}>{highlight}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <aside className="h-fit rounded-2xl border border-border-subtle bg-surface-muted p-4">
                    <p className="font-bold">Aday başvuru formu</p>
                    <p className="mt-2 text-xs leading-5 text-text-secondary">
                      {previewing.applicationFields.length} alan · aydınlatma{' '}
                      {previewing.noticeVersion}
                    </p>
                    <p className="mt-4 rounded-xl bg-surface-default p-3 text-xs text-text-secondary">
                      Bu önizleme public yayına çıkmaz; aday yalnız ilan yayınlandıktan sonra
                      başvurabilir.
                    </p>
                  </aside>
                </div>
              </article>
            </div>,
            document.body,
          )
        : null}

      <div className="mt-6">
        {loading ? (
          <p className="rounded-2xl bg-surface-muted p-5 text-sm text-text-secondary" role="status">
            İlanlar yükleniyor…
          </p>
        ) : null}
        {!loading && !error && jobs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-strong bg-surface-muted p-6 text-center">
            <p className="font-bold text-text-primary">Henüz ilanınız yok.</p>
            <p className="mt-2 text-sm text-text-secondary">
              İlk taslağı oluşturup adayların görebileceği hale getirin.
            </p>
          </div>
        ) : null}
        {/* İlan VAR ama seçili kümede yok: sessizce tüm listeyi göstermek,
            kullanıcının yanlış kümeye baktığını fark etmemesine yol açar. */}
        {!loading && !error && jobs.length > 0 && visibleJobs.length === 0 ? (
          <div
            className="rounded-2xl border border-dashed border-border-strong bg-surface-muted p-6 text-center"
            data-testid="recruiter-jobs-empty-filter"
          >
            <p className="font-bold text-text-primary">
              {JOB_FILTERS.find((filter) => filter.id === activeFilter)?.label} durumunda ilan yok.
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              Bu tenant'ın {jobs.length} ilanı var; hepsini görmek için Tümü'ne geçin.
            </p>
            <button
              type="button"
              data-testid="recruiter-jobs-show-all"
              onClick={() => setJobFilter('ALL')}
              className="mt-3 min-h-11 rounded-xl border border-border-strong bg-surface-default px-4 py-2 text-sm font-bold text-text-primary"
            >
              Tümü · {jobs.length}
            </button>
          </div>
        ) : null}
        {!loading && visibleJobs.length > 0 ? (
          <ul className="grid gap-4 lg:grid-cols-2" aria-label="Tenant ilanları">
            {visibleJobs.map((job) => (
              <li
                key={job.jobId}
                className="rounded-2xl border border-border-subtle bg-surface-default p-5 shadow-xs"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Badge
                      variant={
                        job.status === 'PUBLISHED'
                          ? 'success'
                          : job.status === 'DRAFT'
                            ? 'info'
                            : 'warning'
                      }
                      size="sm"
                    >
                      {STATUS_LABELS[job.status]}
                    </Badge>
                    <h3 className="mt-3 text-lg font-bold text-text-primary">{job.title}</h3>
                    <p className="mt-1 text-sm text-text-secondary">
                      {job.team} · {job.location} · {job.mode}
                    </p>
                  </div>
                  <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-semibold text-text-secondary">
                    v{job.version}
                  </span>
                </div>
                <p className="mt-4 line-clamp-3 text-sm leading-6 text-text-secondary">
                  {job.summary}
                </p>
                <p className="mt-3 text-xs text-text-subtle">
                  Son değişiklik: {formatDate(job.updatedAt)}
                </p>
                {/* #227: sayı VE "hangileri". Başvurusu olmayan ilan 0 gösterir,
                    satır gizlenmez — boşluk da bilgidir. */}
                <div
                  className="mt-4 flex flex-wrap items-center gap-2 border-t border-border-subtle pt-4"
                  data-testid={`recruiter-job-breakdown-${job.slug}`}
                >
                  <span className="text-xs font-semibold text-text-secondary">Başvurular</span>
                  <button
                    type="button"
                    onClick={() => onDrillDown?.(job.slug, 'ALL')}
                    disabled={!onDrillDown}
                    data-testid={`recruiter-job-total-${job.slug}`}
                    className="min-h-8 rounded-lg border border-border-strong bg-surface-default px-2.5 py-1 text-xs font-bold text-text-primary disabled:opacity-60"
                  >
                    Tümü · {applications.filter((a) => a.jobSlug === job.slug).length}
                  </button>
                  {JOB_BREAKDOWN_STAGES.map((stage) => (
                    <button
                      key={stage.id}
                      type="button"
                      onClick={() => onDrillDown?.(job.slug, stage.id)}
                      disabled={!onDrillDown}
                      data-testid={`recruiter-job-stage-${job.slug}-${stage.id}`}
                      className="min-h-8 rounded-lg border border-border-subtle bg-surface-muted px-2.5 py-1 text-xs font-semibold text-text-primary disabled:opacity-60"
                    >
                      {stage.label} ·{' '}
                      {
                        applications.filter(
                          (a) => a.jobSlug === job.slug && a.status === stage.id,
                        ).length
                      }
                    </button>
                  ))}
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <ActionButton
                    label="Önizle"
                    onClick={(event) => openPreview(job, event.currentTarget)}
                  />
                  {canManage && job.status !== 'CLOSED' && job.status !== 'ARCHIVED' ? (
                    <ActionButton label="Düzenle" onClick={() => openEdit(job)} />
                  ) : null}
                  {canManage && (job.status === 'DRAFT' || job.status === 'PAUSED') ? (
                    <ActionButton
                      label="Yayınla"
                      primary
                      onClick={() => void transition(job, 'PUBLISHED')}
                      disabled={transitioningJobId === job.jobId}
                    />
                  ) : null}
                  {canManage && job.status === 'PUBLISHED' ? (
                    <ActionButton
                      label="Duraklat"
                      onClick={() => void transition(job, 'PAUSED')}
                      disabled={transitioningJobId === job.jobId}
                    />
                  ) : null}
                  {canManage && (job.status === 'PUBLISHED' || job.status === 'PAUSED') ? (
                    <ActionButton
                      label="İlanı kapat"
                      onClick={() => void transition(job, 'CLOSED')}
                      disabled={transitioningJobId === job.jobId}
                    />
                  ) : null}
                  {canManage && job.status === 'CLOSED' ? (
                    <ActionButton
                      label="Arşivle"
                      onClick={() => void transition(job, 'ARCHIVED')}
                      disabled={transitioningJobId === job.jobId}
                    />
                  ) : null}
                  {job.status === 'PUBLISHED' && job.publicHandle ? (
                    <a
                      href={`/careers/${encodeURIComponent(job.publicHandle)}/jobs/${encodeURIComponent(job.slug)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-10 items-center rounded-lg border border-border-subtle bg-surface-muted px-3 py-2 text-sm font-bold text-text-primary underline underline-offset-4"
                    >
                      Public ilanı aç
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
};

const Field = ({
  label,
  value,
  onChange,
  ...inputProps
}: { label: string; value: string; onChange: (value: string) => void } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange'
>) => (
  <label className="block text-sm font-semibold text-text-primary">
    {label}
    <input
      {...inputProps}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="mt-2 min-h-11 w-full rounded-xl border border-border-subtle bg-surface-default px-3.5 py-2.5 text-sm"
    />
  </label>
);

const ActionButton = ({
  label,
  onClick,
  primary = false,
  disabled = false,
}: {
  label: string;
  onClick: React.MouseEventHandler<HTMLButtonElement>;
  primary?: boolean;
  disabled?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={
      primary
        ? 'min-h-10 rounded-lg bg-action-primary px-3 py-2 text-sm font-bold text-action-primary-text disabled:opacity-50'
        : 'min-h-10 rounded-lg border border-border-subtle bg-surface-default px-3 py-2 text-sm font-bold text-text-primary disabled:opacity-50'
    }
  >
    {label}
  </button>
);

export default RecruiterJobsPanel;
