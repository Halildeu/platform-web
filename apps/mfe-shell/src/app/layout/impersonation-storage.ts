/**
 * localStorage state machine for User Impersonation v1.
 *
 * PR-C scaffolding → PR-C2 hardening (Codex AGREE thread `019e109c`
 * iter-4 absorb). Now consumed by:
 *   - {@code AuthBootstrapper} hydrate guard (page refresh during an
 *     active impersonation session — skip Keycloak re-init)
 *   - {@code shell-services-wiring} enter/exit orchestration
 *   - {@code impersonation-expired-listener} cleanup
 *   - {@code ImpersonationBanner} fallback Stop path
 *
 * Stop UX contract (audit-safe):
 *   1. Read {@link readImpersonationOriginalToken} (saved at Start)
 *   2. POST /api/v1/impersonation/sessions/<id>/revoke with the
 *      ORIGINAL admin token in Authorization header (broker token
 *      would be rejected by backend per Codex iter-29's
 *      STOP_FROM_BROKER_TOKEN_NOT_SUPPORTED contract)
 *   3. Backend writes IMPERSONATION_REVOKED audit row with operator
 *      identity = the starting admin (PR-B Codex iter-29 P1-6 contract:
 *      writeRevokedByOperator)
 *   4. Frontend exits impersonation: clear keys, restore admin token,
 *      reload home.
 *
 * Telemetry note (Codex iter-2 absorb): this module emits NO logs,
 * toasts, or error payloads. The stored admin token is sensitive; any
 * accidental leak via console / telemetry would surface it. Callers
 * own their own diagnostics.
 */

export const IMPERSONATION_ORIGINAL_TOKEN_KEY = 'impersonation.original_token';
export const IMPERSONATION_SESSION_ID_KEY = 'impersonation.session_id';
export const IMPERSONATION_MODE_KEY = 'impersonation.mode';
export const IMPERSONATION_STARTED_AT_KEY = 'impersonation.started_at';
/** PR-C2: broker exchanged token (so AuthBootstrapper hydrate can re-seed). */
export const IMPERSONATION_EXCHANGED_TOKEN_KEY = 'impersonation.exchanged_token';
/** PR-C2: broker token expiry (ms epoch). */
export const IMPERSONATION_EXPIRES_AT_KEY = 'impersonation.expires_at';
/** PR-C2: original admin token expiry (ms epoch) — TTL guard for restore. */
export const IMPERSONATION_ORIGINAL_EXPIRES_AT_KEY = 'impersonation.original_expires_at';

interface EnterImpersonationModeInput {
  originalAdminToken: string;
  /** ms epoch when the original admin token expires. */
  originalAdminExpiresAt: number | null;
  sessionId: string;
  /** broker exchanged token (state.auth.token replacement). */
  exchangedToken: string;
  /** ms epoch when the broker token expires. */
  expiresAt: number | null;
}

const safeSetItem = (key: string, value: string): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // best effort
  }
};

const safeGetItem = (key: string): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeRemoveItem = (key: string): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // best effort
  }
};

/**
 * Persist the original admin token + session id + broker token + TTLs
 * at Start so the Stop continuation can call the backend with the
 * proper audit-actor identity, and {@code AuthBootstrapper} can
 * re-seed Redux on a page refresh.
 */
export function enterImpersonationMode(input: EnterImpersonationModeInput): void {
  if (typeof window === 'undefined') return;
  safeSetItem(IMPERSONATION_ORIGINAL_TOKEN_KEY, input.originalAdminToken);
  safeSetItem(IMPERSONATION_SESSION_ID_KEY, input.sessionId);
  safeSetItem(IMPERSONATION_EXCHANGED_TOKEN_KEY, input.exchangedToken);
  safeSetItem(IMPERSONATION_MODE_KEY, 'active');
  safeSetItem(IMPERSONATION_STARTED_AT_KEY, String(Date.now()));
  if (typeof input.expiresAt === 'number' && Number.isFinite(input.expiresAt)) {
    safeSetItem(IMPERSONATION_EXPIRES_AT_KEY, String(input.expiresAt));
  } else {
    safeRemoveItem(IMPERSONATION_EXPIRES_AT_KEY);
  }
  if (
    typeof input.originalAdminExpiresAt === 'number' &&
    Number.isFinite(input.originalAdminExpiresAt)
  ) {
    safeSetItem(IMPERSONATION_ORIGINAL_EXPIRES_AT_KEY, String(input.originalAdminExpiresAt));
  } else {
    safeRemoveItem(IMPERSONATION_ORIGINAL_EXPIRES_AT_KEY);
  }
}

/**
 * Clear all impersonation state machine keys. Called by Stop after the
 * backend audit-stop succeeds, by the impersonation-expired listener
 * after admin restore, on logout, on hydrate-fail, and on start-fail
 * after metadata writes (Codex iter-2 absorb: any failure path that
 * leaves partial metadata MUST call this so the next bootstrap pass
 * does not falsely match the 6-condition guard).
 */
export function exitImpersonationMode(): void {
  if (typeof window === 'undefined') return;
  safeRemoveItem(IMPERSONATION_ORIGINAL_TOKEN_KEY);
  safeRemoveItem(IMPERSONATION_SESSION_ID_KEY);
  safeRemoveItem(IMPERSONATION_EXCHANGED_TOKEN_KEY);
  safeRemoveItem(IMPERSONATION_MODE_KEY);
  safeRemoveItem(IMPERSONATION_STARTED_AT_KEY);
  safeRemoveItem(IMPERSONATION_EXPIRES_AT_KEY);
  safeRemoveItem(IMPERSONATION_ORIGINAL_EXPIRES_AT_KEY);
}

/**
 * Codex iter-2 absorb: a single helper for every failure path that
 * could leave partial metadata behind. Aliased to {@link exitImpersonationMode}
 * so the cleanup contract is colocated; named separately so call sites
 * read as "I'm cleaning up because something failed" rather than "I'm
 * intentionally exiting".
 */
export function clearImpersonationOnFailurePath(): void {
  exitImpersonationMode();
}

/**
 * Read the original admin token, enforcing TTL. Returns {@code null}
 * if the persisted {@code originalAdminExpiresAt} indicates the admin
 * token already expired — callers must redirect to /login instead of
 * attempting an admin restore with a stale credential.
 */
export function readImpersonationOriginalToken(): string | null {
  const expiresAtRaw = safeGetItem(IMPERSONATION_ORIGINAL_EXPIRES_AT_KEY);
  if (expiresAtRaw) {
    const expiresAt = Number(expiresAtRaw);
    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
      return null;
    }
  }
  return safeGetItem(IMPERSONATION_ORIGINAL_TOKEN_KEY);
}

export function readImpersonationOriginalAdminExpiresAt(): number | null {
  const raw = safeGetItem(IMPERSONATION_ORIGINAL_EXPIRES_AT_KEY);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function readImpersonationSessionId(): string | null {
  return safeGetItem(IMPERSONATION_SESSION_ID_KEY);
}

export function readImpersonationExchangedToken(): string | null {
  return safeGetItem(IMPERSONATION_EXCHANGED_TOKEN_KEY);
}

export function readImpersonationExpiresAt(): number | null {
  const raw = safeGetItem(IMPERSONATION_EXPIRES_AT_KEY);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function readImpersonationStartedAt(): number | null {
  const raw = safeGetItem(IMPERSONATION_STARTED_AT_KEY);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function isImpersonationModeActive(): boolean {
  return safeGetItem(IMPERSONATION_MODE_KEY) === 'active';
}
