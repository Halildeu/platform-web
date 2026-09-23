// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  readCandidateSessions: vi.fn(),
  selectCandidateSession: vi.fn(),
  removeCandidateSession: vi.fn(),
  rememberCandidateApplicationSummary: vi.fn(),
}));
vi.mock('../../features/ats-portals/api/application-api', () => ({
  readCandidateSessions: apiMocks.readCandidateSessions,
  selectCandidateSession: apiMocks.selectCandidateSession,
  removeCandidateSession: apiMocks.removeCandidateSession,
  rememberCandidateApplicationSummary: apiMocks.rememberCandidateApplicationSummary,
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

/** #1059: elle giriş artık bir SEÇENEK; gerçek aday da önce onu seçiyor. */
const chooseManualOption = async () => {
  fireEvent.click(await screen.findByTestId('candidate-signin-option-manual'));
};

describe('CandidatePortalPage', () => {
  beforeEach(() => {
    apiMocks.readCandidateSession.mockReturnValue(SESSION);
    // Tek başvurulu sekme: geçiş listesi görünmez, mevcut testler etkilenmez.
    apiMocks.readCandidateSessions.mockReturnValue({
      activeRef: SESSION.publicRef,
      entries: [{ ...SESSION, addedAt: '2026-07-16T10:00:00Z' }],
    });
    apiMocks.removeCandidateSession.mockReturnValue(null);
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

  it('presents three equal ways in, with email first', async () => {
    // #1059: önceki tasarımda e-posta bir kart, diğer ikisi TEK bir katlanır
    // bölümün içindeydi ve dosya yükleme elle girişin İÇİNE gömülüydü — aday
    // üçüncü yolun varlığını ancak ikinciyi açınca görüyordu.
    apiMocks.readCandidateSession.mockReturnValue(null);
    renderPage();

    const email = await screen.findByTestId('candidate-signin-option-email');
    const file = screen.getByTestId('candidate-signin-option-file');
    const manual = screen.getByTestId('candidate-signin-option-manual');
    // Üçü de İLK BAKIŞTA görünür; hiçbiri diğerinin içinde saklı değil.
    [email, file, manual].forEach((option) => expect(option).toBeVisible());
    // Varsayılan e-posta: her adayda çalışır ve TÜM başvuruları getirir.
    expect(email).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('candidate-signin-pane-email')).not.toHaveAttribute('hidden');
    // Seçilmeyen bölmeler GİZLİ olmalı. Yalnız "seçilen görünür" demek yetmez:
    // gizleme koşulunu kaldırınca test yeşil kalıyordu (mutasyonla ölçüldü) ve
    // üç yol aynı anda açık görünürdü — seçim anlamsızlaşırdı.
    expect(screen.getByTestId('candidate-signin-pane-file')).toHaveAttribute('hidden');
    expect(screen.getByTestId('candidate-signin-pane-manual')).toHaveAttribute('hidden');

    fireEvent.click(manual);
    expect(manual).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('candidate-signin-pane-manual')).not.toHaveAttribute('hidden');
    expect(screen.getByTestId('candidate-signin-pane-email')).toHaveAttribute('hidden');

    fireEvent.click(file);
    expect(screen.getByTestId('candidate-signin-pane-file')).not.toHaveAttribute('hidden');
    expect(screen.getByTestId('candidate-tracking-file')).toBeInTheDocument();
  });

  it('renders every option pane inside the same card as the selector', async () => {
    // #1062 SAHIP BILDIRIMI: "tasarımlar farklı farklı yerlerde". Seçenekler
    // bir kartta, seçilenin içeriği BAŞKA bir kartta açılıyordu; seçim ile
    // sonucu ayırmak kullanıcıya iki ayrı şeymiş gibi görünüyordu.
    apiMocks.readCandidateSession.mockReturnValue(null);
    renderPage();

    const card = (await screen.findByTestId('candidate-email-login')) as HTMLElement;
    for (const pane of ['email', 'file', 'manual'] as const) {
      // Üç bölme de SEÇİCİNİN kartının içinde olmalı.
      expect(card).toContainElement(screen.getByTestId(`candidate-signin-pane-${pane}`));
    }
    expect(card).toContainElement(screen.getByTestId('candidate-open-positions'));
    // Ayrı kart artık YOK.
    expect(screen.queryByTestId('candidate-sign-in')).not.toBeInTheDocument();
  });

  it('keeps the way out to open positions on every option', async () => {
    // Bu yönlendirme elle giriş bölmesinin İÇİNDEYDİ; e-posta seçiliyken
    // kayboluyordu ve o yolda kalan adayın ilanlara dönecek bağlantısı
    // olmuyordu. Seçenekten bağımsız olduğu için kartın altında durmalı.
    apiMocks.readCandidateSession.mockReturnValue(null);
    renderPage();
    for (const option of ['email', 'file', 'manual'] as const) {
      fireEvent.click(await screen.findByTestId(`candidate-signin-option-${option}`));
      expect(screen.getByTestId('candidate-open-positions')).toBeVisible();
    }
  });

  it('switches to the manual option by itself when code delivery is unavailable', async () => {
    // Hata metni "takip anahtarınızla girebilirsiniz" diyordu ama kullanıcıyı o
    // yola GÖTÜRMÜYORDU. Söylemek yetmez.
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
      expect(screen.getByTestId('candidate-signin-option-manual')).toHaveAttribute(
        'aria-checked',
        'true',
      ),
    );
    expect(screen.getByTestId('candidate-sign-in-token')).toBeVisible();
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

  it('shows a controlled fallback instead of crashing on an unknown status', async () => {
    // #965: sunucu kapalı enum'a yeni bir durum eklerse eski web paketi o
    // değeri tanımaz. Kopya lookup'ı boş dönüp `.label` okununca sayfa
    // tamamen çöküyordu; aday kendi başvurusunu hiç göremiyordu.
    apiMocks.getCandidateStatus.mockResolvedValue({
      ...STATUS,
      status: 'ON_HOLD',
      nextAction: 'SIGN_DOCUMENTS',
      history: [...STATUS.history, { status: 'ON_HOLD', occurredAt: '2026-07-16T12:00:00Z' }],
    });
    renderPage();

    // Güncel durum kartı, geçmiş ve özet: üç yer de aynı kontrollü metni gösterir.
    expect((await screen.findAllByText('Güncel durum gösterilemiyor')).length).toBe(3);
    expect(screen.getByText(/güncel durumu bu ekranda henüz gösteremiyoruz/i)).toBeVisible();
    expect(screen.getByText(/Bu adımın açıklaması bu ekranda henüz yok/i)).toBeVisible();
    // Bilinen geçmiş adımları olduğu gibi kalır; ham sunucu kodu adaya gösterilmez.
    expect(screen.getByText('Başvuru alındı')).toBeVisible();
    expect(screen.queryByText(/ON_HOLD|SIGN_DOCUMENTS/)).not.toBeInTheDocument();
    expect(screen.getByText(SESSION.publicRef)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Durumu yenile' })).toBeVisible();
  });

  it('keeps the address list usable when one application has an unknown status', async () => {
    apiMocks.verifyCandidateLoginCode.mockResolvedValue({
      email: 'aday@example.test',
      sessionToken: 'B'.repeat(43),
    });
    apiMocks.listCandidateLoginApplications.mockResolvedValue([
      {
        publicRef: 'app_bbbbbbbbbbbbbbbbbbbbbbbb',
        jobSlug: 'urun-yoneticisi',
        jobTitle: 'Ürün Yöneticisi',
        status: 'ON_HOLD',
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

    const unknown = await screen.findByTestId(
      'candidate-my-application-app_bbbbbbbbbbbbbbbbbbbbbbbb',
    );
    expect(unknown).toHaveTextContent('Güncel durum gösterilemiyor');
    expect(unknown).not.toHaveTextContent('ON_HOLD');
    expect(
      screen.getByTestId('candidate-my-application-app_cccccccccccccccccccccccc'),
    ).toHaveTextContent('Mülakat planlaması');
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
    expect(screen.getByTestId('candidate-signin-option-email')).toBeVisible();
    expect(screen.getByTestId('candidate-signin-option-manual')).toBeVisible();
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
    fireEvent.click(screen.getByTestId('candidate-signin-option-manual'));

    fireEvent.change(screen.getByTestId('candidate-sign-in-ref'), { target: { value: 'app_kisa' } });
    fireEvent.change(screen.getByTestId('candidate-sign-in-token'), { target: { value: 'bozuk' } });
    fireEvent.click(screen.getByTestId('candidate-sign-in-submit'));

    expect(screen.getByTestId('candidate-sign-in-error')).toHaveTextContent(
      /beklenen biçimde değil/i,
    );
    expect(apiMocks.getCandidateStatus).not.toHaveBeenCalled();
    // #1062: ayrı kart yok; iddia "giriş formu kullanılabilir".
    expect(screen.getByTestId('candidate-signin-pane-manual')).not.toHaveAttribute('hidden');
  });

  it('offers a way back to the form when the pair does not resolve', async () => {
    // Yanlış çiftle girildiğinde çıkış yolu olmazsa aday hatalı oturumda
    // kilitli kalır ve doğru anahtarı hiç giremez.
    apiMocks.getCandidateStatus.mockRejectedValue(new Error('başvuru bulunamadı'));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('başvuru bulunamadı');
    fireEvent.click(screen.getByTestId('candidate-sign-in-again'));

    // #965: yalnız çözülemeyen çift sekmeden çıkar; aynı sekmedeki diğer
    // başvuruların anahtarları silinmez.
    expect(apiMocks.removeCandidateSession).toHaveBeenCalledWith(SESSION.publicRef);
    expect(apiMocks.clearCandidateSession).not.toHaveBeenCalled();
    // #1062: ayrı kart yok; iddia "giriş formu kullanılabilir".
    expect(screen.getByTestId('candidate-signin-pane-manual')).not.toHaveAttribute('hidden');
  });

  it('clears the tracking credential from a shared device on sign-out', async () => {
    renderPage();
    await chooseManualOption();
    await screen.findAllByText('İnsan incelemesinde');
    fireEvent.click(screen.getByTestId('candidate-sign-out'));

    expect(apiMocks.clearCandidateSession).toHaveBeenCalled();
    // #1062: ayrı kart yok; iddia "giriş formu kullanılabilir".
    expect(screen.getByTestId('candidate-signin-pane-manual')).not.toHaveAttribute('hidden');
    expect(screen.queryByText(SESSION.publicRef)).not.toBeInTheDocument();
  });

  describe('several applications in one tab (#965)', () => {
    const REF_A = `app_${'a'.repeat(24)}`;
    const REF_B = `app_${'b'.repeat(24)}`;
    const PAIR_A = { publicRef: REF_A, candidateAccessToken: 'A'.repeat(43) };
    const PAIR_B = { publicRef: REF_B, candidateAccessToken: 'B'.repeat(43) };
    const STATUS_A = { ...STATUS, publicRef: REF_A, jobTitle: 'Ürün Yöneticisi' };
    const STATUS_B = {
      ...STATUS,
      publicRef: REF_B,
      jobSlug: 'kidemli-frontend',
      jobTitle: 'Kıdemli Frontend',
      status: 'SUBMITTED',
      history: [{ status: 'SUBMITTED', occurredAt: '2026-07-17T10:00:00Z' }],
    };
    type Api = typeof import('../../features/ats-portals/api/application-api');
    let actual: Api;

    /** Depolama katmanı gerçek: geçişin sekme depolamasında kalıcı olduğu da sınanır. */
    beforeEach(async () => {
      actual = await vi.importActual<Api>('../../features/ats-portals/api/application-api');
      window.sessionStorage.clear();
      apiMocks.readCandidateSession.mockImplementation(actual.readCandidateSession);
      apiMocks.readCandidateSessions.mockImplementation(actual.readCandidateSessions);
      apiMocks.establishCandidateSession.mockImplementation(actual.establishCandidateSession);
      apiMocks.clearCandidateSession.mockImplementation(actual.clearCandidateSession);
      apiMocks.selectCandidateSession.mockImplementation(actual.selectCandidateSession);
      apiMocks.removeCandidateSession.mockImplementation(actual.removeCandidateSession);
      apiMocks.rememberCandidateApplicationSummary.mockImplementation(
        actual.rememberCandidateApplicationSummary,
      );
      apiMocks.getCandidateStatus.mockImplementation(async (pair: { publicRef: string }) =>
        pair.publicRef === REF_A ? STATUS_A : STATUS_B,
      );
      // A önce, B sonra açıldı: B etkin. A'nın özeti daha önceki bir yüklemeden.
      actual.establishCandidateSession(PAIR_A.publicRef, PAIR_A.candidateAccessToken);
      actual.rememberCandidateApplicationSummary(REF_A, {
        jobTitle: 'Ürün Yöneticisi',
        status: 'UNDER_REVIEW',
        createdAt: '2026-07-16T10:00:00Z',
      });
      actual.establishCandidateSession(PAIR_B.publicRef, PAIR_B.candidateAccessToken);
    });
    afterEach(() => {
      window.sessionStorage.clear();
    });

    const openA = () =>
      fireEvent.click(screen.getByRole('button', { name: 'Ürün Yöneticisi başvurusunu aç' }));

    it('lists the applications of this tab and switches between them', async () => {
      renderPage();
      await waitFor(() => expect(apiMocks.getCandidateStatus).toHaveBeenLastCalledWith(PAIR_B));

      const list = await screen.findByTestId('candidate-tab-applications');
      expect(list).toBeVisible();
      // B'nin ilan ve durumu, B yüklendikten sonra listeye not edildi.
      await waitFor(() =>
        expect(screen.getByTestId(`candidate-tab-application-${REF_B}`)).toHaveTextContent(
          'Kıdemli Frontend',
        ),
      );
      expect(screen.getByTestId(`candidate-tab-application-${REF_B}`)).toHaveTextContent(
        'Başvuru alındı',
      );
      expect(screen.getByTestId(`candidate-tab-application-${REF_B}`)).toHaveAttribute(
        'aria-current',
        'true',
      );
      expect(screen.getByTestId(`candidate-tab-application-${REF_A}`)).toHaveTextContent(
        'İnsan incelemesinde',
      );

      openA();

      await waitFor(() => expect(apiMocks.getCandidateStatus).toHaveBeenLastCalledWith(PAIR_A));
      expect(apiMocks.getCandidateInterviews).toHaveBeenLastCalledWith(PAIR_A);
      expect(apiMocks.getCandidateOffers).toHaveBeenLastCalledWith(PAIR_A);
      expect(screen.getByTestId(`candidate-tab-application-${REF_A}`)).toHaveAttribute(
        'aria-current',
        'true',
      );
      expect(screen.getByTestId(`candidate-tab-application-${REF_B}`)).not.toHaveAttribute(
        'aria-current',
      );
    });

    it('keeps the selected application after the page is reloaded', async () => {
      renderPage();
      await screen.findByTestId('candidate-tab-applications');
      openA();
      await waitFor(() => expect(apiMocks.getCandidateStatus).toHaveBeenLastCalledWith(PAIR_A));

      cleanup();
      apiMocks.getCandidateStatus.mockClear();
      renderPage();

      await waitFor(() => expect(apiMocks.getCandidateStatus).toHaveBeenCalledWith(PAIR_A));
      expect(apiMocks.getCandidateStatus).not.toHaveBeenCalledWith(PAIR_B);
    });

    it('does not carry a withdrawal confirmation over to another application', async () => {
      renderPage();
      await screen.findAllByText('Başvuru alındı');
      fireEvent.click(screen.getByRole('button', { name: 'Geri çekme onayını aç' }));
      fireEvent.click(
        screen.getByLabelText(/Başvurumu geri çekmek istediğimi ve işlemin geri alınamayacağını/i),
      );
      expect(screen.getByRole('button', { name: 'Başvuruyu geri çek' })).toBeEnabled();

      openA();
      await waitFor(() => expect(apiMocks.getCandidateStatus).toHaveBeenLastCalledWith(PAIR_A));

      // B için verilen onay A'ya taşınmaz: panel kapalı, yeniden açınca onay boş.
      expect(screen.queryByRole('button', { name: 'Başvuruyu geri çek' })).not.toBeInTheDocument();
      fireEvent.click(await screen.findByRole('button', { name: 'Geri çekme onayını aç' }));
      const submit = screen.getByRole('button', { name: 'Başvuruyu geri çek' });
      expect(submit).toBeDisabled();

      fireEvent.click(
        screen.getByLabelText(/Başvurumu geri çekmek istediğimi ve işlemin geri alınamayacağını/i),
      );
      fireEvent.click(submit);
      await waitFor(() => expect(apiMocks.withdrawCandidateApplication).toHaveBeenCalledTimes(1));
      expect(apiMocks.withdrawCandidateApplication).toHaveBeenCalledWith(PAIR_A);
    });

    it.each(['success', 'failure'] as const)(
      'ignores a pending withdrawal %s after switching applications',
      async (outcome) => {
        let finish: () => void = () => undefined;
        apiMocks.withdrawCandidateApplication.mockImplementation(
          () =>
            new Promise((resolve, reject) => {
              finish = () =>
                outcome === 'success'
                  ? resolve({ ...STATUS_B, status: 'WITHDRAWN', withdrawalAllowed: false })
                  : reject(new Error('Previous application withdrawal failed'));
            }),
        );
        renderPage();
        await screen.findByText(REF_B, { selector: 'dd' });
        fireEvent.click(screen.getByRole('button', { name: 'Geri çekme onayını aç' }));
        fireEvent.click(
          screen.getByLabelText(
            /Başvurumu geri çekmek istediğimi ve işlemin geri alınamayacağını/i,
          ),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu geri çek' }));
        expect(apiMocks.withdrawCandidateApplication).toHaveBeenCalledWith(PAIR_B);

        openA();
        await screen.findByText(REF_A, { selector: 'dd' });
        await act(async () => finish());

        expect(screen.getByText(REF_A, { selector: 'dd' })).toBeVisible();
        expect(screen.queryByText(REF_B, { selector: 'dd' })).not.toBeInTheDocument();
        expect(screen.queryByText(/Başvurunuz geri çekildi/)).not.toBeInTheDocument();
        expect(
          screen.queryByText('Previous application withdrawal failed'),
        ).not.toBeInTheDocument();
        expect(apiMocks.getCandidateStatus).toHaveBeenLastCalledWith(PAIR_A);
      },
    );

    it.each(['success', 'failure'] as const)(
      'ignores a pending offer response %s after switching applications',
      async (outcome) => {
        const offer = {
          offerId: 'off_abcdefghijklmnopqrstuvwx',
          applicationPublicRef: REF_B,
          jobTitle: STATUS_B.jobTitle,
          roleTitle: 'Synthetic frontend role',
          startDate: '2026-10-01',
          employmentType: 'Full time',
          workMode: 'HYBRID',
          location: 'Synthetic location',
          compensationAmount: 120000,
          currency: 'TRY',
          payPeriod: 'MONTHLY',
          expiresAt: '2026-09-30T12:00:00Z',
          termsSummary: 'Synthetic offer',
          status: 'EXTENDED',
          version: 1,
          updatedAt: '2026-09-15T00:00:00Z',
          legalBoundary: 'Synthetic process response',
        };
        apiMocks.getCandidateOffers.mockImplementation(async (pair: { publicRef: string }) =>
          pair.publicRef === REF_B ? [offer] : [],
        );
        let finish: () => void = () => undefined;
        apiMocks.respondCandidateOffer.mockImplementation(
          () =>
            new Promise((resolve, reject) => {
              finish = () =>
                outcome === 'success'
                  ? resolve({ ...offer, status: 'ACCEPTED', version: 2 })
                  : reject(new Error('Previous application offer failed'));
            }),
        );
        renderPage();
        fireEvent.click(
          await screen.findByRole('button', { name: 'Teklifi kabul etmeyi hazırla' }),
        );
        fireEvent.click(screen.getByLabelText(/yalnız ATS süreç yanıtı olduğunu/i));
        fireEvent.click(screen.getByRole('button', { name: 'Kabul yanıtını kalıcı kaydet' }));
        expect(apiMocks.respondCandidateOffer).toHaveBeenCalledWith(
          PAIR_B,
          offer,
          'ACCEPTED',
          'web-offer-response-1234',
        );

        openA();
        await screen.findByText(REF_A, { selector: 'dd' });
        await act(async () => finish());

        expect(screen.getByText(REF_A, { selector: 'dd' })).toBeVisible();
        expect(screen.queryByText(REF_B, { selector: 'dd' })).not.toBeInTheDocument();
        expect(
          screen.queryByText(/Teklif kabul yanıtınız kalıcı olarak kaydedildi/),
        ).not.toBeInTheDocument();
        expect(screen.queryByText('Previous application offer failed')).not.toBeInTheDocument();
        expect(apiMocks.getCandidateStatus).toHaveBeenLastCalledWith(PAIR_A);
      },
    );

    it('does not let an old withdrawal completion release a new withdrawal', async () => {
      let finishB: () => void = () => undefined;
      let finishA: () => void = () => undefined;
      apiMocks.withdrawCandidateApplication.mockImplementation(
        (pair: { publicRef: string }) =>
          new Promise((resolve) => {
            const finish = () =>
              resolve({
                ...(pair.publicRef === REF_A ? STATUS_A : STATUS_B),
                status: 'WITHDRAWN',
                withdrawalAllowed: false,
              });
            if (pair.publicRef === REF_A) finishA = finish;
            else finishB = finish;
          }),
      );
      const withdraw = () => {
        fireEvent.click(screen.getByRole('button', { name: 'Geri çekme onayını aç' }));
        fireEvent.click(
          screen.getByLabelText(
            /Başvurumu geri çekmek istediğimi ve işlemin geri alınamayacağını/i,
          ),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu geri çek' }));
      };
      renderPage();
      await screen.findByText(REF_B, { selector: 'dd' });
      withdraw();
      openA();
      await screen.findByText(REF_A, { selector: 'dd' });
      withdraw();
      expect(apiMocks.withdrawCandidateApplication).toHaveBeenLastCalledWith(PAIR_A);
      await act(async () => finishB());
      expect(screen.getByRole('button', { name: 'Geri çekiliyor…' })).toBeDisabled();
      expect(screen.getByText(REF_A, { selector: 'dd' })).toBeVisible();
      await act(async () => finishA());
      expect(screen.getByRole('status')).toHaveTextContent('Başvurunuz geri çekildi');
    });

    it('ignores a late answer for the application the candidate already left', async () => {
      let resolveB: (value: typeof STATUS_B) => void = () => undefined;
      apiMocks.getCandidateStatus.mockImplementation((pair: { publicRef: string }) =>
        pair.publicRef === REF_A
          ? Promise.resolve(STATUS_A)
          : new Promise((resolve) => {
              resolveB = resolve;
            }),
      );
      renderPage();
      await waitFor(() => expect(apiMocks.getCandidateStatus).toHaveBeenLastCalledWith(PAIR_B));

      openA();
      expect((await screen.findAllByText('İnsan incelemesinde')).length).toBeGreaterThan(0);

      // B'nin yanıtı A açıldıktan SONRA geliyor; A'nın ekranını ezmemeli.
      resolveB(STATUS_B);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(screen.getByRole('heading', { name: 'Başvuru yolculuğum' })).toBeVisible();
      expect(screen.getByText(REF_A, { selector: 'dd' })).toBeVisible();
      expect(screen.queryByText(REF_B, { selector: 'dd' })).not.toBeInTheDocument();
    });

    /**
     * #1180 review (P1): geçiş, bekleyen bir işlem sürerken de mümkün. B için
     * başlatılan geri çekme / teklif yanıtı A'ya geçildikten SONRA bittiğinde,
     * sonucu (başarı ya da hata) A'nın ekranına yazılmamalı ve B'yi yeniden
     * yükleyip A'yı ezmemeli.
     */
    const deferred = <T,>() => {
      let resolve: (value: T) => void = () => undefined;
      let reject: (reason: unknown) => void = () => undefined;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };
    const summaryRef = () => screen.getByText(/^app_/, { selector: 'dd' });
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
    const statusCallsFor = (pair: typeof PAIR_B) =>
      apiMocks.getCandidateStatus.mock.calls.filter(([arg]) => arg.publicRef === pair.publicRef)
        .length;

    const startWithdrawalOnBThenOpenA = async () => {
      renderPage();
      await waitFor(() => expect(summaryRef()).toHaveTextContent(REF_B));
      fireEvent.click(screen.getByRole('button', { name: 'Geri çekme onayını aç' }));
      fireEvent.click(
        screen.getByLabelText(/Başvurumu geri çekmek istediğimi ve işlemin geri alınamayacağını/i),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu geri çek' }));
      await waitFor(() => expect(apiMocks.withdrawCandidateApplication).toHaveBeenCalledWith(PAIR_B));
      openA();
      await waitFor(() => expect(summaryRef()).toHaveTextContent(REF_A));
    };

    it('keeps A on screen when a withdrawal started on B succeeds after the switch', async () => {
      const pending = deferred<typeof STATUS_B>();
      apiMocks.withdrawCandidateApplication.mockReturnValue(pending.promise);
      await startWithdrawalOnBThenOpenA();
      const bStatusCalls = statusCallsFor(PAIR_B);

      // B'nin işlemi sürerken A'nın kendi geri çekme düğmesi kilitli kalmaz.
      fireEvent.click(screen.getByRole('button', { name: 'Geri çekme onayını aç' }));
      fireEvent.click(
        screen.getByLabelText(/Başvurumu geri çekmek istediğimi ve işlemin geri alınamayacağını/i),
      );
      expect(screen.getByRole('button', { name: 'Başvuruyu geri çek' })).toBeEnabled();

      pending.resolve({ ...STATUS_B, status: 'WITHDRAWN', withdrawalAllowed: false, version: 2 });
      await flush();
      await flush();

      expect(summaryRef()).toHaveTextContent(REF_A);
      expect(screen.queryByText(/Başvurunuz geri çekildi/)).not.toBeInTheDocument();
      // A'nın açık onay paneli B'nin sonucuyla kapatılmaz.
      expect(screen.getByRole('button', { name: 'Başvuruyu geri çek' })).toBeEnabled();
      expect(statusCallsFor(PAIR_B)).toBe(bStatusCalls);
      // B'nin yeni durumu yine de sekme listesine işlenir (kayıt B'ye aittir).
      expect(screen.getByTestId(`candidate-tab-application-${REF_B}`)).toHaveTextContent(
        'Başvuru geri çekildi',
      );
    });

    it.each(['removed', 'replaced'] as const)(
      'does not update a %s credential from a late withdrawal',
      async (change) => {
        const pending = deferred<typeof STATUS_B>();
        apiMocks.withdrawCandidateApplication.mockReturnValue(pending.promise);
        await startWithdrawalOnBThenOpenA();
        if (change === 'removed') actual.removeCandidateSession(REF_B);
        else actual.establishCandidateSession(REF_B, 'C'.repeat(43));
        apiMocks.rememberCandidateApplicationSummary.mockClear();

        await act(async () => {
          pending.resolve({ ...STATUS_B, status: 'WITHDRAWN', withdrawalAllowed: false });
        });

        expect(summaryRef()).toHaveTextContent(REF_A);
        expect(apiMocks.rememberCandidateApplicationSummary).not.toHaveBeenCalled();
        const entry = actual.readCandidateSessions().entries.find((item) => item.publicRef === REF_B);
        if (change === 'removed') expect(entry).toBeUndefined();
        else expect(entry?.candidateAccessToken).toBe('C'.repeat(43));
      },
    );

    it('keeps A on screen when a withdrawal started on B fails after the switch', async () => {
      const pending = deferred<typeof STATUS_B>();
      apiMocks.withdrawCandidateApplication.mockReturnValue(pending.promise);
      await startWithdrawalOnBThenOpenA();
      const bStatusCalls = statusCallsFor(PAIR_B);

      pending.reject(new Error('B için çakışma'));
      await flush();
      await flush();

      expect(summaryRef()).toHaveTextContent(REF_A);
      expect(screen.queryByText('B için çakışma')).not.toBeInTheDocument();
      // Hata yolundaki yeniden yükleme B'yi getirip A'yı ezmez.
      expect(statusCallsFor(PAIR_B)).toBe(bStatusCalls);
    });

    const OFFER_B = {
      offerId: 'off_bbbbbbbbbbbbbbbbbbbbbbbb',
      applicationPublicRef: REF_B,
      jobTitle: 'Kıdemli Frontend',
      roleTitle: 'Kıdemli Frontend Geliştirici',
      startDate: '2026-08-03',
      employmentType: 'Tam zamanlı',
      workMode: 'HYBRID',
      location: 'İstanbul',
      compensationAmount: 120000,
      currency: 'TRY',
      payPeriod: 'MONTHLY',
      expiresAt: '2026-07-25T12:00:00Z',
      termsSummary: 'Sentetik teklif koşulları.',
      status: 'EXTENDED',
      version: 1,
      updatedAt: '2026-07-18T12:00:00Z',
      legalBoundary: 'Bu yanıt ATS sürecini kaydeder; ayrı iş sözleşmesi veya e-imza değildir.',
    };

    const startOfferResponseOnBThenOpenA = async () => {
      apiMocks.getCandidateStatus.mockImplementation(async (pair: { publicRef: string }) =>
        pair.publicRef === REF_A
          ? STATUS_A
          : { ...STATUS_B, status: 'OFFER_PENDING', nextAction: 'REVIEW_OFFER', withdrawalAllowed: false },
      );
      apiMocks.getCandidateOffers.mockImplementation(async (pair: { publicRef: string }) =>
        pair.publicRef === REF_B ? [OFFER_B] : [],
      );
      renderPage();
      fireEvent.click(await screen.findByRole('button', { name: 'Teklifi kabul etmeyi hazırla' }));
      fireEvent.click(screen.getByLabelText(/yalnız ATS süreç yanıtı olduğunu/i));
      fireEvent.click(screen.getByRole('button', { name: 'Kabul yanıtını kalıcı kaydet' }));
      await waitFor(() => expect(apiMocks.respondCandidateOffer).toHaveBeenCalled());
      expect(apiMocks.respondCandidateOffer.mock.calls[0][0]).toEqual(PAIR_B);
      openA();
      await waitFor(() => expect(summaryRef()).toHaveTextContent(REF_A));
    };

    it('keeps A on screen when an offer response started on B succeeds after the switch', async () => {
      const pending = deferred<typeof OFFER_B>();
      apiMocks.respondCandidateOffer.mockReturnValue(pending.promise);
      await startOfferResponseOnBThenOpenA();
      const bStatusCalls = statusCallsFor(PAIR_B);

      pending.resolve({ ...OFFER_B, status: 'ACCEPTED', version: 2 });
      await flush();
      await flush();

      expect(summaryRef()).toHaveTextContent(REF_A);
      expect(screen.queryByText(/Teklif kabul yanıtınız/)).not.toBeInTheDocument();
      expect(statusCallsFor(PAIR_B)).toBe(bStatusCalls);
    });

    it('keeps A on screen when an offer response started on B fails after the switch', async () => {
      const pending = deferred<typeof OFFER_B>();
      apiMocks.respondCandidateOffer.mockReturnValue(pending.promise);
      await startOfferResponseOnBThenOpenA();
      const bStatusCalls = statusCallsFor(PAIR_B);

      pending.reject(new Error('B teklifi için çakışma'));
      await flush();
      await flush();

      expect(summaryRef()).toHaveTextContent(REF_A);
      expect(screen.queryByText('B teklifi için çakışma')).not.toBeInTheDocument();
      expect(statusCallsFor(PAIR_B)).toBe(bStatusCalls);
    });

    it('removes one application from this tab and keeps the other', async () => {
      renderPage();
      await screen.findByTestId('candidate-tab-applications');
      await waitFor(() =>
        expect(screen.getByTestId(`candidate-tab-application-${REF_B}`)).toHaveTextContent(
          'Kıdemli Frontend',
        ),
      );

      fireEvent.click(
        screen.getByRole('button', { name: 'Kıdemli Frontend başvurusunu bu listeden kaldır' }),
      );

      // Etkin başvuru kaldırıldı: sıradaki açılır; tek başvuru kalınca liste gizlenir.
      await waitFor(() => expect(apiMocks.getCandidateStatus).toHaveBeenLastCalledWith(PAIR_A));
      expect(screen.queryByTestId('candidate-tab-applications')).not.toBeInTheDocument();
      expect(actual.readCandidateSessions().entries.map((entry) => entry.publicRef)).toEqual([
        REF_A,
      ]);
      // Kaldırma yalnız bu sekmedeki anahtarı siler; sunucuya istek gitmez.
      expect(apiMocks.withdrawCandidateApplication).not.toHaveBeenCalled();
    });
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

  /**
   * #992 Dilim C — madde 5 kabulünde aday tarafında görülen bulgular.
   *
   * <p>Metin: aday metinlerinde teknik "terminal" terimi geçiyordu ve başarı mesajı güncel
   * durumun "aşağıda" olduğunu söylüyordu; mesaj sayfanın altında, güncel durum ise yukarıda.
   * Odak: geri çekme sonrasında geri çekme bölümü kalkıyor (`withdrawalAllowed` false) ve
   * basılan düğmeyle birlikte odak `body`'ye düşüyordu; onay paneli de odak almıyor/vermiyordu.
   */
  describe('plain language and focus after candidate actions (#992 C)', () => {
    const confirmWithdrawal = () =>
      fireEvent.click(
        screen.getByLabelText(/Başvurumu geri çekmek istediğimi ve işlemin geri alınamayacağını/i),
      );
    const outcome = () => screen.getByTestId('candidate-action-outcome');

    it('never shows the technical word "terminal" or points the wrong way', async () => {
      renderPage();
      await screen.findAllByText('İnsan incelemesinde');
      fireEvent.click(screen.getByRole('button', { name: 'Geri çekme onayını aç' }));
      expect(screen.queryByText(/terminal/i)).not.toBeInTheDocument();

      confirmWithdrawal();
      fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu geri çek' }));

      expect(await screen.findByRole('status')).toHaveTextContent('Başvurunuz geri çekildi');
      expect(screen.queryByText(/terminal/i)).not.toBeInTheDocument();
      expect(screen.getByRole('status')).not.toHaveTextContent(/aşağıda/i);
    });

    it('moves focus to the outcome after a withdrawal', async () => {
      renderPage();
      await screen.findAllByText('İnsan incelemesinde');
      fireEvent.click(screen.getByRole('button', { name: 'Geri çekme onayını aç' }));
      confirmWithdrawal();
      fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu geri çek' }));

      await screen.findByRole('status');
      await waitFor(() => expect(outcome()).toHaveFocus());
      expect(outcome()).toHaveTextContent('Başvurunuz geri çekildi');
    });

    it('moves focus to the error after a withdrawal conflict (A1)', async () => {
      apiMocks.withdrawCandidateApplication.mockRejectedValueOnce(
        new Error('Başvurunuzun durumu bu arada değiştiği için geri çekme işlemi yapılamadı.'),
      );
      apiMocks.getCandidateStatus
        .mockResolvedValueOnce(STATUS)
        .mockResolvedValue({
          ...STATUS,
          status: 'REJECTED',
          nextAction: 'NONE',
          withdrawalAllowed: false,
          version: 2,
        });
      renderPage();
      await screen.findAllByText('İnsan incelemesinde');
      fireEvent.click(screen.getByRole('button', { name: 'Geri çekme onayını aç' }));
      confirmWithdrawal();
      fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu geri çek' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/durumu bu arada değiştiği/);
      await waitFor(() => expect(outcome()).toHaveFocus());
      // Güncel durum yüklendi ve geri çekme bölümü kalktı; odak kaybolmadı.
      expect(
        screen.queryByRole('button', { name: 'Geri çekme onayını aç' }),
      ).not.toBeInTheDocument();
    });

    it('moves focus into the withdrawal confirmation and back to its opener on cancel', async () => {
      renderPage();
      await screen.findAllByText('İnsan incelemesinde');
      fireEvent.click(screen.getByRole('button', { name: 'Geri çekme onayını aç' }));

      await waitFor(() =>
        expect(
          screen.getByLabelText(/Başvurumu geri çekmek istediğimi ve işlemin geri alınamayacağını/i),
        ).toHaveFocus(),
      );

      fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Geri çekme onayını aç' })).toHaveFocus(),
      );
    });

    it('moves focus to the outcome after an offer response', async () => {
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
        termsSummary: 'Sentetik teklif koşulları.',
        status: 'EXTENDED',
        version: 1,
        updatedAt: '2026-07-18T12:00:00Z',
        legalBoundary: 'Bu yanıt ATS sürecini kaydeder; ayrı iş sözleşmesi veya e-imza değildir.',
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
      fireEvent.click(await screen.findByRole('button', { name: 'Teklifi kabul etmeyi hazırla' }));
      fireEvent.click(screen.getByLabelText(/yalnız ATS süreç yanıtı olduğunu/i));
      fireEvent.click(screen.getByRole('button', { name: 'Kabul yanıtını kalıcı kaydet' }));

      await waitFor(() => expect(outcome()).toHaveFocus());
      expect(outcome()).toHaveTextContent(/Teklif kabul yanıtınız/);
    });
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
    expect(screen.getByRole('link', { name: 'Güvenli görüşme bağlantısını aç' })).toHaveClass(
      'text-text-primary', 'underline',
    );
    expect(screen.getByRole('link', { name: 'Güvenli görüşme bağlantısını aç' })).not.toHaveClass(
      'text-action-primary',
    );
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

  it('shows the offer start date as a calendar day, without a time (#963)', async () => {
    // `startDate` saatsiz bir takvim günüdür. TEST canlı kabulünde `2026-10-06` adaya
    // "6 Eki 2026 03:00" olarak göründü: gün, UTC gece yarısı sanılıp yerel saate çevriliyordu.
    apiMocks.getCandidateStatus.mockResolvedValue({
      ...STATUS,
      status: 'OFFER_PENDING',
      nextAction: 'REVIEW_OFFER',
      withdrawalAllowed: false,
    });
    apiMocks.getCandidateOffers.mockResolvedValue([
      {
        offerId: 'off_abcdefghijklmnopqrstuvwx',
        applicationPublicRef: SESSION.publicRef,
        jobTitle: 'Ürün Yöneticisi',
        roleTitle: 'Kıdemli Ürün Yöneticisi',
        startDate: '2026-10-06',
        employmentType: 'Tam zamanlı',
        workMode: 'HYBRID',
        location: 'İstanbul',
        compensationAmount: 55000,
        currency: 'TRY',
        payPeriod: 'MONTHLY',
        expiresAt: '2026-09-29T13:36:00Z',
        termsSummary: 'Sentetik teklif koşulları özeti.',
        status: 'EXTENDED',
        version: 2,
        updatedAt: '2026-09-22T13:59:00Z',
        legalBoundary: 'Bu yanıt ATS sürecini kaydeder; ayrı iş sözleşmesi veya e-imza değildir.',
      },
    ]);

    renderPage();

    const label = await screen.findByText('Başlangıç tarihi');
    expect(label.nextElementSibling).toHaveTextContent(/^6 Eki 2026$/);
  });
});
