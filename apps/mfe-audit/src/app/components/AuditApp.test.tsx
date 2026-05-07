// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

// Mock child components to isolate AuditApp.
vi.mock('./AuditEventFeed', () => ({
  AuditEventFeed: () => <div data-testid="mock-audit-event-feed" />,
}));

// Faz 23.5 PR6 FE: Delivery Logs tab is mounted alongside AuditEventFeed.
// Mocking it here keeps the AuditApp test focused on tab-switching state
// without touching React Query / shared-http internals.
vi.mock('./DeliveryLogsTab', () => ({
  DeliveryLogsTab: () => <div data-testid="mock-delivery-logs-tab" />,
}));

import { AuditApp } from './AuditApp';

afterEach(() => {
  cleanup();
});

describe('AuditApp', () => {
  it('renders the page with correct test id', () => {
    render(<AuditApp />);
    expect(screen.getByTestId('audit-events-page')).toBeTruthy();
  });

  it('renders the page title', () => {
    render(<AuditApp />);
    expect(screen.getByText('Audit Event Feed')).toBeTruthy();
  });

  it('renders the page description', () => {
    render(<AuditApp />);
    expect(
      screen.getByText('Monitor system-wide audit events, inspect diffs and export reports.'),
    ).toBeTruthy();
  });

  it('renders the AuditEventFeed child component by default', () => {
    render(<AuditApp />);
    expect(screen.getByTestId('mock-audit-event-feed')).toBeTruthy();
    expect(screen.queryByTestId('mock-delivery-logs-tab')).toBeNull();
  });

  it('wraps content in a main element', () => {
    render(<AuditApp />);
    const main = screen.getByTestId('audit-events-page');
    expect(main.tagName).toBe('MAIN');
  });

  it('renders a header element inside main', () => {
    render(<AuditApp />);
    const main = screen.getByTestId('audit-events-page');
    const header = main.querySelector('header');
    expect(header).not.toBeNull();
  });

  it('switches to the Delivery Logs tab when the operator clicks it', () => {
    render(<AuditApp />);
    fireEvent.click(screen.getByTestId('audit-tab-delivery-logs'));
    expect(screen.getByTestId('mock-delivery-logs-tab')).toBeTruthy();
    expect(screen.queryByTestId('mock-audit-event-feed')).toBeNull();
  });

  it('returns to the Audit Events tab on a second click', () => {
    render(<AuditApp />);
    fireEvent.click(screen.getByTestId('audit-tab-delivery-logs'));
    fireEvent.click(screen.getByTestId('audit-tab-events'));
    expect(screen.getByTestId('mock-audit-event-feed')).toBeTruthy();
    expect(screen.queryByTestId('mock-delivery-logs-tab')).toBeNull();
  });
});
