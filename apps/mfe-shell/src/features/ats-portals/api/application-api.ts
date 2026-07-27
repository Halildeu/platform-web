import { api } from '@mfe/shared-http';

export const ATS_API_BASE = '/api/ats/v1';
export const APPLICATION_NOTICE_VERSION = 'kvkk-application-v1' as const;
export const RESUME_IMPORT_NOTICE_VERSION = 'candidate-resume-import-v1' as const;
const CANDIDATE_SESSION_KEY = 'ats.candidate.latest.v1';
/**
 * #235 e-posta girişi oturumu. Başvuru-başına anahtardan AYRI tutulur: biri
 * tek başvuruyu açar, diğeri o adresin tümünü. Aynı kutuya yazmak, e-posta
 * girişinden çıkmanın elle girilen anahtarı da silmesine yol açardı.
 */
const EMAIL_LOGIN_SESSION_KEY = 'ats.candidate.emailLogin.v1';
const PUBLIC_REF_PATTERN = /^app_[A-Za-z0-9_-]{24}$/u;
const INTERVIEW_ID_PATTERN = /^int_[A-Za-z0-9_-]{24}$/u;
const OFFER_ID_PATTERN = /^off_[A-Za-z0-9_-]{24}$/u;
const CANDIDATE_ACCESS_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const LOGIN_CODE_PATTERN = /^[0-9]{6}$/u;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/u;
const PUBLIC_HANDLE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+){0,7}$/u;
const PUBLIC_JOB_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+){0,15}$/u;

export type ApplicationFieldKey =
  | 'fullName'
  | 'email'
  | 'phone'
  | 'city'
  | 'linkedIn'
  | 'portfolio'
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'note';

/**
 * CV ayrıştırıcı, başvuru formunun taşıdığı alanlardan fazlasını çıkarabilir:
 * backend `ResumeField` enum'ı `languages` ve `certifications` da yayar. Öneri
 * DTO'su `ApplicationFieldKey` ile tiplendiği sürece bu ikisi tipte yok sayılıyor
 * ve arayüzde başlıksız kart olarak görünüyordu.
 */
export type ResumeFieldKey = ApplicationFieldKey | 'languages' | 'certifications';

/**
 * Ayrıştırıcının çıkardığı ama başvuru formunda karşılığı olmayan alanlar.
 *
 * ats#215 B ile BOŞ: form artık `languages` ve `certifications` alanlarını da
 * taşıyor, dolayısıyla kabul edilen öneri sessizce düşmüyor. Liste kaldırılmadı
 * çünkü sözleşme asimetrisi kalıcı bir olasılık: backend `ResumeField` enum'ı
 * forma eklenmemiş yeni bir alan yayarsa, o alanın adı buraya yazılır ve arayüz
 * adaya "bu bilgi CV'nizde kaldı" uyarısını gösterir. Boş liste, uyarı yolunun
 * ölü kod olmadığını ama şu an tetiklenmediğini anlatır.
 */
export const RESUME_ONLY_FIELDS: readonly ResumeFieldKey[] = [];

/**
 * ats#215: tek bir iş deneyimi girdisi. Tarihler serbest metin — aday "2022",
 * "Eyl 2018", "Devam ediyor" yazabilir; ISO tarihe zorlamak gerçek CV'lerdeki
 * yazımı reddederdi. Uzunluk sınırları backend `ExperienceEntryBody` şemasıyla
 * birebir aynıdır (title/company 160, tarih 40, açıklama 4000).
 */
export type ApplicationExperienceEntry = {
  title?: string;
  company?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
};

/** ats#215: tek bir eğitim girdisi; sınırlar backend `EducationEntryBody` ile aynı. */
export type ApplicationEducationEntry = {
  school?: string;
  degree?: string;
  field?: string;
  startYear?: string;
  endYear?: string;
  description?: string;
};

/**
 * Girdi başına alan uzunlukları ve satır sayısı üst sınırı — backend şemasının
 * aynadaki karşılığı. Burada tutulur ki arayüz sınırı aşan metni sunucuya
 * gönderip 400 almak yerine yazarken kısıtlayabilsin. Otorite yine backend'dir.
 */
export const APPLICATION_ENTRY_LIMITS = {
  maxEntries: 30,
  shortText: 160,
  dateText: 40,
  longText: 4000,
  languages: 2000,
  certifications: 4000,
} as const;

export const REQUIRED_APPLICATION_FIELDS: ApplicationFieldKey[] = [
  'fullName',
  'email',
  'phone',
  'city',
  'summary',
  'experience',
  'education',
  'skills',
];

export const DEFAULT_APPLICATION_FIELDS: ApplicationFieldKey[] = [
  'fullName',
  'email',
  'phone',
  'city',
  'linkedIn',
  'portfolio',
  'summary',
  'experience',
  'education',
  'skills',
  'note',
];

export type PublicJobDto = {
  slug: string;
  title: string;
  team: string;
  location: string;
  mode: string;
  employmentType: string;
  summary: string;
  highlights: string[];
  applicationFields: ApplicationFieldKey[];
  noticeVersion: typeof APPLICATION_NOTICE_VERSION;
};

export type ApplicationSubmissionDto = {
  fullName: string;
  email: string;
  phone: string;
  city: string;
  linkedIn?: string;
  portfolio?: string;
  summary: string;
  /**
   * ats#215 genişlet/daralt: eski tek-string biçim artık ZORUNLU DEĞİL. Yapısal
   * girdi gönderen istemci bunu atlar, backend `experience`i girdilerden türetir
   * (İK görünümü, export ve DSAR yüzeyleri değişmez). İki temsilden en az biri
   * gerekir; hangisinin geldiğini backend doğrular.
   */
  experience?: string;
  education?: string;
  skills: string[];
  experienceEntries?: ApplicationExperienceEntry[];
  educationEntries?: ApplicationEducationEntry[];
  languages?: string;
  certifications?: string;
  note?: string;
  noticeVersion: typeof APPLICATION_NOTICE_VERSION;
  noticeAcceptedAt: string;
  accuracyConfirmedAt: string;
  resumeImportId?: string;
  resumeDraftVersion?: number;
};

export type ResumeProposalState =
  | 'UNREVIEWED'
  | 'ACCEPTED'
  | 'EDITED'
  | 'REJECTED'
  | 'CONTROL_REQUIRED';

export type ResumeProposalDto = {
  field: ResumeFieldKey;
  proposedValue: string;
  candidateValue: string | null;
  state: ResumeProposalState;
  version: number;
  provenance: {
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
    parserVersion: string;
  };
};

