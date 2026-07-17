import { api } from '@mfe/shared-http';

export const ATS_API_BASE = '/api/ats/v1';
const CANDIDATE_SESSION_KEY = 'ats.candidate.latest.v1';
const PUBLIC_REF_PATTERN = /^app_[A-Za-z0-9_-]{24}$/u;
const CANDIDATE_ACCESS_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/u;
const PUBLIC_HANDLE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+){0,7}$/u;

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
  noticeVersion: 'kvkk-application-v1';
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
  noticeVersion: 'kvkk-application-v1';
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
};

export type ApplicationStatus = 'SUBMITTED' | 'UNDER_REVIEW' | 'INTERVIEW_PENDING';

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

export type RecruiterApplicationPageDto = {
  items: RecruiterApplicationDto[];
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
  noticeVersion: 'kvkk-application-v1';
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

export const listPublicJobs = async (publicHandle?: string): Promise<PublicJobDto[]> => {
  const response = await fetch(publicJobsPath(publicHandle), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  });
  return safeJson<PublicJobDto[]>(response);
};

export const getPublicJob = async (
  jobSlug: string,
  publicHandle?: string,
): Promise<PublicJobDto> => {
  const response = await fetch(`${publicJobsPath(publicHandle)}/${encodeURIComponent(jobSlug)}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  });
  return safeJson<PublicJobDto>(response);
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
  const response = await fetch(
    `${publicJobsPath(publicHandle)}/${encodeURIComponent(jobSlug)}/applications`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-ATS-Idempotency-Key': idempotencyKey,
        'X-ATS-Candidate-Access': candidateAccessToken,
      },
      credentials: 'same-origin',
      body: JSON.stringify(submission),
    },
  );
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

export const updateRecruiterApplicationStatus = async (
  publicRef: string,
  expectedVersion: number,
  toStatus: Exclude<ApplicationStatus, 'SUBMITTED'>,
): Promise<RecruiterApplicationDto> => {
  const response = await api.put<RecruiterApplicationDto>(
    `/ats/v1/recruiter/applications/${encodeURIComponent(publicRef)}/status`,
    { expectedVersion, toStatus },
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
