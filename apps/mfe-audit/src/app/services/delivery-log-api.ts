import { resolveHttpClient } from './audit-api';
import type { DeliveryLogListResponse, DeliveryLogStatus } from '../types/delivery-log';

/**
 * REST client for the Faz 23.5 PR6 delivery-log endpoints.
 *
 * Codex thread `019e0289` iter-2 AGREE absorb:
 *  - No mock fallback. 401/403/400/5xx errors propagate as
 *    {@link DeliveryLogApiError} so the tab can render an inline,
 *    Türkçe, status-aware message.
 *  - Empty filter values are omitted from the query string so React Query
 *    cache keys stay stable and the backend's 24h default applies.
 *  - {@code X-Org-Id} is always sent — it is the selector the backend
 *    reconciles against the JWT. The caller is responsible for resolving
 *    it via {@link resolveDeliveryLogOrgId}.
 */

export class DeliveryLogApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
    this.name = 'DeliveryLogApiError';
  }
}

export interface FetchIntentDeliveriesParams {
  intentId: string;
  orgId: string;
  page: number;
  size: number;
  signal?: AbortSignal;
}

export interface FetchAdminDeliveriesParams {
  orgId: string;
  status?: DeliveryLogStatus;
  channel?: string;
  provider?: string;
  from?: string;
  to?: string;
  page: number;
  size: number;
  signal?: AbortSignal;
}

const ORG_HEADER = 'X-Org-Id';

export async function fetchIntentDeliveries(
  params: FetchIntentDeliveriesParams,
): Promise<DeliveryLogListResponse> {
  const query = new URLSearchParams();
  query.set('page', String(params.page));
  query.set('size', String(params.size));

  const path = `/api/v1/notify/intents/${encodeURIComponent(
    params.intentId,
  )}/deliveries?${query.toString()}`;
  return getDeliveryLog(path, params.orgId, params.signal);
}

export async function fetchAdminDeliveries(
  params: FetchAdminDeliveriesParams,
): Promise<DeliveryLogListResponse> {
  const query = new URLSearchParams();
  query.set('page', String(params.page));
  query.set('size', String(params.size));
  if (params.status) query.set('status', params.status);
  if (params.channel && params.channel.trim()) query.set('channel', params.channel.trim());
  if (params.provider && params.provider.trim()) query.set('provider', params.provider.trim());
  if (params.from && params.from.trim()) query.set('from', params.from);
  if (params.to && params.to.trim()) query.set('to', params.to);

  const path = `/api/v1/admin/notify/deliveries?${query.toString()}`;
  return getDeliveryLog(path, params.orgId, params.signal);
}

async function getDeliveryLog(
  path: string,
  orgId: string,
  signal?: AbortSignal,
): Promise<DeliveryLogListResponse> {
  if (!orgId || !orgId.trim()) {
    throw new DeliveryLogApiError(0, 'orgId is required');
  }
  const client = resolveHttpClient();
  try {
    const response = await client.get<DeliveryLogListResponse>(path, {
      headers: { [ORG_HEADER]: orgId },
      signal,
    });
    return response.data;
  } catch (error) {
    throw toDeliveryLogApiError(error);
  }
}

function toDeliveryLogApiError(error: unknown): DeliveryLogApiError {
  if (error instanceof DeliveryLogApiError) return error;

  // shared-http surfaces axios-shape errors with response.status / data.
  if (isAxiosLikeError(error)) {
    const status = error.response?.status ?? 0;
    const body = error.response?.data;
    const message = extractMessage(body) ?? defaultMessageFor(status);
    return new DeliveryLogApiError(status, message, body);
  }

  if (error instanceof Error) {
    return new DeliveryLogApiError(0, error.message);
  }
  return new DeliveryLogApiError(0, 'unknown error');
}

function isAxiosLikeError(error: unknown): error is {
  response?: { status?: number; data?: unknown };
} {
  return typeof error === 'object' && error !== null && 'response' in error;
}

function extractMessage(body: unknown): string | null {
  if (typeof body === 'object' && body !== null) {
    const record = body as Record<string, unknown>;
    if (typeof record.message === 'string' && record.message.length > 0) {
      return record.message;
    }
    if (typeof record.error === 'string' && record.error.length > 0) {
      return record.error;
    }
  }
  return null;
}

function defaultMessageFor(status: number): string {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 400) return 'validation';
  if (status === 404) return 'not_found';
  if (status >= 500) return 'server_error';
  return 'request_failed';
}