export type ResumeImportDto = {
  importId: string;
  jobSlug: string;
  state: 'ACTIVE' | 'CONFIRMED' | 'CANCELLED' | 'REJECT_ALL' | 'EXPIRED' | 'FAILED' | 'SUPERSEDED';
  version: number;
  documentVersion: number;
  noticeVersion: typeof RESUME_IMPORT_NOTICE_VERSION;
  noticeAcceptedAt: string;
  uploadExpiresAt: string;
  firstUploadAt: string | null;
  expiresAt: string | null;
  parserVersion: string | null;
  protectedSuppressed: number;
  unsupportedOutput: number;
  createdAt: string;
  updatedAt: string;
  purgedAt: string | null;
  proposals: ResumeProposalDto[];
};

export type ResumeDraftDto = {
  draftId: string;
  importId: string;
  version: number;
  /**
   * Onaylanan taslak, kabul edilen her öneriyi taşır — ve backend `ResumeField`
   * enum'ı `languages`/`certifications` da yayar. Tip burada `ApplicationFieldKey`
   * ile daraltılmıştı; bu, gelen iki alanı derleme zamanında görünmez yapıyordu
   * (aday alanı kabul ediyor, taslakta geliyor, forma hiç düşmüyordu). ats#215 B.
   */
  fields: Partial<Record<ResumeFieldKey, string>>;
  createdAt: string;
  /**
   * #218: alan başına YAPISAL kayıtlar. Anahtar YOKSA o alan için gruplama yok
   * ve tüketici `fields`'a (tek blob) düşer — anahtarın yokluğu ile boş dizi
   * AYNI ŞEY DEĞİL, backend bu ayrımı `NULL` ile taşıyor.
   *
   * OPSİYONEL olmak zorunda: bu alanı `ats#224` ekledi ve ondan ÖNCEKİ backend
   * sürümü yanıtta hiç göndermiyor. Frontend backend promosyonundan önce inerse
   * zorunlu okuma çökerdi — aynı hata `#1019`'da İK panelini canlıda çökertecekti.
   */
  entries?: Partial<Record<ResumeFieldKey, ResumeProposedEntryDto[]>>;
};

/**
 * #218: bir bölümden gruplanan TEK kayıt. Alan adları jenerik — aynı şekil hem
 * deneyimi (unvan) hem eğitimi (okul) taşır. `subtitle` (şirket/bölüm) ölçümde
 * ayırt edici sinyal bulunamadığı için boş gelir; tahmin edilmiş veri yerine
 * boş bırakılıyor.
 */
export type ResumeProposedEntryDto = {
  title: string;
  subtitle: string;
  dateText: string;
  description: string;
};

export type ResumeImportConfirmDto = {
  resumeImport: ResumeImportDto;
  draft: ResumeDraftDto;
};

export type ApplicationReceiptDto = {
  publicRef: string;
  candidateAccessToken: string | null;
  status: ApplicationStatus;
  version: number;
  submittedAt: string;
  replayed: boolean;
};

export type CandidateStatusDto = {
  publicRef: string;
  jobSlug: string;
  jobTitle: string;
  status: ApplicationStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  nextAction:
    | 'WAIT_FOR_REVIEW'
    | 'PREPARE_FOR_INTERVIEW'
    | 'REVIEW_OFFER'
    | 'WAIT_FOR_HIRE_CONFIRMATION'
    | 'NONE';
  withdrawalAllowed: boolean;
  history: Array<{
    status: ApplicationStatus;
    occurredAt: string;
  }>;
};

export type ApplicationStatus =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'INTERVIEW_PENDING'
  | 'OFFER_PENDING'
  | 'OFFER_ACCEPTED'
  | 'OFFER_DECLINED'
  | 'OFFER_WITHDRAWN'
  | 'HIRED'
  | 'REJECTED'
  | 'WITHDRAWN';

