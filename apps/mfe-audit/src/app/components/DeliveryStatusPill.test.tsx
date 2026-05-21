// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DeliveryStatusPill, FailureCategoryLabel } from './DeliveryStatusPill';

/**
 * Faz 23.4 M6b — unit tests for the DLR status pill + failure
 * category label components (Codex `019e4925` AGREE).
 */

afterEach(() => {
  cleanup();
});

describe('DeliveryStatusPill (M6b)', () => {
  it('renders DELIVERED with success label + tooltip detail when supplied', () => {
    render(<DeliveryStatusPill status="DELIVERED" detail="2026-05-20 22:30 UTC" />);
    const pill = screen.getByTestId('delivery-status-pill-DELIVERED');
    expect(pill.getAttribute('aria-label')).toContain('Teslim edildi');
    expect(pill.getAttribute('aria-label')).toContain('2026-05-20 22:30 UTC');
    expect(pill.getAttribute('title')).toContain('Teslim edildi');
    expect(pill.textContent).toContain('Teslim edildi');
  });

  it('renders FAILED with failure label and warning icon', () => {
    render(<DeliveryStatusPill status="FAILED" />);
    const pill = screen.getByTestId('delivery-status-pill-FAILED');
    expect(pill.getAttribute('aria-label')).toBe('Başarısız');
    expect(pill.textContent).toContain('Başarısız');
  });

  it('renders RETRY with amber palette and refresh icon', () => {
    render(<DeliveryStatusPill status="RETRY" />);
    const pill = screen.getByTestId('delivery-status-pill-RETRY');
    expect(pill.getAttribute('aria-label')).toBe('Tekrar denenecek');
  });

  it('renders ACCEPTED with provider-accepted label', () => {
    render(<DeliveryStatusPill status="ACCEPTED" />);
    const pill = screen.getByTestId('delivery-status-pill-ACCEPTED');
    expect(pill.getAttribute('aria-label')).toBe('Sağlayıcı kabul etti');
  });

  it('renders BLOCKED_BY_PREFERENCE with policy label', () => {
    render(<DeliveryStatusPill status="BLOCKED_BY_PREFERENCE" />);
    const pill = screen.getByTestId('delivery-status-pill-BLOCKED_BY_PREFERENCE');
    expect(pill.getAttribute('aria-label')).toBe('Tercih politikası nedeniyle');
  });

  it('falls back to plain text for unknown statuses (forward-compat)', () => {
    // Cast through unknown to force a value outside the typed enum so
    // we exercise the fallback branch.
    render(<DeliveryStatusPill status={'NEW_BACKEND_STATUS' as never} />);
    const pill = screen.getByTestId('delivery-status-pill-NEW_BACKEND_STATUS');
    expect(pill.textContent).toBe('NEW_BACKEND_STATUS');
  });
});

describe('FailureCategoryLabel (M6b)', () => {
  it('renders Turkish label for RECIPIENT_REJECTED', () => {
    render(<FailureCategoryLabel category="RECIPIENT_REJECTED" />);
    const cell = screen.getByTestId('delivery-failure-category-RECIPIENT_REJECTED');
    expect(cell.textContent).toBe('Alıcı reddetti');
    expect(cell.getAttribute('aria-label')).toBe('Alıcı reddetti');
  });

  it('renders dash for UNKNOWN (no meaningful failure)', () => {
    render(<FailureCategoryLabel category="UNKNOWN" />);
    const cell = screen.getByTestId('delivery-failure-category-UNKNOWN');
    expect(cell.textContent).toBe('—');
  });

  it('uses redacted summary as tooltip when present', () => {
    render(
      <FailureCategoryLabel
        category="PROVIDER_QUOTA"
        redactedSummary="provider.failure.quota_exhausted"
      />,
    );
    const cell = screen.getByTestId('delivery-failure-category-PROVIDER_QUOTA');
    expect(cell.getAttribute('title')).toBe('provider.failure.quota_exhausted');
  });

  it('falls back to localized label as tooltip when summary is empty', () => {
    render(<FailureCategoryLabel category="TRANSIENT_NETWORK" redactedSummary="" />);
    const cell = screen.getByTestId('delivery-failure-category-TRANSIENT_NETWORK');
    expect(cell.getAttribute('title')).toBe('Geçici ağ hatası');
  });

  it('covers all 7 failure categories with Turkish labels', () => {
    const categories: Array<[string, string]> = [
      ['PROVIDER_QUOTA', 'Sağlayıcı kotası aşıldı'],
      ['RECIPIENT_REJECTED', 'Alıcı reddetti'],
      ['RECIPIENT_BLOCKED', 'Alıcı bloklu'],
      ['INVALID_TARGET', 'Geçersiz hedef'],
      ['TRANSIENT_NETWORK', 'Geçici ağ hatası'],
      ['AUTH_FAILURE', 'Sağlayıcı kimlik hatası'],
    ];
    for (const [cat, label] of categories) {
      const { unmount } = render(<FailureCategoryLabel category={cat as never} />);
      expect(screen.getByText(label)).toBeTruthy();
      unmount();
    }
  });
});
