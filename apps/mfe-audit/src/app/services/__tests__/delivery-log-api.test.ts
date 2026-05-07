// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@mfe/shared-http', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('../shell-services', () => ({
  getShellServices: vi.fn(() => {
    throw new Error('not configured');
  }),
}));

import { api } from '@mfe/shared-http';
import {
  DeliveryLogApiError,
  fetchAdminDeliveries,
  fetchIntentDeliveries,
} from '../delivery-log-api';
import { deliveryLogListFixture } from '../../__fixtures__/delivery-log.fixture';

const mockApi = api as import('vitest').Mocked<typeof api>;

beforeEach(() => {
  mockApi.get.mockReset();
});

describe('fetchIntentDeliveries', () => {
  it('GETs the intent endpoint with X-Org-Id header and pagination params', async () => {
    mockApi.get.mockResolvedValueOnce({ data: deliveryLogListFixture } as any);

    const result = await fetchIntentDeliveries({
      intentId: 'intent-uuid-123',
      orgId: 'tenant-a',
      page: 0,
      size: 20,
    });

    expect(result).toEqual(deliveryLogListFixture);
    expect(mockApi.get).toHaveBeenCalledTimes(1);
    const [path, options] = mockApi.get.mock.calls[0];
    expect(path).toBe('/api/v1/notify/intents/intent-uuid-123/deliveries?page=0&size=20');
    expect(options?.headers).toEqual({ 'X-Org-Id': 'tenant-a' });
  });

  it('forwards the AbortSignal to the http client', async () => {
    mockApi.get.mockResolvedValueOnce({ data: deliveryLogListFixture } as any);
    const controller = new AbortController();

    await fetchIntentDeliveries({
      intentId: 'i-1',
      orgId: 'tenant-a',
      page: 0,
      size: 20,
      signal: controller.signal,
    });

    expect(mockApi.get.mock.calls[0][1]?.signal).toBe(controller.signal);
  });

  it('throws DeliveryLogApiError when orgId is blank', async () => {
    await expect(
      fetchIntentDeliveries({ intentId: 'i', orgId: '', page: 0, size: 20 }),
    ).rejects.toBeInstanceOf(DeliveryLogApiError);
    expect(mockApi.get).not.toHaveBeenCalled();
  });
});

describe('fetchAdminDeliveries', () => {
  it('omits empty filters from the query string', async () => {
    mockApi.get.mockResolvedValueOnce({ data: deliveryLogListFixture } as any);

    await fetchAdminDeliveries({
      orgId: 'tenant-a',
      page: 0,
      size: 20,
      channel: '',
      provider: '   ',
    });

    const path = mockApi.get.mock.calls[0][0] as string;
    expect(path).toContain('page=0');
    expect(path).toContain('size=20');
    expect(path).not.toContain('channel=');
    expect(path).not.toContain('provider=');
    expect(path).not.toContain('status=');
    expect(path).not.toContain('from=');
    expect(path).not.toContain('to=');
  });

  it('includes populated filters', async () => {
    mockApi.get.mockResolvedValueOnce({ data: deliveryLogListFixture } as any);

    await fetchAdminDeliveries({
      orgId: 'tenant-a',
      status: 'FAILED',
      channel: 'sms',
      provider: 'netgsm',
      from: '2026-05-07T00:00:00Z',
      to: '2026-05-07T12:00:00Z',
      page: 1,
      size: 50,
    });

    const path = mockApi.get.mock.calls[0][0] as string;
    expect(path).toContain('status=FAILED');
    expect(path).toContain('channel=sms');
    expect(path).toContain('provider=netgsm');
    expect(path).toContain('from=');
    expect(path).toContain('to=');
    expect(path).toContain('page=1');
    expect(path).toContain('size=50');
  });

  it('sends X-Org-Id header on every admin call', async () => {
    mockApi.get.mockResolvedValueOnce({ data: deliveryLogListFixture } as any);

    await fetchAdminDeliveries({ orgId: 'tenant-z', page: 0, size: 20 });

    expect(mockApi.get.mock.calls[0][1]?.headers).toEqual({ 'X-Org-Id': 'tenant-z' });
  });
});

describe('error propagation', () => {
  it('maps a 401 response to DeliveryLogApiError(401)', async () => {
    mockApi.get.mockRejectedValueOnce({
      response: { status: 401, data: { error: 'unauthorized' } },
    });

    await expect(
      fetchAdminDeliveries({ orgId: 'tenant-a', page: 0, size: 20 }),
    ).rejects.toMatchObject({
      status: 401,
    });
  });

  it('maps a 403 response to DeliveryLogApiError(403)', async () => {
    mockApi.get.mockRejectedValueOnce({
      response: { status: 403, data: { error: 'forbidden' } },
    });

    const promise = fetchAdminDeliveries({ orgId: 'tenant-a', page: 0, size: 20 });
    await expect(promise).rejects.toBeInstanceOf(DeliveryLogApiError);
    await expect(promise).rejects.toMatchObject({ status: 403 });
  });

  it('maps a 400 with backend message', async () => {
    mockApi.get.mockRejectedValueOnce({
      response: { status: 400, data: { error: 'validation', message: 'size must be <= 100' } },
    });

    const promise = fetchAdminDeliveries({ orgId: 'tenant-a', page: 0, size: 200 });
    await expect(promise).rejects.toMatchObject({ status: 400, message: 'size must be <= 100' });
  });

  it('does not silently fall back to mock data on any error', async () => {
    mockApi.get.mockRejectedValueOnce({
      response: { status: 500, data: null },
    });

    await expect(
      fetchIntentDeliveries({ intentId: 'i', orgId: 'tenant-a', page: 0, size: 20 }),
    ).rejects.toBeInstanceOf(DeliveryLogApiError);
  });
});
