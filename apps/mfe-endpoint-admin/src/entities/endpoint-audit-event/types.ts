/**
 * Backend DTO mirror — `EndpointAuditEventDto` (record).
 *
 * Source-of-truth (e9cb8dd0):
 *   platform-backend / endpoint-admin-service /
 *     src/main/java/com/example/endpointadmin/dto/v1/admin/EndpointAuditEventDto.java
 *
 * `Instant` fields serialize as ISO-8601 strings; `Map<String, Object>`
 * fields arrive as plain JSON objects.
 */
export interface EndpointAuditEvent {
  id: string;
  tenantId: string;
  deviceId: string | null;
  commandId: string | null;
  eventType: string;
  action: string;
  performedBySubject: string | null;
  correlationId: string | null;
  metadata: Record<string, unknown> | null;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  /** ISO-8601 timestamp from `Instant`. */
  occurredAt: string;
}

/**
 * Backend `AdminEndpointAuditController.listAuditEvents` query
 * parameters — every field optional, `limit` defaults to 50 server-side.
 */
export interface ListAuditEventsArgs {
  deviceId?: string;
  commandId?: string;
  eventType?: string;
  limit?: number;
}