export type RecruiterApplicationSummaryDto = {
  publicRef: string;
  jobSlug: string;
  jobTitle: string;
  fullName: string;
  email: string;
  city: string;
  skills: string[];
  status: ApplicationStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type RecruiterApplicationDto = {
  publicRef: string;
  jobSlug: string;
  jobTitle: string;
  fullName: string;
  email: string;
  phone: string;
  city: string;
  linkedIn: string | null;
  portfolio: string | null;
  summary: string;
  experience: string;
  education: string;
  /**
   * ats#215 C: yapısal girdiler. Aday #215 B'den beri bunları gönderiyor ve
   * artık İK okuma yolunda da var. BOŞ olabilir — girdisiz gönderilmiş eski
   * başvurular ya da yalnız metin gönderen istemciler için; o durumda yukarıdaki
   * tek-string alan tek otoritedir.
   */
  experienceEntries: ApplicationExperienceEntry[];
  educationEntries: ApplicationEducationEntry[];
  languages: string | null;
  certifications: string | null;
  skills: string[];
  note: string | null;
  status: ApplicationStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type RecruiterApplicationHistoryEventDto = {
  eventId: number;
  fromStatus: ApplicationStatus | null;
  toStatus: ApplicationStatus;
  actorRef: string;
  occurredAt: string;
};

export type RecruiterEvaluationRecommendation = 'ADVANCE' | 'HOLD' | 'NO_HIRE';

export type RecruiterEvaluationCriterionDto = {
  key: string;
  label: string;
  rating: number;
  evidence: string;
};

export type RecruiterApplicationEvaluationDto = {
  evaluationId: string;
  actorRef: string;
  policyVersion: 'structured-evaluation-v1';
  jobRelatednessConfirmed: boolean;
  recommendation: RecruiterEvaluationRecommendation;
  criteria: RecruiterEvaluationCriterionDto[];
  summary: string;
  predecessorEvaluationId: string | null;
  revision: number;
  createdAt: string;
};

export type RecruiterApplicationEvaluationRequest = {
  policyVersion: 'structured-evaluation-v1';
  jobRelatednessConfirmed: true;
  recommendation: RecruiterEvaluationRecommendation;
  criteria: RecruiterEvaluationCriterionDto[];
  summary: string;
  predecessorEvaluationId?: string;
};

/**
 * #226: aynı adayın DİĞER başvurusu. Ölçüldü — aynı e-postayla aynı ilana
 * sınırsız başvurulabiliyor ve İK bunu hiçbir yerde göremiyordu.
 */
export type RecruiterCandidateOtherApplicationDto = {
  publicRef: string;
  jobSlug: string;
  jobTitle: string;
  status: ApplicationStatus;
  submittedAt: string;
  /** Aynı ilana ikinci başvuru mu — İK'nın asıl sorduğu bu. */
  sameJob: boolean;
};

export type RecruiterApplicationDetailDto = {
  application: RecruiterApplicationDto;
  history: RecruiterApplicationHistoryEventDto[];
  evaluations: RecruiterApplicationEvaluationDto[];
  /**
   * #226 aynı adayın diğer başvuruları.
   *
   * OPSİYONEL olmak zorunda: bu alanı `ats#229` ekledi ve ondan ÖNCEKİ backend
   * sürümü yanıtta hiç göndermiyor. Zorunlu okuma, frontend backend
   * promosyonundan önce inerse İK panelini CANLIDA çökertirdi — `#1019`'da
   * tam bu olacaktı.
   */
  otherApplications?: RecruiterCandidateOtherApplicationDto[];
};

export type RecruiterApplicationPageDto = {
  items: RecruiterApplicationSummaryDto[];
  page: number;
  size: number;
  total: number;
};

export type InterviewType = 'SCREENING' | 'TECHNICAL' | 'BEHAVIORAL' | 'PANEL' | 'FINAL';
export type InterviewMode = 'VIDEO' | 'PHONE' | 'ONSITE';
export type InterviewStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
export type InterviewParticipantRole = 'LEAD' | 'INTERVIEWER';
export type InterviewRecommendation = 'ADVANCE' | 'HOLD' | 'NO_HIRE';

export type InterviewParticipantDto = {
  actorRef: string;
  displayLabel: string;
  role: InterviewParticipantRole;
};

export type InterviewCriterionDto = {
  key: string;
  label: string;
  question: string;
  evidencePrompt: string;
};

export type InterviewScorecardDto = {
  scorecardId: string;
  interviewId: string;
  actorRef: string;
  participantLabel: string;
  policyVersion: 'structured-interview-v1';
  jobRelatednessConfirmed: boolean;
  recommendation: InterviewRecommendation;
  ratings: Array<{ criterionKey: string; rating: number; evidence: string }>;
  summary: string;
  predecessorScorecardId: string | null;
  revision: number;
  createdAt: string;
};

export type InterviewScheduleRevisionDto = {
  version: number;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  mode: InterviewMode;
  location: string;
  status: InterviewStatus;
  reason: string;
  actorRef: string;
  occurredAt: string;
};

export type RecruiterInterviewWorkspaceDto = {
  interviewId: string;
  applicationPublicRef: string;
  jobSlug: string;
  jobTitle: string;
  candidateName: string;
  type: InterviewType;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  mode: InterviewMode;
  location: string;
  status: InterviewStatus;
  version: number;
  participants: InterviewParticipantDto[];
  criteria: InterviewCriterionDto[];
  scorecards: InterviewScorecardDto[];
  scheduleHistory: InterviewScheduleRevisionDto[];
  createdAt: string;
  updatedAt: string;
};

export type CandidateInterviewDto = Pick<
  RecruiterInterviewWorkspaceDto,
  | 'interviewId'
  | 'type'
  | 'startsAt'
  | 'endsAt'
  | 'timeZone'
  | 'mode'
  | 'location'
  | 'status'
  | 'updatedAt'
>;

export type CreateInterviewRequest = {
  type: InterviewType;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  mode: InterviewMode;
  location: string;
  participants: InterviewParticipantDto[];
  criteria: InterviewCriterionDto[];
};

export type InterviewScorecardRequest = {
  policyVersion: 'structured-interview-v1';
  jobRelatednessConfirmed: true;
  recommendation: InterviewRecommendation;
  ratings: Array<{ criterionKey: string; rating: number; evidence: string }>;
  summary: string;
  predecessorScorecardId?: string;
};

export type OfferStatus = 'DRAFT' | 'EXTENDED' | 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN' | 'HIRED';
export type OfferPayPeriod = 'HOURLY' | 'MONTHLY' | 'ANNUAL';
export type OfferWorkMode = 'REMOTE' | 'HYBRID' | 'ONSITE';

export type OfferTermsDto = {
  roleTitle: string;
  startDate: string;
  employmentType: string;
  workMode: OfferWorkMode;
  location: string;
  compensationAmount: number;
  currency: string;
  payPeriod: OfferPayPeriod;
  expiresAt: string;
  termsSummary: string;
};

export type RecruiterOfferRevisionDto = OfferTermsDto & {
  version: number;
  status: OfferStatus;
  reason: string;
  actorRef: string;
  occurredAt: string;
};

export type RecruiterOfferWorkspaceDto = OfferTermsDto & {
  offerId: string;
  applicationPublicRef: string;
  jobSlug: string;
  jobTitle: string;
  candidateName: string;
  status: OfferStatus;
  version: number;
  revisions: RecruiterOfferRevisionDto[];
  createdAt: string;
  updatedAt: string;
};

export type CandidateOfferDto = OfferTermsDto & {
  offerId: string;
  applicationPublicRef: string;
  jobTitle: string;
  status: Exclude<OfferStatus, 'DRAFT'>;
  version: number;
  updatedAt: string;
  legalBoundary: string;
};

export type RecruiterJobStatus = 'DRAFT' | 'PUBLISHED' | 'PAUSED' | 'CLOSED' | 'ARCHIVED';

export type RecruiterJobDto = PublicJobDto & {
  jobId: string;
  publicHandle: string | null;
  status: RecruiterJobStatus;
  applyEnabled: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type RecruiterJobDraftDto = {
  slug?: string;
  title: string;
  team: string;
  location: string;
  mode: string;
  employmentType: string;
  summary: string;
  highlights: string[];
  applicationFields: ApplicationFieldKey[];
  noticeVersion: typeof APPLICATION_NOTICE_VERSION;
};

export type CandidateSession = {
  publicRef: string;
  candidateAccessToken: string;
};

const safeJson = async <T>(response: Response): Promise<T> => {
  const payload = (await response.json().catch(() => null)) as
    | (T & { reason?: string; error?: string })
    | null;
  if (!response.ok) {
    const retry = response.status === 429 ? ' Birkaç dakika sonra yeniden deneyin.' : '';
    const reason =
      response.status >= 500
        ? 'Servis geçici olarak kullanılamıyor.'
        : (payload?.reason ?? payload?.error ?? 'İşlem tamamlanamadı.');
    throw new Error(`${reason}${retry}`);
  }
  if (!payload) throw new Error('Sunucu boş yanıt verdi.');
  return payload;
};

const publicJobsPath = (publicHandle?: string): string => {
  if (!publicHandle) return `${ATS_API_BASE}/jobs`;
  if (!PUBLIC_HANDLE_PATTERN.test(publicHandle)) throw new Error('Kariyer adresi geçersiz.');
  return `${ATS_API_BASE}/careers/${encodeURIComponent(publicHandle)}/jobs`;
};

const publicJobPath = (jobSlug: string, publicHandle?: string): string => {
  if (jobSlug.length > 120 || !PUBLIC_JOB_SLUG_PATTERN.test(jobSlug)) {
    throw new Error('İlan adresi geçersiz.');
  }
  return `${publicJobsPath(publicHandle)}/${encodeURIComponent(jobSlug)}`;
};

export const listPublicJobs = async (publicHandle?: string): Promise<PublicJobDto[]> => {
  const response = await fetch(publicJobsPath(publicHandle), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  });
  const jobs = await safeJson<PublicJobDto[]>(response);
  jobs.forEach((job) => publicJobPath(job.slug, publicHandle));
  return jobs;
};

export const getPublicJob = async (
  jobSlug: string,
  publicHandle?: string,
): Promise<PublicJobDto> => {
  const response = await fetch(publicJobPath(jobSlug, publicHandle), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  });
  const job = await safeJson<PublicJobDto>(response);
  if (job.noticeVersion !== APPLICATION_NOTICE_VERSION) {
    throw new Error(
      'Başvuru aydınlatma metni sürümü doğrulanamadı; bu ilan için başvuru geçici olarak kapalıdır.',
    );
  }
  return job;
};

export const submitApplication = async (
  jobSlug: string,
  idempotencyKey: string,
  candidateAccessToken: string,
  submission: ApplicationSubmissionDto,
  publicHandle?: string,
): Promise<ApplicationReceiptDto> => {
  if (
    !IDEMPOTENCY_PATTERN.test(idempotencyKey) ||
    !CANDIDATE_ACCESS_PATTERN.test(candidateAccessToken)
  ) {
    throw new Error('Güvenli başvuru oturumu geçersiz; sayfayı yenileyip yeniden deneyin.');
  }
  const response = await fetch(`${publicJobPath(jobSlug, publicHandle)}/applications`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-ATS-Idempotency-Key': idempotencyKey,
      'X-ATS-Candidate-Access': candidateAccessToken,
    },
    credentials: 'same-origin',
    body: JSON.stringify(submission),
  });
  return safeJson<ApplicationReceiptDto>(response);
};

