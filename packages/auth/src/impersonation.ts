/**
 * User Impersonation v1 (PR-C frontend) — typed API client.
 *
 * Backend contract (PR-B merged 2026-05-10):
 *   - POST   /api/v1/impersonation/sessions          — start (SuperAdmin)
 *   - DELETE /api/v1/impersonation/sessions/current  — stop own session
 *   - GET    /api/v1/impersonation/sessions/active   — fetch active
 *   - POST   /api/v1/impersonation/sessions/{id}/revoke — admin force-revoke
 *
 * Token swap UX (frontend):
 *   1. Call startImpersonation → returns exchangedToken
 *   2. Caller swaps token cookie via setTokenCookie(exchangedToken)
 *   3. Reload page (or invalidate React Query cache) so all subsequent
 *      requests carry the broker-issued JWT
 *
 * Stop UX (frontend):
 *   1. Call stopImpersonation (DELETE /current)
 *   2. Caller swaps back to the original admin token via setTokenCookie
 *   3. Reload page
 */

/**
 * Request body for POST /api/v1/impersonation/sessions.
 * targetUserId is the platform user_id (numeric); targetSubject is the
 * Keycloak UUID (sub claim). reason min 10 chars (server enforced).
 */
export interface StartImpersonationRequest {
  targetUserId: number;
  targetSubject: string;
  targetEmail?: string;
  reason: string;
}

/**
 * Response shape from POST /api/v1/impersonation/sessions (HTTP 201).
 * Error path returns 4xx/5xx with errorCode + errorMessage populated.
 */
export interface StartImpersonationResponse {
  sessionId: string | null;
  exchangedToken: string | null;
  expiresAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

/**
 * Active session resource — same shape returned by GET /active and
 * embedded in StartImpersonationResponse via sessionId.
 */
export interface ImpersonationSessionResource {
  sessionId: string;
  impersonatorUserId: number;
  targetUserId: number;
  startedAt: string;
  expiresAt: string;
  status: 'ACTIVE' | 'STOPPED' | 'EXPIRED' | 'REVOKED';
}

export interface RevokeImpersonationRequest {
  reason?: string;
}

/**
 * Backend error codes (matches auth-service StartResponse.errorCode +
 * permission-service controller errorCode fields).
 */
export type ImpersonationErrorCode =
  | 'NESTED_IMPERSONATION_FORBIDDEN'
  | 'ADMIN_IDENTITY_MISSING'
  | 'INSUFFICIENT_AUTHORITY'
  | 'TARGET_SUBJECT_MISMATCH'
  | 'EXCHANGED_TOKEN_NOT_BROKER_ISSUED'
  | 'EXCHANGED_TOKEN_EXPIRED'
  | 'TOKEN_EXCHANGE_FAILED'
  | 'SESSION_PERSIST_FAILED'
  | 'ACTIVE_IMPERSONATION_EXISTS'
  | 'IMPERSONATION_SESSION_REQUIRED'
  | 'STOP_FROM_BROKER_TOKEN_NOT_SUPPORTED';

/**
 * Start an impersonation session.
 *
 * @returns Exchanged token + sessionId on success. If the response is a
 *          wrapped error envelope (sessionId === null + errorCode set),
 *          the caller is expected to surface errorMessage to the user.
 *          For non-2xx HTTP responses (network failure, 5xx), the inner
 *          httpPost will throw — caller catches and renders an error.
 */
export async function startImpersonation(
  httpPost: (
    url: string,
    body: StartImpersonationRequest,
  ) => Promise<{ data: StartImpersonationResponse; status: number }>,
  request: StartImpersonationRequest,
): Promise<StartImpersonationResponse> {
  const { data } = await httpPost('/v1/impersonation/sessions', request);
  return data;
}

/**
 * Stop the current user's active impersonation session
 * (DELETE /api/v1/impersonation/sessions/current).
 *
 * Returns true on 204 (stopped); false on 404 (no active session).
 * Throws on 5xx / network failure.
 */
export async function stopImpersonation(
  httpDelete: (url: string) => Promise<{ status: number }>,
): Promise<boolean> {
  try {
    const { status } = await httpDelete('/v1/impersonation/sessions/current');
    return status === 204 || status === 200;
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 404) {
      return false;
    }
    throw err;
  }
}

/**
 * GET /api/v1/impersonation/sessions/active.
 * Returns the active session for the calling user, or null if none.
 *
 * Backend returns 204 No Content when there's no active session — we
 * normalize to null for convenience.
 */
export async function getActiveImpersonation(
  httpGet: (url: string) => Promise<{ data: ImpersonationSessionResource | null; status: number }>,
): Promise<ImpersonationSessionResource | null> {
  try {
    const { data, status } = await httpGet('/v1/impersonation/sessions/active');
    if (status === 204) return null;
    return data;
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 404 || status === 204) {
      return null;
    }
    throw err;
  }
}

/**
 * Admin force-revoke of an active session
 * (POST /api/v1/impersonation/sessions/{sessionId}/revoke).
 * SuperAdmin authority gate enforced server-side.
 */
export async function revokeImpersonation(
  httpPost: (url: string, body: RevokeImpersonationRequest) => Promise<{ status: number }>,
  sessionId: string,
  reason?: string,
): Promise<boolean> {
  try {
    const { status } = await httpPost(`/v1/impersonation/sessions/${sessionId}/revoke`, { reason });
    return status === 204 || status === 200;
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 404) {
      return false;
    }
    throw err;
  }
}

/**
 * Decode the JWT payload to detect impersonation context (azp claim).
 * Used by ImpersonationBanner to decide whether to render.
 *
 * NOTE: This is purely for UX hint; backend always re-validates the
 * token + DB session via ImpersonationContextFilter (PR-B Step 2e).
 */
export function isImpersonationToken(
  token: string | null | undefined,
  brokerClientId = 'impersonation-broker',
): boolean {
  if (!token) return false;
  const payload = decodeJwtPayload(token);
  return payload?.azp === brokerClientId;
}

/**
 * Codex iter-30 P1/P2 absorb: base64url → base64 normalize + padding
 * before atob. Without padding some valid JWTs surface as decode
 * failures and the UX hint disappears even though the token is
 * legitimately broker-issued. Mirrors the helper in
 * mfe-shell auth.slice.ts (kept inline here so @mfe/auth has zero
 * dependency on apps/*).
 */
export function decodeJwtPayload(
  token: string,
): { azp?: string; sub?: string; email?: string; exp?: number; [k: string]: unknown } | null {
  try {
    const segments = token.split('.');
    if (segments.length < 2) return null;
    const normalized = segments[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4 || 4)) % 4),
      '=',
    );
    const globalScope = (typeof window !== 'undefined' ? window : (globalThis as unknown)) as {
      atob?: (s: string) => string;
      Buffer?: { from: (s: string, e: string) => { toString: (e: string) => string } };
    };
    let decoded: string | null = null;
    if (globalScope?.atob) {
      decoded = globalScope.atob(padded);
    } else if (globalScope?.Buffer) {
      decoded = globalScope.Buffer.from(padded, 'base64').toString('utf-8');
    }
    if (!decoded) return null;
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}
