/**
 * ImpersonationBanner — User Impersonation v1 PR-C scaffolding (NOT MOUNTED).
 *
 * SCOPE NOTE: this component file ships in PR-C as scaffolding only;
 * the JSX mount in ShellLayout is intentionally removed until PR-C2
 * wires the shell auth state machine integration. See PR-C descope
 * rationale in the commit message.
 *
 * PR-C2 target behaviour (after wiring lands):
 *   - Render a sticky warning banner whenever
 *     state.auth.token's azp claim is the broker client id
 *     (set by enterImpersonationSession in PR-C2 auth.slice).
 *   - Stop button POSTs /api/v1/impersonation/sessions/<id>/revoke
 *     with Authorization: Bearer <originalAdminToken> (read from
 *     localStorage saved at Start). Backend writes IMPERSONATION_REVOKED
 *     audit row with operator identity = the starting admin (PR-B
 *     iter-29 P1-6 contract: writeRevokedByOperator).
 *   - On success: dispatch exitImpersonationSession (PR-C2), clear cookie,
 *     redirect to /login?reason=impersonation_stop.
 *   - On revoke failure: surface to banner UI, do NOT silently cleanup
 *     (Codex iter-31 audit completeness contract).
 *
 * The current PR-C skeleton wires Stop revoke + cookie clear + login
 * redirect, but visibility relies on state.auth.token which PR-C does
 * NOT update — so in production this banner would not render even
 * when an active impersonation session exists. PR-C2 closes that gap.
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
  exitImpersonationMode,
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
      // We call the backend with the ORIGINAL admin token saved at Start
      // and POST /{id}/revoke; backend writes an IMPERSONATION_REVOKED
      // audit row with operator identity = the starting admin (PR-B
      // Codex iter-29 P1-6 contract: writeRevokedByOperator).
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
        // Codex iter-32 P1 absorb: revoke failure must NOT silently
        // cleanup. Surface on banner + halt; user can retry. This
        // protects audit completeness (no Stop without an audit row).
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
          const message =
            revokeErr instanceof Error
              ? revokeErr.message
              : 'Backend reddetti, audit kaydı oluşturulamadı.';
          setError(`Impersonation kapatılamadı: ${message}. Tekrar deneyin.`);
          setStopping(false);
          return;
        }
      } else {
        // No saved original token (cross-tab/manual cookie/refresh
        // bypassed Start). Fallback: try DELETE /current with current
        // cookie — backend rejects if broker-token (expected). On
        // rejection we still must not silently cleanup; surface +
        // halt so the user re-authenticates with admin credentials
        // and can complete an audit-safe stop.
        try {
          await api.delete('/v1/impersonation/sessions/current');
        } catch (fallbackErr) {
          const message =
            fallbackErr instanceof Error
              ? fallbackErr.message
              : 'STOP_FROM_BROKER_TOKEN_NOT_SUPPORTED — orijinal admin oturumu ile çıkın.';
          setError(`Impersonation kapatılamadı: ${message}.`);
          setStopping(false);
          return;
        }
      }

      // Clear all impersonation state machine keys + cookie + reload home.
      // AuthBootstrapper will re-init Keycloak with admin identity.
      // Use the colocated exitImpersonationMode helper so the cleanup
      // always covers every key that enterImpersonationMode wrote
      // (prevents drift between writer + reader). Reached only after
      // the backend audit row was successfully produced.
      exitImpersonationMode();
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