const candidateResumePath = (importId: string): string =>
  `${ATS_API_BASE}/candidate/resume-imports/${encodeURIComponent(importId)}`;

const candidateHeaders = (candidateAccessToken: string): Record<string, string> => {
  if (!CANDIDATE_ACCESS_PATTERN.test(candidateAccessToken)) {
    throw new Error('Güvenli CV oturumu geçersiz; sayfayı yenileyip yeniden deneyin.');
  }
  return { 'X-ATS-Candidate-Access': candidateAccessToken };
};

export const createResumeImport = async (
  jobSlug: string,
  idempotencyKey: string,
  candidateAccessToken: string,
  noticeAcceptedAt: string,
  publicHandle?: string,
): Promise<ResumeImportDto> => {
  if (!IDEMPOTENCY_PATTERN.test(idempotencyKey))
    throw new Error('Güvenli CV işlem anahtarı geçersiz.');
  const response = await fetch(`${publicJobPath(jobSlug, publicHandle)}/resume-imports`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...candidateHeaders(candidateAccessToken),
      'X-ATS-Idempotency-Key': idempotencyKey,
    },
    credentials: 'same-origin',
    body: JSON.stringify({
      noticeVersion: RESUME_IMPORT_NOTICE_VERSION,
      noticeAcceptedAt,
    }),
  });
  return safeJson<ResumeImportDto>(response);
};

export const getResumeImport = async (
  importId: string,
  candidateAccessToken: string,
): Promise<ResumeImportDto> => {
  const response = await fetch(candidateResumePath(importId), {
    method: 'GET',
    headers: { Accept: 'application/json', ...candidateHeaders(candidateAccessToken) },
    credentials: 'same-origin',
  });
  return safeJson<ResumeImportDto>(response);
};

export const uploadResumePdf = async (
  resumeImport: ResumeImportDto,
  file: File,
  idempotencyKey: string,
  candidateAccessToken: string,
): Promise<{ resumeImport: ResumeImportDto; inFlight: boolean }> => {
  if (!IDEMPOTENCY_PATTERN.test(idempotencyKey))
    throw new Error('Güvenli PDF yükleme anahtarı geçersiz.');
  const response = await fetch(`${candidateResumePath(resumeImport.importId)}/document`, {
    method: 'PUT',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/pdf',
      ...candidateHeaders(candidateAccessToken),
      'X-ATS-Idempotency-Key': idempotencyKey,
      'X-ATS-Expected-Version': String(resumeImport.version),
    },
    credentials: 'same-origin',
    body: file,
  });
  return {
    resumeImport: await safeJson<ResumeImportDto>(response),
    inFlight: response.status === 202,
  };
};

export const replaceResumePdf = async (
  resumeImport: ResumeImportDto,
  candidateAccessToken: string,
): Promise<ResumeImportDto> => {
  const response = await fetch(`${candidateResumePath(resumeImport.importId)}/document/replace`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...candidateHeaders(candidateAccessToken),
    },
    credentials: 'same-origin',
    body: JSON.stringify({ expectedVersion: resumeImport.version }),
  });
  return safeJson<ResumeImportDto>(response);
};

export const updateResumeProposal = async (
  resumeImport: ResumeImportDto,
  field: ResumeFieldKey,
  state: 'ACCEPTED' | 'EDITED' | 'REJECTED',
  candidateAccessToken: string,
  editedValue?: string,
): Promise<ResumeImportDto> => {
  const response = await fetch(`${candidateResumePath(resumeImport.importId)}/fields/${field}`, {
    method: 'PUT',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...candidateHeaders(candidateAccessToken),
    },
    credentials: 'same-origin',
    body: JSON.stringify({
      expectedVersion: resumeImport.version,
      state,
      ...(state === 'EDITED' ? { editedValue } : {}),
    }),
  });
  return safeJson<ResumeImportDto>(response);
};

export const confirmResumeImport = async (
  resumeImport: ResumeImportDto,
  candidateAccessToken: string,
): Promise<ResumeImportConfirmDto> => {
  const response = await fetch(`${candidateResumePath(resumeImport.importId)}/confirm`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...candidateHeaders(candidateAccessToken),
    },
    credentials: 'same-origin',
    body: JSON.stringify({ expectedVersion: resumeImport.version }),
  });
  return safeJson<ResumeImportConfirmDto>(response);
};

