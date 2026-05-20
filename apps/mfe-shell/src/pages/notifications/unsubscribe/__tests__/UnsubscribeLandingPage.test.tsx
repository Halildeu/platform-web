// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock RTK Query hook BEFORE module import so module resolution
// picks up the mocked version.
const { useRedeemUnsubscribeTokenQueryMock, refetchMock } = vi.hoisted(() => ({
  useRedeemUnsubscribeTokenQueryMock: vi.fn(),
  refetchMock: vi.fn(),
}));

vi.mock('../../../../features/notifications/api/notify-unsubscribe.api', () => ({
  useRedeemUnsubscribeTokenQuery: useRedeemUnsubscribeTokenQueryMock,
}));

// Lightweight stubs for design-system components — actual visual
// concerns belong to the design-system test suite.
vi.mock('@mfe/design-system', () => ({
  Alert: ({
    children,
    title,
    variant,
    ...rest
  }: React.PropsWithChildren<{ title?: string; variant?: string }>) => (
    <div role="alert" data-variant={variant} {...rest}>
      {title && <strong>{title}</strong>}
      {children}
    </div>
  ),
  Button: ({ children, onClick, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick} {...rest}>
      {children}
    </button>
  ),
  Spinner: () => <div data-testid="spinner" />,
}));

import UnsubscribeLandingPage from '../UnsubscribeLandingPage.ui';

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <UnsubscribeLandingPage />
    </MemoryRouter>,
  );
}

describe('UnsubscribeLandingPage (Faz 23.5 M5 G3)', () => {
  beforeEach(() => {
    useRedeemUnsubscribeTokenQueryMock.mockReset();
    refetchMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders missing-token alert when no token query param present', () => {
    useRedeemUnsubscribeTokenQueryMock.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: false,
      isFetching: false,
      refetch: refetchMock,
    });

    renderAt('/notifications/unsubscribe');

    expect(screen.getByTestId('unsubscribe-missing-token')).toBeInTheDocument();
    expect(screen.getByText(/Bağlantı eksik/)).toBeInTheDocument();
  });

  it('renders spinner while query is loading', () => {
    useRedeemUnsubscribeTokenQueryMock.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      isFetching: true,
      refetch: refetchMock,
    });

    renderAt('/notifications/unsubscribe?token=abc');

    expect(screen.getByTestId('unsubscribe-spinner')).toBeInTheDocument();
    expect(screen.getByText(/Aboneliğiniz iptal ediliyor/)).toBeInTheDocument();
  });

  it('renders success alert on status: unsubscribed', () => {
    useRedeemUnsubscribeTokenQueryMock.mockReturnValue({
      data: { status: 'unsubscribed' },
      error: undefined,
      isLoading: false,
      isFetching: false,
      refetch: refetchMock,
    });

    renderAt('/notifications/unsubscribe?token=valid-token');

    expect(screen.getByTestId('unsubscribe-success')).toBeInTheDocument();
    expect(screen.getByText(/Aboneliğiniz iptal edildi/)).toBeInTheDocument();
    // Settings link should be present (auth-gated fallback).
    expect(screen.getByTestId('unsubscribe-settings-link')).toBeInTheDocument();
  });

  it('renders invalid-token alert on HTTP 401', () => {
    useRedeemUnsubscribeTokenQueryMock.mockReturnValue({
      data: undefined,
      error: { status: 401, data: 'Unauthorized' },
      isLoading: false,
      isFetching: false,
      refetch: refetchMock,
    });

    renderAt('/notifications/unsubscribe?token=bad-token');

    expect(screen.getByTestId('unsubscribe-invalid')).toBeInTheDocument();
    expect(screen.getByText(/Bağlantı geçersiz veya süresi dolmuş/)).toBeInTheDocument();
  });

  it('renders invalid-token alert on HTTP 410 (expired)', () => {
    useRedeemUnsubscribeTokenQueryMock.mockReturnValue({
      data: undefined,
      error: { status: 410, data: 'Token expired' },
      isLoading: false,
      isFetching: false,
      refetch: refetchMock,
    });

    renderAt('/notifications/unsubscribe?token=expired-token');

    expect(screen.getByTestId('unsubscribe-invalid')).toBeInTheDocument();
  });

  it('renders invalid-token alert on HTTP 404 (already-redeemed)', () => {
    useRedeemUnsubscribeTokenQueryMock.mockReturnValue({
      data: undefined,
      error: { status: 404, data: 'Not found' },
      isLoading: false,
      isFetching: false,
      refetch: refetchMock,
    });

    renderAt('/notifications/unsubscribe?token=already-used');

    expect(screen.getByTestId('unsubscribe-invalid')).toBeInTheDocument();
  });

  it('renders server-error alert with retry button on HTTP 5xx', async () => {
    useRedeemUnsubscribeTokenQueryMock.mockReturnValue({
      data: undefined,
      error: { status: 503, data: 'Service unavailable' },
      isLoading: false,
      isFetching: false,
      refetch: refetchMock,
    });

    renderAt('/notifications/unsubscribe?token=any');

    expect(screen.getByTestId('unsubscribe-server-error')).toBeInTheDocument();
    const retryBtn = screen.getByTestId('unsubscribe-retry');
    expect(retryBtn).toBeInTheDocument();

    fireEvent.click(retryBtn);
    await waitFor(() => {
      expect(refetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it('passes token from URL query param to the RTK Query hook', () => {
    useRedeemUnsubscribeTokenQueryMock.mockReturnValue({
      data: { status: 'unsubscribed' },
      error: undefined,
      isLoading: false,
      isFetching: false,
      refetch: refetchMock,
    });

    renderAt('/notifications/unsubscribe?token=specific-hmac-token-value');

    expect(useRedeemUnsubscribeTokenQueryMock).toHaveBeenCalledWith('specific-hmac-token-value', {
      skip: false,
    });
  });

  it('skips the RTK Query call when token is absent (skip=true)', () => {
    useRedeemUnsubscribeTokenQueryMock.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: false,
      isFetching: false,
      refetch: refetchMock,
    });

    renderAt('/notifications/unsubscribe');

    expect(useRedeemUnsubscribeTokenQueryMock).toHaveBeenCalledWith('', { skip: true });
  });
});
