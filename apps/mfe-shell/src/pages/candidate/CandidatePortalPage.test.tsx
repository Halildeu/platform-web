// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CandidatePortalPage from './CandidatePortalPage';

const apiMocks = vi.hoisted(() => ({ readCandidateSession: vi.fn(), getCandidateStatus: vi.fn() }));
vi.mock('../../features/ats-portals/api/application-api', () => ({
  readCandidateSession: apiMocks.readCandidateSession,
  getCandidateStatus: apiMocks.getCandidateStatus,
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
});
