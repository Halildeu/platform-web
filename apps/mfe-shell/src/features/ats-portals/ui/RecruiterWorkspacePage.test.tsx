// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RecruiterWorkspacePage from './RecruiterWorkspacePage';

const apiMocks = vi.hoisted(() => ({
  listRecruiterApplications: vi.fn(),
  getRecruiterApplication: vi.fn(),
  updateRecruiterApplicationStatus: vi.fn(),
  submitRecruiterApplicationEvaluation: vi.fn(),
  listRecruiterInterviews: vi.fn(),
  createRecruiterInterview: vi.fn(),
  rescheduleRecruiterInterview: vi.fn(),
  transitionRecruiterInterview: vi.fn(),
  submitInterviewScorecard: vi.fn(),
  listRecruiterOffers: vi.fn(),
  createRecruiterOffer: vi.fn(),
  updateRecruiterOffer: vi.fn(),
  transitionRecruiterOffer: vi.fn(),
  listRecruiterJobs: vi.fn(),
  createRecruiterJob: vi.fn(),
  updateRecruiterJob: vi.fn(),
  transitionRecruiterJob: vi.fn(),
  createApplicationIdempotencyKey: vi.fn(() => 'web-job-command-1234'),
}));
const permissionMocks = vi.hoisted(() => ({
  getModuleLevel: vi.fn(() => 'MANAGE'),
  isActionAllowed: vi.fn((_action: string) => false),
}));
vi.mock('@mfe/auth', () => ({
  usePermissions: () => permissionMocks,
}));
vi.mock('../api/application-api', () => ({
  DEFAULT_APPLICATION_FIELDS: [
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
  ],
  listRecruiterApplications: apiMocks.listRecruiterApplications,
  getRecruiterApplication: apiMocks.getRecruiterApplication,
  updateRecruiterApplicationStatus: apiMocks.updateRecruiterApplicationStatus,
  submitRecruiterApplicationEvaluation: apiMocks.submitRecruiterApplicationEvaluation,
  listRecruiterInterviews: apiMocks.listRecruiterInterviews,
  createRecruiterInterview: apiMocks.createRecruiterInterview,
  rescheduleRecruiterInterview: apiMocks.rescheduleRecruiterInterview,
  transitionRecruiterInterview: apiMocks.transitionRecruiterInterview,
  submitInterviewScorecard: apiMocks.submitInterviewScorecard,
  listRecruiterOffers: apiMocks.listRecruiterOffers,
  createRecruiterOffer: apiMocks.createRecruiterOffer,
  updateRecruiterOffer: apiMocks.updateRecruiterOffer,
  transitionRecruiterOffer: apiMocks.transitionRecruiterOffer,
  listRecruiterJobs: apiMocks.listRecruiterJobs,
  createRecruiterJob: apiMocks.createRecruiterJob,
  updateRecruiterJob: apiMocks.updateRecruiterJob,
  transitionRecruiterJob: apiMocks.transitionRecruiterJob,
  createApplicationIdempotencyKey: apiMocks.createApplicationIdempotencyKey,
  describeAtsError: (error: unknown, fallback: string) => {
    const status = (error as { response?: { status?: number } } | null)?.response?.status;
    if (status === 403) {
      return 'Bu işlem için yetkiniz yok. İK rolünüzün ATS başvuru görüntüleme iznini kontrol edin.';
    }
    return error instanceof Error ? error.message : fallback;
  },
}));

const APPLICATION = {
  publicRef: 'app_abcdefghijklmnopqrstuvwx',
  jobSlug: 'urun-yoneticisi',
  jobTitle: 'Ürün Yöneticisi',
  fullName: 'Deniz Sentetik',
  email: 'deniz@example.test',
  phone: '+905550000000',
  city: 'İstanbul',
  linkedIn: null,
  portfolio: null,
  summary: 'Sentetik profesyonel özet',
  experience: 'Sentetik deneyim',
  education: 'Sentetik eğitim',
  skills: ['Ürün keşfi', 'Araştırma'],
  note: 'Sentetik not',
  status: 'SUBMITTED',
  version: 0,
  createdAt: '2026-07-16T10:00:00Z',
  updatedAt: '2026-07-16T10:00:00Z',
};

