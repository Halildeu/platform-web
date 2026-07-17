// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PublicJobsPage from './PublicJobsPage';

const apiMocks = vi.hoisted(() => ({ listPublicJobs: vi.fn() }));
vi.mock('../../features/ats-portals/api/application-api', () => ({
  listPublicJobs: apiMocks.listPublicJobs,
}));

const JOBS = [
  {
    slug: 'urun-yoneticisi',
    title: 'Ürün Yöneticisi',
    team: 'Ürün',
    location: 'İstanbul',
    mode: 'Hibrit',
    employmentType: 'Tam zamanlı',
    summary: 'Ürün keşfi ve teslimat.',
    highlights: ['Ürün keşfi'],
  },
];

const renderPage = (basename?: string) =>
  render(
    <MemoryRouter basename={basename} initialEntries={[basename ? `${basename}/jobs` : '/jobs']}>
      <Routes>
        <Route path="/jobs" element={<PublicJobsPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('PublicJobsPage', () => {
  beforeEach(() => apiMocks.listPublicJobs.mockResolvedValue(JOBS));
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the backend-sourced public catalog and application route', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Ürün Yöneticisi' })).toBeVisible();
    expect(apiMocks.listPublicJobs).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Ürün Yöneticisi ilanını incele' })).toHaveAttribute(
      'href',
      '/jobs/urun-yoneticisi',
    );
    expect(screen.getByText(/kalıcı olarak test veritabanına/i)).toBeVisible();
  });

  it('shows a retryable error and never falls back to a fake catalog', async () => {
    apiMocks.listPublicJobs.mockRejectedValueOnce(new Error('servis kapalı'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('servis kapalı');
    expect(screen.queryByRole('heading', { name: 'Ürün Yöneticisi' })).not.toBeInTheDocument();
  });

  it('keeps backend-sourced job links under the configured base path', async () => {
    renderPage('/platform');
    expect(
      await screen.findByRole('link', { name: 'Ürün Yöneticisi ilanını incele' }),
    ).toHaveAttribute('href', '/platform/jobs/urun-yoneticisi');
  });

  it('keeps tenant context in canonical career links', async () => {
    render(
      <MemoryRouter initialEntries={['/careers/acik/jobs']}>
        <Routes>
          <Route path="/careers/:publicHandle/jobs" element={<PublicJobsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('link', { name: 'Ürün Yöneticisi ilanını incele' }),
    ).toHaveAttribute('href', '/careers/acik/jobs/urun-yoneticisi');
    expect(apiMocks.listPublicJobs).toHaveBeenCalledWith('acik');
  });
});