export const terminateResumeImport = async (
  resumeImport: ResumeImportDto,
  candidateAccessToken: string,
  terminalState: 'CANCELLED' | 'REJECT_ALL',
): Promise<ResumeImportDto> => {
  const response = await fetch(`${candidateResumePath(resumeImport.importId)}/terminate`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...candidateHeaders(candidateAccessToken),
    },
    credentials: 'same-origin',
    body: JSON.stringify({ expectedVersion: resumeImport.version, terminalState }),
  });
  return safeJson<ResumeImportDto>(response);
};

export const getCandidateStatus = async ({
  publicRef,
  candidateAccessToken,
}: CandidateSession): Promise<CandidateStatusDto> => {
  if (!PUBLIC_REF_PATTERN.test(publicRef) || !CANDIDATE_ACCESS_PATTERN.test(candidateAccessToken)) {
    throw new Error('Başvuru takip oturumu geçersiz.');
  }
  const response = await fetch(
    `${ATS_API_BASE}/candidate/applications/${encodeURIComponent(publicRef)}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-ATS-Candidate-Access': candidateAccessToken,
      },
      credentials: 'same-origin',
    },
  );
  return safeJson<CandidateStatusDto>(response);
};

export const withdrawCandidateApplication = async ({
  publicRef,
  candidateAccessToken,
}: CandidateSession): Promise<CandidateStatusDto> => {
  if (!PUBLIC_REF_PATTERN.test(publicRef) || !CANDIDATE_ACCESS_PATTERN.test(candidateAccessToken)) {
    throw new Error('Başvuru takip oturumu geçersiz.');
  }
  const response = await fetch(
    `${ATS_API_BASE}/candidate/applications/${encodeURIComponent(publicRef)}/withdraw`,
    {
      method: 'PUT',
      headers: {
        Accept: 'application/json',
        'X-ATS-Candidate-Access': candidateAccessToken,
      },
      credentials: 'same-origin',
    },
  );
  return safeJson<CandidateStatusDto>(response);
};

/**
 * #235: e-posta + tek kullanımlık kod girişi.
 *
 * Sunucu sözleşmesi gereği `request` adresin kayıtlı olup olmadığını ASLA
 * ayırt ettirmez — kayıtlı olmayan adres de 202 alır. Bu yüzden ekran
 * "gönderildi" değil "kod geldiyse girin" demek zorundadır; aksi halde arayüz
 * sunucunun bilerek gizlediği bilgiyi sızdırırdı.
 */
export const requestCandidateLoginCode = async (email: string): Promise<void> => {
  const trimmed = email.trim();
  if (!trimmed || !trimmed.includes('@') || trimmed.length > 320) {
    throw new Error('Geçerli bir e-posta adresi girin.');
  }
  const response = await fetch(`${ATS_API_BASE}/candidate/login/request`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ email: trimmed }),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { reason?: string } | null;
    // 503 = gönderim yapılandırılmamış/çalışmıyor. Sunucu fail-closed davranıyor;
    // arayüz de "gönderdim" demez.
    throw new Error(
      response.status === 503
        ? 'Kod gönderimi şu anda kullanılamıyor. Takip anahtarınızla girebilirsiniz.'
        : (payload?.reason ?? 'Kod isteği tamamlanamadı.'),
    );
  }
};

export type CandidateEmailSession = { email: string; sessionToken: string };

/** Kodu doğrular ve o adrese ait kısa ömürlü oturumu bu sekmede saklar. */
export const verifyCandidateLoginCode = async (
  email: string,
  code: string,
): Promise<CandidateEmailSession> => {
  const trimmedEmail = email.trim();
  const trimmedCode = code.trim();
  if (!LOGIN_CODE_PATTERN.test(trimmedCode)) {
    // Ağ isteği ÜRETMEDEN reddet: 6 hane olmayan girdi zaten sunucuda düşer,
    // ama denemeyi harcamak adayın bütçesini boşa yer.
    throw new Error('Kod 6 haneli olmalı.');
  }
  const response = await fetch(`${ATS_API_BASE}/candidate/login/verify`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ email: trimmedEmail, code: trimmedCode }),
  });
  const payload = await safeJson<{ sessionToken: string }>(response);
  if (!CANDIDATE_ACCESS_PATTERN.test(payload.sessionToken)) {
    throw new Error('Sunucu beklenen oturum anahtarını döndürmedi.');
  }
  const session: CandidateEmailSession = {
    email: trimmedEmail.toLowerCase(),
    sessionToken: payload.sessionToken,
  };
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(EMAIL_LOGIN_SESSION_KEY, JSON.stringify(session));
    } catch {
      // Depolama reddedilse de oturum bu sekmede geçerli; sessizce erişimsiz
      // bırakmak boşluğun ta kendisiydi (aynı gerekçe anahtar yolunda da var).
    }
  }
  return session;
};

export type CandidateLoginApplicationDto = {
  publicRef: string;
  jobSlug: string;
  jobTitle: string;
  status: ApplicationStatus;
  createdAt: string;
  updatedAt: string;
};

/** Oturumdaki adrese ait TÜM başvurular (yeniden eskiye). */
export const listCandidateLoginApplications = async (
  session: CandidateEmailSession,
): Promise<CandidateLoginApplicationDto[]> => {
  if (!CANDIDATE_ACCESS_PATTERN.test(session.sessionToken)) {
    throw new Error('Giriş oturumu geçersiz.');
  }
  const response = await fetch(`${ATS_API_BASE}/candidate/login/applications`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      // Anahtar adres satırına GİRMEZ — yalnız başlıkta taşınır.
      'X-ATS-Candidate-Session': session.sessionToken,
    },
    credentials: 'same-origin',
  });
  const payload = await safeJson<{ items?: CandidateLoginApplicationDto[] }>(response);
  return payload.items ?? [];
};

/**
 * #1044: `#1026`'nın ürettiği takip dosyasından giriş bilgilerini okur.
 *
 * Ayrıştırma **etikete değil değer şekline** bağlıdır ("Başvuru referansı:"
 * gibi bir başlık aranmaz): dosya şablonu ileride değişirse yükleme çalışmaya
 * devam eder. Metin boşluklara göre parçalanır ve her parça TAM olarak
 * eşleştirilir — alt-dize araması 43 karakterlik anahtarın içinden yanlış bir
 * pencere seçebilir ve aday neden giremediğini asla anlamazdı.
 *
 * Dosya okuma çağıranın işi (`FileReader`); bu fonksiyon saf metin alır ve
 * hiçbir ağ isteği yapmaz — kimlik bilgisi ağa çıkmaz.
 */
export const parseTrackingCredentialFile = (
  content: string,
): { publicRef: string; candidateAccessToken: string } | null => {
  const tokens = content.split(/\s+/u).filter((token) => token.length > 0);
  const publicRef = tokens.find((token) => PUBLIC_REF_PATTERN.test(token));
  // Referansın kendisi de 43 karakter olamaz (app_ + 24), ama yine de dışlıyoruz
  // ki tek bir eşleşme iki alanı doldurmaya çalışmasın.
  const candidateAccessToken = tokens.find(
    (token) => token !== publicRef && CANDIDATE_ACCESS_PATTERN.test(token),
  );
  return publicRef && candidateAccessToken ? { publicRef, candidateAccessToken } : null;
};

export const readCandidateEmailSession = (): CandidateEmailSession | null => {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(
      window.sessionStorage.getItem(EMAIL_LOGIN_SESSION_KEY) ?? 'null',
    ) as Partial<CandidateEmailSession> | null;
    return parsed?.email && parsed.sessionToken &&
      CANDIDATE_ACCESS_PATTERN.test(parsed.sessionToken)
      ? { email: parsed.email, sessionToken: parsed.sessionToken }
      : null;
  } catch {
    return null;
  }
};

export const clearCandidateEmailSession = (): void => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(EMAIL_LOGIN_SESSION_KEY);
  } catch {
    // Erişilemezse silinecek bir şey de yok.
  }
};

