// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CandidateApplicationPage, {
  EDUCATION_FIELDS,
  EXPERIENCE_FIELDS,
  RESUME_DECISION_STYLES,
  deriveEducationText,
  deriveExperienceText,
  submittableEntries,
} from './CandidateApplicationPage';

/** Bir deneyim kartındaki tüm alanlar — boşaltma testinde tek tek temizlenir. */
const EXPERIENCE_KEYS = ['title', 'company', 'startDate', 'endDate', 'description'] as const;

/** `proposals` fixture'ındaki deneyim önerisi; CV aktarım testi bunu arar. */
const EXPERIENCE_PROPOSAL_VALUE = 'PDF içinden gelen deneyim';

/** Göstergedeki geri-dönüş düğmelerinin test id'leri. */
const FORM_STEP_TEST_IDS = [
  'candidate-step-back-resume',
  'candidate-step-back-contact',
  'candidate-step-back-profile',
] as const;

const apiMocks = vi.hoisted(() => ({
  getPublicJob: vi.fn(),
  submitApplication: vi.fn(),
  saveCandidateSession: vi.fn(),
  createApplicationIdempotencyKey: vi.fn(),
  createCandidateAccessToken: vi.fn(),
  createResumeImport: vi.fn(),
  getResumeImport: vi.fn(),
  uploadResumePdf: vi.fn(),
  replaceResumePdf: vi.fn(),
  updateResumeProposal: vi.fn(),
  confirmResumeImport: vi.fn(),
  terminateResumeImport: vi.fn(),
}));

// Kısmi mock: yalnız AĞ ÇAĞRILARI ikame edilir, sabitler gerçek modülden gelir.
// Modülün tamamı elle ikame edildiğinde (eski hâl) api'ye eklenen her yeni sabit
// bu süiti "export tanımlı değil" hatasıyla düşürüyordu — testin kırılma sebebi
// davranış değil mock'un eskimesiydi. `importOriginal` ile sabitler tek kaynakta kalır.
vi.mock('../../features/ats-portals/api/application-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../features/ats-portals/api/application-api')>()),
  getPublicJob: apiMocks.getPublicJob,
  submitApplication: apiMocks.submitApplication,
  saveCandidateSession: apiMocks.saveCandidateSession,
  createApplicationIdempotencyKey: apiMocks.createApplicationIdempotencyKey,
  createCandidateAccessToken: apiMocks.createCandidateAccessToken,
  createResumeImport: apiMocks.createResumeImport,
  getResumeImport: apiMocks.getResumeImport,
  uploadResumePdf: apiMocks.uploadResumePdf,
  replaceResumePdf: apiMocks.replaceResumePdf,
  updateResumeProposal: apiMocks.updateResumeProposal,
  confirmResumeImport: apiMocks.confirmResumeImport,
  terminateResumeImport: apiMocks.terminateResumeImport,
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

const provenance = {
  page: 1,
  x: 48,
  y: 120,
  width: 220,
  height: 14,
  confidence: 0.96,
  parserVersion: 'pdfbox-resume-v1',
};

const proposals = [
  ['fullName', 'PDF Demo Adayı'],
  ['email', 'pdf.aday@example.test'],
  ['phone', '+90 555 111 22 33'],
  ['city', 'Ankara'],
  ['summary', 'PDF içinden gelen özet'],
  ['experience', 'PDF içinden gelen deneyim'],
  ['education', 'PDF içinden gelen eğitim'],
  ['skills', 'Ürün keşfi, analitik'],
].map(([field, proposedValue]) => ({
  field,
  proposedValue,
  candidateValue: null,
  state: 'UNREVIEWED',
  version: 0,
  provenance,
}));

const CREATED_IMPORT = {
  importId: 'ri_abcdefghijklmnopqrstuvwx',
  jobSlug: JOB.slug,
  state: 'ACTIVE',
  version: 0,
  documentVersion: 0,
  noticeVersion: 'candidate-resume-import-v1',
  noticeAcceptedAt: '2026-07-18T08:00:00Z',
  uploadExpiresAt: '2026-07-18T08:15:00Z',
  firstUploadAt: null,
  expiresAt: null,
  parserVersion: null,
  protectedSuppressed: 0,
  unsupportedOutput: 0,
  createdAt: '2026-07-18T08:00:00Z',
  updatedAt: '2026-07-18T08:00:00Z',
  purgedAt: null,
  proposals: [],
};

const UPLOADED_IMPORT = {
  ...CREATED_IMPORT,
  version: 1,
  documentVersion: 1,
  firstUploadAt: '2026-07-18T08:01:00Z',
  expiresAt: '2026-07-19T08:01:00Z',
  parserVersion: 'pdfbox-resume-v1',
  protectedSuppressed: 1,
  proposals,
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
  fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu kontrol et' }));
  expect(screen.getByTestId('candidate-application-preview')).toBeVisible();
};

const selectPdf = async () => {
  await screen.findByRole('heading', { name: 'Ürün Yöneticisi' });
  fireEvent.click(screen.getByLabelText(/CV içe aktarma aydınlatmasını okudum/i));
  const pdf = new File(['%PDF synthetic'], 'ornek-cv.pdf', { type: 'application/pdf' });
  fireEvent.change(screen.getByTestId('candidate-resume'), { target: { files: [pdf] } });
  await screen.findByTestId('candidate-resume-review');
  return pdf;
};

