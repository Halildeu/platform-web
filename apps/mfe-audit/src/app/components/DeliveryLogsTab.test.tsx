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

import { DeliveryLogsTab, toIsoOrUndefined } from './DeliveryLogsTab';
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
    // Faz 23.4 M6b — failure category is now rendered as a localized
    // Turkish label via FailureCategoryLabel; the raw enum value moves
    // to data-testid for assertion stability across copy edits.
    expect(screen.getByTestId('delivery-failure-category-RECIPIENT_REJECTED')).toBeTruthy();
    expect(screen.getByText('Alıcı reddetti')).toBeTruthy();
  });

  // Faz 23.4 M6b — DLR visualization specs
  describe('DLR visualization (M6b)', () => {
    it('renders status as a localized pill with icon and aria-label', async () => {
      fetchAdminDeliveriesMock.mockResolvedValueOnce(deliveryLogListFixture);

      renderWithQueryClient(<DeliveryLogsTab />);

      await waitFor(() => {
        expect(screen.getByTestId('delivery-logs-table')).toBeTruthy();
      });

      // First fixture row status is FAILED (see deliveryLogListFixture).
      const pill = screen.getByTestId('delivery-status-pill-FAILED');
      expect(pill).toBeTruthy();
      expect(pill.getAttribute('aria-label')).toContain('Başarısız');
      expect(pill.textContent).toContain('Başarısız');
    });

    it('renders quick-filter chip row and toggles channel filter on click', async () => {
      fetchAdminDeliveriesMock.mockResolvedValue(deliveryLogEmptyFixture);

      renderWithQueryClient(<DeliveryLogsTab />);

      await waitFor(() => expect(fetchAdminDeliveriesMock).toHaveBeenCalledTimes(1));

      const smsChip = screen.getByTestId('delivery-logs-quick-filter-sms');
      expect(smsChip.getAttribute('aria-pressed')).toBe('false');

      fireEvent.click(smsChip);

      await waitFor(() => expect(fetchAdminDeliveriesMock).toHaveBeenCalledTimes(2));
      const second = fetchAdminDeliveriesMock.mock.calls[1][0];
      expect(second.channel).toBe('sms');
      expect(
        screen.getByTestId('delivery-logs-quick-filter-sms').getAttribute('aria-pressed'),
      ).toBe('true');
    });

    it('clears channel filter when the active quick-filter chip is clicked again', async () => {
      fetchAdminDeliveriesMock.mockResolvedValue(deliveryLogEmptyFixture);

      renderWithQueryClient(<DeliveryLogsTab />);

      await waitFor(() => expect(fetchAdminDeliveriesMock).toHaveBeenCalledTimes(1));

      const smsChip = screen.getByTestId('delivery-logs-quick-filter-sms');
      fireEvent.click(smsChip);
      await waitFor(() => expect(fetchAdminDeliveriesMock).toHaveBeenCalledTimes(2));

      fireEvent.click(smsChip);
      await waitFor(() => expect(fetchAdminDeliveriesMock).toHaveBeenCalledTimes(3));
      const third = fetchAdminDeliveriesMock.mock.calls[2][0];
      expect(third.channel).toBeUndefined();
    });
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

describe('DeliveryLogsTab — date filters', () => {
  it('normalises datetime-local "from" input to ISO-UTC before sending', async () => {
    fetchAdminDeliveriesMock.mockResolvedValue(deliveryLogEmptyFixture);

    renderWithQueryClient(<DeliveryLogsTab />);
    await waitFor(() => expect(fetchAdminDeliveriesMock).toHaveBeenCalled());

    fireEvent.change(screen.getByTestId('delivery-logs-from-input'), {
      target: { value: '2026-05-07T12:00' },
    });

    await waitFor(() => expect(fetchAdminDeliveriesMock).toHaveBeenCalledTimes(2));
    const args = fetchAdminDeliveriesMock.mock.calls[1][0];
    // The datetime-local string is parsed as local time; the request must
    // carry a Z-suffixed UTC ISO so backend OffsetDateTime accepts it.
    expect(args.from).toMatch(/Z$/);
    expect(args.from).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

describe('toIsoOrUndefined helper', () => {
  it('returns undefined for empty / blank inputs', () => {
    expect(toIsoOrUndefined('')).toBeUndefined();
    expect(toIsoOrUndefined('   ')).toBeUndefined();
    expect(toIsoOrUndefined(null)).toBeUndefined();
    expect(toIsoOrUndefined(undefined)).toBeUndefined();
  });

  it('returns undefined for unparseable values', () => {
    expect(toIsoOrUndefined('not-a-date')).toBeUndefined();
  });

  it('preserves existing ISO strings round-tripped through Date', () => {
    const result = toIsoOrUndefined('2026-05-07T12:00:00.000Z');
    expect(result).toBe('2026-05-07T12:00:00.000Z');
  });

  it('appends Z to a datetime-local style input', () => {
    const result = toIsoOrUndefined('2026-05-07T12:00');
    expect(result).toMatch(/Z$/);
  });
});

describe('DeliveryLogsTab — pagination', () => {
  it('disables prev on the first page and enables next when more pages exist', async () => {
    fetchAdminDeliveriesMock.mockResolvedValueOnce({
      ...deliveryLogListFixture,
      page: 0,
      total_pages: 3,
      total_elements: 60,
    });

    renderWithQueryClient(<DeliveryLogsTab />);
    await waitFor(() => expect(screen.getByTestId('delivery-logs-prev')).toBeTruthy());

    expect((screen.getByTestId('delivery-logs-prev') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('delivery-logs-next') as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByTestId('delivery-logs-page-indicator').textContent).toContain('1 / 3');
  });

  it('disables next on the last page', async () => {
    fetchAdminDeliveriesMock.mockResolvedValueOnce({
      ...deliveryLogListFixture,
      page: 2,
      total_pages: 3,
      total_elements: 60,
    });

    renderWithQueryClient(<DeliveryLogsTab />);
    await waitFor(() => expect(screen.getByTestId('delivery-logs-next')).toBeTruthy());

    expect((screen.getByTestId('delivery-logs-next') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('DeliveryLogsTab — error mapping', () => {
  it.each([
    [401, 'Oturum doğrulanamadı. Yeniden giriş yapın.'],
    [403, 'Bu organizasyon için teslimat loglarını görüntüleme yetkiniz yok.'],
    [404, 'Belirtilen niyet (intent) bu organizasyonda bulunamadı.'],
    [500, 'Teslimat logları alınamadı. Lütfen tekrar deneyin.'],
  ])('renders the right Türkçe message for status %i', async (status, message) => {
    fetchAdminDeliveriesMock.mockRejectedValueOnce(new DeliveryLogApiError(status, 'x'));

    renderWithQueryClient(<DeliveryLogsTab />);
    await waitFor(() => expect(screen.getByTestId('delivery-logs-error')).toBeTruthy());
    expect(screen.getByText(message)).toBeTruthy();
  });

  it('uses backend message for 400 when present', async () => {
    fetchAdminDeliveriesMock.mockRejectedValueOnce(
      new DeliveryLogApiError(400, 'size must be <= 100'),
    );

    renderWithQueryClient(<DeliveryLogsTab />);
    await waitFor(() => expect(screen.getByTestId('delivery-logs-error')).toBeTruthy());
    expect(screen.getByText(/size must be <= 100/)).toBeTruthy();
  });
});

describe('DeliveryLogsTab — redaction policy badge', () => {
  it('shows the v1 redaction policy in the header', async () => {
    fetchAdminDeliveriesMock.mockResolvedValueOnce(deliveryLogListFixture);

    renderWithQueryClient(<DeliveryLogsTab />);
    await waitFor(() => expect(screen.getByTestId('delivery-logs-table')).toBeTruthy());

    expect(screen.getByText(/Redaction: v1/)).toBeTruthy();
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