export const saveCandidateSession = (receipt: ApplicationReceiptDto): boolean => {
  if (
    typeof window === 'undefined' ||
    !PUBLIC_REF_PATTERN.test(receipt.publicRef) ||
    !receipt.candidateAccessToken ||
    !CANDIDATE_ACCESS_PATTERN.test(receipt.candidateAccessToken)
  ) {
    return false;
  }
  try {
    window.sessionStorage.setItem(
      CANDIDATE_SESSION_KEY,
      JSON.stringify({
        publicRef: receipt.publicRef,
        candidateAccessToken: receipt.candidateAccessToken,
      } satisfies CandidateSession),
    );
    return true;
  } catch {
    return false;
  }
};

/**
 * Adayın elle girdiği referans + takip anahtarı çiftinden oturum kurar.
 *
 * Doğrulama BURADA yapılır, çağıran ekranda değil: aynı biçim kuralı hem
 * makbuzdan gelen otomatik yolda hem elle girişte tek yerden geçer, böylece
 * iki yol birbirinden ayrışamaz. Biçimi bozuk girdi ağ isteği ÜRETMEDEN
 * reddedilir — sunucuya asla tahmin edilebilir çöp gönderilmez.
 *
 * Depolama bilinçli olarak `sessionStorage`: `localStorage` cihaz değişimini
 * ZATEN çözmez (bu boşluğun asıl çözümü anahtarın adaya teslim edilmesidir),
 * ama kimliği kalıcı depoya yazmak mevcut güvenlik duruşunu geriletirdi.
 */
export const establishCandidateSession = (
  publicRef: string,
  candidateAccessToken: string,
): CandidateSession | null => {
  const ref = publicRef.trim();
  const token = candidateAccessToken.trim();
  if (
    typeof window === 'undefined' ||
    !PUBLIC_REF_PATTERN.test(ref) ||
    !CANDIDATE_ACCESS_PATTERN.test(token)
  ) {
    return null;
  }
  const session: CandidateSession = { publicRef: ref, candidateAccessToken: token };
  try {
    window.sessionStorage.setItem(CANDIDATE_SESSION_KEY, JSON.stringify(session));
  } catch {
    // Depolama reddedilse bile oturum bu sekmede geçerlidir: durum sorgusu
    // yalnız bellekteki çiftle çalışır. Sessizce başarısız olup adayı
    // erişimsiz bırakmak, boşluğun ta kendisiydi.
  }
  return session;
};

/** Anahtarı bu sekmeden siler; paylaşılan cihazda oturumu bırakma yolu. */
export const clearCandidateSession = (): void => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(CANDIDATE_SESSION_KEY);
  } catch {
    // Depolama erişilemezse silinecek bir şey de yoktur.
  }
};

export const readCandidateSession = (): CandidateSession | null => {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(
      window.sessionStorage.getItem(CANDIDATE_SESSION_KEY) ?? 'null',
    ) as Partial<CandidateSession> | null;
    return parsed?.publicRef &&
      PUBLIC_REF_PATTERN.test(parsed.publicRef) &&
      parsed.candidateAccessToken &&
      CANDIDATE_ACCESS_PATTERN.test(parsed.candidateAccessToken)
      ? { publicRef: parsed.publicRef, candidateAccessToken: parsed.candidateAccessToken }
      : null;
  } catch {
    return null;
  }
};

export const describeAtsError = (error: unknown, fallback: string): string => {
  const response = (error as { response?: { status?: number } } | null)?.response;
  if (response?.status === 401) {
    return 'Oturumunuz sona ermiş olabilir. Yeniden giriş yapıp tekrar deneyin.';
  }
  if (response?.status === 403) {
    return 'Bu işlem için yetkiniz yok. İK rolünüzün ATS başvuru görüntüleme iznini kontrol edin.';
  }
  if (response?.status === 409) {
    return 'Başvuru başka bir işlemde güncellendi. Güncel kayıt yeniden yükleniyor.';
  }
  if (response?.status && response.status >= 500) {
    return 'ATS servisine şu anda ulaşılamıyor. Birkaç dakika sonra yeniden deneyin.';
  }
  if (error instanceof Error && !/^Request failed with status code \d+$/u.test(error.message)) {
    return error.message;
  }
  return fallback;
};

export const listRecruiterApplications = async (params?: {
  jobSlug?: string;
  status?: ApplicationStatus;
}): Promise<RecruiterApplicationPageDto> => {
  const query = new URLSearchParams({ page: '0', size: '50' });
  if (params?.jobSlug) query.set('jobSlug', params.jobSlug);
  if (params?.status) query.set('status', params.status);
  const response = await api.get<RecruiterApplicationPageDto>(
    `/ats/v1/recruiter/applications?${query.toString()}`,
  );
  return response.data;
};

export const getRecruiterApplication = async (
  publicRef: string,
): Promise<RecruiterApplicationDetailDto> => {
  if (!PUBLIC_REF_PATTERN.test(publicRef)) throw new Error('Başvuru referansı geçersiz.');
  const response = await api.get<RecruiterApplicationDetailDto>(
    `/ats/v1/recruiter/applications/${encodeURIComponent(publicRef)}`,
  );
  return response.data;
};

