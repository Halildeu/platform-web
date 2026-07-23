import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  confirmResumeImport,
  createResumeImport,
  createApplicationIdempotencyKey,
  createCandidateAccessToken,
  DEFAULT_APPLICATION_FIELDS,
  getResumeImport,
  getPublicJob,
  replaceResumePdf,
  saveCandidateSession,
  submitApplication,
  terminateResumeImport,
  updateResumeProposal,
  uploadResumePdf,
  type ApplicationFieldKey,
  type ApplicationReceiptDto,
  type PublicJobDto,
  type ResumeDraftDto,
  type ResumeImportDto,
  type ResumeProposalDto,
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
  importedFieldCount: number;
};

type ResumeStatus = 'idle' | 'uploading' | 'reviewing' | 'confirmed';

type ResumeBinding = { importId: string; draftVersion: number };

type MergeConflict = {
  field: keyof ApplicationValues;
  manualValue: string;
  resumeValue: string;
  mergedValue: string;
  choice: 'manual' | 'resume' | 'edit' | null;
};

type View = 'form' | 'preview' | 'receipt';
type FormStep = 'resume' | 'contact' | 'profile';

const FORM_STEPS: ReadonlyArray<{ id: FormStep | 'preview' | 'receipt'; label: string }> = [
  { id: 'resume', label: 'CV' },
  { id: 'contact', label: 'Bilgiler' },
  { id: 'profile', label: 'Deneyim' },
  { id: 'preview', label: 'Kontrol' },
  { id: 'receipt', label: 'Makbuz' },
];

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