const INTERVIEW = {
  interviewId: 'int_abcdefghijklmnopqrstuvwx',
  applicationPublicRef: APPLICATION.publicRef,
  jobSlug: APPLICATION.jobSlug,
  jobTitle: APPLICATION.jobTitle,
  candidateName: APPLICATION.fullName,
  type: 'SCREENING',
  startsAt: '2026-07-20T07:00:00Z',
  endsAt: '2026-07-20T08:00:00Z',
  timeZone: 'Europe/Istanbul',
  mode: 'VIDEO',
  location: 'https://meet.example.test/sentetik',
  status: 'SCHEDULED',
  version: 0,
  participants: [
    { actorRef: 'user:test-recruiter', displayLabel: 'Atanmış İK görüşmecisi', role: 'LEAD' },
  ],
  criteria: [
    {
      key: 'role_problem_solving',
      label: 'İşle ilgili problem çözme',
      question: 'İşle ilgili zor bir problemi nasıl çözdünüz?',
      evidencePrompt: 'Somut iş kanıtını kaydedin.',
    },
    {
      key: 'relevant_delivery',
      label: 'İşle ilgili teslimat kanıtı',
      question: 'Benzer bir işi uçtan uca nasıl teslim ettiniz?',
      evidencePrompt: 'Doğrulanabilir sonucu kaydedin.',
    },
    {
      key: 'collaboration_evidence',
      label: 'İş birliği kanıtı',
      question: 'Paydaş anlaşmazlığını nasıl çözdünüz?',
      evidencePrompt: 'Gözlemlenebilir davranışı kaydedin.',
    },
  ],
  scorecards: [],
  scheduleHistory: [],
  createdAt: '2026-07-18T10:00:00Z',
  updatedAt: '2026-07-18T10:00:00Z',
};

const EVALUATION = {
  evaluationId: 'eval_abcdefghijklmnopqrstuvwx',
  actorRef: 'user:test-recruiter',
  policyVersion: 'structured-evaluation-v1',
  jobRelatednessConfirmed: true,
  recommendation: 'ADVANCE',
  criteria: [],
  summary: 'Sentetik insan değerlendirmesi gerekçesi.',
  predecessorEvaluationId: null,
  revision: 1,
  createdAt: '2026-07-16T11:00:00Z',
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <RecruiterWorkspacePage />
    </MemoryRouter>,
  );