export const updateRecruiterApplicationStatus = async (
  publicRef: string,
  expectedVersion: number,
  toStatus: 'UNDER_REVIEW' | 'INTERVIEW_PENDING' | 'REJECTED',
): Promise<RecruiterApplicationDto> => {
  const response = await api.put<RecruiterApplicationDto>(
    `/ats/v1/recruiter/applications/${encodeURIComponent(publicRef)}/status`,
    { expectedVersion, toStatus },
  );
  return response.data;
};

export const submitRecruiterApplicationEvaluation = async (
  publicRef: string,
  evaluation: RecruiterApplicationEvaluationRequest,
  idempotencyKey: string,
): Promise<RecruiterApplicationEvaluationDto> => {
  if (!PUBLIC_REF_PATTERN.test(publicRef)) throw new Error('Başvuru referansı geçersiz.');
  if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
    throw new Error('Güvenli işlem anahtarı geçersiz.');
  }
  const response = await api.post<RecruiterApplicationEvaluationDto>(
    `/ats/v1/recruiter/applications/${encodeURIComponent(publicRef)}/evaluations`,
    evaluation,
    { headers: { 'X-ATS-Idempotency-Key': idempotencyKey } },
  );
  return response.data;
};

export const listRecruiterInterviews = async (
  publicRef: string,
): Promise<RecruiterInterviewWorkspaceDto[]> => {
  if (!PUBLIC_REF_PATTERN.test(publicRef)) throw new Error('Başvuru referansı geçersiz.');
  const response = await api.get<RecruiterInterviewWorkspaceDto[]>(
    `/ats/v1/recruiter/applications/${encodeURIComponent(publicRef)}/interviews`,
  );
  return response.data;
};

export const createRecruiterInterview = async (
  publicRef: string,
  request: CreateInterviewRequest,
  idempotencyKey: string,
): Promise<RecruiterInterviewWorkspaceDto> => {
  if (!PUBLIC_REF_PATTERN.test(publicRef)) throw new Error('Başvuru referansı geçersiz.');
  if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
    throw new Error('Güvenli işlem anahtarı geçersiz.');
  }
  const response = await api.post<RecruiterInterviewWorkspaceDto>(
    `/ats/v1/recruiter/applications/${encodeURIComponent(publicRef)}/interviews`,
    request,
    { headers: { 'X-ATS-Idempotency-Key': idempotencyKey } },
  );
  return response.data;
};

export const rescheduleRecruiterInterview = async (
  publicRef: string,
  interview: RecruiterInterviewWorkspaceDto,
  request: Pick<
    CreateInterviewRequest,
    'startsAt' | 'endsAt' | 'timeZone' | 'mode' | 'location'
  > & {
    reason: string;
  },
  idempotencyKey: string,
): Promise<RecruiterInterviewWorkspaceDto> => {
  if (!PUBLIC_REF_PATTERN.test(publicRef) || !INTERVIEW_ID_PATTERN.test(interview.interviewId)) {
    throw new Error('Görüşme referansı geçersiz.');
  }
  if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
    throw new Error('Güvenli işlem anahtarı geçersiz.');
  }
  const response = await api.put<RecruiterInterviewWorkspaceDto>(
    `/ats/v1/recruiter/applications/${encodeURIComponent(publicRef)}/interviews/${encodeURIComponent(interview.interviewId)}`,
    { expectedVersion: interview.version, ...request },
    { headers: { 'X-ATS-Idempotency-Key': idempotencyKey } },
  );
  return response.data;
};

export const transitionRecruiterInterview = async (
  publicRef: string,
  interview: RecruiterInterviewWorkspaceDto,
  target: 'COMPLETED' | 'CANCELLED',
  reason: string,
  idempotencyKey: string,
): Promise<RecruiterInterviewWorkspaceDto> => {
  if (!PUBLIC_REF_PATTERN.test(publicRef) || !INTERVIEW_ID_PATTERN.test(interview.interviewId)) {
    throw new Error('Görüşme referansı geçersiz.');
  }
  if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
    throw new Error('Güvenli işlem anahtarı geçersiz.');
  }
  const response = await api.post<RecruiterInterviewWorkspaceDto>(
    `/ats/v1/recruiter/applications/${encodeURIComponent(publicRef)}/interviews/${encodeURIComponent(interview.interviewId)}/transitions`,
    { expectedVersion: interview.version, target, reason },
    { headers: { 'X-ATS-Idempotency-Key': idempotencyKey } },
  );
  return response.data;
};

export const submitInterviewScorecard = async (
  interviewId: string,
  request: InterviewScorecardRequest,
  idempotencyKey: string,
): Promise<InterviewScorecardDto> => {
  if (!INTERVIEW_ID_PATTERN.test(interviewId)) throw new Error('Görüşme referansı geçersiz.');
  if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
    throw new Error('Güvenli işlem anahtarı geçersiz.');
  }
  const response = await api.post<InterviewScorecardDto>(
    `/ats/v1/interviews/${encodeURIComponent(interviewId)}/scorecards`,
    request,
    { headers: { 'X-ATS-Idempotency-Key': idempotencyKey } },
  );
  return response.data;
};

export const getCandidateInterviews = async ({
  publicRef,
  candidateAccessToken,
}: CandidateSession): Promise<CandidateInterviewDto[]> => {
  if (!PUBLIC_REF_PATTERN.test(publicRef) || !CANDIDATE_ACCESS_PATTERN.test(candidateAccessToken)) {
    throw new Error('Başvuru takip oturumu geçersiz.');
  }
  const response = await fetch(
    `${ATS_API_BASE}/candidate/applications/${encodeURIComponent(publicRef)}/interviews`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-ATS-Candidate-Access': candidateAccessToken,
      },
      credentials: 'same-origin',
    },
  );
  return safeJson<CandidateInterviewDto[]>(response);
};

export const listRecruiterOffers = async (
  publicRef: string,
): Promise<RecruiterOfferWorkspaceDto[]> => {
  if (!PUBLIC_REF_PATTERN.test(publicRef)) throw new Error('Başvuru referansı geçersiz.');
  const response = await api.get<RecruiterOfferWorkspaceDto[]>(
    `/ats/v1/recruiter/applications/${encodeURIComponent(publicRef)}/offers`,
  );
  return response.data;
};

export const createRecruiterOffer = async (
  publicRef: string,
  terms: OfferTermsDto,
  idempotencyKey: string,
): Promise<RecruiterOfferWorkspaceDto> => {
  if (!PUBLIC_REF_PATTERN.test(publicRef)) throw new Error('Başvuru referansı geçersiz.');
  if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
    throw new Error('Güvenli işlem anahtarı geçersiz.');
  }
  const response = await api.post<RecruiterOfferWorkspaceDto>(
    `/ats/v1/recruiter/applications/${encodeURIComponent(publicRef)}/offers`,
    terms,
    { headers: { 'X-ATS-Idempotency-Key': idempotencyKey } },
  );
  return response.data;
};

