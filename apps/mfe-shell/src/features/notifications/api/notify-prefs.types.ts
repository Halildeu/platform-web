/**
 * Backend wire types for the notification-orchestrator preference REST
 * API (Faz 23.5 PR3 frontend UI).
 *
 * Mirrors the Spring DTOs verbatim:
 * - {@code PreferenceResponse} → {@link PreferenceDto}
 * - {@code PreferenceUpsertRequest} → {@link PreferenceUpsertBody}
 *
 * The backend record excludes {@code orgId} and {@code subscriberId}
 * from the response (caller already knows them from the JWT/header
 * context); same shape rationale as the inbox surface.
 *
 * Wildcard semantics: {@code topicKey} and {@code channel} are nullable.
 * {@code null} on either field means "all topics" / "all channels".
 * UI should render those rows as wildcard chips/pills rather than blank.
 */

/** Single preference row as returned by GET / PUT endpoints. */
export interface PreferenceDto {
  /** Numeric primary key — used by DELETE /me/{id}. */
  id: number;
  /** Topic key (e.g. "auth.password-reset") or null for "all topics". */
  topicKey: string | null;
  /** Channel (e.g. "email", "sms") or null for "all channels". */
  channel: string | null;
  /** Whether delivery is enabled for this (topic, channel) tuple. */
  enabled: boolean;
  /**
   * Optional JSON object describing time windows during which delivery
   * is suppressed. Shape is opaque to the API; the eligibility service
   * consumes it.
   */
  quietHours: Record<string, unknown> | null;
  /** Optional cap "no more than N notifications/day". null = unlimited. */
  frequencyLimitPerDay: number | null;
  /** When true, severity=critical bypasses the disabled flag. */
  bypassForCritical: boolean;
  /** ISO-8601 timestamp the row was inserted. */
  createdAt: string;
  /** ISO-8601 timestamp of the last state mutation. */
  updatedAt: string;
}

/**
 * PUT /api/v1/notify/preferences/me request body.
 *
 * {@code enabled} is required (backend @NotNull); a missing field
 * surfaces as a 400 instead of a silent unintended mute.
 * {@code bypassForCritical} is optional: null on update inherits the
 * existing value, null on insert defaults to true.
 */
export interface PreferenceUpsertBody {
  topicKey?: string | null;
  channel?: string | null;
  enabled: boolean;
  quietHours?: Record<string, unknown> | null;
  frequencyLimitPerDay?: number | null;
  bypassForCritical?: boolean | null;
}

/** Common identity headers required by every "me" endpoint. */
export interface PreferenceRequestIdentity {
  orgId: string;
  subscriberId: string;
}

/** Args for the upsert mutation — identity + body fields. */
export interface PreferenceUpsertArgs extends PreferenceRequestIdentity, PreferenceUpsertBody {}

/** Args for the delete mutation — identity + path id. */
export interface PreferenceDeleteArgs extends PreferenceRequestIdentity {
  id: number;
}
