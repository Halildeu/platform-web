// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import InterviewEvidenceAvailabilityPage from './InterviewEvidenceAvailabilityPage';

describe('InterviewEvidenceAvailabilityPage', () => {
  afterEach(() => cleanup());

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

  it('keeps safe preview boundaries visible before any real action', () => {
    renderHub();

    const coaching = screen.getByTestId('ats-capability-citation-backed-coaching');
    const summary = coaching.querySelector('summary');
    expect(summary).not.toBeNull();
    fireEvent.click(summary!);

    expect(coaching).toHaveTextContent('Sentetik görüşmede');
    expect(coaching).toHaveTextContent('Öneri uygulanamaz');
    expect(coaching.querySelector('button')).toBeNull();
    expect(coaching.querySelector('a')).toBeNull();
  });
});
