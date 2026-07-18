// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CandidateApplicationPage from './CandidateApplicationPage';

const apiMocks = vi.hoisted(() => ({
  getPublicJob: vi.fn(),
  submitApplication: vi.fn(),
  saveCandidateSession: vi.fn(),
  createApplicationIdempotencyKey: vi.fn(),
  createCandidateAccessToken: vi.fn(),
}));
const resumeMocks = vi.hoisted(() => ({
  parseResumePdf: vi.fn(),
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
vi.mock('./resume-pdf', () => ({
  parseResumePdf: resumeMocks.parseResumePdf,
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
    resumeMocks.parseResumePdf.mockResolvedValue({
      fullName: 'PDF Demo Adayı',
      email: 'pdf.aday@example.test',
      phone: '+90 555 111 22 33',
      city: 'Ankara',
      summary: 'PDF içinden gelen özet',
      experience: 'PDF içinden gelen deneyim',
      education: 'PDF içinden gelen eğitim',
      skills: 'Ürün keşfi, analitik',
    });
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

  it('extracts PDF fields locally, lets the candidate edit them and submits only confirmed fields', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Ürün Yöneticisi' });
    const pdf = new File(['synthetic-pdf'], 'ornek-cv.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByTestId('candidate-resume'), { target: { files: [pdf] } });
    expect(await screen.findByTestId('candidate-resume-meta')).toHaveTextContent(
      '8 boş alan PDF’den dolduruldu',
    );
    expect(screen.getByTestId('candidate-resume-meta')).not.toHaveTextContent('ornek-cv.pdf');
    expect(resumeMocks.parseResumePdf).toHaveBeenCalledWith(pdf);
    expect(screen.getByTestId('candidate-fullName')).toHaveValue('PDF Demo Adayı');
    expect(screen.getByTestId('candidate-email')).toHaveValue('pdf.aday@example.test');

    fireEvent.change(screen.getByTestId('candidate-fullName'), {
      target: { value: 'Aday Tarafından Düzenlendi' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu önizle' }));
    expect(screen.getByTestId('candidate-application-preview')).toHaveTextContent(
      'Aday Tarafından Düzenlendi',
    );
    expect(apiMocks.submitApplication).not.toHaveBeenCalled();
  });

  it('keeps the form usable when a PDF cannot be parsed', async () => {
    resumeMocks.parseResumePdf.mockRejectedValueOnce(new Error('invalid pdf'));
    renderPage();
    await screen.findByRole('heading', { name: 'Ürün Yöneticisi' });
    const pdf = new File(['invalid'], 'bozuk.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByTestId('candidate-resume'), { target: { files: [pdf] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('PDF güvenli biçimde okunamadı');
    expect(screen.getByTestId('candidate-fullName')).toBeEnabled();
  });

  it('does not import a real-email PDF while the synthetic test-data gate is active', async () => {
    resumeMocks.parseResumePdf.mockResolvedValueOnce({
      fullName: 'Gerçek Aday',
      email: 'gercek.aday@example.com',
      phone: '+90 555 999 88 77',
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Ürün Yöneticisi' });
    const pdf = new File(['valid-pdf'], 'gercek-cv.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByTestId('candidate-resume'), { target: { files: [pdf] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'yalnız .test uzantılı sentetik e-posta',
    );
    expect(screen.getByTestId('candidate-fullName')).toHaveValue('');
    expect(screen.getByTestId('candidate-email')).toHaveValue('');
  });

  it('locks preview during parsing and fills only fields the candidate left empty', async () => {
    let resolveResume: (value: Record<string, string>) => void = () => undefined;
    resumeMocks.parseResumePdf.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveResume = resolve;
      }),
    );
    renderPage();
    await screen.findByRole('heading', { name: 'Ürün Yöneticisi' });
    fireEvent.click(screen.getByTestId('fill-synthetic-resume'));
    fireEvent.change(screen.getByTestId('candidate-city'), { target: { value: '' } });
    const pdf = new File(['valid-pdf'], 'yavas-cv.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByTestId('candidate-resume'), { target: { files: [pdf] } });

    expect(await screen.findByTestId('candidate-resume-parsing')).toBeVisible();
    expect(screen.getByTestId('candidate-fullName')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Başvuruyu önizle' })).toBeDisabled();

    await act(async () => {
      resolveResume({
        fullName: 'PDF Adayı',
        email: 'pdf.adayi@example.test',
        city: 'Ankara',
      });
    });

    expect(await screen.findByTestId('candidate-resume-meta')).toHaveTextContent(
      '1 boş alan PDF’den dolduruldu',
    );
    expect(screen.getByTestId('candidate-fullName')).toHaveValue('Deniz Yılmaz');
    expect(screen.getByTestId('candidate-city')).toHaveValue('Ankara');
    expect(screen.getByRole('button', { name: 'Başvuruyu önizle' })).toBeEnabled();
  });

  it('discards a superseded PDF result when an older parse resolves last', async () => {
    let resolveFirstResume: (value: Record<string, string>) => void = () => undefined;
    resumeMocks.parseResumePdf
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirstResume = resolve;
        }),
      )
      .mockResolvedValueOnce({
        fullName: 'Yeni PDF Adayı',
        email: 'yeni.pdf@example.test',
      });
    renderPage();
    await screen.findByRole('heading', { name: 'Ürün Yöneticisi' });
    const input = screen.getByTestId('candidate-resume');
    const firstPdf = new File(['first'], 'ilk.pdf', { type: 'application/pdf' });
    const secondPdf = new File(['second'], 'ikinci.pdf', { type: 'application/pdf' });

    fireEvent.change(input, { target: { files: [firstPdf] } });
    expect(await screen.findByTestId('candidate-resume-parsing')).toBeVisible();
    fireEvent.change(input, { target: { files: [secondPdf] } });

    expect(await screen.findByTestId('candidate-resume-meta')).toHaveTextContent(
      '2 boş alan PDF’den dolduruldu',
    );
    expect(screen.getByTestId('candidate-fullName')).toHaveValue('Yeni PDF Adayı');

    await act(async () => {
      resolveFirstResume({
        fullName: 'Eski PDF Adayı',
        email: 'eski.pdf@example.test',
      });
    });

    expect(screen.getByTestId('candidate-fullName')).toHaveValue('Yeni PDF Adayı');
    expect(screen.getByTestId('candidate-email')).toHaveValue('yeni.pdf@example.test');
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
