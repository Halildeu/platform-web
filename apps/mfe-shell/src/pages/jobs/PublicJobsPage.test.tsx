// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PublicJobsPage from './PublicJobsPage';

const renderPage = (basename?: string) =>
  render(
    <MemoryRouter basename={basename} initialEntries={[basename ? `${basename}/jobs` : '/jobs']}>
      <Routes>
        <Route path="/jobs" element={<PublicJobsPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('PublicJobsPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows a public synthetic catalog and never fetches candidate or job data', () => {
    const fetchMock = vi.mocked(fetch);
    const previousTitle = document.title;
    const view = renderPage();

    expect(screen.getByRole('heading', { name: 'Açık pozisyonları keşfedin' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Ürün Yöneticisi' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Senior Frontend Developer' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Product Designer' })).toBeVisible();
    expect(screen.getByText(/ilanlar sentetiktir/i)).toBeVisible();
    expect(document.title).toBe('Açık Pozisyonlar | Açık Kariyer');
    expect(fetchMock).not.toHaveBeenCalled();

    view.unmount();
    expect(document.title).toBe(previousTitle);
  });

  it('links every job card to its public application route', () => {
    renderPage();

    expect(screen.getByRole('link', { name: 'Ürün Yöneticisi rolüne başvur' })).toHaveAttribute(
      'href',
      '/jobs/urun-yoneticisi/apply',
    );
    expect(
      screen.getByRole('link', { name: 'Senior Frontend Developer rolüne başvur' }),
    ).toHaveAttribute('href', '/jobs/senior-frontend-developer/apply');
    expect(screen.getByRole('link', { name: 'Product Designer rolüne başvur' })).toHaveAttribute(
      'href',
      '/jobs/product-designer/apply',
    );
  });

  it('keeps job links under the configured application base path', () => {
    renderPage('/platform');

    expect(screen.getByRole('link', { name: 'Ürün Yöneticisi rolüne başvur' })).toHaveAttribute(
      'href',
      '/platform/jobs/urun-yoneticisi/apply',
    );
  });
});