export const updateRecruiterOffer = async (
  publicRef: string,
  offer: RecruiterOfferWorkspaceDto,
  terms: OfferTermsDto,
  reason: string,
  idempotencyKey: string,
): Promise<RecruiterOfferWorkspaceDto> => {
  if (!PUBLIC_REF_PATTERN.test(publicRef) || !OFFER_ID_PATTERN.test(offer.offerId)) {
    throw new Error('Teklif referansı geçersiz.');
  }
  if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
    throw new Error('Güvenli işlem anahtarı geçersiz.');
  }
  const response = await api.put<RecruiterOfferWorkspaceDto>(
    `/ats/v1/recruiter/applications/${encodeURIComponent(publicRef)}/offers/${encodeURIComponent(offer.offerId)}`,
    { expectedVersion: offer.version, reason, terms },
    { headers: { 'X-ATS-Idempotency-Key': idempotencyKey } },
  );
  return response.data;
};

export const transitionRecruiterOffer = async (
  publicRef: string,
  offer: RecruiterOfferWorkspaceDto,
  target: 'EXTENDED' | 'WITHDRAWN' | 'HIRED',
  reason: string,
  idempotencyKey: string,
): Promise<RecruiterOfferWorkspaceDto> => {
  if (!PUBLIC_REF_PATTERN.test(publicRef) || !OFFER_ID_PATTERN.test(offer.offerId)) {
    throw new Error('Teklif referansı geçersiz.');
  }
  if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
    throw new Error('Güvenli işlem anahtarı geçersiz.');
  }
  const response = await api.post<RecruiterOfferWorkspaceDto>(
    `/ats/v1/recruiter/applications/${encodeURIComponent(publicRef)}/offers/${encodeURIComponent(offer.offerId)}/transitions`,
    { expectedVersion: offer.version, target, reason },
    { headers: { 'X-ATS-Idempotency-Key': idempotencyKey } },
  );
  return response.data;
};

export const getCandidateOffers = async ({
  publicRef,
  candidateAccessToken,
}: CandidateSession): Promise<CandidateOfferDto[]> => {
  if (!PUBLIC_REF_PATTERN.test(publicRef) || !CANDIDATE_ACCESS_PATTERN.test(candidateAccessToken)) {
    throw new Error('Başvuru takip oturumu geçersiz.');
  }
  const response = await fetch(
    `${ATS_API_BASE}/candidate/applications/${encodeURIComponent(publicRef)}/offers`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-ATS-Candidate-Access': candidateAccessToken,
      },
      credentials: 'same-origin',
    },
  );
  return safeJson<CandidateOfferDto[]>(response);
};

export const respondCandidateOffer = async (
  session: CandidateSession,
  offer: CandidateOfferDto,
  target: 'ACCEPTED' | 'DECLINED',
  idempotencyKey: string,
): Promise<CandidateOfferDto> => {
  if (
    !PUBLIC_REF_PATTERN.test(session.publicRef) ||
    !CANDIDATE_ACCESS_PATTERN.test(session.candidateAccessToken) ||
    !OFFER_ID_PATTERN.test(offer.offerId)
  ) {
    throw new Error('Teklif yanıt oturumu geçersiz.');
  }
  if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
    throw new Error('Güvenli işlem anahtarı geçersiz.');
  }
  const response = await fetch(
    `${ATS_API_BASE}/candidate/applications/${encodeURIComponent(session.publicRef)}/offers/${encodeURIComponent(offer.offerId)}/response`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-ATS-Candidate-Access': session.candidateAccessToken,
        'X-ATS-Idempotency-Key': idempotencyKey,
      },
      credentials: 'same-origin',
      body: JSON.stringify({
        expectedVersion: offer.version,
        target,
        processAcknowledged: true,
      }),
    },
  );
  return safeJson<CandidateOfferDto>(response);
};

export const listRecruiterJobs = async (): Promise<RecruiterJobDto[]> => {
  const response = await api.get<RecruiterJobDto[]>('/ats/v1/recruiter/jobs');
  return response.data;
};

export const createRecruiterJob = async (
  draft: RecruiterJobDraftDto,
  idempotencyKey: string,
): Promise<RecruiterJobDto> => {
  if (!IDEMPOTENCY_PATTERN.test(idempotencyKey))
    throw new Error('Güvenli işlem anahtarı geçersiz.');
  const response = await api.post<RecruiterJobDto>('/ats/v1/recruiter/jobs', draft, {
    headers: { 'X-ATS-Idempotency-Key': idempotencyKey },
  });
  return response.data;
};

export const updateRecruiterJob = async (
  job: RecruiterJobDto,
  draft: RecruiterJobDraftDto & { slug: string },
  idempotencyKey: string,
): Promise<RecruiterJobDto> => {
  if (!IDEMPOTENCY_PATTERN.test(idempotencyKey))
    throw new Error('Güvenli işlem anahtarı geçersiz.');
  const response = await api.put<RecruiterJobDto>(
    `/ats/v1/recruiter/jobs/${encodeURIComponent(job.jobId)}`,
    { expectedVersion: job.version, ...draft },
    { headers: { 'X-ATS-Idempotency-Key': idempotencyKey } },
  );
  return response.data;
};

export const transitionRecruiterJob = async (
  job: RecruiterJobDto,
  targetStatus: RecruiterJobStatus,
  idempotencyKey: string,
): Promise<RecruiterJobDto> => {
  if (!IDEMPOTENCY_PATTERN.test(idempotencyKey))
    throw new Error('Güvenli işlem anahtarı geçersiz.');
  const response = await api.post<RecruiterJobDto>(
    `/ats/v1/recruiter/jobs/${encodeURIComponent(job.jobId)}/transitions`,
    { expectedVersion: job.version, targetStatus },
    { headers: { 'X-ATS-Idempotency-Key': idempotencyKey } },
  );
  return response.data;
};

export const createApplicationIdempotencyKey = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `web-${crypto.randomUUID()}`;
  }
  return `web-${randomBase64Url(16)}`;
};

export const createCandidateAccessToken = (): string => {
  return randomBase64Url(32);
};

const randomBase64Url = (byteLength: number): string => {
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    throw new Error(
      'Güvenli oturum anahtarı üretilemedi; tarayıcınızı güncelleyip yeniden deneyin.',
    );
  }
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
};
