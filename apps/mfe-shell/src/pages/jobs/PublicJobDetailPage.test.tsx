// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PublicJobDetailPage from './PublicJobDetailPage';

const apiMocks = vi.hoisted(() => ({ getPublicJob: vi.fn() }));
vi.mock('../../features/ats-portals/api/application-api', () => ({
  getPublicJob: apiMocks.getPublicJob,
}));

const JOB = {
  slug: 'urun-yoneticisi',
  title: 'Ürün Yöneticisi',
  team: 'Ürün',
  location: 'İstanbul',
  mode: 'Hibrit',
  employmentType: 'Tam zamanlı',
  summary: 'Kullanıcı ihtiyaçlarını ölçülebilir ürün sonuçlarına dönüştürün.',
  highlights: ['Ürün keşfi'],
};

describe('PublicJobDetailPage', () => {
  beforeEach(() => apiMocks.getPublicJob.mockResolvedValue(JOB));
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the canonical tenant-bound job and continues to its application form', async () => {
    render(
      <MemoryRouter initialEntries={['/careers/acik/jobs/urun-yoneticisi']}>
        <Routes>
          <Route path="/careers/:publicHandle/jobs/:jobSlug" element={<PublicJobDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: JOB.title })).toBeVisible();
    expect(apiMocks.getPublicJob).toHaveBeenCalledWith('urun-yoneticisi', 'acik');
    expect(screen.getByRole('link', { name: 'Başvuru formuna geç' })).toHaveAttribute(
      'href',
      '/careers/acik/jobs/urun-yoneticisi/apply',
    );
  });

  it('fails without rendering fake job data', async () => {
    apiMocks.getPublicJob.mockRejectedValueOnce(new Error('ilan bulunamadı'));
    render(
      <MemoryRouter initialEntries={['/jobs/yok']}>
        <Routes>
          <Route path="/jobs/:jobSlug" element={<PublicJobDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('ilan bulunamadı');
    expect(screen.queryByRole('heading', { name: JOB.title })).not.toBeInTheDocument();
  });
});
