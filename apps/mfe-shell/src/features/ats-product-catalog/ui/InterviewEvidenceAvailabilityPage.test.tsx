// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import InterviewEvidenceAvailabilityPage from './InterviewEvidenceAvailabilityPage';

describe('InterviewEvidenceAvailabilityPage', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const renderHub = (remoteEnabled = false) =>
    render(
      <MemoryRouter>
        <InterviewEvidenceAvailabilityPage remoteEnabled={remoteEnabled} />
      </MemoryRouter>,
    );

  it('keeps the permanent product hub visible while the remote is off', () => {
    renderHub(false);

    expect(screen.getByRole('heading', { name: 'ATS Ürün Merkezi' })).toBeInTheDocument();
    expect(screen.getByTestId('ats-runtime-status')).toHaveTextContent('henüz açık değil');
    expect(screen.getByTestId('ats-capability-grid').querySelectorAll('article')).toHaveLength(9);
    expect(screen.getByTestId('ats-live-module-gated')).toBeInTheDocument();
    expect(screen.queryByTestId('ats-live-interview-evidence-link')).not.toBeInTheDocument();
    expect(screen.getByTestId('ats-candidate-portal-link')).toHaveAttribute('href', '/candidate');
    expect(screen.getByTestId('ats-recruiter-workspace-link')).toHaveAttribute(
      'href',
      '/admin/ats/recruiter',
    );
    expect(screen.getByText('Bu merkezin açmadığı kapılar')).toBeInTheDocument();
  });

  it('keeps the hub visible and offers a separate live-module launch when remote is on', () => {
    renderHub(true);

    expect(screen.getByRole('heading', { name: 'ATS Ürün Merkezi' })).toBeInTheDocument();
    expect(screen.getByTestId('ats-runtime-status')).toHaveTextContent('bu dağıtımda hazır');
    expect(screen.getByTestId('ats-live-interview-evidence-link')).toHaveAttribute(
      'href',
      '/admin/interview-evidence',
    );
    expect(screen.getByTestId('ats-capability-interview-evidence-workspace')).toHaveTextContent(
      'Canlı · okuma',
    );
    expect(screen.getByTestId('ats-capability-interview-evidence-workspace')).toHaveTextContent(
      'Canlı salt-okunur görünüm ayrı modül bağlantısından açılır',
    );
    expect(screen.getByTestId('ats-capability-grid').querySelectorAll('article')).toHaveLength(9);
  });

  it('filters the canonical capability registry by target role without claiming access', () => {
    renderHub();

    fireEvent.click(screen.getByTestId('ats-role-filter-candidate'));

    expect(screen.getByText('3 özellik gösteriliyor')).toBeInTheDocument();
    expect(screen.getByTestId('ats-candidate-role-boundary')).toHaveTextContent(
      'Bu yönetici adresi adaya verilmez',
    );
    expect(screen.getByTestId('ats-capability-candidate-cv-pdf-import')).toHaveTextContent(
      'gerçek CV/PII işlenmez',
    );
    expect(screen.getByTestId('ats-capability-candidate-review-and-appeal')).toBeInTheDocument();
    expect(screen.getByTestId('ats-capability-skills-evidence')).toBeInTheDocument();
    expect(screen.queryByTestId('ats-capability-agentic-screening')).not.toBeInTheDocument();
  });

  it('runs and resets a local-only safe scenario without a network action', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderHub();

    const coaching = screen.getByTestId('ats-capability-citation-backed-coaching');
    fireEvent.click(screen.getByRole('button', { name: 'Koçluk önerisini dene' }));

    expect(coaching).toHaveTextContent('Sentetik görüşmede');
    expect(coaching).not.toHaveTextContent('Öneri uygulanamaz');
    fireEvent.click(screen.getByRole('button', { name: 'Sentetik çıktıyı üret' }));
    expect(coaching).toHaveTextContent('Öneri uygulanamaz');
    expect(coaching).toHaveTextContent('ağ isteği, kayıt, bildirim veya karar üretilmedi');
    expect(coaching.querySelector('a')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Denemeyi sıfırla' }));
    expect(coaching).not.toHaveTextContent('Öneri uygulanamaz');
  });

  it('renders the agentic proposal boundary without candidate mutation actions', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderHub();

    const agentic = screen.getByTestId('ats-capability-agentic-screening');
    fireEvent.click(screen.getByRole('button', { name: 'Ajan önerisini güvenle dene' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sentetik çıktıyı üret' }));

    expect(agentic).toHaveTextContent('Mesaj gönderilmez');
    expect(agentic).toHaveTextContent('red/teklif/sıralama üretilmez');
    expect(agentic).toHaveTextContent('toplu onay yoktur');
    expect(agentic).toHaveTextContent('ağ isteği, kayıt, bildirim veya karar üretilmedi');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('offers per-field candidate control in a synthetic resume draft without file upload', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderHub();
    fireEvent.click(screen.getByTestId('ats-role-filter-candidate'));

    const cvImport = screen.getByTestId('ats-capability-candidate-cv-pdf-import');
    expect(cvImport.querySelector('input[type="file"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sentetik PDF taslak akışını dene' }));
    expect(cvImport).toHaveTextContent('Dosya seçimi, gerçek PDF/PII');
    fireEvent.click(screen.getByRole('button', { name: 'Sentetik PDF örneğini işle' }));

    expect(
      screen.getByTestId('ats-synthetic-resume-proposals').querySelectorAll('article'),
    ).toHaveLength(5);
    const emailInput = screen.getByLabelText('E-posta');
    fireEvent.change(emailInput, {
      target: { value: 'd' },
    });
    expect(emailInput).not.toHaveAttribute('readonly');
    fireEvent.change(emailInput, {
      target: { value: 'duzeltilmis@example.invalid' },
    });
    expect(emailInput).not.toHaveAttribute('readonly');
    expect(
      screen.getByRole('button', { name: 'E-posta düzenlemesini kabul et' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'E-posta düzenlemesini reddet' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Deneyim alanını kabul et' }));
    fireEvent.click(screen.getByRole('button', { name: 'Eğitim alanını reddet' }));
    fireEvent.click(screen.getByTestId('ats-resume-transfer-selected'));

    const draft = screen.getByTestId('ats-synthetic-resume-draft');
    expect(draft).toHaveTextContent('duzeltilmis@example.invalid');
    expect(draft).toHaveTextContent('Sentetik Ürün Uzmanı');
    expect(draft).not.toHaveTextContent('Örnek Üniversite');
    expect(draft).toHaveTextContent('başvuru gönderilmedi');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(cvImport.querySelector('input[type="file"]')).toBeNull();
  });

  it('requires a second explicit action before rejecting every resume proposal', () => {
    renderHub();
    fireEvent.click(screen.getByTestId('ats-role-filter-candidate'));
    fireEvent.click(screen.getByRole('button', { name: 'Sentetik PDF taslak akışını dene' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sentetik PDF örneğini işle' }));

    fireEvent.click(screen.getByRole('button', { name: 'Tümünü reddet' }));
    expect(screen.getByRole('alert')).toHaveTextContent('ikinci onay olmadan');
    expect(screen.getAllByText('İncelenmedi')).toHaveLength(5);

    fireEvent.click(screen.getByRole('button', { name: 'Tümünü reddetmeyi onayla' }));
    expect(screen.getAllByText('Reddedildi')).toHaveLength(5);
    expect(screen.getByTestId('ats-resume-transfer-selected')).toBeDisabled();
  });
});
