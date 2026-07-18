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
  noticeVersion: 'kvkk-application-v1' as const,
  status: 'DRAFT' as const,
  applyEnabled: false,
  version: 0,
  createdAt: '2026-07-17T10:00:00Z',
  updatedAt: '2026-07-17T10:00:00Z',
};

describe('RecruiterJobsPanel', () => {
  beforeEach(() => {
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
    render(<RecruiterJobsPanel canManage />);

    const previewTrigger = await screen.findByRole('button', { name: 'Önizle' });
    fireEvent.click(previewTrigger);

    const preview = screen.getByTestId('recruiter-job-preview');
    expect(preview).toBeVisible();
    expect(within(preview).getByRole('heading', { name: JOB.title })).toBeVisible();
    expect(screen.getByText(/public yayına çıkmaz/i)).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Public ilanı aç' })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('recruiter-job-preview')).not.toBeInTheDocument();
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
});
