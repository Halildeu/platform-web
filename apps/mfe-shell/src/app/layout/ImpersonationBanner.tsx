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
import { isImpersonationToken } from '@mfe/auth';
import { api } from '@mfe/shared-http';
import { clearTokenCookie } from '../providers/AuthBootstrapper';

interface ImpersonationContextHints {
  targetSubject: string | null;
  targetEmail: string | null;
  expEpoch: number | null;
}

function decodeBrokerHints(token: string | null | undefined): ImpersonationContextHints {
  if (!token) {
    return { targetSubject: null, targetEmail: null, expEpoch: null };
  }
  try {
    const parts = token.split('.');
    if (parts.length < 2) {
      return { targetSubject: null, targetEmail: null, expEpoch: null };
    }
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return {
      targetSubject: typeof payload?.sub === 'string' ? payload.sub : null,
      targetEmail: typeof payload?.email === 'string' ? payload.email : null,
      expEpoch: typeof payload?.exp === 'number' ? payload.exp : null,
    };
  } catch {
    return { targetSubject: null, targetEmail: null, expEpoch: null };
  }
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
      // Backend contract: broker-token holders cannot stop /current
      // (STOP_FROM_BROKER_TOKEN_NOT_SUPPORTED). Best path is to clear
      // cookie and redirect to login so the user re-authenticates
      // with their original admin credentials. The session row will
      // be marked EXPIRED by the TTL sweeper or remains ACTIVE until
      // manually revoked by another SuperAdmin.
      try {
        await api.delete('/v1/impersonation/sessions/current');
      } catch {
        // 400 STOP_FROM_BROKER_TOKEN_NOT_SUPPORTED is expected here.
        // Continue to cookie clear regardless.
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
