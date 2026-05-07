import type { DeliveryLogListResponse } from '../types/delivery-log';

/**
 * Canonical wire-shape fixtures for delivery-log tests (Faz 23.5 PR6).
 *
 * Backend reference:
 *   notification-orchestrator
 *     `com.serban.notify.api.dto.DeliveryLogResponse` /
 *     `DeliveryLogListResponse`.
 *
 * Snake_case is intentional — the FE renders these directly without a
 * camelCase mapping layer, so tests pin the contract verbatim.
 */

export const deliveryLogListFixture = {
  items: [
    {
      delivery_id: 101,
      intent_id: 'intent-123',
      topic_key: 'billing.invoice.created',
      correlation_id: 'corr-456',
      channel: 'sms',
      provider: 'netgsm',
      provider_msg_id_masked: 'netgsm-***1234',
      recipient_type: 'SUBSCRIBER',
      recipient_hash: 'hash_abcdef123456',
      status: 'FAILED',
      attempt_count: 3,
      failure_category: 'RECIPIENT_REJECTED',
      failure_summary_redacted: 'provider.failure.recipient_rejected',
      last_attempt_at: '2026-05-07T09:00:00Z',
      delivered_at: null,
      permanent_failure_at: '2026-05-07T09:01:00Z',
      next_retry_at: null,
      created_at: '2026-05-07T08:55:00Z',
      updated_at: '2026-05-07T09:01:00Z',
      activity_at: '2026-05-07T09:01:00Z',
    },
    {
      delivery_id: 102,
      intent_id: 'intent-456',
      topic_key: 'auth.password-reset',
      correlation_id: null,
      channel: 'email',
      provider: 'smtp',
      provider_msg_id_masked: 'sm***0507',
      recipient_type: 'EXTERNAL',
      recipient_hash: 'hash_fedcba654321',
      status: 'DELIVERED',
      attempt_count: 1,
      failure_category: 'UNKNOWN',
      failure_summary_redacted: 'PROVIDER_FAILURE_REDACTED',
      last_attempt_at: '2026-05-07T08:30:00Z',
      delivered_at: '2026-05-07T08:30:30Z',
      permanent_failure_at: null,
      next_retry_at: null,
      created_at: '2026-05-07T08:29:00Z',
      updated_at: '2026-05-07T08:30:30Z',
      activity_at: '2026-05-07T08:30:30Z',
    },
  ],
  page: 0,
  size: 20,
  total_elements: 2,
  total_pages: 1,
  from: '2026-05-06T09:01:00Z',
  to: '2026-05-07T09:01:00Z',
  redaction_policy: 'v1',
} satisfies DeliveryLogListResponse;

export const deliveryLogEmptyFixture = {
  items: [],
  page: 0,
  size: 20,
  total_elements: 0,
  total_pages: 0,
  from: '2026-05-06T09:01:00Z',
  to: '2026-05-07T09:01:00Z',
  redaction_policy: 'v1',
} satisfies DeliveryLogListResponse;