describe('RecruiterWorkspacePage', () => {
  beforeEach(() => {
    permissionMocks.getModuleLevel.mockReturnValue('MANAGE');
    permissionMocks.isActionAllowed.mockReturnValue(false);
    apiMocks.listRecruiterApplications.mockResolvedValue({
      items: [APPLICATION],
      page: 0,
      size: 50,
      total: 1,
    });
    apiMocks.updateRecruiterApplicationStatus.mockResolvedValue({
      ...APPLICATION,
      status: 'UNDER_REVIEW',
      version: 1,
    });
    apiMocks.getRecruiterApplication.mockResolvedValue({
      application: APPLICATION,
      history: [
        {
          eventId: 1,
          fromStatus: null,
          toStatus: 'SUBMITTED',
          actorRef: 'candidate:self',
          occurredAt: APPLICATION.createdAt,
        },
      ],
      evaluations: [],
    });
    apiMocks.submitRecruiterApplicationEvaluation.mockResolvedValue({
      evaluationId: 'eval_abcdefghijklmnopqrstuvwx',
      actorRef: 'user:test-recruiter',
      policyVersion: 'structured-evaluation-v1',
      jobRelatednessConfirmed: true,
      recommendation: 'ADVANCE',
      criteria: [],
      summary: 'Sentetik insan değerlendirmesi gerekçesi.',
      predecessorEvaluationId: null,
      revision: 1,
      createdAt: '2026-07-16T11:00:00Z',
    });
    apiMocks.listRecruiterJobs.mockResolvedValue([]);
    apiMocks.listRecruiterInterviews.mockResolvedValue([]);
    apiMocks.listRecruiterOffers.mockResolvedValue([]);
    apiMocks.createRecruiterInterview.mockResolvedValue(INTERVIEW);
    apiMocks.rescheduleRecruiterInterview.mockResolvedValue(INTERVIEW);
    apiMocks.transitionRecruiterInterview.mockResolvedValue(INTERVIEW);
    apiMocks.submitInterviewScorecard.mockResolvedValue({
      scorecardId: 'isc_abcdefghijklmnopqrstuvwx',
      interviewId: INTERVIEW.interviewId,
      actorRef: 'user:test-recruiter',
      participantLabel: 'Atanmış İK görüşmecisi',
      policyVersion: 'structured-interview-v1',
      jobRelatednessConfirmed: true,
      recommendation: 'HOLD',
      ratings: [],
      summary: 'Sentetik görüşme özeti.',
      predecessorScorecardId: null,
      revision: 1,
      createdAt: '2026-07-20T09:00:00Z',
    });
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the authenticated persistent inbox instead of synthetic cards', async () => {
    renderPage();
    expect(await screen.findByText('Deniz Sentetik')).toBeVisible();
    expect(screen.getByText('deniz@example.test')).toBeVisible();
    expect(screen.getByText('Kalıcı başvuru kutusu')).toHaveAttribute('data-component', 'badge');
    expect(screen.getByText('Kalıcı başvuru kutusu')).toHaveClass(
      'text-component-badge-foreground-default',
    );
    expect(apiMocks.listRecruiterApplications).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Otomatik puanlama, sıralama veya karar/i)).toBeVisible();
  });

  it('keeps the default surface applicant-first and opens job management only on demand', async () => {
    renderPage();
    expect(await screen.findByText('Deniz Sentetik')).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Başvurular' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.queryByTestId('recruiter-jobs-panel')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'İlanlar' }));
    expect(await screen.findByTestId('recruiter-jobs-panel')).toBeVisible();
    expect(screen.queryByTestId('recruiter-pipeline')).not.toBeInTheDocument();
  });

  it('filters the compact applicant list with an explicit stage chip', async () => {
    renderPage();
    expect(await screen.findByText('Deniz Sentetik')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'İncelemede · 0' }));
    expect(screen.queryByText('Deniz Sentetik')).not.toBeInTheDocument();
    expect(screen.getByText('Başvuru bulunamadı')).toBeVisible();
  });

  it('opens the application and performs a versioned human status transition', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Başvuruyu incele' }));
    expect(await screen.findByText('Sentetik profesyonel özet')).toBeVisible();
    expect(apiMocks.getRecruiterApplication).toHaveBeenCalledWith(APPLICATION.publicRef);
    fireEvent.click(screen.getByRole('button', { name: 'İnsan incelemesini başlat' }));
    expect(apiMocks.updateRecruiterApplicationStatus).toHaveBeenCalledWith(
      APPLICATION.publicRef,
      0,
      'UNDER_REVIEW',
    );
    expect(await screen.findByText('Durum güncellendi: İnsan incelemesinde.')).toBeVisible();
  });

  it('opens candidate detail in an accessible drawer and restores the compact workspace on close', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Başvuruyu incele' }));
    expect(await screen.findByRole('dialog', { name: 'Deniz Sentetik' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Aday detayını kapat' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('recruiter-pipeline')).toBeVisible();
  });

  it('shows a helpful authorization message when the candidate detail is forbidden', async () => {
    apiMocks.getRecruiterApplication.mockRejectedValue({
      response: { status: 403 },
      message: 'Request failed with status code 403',
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Başvuruyu incele' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'İK rolünüzün ATS başvuru görüntüleme iznini kontrol edin',
    );
    expect(screen.queryByText('Request failed with status code 403')).not.toBeInTheDocument();
  });

  it('filters the real inbox by candidate or skill', async () => {
    renderPage();
    await screen.findByText('Deniz Sentetik');
    fireEvent.change(screen.getByLabelText('Aday, e-posta veya beceri ara'), {
      target: { value: 'bulunmayan' },
    });
    expect(screen.queryByText('Deniz Sentetik')).not.toBeInTheDocument();
  });

  it('keeps a terminal application read-only on an AA-readable text token', async () => {
    apiMocks.listRecruiterApplications.mockResolvedValue({
      items: [{ ...APPLICATION, status: 'INTERVIEW_PENDING' }],
      page: 0,
      size: 50,
      total: 1,
    });
    apiMocks.getRecruiterApplication.mockResolvedValue({
      application: { ...APPLICATION, status: 'WITHDRAWN' },
      history: [],
      evaluations: [],
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Başvuruyu incele' }));
    expect(await screen.findByText(/terminal durumdadır/i)).toHaveClass('text-text-secondary');
    expect(screen.queryByRole('button', { name: 'Adayı reddet' })).not.toBeInTheDocument();
  });

  it('keeps ATS VIEW users read-only for both jobs and application transitions', async () => {
    permissionMocks.getModuleLevel.mockReturnValue('VIEW');
    renderPage();

    expect(await screen.findByText('Deniz Sentetik')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu incele' }));
    expect(
      await screen.findByText(/değerlendirme ve aşama değiştirme yetkiniz yok/i),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'İnsan incelemesini başlat' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Yeni ilan oluştur' })).not.toBeInTheDocument();
  });

  it('honors explicit ATS action grants without module MANAGE access', async () => {
    permissionMocks.getModuleLevel.mockReturnValue('VIEW');
    permissionMocks.isActionAllowed.mockImplementation(
      (action) => action === 'ATS_JOB_MANAGE' || action === 'ATS_APPLICATION_MANAGE',
    );
    renderPage();

    fireEvent.click(await screen.findByRole('tab', { name: 'İlanlar' }));
    expect(await screen.findByRole('button', { name: 'Yeni ilan oluştur' })).toBeVisible();
    fireEvent.click(screen.getByRole('tab', { name: 'Başvurular' }));
    fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu incele' }));
    expect(await screen.findByRole('button', { name: 'İnsan incelemesini başlat' })).toBeVisible();
  });

  it('records a job-related human scorecard without computing an automatic score', async () => {
    apiMocks.getRecruiterApplication.mockResolvedValue({
      application: { ...APPLICATION, status: 'UNDER_REVIEW' },
      history: [],
      evaluations: [],
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Başvuruyu incele' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Yapılandırılmış değerlendirme yap' }),
    );

    const ratingInputs = screen.getAllByLabelText('Kanıt düzeyi (1–4)');
    const evidenceInputs = screen.getAllByLabelText('İşle ilgili somut kanıt');
    ratingInputs.forEach((input) => fireEvent.change(input, { target: { value: '3' } }));
    evidenceInputs.forEach((input, index) =>
      fireEvent.change(input, { target: { value: `Sentetik işle ilgili kanıt ${index + 1}.` } }),
    );
    fireEvent.change(screen.getByLabelText('Genel gerekçe'), {
      target: { value: 'Sentetik genel insan değerlendirmesi gerekçesi.' },
    });
    fireEvent.click(screen.getByLabelText(/Değerlendirme yalnız ilandaki iş gereklilikleri/i));
    fireEvent.click(screen.getByRole('button', { name: 'Immutable değerlendirmeyi kaydet' }));

    expect(apiMocks.submitRecruiterApplicationEvaluation).toHaveBeenCalledWith(
      APPLICATION.publicRef,
      expect.objectContaining({
        policyVersion: 'structured-evaluation-v1',
        jobRelatednessConfirmed: true,
        recommendation: 'HOLD',
        criteria: expect.arrayContaining([
          expect.objectContaining({ key: 'role_requirements', rating: 3 }),
        ]),
      }),
      'web-job-command-1234',
    );
    expect(screen.queryByText(/otomatik skor/i)).not.toBeInTheDocument();
  });

  it('reloads the current application after a stale-version conflict without fake success', async () => {
    apiMocks.getRecruiterApplication
      .mockResolvedValueOnce({
        application: APPLICATION,
        history: [],
        evaluations: [],
      })
      .mockResolvedValue({
        application: { ...APPLICATION, status: 'UNDER_REVIEW', version: 1 },
        history: [],
        evaluations: [],
      });
    apiMocks.updateRecruiterApplicationStatus.mockRejectedValueOnce(
      new Error('409 sürüm çakışması'),
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Başvuruyu incele' }));
    fireEvent.click(await screen.findByRole('button', { name: 'İnsan incelemesini başlat' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('409 sürüm çakışması');
    expect(apiMocks.getRecruiterApplication).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/Durum güncellendi:/i)).not.toBeInTheDocument();
  });

  it('keeps rejection behind an existing evaluation and explicit irreversible confirmation', async () => {
    const evaluation = {
      evaluationId: 'eval_abcdefghijklmnopqrstuvwx',
      actorRef: 'user:test-recruiter',
      policyVersion: 'structured-evaluation-v1',
      jobRelatednessConfirmed: true,
      recommendation: 'NO_HIRE',
      criteria: [
        {
          key: 'role_requirements',
          label: 'Rol gereklilikleriyle eşleşme',
          rating: 1,
          evidence: 'Sentetik işle ilgili yetersiz kanıt.',
        },
      ],
      summary: 'Sentetik ilerletmeme gerekçesi.',
      predecessorEvaluationId: null,
      revision: 1,
      createdAt: '2026-07-16T11:00:00Z',
    };
    apiMocks.getRecruiterApplication.mockResolvedValue({
      application: { ...APPLICATION, status: 'UNDER_REVIEW' },
      history: [],
      evaluations: [evaluation],
    });
    apiMocks.updateRecruiterApplicationStatus.mockResolvedValue({
      ...APPLICATION,
      status: 'REJECTED',
      version: 2,
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Başvuruyu incele' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Ret kararını hazırla' }));
    const reject = screen.getByRole('button', { name: 'Adayı reddet' });
    expect(reject).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/Son yapılandırılmış değerlendirmeyi inceledim/i));
    fireEvent.click(reject);

    expect(apiMocks.updateRecruiterApplicationStatus).toHaveBeenCalledWith(
      APPLICATION.publicRef,
      0,
      'REJECTED',
    );
    expect(await screen.findByText(/Durum güncellendi: İnsan kararıyla reddedildi/i)).toBeVisible();
  });

  it('plans a persisted interview from the reviewed application with a legal structured rubric', async () => {
    apiMocks.getRecruiterApplication.mockResolvedValue({
      application: { ...APPLICATION, status: 'UNDER_REVIEW', version: 1 },
      history: [],
      evaluations: [EVALUATION],
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Başvuruyu incele' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni görüşme planla' }));

    expect(screen.getByRole('form', { name: 'Yeni görüşme planı' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Görüşmeyi kalıcı olarak planla' }));

    expect(apiMocks.createRecruiterInterview).toHaveBeenCalledWith(
      APPLICATION.publicRef,
      expect.objectContaining({
        type: 'SCREENING',
        timeZone: expect.any(String),
        mode: 'VIDEO',
        participants: [expect.objectContaining({ actorRef: EVALUATION.actorRef, role: 'LEAD' })],
        criteria: expect.arrayContaining([
          expect.objectContaining({ key: 'role_problem_solving' }),
        ]),
      }),
      'web-job-command-1234',
    );
    expect(
      await screen.findByText(/Görüşme planlandı; adayın güvenli takvimine yansıdı/i),
    ).toBeVisible();
    expect(JSON.stringify(apiMocks.createRecruiterInterview.mock.calls[0][1])).not.toMatch(
      /culture fit|yaş|medeni durum/i,
    );
  });

  it('records evidence per interview criterion without producing an automatic decision', async () => {
    apiMocks.getRecruiterApplication.mockResolvedValue({
      application: { ...APPLICATION, status: 'INTERVIEW_PENDING', version: 2 },
      history: [],
      evaluations: [EVALUATION],
    });
    apiMocks.listRecruiterInterviews.mockResolvedValue([INTERVIEW]);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Başvuruyu incele' }));
    fireEvent.click(await screen.findByRole('button', { name: 'İnsan scorecard’ı doldur' }));

    screen
      .getAllByLabelText('Kanıt düzeyi (1–4)')
      .forEach((field) => fireEvent.change(field, { target: { value: '3' } }));
    screen.getAllByLabelText('Somut iş kanıtı').forEach((field, index) =>
      fireEvent.change(field, {
        target: { value: `Sentetik ve işle ilgili görüşme kanıtı ${index + 1}.` },
      }),
    );
    fireEvent.change(screen.getByLabelText('Genel gerekçe'), {
      target: { value: 'Sentetik insan görüşme değerlendirmesi gerekçesi.' },
    });
    fireEvent.click(screen.getByLabelText(/Değerlendirme yalnız işle ilgili rubric/i));
    fireEvent.click(screen.getByRole('button', { name: 'Immutable scorecard’ı kaydet' }));

    expect(apiMocks.submitInterviewScorecard).toHaveBeenCalledWith(
      INTERVIEW.interviewId,
      expect.objectContaining({
        policyVersion: 'structured-interview-v1',
        jobRelatednessConfirmed: true,
        recommendation: 'HOLD',
        ratings: expect.arrayContaining([
          expect.objectContaining({ criterionKey: 'role_problem_solving', rating: 3 }),
        ]),
      }),
      'web-job-command-1234',
    );
    expect(screen.queryByText(/otomatik karar sonucu/i)).not.toBeInTheDocument();
  });
});