const FIELD_LABELS: Record<ApplicationFieldKey, string> = {
  fullName: 'Ad soyad',
  email: 'E-posta',
  phone: 'Telefon',
  city: 'Şehir',
  linkedIn: 'LinkedIn',
  portfolio: 'Portföy / kişisel site',
  summary: 'Profesyonel özet',
  experience: 'İş deneyimi',
  education: 'Eğitim',
  skills: 'Beceriler',
  note: 'Ek not',
};

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
  const { publicHandle, jobSlug = 'urun-yoneticisi' } = useParams();
  const jobsBase = publicHandle ? `/careers/${encodeURIComponent(publicHandle)}/jobs` : '/jobs';
  const [job, setJob] = useState<PublicJobDto | null>(null);
  const [jobError, setJobError] = useState('');
  const [values, setValues] = useState<ApplicationValues>(EMPTY_VALUES);
  const [view, setView] = useState<View>('form');
  const [formStep, setFormStep] = useState<FormStep>('resume');
  const [fileMeta, setFileMeta] = useState<LocalFileMeta | null>(null);
  const [fileError, setFileError] = useState('');
  const [resumeStatus, setResumeStatus] = useState<ResumeStatus>('idle');
  const [resumeNoticeAccepted, setResumeNoticeAccepted] = useState(false);
  const [resumeNoticeAcceptedAt, setResumeNoticeAcceptedAt] = useState('');
  const [resumeImport, setResumeImport] = useState<ResumeImportDto | null>(null);
  const [resumeBinding, setResumeBinding] = useState<ResumeBinding | null>(null);
  const [resumeEdits, setResumeEdits] = useState<Partial<Record<ApplicationFieldKey, string>>>({});
  const [resumeBusyField, setResumeBusyField] = useState<ApplicationFieldKey | 'all' | null>(null);
  const [replaceRequested, setReplaceRequested] = useState(false);
  const [showRejectAllConfirm, setShowRejectAllConfirm] = useState(false);
  const [mergeConflicts, setMergeConflicts] = useState<MergeConflict[]>([]);
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
  const resumeCreateKeyRef = useRef(createApplicationIdempotencyKey());
  const candidateAccessTokenRef = useRef(createCandidateAccessToken());
  const resumeRequestIdRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileErrorRef = useRef<HTMLParagraphElement>(null);
  const previewHeadingRef = useRef<HTMLHeadingElement>(null);
  const receiptHeadingRef = useRef<HTMLHeadingElement>(null);
  const enabledFields = job?.applicationFields ?? DEFAULT_APPLICATION_FIELDS;
  const isFieldEnabled = (field: keyof ApplicationValues) => enabledFields.includes(field);

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
    void getPublicJob(jobSlug, publicHandle)
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
  }, [jobSlug, publicHandle]);

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
    setFormStep('contact');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    if (!fileError || !fileErrorRef.current) return;
    fileErrorRef.current.focus();
  }, [fileError]);

  const waitForResumeProposals = async (current: ResumeImportDto): Promise<ResumeImportDto> => {
    if (current.proposals.length > 0) return current;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 500));
      const next = await getResumeImport(current.importId, candidateAccessTokenRef.current);
      if (next.proposals.length > 0 || next.state !== 'ACTIVE') return next;
    }
    throw new Error(
      'PDF işleme beklenenden uzun sürdü. Formu elle doldurabilir veya tekrar deneyebilirsiniz.',
    );
  };

  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = async (event) => {
    const requestId = ++resumeRequestIdRef.current;
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

    if (!resumeNoticeAccepted || !resumeNoticeAcceptedAt) {
      setFileError('PDF yüklemeden önce CV içe aktarma aydınlatmasını okuyup onaylayın.');
      event.target.value = '';
      return;
    }

    setResumeStatus('uploading');
    try {
      let active = resumeImport;
      if (!active || active.state !== 'ACTIVE') {
        active = await createResumeImport(
          jobSlug,
          resumeCreateKeyRef.current,
          candidateAccessTokenRef.current,
          resumeNoticeAcceptedAt,
          publicHandle,
        );
      } else if (replaceRequested && active.documentVersion > 0) {
        active = await replaceResumePdf(active, candidateAccessTokenRef.current);
      }
      const uploadKey = createApplicationIdempotencyKey();
      const uploaded = await uploadResumePdf(
        active,
        file,
        uploadKey,
        candidateAccessTokenRef.current,
      );
      const reviewed = uploaded.inFlight
        ? await waitForResumeProposals(uploaded.resumeImport)
        : uploaded.resumeImport;
      if (requestId !== resumeRequestIdRef.current) return;
      if (reviewed.proposals.length === 0) {
        setFileError(
          'Bu PDF’den önerilebilecek form alanı bulunamadı. Metin içeren başka bir PDF seçin veya alanları elle doldurun.',
        );
        setResumeStatus('idle');
        return;
      }
      setResumeImport(reviewed);
      setResumeEdits(
        Object.fromEntries(
          reviewed.proposals.map((proposal) => [
            proposal.field,
            proposal.candidateValue ?? proposal.proposedValue,
          ]),
        ),
      );
      setFileMeta({ size: file.size, importedFieldCount: 0 });
      setResumeStatus('reviewing');
      setResumeBinding(null);
      setMergeConflicts([]);
      setFormError('');
      setSubmitError('');
    } catch (uploadError) {
      if (requestId !== resumeRequestIdRef.current) return;
      setFileError(
        uploadError instanceof Error
          ? uploadError.message
          : 'PDF güvenli biçimde işlenemedi. Farklı bir PDF seçin veya alanları elle doldurun.',
      );
      setResumeStatus('idle');
    } finally {
      event.target.value = '';
      setReplaceRequested(false);
    }
  };

  const discardResume = async (terminalState: 'CANCELLED' | 'REJECT_ALL') => {
    resumeRequestIdRef.current += 1;
    setFileError('');
    setResumeBusyField('all');
    try {
      if (resumeImport?.state === 'ACTIVE') {
        await terminateResumeImport(resumeImport, candidateAccessTokenRef.current, terminalState);
      }
      setResumeImport(null);
      setResumeBinding(null);
      setResumeEdits({});
      setMergeConflicts([]);
      setFileMeta(null);
      setResumeStatus('idle');
      setShowRejectAllConfirm(false);
      resumeCreateKeyRef.current = createApplicationIdempotencyKey();
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (terminateError) {
      setFileError(
        terminateError instanceof Error ? terminateError.message : 'CV işlemi sonlandırılamadı.',
      );
    } finally {
      setResumeBusyField(null);
    }
  };

  const recoverResumeVersionConflict = async (importId: string, message: string) => {
    try {
      const latest = await getResumeImport(importId, candidateAccessTokenRef.current);
      setResumeImport(latest);
      setResumeEdits(
        Object.fromEntries(
          latest.proposals.map((proposal) => [
            proposal.field,
            proposal.candidateValue ?? proposal.proposedValue,
          ]),
        ),
      );
      setFileError(message);
    } catch {
      setFileError(
        'CV alan sürümü değişti ve güncel durum yüklenemedi. Formu elle doldurabilirsiniz.',
      );
    }
  };

  const decideResumeField = async (
    proposal: ResumeProposalDto,
    state: 'ACCEPTED' | 'EDITED' | 'REJECTED',
  ) => {
    if (!resumeImport || resumeBusyField) return;
    const editedValue = resumeEdits[proposal.field]?.trim();
    if (state === 'EDITED' && !editedValue) {
      setFileError(`${FIELD_LABELS[proposal.field]} için düzenlenmiş değer boş olamaz.`);
      return;
    }
    setFileError('');
    setResumeBusyField(proposal.field);
    try {
      const updated = await updateResumeProposal(
        resumeImport,
        proposal.field,
        state,
        candidateAccessTokenRef.current,
        editedValue,
      );
      setResumeImport(updated);
    } catch (fieldError) {
      if (fieldError instanceof Error && fieldError.message.includes('VERSION_CONFLICT')) {
        await recoverResumeVersionConflict(
          resumeImport.importId,
          'CV alanları başka bir istekte değişti. Güncel kararlar yüklendi; seçiminizi yeniden kontrol edin.',
        );
      } else {
        setFileError(
          fieldError instanceof Error ? fieldError.message : 'Alan kararı kaydedilemedi.',
        );
      }
    } finally {
      setResumeBusyField(null);
    }
  };

  const acceptAllSafeProposals = async () => {
    if (!resumeImport || resumeBusyField) return;
    setFileError('');
    setResumeBusyField('all');
    let current = resumeImport;
    try {
      for (const proposal of current.proposals) {
        if (proposal.state !== 'UNREVIEWED') continue;
        current = await updateResumeProposal(
          current,
          proposal.field,
          'ACCEPTED',
          candidateAccessTokenRef.current,
        );
        setResumeImport(current);
      }
    } catch (fieldError) {
      if (fieldError instanceof Error && fieldError.message.includes('VERSION_CONFLICT')) {
        await recoverResumeVersionConflict(
          current.importId,
          'CV alanları başka bir istekte değişti. Güncel kararlar yüklendi; kalan alanları yeniden kontrol edin.',
        );
      } else {
        setFileError(
          fieldError instanceof Error ? fieldError.message : 'Alan kararları kaydedilemedi.',
        );
      }
    } finally {
      setResumeBusyField(null);
    }
  };

  const applyDraftToForm = (draft: ResumeDraftDto) => {
    let imported = 0;
    const conflicts: MergeConflict[] = [];
    const next = { ...values };
    Object.entries(draft.fields).forEach(([rawField, rawValue]) => {
      const field = rawField as keyof ApplicationValues;
      const resumeValue = rawValue?.trim() ?? '';
      if (!resumeValue || !(field in next)) return;
      if (!values[field].trim() || values[field] === resumeValue) {
        next[field] = resumeValue;
        imported += 1;
      } else {
        conflicts.push({
          field,
          manualValue: values[field],
          resumeValue,
          mergedValue: `${values[field]}\n${resumeValue}`,
          choice: null,
        });
      }
    });
    setValues(next);
    setMergeConflicts(conflicts);
    setFileMeta((current) => (current ? { ...current, importedFieldCount: imported } : current));
    return conflicts.length;
  };

  const confirmReviewedResume = async () => {
    if (!resumeImport || resumeBusyField) return;
    setFileError('');
    setResumeBusyField('all');
    try {
      const confirmed = await confirmResumeImport(resumeImport, candidateAccessTokenRef.current);
      setResumeImport(confirmed.resumeImport);
      setResumeBinding({
        importId: confirmed.draft.importId,
        draftVersion: confirmed.draft.version,
      });
      const conflictCount = applyDraftToForm(confirmed.draft);
      setResumeStatus('confirmed');
      if (conflictCount === 0) {
        setFormStep('contact');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (confirmError) {
      if (confirmError instanceof Error && confirmError.message.includes('VERSION_CONFLICT')) {
        await recoverResumeVersionConflict(
          resumeImport.importId,
          'CV alanları başka bir istekte değişti. Güncel kararlar yüklendi; aktarmadan önce yeniden kontrol edin.',
        );
      } else {
        setFileError(
          confirmError instanceof Error ? confirmError.message : 'CV alanları forma aktarılamadı.',
        );
      }
    } finally {
      setResumeBusyField(null);
    }
  };

  const applyMergeChoices = () => {
    if (mergeConflicts.some((conflict) => conflict.choice === null)) return;
    setValues((current) => {
      const next = { ...current };
      mergeConflicts.forEach((conflict) => {
        if (conflict.choice === 'resume') next[conflict.field] = conflict.resumeValue;
        if (conflict.choice === 'edit') next[conflict.field] = conflict.mergedValue;
      });
      return next;
    });
    const imported = mergeConflicts.filter((conflict) =>
      ['resume', 'edit'].includes(conflict.choice ?? ''),
    ).length;
    setFileMeta((current) =>
      current ? { ...current, importedFieldCount: current.importedFieldCount + imported } : current,
    );
    setMergeConflicts([]);
    setFormStep('contact');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openProfileStep = () => {
    const missingContact = (['fullName', 'email', 'phone', 'city'] as const).some(
      (field) => values[field].trim().length === 0,
    );
    if (missingContact) {
      setFormError('Devam etmek için iletişim bilgilerindeki yıldızlı alanları doldurun.');
      return;
    }
    if (!isValidEmail(values.email)) {
      setFormError('Geçerli bir e-posta adresi girin.');
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
    setFormStep('profile');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openPreview: React.FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    if (resumeStatus === 'uploading') {
      setFormError(
        'PDF işlenirken formu doldurabilirsiniz; önizleme için işlemin tamamlanmasını bekleyin veya CV işlemini iptal edin.',
      );
      return;
    }
    if (mergeConflicts.length > 0) {
      setFormError('Önizlemeden önce dolu alanlarla CV önerileri arasındaki seçimleri tamamlayın.');
      return;
    }
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
          linkedIn: isFieldEnabled('linkedIn') ? values.linkedIn || undefined : undefined,
          portfolio: isFieldEnabled('portfolio') ? values.portfolio || undefined : undefined,
          summary: values.summary,
          experience: values.experience,
          education: values.education,
          skills: values.skills
            .split(',')
            .map((skill) => skill.trim())
            .filter(Boolean),
          note: isFieldEnabled('note') ? values.note || undefined : undefined,
          noticeVersion: job.noticeVersion,
          noticeAcceptedAt,
          accuracyConfirmedAt,
          ...(resumeBinding
            ? {
                resumeImportId: resumeBinding.importId,
                resumeDraftVersion: resumeBinding.draftVersion,
              }
            : {}),
        },
        publicHandle,
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
    setView('form');
    setFormStep('profile');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetDemo = () => {
    resumeRequestIdRef.current += 1;
    setValues(EMPTY_VALUES);
    setFileMeta(null);
    setFileError('');
    setResumeStatus('idle');
    setResumeNoticeAccepted(false);
    setResumeNoticeAcceptedAt('');
    setResumeImport(null);
    setResumeBinding(null);
    setResumeEdits({});
    setResumeBusyField(null);
    setReplaceRequested(false);
    setShowRejectAllConfirm(false);
    setMergeConflicts([]);
    setFormError('');
    setNoticeAccepted(false);
    setAccuracyConfirmed(false);
    setAccuracyConfirmedAt('');
    setNoticeAcceptedAt('');
    setReceipt(null);
    setSubmitError('');
    setCandidateSessionSaved(false);
    idempotencyKeyRef.current = createApplicationIdempotencyKey();
    resumeCreateKeyRef.current = createApplicationIdempotencyKey();
    candidateAccessTokenRef.current = createCandidateAccessToken();
    setView('form');
    setFormStep('resume');
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

  const allPreviewRows: Array<[keyof ApplicationValues, string, string]> = [
    ['fullName', 'Ad soyad', values.fullName],
    ['email', 'E-posta', values.email],
    ['phone', 'Telefon', values.phone],
    ['city', 'Şehir', values.city],
    ['linkedIn', 'LinkedIn', values.linkedIn || 'Eklenmedi'],
    ['portfolio', 'Portföy', values.portfolio || 'Eklenmedi'],
    ['summary', 'Profesyonel özet', values.summary],
    ['experience', 'Deneyim', values.experience],
    ['education', 'Eğitim', values.education],
    ['skills', 'Beceriler', values.skills],
    ['note', 'Ek not', values.note || 'Eklenmedi'],
  ];
  const previewRows = allPreviewRows.filter(([field]) => isFieldEnabled(field));
  const resumeProposals = resumeImport?.proposals ?? [];
  const allResumeProposalsReviewed =
    resumeProposals.length > 0 &&
    resumeProposals.every((proposal) =>
      ['ACCEPTED', 'EDITED', 'REJECTED'].includes(proposal.state),
    );
  const selectedResumeFields = resumeProposals.filter((proposal) =>
    ['ACCEPTED', 'EDITED'].includes(proposal.state),
  ).length;
  const currentStepId: FormStep | 'preview' | 'receipt' = view === 'form' ? formStep : view;
  const currentStepIndex = FORM_STEPS.findIndex((step) => step.id === currentStepId);

  return (
    <main
      className="min-h-screen bg-surface-subtle text-text-primary"
      data-testid="candidate-application-page"
    >
      <div className="border-b border-border-subtle bg-surface-default">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link
            to={jobsBase}
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

      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_260px] lg:py-10">
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

          <nav
            aria-label="Başvuru adımları"
            className="mb-6 rounded-2xl border border-border-subtle bg-surface-default p-3 shadow-xs"
          >
            <ol className="grid grid-cols-5 gap-1">
              {FORM_STEPS.map((step, index) => {
                const completed = currentStepIndex > index;
                const current = currentStepIndex === index;
                return (
                  <li key={step.id} className="min-w-0 text-center">
                    <div
                      className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold ${
                        completed || current
                          ? 'border-action-primary bg-action-primary text-action-primary-text'
                          : 'border-border-subtle bg-surface-muted text-text-secondary'
                      }`}
                      aria-hidden="true"
                    >
                      {completed ? '✓' : index + 1}
                    </div>
                    <span
                      className={`mt-1 block truncate text-[10px] font-semibold sm:text-xs ${
                        current ? 'text-text-primary' : 'text-text-secondary'
                      }`}
                      aria-current={current ? 'step' : undefined}
                    >
                      {step.label}
                    </span>
                  </li>
                );
              })}
            </ol>
          </nav>

          {view === 'form' ? (
            <form className="flex flex-col gap-5" onSubmit={openPreview} noValidate>
              {formStep === 'resume' ? (
                <>
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
                          PDF güvenli serviste geçici olarak işlenir. Hiçbir alan kendiliğinden
                          forma yazılmaz: her öneriyi kabul eder, düzenler veya reddedersiniz. Ham
                          PDF ve dosya adı kalıcı kayda alınmaz.
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
                        className="flex items-start gap-3 text-sm leading-6"
                        htmlFor="resume-import-notice"
                      >
                        <input
                          id="resume-import-notice"
                          type="checkbox"
                          checked={resumeNoticeAccepted}
                          disabled={Boolean(resumeImport)}
                          onChange={(event) => {
                            setResumeNoticeAccepted(event.target.checked);
                            setResumeNoticeAcceptedAt(
                              event.target.checked ? new Date().toISOString() : '',
                            );
                            setFileError('');
                          }}
                          className="mt-1 h-4 w-4 shrink-0"
                        />
                        <span>
                          CV içe aktarma aydınlatmasını okudum. Test ortamında yalnız sentetik veri
                          kullanacağımı; PDF’nin güvenlik taraması ve alan çıkarımı için geçici
                          olarak işleneceğini, ham dosyanın saklanmayacağını ve yalnız seçtiğim
                          alanların taslağa aktarılacağını anladım.
                          <span className="sr-only"> Sürüm: candidate-resume-import-v1</span>
                        </span>
                      </label>

                      {resumeStatus !== 'confirmed' ? (
                        <div className="mt-4 border-t border-border-subtle pt-4">
                          <label
                            className={`flex flex-col items-center gap-2 text-center ${
                              resumeNoticeAccepted &&
                              resumeStatus !== 'uploading' &&
                              (!resumeImport?.documentVersion || replaceRequested)
                                ? 'cursor-pointer'
                                : 'cursor-not-allowed opacity-60'
                            }`}
                            htmlFor="candidate-resume"
                          >
                            <span className="text-sm font-bold">
                              {replaceRequested ? 'Yeni PDF özgeçmiş seçin' : 'PDF özgeçmiş seçin'}
                            </span>
                            <span className="text-xs text-text-secondary">
                              En fazla 10 MB · yalnız PDF
                            </span>
                          </label>
                          <input
                            ref={fileInputRef}
                            id="candidate-resume"
                            data-testid="candidate-resume"
                            type="file"
                            accept="application/pdf,.pdf"
                            onChange={handleFileChange}
                            disabled={
                              !resumeNoticeAccepted ||
                              resumeStatus === 'uploading' ||
                              Boolean(resumeImport?.documentVersion && !replaceRequested)
                            }
                            className="mx-auto mt-3 block max-w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-action-primary file:px-4 file:py-2 file:font-semibold file:text-action-primary-text disabled:opacity-60"
                            aria-describedby="candidate-resume-boundary candidate-resume-error"
                          />
                        </div>
                      ) : null}
                      <p
                        id="candidate-resume-boundary"
                        className="mt-3 text-center text-xs text-text-secondary"
                      >
                        Test ortamında gerçek kişisel veri kullanmayın. Form, PDF işlenirken de elle
                        doldurulabilir; işleme hatası manuel başvuruyu engellemez.
                      </p>
                      {resumeStatus === 'uploading' ? (
                        <p
                          role="status"
                          aria-live="polite"
                          data-testid="candidate-resume-parsing"
                          className="mt-4 text-center text-sm font-semibold text-action-primary"
                        >
                          PDF güvenlik kontrolünden geçiriliyor ve alan önerileri hazırlanıyor…
                          Formu bu sırada elle doldurmaya devam edebilirsiniz.
                        </p>
                      ) : null}
                      {fileError ? (
                        <p
                          ref={fileErrorRef}
                          id="candidate-resume-error"
                          role="alert"
                          aria-live="assertive"
                          tabIndex={-1}
                          className="mt-3 rounded-xl border border-state-danger-border bg-state-danger-bg px-3 py-2 text-sm font-medium text-state-danger-text outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                        >
                          {fileError}
                        </p>
                      ) : null}

                      {resumeStatus === 'reviewing' && resumeImport ? (
                        <div className="mt-5" data-testid="candidate-resume-review">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <h3 className="text-base font-bold">CV alanlarını kontrol edin</h3>
                              <p className="mt-1 text-xs text-text-secondary">
                                {resumeProposals.length} öneri · korunan{' '}
                                {resumeImport.protectedSuppressed} çıktı aktarılmadı · dosya adı ve
                                ham PDF saklanmadı
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => void acceptAllSafeProposals()}
                              disabled={Boolean(resumeBusyField)}
                              className="rounded-xl border border-action-primary px-3 py-2 text-xs font-bold text-action-primary disabled:opacity-50"
                            >
                              Güvenli önerileri kabul et
                            </button>
                          </div>

                          <ul className="mt-4 flex flex-col gap-3" aria-label="CV alan önerileri">
                            {resumeProposals.map((proposal) => {
                              const needsControl = proposal.state === 'CONTROL_REQUIRED';
                              const savedValue = proposal.candidateValue ?? proposal.proposedValue;
                              const editedValue = resumeEdits[proposal.field] ?? savedValue;
                              const isBusy =
                                resumeBusyField === proposal.field || resumeBusyField === 'all';
                              return (
                                <li
                                  key={proposal.field}
                                  className="rounded-xl border border-border-subtle bg-surface-default p-4"
                                  data-testid={`resume-proposal-${proposal.field}`}
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div>
                                      <h4 className="text-sm font-bold">
                                        {FIELD_LABELS[proposal.field]}
                                      </h4>
                                      <p className="mt-1 text-xs text-text-secondary">
                                        Sayfa {proposal.provenance.page} · güven %
                                        {Math.round(proposal.provenance.confidence * 100)} · metin
                                        konumu doğrulandı
                                      </p>
                                    </div>
                                    <span className="rounded-full border border-border-subtle px-2.5 py-1 text-xs font-bold">
                                      {proposal.state === 'UNREVIEWED'
                                        ? 'Karar bekliyor'
                                        : proposal.state === 'CONTROL_REQUIRED'
                                          ? 'Elle kontrol gerekli'
                                          : proposal.state === 'ACCEPTED'
                                            ? 'Kabul edildi'
                                            : proposal.state === 'EDITED'
                                              ? 'Düzenlendi'
                                              : 'Reddedildi'}
                                    </span>
                                  </div>
                                  <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-surface-subtle px-3 py-2 text-sm">
                                    {proposal.proposedValue}
                                  </p>
                                  <label
                                    className="mt-3 block text-xs font-bold"
                                    htmlFor={`resume-edit-${proposal.field}`}
                                  >
                                    Aday tarafından düzenlenebilir değer
                                  </label>
                                  <textarea
                                    id={`resume-edit-${proposal.field}`}
                                    value={editedValue}
                                    onChange={(event) =>
                                      setResumeEdits((current) => ({
                                        ...current,
                                        [proposal.field]: event.target.value,
                                      }))
                                    }
                                    rows={
                                      proposal.field === 'experience' ||
                                      proposal.field === 'education'
                                        ? 3
                                        : 2
                                    }
                                    disabled={isBusy}
                                    className={`${inputClassName} mt-1`}
                                  />
                                  {needsControl ? (
                                    <p className="mt-2 text-xs font-semibold text-state-warning-text">
                                      Bu alan düşük güven nedeniyle aynen kabul edilemez; düzenleyin
                                      veya reddedin.
                                    </p>
                                  ) : null}
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {!needsControl ? (
                                      <button
                                        type="button"
                                        onClick={() => void decideResumeField(proposal, 'ACCEPTED')}
                                        disabled={isBusy}
                                        className="rounded-lg bg-action-primary px-3 py-2 text-xs font-bold text-action-primary-text disabled:opacity-50"
                                      >
                                        Öneriyi kabul et
                                      </button>
                                    ) : null}
                                    <button
                                      type="button"
                                      onClick={() => void decideResumeField(proposal, 'EDITED')}
                                      disabled={isBusy || !editedValue.trim()}
                                      className="rounded-lg border border-action-primary px-3 py-2 text-xs font-bold text-action-primary disabled:opacity-50"
                                    >
                                      Düzenlediğimi kaydet
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void decideResumeField(proposal, 'REJECTED')}
                                      disabled={isBusy}
                                      className="rounded-lg border border-border-strong px-3 py-2 text-xs font-bold disabled:opacity-50"
                                    >
                                      Reddet
                                    </button>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>

                          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                            <button
                              type="button"
                              onClick={() => void confirmReviewedResume()}
                              disabled={
                                !allResumeProposalsReviewed ||
                                selectedResumeFields === 0 ||
                                Boolean(resumeBusyField)
                              }
                              className="min-h-11 flex-1 rounded-xl bg-action-primary px-4 py-2 text-sm font-bold text-action-primary-text disabled:cursor-not-allowed disabled:opacity-45"
                            >
                              Seçtiğim alanları forma aktar ({selectedResumeFields})
                            </button>
                            <button
                              type="button"
                              onClick={() => setReplaceRequested(true)}
                              disabled={Boolean(resumeBusyField)}
                              className="rounded-xl border border-border-strong px-4 py-2 text-sm font-bold disabled:opacity-50"
                            >
                              PDF’yi değiştir
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowRejectAllConfirm(true)}
                              disabled={Boolean(resumeBusyField)}
                              className="rounded-xl border border-border-strong px-4 py-2 text-sm font-bold disabled:opacity-50"
                            >
                              Tümünü reddet
                            </button>
                          </div>
                          {!allResumeProposalsReviewed ? (
                            <p className="mt-2 text-xs text-text-secondary">
                              Forma aktarmadan önce her alan için kabul, düzenleme veya ret kararı
                              verin.
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      {showRejectAllConfirm ? (
                        <div
                          role="alertdialog"
                          aria-labelledby="reject-all-title"
                          className="mt-4 rounded-xl border border-state-warning-border bg-state-warning-bg p-4"
                        >
                          <h3 id="reject-all-title" className="text-sm font-bold">
                            Tüm CV önerileri reddedilsin mi?
                          </h3>
                          <p className="mt-1 text-sm text-text-secondary">
                            Geçici öneriler silinir; formu elle doldurmaya devam edebilirsiniz.
                          </p>
                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              onClick={() => void discardResume('REJECT_ALL')}
                              className="rounded-lg bg-text-primary px-3 py-2 text-xs font-bold text-white"
                            >
                              Evet, tümünü reddet
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowRejectAllConfirm(false)}
                              className="rounded-lg border border-border-strong px-3 py-2 text-xs font-bold"
                            >
                              Vazgeç
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {resumeStatus === 'confirmed' && fileMeta ? (
                        <div
                          role="status"
                          aria-live="polite"
                          data-testid="candidate-resume-meta"
                          className="mt-4 rounded-xl border border-state-success-border bg-state-success-bg px-4 py-3 text-sm font-medium text-state-success-text"
                        >
                          CV kararları kaydedildi; {fileMeta.importedFieldCount} alan forma
                          aktarıldı · {formatBytes(fileMeta.size)} geçici işlendi · dosya adı ve ham
                          PDF tutulmadı.
                        </div>
                      ) : null}

                      {mergeConflicts.length > 0 ? (
                        <div
                          className="mt-4 rounded-xl border border-state-warning-border bg-state-warning-bg p-4"
                          data-testid="resume-merge-conflicts"
                        >
                          <h3 className="text-sm font-bold">
                            Dolu alanlar için hangi değer kullanılsın?
                          </h3>
                          <p className="mt-1 text-xs text-text-secondary">
                            Mevcut bilgileriniz sessizce değiştirilmez.
                          </p>
                          <ul className="mt-3 flex flex-col gap-4">
                            {mergeConflicts.map((conflict, index) => (
                              <li
                                key={conflict.field}
                                className="rounded-lg bg-surface-default p-3"
                              >
                                <p className="text-sm font-bold">{FIELD_LABELS[conflict.field]}</p>
                                <label className="mt-2 flex items-start gap-2 text-sm">
                                  <input
                                    type="radio"
                                    name={`merge-${conflict.field}`}
                                    checked={conflict.choice === 'manual'}
                                    onChange={() =>
                                      setMergeConflicts((current) =>
                                        current.map((item, itemIndex) =>
                                          itemIndex === index
                                            ? { ...item, choice: 'manual' }
                                            : item,
                                        ),
                                      )
                                    }
                                  />
                                  <span>
                                    <strong>Mevcut değeri koru:</strong> {conflict.manualValue}
                                  </span>
                                </label>
                                <label className="mt-2 flex items-start gap-2 text-sm">
                                  <input
                                    type="radio"
                                    name={`merge-${conflict.field}`}
                                    checked={conflict.choice === 'resume'}
                                    onChange={() =>
                                      setMergeConflicts((current) =>
                                        current.map((item, itemIndex) =>
                                          itemIndex === index
                                            ? { ...item, choice: 'resume' }
                                            : item,
                                        ),
                                      )
                                    }
                                  />
                                  <span>
                                    <strong>CV değerini kullan:</strong> {conflict.resumeValue}
                                  </span>
                                </label>
                                <label className="mt-2 flex items-start gap-2 text-sm">
                                  <input
                                    type="radio"
                                    name={`merge-${conflict.field}`}
                                    checked={conflict.choice === 'edit'}
                                    onChange={() =>
                                      setMergeConflicts((current) =>
                                        current.map((item, itemIndex) =>
                                          itemIndex === index ? { ...item, choice: 'edit' } : item,
                                        ),
                                      )
                                    }
                                  />
                                  <span>
                                    <strong>Birleştirip düzenle</strong>
                                  </span>
                                </label>
                                {conflict.choice === 'edit' ? (
                                  <div className="mt-2">
                                    <label
                                      className="text-xs font-bold"
                                      htmlFor={`merge-edit-${conflict.field}`}
                                    >
                                      Birleşik değer
                                    </label>
                                    <textarea
                                      id={`merge-edit-${conflict.field}`}
                                      value={conflict.mergedValue}
                                      onChange={(event) =>
                                        setMergeConflicts((current) =>
                                          current.map((item, itemIndex) =>
                                            itemIndex === index
                                              ? { ...item, mergedValue: event.target.value }
                                              : item,
                                          ),
                                        )
                                      }
                                      rows={3}
                                      className={`${inputClassName} mt-1`}
                                    />
                                  </div>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                          <button
                            type="button"
                            onClick={applyMergeChoices}
                            disabled={mergeConflicts.some((conflict) => conflict.choice === null)}
                            className="mt-4 rounded-xl bg-action-primary px-4 py-2 text-sm font-bold text-action-primary-text disabled:opacity-45"
                          >
                            Seçimleri forma uygula
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </section>
                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <Link
                      to={jobsBase}
                      className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-subtle bg-surface-default px-4 text-sm font-bold text-text-primary"
                    >
                      İlana geri dön
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setFormError('');
                        setFormStep('contact');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="inline-flex min-h-11 items-center justify-center rounded-xl bg-action-primary px-5 text-sm font-bold text-action-primary-text"
                    >
                      {resumeBinding ? 'Bilgilerimi kontrol et' : 'CV olmadan devam et'}
                    </button>
                  </div>
                </>
              ) : null}

              {formStep === 'contact' ? (
                <>
                  <section className={sectionClassName} aria-labelledby="contact-heading">
                    <div className="mb-5">
                      <p className="text-xs font-bold uppercase tracking-wider text-action-primary">
                        Adım 2 · Aday bilgileri
                      </p>
                      <h2 id="contact-heading" className="mt-1 text-xl font-bold">
                        Size nasıl ulaşalım?
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-text-secondary">
                        CV’den gelen alanları kontrol edin; her bilgiyi göndermeden önce
                        değiştirebilirsiniz.
                      </p>
                      {resumeBinding && fileMeta ? (
                        <p
                          role="status"
                          data-testid="candidate-resume-meta"
                          className="mt-3 rounded-xl border border-state-success-border bg-state-success-bg px-4 py-3 text-sm font-semibold text-state-success-text"
                        >
                          CV’den dolduruldu: {fileMeta.importedFieldCount} alan forma aktarıldı. Ham
                          PDF ve dosya adı saklanmadı.
                        </p>
                      ) : null}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {renderField('fullName', 'Ad soyad', {
                        required: true,
                        autoComplete: 'name',
                      })}
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
                      {renderField('city', 'Şehir', {
                        required: true,
                        autoComplete: 'address-level2',
                      })}
                      {isFieldEnabled('linkedIn')
                        ? renderField('linkedIn', 'LinkedIn', {
                            type: 'url',
                            placeholder: 'https://linkedin.com/in/...',
                          })
                        : null}
                      {isFieldEnabled('portfolio')
                        ? renderField('portfolio', 'Portföy / kişisel site', {
                            type: 'url',
                            placeholder: 'https://...',
                          })
                        : null}
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
                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setFormError('');
                        setFormStep('resume');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-subtle bg-surface-default px-4 text-sm font-bold text-text-primary"
                    >
                      CV adımına dön
                    </button>
                    <button
                      type="button"
                      onClick={openProfileStep}
                      className="inline-flex min-h-11 items-center justify-center rounded-xl bg-action-primary px-5 text-sm font-bold text-action-primary-text"
                    >
                      Deneyim bilgilerime devam et
                    </button>
                  </div>
                </>
              ) : null}

              {formStep === 'profile' ? (
                <>
                  <section className={sectionClassName} aria-labelledby="profile-heading">
                    <div className="mb-5">
                      <p className="text-xs font-bold uppercase tracking-wider text-action-primary">
                        Adım 3 · Profil
                      </p>
                      <h2 id="profile-heading" className="mt-1 text-xl font-bold">
                        Deneyiminizi anlatın
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-text-secondary">
                        Kısa, işle ilgili ve doğrulayabildiğiniz bilgileri girin. Sonraki adımda
                        başvurunun tamamını göreceksiniz.
                      </p>
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
                      {renderTextArea(
                        'education',
                        'Eğitim',
                        'Okul · Bölüm · Mezuniyet yılı',
                        true,
                        3,
                      )}
                      {renderTextArea('skills', 'Beceriler', 'Virgülle ayırabilirsiniz', true, 3)}
                      {isFieldEnabled('note')
                        ? renderTextArea(
                            'note',
                            'Bu role neden başvuruyorsunuz?',
                            'İsteğe bağlı kısa not',
                            false,
                            4,
                          )
                        : null}
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
                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setFormError('');
                        setFormStep('contact');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-subtle bg-surface-default px-4 text-sm font-bold text-text-primary"
                    >
                      İletişim bilgilerime dön
                    </button>
                    <button
                      type="submit"
                      disabled={resumeStatus === 'uploading' || mergeConflicts.length > 0}
                      className="inline-flex min-h-12 items-center justify-center rounded-xl bg-action-primary px-5 py-3 text-sm font-bold text-action-primary-text shadow-sm hover:opacity-90 focus:outline-hidden focus:ring-2 focus:ring-selection-outline focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      Başvuruyu kontrol et
                    </button>
                  </div>
                </>
              ) : null}
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
                {previewRows.map(([field, label, value]) => (
                  <div
                    key={field}
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
                    {resumeBinding && fileMeta
                      ? `${fileMeta.importedFieldCount} aday kontrollü alan aktarıldı · ham PDF ve dosya adı başvuruyla gönderilmez`
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
                    anladım. <span className="sr-only">Sürüm: {job?.noticeVersion}</span>
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
                Form alanları kalıcı test başvurusu olarak kaydedilir. Ham PDF ve geçici öneriler
                kalıcı başvuruya eklenmez.
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
              {fileMeta ? (
                <p className="mx-auto mt-3 max-w-xl rounded-xl border border-state-info-border bg-state-info-bg px-4 py-3 text-sm leading-6 text-text-primary">
                  PDF’nin ham içeriği başvuruya eklenmedi; yalnız kontrol edip seçtiğiniz ve son
                  formda doğruladığınız alanlar kaydedildi.
                </p>
              ) : null}
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
              <li>• Formdaki bütün özgeçmiş alanlarını değiştirebilirsiniz.</li>
              <li>• CV önerileri yalnız alan bazlı kararınızdan sonra forma geçer.</li>
              <li>• PDF ve dosya adı kalıcı kayda alınmaz.</li>
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
