/**
 * ImpersonateAction — User Impersonation v1 PR-C scaffolding (NOT MOUNTED).
 *
 * SCOPE NOTE: this component file ships in PR-C as scaffolding only;
 * the JSX mount in UserDetailDrawer is intentionally removed until
 * PR-C2 wires the shell auth state machine integration. See PR-C
 * descope rationale in the commit message.
 *
 * PR-C2 target behaviour (after wiring lands):
 *   1. SuperAdmin opens UserDetailDrawer → "Impersonate this user"
 *      button (rendered only when usePermissions().isSuperAdmin())
 *   2. Confirmation form captures reason (≥10 chars enforced server-side)
 *      + target Keycloak subject UUID (PR-C2 will auto-resolve via
 *      user-service so this field disappears)
 *   3. Backend POST /api/v1/impersonation/sessions returns
 *      {sessionId, exchangedToken, expiresAt}
 *   4. Frontend dispatches shellServices.auth.enterImpersonation(
 *        exchangedToken, sessionId
 *      ) so state.auth.token + tokenResolver + PermissionProvider all
 *      observe the broker identity
 *   5. window.location.assign('/') reloads — AuthBootstrapper (PR-C2)
 *      detects impersonation mode and skips Keycloak re-init so the
 *      broker token is not overwritten.
 *
 * In this PR-C scaffolding file, step 4 is approximated by
 * setTokenCookie(exchangedToken) + raw localStorage writes; this is
 * NOT prod-correct and the component is not imported anywhere. Kept in
 * the repo so PR-C2 can mount + extend it without re-doing the form
 * + start API plumbing.
 */
import React, { useCallback, useState } from 'react';
import { startImpersonation } from '@mfe/auth';
import { usePermissions } from '@mfe/auth';
import { getShellServices } from '../../../app/services/shell-services';
import { setTokenCookie } from '../../../shared/auth-cookie';
import type { UserDetail } from '@mfe/shared-types';

interface ImpersonateActionProps {
  user: Pick<UserDetail, 'id' | 'email' | 'fullName'>;
}

export const ImpersonateAction: React.FC<ImpersonateActionProps> = ({ user }) => {
  const { isSuperAdmin } = usePermissions();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [targetSubject, setTargetSubject] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reasonValid = reason.trim().length >= 10;
  const subjectValid = targetSubject.trim().length > 0;
  const canSubmit = reasonValid && subjectValid && !submitting;

  const handleStart = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const numericUserId = Number(user.id);
      if (!Number.isFinite(numericUserId)) {
        throw new Error('User id is not a numeric platform id');
      }
      // Wrap shell http.post to match the (url, body) -> {data, status}
      // signature expected by @mfe/auth's startImpersonation. Per PR-HTTP-3,
      // remote MFEs must consume the shell-injected client.
      const http = getShellServices().http;
      const response = await startImpersonation(
        async (url, body) => {
          const res = await http.post(url, body);
          return { data: res.data, status: res.status };
        },
        {
          targetUserId: numericUserId,
          targetSubject: targetSubject.trim(),
          targetEmail: user.email,
          reason: reason.trim(),
        },
      );

      if (response.errorCode || !response.exchangedToken || !response.sessionId) {
        setError(response.errorMessage ?? 'Impersonation could not be started');
        setSubmitting(false);
        return;
      }

      // Codex iter-30 P0 absorb: persist the original admin token + session
      // id BEFORE swapping so the Stop continuation can call backend with
      // the proper audit-actor identity (broker-token DELETE /current is
      // rejected per backend contract). Keys are colocated in
      // mfe-shell/.../impersonation-storage but written here via raw
      // localStorage to avoid an MFE → MFE direct dependency.
      try {
        const adminToken = (() => {
          if (typeof window === 'undefined') return null;
          try {
            return window.localStorage.getItem('token');
          } catch {
            return null;
          }
        })();
        if (adminToken && typeof window !== 'undefined') {
          window.localStorage.setItem('impersonation.original_token', adminToken);
          window.localStorage.setItem('impersonation.session_id', response.sessionId);
          window.localStorage.setItem('impersonation.mode', 'active');
          window.localStorage.setItem('impersonation.started_at', String(Date.now()));
        }
      } catch {
        // best-effort: stop continuation falls back to cookie clear if
        // the admin token wasn't persisted.
      }

      // Swap auth cookie to the broker-issued exchanged token, then full
      // page reload so React Query cache + Redux state restart against
      // the new identity. ImpersonationBanner detects azp=broker on
      // mount and renders the warning strip.
      await setTokenCookie(response.exchangedToken);
      window.location.assign('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impersonation start failed');
      setSubmitting(false);
    }
  }, [reason, targetSubject, user.email, user.id]);

  // Codex iter-30 P1: isSuperAdmin is a function () => boolean from
  // PermissionProvider, not a boolean. Earlier `if (!isSuperAdmin)`
  // always evaluated truthy → all users saw the action. The backend
  // /authz/me gate was the only authoritative defence; UX gate now
  // matches.
  if (!isSuperAdmin()) {
    return null;
  }

  return (
    <div data-testid="impersonate-action" className="flex flex-col gap-2">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-xl border border-state-warning-border bg-state-warning-bg px-3 py-1.5 text-xs font-semibold text-state-warning-text hover:bg-state-warning-bg-strong"
          data-testid="impersonate-open-btn"
        >
          Impersonate this user
        </button>
      ) : (
        <div className="rounded-2xl border border-state-warning-border bg-state-warning-bg p-3 text-sm">
          <p className="font-semibold text-state-warning-text">
            Impersonate {user.fullName} ({user.email})
          </p>
          <p className="mt-1 text-xs text-state-warning-text">
            Bu işlem audit log'una kaydedilir. Devam etmek için sebep ve hedef Keycloak subject
            (UUID) gerekli.
          </p>
          <label className="mt-3 block">
            <span className="block text-xs font-semibold uppercase tracking-wide text-state-warning-text">
              Sebep (min 10 karakter)
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              minLength={10}
              maxLength={500}
              className="mt-1 w-full rounded-md border border-state-warning-border bg-surface-default p-2 text-sm"
              data-testid="impersonate-reason"
            />
          </label>
          <label className="mt-2 block">
            <span className="block text-xs font-semibold uppercase tracking-wide text-state-warning-text">
              Keycloak subject (UUID)
            </span>
            <input
              type="text"
              value={targetSubject}
              onChange={(e) => setTargetSubject(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              className="mt-1 w-full rounded-md border border-state-warning-border bg-surface-default p-2 font-mono text-xs"
              data-testid="impersonate-subject"
            />
          </label>
          {error ? (
            <p className="mt-2 text-xs text-state-danger-text" data-testid="impersonate-error">
              {error}
            </p>
          ) : null}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleStart}
              disabled={!canSubmit}
              className="rounded-xl bg-state-warning-text px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              data-testid="impersonate-submit-btn"
            >
              {submitting ? 'Başlatılıyor…' : 'Impersonate başlat'}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
                setReason('');
                setTargetSubject('');
              }}
              disabled={submitting}
              className="rounded-xl border border-border-subtle px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-surface-muted disabled:opacity-60"
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImpersonateAction;
