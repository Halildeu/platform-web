// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import RecruiterJobsPanel from './RecruiterJobsPanel';

const apiMocks = vi.hoisted(() => ({
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
  MAX_JOB_QUESTIONS: 10,
  MAX_JOB_QUESTION_OPTIONS: 8,
  RECRUITER_JOB_QUESTION_KINDS: ['SHORT_TEXT', 'LONG_TEXT', 'YES_NO', 'SINGLE_CHOICE'],
  listRecruiterJobs: vi.fn(),
  createRecruiterJob: vi.fn(),
  updateRecruiterJob: vi.fn(),
  transitionRecruiterJob: vi.fn(),
  createApplicationIdempotencyKey: vi.fn(() => 'web-job-command-1234'),
}));

vi.mock('../api/application-api', () => apiMocks);

const JOB = {
  jobId: `job_${'A'.repeat(24)}`,
  publicHandle: 'acik',
  slug: 'urun-yoneticisi-a1b2c3d4',
  title: 'Ürün Yöneticisi',
  team: 'Ürün ve Deneyim',
  location: 'İstanbul',
  mode: 'Hibrit',
  employmentType: 'Tam zamanlı',
  summary: 'Kullanıcı ihtiyaçlarını ölçülebilir ürün sonuçlarına dönüştürün.',
  highlights: ['Ürün keşfi', 'Yol haritası'],
  applicationFields: apiMocks.DEFAULT_APPLICATION_FIELDS,
  questions: [] as Array<Record<string, unknown>>,
  questionWarnings: [] as Array<Record<string, unknown>>,
  noticeVersion: 'kvkk-application-v1' as const,
  status: 'DRAFT' as const,
  applyEnabled: false,
  version: 0,
  createdAt: '2026-07-17T10:00:00Z',
  updatedAt: '2026-07-17T10:00:00Z',
};

