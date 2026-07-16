// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CandidateApplicationPage from './CandidateApplicationPage';

const renderPage = (path = '/jobs/urun-yoneticisi/apply') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/jobs/:jobSlug/apply" element={<CandidateApplicationPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('CandidateApplicationPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('scrollTo', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders a logged-out public job application form with candidate fields', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Ürün Yöneticisi' })).toBeInTheDocument();
    expect(screen.getByTestId('candidate-fullName')).toBeInTheDocument();
    expect(screen.getByTestId('candidate-email')).toBeInTheDocument();
    expect(screen.getByTestId('candidate-resume')).toHaveAttribute(
      'accept',
      'application/pdf,.pdf',
    );
    expect(screen.getByRole('link', { name: 'Açık Kariyer ilan listesi' })).toHaveAttribute(
      'href',
      '/jobs',
    );
    expect(screen.queryByText(/giriş yap/i)).not.toBeInTheDocument();
  });

  it('fills an editable synthetic resume, previews it and creates only a local receipt', () => {
    const fetchMock = vi.mocked(fetch);
    renderPage();

    fireEvent.click(screen.getByTestId('fill-synthetic-resume'));
    expect(screen.getByTestId('candidate-email')).toHaveValue('deniz.yilmaz@example.test');
    fireEvent.change(screen.getByTestId('candidate-fullName'), {
      target: { value: 'Düzenlenmiş Demo Adayı' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu önizle' }));

    expect(screen.getByTestId('candidate-application-preview')).toHaveTextContent(
      'Düzenlenmiş Demo Adayı',
    );
    const confirmations = screen.getAllByRole('checkbox');
    fireEvent.click(confirmations[0]);
    fireEvent.click(confirmations[1]);
    fireEvent.click(screen.getByTestId('create-local-application-receipt'));

    expect(screen.getByTestId('candidate-application-receipt')).toHaveTextContent(
      'Form akışı başarıyla denendi',
    );
    expect(screen.getByTestId('candidate-receipt-id')).toHaveTextContent(/^DEMO-[A-Z0-9]+$/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps selected PDF bytes local and displays only file metadata', () => {
    const fetchMock = vi.mocked(fetch);
    renderPage('/jobs/senior-frontend-developer/apply');
    const pdf = new File(['synthetic-pdf'], 'ornek-cv.pdf', { type: 'application/pdf' });

    fireEvent.change(screen.getByTestId('candidate-resume'), { target: { files: [pdf] } });

    expect(screen.getByTestId('candidate-resume-meta')).toHaveTextContent('ornek-cv.pdf');
    expect(screen.getByTestId('candidate-resume-meta')).toHaveTextContent('yalnız bu cihazda');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a non-PDF attachment before it reaches form state', () => {
    renderPage();
    const textFile = new File(['not-a-pdf'], 'cv.txt', { type: 'text/plain' });

    fireEvent.change(screen.getByTestId('candidate-resume'), {
      target: { files: [textFile] },
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Yalnız PDF dosyası seçebilirsiniz.');
    expect(screen.queryByTestId('candidate-resume-meta')).not.toBeInTheDocument();
  });

  it('rejects a renamed non-PDF even when its file name ends with .pdf', () => {
    renderPage();
    const renamedTextFile = new File(['not-a-pdf'], 'yaniltici-cv.pdf', {
      type: 'text/plain',
    });

    fireEvent.change(screen.getByTestId('candidate-resume'), {
      target: { files: [renamedTextFile] },
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Yalnız PDF dosyası seçebilirsiniz.');
    expect(screen.queryByTestId('candidate-resume-meta')).not.toBeInTheDocument();
  });

  it('rejects a PDF larger than 10 MB before it reaches form state', () => {
    renderPage();
    const oversizedPdf = new File(['synthetic'], 'buyuk-cv.pdf', {
      type: 'application/pdf',
    });
    Object.defineProperty(oversizedPdf, 'size', { value: 10 * 1024 * 1024 + 1 });

    fireEvent.change(screen.getByTestId('candidate-resume'), {
      target: { files: [oversizedPdf] },
    });

    expect(screen.getByRole('alert')).toHaveTextContent('PDF dosyası en fazla 10 MB olabilir.');
    expect(screen.queryByTestId('candidate-resume-meta')).not.toBeInTheDocument();
  });

  it('renders a readable title for a job slug that is not in the local catalog', () => {
    renderPage('/jobs/veri-bilimi-lideri/apply');

    expect(screen.getByRole('heading', { name: 'Veri Bilimi Lideri' })).toBeInTheDocument();
    expect(screen.getByText('Açık Pozisyon')).toBeInTheDocument();
  });

  it('does not open preview while required fields are missing', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu önizle' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Önizlemeye geçmek için yıldızlı alanları doldurun.',
    );
    expect(screen.queryByTestId('candidate-application-preview')).not.toBeInTheDocument();
  });

  it('validates candidate contact fields before opening preview', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('fill-synthetic-resume'));
    fireEvent.change(screen.getByTestId('candidate-email'), {
      target: { value: 'gecersiz-adres' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu önizle' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Geçerli bir e-posta adresi girin.');
    expect(screen.queryByTestId('candidate-application-preview')).not.toBeInTheDocument();
  });

  it('requires fresh confirmations after returning to edit candidate information', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('fill-synthetic-resume'));
    fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu önizle' }));
    const confirmations = screen.getAllByRole('checkbox');
    fireEvent.click(confirmations[0]);
    fireEvent.click(confirmations[1]);
    expect(screen.getByTestId('create-local-application-receipt')).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Bilgileri düzenle' }));
    fireEvent.change(screen.getByTestId('candidate-fullName'), {
      target: { value: 'Yeniden Düzenlenmiş Aday' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu önizle' }));

    expect(screen.getByTestId('create-local-application-receipt')).toBeDisabled();
    expect(screen.getAllByRole('checkbox')[0]).not.toBeChecked();
    expect(screen.getAllByRole('checkbox')[1]).not.toBeChecked();
  });
});
