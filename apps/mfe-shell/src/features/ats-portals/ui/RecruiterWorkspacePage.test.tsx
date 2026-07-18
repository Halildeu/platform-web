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
  listRecruiterJobs: apiMocks.listRecruiterJobs,
  createRecruiterJob: apiMocks.createRecruiterJob,
  updateRecruiterJob: apiMocks.updateRecruiterJob,
  transitionRecruiterJob: apiMocks.transitionRecruiterJob,
  createApplicationIdempotencyKey: apiMocks.createApplicationIdempotencyKey,
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

    expect(await screen.findByRole('button', { name: 'Yeni ilan oluştur' })).toBeVisible();
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
});