describe('CandidateApplicationPage', () => {
  beforeEach(() => {
    apiMocks.getPublicJob.mockResolvedValue(JOB);
    apiMocks.submitApplication.mockResolvedValue(RECEIPT);
    apiMocks.saveCandidateSession.mockReturnValue(true);
    apiMocks.createApplicationIdempotencyKey.mockReturnValue('web-idempotency-123456');
    apiMocks.createCandidateAccessToken.mockReturnValue('A'.repeat(43));
    apiMocks.createResumeImport.mockResolvedValue(CREATED_IMPORT);
    apiMocks.getResumeImport.mockResolvedValue(UPLOADED_IMPORT);
    apiMocks.uploadResumePdf.mockResolvedValue({ resumeImport: UPLOADED_IMPORT, inFlight: false });
    apiMocks.replaceResumePdf.mockImplementation(async (current) => ({
      ...current,
      version: current.version + 1,
      documentVersion: current.documentVersion + 1,
      proposals: [],
    }));
    apiMocks.updateResumeProposal.mockImplementation(
      async (current, field, state, _access, editedValue) => ({
        ...current,
        version: current.version + 1,
        proposals: current.proposals.map((proposal) =>
          proposal.field === field
            ? {
                ...proposal,
                state,
                candidateValue: state === 'EDITED' ? editedValue : null,
                version: proposal.version + 1,
              }
            : proposal,
        ),
      }),
    );
    apiMocks.confirmResumeImport.mockResolvedValue({
      resumeImport: { ...UPLOADED_IMPORT, state: 'CONFIRMED', version: 10, proposals: [] },
      draft: {
        draftId: '11111111-1111-1111-1111-111111111111',
        importId: CREATED_IMPORT.importId,
        version: 0,
        fields: Object.fromEntries(
          proposals.map((proposal) => [proposal.field, proposal.proposedValue]),
        ),
        createdAt: '2026-07-18T08:02:00Z',
      },
    });
    apiMocks.terminateResumeImport.mockResolvedValue({ ...UPLOADED_IMPORT, state: 'REJECT_ALL' });
    vi.stubGlobal('scrollTo', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows every form section on one page instead of one step at a time', async () => {
    // #1048 SAHIP ILKESI: aralarinda islevsel kapi olmayan alan gruplarini
    // adim adim gostermek adaya sebepsiz sira dayatiyordu. Uc bolum artik
    // asagi dogru akiyor; aday CV yuklemeden de bilgilerini girebilir.
    renderPage();
    expect(await screen.findByRole('heading', { name: 'CV’nizle başlayın' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Size nasıl ulaşalım?' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Deneyiminizi anlatın' })).toBeVisible();

    // Duzenlenen deger, sayfada gezinirken korunur.
    fireEvent.change(screen.getByLabelText(/Ad soyad/i), {
      target: { value: 'Düzenlenmiş Sentetik Aday' },
    });
    fireEvent.click(screen.getByTestId('candidate-step-back-contact'));
    expect(screen.getByLabelText(/Ad soyad/i)).toHaveValue('Düzenlenmiş Sentetik Aday');
    // CV bolumu gizlenmedi: gosterge artik bir icindekiler listesi.
    expect(screen.getByRole('heading', { name: 'CV’nizle başlayın' })).toBeVisible();
  });

  it('submits the editable form to the persistent API and stores tracking only after success', async () => {
    renderPage();
    await reachPreview();
    screen.getAllByRole('checkbox').forEach((checkbox) => fireEvent.click(checkbox));
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

  it('hands the candidate both halves of the credential on the receipt', async () => {
    // Anahtar üretiliyor, kullanılıyor ve adaya HİÇ gösterilmeden atılıyordu:
    // sekme kapanınca başvuru kalıcı olarak erişilemez hâle geliyordu. Durum
    // sorgusu hem referansı hem anahtarı ister; referans tek başına yetmez.
    // Bu yüzden ikisi de ekranda olmak ZORUNDA.
    renderPage();
    await reachPreview();
    screen.getAllByRole('checkbox').forEach((checkbox) => fireEvent.click(checkbox));
    fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu gönder' }));

    expect(await screen.findByRole('heading', { name: 'Başvurunuz kaydedildi' })).toBeVisible();
    expect(screen.getByTestId('candidate-receipt-id')).toHaveTextContent(RECEIPT.publicRef);
    expect(screen.getByTestId('candidate-receipt-access-token')).toHaveTextContent(
      RECEIPT.candidateAccessToken,
    );
    // Saklama uyarısı olmadan gösterim işe yaramaz: aday değeri kopyalamaz.
    expect(screen.getByText(/bu ekranda bir kez gösterilir/i)).toBeVisible();
    expect(screen.getByText(/Bu iki bilgiyi saklayın/i)).toBeVisible();
  });

  it('gives the candidate a file to keep, without any network request', async () => {
    // #228: pano UCUCUDUR — sonraki kopyalama uzerine yazar, pano API'si her
    // ortamda yok, ve sekme kapaninca sessionStorage uctugu icin aday panoya
    // aldigini bir yere yapistirmamissa erisimi KALICI olarak gider. Dosya
    // adayin kendi bilgisayarinda kalir.
    const created: string[] = [];
    const revoked: string[] = [];
    const clicked: Array<{ download: string; href: string }> = [];
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      const u = `blob:mock-${created.length}`;
      created.push(u);
      void blob;
      return u;
    }) as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn((u: string) => revoked.push(u)) as unknown as typeof URL.revokeObjectURL;
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function patched(this: HTMLAnchorElement) {
      clicked.push({ download: this.download, href: this.href });
    };
    const fetchCallsBefore = (globalThis.fetch as ReturnType<typeof vi.fn>)?.mock?.calls?.length ?? 0;

    try {
      renderPage();
      await reachPreview();
      screen.getAllByRole('checkbox').forEach((checkbox) => fireEvent.click(checkbox));
      fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu gönder' }));
      await screen.findByRole('heading', { name: 'Başvurunuz kaydedildi' });

      fireEvent.click(screen.getByTestId('candidate-receipt-download'));

      expect(clicked).toHaveLength(1);
      // Dosya adi referansi tasimali: aday birden fazla basvuru yapabilir (#226).
      expect(clicked[0].download).toBe(`basvuru-${RECEIPT.publicRef}.txt`);
      // Object URL serbest birakilmali, yoksa sekme kapanana kadar bellekte kalir.
      expect(revoked).toEqual(created);
      // Anahtar aga CIKMAMALI: indirme tamamen istemcide uretilir.
      const fetchCallsAfter =
        (globalThis.fetch as ReturnType<typeof vi.fn>)?.mock?.calls?.length ?? 0;
      expect(fetchCallsAfter).toBe(fetchCallsBefore);
      expect(screen.getByRole('status')).toHaveTextContent(/olarak\s+indirildi/);
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
      HTMLAnchorElement.prototype.click = origClick;
    }
  });

  it('offers the download even when the clipboard API is unavailable', async () => {
    // Pano API'si yoksa kopyala dugmesi HIC cizilmiyor. Indirme o durumda tek
    // teslim yolu; ikisi bagimsiz olmali.
    const orig = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    try {
      renderPage();
      await reachPreview();
      screen.getAllByRole('checkbox').forEach((checkbox) => fireEvent.click(checkbox));
      fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu gönder' }));
      await screen.findByRole('heading', { name: 'Başvurunuz kaydedildi' });

      expect(screen.queryByTestId('candidate-receipt-copy')).not.toBeInTheDocument();
      expect(screen.getByTestId('candidate-receipt-download')).toBeVisible();
    } finally {
      Object.defineProperty(navigator, 'clipboard', { value: orig, configurable: true });
    }
  });

  it('copies both halves together so the reference alone is never kept', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    renderPage();
    await reachPreview();
    screen.getAllByRole('checkbox').forEach((checkbox) => fireEvent.click(checkbox));
    fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu gönder' }));
    await screen.findByRole('heading', { name: 'Başvurunuz kaydedildi' });

    fireEvent.click(screen.getByTestId('candidate-receipt-copy'));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toContain(RECEIPT.publicRef);
    expect(copied).toContain(RECEIPT.candidateAccessToken);
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

  it('keeps PDF proposals out of the form until every field decision and explicit confirmation', async () => {
    renderPage();
    const pdf = await selectPdf();

    expect(apiMocks.createResumeImport).toHaveBeenCalledWith(
      JOB.slug,
      'web-idempotency-123456',
      'A'.repeat(43),
      expect.any(String),
      undefined,
    );
    expect(apiMocks.uploadResumePdf).toHaveBeenCalledWith(
      CREATED_IMPORT,
      pdf,
      'web-idempotency-123456',
      'A'.repeat(43),
    );
    // #1048: alan artik ayni sayfada GORUNUR. Asil degismez onun gizli olmasi
    // degil, onerinin aktarim ONCESI alana SIZMAMASI — yani DEGER bos kalmali.
    // Gorunurlugu test etmek, tasarim degisince kirilan ama sizintiyi
    // yakalamayan bir capa olurdu.
    expect(screen.getByTestId('candidate-fullName')).toHaveValue('');
    expect(screen.getByTestId('candidate-resume-review')).not.toHaveTextContent('ornek-cv.pdf');

    fireEvent.click(screen.getByRole('button', { name: 'Güvenli önerileri kabul et' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Seçtiğim alanları forma aktar \(8\)/ }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: /Seçtiğim alanları forma aktar/ }));

    expect(await screen.findByTestId('candidate-resume-meta')).toHaveTextContent(
      '8 alan forma aktarıldı',
    );
    expect(screen.getByTestId('candidate-fullName')).toHaveValue('PDF Demo Adayı');
    expect(screen.getByTestId('candidate-email')).toHaveValue('pdf.aday@example.test');
  });

  it('gives every decision state its own frame, not just its own badge', () => {
    // Canlı geri bildirim: "reddet UI/UX çalışmıyor gibi, çerçeve rengi
    // değişmiyor". Sebep: REJECTED ile UNREVIEWED birebir ayni kenarlik ve
    // aksan sinifini tasiyordu (border-border-subtle + bg-border-strong); tek
    // fark rozetti. Rozet metnine bakarak "durumlar ayrisiyor" demek yetmez.
    const states = Object.keys(RESUME_DECISION_STYLES) as Array<
      keyof typeof RESUME_DECISION_STYLES
    >;
    const frame = (s: keyof typeof RESUME_DECISION_STYLES) =>
      `${RESUME_DECISION_STYLES[s].accent}|${RESUME_DECISION_STYLES[s].card}`;

    const collisions: string[] = [];
    for (let i = 0; i < states.length; i += 1) {
      for (let j = i + 1; j < states.length; j += 1) {
        if (frame(states[i]) === frame(states[j])) {
          collisions.push(`${states[i]} == ${states[j]}`);
        }
      }
    }

    expect(collisions).toEqual([]);
    // Rozetler de ayri olmali; ayni rozet iki duruma bakildiginda karistirir.
    const badges = states.map((s) => RESUME_DECISION_STYLES[s].badge);
    expect(new Set(badges).size).toBe(states.length);
    // Simgeler de tekil: ekran okuyucu disinda hizli tarama isareti bunlar.
    const marks = states.map((s) => RESUME_DECISION_STYLES[s].mark);
    expect(new Set(marks).size).toBe(states.length);

    // Karar BEKLEYEN kart notr kalmali. Onceki hal `border-strong` kullaniyordu
    // ve olculdugunde bu token notr gri degil doygun marka MAVISI cikti
    // (oklch(0.5461 0.2152 262.88)) — bekleyen kart hem karar verilmis gibi
    // goruntuluyor hem EDITED'in mavisiyle (hue 259.81) karisiyordu.
    const pending = RESUME_DECISION_STYLES.UNREVIEWED;
    expect(`${pending.accent} ${pending.card} ${pending.badge}`).not.toMatch(/state-/);

    // Karar VERILMIS her durum kendi state ailesini kullanmali; iki durumun
    // ayni aileyi paylasmasi farkli sinif dizesiyle bile gozle ayrilmaz.
    const family = (value: string) => value.match(/state-([a-z]+)-/)?.[1];
    const decided = ['ACCEPTED', 'EDITED', 'REJECTED', 'CONTROL_REQUIRED'] as const;
    const families = decided.map((s) => family(RESUME_DECISION_STYLES[s].accent));
    expect(families.every(Boolean)).toBe(true);
    expect(new Set(families).size).toBe(decided.length);
  });

  it('makes each decision state visually distinguishable and latches the chosen action', async () => {
    // Canlı geri bildirim: "kabul edilen, düzenlenen, ret olan çok anlaşılır değil".
    // Beş durum da aynı nötr rozeti taşıyordu ve karar sonrası üç buton aynı
    // kalıyordu; hangi kararın verildiği okunmuyordu.
    renderPage();
    await selectPdf();

    const card = () => screen.getByTestId('resume-proposal-fullName');
    const badge = () => screen.getByTestId('resume-proposal-state-fullName');
    const acceptButton = () =>
      within(card()).getByRole('button', { name: 'Öneriyi kabul et' });
    const rejectButton = () => within(card()).getByRole('button', { name: 'Reddet' });

    expect(card()).toHaveAttribute('data-decision', 'UNREVIEWED');
    expect(badge()).toHaveTextContent('Karar bekliyor');
    expect(acceptButton()).toHaveAttribute('aria-pressed', 'false');
    expect(rejectButton()).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(acceptButton());
    await waitFor(() => expect(card()).toHaveAttribute('data-decision', 'ACCEPTED'));
    expect(badge()).toHaveTextContent('Kabul edildi');
    // Asıl regresyon: seçilen karar butonun üzerinde kilitli görünmeli.
    expect(acceptButton()).toHaveAttribute('aria-pressed', 'true');
    expect(rejectButton()).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(rejectButton());
    await waitFor(() => expect(card()).toHaveAttribute('data-decision', 'REJECTED'));
    expect(badge()).toHaveTextContent('Reddedildi');
    expect(rejectButton()).toHaveAttribute('aria-pressed', 'true');
    expect(acceptButton()).toHaveAttribute('aria-pressed', 'false');
    // Reddedilen alan çıkmaz olmamalı: kabul/düzenleme yolu açık kalır.
    expect(acceptButton()).toBeEnabled();
  });

  it('labels every parser field and no longer warns that the form cannot carry it', async () => {
    // İki katmanlı geçmiş. (1) Canlı bulgu (parser v5): backend `languages` ve
    // `certifications` da yayıyor ama frontend etiket haritasında yoktu; iki kart
    // BAŞLIKSIZ render oluyordu — etiket hâlâ zorunlu. (2) ats#215 B: form artık bu
    // iki alanı da taşıyor, dolayısıyla "başvuru formunda ayrı bir alanı yok"
    // uyarısı ARTIK GÖRÜNMEMELİ; görünürse aday kabul ettiği veriyi kaybettiğini
    // sanır. Uyarı yolu kaldırılmadı: `RESUME_ONLY_FIELDS` boşaldı, yani sözleşme
    // yine ayrışırsa (backend forma eklenmemiş yeni bir alan yayarsa) uyarı geri gelir.
    apiMocks.uploadResumePdf.mockResolvedValueOnce({
      resumeImport: {
        ...UPLOADED_IMPORT,
        proposals: [
          ...UPLOADED_IMPORT.proposals,
          {
            field: 'certifications',
            proposedValue: 'ISO 45001 Lead Auditor',
            candidateValue: null,
            state: 'UNREVIEWED',
            version: 0,
            provenance,
          },
        ],
      },
      inFlight: false,
    });
    renderPage();
    await selectPdf();

    const card = screen.getByTestId('resume-proposal-certifications');
    expect(within(card).getByRole('heading', { level: 4 })).toHaveTextContent(
      'Sertifikalar ve eğitimler',
    );
    // Artık formda karşılığı VAR: uyarı hiçbir kartta çıkmamalı.
    expect(card).not.toHaveTextContent(/başvuru formunda ayrı bir alanı/);
    expect(screen.getByTestId('resume-proposal-email')).not.toHaveTextContent(
      /başvuru formunda ayrı bir alanı/,
    );
    // Uyarının kalkması "kayıp" değil "taşınmış" demek olmalı; alanların formda
    // gerçekten durduğu ve gönderime girdiği ayrı testte kanıtlanır
    // ("carries languages and certifications all the way into the request body").
  });

  it('shows review progress and names the exact reason the transfer gate is closed', async () => {
    // Pasif "Forma aktar" düğmesinin nedeni görünmüyordu; aday kaç alanın
    // beklediğini bilmeden düğmeye basmaya çalışıyordu.
    renderPage();
    await selectPdf();

    const progress = screen.getByTestId('resume-review-progress');
    expect(progress).toHaveTextContent('8 alandan 0 tanesi karara bağlandı');
    expect(progress).toHaveTextContent('8 alan bekliyor');
    expect(screen.getByRole('progressbar', { name: 'Karara bağlanan CV alanı sayısı' })).toHaveAttribute(
      'aria-valuenow',
      '0',
    );
    expect(
      screen.getByText(/8 alan için henüz karar vermediniz/),
    ).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Güvenli önerileri kabul et' }));

    await waitFor(() =>
      expect(screen.getByTestId('resume-review-progress')).toHaveTextContent(
        '8 alandan 8 tanesi karara bağlandı',
      ),
    );
    expect(screen.getByRole('progressbar', { name: 'Karara bağlanan CV alanı sayısı' })).toHaveAttribute(
      'aria-valuenow',
      '8',
    );
    expect(screen.queryByText(/henüz karar vermediniz/)).not.toBeInTheDocument();
    expect(screen.getByText(/8 alan forma aktarılacak/)).toBeVisible();
  });

  it('requires an explicit choice instead of overwriting a non-empty manual field', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Ürün Yöneticisi' });
    fireEvent.change(screen.getByTestId('candidate-fullName'), {
      target: { value: 'Elle Yazılan Aday' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'CV adımına dön' }));
    await selectPdf();
    fireEvent.click(screen.getByRole('button', { name: 'Güvenli önerileri kabul et' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Seçtiğim alanları forma aktar \(8\)/ }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: /Seçtiğim alanları forma aktar/ }));

    expect(await screen.findByTestId('resume-merge-conflicts')).toHaveTextContent(
      'Elle Yazılan Aday',
    );
    fireEvent.click(screen.getByLabelText(/CV değerini kullan:/i));
    fireEvent.click(screen.getByRole('button', { name: 'Seçimleri forma uygula' }));
    expect(screen.getByTestId('candidate-fullName')).toHaveValue('PDF Demo Adayı');
  });

  it('lets the candidate combine and edit a manual value with a CV proposal', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Ürün Yöneticisi' });
    fireEvent.change(screen.getByTestId('candidate-fullName'), {
      target: { value: 'Elle Yazılan Aday' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'CV adımına dön' }));
    await selectPdf();
    fireEvent.click(screen.getByRole('button', { name: 'Güvenli önerileri kabul et' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Seçtiğim alanları forma aktar \(8\)/ }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: /Seçtiğim alanları forma aktar/ }));
    await screen.findByTestId('resume-merge-conflicts');

    fireEvent.click(screen.getByLabelText('Birleştirip düzenle'));
    fireEvent.change(screen.getByLabelText('Birleşik değer'), {
      target: { value: 'Adayın birleştirip doğruladığı ad' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Seçimleri forma uygula' }));
    expect(screen.getByTestId('candidate-fullName')).toHaveValue(
      'Adayın birleştirip doğruladığı ad',
    );
  });

  it('reloads and visibly presents the current proposal state after a stale-version conflict', async () => {
    apiMocks.updateResumeProposal.mockRejectedValueOnce(new Error('VERSION_CONFLICT'));
    renderPage();
    await selectPdf();
    fireEvent.click(screen.getAllByRole('button', { name: 'Öneriyi kabul et' })[0]);

    expect(await screen.findByRole('alert')).toHaveTextContent('Güncel kararlar yüklendi');
    expect(apiMocks.getResumeImport).toHaveBeenCalledWith(CREATED_IMPORT.importId, 'A'.repeat(43));
    expect(screen.getByTestId('candidate-resume-review')).toBeVisible();
  });

  it('keeps the manual form enabled while the PDF backend is still processing', async () => {
    let resolveUpload: (value: unknown) => void = () => undefined;
    apiMocks.uploadResumePdf.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveUpload = resolve;
      }),
    );
    renderPage();
    await screen.findByRole('heading', { name: 'Ürün Yöneticisi' });
    fireEvent.click(screen.getByLabelText(/CV içe aktarma aydınlatmasını okudum/i));
    fireEvent.change(screen.getByTestId('candidate-resume'), {
      target: { files: [new File(['%PDF'], 'yavas.pdf', { type: 'application/pdf' })] },
    });

    expect(await screen.findByTestId('candidate-resume-parsing')).toBeVisible();
    expect(screen.getByTestId('candidate-fullName')).toBeEnabled();
    fireEvent.change(screen.getByTestId('candidate-fullName'), { target: { value: 'Form Açık' } });
    expect(screen.getByTestId('candidate-fullName')).toHaveValue('Form Açık');

    await act(async () => {
      resolveUpload({ resumeImport: UPLOADED_IMPORT, inFlight: false });
    });
    fireEvent.click(screen.getByRole('button', { name: 'CV adımına dön' }));
    expect(await screen.findByTestId('candidate-resume-review')).toBeVisible();
  });

  it('focuses a backend PDF error and leaves manual application available', async () => {
    apiMocks.uploadResumePdf.mockRejectedValueOnce(new Error('UNSUPPORTED_IN_GATE'));
    renderPage();
    await screen.findByRole('heading', { name: 'Ürün Yöneticisi' });
    fireEvent.click(screen.getByLabelText(/CV içe aktarma aydınlatmasını okudum/i));
    fireEvent.change(screen.getByTestId('candidate-resume'), {
      target: { files: [new File(['%PDF'], 'gercek.pdf', { type: 'application/pdf' })] },
    });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('UNSUPPORTED_IN_GATE');
    expect(alert).toHaveFocus();
    expect(screen.getByTestId('candidate-fullName')).toBeEnabled();
  });

  it('requires low-confidence fields to be edited or rejected, never accepted unchanged', async () => {
    apiMocks.uploadResumePdf.mockResolvedValueOnce({
      resumeImport: {
        ...UPLOADED_IMPORT,
        proposals: [
          {
            ...proposals[0],
            state: 'CONTROL_REQUIRED',
            provenance: { ...provenance, confidence: 0.41 },
          },
        ],
      },
      inFlight: false,
    });
    renderPage();
    await selectPdf();
    expect(screen.getByText('Elle kontrol gerekli')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Öneriyi kabul et' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Seçtiğim alanları forma aktar/ })).toBeDisabled();
  });

  it('terminates and purges all transient proposals after explicit reject-all confirmation', async () => {
    renderPage();
    await selectPdf();
    fireEvent.click(screen.getByRole('button', { name: 'Tümünü reddet' }));
    expect(screen.getByRole('alertdialog')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Evet, tümünü reddet' }));
    await waitFor(() => expect(apiMocks.terminateResumeImport).toHaveBeenCalled());
    expect(screen.queryByTestId('candidate-resume-review')).not.toBeInTheDocument();
    expect(screen.getByTestId('candidate-fullName')).toBeEnabled();
  });

  it('gives date fields an input that matches the data, without dropping legacy text', async () => {
    // #239: yil alanina HARF yazilamaz; deneyim tarihi ay+yil secicisi olur.
    // Ama CV ayristiricisi serbest metin uretebiliyor ("Eyl 2022") — o degeri
    // yapisal girdiye koymak tarayicida BOSALTIR ve aday kaybettigini fark
    // etmez. O yuzden tip DEGERE gore cozulur.
    renderPage();
    await screen.findByRole('heading', { name: 'Ürün Yöneticisi' });

    const year = screen.getByTestId('candidate-education-0-startYear');
    expect(year).toHaveAttribute('inputMode', 'numeric');
    fireEvent.change(year, { target: { value: '19a9x' } });
    expect(year).toHaveValue('199');

    // #242 dilim B: `type="month"` KALDIRILDI — gün istemiyordu ama YILI da
    // kabul etmiyordu, yıl-only değer metne düşüyor ve aday serbest metin
    // yazabiliyordu. Artık filtreli girdi: iki granülerlik de yapısal.
    const start = screen.getByTestId('candidate-experience-0-startDate');
    expect(start).toHaveAttribute('inputMode', 'numeric');
    fireEvent.change(start, { target: { value: 'Eyl 2022' } });
    expect(start).toHaveValue('2022'); // harf ve boşluk YAZILAMAZ
    fireEvent.change(start, { target: { value: '202209' } });
    expect(start).toHaveValue('2022-09'); // tire kendiliğinden yerleşir
    fireEvent.change(start, { target: { value: '2019' } });
    expect(start).toHaveValue('2019'); // yıl-only da geçerli (ats#244 sözleşmesi)
  });

  it('refuses an implausible education year that the 4-digit filter would allow', async () => {
    // Rakam filtresi "0001"i de gecirir; dort hane olmak makul olmak degildir.
    renderPage();
    await screen.findByRole('heading', { name: 'Ürün Yöneticisi' });
    fireEvent.click(screen.getByTestId('fill-synthetic-resume'));

    fireEvent.change(screen.getByTestId('candidate-education-0-startYear'), {
      target: { value: '0001' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu kontrol et' }));

    expect(screen.getByText(/Eğitim yılı 1950 ile \d{4} arasında olmalı/i)).toBeVisible();
    expect(screen.queryByTestId('candidate-application-preview')).not.toBeInTheDocument();
  });

  it('keeps the year field filtered WHILE typing, not only when four digits are complete', async () => {
    // CANLIDA OLCULEN KUSUR: "tamamlanmis yil" olcutu ("^\\d{4}$") yaziminin
    // ortasindaki "199"u metne dusuruyordu; filtre kapaniyor ve SONRAKI tusta
    // harf girilebiliyordu. Tek seferlik degisim yapan birim test bunu
    // yakalamamisti — tus tus yazmak gerekiyordu.
    renderPage();
    await screen.findByRole('heading', { name: 'Ürün Yöneticisi' });
    const year = screen.getByTestId('candidate-education-0-startYear');

    for (const [typed, expected] of [
      ['1', '1'],
      ['19', '19'],
      ['199', '199'],
      ['199a', '199'],
      ['1999', '1999'],
    ] as const) {
      fireEvent.change(year, { target: { value: typed } });
      expect(year).toHaveValue(expected);
      // Her adimda yil modunda KALMALI.
      expect(year).toHaveAttribute('inputMode', 'numeric');
      expect(year).toHaveAttribute('maxLength', '4');
    }
  });

  it('refuses a record whose end is before its start', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Ürün Yöneticisi' });
    fireEvent.click(screen.getByTestId('fill-synthetic-resume'));

    fireEvent.change(screen.getByTestId('candidate-experience-0-startDate'), {
      target: { value: '2023-05' },
    });
    fireEvent.change(screen.getByTestId('candidate-experience-0-endDate'), {
      target: { value: '2021-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu kontrol et' }));

    expect(screen.getByText(/Bitiş tarihi başlangıçtan önce olamaz/i)).toBeVisible();
    expect(screen.queryByTestId('candidate-application-preview')).not.toBeInTheDocument();
  });

  it('blocks preview when required fields are missing', async () => {
    // #1048: tek gerçek kapı önizleme. Aşama geçişleri kaydırmaya indiği için
    // zorunlu-alan doğrulaması ARTIK YALNIZ burada — iki yerde tutmak drift
    // üretiyordu (aynı kural iki farklı metinle iki yerde yaşıyordu).
    renderPage();
    await screen.findByRole('heading', { name: 'Ürün Yöneticisi' });

    fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu kontrol et' }));

    expect(
      screen.getByText(/Önizlemeye geçmek için yıldızlı alanları doldurun/i),
    ).toBeVisible();
    expect(screen.queryByTestId('candidate-application-preview')).not.toBeInTheDocument();
  });

  it('does not duplicate the synthetic-only policy client side (backend is the authority)', async () => {
    // Aday verisi politikası ortam-parametriktir (Halildeu/ats#200). Kuralın burada
    // kopyalanması iki-kaynak/drift üretir: test ortamı gerçek veriye açıkken
    // frontend'in kapatması ürünü yanlış yerde bloke eder.
    renderPage();
    await screen.findByRole('heading', { name: 'Ürün Yöneticisi' });
    fireEvent.click(screen.getByTestId('fill-synthetic-resume'));
    fireEvent.change(screen.getByLabelText(/E-posta/i), {
      target: { value: 'gercek.aday@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu kontrol et' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(await screen.findByRole('button', { name: 'Başvuruyu gönder' })).toBeInTheDocument();
  });

  it('surfaces the backend policy rejection instead of a hardcoded client message', async () => {
    apiMocks.submitApplication.mockRejectedValueOnce(
      new Error('Bu ortam yalnız sentetik .test e-posta kabul eder'),
    );
    renderPage();
    await screen.findByRole('heading', { name: 'Ürün Yöneticisi' });
    fireEvent.click(screen.getByTestId('fill-synthetic-resume'));
    fireEvent.change(screen.getByLabelText(/E-posta/i), {
      target: { value: 'gercek.aday@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu kontrol et' }));
    screen.getAllByRole('checkbox').forEach((checkbox) => fireEvent.click(checkbox));
    fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu gönder' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Bu ortam yalnız sentetik .test e-posta kabul eder',
    );
  });

  it('shows a service error and keeps persistent submission disabled if the job cannot load', async () => {
    apiMocks.getPublicJob.mockRejectedValueOnce(new Error('ilan yok'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('ilan yok');
    fireEvent.click(screen.getByTestId('fill-synthetic-resume'));
    fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu kontrol et' }));
    screen.getAllByRole('checkbox').forEach((checkbox) => fireEvent.click(checkbox));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Başvuruyu gönder' })).toBeDisabled(),
    );
  });

  // ── ats#215 B: çoğaltılabilir deneyim/eğitim girdileri ────────────────────────
  //
  // Sahip talebi (2026-07-26): "çoklu doldurulabilen alanlar için formun ilgili
  // alanının çoklanması" — LinkedIn ve kariyer.net'teki gibi. Backend tarafı ats#216
  // ile canlıda kanıtlandı (yapısal gönderim 201 + eski kolonlar türetildi);
  // aşağıdaki testler arayüz ucunun o sözleşmeye gerçekten bağlandığını gösterir.

  const reachProfileStep = async () => {
    await screen.findByRole('heading', { name: 'Ürün Yöneticisi' });
    fireEvent.click(screen.getByTestId('fill-synthetic-resume'));
    expect(screen.getByRole('heading', { name: 'Deneyiminizi anlatın' })).toBeVisible();
  };

  // ── Adım göstergesinden geri dönüş ───────────────────────────────────────────
  //
  // Sahip bildirimi (2026-07-26): "özgeçmiş doldururken önceki sayfaya geçiş
  // görmedim … istediğim adıma direk dönebileyim, üstte gösterdiği ilerleme
  // alanını bunun için kullanabiliriz."
  //
  // Canlı ölçüm: profil adımında sayfa 2763px, ekran 998px, tek geri düğmesi
  // y=2317'de — iki ekrandan fazla aşağıda. Çoğaltılabilir kartlar sayfayı
  // uzattığı için bunu #215 B kötüleştirdi.

  // ── KVKK aydınlatma metni ────────────────────────────────────────────────────
  //
  // Sahip bildirimi (2026-07-26): "kvkk metni denen yok, okunacak bir metin yok."
  // Ölçüm: sistemde yalnız sürüm kimliği vardı (`kvkk-application-v1`); metni sunan
  // uç da, frontend içeriği de yoktu. İki onay noktası da "aydınlatma metnini
  // okudum" beyanı alıyor ve bu beyan `noticeAcceptedAt` ile KALICI kaydediliyordu.

  it('shows the readable notice next to the consent it is given for', async () => {
    renderPage();
    await reachPreview();

    const disclosure = screen.getByTestId('kvkk-notice-disclosure-kvkk-application-v1');
    // Veri sorumlusu kimliği metinde YAZILI olmalı — VERBİS sicilinden.
    expect(disclosure).toHaveTextContent('AÇIK HOLDİNG ANONİM ŞİRKETİ');
    expect(disclosure).toHaveTextContent('acikholding@hs03.kep.tr');
    // Grup iştiraklerine aktarım bildirilmeli: aday Açık'a başvurup grup içinde
    // değerlendirilebiliyorsa bu bir veri aktarımıdır (KVKK m.8/m.10).
    expect(disclosure).toHaveTextContent('Grup iştirakleri');
    // YURT DIŞI aktarım AYRI bildirilmeli (m.9 ayrı rejim). Yayımlanmış şirket
    // listesinde yurt dışı tüzel kişilikler var; iştirakleri alıcı yazmak bunları
    // kapsar. Tek satırda birleştirmek aktarımın sınır ötesi olduğunu gizlerdi.
    expect(disclosure).toHaveTextContent('Yurt dışına aktarım');
    expect(disclosure).toHaveTextContent('Kazakistan');
    // Çalışan adayı süresi çalışan süresinden AYRI: VERBİS'teki 4-Özlük 15 yıl
    // beyanı işe ALINAN çalışanın özlük dosyası içindir, başvuran için değil.
    expect(disclosure).toHaveTextContent('2 yıl sonunda silinir');
    // Kanonik kaynak gösterilmeli: bu ekran resmi metnin yerine geçmez.
    expect(
      within(disclosure).getByRole('link', { name: /resmi Çalışan Adayı Aydınlatma Metni/i }),
    ).toHaveAttribute('href', 'https://acik.com/calisan-adayi-aydinlatma-metni');
    // KVKK m.11 hakları ve başvuru kanalı.
    expect(disclosure).toHaveTextContent('silinmesini veya yok edilmesini isteme');
    // Kalıcı sayfaya bağlantı da bulunmalı.
    expect(
      within(disclosure).getByRole('link', { name: /kalıcı sayfada aç/i }),
    ).toHaveAttribute('href', '/jobs/aydinlatma');
  });

  it('does not collect consent when the notice text is missing', async () => {
    // Fail-closed. Kusurun kendisi "metin yok ama onay var" durumuydu; bir daha
    // oluşamamalı. Bilinmeyen kiracı = yayımlanmış metni olmayan kiracı.
    render(
      <MemoryRouter initialEntries={['/careers/metni-olmayan/jobs/urun-yoneticisi/apply']}>
        <Routes>
          <Route
            path="/careers/:publicHandle/jobs/:jobSlug/apply"
            element={<CandidateApplicationPage />}
          />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'Ürün Yöneticisi' });
    fireEvent.click(screen.getByTestId('fill-synthetic-resume'));
    fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu kontrol et' }));

    // Metin yok → açılır bölüm de, KVKK onay kutusu da yok.
    expect(
      screen.queryByTestId('kvkk-notice-disclosure-kvkk-application-v1'),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/aydınlatma metnini okudum/i)).not.toBeInTheDocument();
    // Ve gönderim kapalı kalır.
    screen.getAllByRole('checkbox').forEach((checkbox) => fireEvent.click(checkbox));
    expect(screen.getByRole('button', { name: 'Başvuruyu gönder' })).toBeDisabled();
  });

  it('keeps sequential fields on the same grid row', () => {
    // Sahip bildirimi (2026-07-26): "eğitimde başlangıç yılı ile bitiş yılı farklı
    // satıra gelmiş; birbirini takip eden bilgiler aynı satırda olmalı."
    //
    // Canlı ölçüm (2 kolonlu ızgara, 5 yarım alan) satırları şöyle veriyordu:
    //   y=1377 Okul + Derece | y=1455 Bölüm + Başlangıç yılı | y=1533 Bitiş yılı
    // Yarım alan sayısı tek olduğu için eşleşme kayıyor ve son alan yalnız kalıyor.
    //
    // jsdom'da getBoundingClientRect sıfır döner, o yüzden satırı SPEC'ten hesaplarız:
    // otorite zaten spec, ızgara ondan üretiliyor. Böylece ileride altıncı bir yarım
    // alan eklenip eşleşme yeniden kaydığında bu test düşer.
    const rowOf = (specs: ReadonlyArray<{ key: string; span?: 'full' | 'half' }>) => {
      const rows: Record<string, number> = {};
      let row = 0;
      let usedInRow = 0;
      specs.forEach((spec) => {
        const full = spec.span === 'full';
        if (full) {
          if (usedInRow > 0) row += 1;
          rows[spec.key] = row;
          row += 1;
          usedInRow = 0;
          return;
        }
        if (usedInRow === 2) {
          row += 1;
          usedInRow = 0;
        }
        rows[spec.key] = row;
        usedInRow += 1;
      });
      return rows;
    };

    const edu = rowOf(EDUCATION_FIELDS);
    expect(edu.startYear).toBe(edu.endYear);
    expect(edu.school).toBe(edu.degree);

    const exp = rowOf(EXPERIENCE_FIELDS);
    expect(exp.startDate).toBe(exp.endDate);
    expect(exp.title).toBe(exp.company);
  });

  it('gives every entry field a placeholder and a length cap', () => {
    // Izgara düzeltmesini yazarken `field` spec'inden placeholder ve maxLength'i
    // kazara düşürdüm; hiçbir test bunu yakalamadı ve Bölüm alanı 160 karakter
    // sınırını sessizce kaybetti. Sınır backend şemasının aynası — kaybı burada
    // yakala, sunucudan 400 dönerek değil.
    [...EXPERIENCE_FIELDS, ...EDUCATION_FIELDS].forEach((spec) => {
      expect(spec.placeholder, `${spec.key} placeholder`).toBeTruthy();
      expect(spec.maxLength, `${spec.key} maxLength`).toBeGreaterThan(0);
    });
  });

  it('uses the indicator as a section navigator, not as completed-step back links', async () => {
    // #1048: "tamamlanmis adim" kavrami kalkti. Uzun bir sayfada gostergenin
    // hala isi var — icindekiler listesi. UC bolumun HEPSI her zaman
    // gezilebilir; ileri/geri ayrimi anlamsizlasti.
    renderPage();
    await reachProfileStep();

    expect(screen.getByTestId('candidate-step-back-resume')).toBeInTheDocument();
    expect(screen.getByTestId('candidate-step-back-contact')).toBeInTheDocument();
    expect(screen.getByTestId('candidate-step-back-profile')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('candidate-step-back-contact'));
    expect(screen.getByRole('heading', { name: 'Size nasıl ulaşalım?' })).toBeVisible();
    // Gezinmek form durumunu sifirlamaz.
    expect(screen.getByTestId('candidate-fullName')).toHaveValue('Deniz Yılmaz');
  });

  it('resets the accuracy declaration when the indicator jumps back from the preview', async () => {
    // Onaylar ÖNİZLENEN veriye verilir. Aday geri dönüp veriyi değiştirdikten
    // sonra o beyanı taşımak, onaylanmamış içeriği onaylanmış gibi göndermek olurdu.
    renderPage();
    await reachPreview();
    screen.getAllByRole('checkbox').forEach((checkbox) => fireEvent.click(checkbox));
    expect(screen.getByRole('button', { name: 'Başvuruyu gönder' })).toBeEnabled();

    fireEvent.click(screen.getByTestId('candidate-step-back-profile'));
    expect(screen.getByRole('heading', { name: 'Deneyiminizi anlatın' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu kontrol et' }));
    // Onaylar sıfırlandığı için gönderim yeniden kapalı.
    screen.getAllByRole('checkbox').forEach((checkbox) => expect(checkbox).not.toBeChecked());
    expect(screen.getByRole('button', { name: 'Başvuruyu gönder' })).toBeDisabled();
  });

  it('offers no step navigation once the application is submitted', async () => {
    renderPage();
    await reachPreview();
    screen.getAllByRole('checkbox').forEach((checkbox) => fireEvent.click(checkbox));
    fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu gönder' }));
    await waitFor(() =>
      expect(screen.getByTestId('candidate-application-receipt')).toBeInTheDocument(),
    );

    // Makbuzda hiçbir adım tıklanmaz: başvuru kalıcı olarak kaydedildi.
    FORM_STEP_TEST_IDS.forEach((id) => expect(screen.queryByTestId(id)).not.toBeInTheDocument());
  });

  it('derives the legacy single-string field exactly like the backend does', () => {
    // Bu ayna önizlemede kullanılıyor: aday "Başvuruyu kontrol et" dediğinde İK'nın
    // göreceği metni görür. Biçim backend `Submission.effectiveExperience()` ile
    // birebir aynı olmalı — kaymışsa önizleme adaya yalan söyler. Beklenen değerler
    // backend kodundan okundu: segmentler " - " ile, açıklama "\n" ile, girdiler "\n\n" ile.
    expect(
      deriveExperienceText([
        {
          title: 'Ürün Uzmanı',
          company: 'Örnek Teknoloji',
          startDate: 'Eyl 2022',
          endDate: 'Devam ediyor',
          description: 'Keşif ve yol haritası',
        },
        { title: 'Analist', company: 'Demo' },
      ]),
    ).toBe(
      'Ürün Uzmanı - Örnek Teknoloji - Eyl 2022 - Devam ediyor\nKeşif ve yol haritası\n\nAnalist - Demo',
    );
    // Tek taraflı tarih: backend dateSpan boş tarafı atlar, tire eklemez.
    expect(deriveExperienceText([{ title: 'Analist', startDate: '2020' }])).toBe('Analist - 2020');
    expect(deriveExperienceText([{ description: 'Yalnız açıklama' }])).toBe('Yalnız açıklama');
    // Boş girdi çıktıya hiç girmez; iki boş satır "\n\n" bırakmaz.
    expect(deriveExperienceText([{}, { title: 'A' }, {}])).toBe('A');
    expect(
      deriveEducationText([
        {
          school: 'Örnek Üniversitesi',
          degree: 'Lisans',
          field: 'YBS',
          startYear: '2016',
          endYear: '2020',
        },
      ]),
    ).toBe('Örnek Üniversitesi - Lisans - YBS - 2016 - 2020');
  });

  it('drops blank rows and trims values before submitting them', () => {
    // Aday "ekle"ye basıp doldurmadan gönderebilir. Backend de boş satırı atar;
    // burada süzmek gövdeyi küçültür ve gönderilen şeyi okunur tutar.
    expect(
      submittableEntries([
        { title: '  Ürün Uzmanı  ', company: '' },
        {},
        { title: '   ' },
        { company: 'Demo' },
      ]),
    ).toEqual([{ title: 'Ürün Uzmanı' }, { company: 'Demo' }]);
  });

  it('repeats the experience group: add appends a card, remove deletes that exact card', async () => {
    renderPage();
    await reachProfileStep();

    // Sentetik doldurma iki pozisyon bırakır.
    expect(screen.getByTestId('candidate-experience-entry-0')).toBeInTheDocument();
    expect(screen.getByTestId('candidate-experience-entry-1')).toBeInTheDocument();
    expect(screen.queryByTestId('candidate-experience-entry-2')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('candidate-experience-add'));
    expect(screen.getByTestId('candidate-experience-entry-2')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('candidate-experience-2-title'), {
      target: { value: 'Stajyer' },
    });
    expect(screen.getByTestId('candidate-experience-2-title')).toHaveValue('Stajyer');

    // ORTADAKİ kartı sil: kalan iki kart 1. ve 3. girilenler olmalı.
    fireEvent.click(screen.getByTestId('candidate-experience-remove-1'));
    expect(screen.queryByTestId('candidate-experience-entry-2')).not.toBeInTheDocument();
    expect(screen.getByTestId('candidate-experience-0-title')).toHaveValue('Ürün Uzmanı');
    expect(screen.getByTestId('candidate-experience-1-title')).toHaveValue('Stajyer');
  });

  it('keeps the caret in the row the candidate was typing in when an earlier row is removed', async () => {
    // Satır kimliği neden index DEĞİL: kontrollü input'ta değerler state'ten geldiği
    // için index key değerleri bozmaz — bunu ölçtüm, `key={index}` ile yukarıdaki
    // test de geçiyor. Gözlemlenebilir fark ODAK: index key'de silinen satırın DOM
    // düğümü hayatta kalır, yazdığı satırın düğümü sökülür ve adayın imleci düşer.
    renderPage();
    await reachProfileStep();

    const secondTitle = screen.getByTestId('candidate-experience-1-title');
    secondTitle.focus();
    expect(document.activeElement).toBe(secondTitle);

    fireEvent.click(screen.getByTestId('candidate-experience-remove-0'));

    // Aynı DOM düğümü hâlâ odakta ve hâlâ aynı satırı gösteriyor.
    expect(document.activeElement).toBe(secondTitle);
    expect(secondTitle).toHaveValue('Ürün Analisti');
    expect(screen.getByTestId('candidate-experience-0-title')).toBe(secondTitle);
  });

  it('keeps a single empty card instead of leaving the candidate with nowhere to type', async () => {
    renderPage();
    await reachProfileStep();

    fireEvent.click(screen.getByTestId('candidate-education-remove-0'));
    // Liste boşalmaz: tek kart kalır ve boşalır.
    expect(screen.getByTestId('candidate-education-entry-0')).toBeInTheDocument();
    expect(screen.getByTestId('candidate-education-0-school')).toHaveValue('');
  });

  it('sends structured entries and omits the legacy single-string fields', async () => {
    renderPage();
    await reachProfileStep();
    fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu kontrol et' }));
    screen.getAllByRole('checkbox').forEach((checkbox) => fireEvent.click(checkbox));
    fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu gönder' }));

    await waitFor(() => expect(apiMocks.submitApplication).toHaveBeenCalled());
    const body = apiMocks.submitApplication.mock.calls[0][3];

    expect(body.experienceEntries).toEqual([
      {
        title: 'Ürün Uzmanı',
        company: 'Örnek Teknoloji',
        startDate: 'Eyl 2022',
        endDate: 'Devam ediyor',
        description: 'Keşif görüşmeleri, yol haritası ve erişilebilirlik iyileştirmeleri.',
      },
      {
        title: 'Ürün Analisti',
        company: 'Demo Yazılım',
        startDate: '2020',
        endDate: '2022',
        description: 'Kullanım verisi analizi ve raporlama.',
      },
    ]);
    expect(body.educationEntries).toHaveLength(1);
    // Eski tek-string alanlar GÖNDERİLMEZ: ikisini birlikte yollamak hangisinin
    // kazandığını belirsiz bırakır. Backend bunları girdilerden türetir (ats#216).
    expect(body.experience).toBeUndefined();
    expect(body.education).toBeUndefined();
  });

  it('carries languages and certifications all the way into the request body', async () => {
    // Bunlar ats#212 (parser v7) ile çıkarılıyordu ama formda karşılığı yoktu:
    // aday öneriyi kabul ediyor, veri sessizce düşüyordu. Artık uçtan uca gitmeli.
    renderPage();
    await reachProfileStep();
    expect(screen.getByTestId('candidate-languages')).toHaveValue(
      'Türkçe — ana dil, İngilizce — ileri seviye',
    );
    fireEvent.change(screen.getByTestId('candidate-certifications'), {
      target: { value: 'ISO 45001 Lead Auditor · 2025' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu kontrol et' }));
    screen.getAllByRole('checkbox').forEach((checkbox) => fireEvent.click(checkbox));
    fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu gönder' }));

    await waitFor(() => expect(apiMocks.submitApplication).toHaveBeenCalled());
    const body = apiMocks.submitApplication.mock.calls[0][3];
    expect(body.languages).toBe('Türkçe — ana dil, İngilizce — ileri seviye');
    expect(body.certifications).toBe('ISO 45001 Lead Auditor · 2025');
  });

  it('refuses the preview until at least one entry actually has content', async () => {
    renderPage();
    await reachProfileStep();

    // Deneyim kartlarını boşalt: satır sayısı 1'de kalır ama içerik yok.
    fireEvent.click(screen.getByTestId('candidate-experience-remove-1'));
    EXPERIENCE_KEYS.forEach((key) => {
      fireEvent.change(screen.getByTestId(`candidate-experience-0-${key}`), {
        target: { value: '' },
      });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu kontrol et' }));

    // Satır VAR ama boş: doğrulama satır sayısına değil türetilmiş metne bakmalı,
    // tıpkı backend'in `between(effectiveExperience(), 1, 8000)` denetimi gibi.
    expect(screen.queryByTestId('candidate-application-preview')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('En az bir iş deneyimi girdisi doldurun.');

    fireEvent.change(screen.getByTestId('candidate-experience-0-title'), {
      target: { value: 'Ürün Uzmanı' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu kontrol et' }));
    expect(screen.getByTestId('candidate-application-preview')).toBeVisible();
  });

  it('lands an imported resume blob in the first entry instead of dropping it', async () => {
    // Ayrıştırıcı hâlâ tek parça metin döndürüyor (unvan/şirket/tarih ayrıştırması
    // ats#213 üstüne binen ayrı iş). Deneyim artık metin kutusu olmadığı için, o
    // metnin ilk girdinin açıklamasına düşmesi gerekir; düşmezse CV aktarımı
    // adayın en önemli alanını sessizce kaybeder.
    renderPage();
    await selectPdf();
    fireEvent.click(screen.getByRole('button', { name: 'Güvenli önerileri kabul et' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Seçtiğim alanları forma aktar \(8\)/ }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: /Seçtiğim alanları forma aktar/ }));

    await waitFor(() => expect(screen.getByTestId('candidate-fullName')).toBeInTheDocument());
    expect(screen.getByTestId('candidate-experience-0-description')).toHaveValue(
      EXPERIENCE_PROPOSAL_VALUE,
    );
  });

  /** #218: ayrıştırıcının gruplayıp yayınladığı kayıtlarla taslak. */
  const withGroupedEntries = () => {
    const base = apiMocks.confirmResumeImport.mock.results;
    apiMocks.confirmResumeImport.mockResolvedValue({
      resumeImport: { ...UPLOADED_IMPORT, state: 'CONFIRMED', version: 10, proposals: [] },
      draft: {
        draftId: '11111111-1111-1111-1111-111111111111',
        importId: CREATED_IMPORT.importId,
        version: 0,
        fields: Object.fromEntries(
          proposals.map((proposal) => [proposal.field, proposal.proposedValue]),
        ),
        createdAt: '2026-07-18T08:02:00Z',
        entries: {
          experience: [
            {
              title: 'Kıdemli Kalite Mühendisi',
              subtitle: '',
              dateText: '2019 - 2023',
              description: 'Kalite sistemini kurdu',
            },
            {
              title: 'Kalite Uzmanı',
              subtitle: '',
              dateText: 'Eyl 2015 – Ağu 2019',
              description: 'Denetimleri yürüttü',
            },
          ],
          education: [
            {
              title: 'Örnek Üniversitesi',
              subtitle: '',
              dateText: '2011 - 2015',
              description: 'Çevre Mühendisliği',
            },
            { title: 'Örnek Lisesi', subtitle: '', dateText: 'belirsiz tarih', description: '' },
          ],
        },
      },
    });
    return base;
  };

  const importResumeIntoForm = async () => {
    renderPage();
    await selectPdf();
    fireEvent.click(screen.getByRole('button', { name: 'Güvenli önerileri kabul et' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Seçtiğim alanları forma aktar \(8\)/ }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: /Seçtiğim alanları forma aktar/ }));
    await waitFor(() => expect(screen.getByTestId('candidate-fullName')).toBeInTheDocument());
  };

  it('spreads grouped resume records across separate cards', async () => {
    // SAHİP RAPORU: "birden fazla deneyim olunca tek deneyim gibi atıyor".
    // Ayrıştırıcı artık kayıtları gruplayıp yayınlıyor (ats#218); form onları
    // AYRI kartlara dağıtmazsa rapor kapanmaz — kayıtlar yine tek kartta kalır.
    withGroupedEntries();
    await importResumeIntoForm();

    expect(screen.getByTestId('candidate-experience-entry-0')).toBeInTheDocument();
    expect(screen.getByTestId('candidate-experience-entry-1')).toBeInTheDocument();
    expect(screen.queryByTestId('candidate-experience-entry-2')).not.toBeInTheDocument();

    expect(screen.getByTestId('candidate-experience-0-title')).toHaveValue(
      'Kıdemli Kalite Mühendisi',
    );
    expect(screen.getByTestId('candidate-experience-1-title')).toHaveValue('Kalite Uzmanı');
    // Tarih METNİ formun iki alanına bölünmeli; tek parça göstermek adaya iş bırakır.
    expect(screen.getByTestId('candidate-experience-0-startDate')).toHaveValue('2019');
    expect(screen.getByTestId('candidate-experience-0-endDate')).toHaveValue('2023');
    // En-tire de ayırıcı: gerçek CV'ler "–" kullanıyor, yalnız "-" beklemek kaçırırdı.
    expect(screen.getByTestId('candidate-experience-1-startDate')).toHaveValue('Eyl 2015');
    expect(screen.getByTestId('candidate-experience-1-endDate')).toHaveValue('Ağu 2019');
    expect(screen.getByTestId('candidate-experience-0-description')).toHaveValue(
      'Kalite sistemini kurdu',
    );
    // İkinci kaydın başlığı birinci kayda sızmamalı.
    expect(screen.getByTestId('candidate-experience-0-description')).not.toHaveValue(
      expect.stringContaining('Kalite Uzmanı') as unknown as string,
    );
  });

  it('spreads grouped education records too, and never loses an unsplittable date', async () => {
    withGroupedEntries();
    // Eğitim, deneyimle AYNI adımda render ediliyor — ayrı bir ilerleme tıklaması yok.
    await importResumeIntoForm();

    expect(screen.getByTestId('candidate-education-0-school')).toHaveValue('Örnek Üniversitesi');
    expect(screen.getByTestId('candidate-education-1-school')).toHaveValue('Örnek Lisesi');
    expect(screen.getByTestId('candidate-education-0-startYear')).toHaveValue('2011');
    expect(screen.getByTestId('candidate-education-0-endYear')).toHaveValue('2015');
    // Bölünemeyen tarih "başlangıç" alanına YAZILMAZ — tek parça tarihi başlangıç
    // diye göstermek yanlış veri olur. Açıklamaya düşer: aday görür, düzeltir,
    // ama bilgi KAYBOLMAZ. Sessizce atmak en kötüsü olurdu.
    expect(screen.getByTestId('candidate-education-1-startYear')).toHaveValue('');
    expect(screen.getByTestId('candidate-education-1-endYear')).toHaveValue('');
    expect(screen.getByTestId('candidate-education-1-description')).toHaveValue('belirsiz tarih');
  });

  it('falls back to one card when the backend predates grouping', async () => {
    // `entries` alanini ats#224 EKLEDI; ondan onceki backend surumu hic gondermiyor.
    // Zorunlu okuma canlida cokerdi — ayni hata #1019'da IK panelini cokertecekti.
    // Gruplama yoksa bugunun tek-kart davranisi KALIR, bilgi kaybolmaz.
    await importResumeIntoForm();

    expect(screen.getByTestId('candidate-experience-entry-0')).toBeInTheDocument();
    expect(screen.queryByTestId('candidate-experience-entry-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('candidate-experience-0-description')).toHaveValue(
      EXPERIENCE_PROPOSAL_VALUE,
    );
  });
});
