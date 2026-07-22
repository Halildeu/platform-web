/**
 * WEB-017 — Endpoint enrollment entity types.
 *
 * Wire shape mirrors BE
 *   AdminEndpointEnrollmentController.{listEnrollments, createEnrollment}
 * and EndpointEnrollmentDto / CreateEndpointEnrollmentResponse records
 * verbatim — no mapping layer.
 *
 * Codex 019e711f plan-time must-fix #2: list endpoint returns a plain
 * Java List<EndpointEnrollmentDto>, NOT a Spring Page envelope. Frontend
 * types must match.
 */

export type EnrollmentStatus = 'PENDING' | 'CONSUMED' | 'EXPIRED';

export interface EndpointEnrollment {
  id: string;
  tenantId: string;
  status: EnrollmentStatus;
  requestedBySubject: string;
  note: string | null;
  deviceId: string | null;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
}

export interface CreateEndpointEnrollmentArgs {
  /** 1..10080 minutes (1 min to 7 days). */
  expiresInMinutes: number;
  /** Optional, <=512 chars. */
  note?: string;
  /** Existing tenant-visible device for certificate/TPM re-enrollment. */
  deviceId?: string;
}

/**
 * Reveal-once response. Backend returns the raw enrollment token ONLY
 * in this response — subsequent list responses surface the metadata
 * but never the raw value. The UI must surface the token in a single
 * modal session and discard it from state on close (Codex 019e711f
 * iter-1 reveal-once UX contract).
 */
export interface CreateEndpointEnrollmentResponse {
  enrollmentId: string;
  token: string;
  expiresAt: string;
  /** Null for first-time enrollment; exact requested device for re-enrollment. */
  deviceId: string | null;
}
