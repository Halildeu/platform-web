// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CandidatePortalPage from './CandidatePortalPage';

const renderPage = (basename?: string) =>
  render(
    <MemoryRouter
      basename={basename}
      initialEntries={[basename ? `${basename}/candidate` : '/candidate']}
    >
      <Routes>
        <Route path="/candidate" element={<CandidatePortalPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('CandidatePortalPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows a public candidate journey without fetching account or PII data', () => {
    const previousTitle = document.title;
    const view = renderPage();

    expect(screen.getByRole('heading', { name: 'Kariyer yolculuğunuz tek yerde' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Yolculuğum' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Profilim' })).toBeVisible();
    expect(screen.getByText('Kalıcı başvuru')).toBeVisible();
    expect(screen.getByText(/gerçek veri kapalı/i)).toBeVisible();
    expect(document.title).toBe('Aday Alanım | Açık Kariyer');
    expect(fetch).not.toHaveBeenCalled();

    view.unmount();
    expect(document.title).toBe(previousTitle);
  });

  it('connects the candidate area to jobs and the editable application draft', () => {
    renderPage();

    expect(screen.getByRole('link', { name: 'Açık pozisyonlara göz at' })).toHaveAttribute(
      'href',
      '/jobs',
    );
    expect(screen.getByRole('link', { name: 'Örnek başvuruyu düzenle' })).toHaveAttribute(
      'href',
      '/jobs/urun-yoneticisi/apply',
    );
  });

  it('keeps candidate links under the configured application base path', () => {
    renderPage('/platform');

    expect(screen.getByRole('link', { name: 'Açık pozisyonlara göz at' })).toHaveAttribute(
      'href',
      '/platform/jobs',
    );
    expect(screen.getByRole('link', { name: 'Örnek başvuruyu düzenle' })).toHaveAttribute(
      'href',
      '/platform/jobs/urun-yoneticisi/apply',
    );
  });
});
