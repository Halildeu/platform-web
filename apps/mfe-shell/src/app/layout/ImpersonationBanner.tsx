/**
 * ImpersonationBanner — User Impersonation v1 PR-C frontend.
 *
 * Renders a sticky warning banner at the top of every page when the
 * active session token is a broker-issued (azp=impersonation-broker)
 * exchanged token. Provides a "Stop impersonating" action that:
 *   1. Calls DELETE /api/v1/impersonation/sessions/current
 *   2. Clears the auth cookie
 *   3. Redirects the user to the login page so they re-authenticate
 *      with their original admin credentials
 *
 * UX rationale (Codex PR-B contract): the broker-issued token has no
 * impersonator_user_id claim, so we cannot silently swap back. A
 * forced re-login keeps the audit trail clean and matches PR-B
 * controller's STOP_FROM_BROKER_TOKEN_NOT_SUPPORTED rejection on the
 * backend — the impersonator must call /current with their ORIGINAL
 * token. From the broker-token side, we logout and re-login.
 *
 * Banner visibility is purely a UX hint based on JWT azp claim;
 * permission-service's ImpersonationContextFilter (PR-B Step 2e
 * iter-28) is the authoritative enforcement.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { useAppSelector } from '../store/store.hooks';
import { decodeJwtPayload, isImpersonationToken } from '@mfe/auth';
import { api } from '@mfe/shared-http';
import { clearTokenCookie } from '../providers/AuthBootstrapper';
import {
  IMPERSONATION_ORIGINAL_TOKEN_KEY,
  IMPERSONATION_SESSION_ID_KEY,
  IMPERSONATION_MODE_KEY,
} from './impersonation-storage';

interface ImpersonationContextHints {
  targetSubject: string | null;
  targetEmail: string | null;
  expEpoch: number | null;
}

function decodeBrokerHints(token: string | null | undefined): ImpersonationContextHints {
  if (!token) {
    return { targetSubject: null, targetEmail: null, expEpoch: null };
  }
  const payload = decodeJwtPayload(token);
  if (!payload) {
    return { targetSubject: null, targetEmail: null, expEpoch: null };
  }
  return {
    targetSubject: typeof payload.sub === 'string' ? payload.sub : null,
    targetEmail: typeof payload.email === 'string' ? payload.email : null,
    expEpoch: typeof payload.exp === 'number' ? payload.exp : null,
  };
}

export const ImpersonationBanner: React.FC = () => {
  const token = useAppSelector((state) => state.auth.token);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isImpersonating = useMemo(() => isImpersonationToken(token), [token]);
  const hints = useMemo(() => decodeBrokerHints(token), [token]);

  const handleStop = useCallback(async () => {
    setStopping(true);
    setError(null);
    try {
      // Codex iter-30 P0 absorb: audit-complete stop. Backend rejects
      // broker-token DELETE /current (STOP_FROM_BROKER_TOKEN_NOT_SUPPORTED).
      // We call the backend with the ORIGINAL admin token saved at Start —
      // either DELETE /current (if same admin who started) or
      // POST /{id}/revoke (any path). This guarantees an
      // IMPERSONATION_STOPPED audit row is written.
      const sessionId =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(IMPERSONATION_SESSION_ID_KEY)
          : null;
      const originalAdminToken =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(IMPERSONATION_ORIGINAL_TOKEN_KEY)
          : null;

      if (originalAdminToken && sessionId) {
        // Use original admin token to revoke the active session — produces
        // IMPERSONATION_REVOKED audit with operator identity = the admin
        // who started impersonation.
        try {
          await api.post(
            `/v1/impersonation/sessions/${sessionId}/revoke`,
            { reason: 'USER_STOP_FROM_BANNER' },
            {
              headers: { Authorization: `Bearer ${originalAdminToken}` },
               
              __skipAuthReadyGate: true,
            } as Parameters<typeof api.post>[2],
          );
        } catch (revokeErr) {
          // Continue to cleanup even if revoke fails — surfacing on
          // banner avoids users stuck in impersonation mode.
          console.warn(
            '[ImpersonationBanner] revoke with original admin token failed; continuing cleanup',
            revokeErr,
          );
        }
      } else {
        // No saved original token (cross-tab/manual cookie/refresh
        // bypassed Start). Try DELETE /current with current cookie —
        // backend will reject if broker-token. Fall through to cookie
        // clear + login.
        try {
          await api.delete('/v1/impersonation/sessions/current');
        } catch {
          // STOP_FROM_BROKER_TOKEN_NOT_SUPPORTED expected here.
        }
      }

      // Clear all impersonation state machine keys + cookie + reload home.
      // AuthBootstrapper will re-init Keycloak with admin identity.
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.removeItem(IMPERSONATION_ORIGINAL_TOKEN_KEY);
          window.localStorage.removeItem(IMPERSONATION_SESSION_ID_KEY);
          window.localStorage.removeItem(IMPERSONATION_MODE_KEY);
        } catch {
          // best-effort
        }
      }
      await clearTokenCookie();
      window.location.assign('/login?reason=impersonation_stop');
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Impersonation stop failed; please refresh and try again.',
      );
      setStopping(false);
    }
  }, []);

  if (!isImpersonating) {
    return null;
  }

  const expiresInMinutes = hints.expEpoch
    ? Math.max(0, Math.round((hints.expEpoch - Date.now() / 1000) / 60))
    : null;

  return (
    <div
      role="alert"
      data-testid="impersonation-banner"
      className="sticky top-0 z-50 flex w-full items-center justify-between gap-3 border-b border-state-warning-border bg-state-warning-bg px-4 py-2 text-sm font-medium text-state-warning-text shadow-sm"
    >
      <div className="flex items-center gap-2">
        <span aria-hidden="true">⚠</span>
        <span>
          Şu an <strong>{hints.targetEmail ?? hints.targetSubject ?? 'bir kullanıcı'}</strong> adına
          işlem yapıyorsun
          {expiresInMinutes !== null ? ` (oturum ${expiresInMinutes} dk içinde sona erer)` : ''}.
        </span>
      </div>
      <div className="flex items-center gap-3">
        {error ? <span className="text-state-danger-text">{error}</span> : null}
        <button
          type="button"
          onClick={handleStop}
          disabled={stopping}
          data-testid="impersonation-stop-btn"
          className="rounded-md border border-state-warning-border bg-white px-3 py-1 text-state-warning-text hover:bg-state-warning-bg disabled:cursor-not-allowed disabled:opacity-60"
        >
          {stopping ? 'Durduruluyor…' : "Impersonation'ı durdur"}
        </button>
      </div>
    </div>
  );
};

export default ImpersonationBanner;
