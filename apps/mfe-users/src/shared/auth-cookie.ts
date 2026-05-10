/**
 * Auth cookie helper for mfe-users (User Impersonation v1 PR-C).
 *
 * Mirror of mfe-shell's AuthBootstrapper.setTokenCookie — posts the
 * Bearer token to /auth/cookie so the gateway sets the session cookie.
 * Required from mfe-users because the impersonation start flow swaps
 * the active token mid-session and triggers a full reload; the new
 * cookie must land before navigation.
 *
 * Follow-up: extract this to a shared package (@mfe/auth-cookie) so
 * mfe-shell + mfe-users + future MFEs share one implementation.
 */
import { getShellServices } from '../app/services/shell-services';

/**
 * Posts a Bearer token to /auth/cookie so the API gateway issues an
 * HttpOnly session cookie. Bypasses the auth-ready FSM gate because
 * this call IS the gate trigger (PR-HTTP-3 contract preserved).
 *
 * Uses the shell-injected HTTP client per PR-HTTP-3 — direct `api`
 * import would bypass the shell's auth.ready() gate registered via
 * registerAuthReadyResolver().
 */
export async function setTokenCookie(token: string): Promise<void> {
  const http = getShellServices().http;
  await http.post('/auth/cookie', null, {
    headers: { Authorization: `Bearer ${token}` },
    __skipAuthReadyGate: true,
  } as Parameters<typeof http.post>[2]);
}

/**
 * Clears the auth cookie via DELETE /auth/cookie. Used by
 * impersonation stop UX.
 */
export async function clearTokenCookie(): Promise<void> {
  try {
    const http = getShellServices().http;
    await http.delete('/auth/cookie', {
      __skipAuthReadyGate: true,
    } as Parameters<typeof http.delete>[1]);
  } catch {
    // Best effort — ignore failures during logout.
  }
}
