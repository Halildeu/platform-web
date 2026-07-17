// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CandidateApplicationPage from './CandidateApplicationPage';

const apiMocks = vi.hoisted(() => ({
  getPublicJob: vi.fn(),
  submitApplication: vi.fn(),
  saveCandidateSession: vi.fn(),
  createApplicationIdempotencyKey: vi.fn(),
  createCandidateAccessToken: vi.fn(),
}));
vi.mock('../../features/ats-portals/api/application-api', () => ({
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
  getPublicJob: apiMocks.getPublicJob,
  submitApplication: apiMocks.submitApplication,
  saveCandidateSession: apiMocks.saveCandidateSession,
  createApplicationIdempotencyKey: apiMocks.createApplicationIdempotencyKey,
  createCandidateAccessToken: apiMocks.createCandidateAccessToken,
}));

const JOB = {
  slug: 'urun-yoneticisi',
  title: 'Ürün Yöneticisi',
  team: 'Ürün',
  location: 'İstanbul',
  mode: 'Hibrit',
  employmentType: 'Tam zamanlı',
  summary: 'Sentetik ilan',
  highlights: ['Ürün keşfi'],
  applicationFields: [
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
  noticeVersion: 'kvkk-application-v1' as const,
};

const RECEIPT = {
  publicRef: 'app_abcdefghijklmnopqrstuvwx',
  candidateAccessToken: 'A'.repeat(43),
  status: 'SUBMITTED',
  version: 0,
  submittedAt: '2026-07-16T10:00:00Z',
  replayed: false,
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/jobs/urun-yoneticisi/apply']}>
      <Routes>
        <Route path="/jobs/:jobSlug/apply" element={<CandidateApplicationPage />} />
      </Routes>
    </MemoryRouter>,
  );

const reachPreview = async () => {
  await screen.findByRole('heading', { name: 'Ürün Yöneticisi' });
  fireEvent.click(screen.getByTestId('fill-synthetic-resume'));
  fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu önizle' }));
  expect(screen.getByTestId('candidate-application-preview')).toBeVisible();
};

describe('CandidateApplicationPage', () => {
  beforeEach(() => {
    apiMocks.getPublicJob.mockResolvedValue(JOB);
    apiMocks.submitApplication.mockResolvedValue(RECEIPT);
    apiMocks.saveCandidateSession.mockReturnValue(true);
    apiMocks.createApplicationIdempotencyKey.mockReturnValue('web-idempotency-123456');
    apiMocks.createCandidateAccessToken.mockReturnValue('A'.repeat(43));
    vi.stubGlobal('scrollTo', vi.fn());
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('submits the editable form to the persistent API and stores tracking only after success', async () => {
    renderPage();
    await reachPreview();
    const confirmations = screen.getAllByRole('checkbox');
    fireEvent.click(confirmations[0]);
    fireEvent.click(confirmations[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu gönder' }));

    expect(await screen.findByRole('heading', { name: 'Başvurunuz kaydedildi' })).toBeVisible();
    expect(screen.getByTestId('candidate-receipt-id')).toHaveTextContent(RECEIPT.publicRef);
    expect(apiMocks.submitApplication).toHaveBeenCalledWith(
      'urun-yoneticisi',
      'web-idempotency-123456',
      'A'.repeat(43),
      expect.objectContaining({
        email: 'deniz.yilmaz@example.test',
        skills: expect.arrayContaining(['Ürün keşfi', 'erişilebilirlik']),
        noticeVersion: 'kvkk-application-v1',
        accuracyConfirmedAt: expect.any(String),
      }),
      undefined,
    );
    expect(apiMocks.saveCandidateSession).toHaveBeenCalledWith(RECEIPT);
  });

  it('does not show a receipt when the backend rejects submission', async () => {
    apiMocks.submitApplication.mockRejectedValueOnce(new Error('rate limited'));
    renderPage();
    await reachPreview();
    screen.getAllByRole('checkbox').forEach((checkbox) => fireEvent.click(checkbox));
    fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu gönder' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('rate limited');
    expect(screen.queryByTestId('candidate-application-receipt')).not.toBeInTheDocument();
    expect(apiMocks.saveCandidateSession).not.toHaveBeenCalled();
  });

  it('keeps selected PDF bytes local while form fields can still be submitted', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Ürün Yöneticisi' });
    const pdf = new File(['synthetic-pdf'], 'ornek-cv.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByTestId('candidate-resume'), { target: { files: [pdf] } });
    expect(screen.getByTestId('candidate-resume-meta')).toHaveTextContent('dosya adı tutulmaz');
    expect(screen.getByTestId('candidate-resume-meta')).not.toHaveTextContent('ornek-cv.pdf');
    expect(apiMocks.submitApplication).not.toHaveBeenCalled();
  });

  it('blocks preview when required fields are missing', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Ürün Yöneticisi' });
    fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu önizle' }));
    expect(screen.getByRole('alert')).toHaveTextContent('yıldızlı alanları doldurun');
  });

  it('blocks real candidate PII while the test environment G0 gate is active', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Ürün Yöneticisi' });
    fireEvent.click(screen.getByTestId('fill-synthetic-resume'));
    fireEvent.change(screen.getByLabelText(/E-posta/i), {
      target: { value: 'gercek.aday@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu önizle' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Yalnız .test uzantılı sentetik e-posta');
    expect(apiMocks.submitApplication).not.toHaveBeenCalled();
  });

  it('shows a service error and keeps persistent submission disabled if the job cannot load', async () => {
    apiMocks.getPublicJob.mockRejectedValueOnce(new Error('ilan yok'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('ilan yok');
    fireEvent.click(screen.getByTestId('fill-synthetic-resume'));
    fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu önizle' }));
    screen.getAllByRole('checkbox').forEach((checkbox) => fireEvent.click(checkbox));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Başvuruyu gönder' })).toBeDisabled(),
    );
  });
});
