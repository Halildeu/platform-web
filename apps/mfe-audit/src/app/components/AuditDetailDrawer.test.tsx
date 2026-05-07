// @vitest-environment jsdom
/**
 * AuditDetailDrawer unit tests.
 *
 * Codex iter-1 review (PR #292, thread 019e0317) flagged that the
 * previous mock accepted `tabs` / `extra` props that the real
 * `@mfe/design-system` `DetailDrawer` never exposed. The component was
 * therefore "passing tests" while rendering an empty drawer body in
 * production. The mock below mirrors the real `DetailDrawerProps`
 * shape (`sections`, `subtitle`, `title`, `open`, `onClose`,
 * `children`) so any future drift between mfe-audit's drawer call
 * site and the design-system contract surfaces here as a type or
 * assertion failure rather than as silent prod breakage.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { AuditDetailDrawer, AuditDetailDrawerProps } from './AuditDetailDrawer';
import { AuditEvent } from '../types/audit-event';

// Mock design-system DetailDrawer with the REAL `DetailDrawerProps`
// shape (sections + title + subtitle + children + open + onClose).
vi.mock('@mfe/design-system', () => ({
  DetailDrawer: ({
    open,
    title,
    subtitle,
    children,
    sections,
  }: {
    open: boolean;
    onClose: () => void;
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    children?: React.ReactNode;
    sections?: Array<{ key: string; title?: React.ReactNode; content: React.ReactNode }>;
  }) => {
    if (!open) return null;
    return (
      <div data-testid="detail-drawer">
        <div data-testid="drawer-title">{title}</div>
        {subtitle && <div data-testid="drawer-subtitle">{subtitle}</div>}
        {children}
        {sections?.map((section) => (
          <div key={section.key} data-testid={`section-${section.key}`}>
            {section.title && (
              <span data-testid={`section-${section.key}-title`}>{section.title}</span>
            )}
            {section.content}
          </div>
        ))}
      </div>
    );
  },
}));

const baseEvent: AuditEvent = {
  id: 'ev-1',
  timestamp: '2024-06-15T10:30:00Z',
  userEmail: 'admin@example.com',
  service: 'auth-service',
  level: 'WARN',
  action: 'SESSION_EXPIRED',
  details: 'Session timed out',
  correlationId: 'corr-abc',
  metadata: { browser: 'Chrome' },
  before: { active: true },
  after: { active: false },
};

afterEach(() => {
  cleanup();
});

describe('AuditDetailDrawer', () => {
  const defaultProps: AuditDetailDrawerProps = {
    event: baseEvent,
    open: true,
    onClose: vi.fn(),
  };

  it('renders nothing when open is false', () => {
    render(<AuditDetailDrawer {...defaultProps} open={false} />);
    expect(screen.queryByTestId('detail-drawer')).toBeNull();
  });

  it('shows placeholder text when event is null', () => {
    render(<AuditDetailDrawer event={null} open={true} onClose={vi.fn()} />);
    expect(screen.getByText(/Henüz bir kayıt seçilmedi/)).toBeTruthy();
  });

  it('renders the summary section with event details', () => {
    render(<AuditDetailDrawer {...defaultProps} />);
    expect(screen.getByTestId('audit-detail-summary')).toBeTruthy();
    expect(screen.getByTestId('section-summary')).toBeTruthy();
    expect(screen.getByText('admin@example.com')).toBeTruthy();
    expect(screen.getByText('auth-service')).toBeTruthy();
    expect(screen.getByText('WARN')).toBeTruthy();
    expect(screen.getByText('corr-abc')).toBeTruthy();
    expect(screen.getByText('Session timed out')).toBeTruthy();
  });

  it('renders the diff section when before and after exist', () => {
    render(<AuditDetailDrawer {...defaultProps} />);
    expect(screen.getByTestId('section-diff')).toBeTruthy();
    expect(screen.getByTestId('audit-detail-diff')).toBeTruthy();
    expect(screen.getByText('Before')).toBeTruthy();
    expect(screen.getByText('After')).toBeTruthy();
  });

  it('does not render diff section when before and after are null', () => {
    const eventWithoutDiff: AuditEvent = {
      ...baseEvent,
      before: null,
      after: null,
    };
    render(<AuditDetailDrawer {...defaultProps} event={eventWithoutDiff} />);
    expect(screen.queryByTestId('section-diff')).toBeNull();
    expect(screen.queryByTestId('audit-detail-diff')).toBeNull();
  });

  it('renders the raw JSON section', () => {
    render(<AuditDetailDrawer {...defaultProps} />);
    expect(screen.getByTestId('section-raw')).toBeTruthy();
    expect(screen.getByTestId('audit-detail-raw')).toBeTruthy();
  });

  it('renders metadata when present', () => {
    render(<AuditDetailDrawer {...defaultProps} />);
    expect(screen.getByText('Metadata')).toBeTruthy();
  });

  it('passes the action through the subtitle slot (was the broken `extra` slot)', () => {
    // PR #292 (Codex iter-1) refactor: the old `extra` prop is not
    // a real DetailDrawer prop. The action now flows through
    // `subtitle` so it is actually rendered in the panel header.
    render(<AuditDetailDrawer {...defaultProps} />);
    const subtitle = screen.getByTestId('drawer-subtitle');
    expect(subtitle.textContent).toBe('SESSION_EXPIRED');
  });

  it('shows dash for missing correlationId', () => {
    const eventNoCorr: AuditEvent = {
      ...baseEvent,
      correlationId: undefined,
    };
    render(<AuditDetailDrawer {...defaultProps} event={eventNoCorr} />);
    // The correlation ID field should show a dash
    const summaryEl = screen.getByTestId('audit-detail-summary');
    expect(summaryEl.textContent).toContain('—');
  });

  it('emits one onTabChange callback per rendered section (telemetry parity)', () => {
    const onTabChange = vi.fn();
    render(<AuditDetailDrawer {...defaultProps} onTabChange={onTabChange} />);
    // Three sections render with diff payload present: summary, diff, raw.
    expect(onTabChange).toHaveBeenCalledTimes(3);
    expect(onTabChange).toHaveBeenCalledWith('summary', baseEvent);
    expect(onTabChange).toHaveBeenCalledWith('diff', baseEvent);
    expect(onTabChange).toHaveBeenCalledWith('raw', baseEvent);
  });

  it('emits two onTabChange callbacks when diff payload is absent', () => {
    const onTabChange = vi.fn();
    const eventNoDiff: AuditEvent = {
      ...baseEvent,
      before: null,
      after: null,
    };
    render(<AuditDetailDrawer {...defaultProps} event={eventNoDiff} onTabChange={onTabChange} />);
    expect(onTabChange).toHaveBeenCalledTimes(2);
    expect(onTabChange).toHaveBeenCalledWith('summary', eventNoDiff);
    expect(onTabChange).toHaveBeenCalledWith('raw', eventNoDiff);
  });
});
