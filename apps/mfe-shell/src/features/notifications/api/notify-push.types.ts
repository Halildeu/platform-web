/**
 * Web Push Protocol RFC 8030 + RFC 8292 VAPID subscription types
 * (Faz 23.7 M7 T4.2 PR-W5).
 *
 * Backend contract: PushSubscriptionController + DTO records.
 */

export interface PushSubscribeArgs {
  orgId: string;
  subscriberId: string;
  endpointUrl: string;
  p256dhKey: string;   // base64url-encoded uncompressed P-256 public key
  authSecret: string;  // base64url-encoded 16-byte auth secret
  userAgent?: string;
}

export interface PushSubscribeResponse {
  endpointId: string;  // UUID
  status: 'created' | 'updated' | 'reactivated';
}

export interface PushEndpointDto {
  endpointId: string;            // UUID
  userAgent: string | null;
  platformHint: string | null;
  createdAt: string;             // ISO-8601
  lastSeenAt: string;            // ISO-8601
}

export interface PushEndpointListResponse {
  endpoints: PushEndpointDto[];
}

export interface PushUnsubscribeArgs {
  orgId: string;
  subscriberId: string;
  endpointId: string;
}

export interface PushUnsubscribeResponse {
  endpoint_id: string;
  status: 'deleted' | 'no_op';
}
