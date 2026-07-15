// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import InterviewEvidenceAvailabilityPage from './InterviewEvidenceAvailabilityPage';

describe('InterviewEvidenceAvailabilityPage', () => {
  afterEach(() => cleanup());

  it('explains remote unavailability without hiding the product surface', () => {
    render(<InterviewEvidenceAvailabilityPage />);

    expect(screen.getByRole('heading', { name: 'ATS ürün alanı' })).toBeInTheDocument();
    expect(screen.getByTestId('ats-remote-unavailable-status')).toHaveTextContent(
      'Menü ve adresiniz hazır',
    );
    expect(screen.getByTestId('ats-capability-grid').querySelectorAll('article')).toHaveLength(8);
    expect(screen.getByText('Bu sayfanın açmadığı kapılar')).toBeInTheDocument();
  });

  it('filters the canonical capability registry by product role', () => {
    render(<InterviewEvidenceAvailabilityPage />);

    fireEvent.click(screen.getByTestId('ats-role-filter-candidate'));

    expect(screen.getByText('2 özellik gösteriliyor')).toBeInTheDocument();
    expect(screen.getByTestId('ats-capability-candidate-review-and-appeal')).toBeInTheDocument();
    expect(screen.getByTestId('ats-capability-skills-evidence')).toBeInTheDocument();
    expect(screen.queryByTestId('ats-capability-agentic-screening')).not.toBeInTheDocument();
  });

  it('keeps safe preview boundaries visible before any real action', () => {
    render(<InterviewEvidenceAvailabilityPage />);

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
