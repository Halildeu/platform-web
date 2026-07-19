// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CandidatePortalPage from './CandidatePortalPage';

const apiMocks = vi.hoisted(() => ({
  readCandidateSession: vi.fn(),
  getCandidateStatus: vi.fn(),
  getCandidateInterviews: vi.fn(),
  getCandidateOffers: vi.fn(),
  respondCandidateOffer: vi.fn(),
  createApplicationIdempotencyKey: vi.fn(() => 'web-offer-response-1234'),
  withdrawCandidateApplication: vi.fn(),
}));
vi.mock('../../features/ats-portals/api/application-api', () => ({
  readCandidateSession: apiMocks.readCandidateSession,
  getCandidateStatus: apiMocks.getCandidateStatus,
  getCandidateInterviews: apiMocks.getCandidateInterviews,
  getCandidateOffers: apiMocks.getCandidateOffers,
  respondCandidateOffer: apiMocks.respondCandidateOffer,
  createApplicationIdempotencyKey: apiMocks.createApplicationIdempotencyKey,
  withdrawCandidateApplication: apiMocks.withdrawCandidateApplication,
}));

const SESSION = { publicRef: 'app_abcdefghijklmnopqrstuvwx', candidateAccessToken: 'A'.repeat(43) };
const STATUS = {
  publicRef: SESSION.publicRef,
  jobSlug: 'urun-yoneticisi',
  jobTitle: 'Ürün Yöneticisi',
  status: 'UNDER_REVIEW',
  version: 1,
  createdAt: '2026-07-16T10:00:00Z',
  updatedAt: '2026-07-16T11:00:00Z',
  nextAction: 'WAIT_FOR_REVIEW',
  withdrawalAllowed: true,
  history: [
    { status: 'SUBMITTED', occurredAt: '2026-07-16T10:00:00Z' },
    { status: 'UNDER_REVIEW', occurredAt: '2026-07-16T11:00:00Z' },
  ],
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/candidate']}>
      <Routes>
        <Route path="/candidate" element={<CandidatePortalPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('CandidatePortalPage', () => {
  beforeEach(() => {
    apiMocks.readCandidateSession.mockReturnValue(SESSION);
    apiMocks.getCandidateStatus.mockResolvedValue(STATUS);
    apiMocks.getCandidateInterviews.mockResolvedValue([]);
    apiMocks.getCandidateOffers.mockResolvedValue([]);
    apiMocks.withdrawCandidateApplication.mockResolvedValue({
      ...STATUS,
      status: 'WITHDRAWN',
      version: 2,
      nextAction: 'NONE',
      withdrawalAllowed: false,
      updatedAt: '2026-07-16T12:00:00Z',
      history: [...STATUS.history, { status: 'WITHDRAWN', occurredAt: '2026-07-16T12:00:00Z' }],
    });
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('loads minimal persistent status with the session-only tracking credential', async () => {
    renderPage();
    expect((await screen.findAllByText('İnsan incelemesinde')).length).toBeGreaterThan(0);
    expect(screen.getByText(SESSION.publicRef)).toBeVisible();
    expect(
      screen.getByText(/ad, e-posta, telefon veya CV içeriğini geri döndürmez/i),
    ).toBeVisible();
    expect(apiMocks.getCandidateStatus).toHaveBeenCalledWith(SESSION);
    expect(screen.getByRole('heading', { name: 'Durum geçmişi' })).toBeVisible();
    expect(screen.getByText(/sizden bir işlem beklenmiyor/i)).toBeVisible();
    expect(screen.queryByText(/user:|reviewer|scorecard|rationale/i)).not.toBeInTheDocument();
  });

  it('refreshes status from the backend', async () => {
    renderPage();
    await screen.findAllByText('İnsan incelemesinde');
    fireEvent.click(screen.getByRole('button', { name: 'Durumu yenile' }));
    await waitFor(() => expect(apiMocks.getCandidateStatus).toHaveBeenCalledTimes(2));
  });

  it('shows no fake journey when this browser session has no tracking token', () => {
    apiMocks.readCandidateSession.mockReturnValue(null);
    renderPage();
    expect(
      screen.getByRole('heading', { name: 'Bu sekmede takip edilen başvuru yok' }),
    ).toBeVisible();
    expect(apiMocks.getCandidateStatus).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation and renders the terminal withdrawal result', async () => {
    renderPage();
    await screen.findAllByText('İnsan incelemesinde');
    fireEvent.click(screen.getByRole('button', { name: 'Geri çekme onayını aç' }));
    const submit = screen.getByRole('button', { name: 'Başvuruyu geri çek' });
    expect(submit).toBeDisabled();
    fireEvent.click(
      screen.getByLabelText(/Başvurumu geri çekmek istediğimi ve işlemin geri alınamayacağını/i),
    );
    fireEvent.click(submit);

    expect(apiMocks.withdrawCandidateApplication).toHaveBeenCalledWith(SESSION);
    expect((await screen.findAllByText('Başvuru geri çekildi')).length).toBeGreaterThan(0);
    expect(screen.getByRole('status')).toHaveTextContent('Başvurunuz geri çekildi');
    expect(screen.queryByRole('button', { name: 'Geri çekme onayını aç' })).not.toBeInTheDocument();
  });

  it('shows only the candidate-safe interview schedule and no internal evaluation data', async () => {
    apiMocks.getCandidateInterviews.mockResolvedValue([
      {
        interviewId: 'int_abcdefghijklmnopqrstuvwx',
        type: 'SCREENING',
        startsAt: '2026-07-20T07:00:00Z',
        endsAt: '2026-07-20T08:00:00Z',
        timeZone: 'Europe/Istanbul',
        mode: 'VIDEO',
        location: 'https://meet.example.test/sentetik',
        status: 'SCHEDULED',
        updatedAt: '2026-07-18T10:00:00Z',
        actorRef: 'must-not-render',
        scorecards: [{ summary: 'must-not-render' }],
        internalReason: 'must-not-render',
      },
    ]);

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Ön görüşme' })).toBeVisible();
    expect(screen.getByText('Saat dilimi: Europe/Istanbul')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Güvenli görüşme bağlantısını aç' })).toHaveAttribute(
      'href',
      'https://meet.example.test/sentetik',
    );
    expect(screen.queryByText('must-not-render')).not.toBeInTheDocument();
    expect(apiMocks.getCandidateInterviews).toHaveBeenCalledWith(SESSION);
  });

  it('shows candidate-safe offer terms and records an explicitly acknowledged response', async () => {
    const offer = {
      offerId: 'off_abcdefghijklmnopqrstuvwx',
      applicationPublicRef: SESSION.publicRef,
      jobTitle: 'Ürün Yöneticisi',
      roleTitle: 'Kıdemli Ürün Yöneticisi',
      startDate: '2026-08-03',
      employmentType: 'Tam zamanlı',
      workMode: 'HYBRID',
      location: 'İstanbul',
      compensationAmount: 120000,
      currency: 'TRY',
      payPeriod: 'MONTHLY',
      expiresAt: '2026-07-25T12:00:00Z',
      termsSummary: 'Sentetik teklif koşulları ve yan haklar özeti.',
      status: 'EXTENDED',
      version: 1,
      updatedAt: '2026-07-18T12:00:00Z',
      legalBoundary: 'Bu yanıt ATS sürecini kaydeder; ayrı iş sözleşmesi veya e-imza değildir.',
      actorRef: 'must-not-render',
      revisions: [{ reason: 'must-not-render' }],
    };
    apiMocks.getCandidateStatus.mockResolvedValue({
      ...STATUS,
      status: 'OFFER_PENDING',
      nextAction: 'REVIEW_OFFER',
      withdrawalAllowed: false,
    });
    apiMocks.getCandidateOffers.mockResolvedValue([offer]);
    apiMocks.respondCandidateOffer.mockResolvedValue({ ...offer, status: 'ACCEPTED', version: 2 });

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Kıdemli Ürün Yöneticisi' })).toBeVisible();
    expect(screen.getByText((content) => content.includes('120.000'))).toBeVisible();
    expect(screen.getByText(/ayrı iş sözleşmesi veya e-imza değildir/i)).toBeVisible();
    expect(screen.queryByText('must-not-render')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Teklifi kabul etmeyi hazırla' }));
    const submit = screen.getByRole('button', { name: 'Kabul yanıtını kalıcı kaydet' });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/yalnız ATS süreç yanıtı olduğunu/i));
    fireEvent.click(submit);

    expect(apiMocks.respondCandidateOffer).toHaveBeenCalledWith(
      SESSION,
      offer,
      'ACCEPTED',
      'web-offer-response-1234',
    );
    expect(
      await screen.findByText(/Teklif kabul yanıtınız kalıcı olarak kaydedildi/i),
    ).toBeVisible();
  });
});
