/**
 * Wire types for the Faz 23.5 PR6 delivery-log endpoints (snake_case from
 * the backend; we render directly from these without a camelCase mapping
 * layer to keep the contract obvious).
 *
 * Backend reference: notification-orchestrator
 * `com.serban.notify.api.dto.DeliveryLogResponse` /
 * `DeliveryLogListResponse`.
 */

export type DeliveryLogStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'DELIVERED'
  | 'FAILED'
  | 'BOUNCED'
  | 'RETRY'
  | 'BLOCKED_BY_PREFERENCE'
  | 'BLOCKED_BY_AUTHZ'
  | 'BLOCKED_BY_IDEMPOTENCY'
  | 'BLOCKED_EXTERNAL_NOT_ALLOWED';

export type DeliveryRecipientType = 'SUBSCRIBER' | 'EXTERNAL' | 'CHANNEL';

export type DeliveryFailureCategory =
  | 'PROVIDER_QUOTA'
  | 'RECIPIENT_REJECTED'
  | 'RECIPIENT_BLOCKED'
  | 'INVALID_TARGET'
  | 'TRANSIENT_NETWORK'
  | 'AUTH_FAILURE'
  | 'UNKNOWN';

export interface DeliveryLogResponse {
  delivery_id: number;
  intent_id: string;
  topic_key: string | null;
  correlation_id: string | null;
  channel: string;
  provider: string;
  provider_msg_id_masked: string | null;
  recipient_type: DeliveryRecipientType;
  recipient_hash: string;
  status: DeliveryLogStatus;
  attempt_count: number;
  failure_category: DeliveryFailureCategory;
  failure_summary_redacted: string;
  last_attempt_at: string | null;
  delivered_at: string | null;
  permanent_failure_at: string | null;
  next_retry_at: string | null;
  created_at: string;
  updated_at: string;
  activity_at: string;
}

export interface DeliveryLogListResponse {
  items: DeliveryLogResponse[];
  page: number;
  size: number;
  total_elements: number;
  total_pages: number;
  from: string | null;
  to: string | null;
  redaction_policy: string;
}
