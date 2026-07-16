// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RecruiterWorkspacePage from './RecruiterWorkspacePage';

const renderPage = () =>
  render(
    <MemoryRouter>
      <RecruiterWorkspacePage />
    </MemoryRouter>,
  );

describe('RecruiterWorkspacePage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders a synthetic human-controlled pipeline and keeps critical actions disabled', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'İK Çalışma Alanı' })).toBeVisible();
    expect(screen.getByTestId('recruiter-pipeline')).toBeVisible();
    expect(screen.getByText('Aday DEMO-104')).toBeVisible();
    expect(screen.getByRole('button', { name: /Adaya mesaj gönder/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Adayı reddet/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Teklif gönder/i })).toBeDisabled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('filters candidates by position and skill without a remote request', () => {
    renderPage();

    fireEvent.change(screen.getByLabelText('Pozisyon'), {
      target: { value: 'frontend-developer' },
    });
    expect(screen.getByText('Aday DEMO-207')).toBeVisible();
    expect(screen.queryByText('Aday DEMO-104')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Aday veya beceri ara'), {
      target: { value: 'erişilebilirlik' },
    });
    expect(screen.getByText('Aday DEMO-207')).toBeVisible();
    expect(screen.queryByText('Aday DEMO-215')).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('creates only a local human-note preview for the selected synthetic candidate', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Kanıt durumunu incele: Aday DEMO-104' }));
    expect(screen.getByRole('heading', { name: 'Değerlendirme taslağı' })).toHaveFocus();
    fireEvent.change(screen.getByLabelText('İnsan değerlendirme notu'), {
      target: { value: 'Ürün keşfi örneği için insan doğrulaması bekleniyor.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Yerel taslağı önizle' }));

    expect(screen.getByTestId('recruiter-local-note-preview')).toHaveTextContent(
      'Ürün keşfi örneği için insan doğrulaması bekleniyor.',
    );
    expect(screen.getByText('Kaydedilmedi veya gönderilmedi.')).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
  });
});
