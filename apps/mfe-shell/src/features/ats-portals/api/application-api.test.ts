// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const httpMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock('@mfe/shared-http', () => ({ api: httpMocks }));

import {
  confirmResumeImport,
  createApplicationIdempotencyKey,
  createResumeImport,
  getCandidateStatus,
  createCandidateAccessToken,
  createRecruiterJob,
  getPublicJob,
  getResumeImport,
  listPublicJobs,
  listRecruiterApplications,
  listRecruiterJobs,
  readCandidateSession,
  saveCandidateSession,
  replaceResumePdf,
  submitApplication,
  terminateResumeImport,
  transitionRecruiterJob,
  updateRecruiterJob,
  updateRecruiterApplicationStatus,
  updateResumeProposal,
  uploadResumePdf,
  type ResumeImportDto,
} from './application-api';

const fetchMock = vi.fn();

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('application-api', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('reads the public job catalog from the ATS ingress without auth material', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));

    await listPublicJobs();

    expect(fetchMock).toHaveBeenCalledWith('/api/ats/v1/jobs', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });
  });

  it('uses a validated public career handle for tenant-bound candidate routes', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(
        jsonResponse({ slug: 'urun-yoneticisi', noticeVersion: 'kvkk-application-v1' }),
      );

    await listPublicJobs('acik');
    await getPublicJob('urun-yoneticisi', 'acik');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/ats/v1/careers/acik/jobs',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/ats/v1/careers/acik/jobs/urun-yoneticisi',
      expect.objectContaining({ method: 'GET' }),
    );
    await expect(listPublicJobs('../tenant')).rejects.toThrow('Kariyer adresi geçersiz');
  });

  it('fails closed when the public job cannot prove the KVKK notice version', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ slug: 'urun-yoneticisi' }));

    await expect(getPublicJob('urun-yoneticisi')).rejects.toThrow(
      'Başvuru aydınlatma metni sürümü doğrulanamadı',
    );
  });

  it('rejects path-shaped public job slugs before making a network request', async () => {
    await expect(getPublicJob('..')).rejects.toThrow('İlan adresi geçersiz');
    await expect(
      submitApplication('../applications', 'web-idempotency-123456', 'A'.repeat(43), {
        fullName: 'Deniz Sentetik',
        email: 'deniz@example.test',
        phone: '+905550000000',
        city: 'İstanbul',
        summary: 'Sentetik özet',
        experience: 'Sentetik deneyim',
        education: 'Sentetik eğitim',
        skills: ['Ürün'],
        noticeVersion: 'kvkk-application-v1',
        noticeAcceptedAt: '2026-07-16T10:00:00Z',
        accuracyConfirmedAt: '2026-07-16T10:00:00Z',
      }),
    ).rejects.toThrow('İlan adresi geçersiz');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('submits strict JSON with an idempotency key and no caller tenant or status', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          publicRef: 'app_abcdefghijklmnopqrstuvwx',
          candidateAccessToken: 'A'.repeat(43),
          status: 'SUBMITTED',
          version: 0,
          submittedAt: '2026-07-16T10:00:00Z',
          replayed: false,
        },
        201,
      ),
    );
    const submission = {
      fullName: 'Deniz Sentetik',
      email: 'deniz@example.test',
      phone: '+905550000000',
      city: 'İstanbul',
      summary: 'Sentetik özet',
      experience: 'Sentetik deneyim',
      education: 'Sentetik eğitim',
      skills: ['Ürün keşfi'],
      noticeVersion: 'kvkk-application-v1' as const,
      noticeAcceptedAt: '2026-07-16T10:00:00Z',
      accuracyConfirmedAt: '2026-07-16T10:00:00Z',
    };

    await submitApplication(
      'urun-yoneticisi',
      'web-idempotency-123456',
      'A'.repeat(43),
      submission,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ats/v1/jobs/urun-yoneticisi/applications',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-ATS-Idempotency-Key': 'web-idempotency-123456',
          'X-ATS-Candidate-Access': 'A'.repeat(43),
        }),
        body: JSON.stringify(submission),
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toEqual(
      expect.objectContaining({ tenantId: expect.anything(), status: expect.anything() }),
    );
  });

  it('keeps the candidate tracking credential in session storage only', () => {
    expect(
      saveCandidateSession({
        publicRef: 'app_abcdefghijklmnopqrstuvwx',
        candidateAccessToken: 'A'.repeat(43),
        status: 'SUBMITTED',
        version: 0,
        submittedAt: '2026-07-16T10:00:00Z',
        replayed: false,
      }),
    ).toBe(true);

    expect(readCandidateSession()).toEqual({
      publicRef: 'app_abcdefghijklmnopqrstuvwx',
      candidateAccessToken: 'A'.repeat(43),
    });
    expect(window.localStorage.length).toBe(0);
  });

  it('creates a 256-bit base64url candidate credential with Web Crypto', () => {
    expect(createCandidateAccessToken()).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(createApplicationIdempotencyKey()).toMatch(/^web-[A-Za-z0-9._:-]{16,124}$/u);
  });

  it('rejects malformed submit credentials before making a network request', async () => {
    await expect(
      submitApplication('urun-yoneticisi', 'short', 'bad', {
        fullName: 'Deniz Sentetik',
        email: 'deniz@example.test',
        phone: '+905550000000',
        city: 'İstanbul',
        summary: 'Sentetik özet',
        experience: 'Sentetik deneyim',
        education: 'Sentetik eğitim',
        skills: ['Ürün'],
        noticeVersion: 'kvkk-application-v1',
        noticeAcceptedAt: '2026-07-16T10:00:00Z',
        accuracyConfirmedAt: '2026-07-16T10:00:00Z',
      }),
    ).rejects.toThrow('Güvenli başvuru oturumu geçersiz');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('drops malformed session data instead of reusing it as a bearer credential', () => {
    window.sessionStorage.setItem(
      'ats.candidate.latest.v1',
      JSON.stringify({
        publicRef: 'app_too-short',
        candidateAccessToken: 'attacker-controlled',
      }),
    );
    expect(readCandidateSession()).toBeNull();
  });

  it('sends the candidate token only as a request header and never in the URL', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'SUBMITTED' }));

    await getCandidateStatus({
      publicRef: 'app_abcdefghijklmnopqrstuvwx',
      candidateAccessToken: 'A'.repeat(43),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ats/v1/candidate/applications/app_abcdefghijklmnopqrstuvwx',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ 'X-ATS-Candidate-Access': 'A'.repeat(43) }),
      }),
    );
    expect(fetchMock.mock.calls[0][0]).not.toContain('A'.repeat(43));
  });

  it('uses a versioned candidate-only PDF lifecycle without putting credentials or filenames in URLs', async () => {
    const token = 'R'.repeat(43);
    const resumeImport: ResumeImportDto = {
      importId: 'ri_abcdefghijklmnopqrstuvwx',
      jobSlug: 'urun-yoneticisi',
      state: 'ACTIVE',
      version: 0,
      documentVersion: 0,
      noticeVersion: 'candidate-resume-import-v1',
      noticeAcceptedAt: '2026-07-18T10:00:00Z',
      uploadExpiresAt: '2026-07-18T10:15:00Z',
      firstUploadAt: null,
      expiresAt: null,
      parserVersion: null,
      protectedSuppressed: 0,
      unsupportedOutput: 0,
      createdAt: '2026-07-18T10:00:00Z',
      updatedAt: '2026-07-18T10:00:00Z',
      purgedAt: null,
      proposals: [],
    };
    const uploaded = { ...resumeImport, version: 1, documentVersion: 1 };
    const updated = { ...uploaded, version: 2 };
    const confirmed = {
      resumeImport: { ...updated, state: 'CONFIRMED', proposals: [] },
      draft: {
        draftId: '11111111-1111-1111-1111-111111111111',
        importId: resumeImport.importId,
        version: 0,
        fields: { email: 'deniz@example.test' },
        createdAt: '2026-07-18T10:02:00Z',
      },
    };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(resumeImport, 201))
      .mockResolvedValueOnce(jsonResponse(resumeImport))
      .mockResolvedValueOnce(jsonResponse(uploaded, 202))
      .mockResolvedValueOnce(jsonResponse(updated))
      .mockResolvedValueOnce(jsonResponse(updated))
      .mockResolvedValueOnce(jsonResponse(confirmed))
      .mockResolvedValueOnce(jsonResponse({ ...updated, state: 'REJECT_ALL' }));

    const created = await createResumeImport(
      'urun-yoneticisi',
      'web-resume-create-1234',
      token,
      resumeImport.noticeAcceptedAt,
      'acik',
    );
    await getResumeImport(created.importId, token);
    const pdf = new File(['%PDF synthetic'], 'must-not-leak.pdf', { type: 'application/pdf' });
    const upload = await uploadResumePdf(created, pdf, 'web-resume-upload-1234', token);
    await replaceResumePdf(uploaded, token);
    await updateResumeProposal(uploaded, 'email', 'EDITED', token, 'deniz@example.test');
    await confirmResumeImport(updated, token);
    await terminateResumeImport(updated, token, 'REJECT_ALL');

    expect(upload.inFlight).toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/ats/v1/careers/acik/jobs/urun-yoneticisi/resume-imports',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-ATS-Candidate-Access': token,
          'X-ATS-Idempotency-Key': 'web-resume-create-1234',
        }),
        body: JSON.stringify({
          noticeVersion: 'candidate-resume-import-v1',
          noticeAcceptedAt: resumeImport.noticeAcceptedAt,
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      `/api/ats/v1/candidate/resume-imports/${resumeImport.importId}/document`,
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          'Content-Type': 'application/pdf',
          'X-ATS-Expected-Version': '0',
          'X-ATS-Idempotency-Key': 'web-resume-upload-1234',
        }),
        body: pdf,
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      `/api/ats/v1/candidate/resume-imports/${resumeImport.importId}/fields/email`,
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          expectedVersion: 1,
          state: 'EDITED',
          editedValue: 'deniz@example.test',
        }),
      }),
    );
    for (const [url] of fetchMock.mock.calls) {
      expect(String(url)).not.toContain(token);
      expect(String(url)).not.toContain('must-not-leak.pdf');
    }
  });

  it('rejects malformed candidate tracking input before making a network request', async () => {
    await expect(
      getCandidateStatus({ publicRef: 'bad-ref', candidateAccessToken: 'bad-token' }),
    ).rejects.toThrow('Başvuru takip oturumu geçersiz');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the authenticated shared HTTP client for tenant-bound recruiter operations', async () => {
    httpMocks.get.mockResolvedValueOnce({ data: { items: [], page: 0, size: 50, total: 0 } });
    httpMocks.put.mockResolvedValueOnce({ data: { status: 'UNDER_REVIEW' } });

    await listRecruiterApplications({ status: 'SUBMITTED' });
    await updateRecruiterApplicationStatus('app_abcdefghijklmnopqrstuvwx', 0, 'UNDER_REVIEW');

    expect(httpMocks.get).toHaveBeenCalledWith(
      '/ats/v1/recruiter/applications?page=0&size=50&status=SUBMITTED',
    );
    expect(httpMocks.put).toHaveBeenCalledWith(
      '/ats/v1/recruiter/applications/app_abcdefghijklmnopqrstuvwx/status',
      { expectedVersion: 0, toStatus: 'UNDER_REVIEW' },
    );
  });

  it('uses versioned idempotent mutations for recruiter job lifecycle', async () => {
    const job = {
      jobId: `job_${'A'.repeat(24)}`,
      publicHandle: 'acik',
      slug: 'urun-yoneticisi',
      title: 'Ürün Yöneticisi',
      team: 'Ürün',
      location: 'İstanbul',
      mode: 'Hibrit',
      employmentType: 'Tam zamanlı',
      summary: 'Kullanıcı ihtiyaçlarını ölçülebilir sonuçlara dönüştürün.',
      highlights: ['Ürün keşfi'],
      status: 'DRAFT' as const,
      applyEnabled: false,
      version: 0,
      createdAt: '2026-07-17T10:00:00Z',
      updatedAt: '2026-07-17T10:00:00Z',
    };
    const draft = {
      slug: job.slug,
      title: job.title,
      team: job.team,
      location: job.location,
      mode: job.mode,
      employmentType: job.employmentType,
      summary: job.summary,
      highlights: job.highlights,
    };
    httpMocks.get.mockResolvedValueOnce({ data: [job] });
    httpMocks.post.mockResolvedValue({ data: job });
    httpMocks.put.mockResolvedValueOnce({ data: { ...job, version: 1 } });

    await listRecruiterJobs();
    await createRecruiterJob(draft, 'web-job-create-1234');
    await updateRecruiterJob(job, draft, 'web-job-update-1234');
    await transitionRecruiterJob(job, 'PUBLISHED', 'web-job-publish-123');

    expect(httpMocks.get).toHaveBeenCalledWith('/ats/v1/recruiter/jobs');
    expect(httpMocks.post).toHaveBeenNthCalledWith(1, '/ats/v1/recruiter/jobs', draft, {
      headers: { 'X-ATS-Idempotency-Key': 'web-job-create-1234' },
    });
    expect(httpMocks.put).toHaveBeenCalledWith(
      `/ats/v1/recruiter/jobs/${job.jobId}`,
      { expectedVersion: 0, ...draft },
      { headers: { 'X-ATS-Idempotency-Key': 'web-job-update-1234' } },
    );
    expect(httpMocks.post).toHaveBeenNthCalledWith(
      2,
      `/ats/v1/recruiter/jobs/${job.jobId}/transitions`,
      { expectedVersion: 0, targetStatus: 'PUBLISHED' },
      { headers: { 'X-ATS-Idempotency-Key': 'web-job-publish-123' } },
    );
  });

  it('turns server rate limiting into an actionable candidate message', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ reason: 'Çok fazla başvuru.' }, 429));

    await expect(listPublicJobs()).rejects.toThrow(
      'Çok fazla başvuru. Birkaç dakika sonra yeniden deneyin.',
    );
  });

  it('does not expose a server-side failure reason to the public UI', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ reason: 'DB hatası: internal' }, 503));

    await expect(listPublicJobs()).rejects.toThrow('Servis geçici olarak kullanılamıyor.');
  });
});
