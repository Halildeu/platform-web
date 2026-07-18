import { api } from '@mfe/shared-http';

export const ATS_API_BASE = '/api/ats/v1';
export const APPLICATION_NOTICE_VERSION = 'kvkk-application-v1' as const;
const CANDIDATE_SESSION_KEY = 'ats.candidate.latest.v1';
const PUBLIC_REF_PATTERN = /^app_[A-Za-z0-9_-]{24}$/u;
const CANDIDATE_ACCESS_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
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
  experience: string;
  education: string;
  skills: string[];
  note?: string;
  noticeVersion: typeof APPLICATION_NOTICE_VERSION;
  noticeAcceptedAt: string;
  accuracyConfirmedAt: string;
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
  nextAction: 'WAIT_FOR_REVIEW' | 'PREPARE_FOR_INTERVIEW' | 'NONE';
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

export type RecruiterApplicationDetailDto = {
  application: RecruiterApplicationDto;
  history: RecruiterApplicationHistoryEventDto[];
  evaluations: RecruiterApplicationEvaluationDto[];
};

export type RecruiterApplicationPageDto = {
  items: RecruiterApplicationSummaryDto[];
  page: number;
  size: number;
  total: number;
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
