// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CandidatePortalPage from './CandidatePortalPage';

const apiMocks = vi.hoisted(() => ({
  readCandidateSession: vi.fn(),
  establishCandidateSession: vi.fn(),
  clearCandidateSession: vi.fn(),
  getCandidateStatus: vi.fn(),
  getCandidateInterviews: vi.fn(),
  getCandidateOffers: vi.fn(),
  respondCandidateOffer: vi.fn(),
  createApplicationIdempotencyKey: vi.fn(() => 'web-offer-response-1234'),
  withdrawCandidateApplication: vi.fn(),
  readCandidateEmailSession: vi.fn(),
  clearCandidateEmailSession: vi.fn(),
  requestCandidateLoginCode: vi.fn(),
  verifyCandidateLoginCode: vi.fn(),
  listCandidateLoginApplications: vi.fn(),
  parseTrackingCredentialFile: vi.fn(),
}));
vi.mock('../../features/ats-portals/api/application-api', () => ({
  readCandidateSession: apiMocks.readCandidateSession,
  establishCandidateSession: apiMocks.establishCandidateSession,
  clearCandidateSession: apiMocks.clearCandidateSession,
  getCandidateStatus: apiMocks.getCandidateStatus,
  getCandidateInterviews: apiMocks.getCandidateInterviews,
  getCandidateOffers: apiMocks.getCandidateOffers,
  respondCandidateOffer: apiMocks.respondCandidateOffer,
  createApplicationIdempotencyKey: apiMocks.createApplicationIdempotencyKey,
  withdrawCandidateApplication: apiMocks.withdrawCandidateApplication,
  readCandidateEmailSession: apiMocks.readCandidateEmailSession,
  clearCandidateEmailSession: apiMocks.clearCandidateEmailSession,
  requestCandidateLoginCode: apiMocks.requestCandidateLoginCode,
  verifyCandidateLoginCode: apiMocks.verifyCandidateLoginCode,
  listCandidateLoginApplications: apiMocks.listCandidateLoginApplications,
  parseTrackingCredentialFile: apiMocks.parseTrackingCredentialFile,
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
    apiMocks.readCandidateEmailSession.mockReturnValue(null);
    apiMocks.requestCandidateLoginCode.mockResolvedValue(undefined);
    apiMocks.listCandidateLoginApplications.mockResolvedValue([]);
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

  it('fills both fields from the tracking file the product itself produced', async () => {
    // #1044: dosyayi BIZ uretiyoruz (#1026). Adaydan 43 karakteri elle
    // kopyalamasini istemenin gerekcesi yok — tek karakter kaymasi girisi
    // reddediyordu.
    apiMocks.readCandidateSession.mockReturnValue(null);
    apiMocks.parseTrackingCredentialFile.mockReturnValue({
      publicRef: 'app_zzzzzzzzzzzzzzzzzzzzzzzz',
      candidateAccessToken: 'Z'.repeat(43),
    });
    renderPage();

    const input = await screen.findByTestId('candidate-tracking-file');
    const file = new File(['Başvuru referansı: app_zzzzzzzzzzzzzzzzzzzzzzzz'], 'basvuru.txt', {
      type: 'text/plain',
    });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId('candidate-sign-in-ref')).toHaveValue(
        'app_zzzzzzzzzzzzzzzzzzzzzzzz',
      );
    });
    expect(screen.getByTestId('candidate-sign-in-token')).toHaveValue('Z'.repeat(43));
    expect(screen.queryByTestId('candidate-sign-in-error')).not.toBeInTheDocument();
  });

  it('leaves the fields untouched when the file has no credential', async () => {
    // Yarim doldurmak adayin neden giremedigini GIZLER; alanlar bos kalir ve
    // hata net konusur.
    apiMocks.readCandidateSession.mockReturnValue(null);
    apiMocks.parseTrackingCredentialFile.mockReturnValue(null);
    renderPage();

    const input = await screen.findByTestId('candidate-tracking-file');
    fireEvent.change(input, {
      target: { files: [new File(['alakasiz metin'], 'not.txt', { type: 'text/plain' })] },
    });

    expect(await screen.findByTestId('candidate-sign-in-error')).toHaveTextContent(
      /bulunamadı/i,
    );
    expect(screen.getByTestId('candidate-sign-in-ref')).toHaveValue('');
    expect(screen.getByTestId('candidate-sign-in-token')).toHaveValue('');
  });

  it('never claims the code was sent, because the server hides whether the address exists',
    async () => {
      // Sunucu sözleşmesi: kayıtlı olmayan adres de 202 alır. Arayüz
      // "gönderdik" derse sunucunun bilerek gizlediği bilgiyi sızdırır.
      renderPage();
      fireEvent.change(screen.getByTestId('candidate-login-email'), {
        target: { value: 'aday@example.test' },
      });
      fireEvent.click(screen.getByTestId('candidate-login-submit'));

      const notice = await screen.findByTestId('candidate-login-notice');
      expect(notice).toHaveTextContent(/başvuru varsa/i);
      expect(notice.textContent ?? '').not.toMatch(/gönderdik|adresinize gönderildi\b/i);
      expect(apiMocks.requestCandidateLoginCode).toHaveBeenCalledWith('aday@example.test');
    });

  it('lists every application of the address after the code is verified', async () => {
    apiMocks.verifyCandidateLoginCode.mockResolvedValue({
      email: 'aday@example.test',
      sessionToken: 'B'.repeat(43),
    });
    apiMocks.listCandidateLoginApplications.mockResolvedValue([
      {
        publicRef: 'app_bbbbbbbbbbbbbbbbbbbbbbbb',
        jobSlug: 'urun-yoneticisi',
        jobTitle: 'Ürün Yöneticisi',
        status: 'UNDER_REVIEW',
        createdAt: '2026-07-20T10:00:00Z',
        updatedAt: '2026-07-20T11:00:00Z',
      },
      {
        publicRef: 'app_cccccccccccccccccccccccc',
        jobSlug: 'kidemli-frontend',
        jobTitle: 'Kıdemli Frontend',
        status: 'INTERVIEW_PENDING',
        createdAt: '2026-07-18T10:00:00Z',
        updatedAt: '2026-07-19T11:00:00Z',
      },
    ]);
    renderPage();
    fireEvent.change(screen.getByTestId('candidate-login-email'), {
      target: { value: 'aday@example.test' },
    });
    fireEvent.click(screen.getByTestId('candidate-login-submit'));
    fireEvent.change(await screen.findByTestId('candidate-login-code'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByTestId('candidate-login-submit'));

    // #226'nın çözdüğü asıl şey: aynı adayın İKİ başvurusu TEK listede.
    expect(await screen.findByTestId('candidate-my-applications')).toBeVisible();
    expect(screen.getByTestId('candidate-my-application-app_bbbbbbbbbbbbbbbbbbbbbbbb')).toBeVisible();
    expect(screen.getByTestId('candidate-my-application-app_cccccccccccccccccccccccc')).toBeVisible();
    expect(screen.getByText(/aday@example\.test adresine ait 2 başvuru/i)).toBeVisible();
    // Aday dili korunur: aşama İK jargonuyla ("Kısa liste") gösterilmez.
    expect(screen.getByText('Mülakat planlaması')).toBeVisible();
    expect(screen.queryByText(/Kısa liste/i)).not.toBeInTheDocument();
  });

  it('surfaces a fail-closed delivery outage instead of pretending success', async () => {
    apiMocks.requestCandidateLoginCode.mockRejectedValue(
      new Error('Kod gönderimi şu anda kullanılamıyor. Takip anahtarınızla girebilirsiniz.'),
    );
    renderPage();
    fireEvent.change(screen.getByTestId('candidate-login-email'), {
      target: { value: 'aday@example.test' },
    });
    fireEvent.click(screen.getByTestId('candidate-login-submit'));

    expect(await screen.findByTestId('candidate-login-error')).toHaveTextContent(
      /kullanılamıyor/i,
    );
    // Arıza varken kod ekranına GEÇMEZ: aday olmayan bir kodu beklerdi.
    expect(screen.queryByTestId('candidate-login-code')).not.toBeInTheDocument();
    expect(screen.queryByTestId('candidate-login-notice')).not.toBeInTheDocument();
  });

  it('offers the key path as a secondary route, not as a rival card', async () => {
    // #1048: iki eşit kart adayı kendi kıyaslamaya zorluyordu. E-posta
    // birincil (her adayda çalışır, TÜM başvuruları getirir); anahtar yedek.
    apiMocks.readCandidateSession.mockReturnValue(null);
    renderPage();

    expect(await screen.findByTestId('candidate-email-login')).toBeVisible();
    const toggle = screen.getByTestId('candidate-key-path-toggle');
    // Kapalı başlar ama DOM'da: klavye ve ekran okuyucu ulaşabilir.
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('candidate-sign-in-token')).toBeVisible();
  });

  it('opens the key path by itself when code delivery is unavailable', async () => {
    // Hata metni zaten "takip anahtarınızla girebilirsiniz" diyordu ama
    // kullanıcıyı o alana GÖTÜRMÜYORDU. Söylemek yetmez, yolu açmak gerekir.
    apiMocks.readCandidateSession.mockReturnValue(null);
    apiMocks.requestCandidateLoginCode.mockRejectedValue(
      new Error('Kod gönderimi şu anda kullanılamıyor. Takip anahtarınızla girebilirsiniz.'),
    );
    renderPage();

    fireEvent.change(await screen.findByTestId('candidate-login-email'), {
      target: { value: 'aday@example.test' },
    });
    fireEvent.click(screen.getByTestId('candidate-login-submit'));

    await waitFor(() =>
      expect(screen.getByTestId('candidate-key-path-toggle')).toHaveAttribute(
        'aria-expanded',
        'true',
      ),
    );
    expect(screen.getByTestId('candidate-sign-in-token')).toBeVisible();
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

  it('keeps the candidate wording as "Mülakat planlaması", not the recruiter word', async () => {
    // #227 B: recruiter tarafinda ayni asamanin adi "Kısa liste" oldu, cunku IK
    // "kaci kisa listeye alinmis" diye soruyor. ADAY o terimi sormuyor; kendi
    // durumunu soruyor. Ayni asamanin iki kitleye iki farkli adi TUTARSIZLIK
    // DEGIL, kitleye uygun dil — bu test olmadan biri iki metni "hizalamak"
    // isteyip adayin ekranina ic jargon tasir.
    apiMocks.getCandidateStatus.mockResolvedValue({ ...STATUS, status: 'INTERVIEW_PENDING' });
    renderPage();

    expect((await screen.findAllByText('Mülakat planlaması')).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Kısa liste/)).not.toBeInTheDocument();
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
    // Sekme oturumu boşken uydurma bir yolculuk gösterilmez; ama artık ÇIKMAZ
    // da değil: #1048 sonrası giriş TEK kartta — e-posta birincil, anahtar
    // yolu onun altında ikincil. İddia "bir giriş yolu var", "şu başlık var"
    // değil; başlık metnine çakılmak tasarımı test etmek olurdu.
    expect(screen.getByTestId('candidate-email-login')).toBeVisible();
    expect(screen.getByTestId('candidate-key-path-toggle')).toBeInTheDocument();
    expect(apiMocks.getCandidateStatus).not.toHaveBeenCalled();
  });

  it('lets the candidate open their application from any device with the receipt pair', async () => {
    // ASIL BOŞLUK: anahtar yalnız `sessionStorage`'daydı ve elle girilebileceği
    // bir yol yoktu. Sekme kapanınca aday başvurusuna kalıcı olarak erişemiyordu
    // — farklı cihaz, farklı tarayıcı, hatta aynı tarayıcıyı kapat-aç bile.
    apiMocks.readCandidateSession.mockReturnValue(null);
    apiMocks.establishCandidateSession.mockReturnValue(SESSION);
    renderPage();

    fireEvent.change(screen.getByTestId('candidate-sign-in-ref'), {
      target: { value: SESSION.publicRef },
    });
    fireEvent.change(screen.getByTestId('candidate-sign-in-token'), {
      target: { value: SESSION.candidateAccessToken },
    });
    fireEvent.click(screen.getByTestId('candidate-sign-in-submit'));

    expect(apiMocks.establishCandidateSession).toHaveBeenCalledWith(
      SESSION.publicRef,
      SESSION.candidateAccessToken,
    );
    expect((await screen.findAllByText('İnsan incelemesinde')).length).toBeGreaterThan(0);
    expect(apiMocks.getCandidateStatus).toHaveBeenCalledWith(SESSION);
    expect(screen.queryByTestId('candidate-sign-in')).not.toBeInTheDocument();
  });

  it('refuses a malformed pair without making a request', () => {
    // Biçim doğrulaması API katmanında; sayfa `null` dönüşünü hata olarak
    // göstermek ZORUNDA, yoksa aday sessiz bir hiçlikle karşılaşır.
    apiMocks.readCandidateSession.mockReturnValue(null);
    apiMocks.establishCandidateSession.mockReturnValue(null);
    renderPage();

    fireEvent.change(screen.getByTestId('candidate-sign-in-ref'), { target: { value: 'app_kisa' } });
    fireEvent.change(screen.getByTestId('candidate-sign-in-token'), { target: { value: 'bozuk' } });
    fireEvent.click(screen.getByTestId('candidate-sign-in-submit'));

    expect(screen.getByTestId('candidate-sign-in-error')).toHaveTextContent(
      /beklenen biçimde değil/i,
    );
    expect(apiMocks.getCandidateStatus).not.toHaveBeenCalled();
    expect(screen.getByTestId('candidate-sign-in')).toBeVisible();
  });

  it('offers a way back to the form when the pair does not resolve', async () => {
    // Yanlış çiftle girildiğinde çıkış yolu olmazsa aday hatalı oturumda
    // kilitli kalır ve doğru anahtarı hiç giremez.
    apiMocks.getCandidateStatus.mockRejectedValue(new Error('başvuru bulunamadı'));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('başvuru bulunamadı');
    fireEvent.click(screen.getByTestId('candidate-sign-in-again'));

    expect(apiMocks.clearCandidateSession).toHaveBeenCalled();
    expect(screen.getByTestId('candidate-sign-in')).toBeVisible();
  });

  it('clears the tracking credential from a shared device on sign-out', async () => {
    renderPage();
    await screen.findAllByText('İnsan incelemesinde');
    fireEvent.click(screen.getByTestId('candidate-sign-out'));

    expect(apiMocks.clearCandidateSession).toHaveBeenCalled();
    expect(screen.getByTestId('candidate-sign-in')).toBeVisible();
    expect(screen.queryByText(SESSION.publicRef)).not.toBeInTheDocument();
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
