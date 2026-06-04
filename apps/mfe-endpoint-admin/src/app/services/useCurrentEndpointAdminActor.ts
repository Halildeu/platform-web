/**
 * AG-028 Phase 3 — current endpoint-admin actor subject resolver
 * (Codex 019e93a4 plan point #5).
 *
 * The approval surface needs the AUTHENTICATED subject — the same value
 * the backend writes into `createdBy` on an uninstall request — so the
 * UI can pre-disable the self-approve button on a maker-checker
 * violation (proposer == approver). The existing approval pages use a
 * hard-coded MOCK `CURRENT_USER` for the policy pilot; that mock is NOT
 * the canonical subject and MUST NOT drive the uninstall self-approve
 * guard.
 *
 * This hook reads the bearer JWT (same `localStorage.token` /
 * shell-injected precedence the RTK baseQuery uses) and decodes the
 * `sub` claim via the canonical `@mfe/auth` `decodeJwtPayload` helper.
 *
 * IMPORTANT: the client guard is a UX convenience only — the backend
 * maker-checker check is authoritative. A 403 on approve is still
 * caught + surfaced by the caller even when this hook can't resolve a
 * subject (token missing, decode failure → `subject: null`).
 */

import { useMemo } from 'react';
import { decodeJwtPayload } from '@mfe/auth';
import { getShellServices } from './shell-services';

function normalizeToken(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return null;
  return trimmed;
}

/**
 * Resolve the bearer token. Mirrors the precedence in
 * `endpointAdminApi.readBearerToken` (shell-injected getter first, then
 * `localStorage.token`) but kept local so this hook has no coupling to
 * the RTK module's private function. Both sources are try/caught so a
 * failure returns null rather than throwing inside render.
 */
function resolveBearerToken(): string | null {
  let token: string | null = null;
  try {
    token = normalizeToken(getShellServices().auth.getToken());
  } catch {
    // shell services not configured yet (standalone dev) — fall through
  }
  if (!token && typeof window !== 'undefined') {
    try {
      token = normalizeToken(window.localStorage.getItem('token'));
    } catch {
      // localStorage access denied (SSR / sandbox)
    }
  }
  return token;
}

export interface CurrentEndpointAdminActor {
  /**
   * The canonical authenticated subject (JWT `sub` claim), or null when
   * no token is present / the token can't be decoded. This is the value
   * the backend uses for `createdBy` — compare it against
   * `request.createdBy` for the self-approve guard.
   */
  subject: string | null;
}

/**
 * Read the current actor's canonical subject from the bearer JWT.
 *
 * Note: this is intentionally NOT memoised across token rotation (the
 * approval surface is short-lived and re-reads on each mount); the
 * `useMemo` only avoids re-decoding on unrelated re-renders within a
 * single mount.
 */
export function useCurrentEndpointAdminActor(): CurrentEndpointAdminActor {
  return useMemo(() => {
    const token = resolveBearerToken();
    if (!token) return { subject: null };
    const payload = decodeJwtPayload(token);
    const sub = payload && typeof payload.sub === 'string' ? payload.sub.trim() : '';
    return { subject: sub ? sub : null };
  }, []);
}
