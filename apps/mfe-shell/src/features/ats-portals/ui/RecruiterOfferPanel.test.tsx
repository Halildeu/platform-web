// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import RecruiterOfferPanel from './RecruiterOfferPanel';

const apiMocks = vi.hoisted(() => ({
  listRecruiterOffers: vi.fn(),
  createRecruiterOffer: vi.fn(),
  updateRecruiterOffer: vi.fn(),
  transitionRecruiterOffer: vi.fn(),
  createApplicationIdempotencyKey: vi.fn(() => 'web-offer-command-1234'),
}));

vi.mock('../api/application-api', () => ({
  listRecruiterOffers: apiMocks.listRecruiterOffers,
  createRecruiterOffer: apiMocks.createRecruiterOffer,
  updateRecruiterOffer: apiMocks.updateRecruiterOffer,
  transitionRecruiterOffer: apiMocks.transitionRecruiterOffer,
  createApplicationIdempotencyKey: apiMocks.createApplicationIdempotencyKey,
}));

const PUBLIC_REF = 'app_abcdefghijklmnopqrstuvwx';
const OFFER = {
  offerId: 'off_abcdefghijklmnopqrstuvwx',
  applicationPublicRef: PUBLIC_REF,
  jobSlug: 'urun-yoneticisi',
  jobTitle: 'Ürün Yöneticisi',
  candidateName: 'Deniz Sentetik',
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
  status: 'DRAFT',
  version: 0,
  revisions: [
    {
      version: 0,
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
      status: 'DRAFT',
      reason: 'İnsan kontrollü teklif taslağı oluşturuldu',
      actorRef: 'user:test-recruiter',
      occurredAt: '2026-07-18T12:00:00Z',
    },
  ],
  createdAt: '2026-07-18T12:00:00Z',
  updatedAt: '2026-07-18T12:00:00Z',
};

const renderPanel = (overrides?: Partial<React.ComponentProps<typeof RecruiterOfferPanel>>) =>
  render(
    <RecruiterOfferPanel
      publicRef={PUBLIC_REF}
      jobTitle="Ürün Yöneticisi"
      candidateLocation="İstanbul"
      applicationStatus="INTERVIEW_PENDING"
      canManage
      onApplicationRefresh={vi.fn().mockResolvedValue(undefined)}
      {...overrides}
    />,
  );

describe('RecruiterOfferPanel', () => {
  beforeEach(() => {
    apiMocks.listRecruiterOffers.mockResolvedValue([]);
    apiMocks.createRecruiterOffer.mockResolvedValue(OFFER);
    apiMocks.updateRecruiterOffer.mockResolvedValue({ ...OFFER, version: 1 });
    apiMocks.transitionRecruiterOffer.mockResolvedValue({
      ...OFFER,
      status: 'EXTENDED',
      version: 1,
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('creates a persisted candidate-hidden draft with explicit terms and no tenant field', async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Teklif taslağı oluştur' }));
    fireEvent.change(screen.getByLabelText('Brüt ücret'), { target: { value: '120000' } });
    fireEvent.change(screen.getByLabelText('Teklif özeti'), {
      target: { value: 'Sentetik teklif koşulları ve yan haklar özeti.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Taslağı kalıcı kaydet' }));

    await waitFor(() => expect(apiMocks.createRecruiterOffer).toHaveBeenCalledTimes(1));
    expect(apiMocks.createRecruiterOffer).toHaveBeenCalledWith(
      PUBLIC_REF,
      expect.objectContaining({
        roleTitle: 'Ürün Yöneticisi',
        compensationAmount: 120000,
        currency: 'TRY',
        payPeriod: 'MONTHLY',
        workMode: 'HYBRID',
        expiresAt: expect.any(String),
      }),
      'web-offer-command-1234',
    );
    expect(apiMocks.createRecruiterOffer.mock.calls[0][1]).not.toHaveProperty('tenantId');
    expect(await screen.findByText(/henüz adaya görünmez/i)).toBeVisible();
  });

  it('keeps extension behind an explicit reason and human confirmation', async () => {
    apiMocks.listRecruiterOffers.mockResolvedValue([OFFER]);
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Adaya iletmeyi hazırla' }));
    const submit = screen.getByRole('button', { name: 'Teklifi adaya ilet' });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText('İnsan kararı gerekçesi'), {
      target: { value: 'Koşullar insan tarafından kontrol edildi' },
    });
    fireEvent.click(screen.getByLabelText(/Koşulları, ücret dönemini ve yanıt son tarihini/i));
    fireEvent.click(submit);

    await waitFor(() => expect(apiMocks.transitionRecruiterOffer).toHaveBeenCalledTimes(1));
    expect(apiMocks.transitionRecruiterOffer).toHaveBeenCalledWith(
      PUBLIC_REF,
      OFFER,
      'EXTENDED',
      'Koşullar insan tarafından kontrol edildi',
      'web-offer-command-1234',
    );
  });

  it('allows hire only from candidate-accepted state with a contract-boundary acknowledgement', async () => {
    const accepted = { ...OFFER, status: 'ACCEPTED', version: 2 };
    apiMocks.listRecruiterOffers.mockResolvedValue([accepted]);
    apiMocks.transitionRecruiterOffer.mockResolvedValue({
      ...accepted,
      status: 'HIRED',
      version: 3,
    });
    renderPanel({ applicationStatus: 'OFFER_ACCEPTED' });
    fireEvent.click(await screen.findByRole('button', { name: 'İşe alım sonucunu hazırla' }));
    fireEvent.change(screen.getByLabelText('İnsan kararı gerekçesi'), {
      target: { value: 'Aday kabulü insan tarafından doğrulandı' },
    });
    fireEvent.click(screen.getByLabelText(/ayrı iş sözleşmesi\/e-imza yerine geçmez/i));
    fireEvent.click(screen.getByRole('button', { name: 'İşe alındı olarak kaydet' }));

    await waitFor(() => expect(apiMocks.transitionRecruiterOffer).toHaveBeenCalledTimes(1));
    expect(apiMocks.transitionRecruiterOffer).toHaveBeenCalledWith(
      PUBLIC_REF,
      accepted,
      'HIRED',
      'Aday kabulü insan tarafından doğrulandı',
      'web-offer-command-1234',
    );
  });

  it('keeps a VIEW-only recruiter read-only', async () => {
    apiMocks.listRecruiterOffers.mockResolvedValue([OFFER]);
    renderPanel({ canManage: false });
    expect(await screen.findByText('Kıdemli Ürün Yöneticisi')).toBeVisible();
    expect(screen.getByText(/oluşturma ve durum değiştirme yetkiniz yok/i)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Taslağı düzenle' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Adaya iletmeyi hazırla' }),
    ).not.toBeInTheDocument();
  });
});
