/**
 * localStorage state machine for User Impersonation v1 (Codex iter-30
 * P0 absorb groundwork — PR-C scaffolding).
 *
 * SCOPE NOTE: this module ships in PR-C as scaffolding. The Stop path
 * inside ImpersonationBanner is the only current consumer. PR-C2 will
 * add AuthBootstrapper as a second consumer (skip Keycloak re-init when
 * IMPERSONATION_MODE_KEY === 'active').
 *
 * The naive "swap cookie + reload" path is broken in production: after
 * reload, AuthBootstrapper re-runs Keycloak init and re-writes the
 * cookie back to the original admin token. The broker token is lost.
 * AuthBootstrapper must instead detect impersonation mode and skip
 * the KC re-init (PR-C2).
 *
 * The keys here are intended for both ImpersonationBanner (Stop
 * continuation) and AuthBootstrapper (impersonation mode detection,
 * PR-C2); colocating the names in one module avoids drift.
 *
 * Stop UX contract (audit-safe):
 *   1. Read IMPERSONATION_ORIGINAL_TOKEN_KEY (saved at Start)
 *   2. POST /api/v1/impersonation/sessions/<id>/revoke with the
 *      ORIGINAL admin token in Authorization header (broker token
 *      would be rejected by backend per Codex iter-29's
 *      STOP_FROM_BROKER_TOKEN_NOT_SUPPORTED contract)
 *   3. Backend writes IMPERSONATION_REVOKED audit row with operator
 *      identity = the starting admin (PR-B Codex iter-29 P1-6 contract:
 *      writeRevokedByOperator)
 *   4. Frontend exits impersonation: clear keys, restore admin token,
 *      reload home
 */

export const IMPERSONATION_ORIGINAL_TOKEN_KEY = 'impersonation.original_token';
export const IMPERSONATION_SESSION_ID_KEY = 'impersonation.session_id';
export const IMPERSONATION_MODE_KEY = 'impersonation.mode';
export const IMPERSONATION_STARTED_AT_KEY = 'impersonation.started_at';

/**
 * Persist the original admin token + session id at Start so the Stop
 * continuation can call backend with the proper audit-actor identity.
 */
export function enterImpersonationMode(input: {
  originalAdminToken: string;
  sessionId: string;
}): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(IMPERSONATION_ORIGINAL_TOKEN_KEY, input.originalAdminToken);
    window.localStorage.setItem(IMPERSONATION_SESSION_ID_KEY, input.sessionId);
    window.localStorage.setItem(IMPERSONATION_MODE_KEY, 'active');
    window.localStorage.setItem(IMPERSONATION_STARTED_AT_KEY, String(Date.now()));
  } catch {
    // Best effort.
  }
}

/**
 * Clear all impersonation state machine keys. Called by Stop after the
 * backend audit-stop succeeds (or on logout).
 */
export function exitImpersonationMode(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(IMPERSONATION_ORIGINAL_TOKEN_KEY);
    window.localStorage.removeItem(IMPERSONATION_SESSION_ID_KEY);
    window.localStorage.removeItem(IMPERSONATION_MODE_KEY);
    window.localStorage.removeItem(IMPERSONATION_STARTED_AT_KEY);
  } catch {
    // Best effort.
  }
}

export function readImpersonationOriginalToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(IMPERSONATION_ORIGINAL_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function readImpersonationSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(IMPERSONATION_SESSION_ID_KEY);
  } catch {
    return null;
  }
}

export function isImpersonationModeActive(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(IMPERSONATION_MODE_KEY) === 'active';
  } catch {
    return false;
  }
}
