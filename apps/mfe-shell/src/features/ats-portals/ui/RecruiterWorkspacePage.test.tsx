// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RecruiterWorkspacePage from './RecruiterWorkspacePage';

const apiMocks = vi.hoisted(() => ({
  listRecruiterApplications: vi.fn(),
  updateRecruiterApplicationStatus: vi.fn(),
}));
vi.mock('../api/application-api', () => ({
  listRecruiterApplications: apiMocks.listRecruiterApplications,
  updateRecruiterApplicationStatus: apiMocks.updateRecruiterApplicationStatus,
}));

const APPLICATION = {
  publicRef: 'app_abcdefghijklmnopqrstuvwx',
  jobSlug: 'urun-yoneticisi',
  jobTitle: 'Ürün Yöneticisi',
  fullName: 'Deniz Sentetik',
  email: 'deniz@example.test',
  phone: '+905550000000',
  city: 'İstanbul',
  linkedIn: null,
  portfolio: null,
  summary: 'Sentetik profesyonel özet',
  experience: 'Sentetik deneyim',
  education: 'Sentetik eğitim',
  skills: ['Ürün keşfi', 'Araştırma'],
  note: 'Sentetik not',
  status: 'SUBMITTED',
  version: 0,
  createdAt: '2026-07-16T10:00:00Z',
  updatedAt: '2026-07-16T10:00:00Z',
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <RecruiterWorkspacePage />
    </MemoryRouter>,
  );

describe('RecruiterWorkspacePage', () => {
  beforeEach(() => {
    apiMocks.listRecruiterApplications.mockResolvedValue({
      items: [APPLICATION],
      page: 0,
      size: 50,
      total: 1,
    });
    apiMocks.updateRecruiterApplicationStatus.mockResolvedValue({
      ...APPLICATION,
      status: 'UNDER_REVIEW',
      version: 1,
    });
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the authenticated persistent inbox instead of synthetic cards', async () => {
    renderPage();
    expect(await screen.findByText('Deniz Sentetik')).toBeVisible();
    expect(screen.getByText('deniz@example.test')).toBeVisible();
    expect(screen.getByText('Kalıcı başvuru kutusu')).toHaveClass('text-text-primary');
    expect(apiMocks.listRecruiterApplications).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Ret, teklif, otomatik puanlama/i)).toBeVisible();
  });

  it('opens the application and performs a versioned human status transition', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Başvuruyu incele' }));
    fireEvent.click(screen.getByRole('button', { name: 'İnsan incelemesini başlat' }));
    expect(apiMocks.updateRecruiterApplicationStatus).toHaveBeenCalledWith(
      APPLICATION.publicRef,
      0,
      'UNDER_REVIEW',
    );
    expect(await screen.findByRole('button', { name: 'Mülakat planlamasına al' })).toBeVisible();
  });

  it('filters the real inbox by candidate or skill', async () => {
    renderPage();
    await screen.findByText('Deniz Sentetik');
    fireEvent.change(screen.getByLabelText('Aday, e-posta veya beceri ara'), {
      target: { value: 'bulunmayan' },
    });
    expect(screen.queryByText('Deniz Sentetik')).not.toBeInTheDocument();
  });

  it('keeps the terminal success surface on an AA-readable text token', async () => {
    apiMocks.listRecruiterApplications.mockResolvedValue({
      items: [{ ...APPLICATION, status: 'INTERVIEW_PENDING' }],
      page: 0,
      size: 50,
      total: 1,
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Başvuruyu incele' }));
    expect(screen.getByText('Mülakat planlaması bekleniyor.')).toHaveClass('text-text-primary');
  });
});