describe('RecruiterJobsPanel', () => {
  beforeEach(() => {
    apiMocks.createApplicationIdempotencyKey.mockReset().mockReturnValue('web-job-command-1234');
    apiMocks.listRecruiterJobs.mockResolvedValue([]);
    apiMocks.createRecruiterJob.mockResolvedValue(JOB);
    apiMocks.updateRecruiterJob.mockResolvedValue({ ...JOB, version: 1 });
    apiMocks.transitionRecruiterJob.mockResolvedValue({
      ...JOB,
      status: 'PUBLISHED',
      applyEnabled: true,
      version: 1,
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('opens on the published jobs, not on the closed ones', async () => {
    // OLCULEN SORUN (#1043): 21 ilanin 3'u yayindaydi ama liste filtresizdi ve
    // `updatedAt DESC` siraliydi; ilk acilista yalniz `Kapandi` kartlar
    // goruluyordu. Sayac "3 Yayinda" diyor, liste gostermiyordu.
    apiMocks.listRecruiterJobs.mockResolvedValue([
      { ...JOB, jobId: `job_${'C'.repeat(24)}`, slug: 'kapali-ilan', title: 'Kapalı İlan',
        status: 'CLOSED' as const, updatedAt: '2026-07-27T10:00:00Z' },
      { ...JOB, jobId: `job_${'P'.repeat(24)}`, slug: 'yayinda-ilan', title: 'Yayında İlan',
        status: 'PUBLISHED' as const, applyEnabled: true, updatedAt: '2026-07-20T10:00:00Z' },
    ]);
    render(<RecruiterJobsPanel canManage applications={[]} onDrillDown={() => {}} />);

    expect(await screen.findByText('Yayında İlan')).toBeVisible();
    expect(screen.queryByText('Kapalı İlan')).not.toBeInTheDocument();
    // Her filtrenin sayisi listelenebilecek kart sayisiyla birebir.
    expect(screen.getByTestId('recruiter-job-filter-PUBLISHED')).toHaveTextContent('Yayında · 1');
    expect(screen.getByTestId('recruiter-job-filter-CLOSED')).toHaveTextContent('Kapandı · 1');
    expect(screen.getByTestId('recruiter-job-filter-ALL')).toHaveTextContent('Tümü · 2');

    fireEvent.click(screen.getByTestId('recruiter-job-filter-CLOSED'));
    expect(await screen.findByText('Kapalı İlan')).toBeVisible();
    expect(screen.queryByText('Yayında İlan')).not.toBeInTheDocument();
  });

  it('falls back to every job when nothing is published, instead of an empty page', async () => {
    // 21 ilani olan tenant'i bos sayfayla karsilamak sorunu cozmek degil yerini
    // degistirmek olurdu. Hangi kumede oldugu aktif filtre dugmesinde gorunur.
    apiMocks.listRecruiterJobs.mockResolvedValue([
      { ...JOB, jobId: `job_${'D'.repeat(24)}`, slug: 'taslak-ilan', title: 'Taslak İlan' },
    ]);
    render(<RecruiterJobsPanel canManage applications={[]} onDrillDown={() => {}} />);

    expect(await screen.findByText('Taslak İlan')).toBeVisible();
    expect(screen.getByTestId('recruiter-job-filter-ALL')).toHaveAttribute('aria-pressed', 'true');
  });

  it('says which set is empty instead of silently widening it', async () => {
    apiMocks.listRecruiterJobs.mockResolvedValue([
      { ...JOB, jobId: `job_${'E'.repeat(24)}`, slug: 'yayinda-tek', title: 'Yayında Tek',
        status: 'PUBLISHED' as const, applyEnabled: true },
    ]);
    render(<RecruiterJobsPanel canManage applications={[]} onDrillDown={() => {}} />);
    expect(await screen.findByText('Yayında Tek')).toBeVisible();

    fireEvent.click(screen.getByTestId('recruiter-job-filter-CLOSED'));

    const empty = await screen.findByTestId('recruiter-jobs-empty-filter');
    expect(empty).toHaveTextContent(/Kapandı durumunda ilan yok/i);
    // Kullanici yanlis kumeye baktigini FARK ETMELI: liste sessizce genislemez.
    expect(screen.queryByText('Yayında Tek')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('recruiter-jobs-show-all'));
    expect(await screen.findByText('Yayında Tek')).toBeVisible();
  });

  it('shows the applicant breakdown on the job itself, and drills through', async () => {
    // SAHIP ILKESI: bir sayi gosteriyorsan o sayinin KIMLERDEN olustugu ayni
    // yerden gorulmeli. Onceden ilana bakan IK "kac kisi basvurmus" sorusunun
    // cevabini bu panelde bulamiyordu; basvurular sekmesine gecip ilan filtresi
    // uygulamasi gerekiyordu.
    apiMocks.listRecruiterJobs.mockResolvedValue([JOB]);
    const drilled: Array<{ jobSlug: string; stage: string }> = [];
    render(
      <RecruiterJobsPanel
        canManage
        applications={[
          { jobSlug: JOB.slug, status: 'SUBMITTED' },
          { jobSlug: JOB.slug, status: 'SUBMITTED' },
          { jobSlug: JOB.slug, status: 'UNDER_REVIEW' },
          { jobSlug: JOB.slug, status: 'REJECTED' },
          // BASKA ilanin basvurusu bu ilanin sayisina KARISMAMALI.
          { jobSlug: 'baska-ilan', status: 'SUBMITTED' },
        ]}
        onDrillDown={(jobSlug, stage) => drilled.push({ jobSlug, stage })}
      />,
    );

    const breakdown = await screen.findByTestId(`recruiter-job-breakdown-${JOB.slug}`);
    expect(breakdown).toBeVisible();
    expect(screen.getByTestId(`recruiter-job-total-${JOB.slug}`)).toHaveTextContent('Tümü · 4');
    expect(
      screen.getByTestId(`recruiter-job-stage-${JOB.slug}-SUBMITTED`),
    ).toHaveTextContent('Yeni · 2');
    expect(
      screen.getByTestId(`recruiter-job-stage-${JOB.slug}-UNDER_REVIEW`),
    ).toHaveTextContent('İncelemede · 1');
    expect(
      screen.getByTestId(`recruiter-job-stage-${JOB.slug}-INTERVIEW_PENDING`),
    ).toHaveTextContent('Kısa liste · 0');
    expect(
      screen.getByTestId(`recruiter-job-stage-${JOB.slug}-REJECTED`),
    ).toHaveTextContent('Reddedildi · 1');

    // Sayiya tiklamak "hangileri"ne goturmeli: bu olmadan sayi cikmaz sokak.
    fireEvent.click(screen.getByTestId(`recruiter-job-stage-${JOB.slug}-UNDER_REVIEW`));
    fireEvent.click(screen.getByTestId(`recruiter-job-total-${JOB.slug}`));
    expect(drilled).toEqual([
      { jobSlug: JOB.slug, stage: 'UNDER_REVIEW' },
      { jobSlug: JOB.slug, stage: 'ALL' },
    ]);
  });

  it('shows zeros rather than hiding the breakdown when a job has no applicants', async () => {
    // Bosluk da bilgidir: satiri gizlemek IK'ya "veri yok mu, basvuru yok mu?"
    // sorusunu sordurur.
    apiMocks.listRecruiterJobs.mockResolvedValue([JOB]);
    render(<RecruiterJobsPanel canManage applications={[]} onDrillDown={() => {}} />);

    expect(await screen.findByTestId(`recruiter-job-breakdown-${JOB.slug}`)).toBeVisible();
    expect(screen.getByTestId(`recruiter-job-total-${JOB.slug}`)).toHaveTextContent('Tümü · 0');
    expect(
      screen.getByTestId(`recruiter-job-stage-${JOB.slug}-SUBMITTED`),
    ).toHaveTextContent('Yeni · 0');
  });

  it('creates a persistent draft from the recruiter-facing form', async () => {
    render(<RecruiterJobsPanel canManage />);
    expect(await screen.findByText('Henüz ilanınız yok.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Yeni ilan oluştur' }));
    fireEvent.change(screen.getByLabelText('İlan başlığı'), {
      target: { value: 'Ürün Yöneticisi' },
    });
    fireEvent.change(screen.getByLabelText('Ekip'), {
      target: { value: 'Ürün ve Deneyim' },
    });
    fireEvent.change(screen.getByLabelText('Konum'), { target: { value: 'İstanbul' } });
    fireEvent.change(screen.getByLabelText('İlan özeti'), {
      target: { value: JOB.summary },
    });
    fireEvent.change(screen.getByLabelText('Öne çıkanlar'), {
      target: { value: 'Ürün keşfi\nYol haritası' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Taslak oluştur' }));

    await waitFor(() => expect(apiMocks.createRecruiterJob).toHaveBeenCalledTimes(1));
    expect(apiMocks.createRecruiterJob).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Ürün Yöneticisi',
        highlights: ['Ürün keşfi', 'Yol haritası'],
        applicationFields: apiMocks.DEFAULT_APPLICATION_FIELDS,
        noticeVersion: 'kvkk-application-v1',
      }),
      'web-job-command-1234',
    );
    expect(await screen.findByText(/taslak ilanı kalıcı olarak oluşturuldu/i)).toBeVisible();
    expect(screen.getByText('Ürün Yöneticisi')).toBeVisible();
  });

  it('previews a draft before publication without exposing a public link', async () => {
    apiMocks.listRecruiterJobs.mockResolvedValue([JOB]);
    const { container } = render(<RecruiterJobsPanel canManage />);

    const previewTrigger = await screen.findByRole('button', { name: 'Önizle' });
    fireEvent.click(previewTrigger);

    const preview = screen.getByTestId('recruiter-job-preview');
    expect(preview).toBeVisible();
    expect(container).toHaveProperty('inert', true);
    expect(container).toHaveAttribute('aria-hidden', 'true');
    expect(within(preview).getByRole('heading', { name: JOB.title })).toBeVisible();
    expect(screen.getByText(/public yayına çıkmaz/i)).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Public ilanı aç' })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('recruiter-job-preview')).not.toBeInTheDocument();
    expect((container as HTMLElement & { inert?: boolean }).inert).toBeUndefined();
    expect(container).not.toHaveAttribute('aria-hidden');
    await waitFor(() => expect(previewTrigger).toHaveFocus());
  });

  it('rotates the create idempotency key when the recruiter starts a distinct draft', async () => {
    apiMocks.createApplicationIdempotencyKey
      .mockReturnValueOnce('web-job-command-first')
      .mockReturnValueOnce('web-job-command-second');
    apiMocks.createRecruiterJob
      .mockRejectedValueOnce(new Error('yanıt alınamadı'))
      .mockResolvedValueOnce(JOB);

    render(<RecruiterJobsPanel canManage />);
    await screen.findByText('Henüz ilanınız yok.');

    const fillAndSubmit = (title: string) => {
      fireEvent.change(screen.getByLabelText('İlan başlığı'), { target: { value: title } });
      fireEvent.change(screen.getByLabelText('Ekip'), { target: { value: 'Ürün' } });
      fireEvent.change(screen.getByLabelText('Konum'), { target: { value: 'İstanbul' } });
      fireEvent.change(screen.getByLabelText('İlan özeti'), { target: { value: JOB.summary } });
      fireEvent.click(screen.getByRole('button', { name: 'Taslak oluştur' }));
    };

    fireEvent.click(screen.getByRole('button', { name: 'Yeni ilan oluştur' }));
    fillAndSubmit('İlk İlan');
    expect(await screen.findByRole('alert')).toHaveTextContent('yanıt alınamadı');

    fireEvent.click(screen.getByRole('button', { name: 'Formu kapat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yeni ilan oluştur' }));
    fillAndSubmit('İkinci İlan');

    await waitFor(() => expect(apiMocks.createRecruiterJob).toHaveBeenCalledTimes(2));
    expect(apiMocks.createRecruiterJob.mock.calls[0]?.[1]).toBe('web-job-command-first');
    expect(apiMocks.createRecruiterJob.mock.calls[1]?.[1]).toBe('web-job-command-second');
  });

  it('closes a stale editor after a version conflict refresh', async () => {
    const fresh = { ...JOB, version: 1, title: 'Güncel Ürün Yöneticisi' };
    apiMocks.listRecruiterJobs.mockResolvedValueOnce([JOB]).mockResolvedValueOnce([fresh]);
    apiMocks.updateRecruiterJob.mockRejectedValueOnce(new Error('409 sürüm çakışması'));

    render(<RecruiterJobsPanel canManage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Düzenle' }));
    fireEvent.change(screen.getByLabelText('İlan başlığı'), {
      target: { value: 'Benim Değişikliğim' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Değişiklikleri kaydet' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('başka bir işlemde güncellendi');
    expect(screen.queryByRole('form', { name: 'İlanı düzenle' })).not.toBeInTheDocument();
    expect(screen.getByText('Güncel Ürün Yöneticisi')).toBeVisible();
  });

  it('rotates an update key when the recruiter changes the failed request payload', async () => {
    apiMocks.createApplicationIdempotencyKey
      .mockReturnValueOnce('web-job-update-first')
      .mockReturnValueOnce('web-job-update-second');
    apiMocks.listRecruiterJobs.mockResolvedValue([JOB]);
    apiMocks.updateRecruiterJob
      .mockRejectedValueOnce(new Error('yanıt alınamadı'))
      .mockResolvedValueOnce({ ...JOB, title: 'İkinci Değişiklik', version: 1 });

    render(<RecruiterJobsPanel canManage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Düzenle' }));
    fireEvent.change(screen.getByLabelText('İlan başlığı'), {
      target: { value: 'İlk Değişiklik' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Değişiklikleri kaydet' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('yanıt alınamadı');

    fireEvent.change(screen.getByLabelText('İlan başlığı'), {
      target: { value: 'İkinci Değişiklik' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Değişiklikleri kaydet' }));

    await waitFor(() => expect(apiMocks.updateRecruiterJob).toHaveBeenCalledTimes(2));
    expect(apiMocks.updateRecruiterJob.mock.calls[0]?.[2]).toBe('web-job-update-first');
    expect(apiMocks.updateRecruiterJob.mock.calls[1]?.[2]).toBe('web-job-update-second');
  });

  it('reuses an update key when the recruiter retries the exact failed payload', async () => {
    apiMocks.createApplicationIdempotencyKey.mockReturnValue('web-job-update-retry');
    apiMocks.listRecruiterJobs.mockResolvedValue([JOB]);
    apiMocks.updateRecruiterJob
      .mockRejectedValueOnce(new Error('yanıt alınamadı'))
      .mockResolvedValueOnce({ ...JOB, title: 'Aynı Değişiklik', version: 1 });

    render(<RecruiterJobsPanel canManage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Düzenle' }));
    fireEvent.change(screen.getByLabelText('İlan başlığı'), {
      target: { value: 'Aynı Değişiklik' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Değişiklikleri kaydet' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('yanıt alınamadı');

    fireEvent.click(screen.getByRole('button', { name: 'Değişiklikleri kaydet' }));

    await waitFor(() => expect(apiMocks.updateRecruiterJob).toHaveBeenCalledTimes(2));
    expect(apiMocks.updateRecruiterJob.mock.calls[0]?.[2]).toBe('web-job-update-retry');
    expect(apiMocks.updateRecruiterJob.mock.calls[1]?.[2]).toBe('web-job-update-retry');
    expect(apiMocks.createApplicationIdempotencyKey).toHaveBeenCalledTimes(1);
  });

  it('publishes a draft with expected version and exposes the public link', async () => {
    apiMocks.listRecruiterJobs.mockResolvedValue([JOB]);
    render(<RecruiterJobsPanel canManage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Yayınla' }));

    await waitFor(() =>
      expect(apiMocks.transitionRecruiterJob).toHaveBeenCalledWith(
        JOB,
        'PUBLISHED',
        'web-job-command-1234',
      ),
    );
    expect(await screen.findByRole('link', { name: 'Public ilanı aç' })).toHaveAttribute(
      'href',
      `/careers/acik/jobs/${JOB.slug}`,
    );
  });

  it('keeps ATS VIEW users read-only without hiding their job list', async () => {
    apiMocks.listRecruiterJobs.mockResolvedValue([JOB]);
    render(<RecruiterJobsPanel canManage={false} />);

    expect(await screen.findByText('Ürün Yöneticisi')).toBeVisible();
    expect(screen.getByText('Salt-okuma erişimi')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Yeni ilan oluştur' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Yayınla' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Düzenle' })).not.toBeInTheDocument();
  });

  /**
   * ats#240 A: ilana özel başvuru soruları.
   *
   * Sözleşmenin taşıyıcı maddesi "order kimlik DEĞİL". UI'da bunu yapısal
   * kıldık: form state'inde `order` alanı YOK, dizideki konum sıradır ve
   * gönderirken türetilir; `questionId` ise taşınır. Aşağıdaki testler o
   * ayrımın kaybolmadığını kilitler.
   */
  describe('başvuru soruları', () => {
    const fillRequiredFields = () => {
      fireEvent.change(screen.getByLabelText('İlan başlığı'), {
        target: { value: 'Ürün Yöneticisi' },
      });
      fireEvent.change(screen.getByLabelText('Ekip'), { target: { value: 'Ürün ve Deneyim' } });
      fireEvent.change(screen.getByLabelText('Konum'), { target: { value: 'İstanbul' } });
      fireEvent.change(screen.getByLabelText('İlan özeti'), { target: { value: JOB.summary } });
    };

    it('sends the questions with the order derived from their position', async () => {
      render(<RecruiterJobsPanel canManage />);
      await screen.findByText('Henüz ilanınız yok.');
      fireEvent.click(screen.getByRole('button', { name: 'Yeni ilan oluştur' }));
      fillRequiredFields();

      expect(screen.getByTestId('job-questions-empty')).toBeVisible();
      fireEvent.click(screen.getByTestId('job-question-add'));
      fireEvent.click(screen.getByTestId('job-question-add'));
      const texts = screen.getAllByLabelText('Soru metni');
      fireEvent.change(texts[0], { target: { value: 'Kaç yıllık deneyiminiz var?' } });
      fireEvent.change(texts[1], { target: { value: 'Neden bu ilan?' } });
      fireEvent.click(screen.getByRole('button', { name: 'Taslak oluştur' }));

      await waitFor(() => expect(apiMocks.createRecruiterJob).toHaveBeenCalledTimes(1));
      expect(apiMocks.createRecruiterJob.mock.calls[0][0].questions).toEqual([
        { order: 1, text: 'Kaç yıllık deneyiminiz var?', kind: 'SHORT_TEXT', required: false },
        { order: 2, text: 'Neden bu ilan?', kind: 'SHORT_TEXT', required: false },
      ]);
    });

    it('keeps the question id when the recruiter reorders, and only swaps the order', async () => {
      const saved = {
        ...JOB,
        questions: [
          { questionId: `q_${'A'.repeat(16)}`, order: 1, text: 'Birinci', kind: 'SHORT_TEXT', required: false },
          { questionId: `q_${'B'.repeat(16)}`, order: 2, text: 'İkinci', kind: 'SHORT_TEXT', required: false },
        ],
      };
      apiMocks.listRecruiterJobs.mockResolvedValue([saved]);
      render(<RecruiterJobsPanel canManage />);
      fireEvent.click(await screen.findByRole('button', { name: 'Düzenle' }));

      fireEvent.click(screen.getByRole('button', { name: '2. soruyu yukarı taşı' }));
      fireEvent.click(screen.getByRole('button', { name: 'Değişiklikleri kaydet' }));

      await waitFor(() => expect(apiMocks.updateRecruiterJob).toHaveBeenCalledTimes(1));
      expect(apiMocks.updateRecruiterJob.mock.calls[0][1].questions).toEqual([
        { questionId: `q_${'B'.repeat(16)}`, order: 1, text: 'İkinci', kind: 'SHORT_TEXT', required: false },
        { questionId: `q_${'A'.repeat(16)}`, order: 2, text: 'Birinci', kind: 'SHORT_TEXT', required: false },
      ]);
    });

    it('sends options only for a single-choice question', async () => {
      render(<RecruiterJobsPanel canManage />);
      await screen.findByText('Henüz ilanınız yok.');
      fireEvent.click(screen.getByRole('button', { name: 'Yeni ilan oluştur' }));
      fillRequiredFields();
      fireEvent.click(screen.getByTestId('job-question-add'));
      fireEvent.change(screen.getByLabelText('Soru metni'), {
        target: { value: 'Çalışma modu tercihiniz?' },
      });

      // Önce metin sorusu: seçenek alanı hiç görünmez, gövdeye de girmez.
      expect(screen.queryByLabelText('1. soru, 1. seçenek')).toBeNull();

      fireEvent.change(screen.getByLabelText('Cevap biçimi'), {
        target: { value: 'SINGLE_CHOICE' },
      });
      fireEvent.change(screen.getByLabelText('1. soru, 1. seçenek'), {
        target: { value: 'Ofis' },
      });
      fireEvent.change(screen.getByLabelText('1. soru, 2. seçenek'), {
        target: { value: 'Uzaktan' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Taslak oluştur' }));

      await waitFor(() => expect(apiMocks.createRecruiterJob).toHaveBeenCalledTimes(1));
      expect(apiMocks.createRecruiterJob.mock.calls[0][0].questions).toEqual([
        {
          order: 1,
          text: 'Çalışma modu tercihiniz?',
          kind: 'SINGLE_CHOICE',
          required: false,
          options: [{ label: 'Ofis' }, { label: 'Uzaktan' }],
        },
      ]);
    });

    it('stops at the agreed ceiling instead of letting the form grow without limit', async () => {
      render(<RecruiterJobsPanel canManage />);
      await screen.findByText('Henüz ilanınız yok.');
      fireEvent.click(screen.getByRole('button', { name: 'Yeni ilan oluştur' }));

      const add = screen.getByTestId('job-question-add');
      for (let index = 0; index < 10; index += 1) fireEvent.click(add);

      expect(screen.getAllByTestId('job-question-row')).toHaveLength(10);
      expect(add).toBeDisabled();
      expect(screen.getByText('10 / 10 soru')).toBeVisible();
    });

    /**
     * Uyarı ENGELLEMEZ: kayıt başarılıdır ve başarı mesajı görünür. Uyarının
     * kaybolmaması ise sözleşmenin fail-closed tarafı — bu test onu kilitler.
     */
    it('shows the protected-attribute warning without failing the save', async () => {
      apiMocks.createRecruiterJob.mockResolvedValue({
        ...JOB,
        questions: [
          { questionId: `q_${'A'.repeat(16)}`, order: 1, text: 'Kaç yaşındasınız?', kind: 'SHORT_TEXT', required: false },
        ],
        questionWarnings: [
          { questionId: `q_${'A'.repeat(16)}`, category: 'AGE', signal: 'QUESTION_LIKE_PROTECTED_MENTION' },
        ],
      });
      render(<RecruiterJobsPanel canManage />);
      await screen.findByText('Henüz ilanınız yok.');
      fireEvent.click(screen.getByRole('button', { name: 'Yeni ilan oluştur' }));
      fillRequiredFields();
      fireEvent.click(screen.getByTestId('job-question-add'));
      fireEvent.change(screen.getByLabelText('Soru metni'), {
        target: { value: 'Kaç yaşındasınız?' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Taslak oluştur' }));

      expect(await screen.findByText(/taslak ilanı kalıcı olarak oluşturuldu/i)).toBeVisible();
      expect(await screen.findByTestId('job-question-warnings')).toBeVisible();
      expect(screen.getByText(/1\. soru/)).toBeVisible();
      expect(screen.getByText(/AGE/)).toBeVisible();
    });

    /**
     * Deploy sırası garanti değil: sorulari destekleyen backend henüz canlıda
     * olmayabilir ve yanıtta alan HİÇ bulunmaz. Düzenleme ekranı o durumda da
     * açılmalı — `undefined.map` ilan düzenlemeyi tamamen kilitlerdi.
     */
    it('still opens the edit form when the server response carries no questions field', async () => {
      const legacyJob = { ...JOB } as Record<string, unknown>;
      delete legacyJob.questions;
      delete legacyJob.questionWarnings;
      apiMocks.listRecruiterJobs.mockResolvedValue([legacyJob]);

      render(<RecruiterJobsPanel canManage />);
      fireEvent.click(await screen.findByRole('button', { name: 'Düzenle' }));

      expect(screen.getByTestId('job-questions-editor')).toBeVisible();
      expect(screen.getByTestId('job-questions-empty')).toBeVisible();
    });
  });

});
