// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

let userMock: unknown = { org_id: 'tenant-a' };

vi.mock('../services/shell-services', () => ({
  getShellServices: vi.fn(() => ({
    auth: {
      getUser: () => userMock,
      getToken: () => null,
    },
    http: { get: vi.fn(), post: vi.fn() },
    notify: { push: vi.fn() },
    telemetry: { emit: vi.fn() },
  })),
}));

const fetchIntentDeliveriesMock = vi.fn();
const fetchAdminDeliveriesMock = vi.fn();

vi.mock('../services/delivery-log-api', async () => {
  const actual = await vi.importActual<typeof import('../services/delivery-log-api')>(
    '../services/delivery-log-api',
  );
  return {
    ...actual,
    fetchIntentDeliveries: (args: unknown) => fetchIntentDeliveriesMock(args),
    fetchAdminDeliveries: (args: unknown) => fetchAdminDeliveriesMock(args),
  };
});

import { DeliveryLogsTab } from './DeliveryLogsTab';
import { DeliveryLogApiError } from '../services/delivery-log-api';
import {
  deliveryLogEmptyFixture,
  deliveryLogListFixture,
} from '../__fixtures__/delivery-log.fixture';

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  fetchIntentDeliveriesMock.mockReset();
  fetchAdminDeliveriesMock.mockReset();
  userMock = { org_id: 'tenant-a' };
  // Reset URL.
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  cleanup();
});

describe('DeliveryLogsTab — admin mode (default)', () => {
  it('renders rows from the admin endpoint', async () => {
    fetchAdminDeliveriesMock.mockResolvedValueOnce(deliveryLogListFixture);

    renderWithQueryClient(<DeliveryLogsTab />);

    await waitFor(() => {
      expect(screen.getByTestId('delivery-logs-table')).toBeTruthy();
    });

    expect(screen.getByText('intent-123')).toBeTruthy();
    expect(screen.getByText('netgsm-***1234')).toBeTruthy();
    expect(screen.getByText('RECIPIENT_REJECTED')).toBeTruthy();
  });

  it('passes orgId and page/size to the admin endpoint', async () => {
    fetchAdminDeliveriesMock.mockResolvedValueOnce(deliveryLogEmptyFixture);

    renderWithQueryClient(<DeliveryLogsTab />);

    await waitFor(() => {
      expect(fetchAdminDeliveriesMock).toHaveBeenCalledTimes(1);
    });

    const args = fetchAdminDeliveriesMock.mock.calls[0][0];
    expect(args.orgId).toBe('tenant-a');
    expect(args.page).toBe(0);
    expect(args.size).toBe(20);
  });

  it('does not include empty filter values when calling the admin endpoint', async () => {
    fetchAdminDeliveriesMock.mockResolvedValueOnce(deliveryLogEmptyFixture);

    renderWithQueryClient(<DeliveryLogsTab />);

    await waitFor(() => {
      expect(fetchAdminDeliveriesMock).toHaveBeenCalled();
    });
    const args = fetchAdminDeliveriesMock.mock.calls[0][0];
    expect(args.status).toBeUndefined();
    expect(args.channel).toBeUndefined();
    expect(args.provider).toBeUndefined();
    expect(args.from).toBeUndefined();
    expect(args.to).toBeUndefined();
  });

  it('refetches when the operator changes a filter', async () => {
    fetchAdminDeliveriesMock.mockResolvedValue(deliveryLogEmptyFixture);

    renderWithQueryClient(<DeliveryLogsTab />);

    await waitFor(() => expect(fetchAdminDeliveriesMock).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByTestId('delivery-logs-status-select'), {
      target: { value: 'FAILED' },
    });

    await waitFor(() => expect(fetchAdminDeliveriesMock).toHaveBeenCalledTimes(2));
    const second = fetchAdminDeliveriesMock.mock.calls[1][0];
    expect(second.status).toBe('FAILED');
  });

  it('renders inline error banner on 403', async () => {
    fetchAdminDeliveriesMock.mockRejectedValueOnce(new DeliveryLogApiError(403, 'forbidden'));

    renderWithQueryClient(<DeliveryLogsTab />);

    await waitFor(() => {
      expect(screen.getByTestId('delivery-logs-error')).toBeTruthy();
    });
    expect(
      screen.getByText('Bu organizasyon için teslimat loglarını görüntüleme yetkiniz yok.'),
    ).toBeTruthy();
  });

  it('renders empty-state copy when the response has no rows', async () => {
    fetchAdminDeliveriesMock.mockResolvedValueOnce(deliveryLogEmptyFixture);

    renderWithQueryClient(<DeliveryLogsTab />);

    await waitFor(() => {
      expect(screen.getByTestId('delivery-logs-empty')).toBeTruthy();
    });
  });
});

describe('DeliveryLogsTab — intent mode', () => {
  it('starts in intent mode when ?intentId= is present in the URL', async () => {
    window.history.replaceState({}, '', '/?intentId=intent-from-url');
    fetchIntentDeliveriesMock.mockResolvedValueOnce(deliveryLogListFixture);

    renderWithQueryClient(<DeliveryLogsTab />);

    await waitFor(() => {
      expect(fetchIntentDeliveriesMock).toHaveBeenCalledTimes(1);
    });
    const args = fetchIntentDeliveriesMock.mock.calls[0][0];
    expect(args.intentId).toBe('intent-from-url');
    expect(args.orgId).toBe('tenant-a');
  });

  it('does not fetch when intentId input is empty', async () => {
    renderWithQueryClient(<DeliveryLogsTab />);
    fireEvent.click(screen.getByText('Intent Teslimatları'));
    expect(fetchIntentDeliveriesMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('delivery-logs-intent-required')).toBeTruthy();
  });

  it('fetches when the operator types an intent id', async () => {
    fetchIntentDeliveriesMock.mockResolvedValue(deliveryLogEmptyFixture);

    renderWithQueryClient(<DeliveryLogsTab />);
    fireEvent.click(screen.getByText('Intent Teslimatları'));
    fireEvent.change(screen.getByTestId('delivery-logs-intent-input'), {
      target: { value: 'intent-x' },
    });

    await waitFor(() => {
      expect(fetchIntentDeliveriesMock).toHaveBeenCalledTimes(1);
    });
    expect(fetchIntentDeliveriesMock.mock.calls[0][0].intentId).toBe('intent-x');
  });
});

describe('DeliveryLogsTab — org resolution', () => {
  it('shows the org-error banner when the user has multiple allowed orgs', () => {
    userMock = { allowed_orgs: ['tenant-a', 'tenant-b'] };

    renderWithQueryClient(<DeliveryLogsTab />);
    expect(screen.getByTestId('delivery-logs-org-error')).toBeTruthy();
    expect(fetchAdminDeliveriesMock).not.toHaveBeenCalled();
    expect(fetchIntentDeliveriesMock).not.toHaveBeenCalled();
  });

  it('falls back to "default" when shell services are not configured', async () => {
    fetchAdminDeliveriesMock.mockResolvedValueOnce(deliveryLogEmptyFixture);
    userMock = null;

    renderWithQueryClient(<DeliveryLogsTab />);
    await waitFor(() => expect(fetchAdminDeliveriesMock).toHaveBeenCalledTimes(1));
    expect(fetchAdminDeliveriesMock.mock.calls[0][0].orgId).toBe('default');
  });
});
