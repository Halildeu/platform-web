/**
 * ImpersonateAction — User Impersonation v1 PR-C2 (Codex AGREE thread
 * `019e109c` iter-4 absorb).
 *
 * SuperAdmin-only action mounted inside {@code UserDetailDrawer}.
 * Captures reason (≥10 chars enforced server-side) + target Keycloak
 * subject UUID, then delegates to
 * {@code getShellServices().auth.enterImpersonationSession(...)}. The
 * orchestration owns the start request, broker cookie write, target
 * authz/me fetch, queryClient invalidation, Redux dispatch, and
 * persisted metadata for hydrate + audit-safe stop.
 *
 * The PR-C scaffolding flow (raw setTokenCookie + localStorage write)
 * is removed: this component no longer touches cookies / localStorage
 * directly. Codex iter-31 RED (token swap doesn't reach shell auth
 * state) is closed because the orchestration's
 * {@code enterImpersonationSession} reducer atomically swaps
 * {@code state.auth.token / user / authzSnapshot / impersonation}.
 */
import React, { useCallback, useState } from 'react';
// Codex 019e1bed C-prime AGREE — `usePermissions` from `@mfe/auth` was
// removed from this component's render gate. mfe-users' Vite alias
// bypasses MF shared registration, so the local `@mfe/auth`
// `PermissionContext` defaults to `isSuperAdmin: () => false` even
// when shell-side authz reports `superAdmin = true`. The shell auth
// singleton (`getShellServices().auth.isSuperAdmin()`) is now the
// canonical source for this component's guard, matching the parent
// `UserDetailDrawer` mount gate.
import { getShellServices } from '../../../app/services/shell-services';
import type { UserDetail } from '@mfe/shared-types';

interface ImpersonateActionProps {
  user: Pick<UserDetail, 'id' | 'email' | 'fullName'>;
}

export const ImpersonateAction: React.FC<ImpersonateActionProps> = ({ user }) => {
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
      const auth = getShellServices().auth;
      // PR-C2 nested-impersonation guard (UX layer; backend also
      // rejects with NESTED_IMPERSONATION_FORBIDDEN as defence in
      // depth). The drawer mount gate already filters this case but
      // a race with multi-tab navigation could land us here.
      if (auth.isImpersonating()) {
        setError('Zaten aktif bir impersonation oturumu var.');
        setSubmitting(false);
        return;
      }
      await auth.enterImpersonationSession({
        targetUserId: numericUserId,
        targetSubject: targetSubject.trim(),
        targetEmail: user.email,
        reason: reason.trim(),
      });
      // On success the host has swapped Redux + cookie + queryClient;
      // closing the drawer is enough — the banner mounts via the
      // ShellLayout selector and PermissionProvider re-resolves with
      // the target authz snapshot.
      setOpen(false);
      setReason('');
      setTargetSubject('');
      setSubmitting(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Impersonation start failed; please retry.';
      setError(message);
      setSubmitting(false);
    }
  }, [reason, targetSubject, user.email, user.id]);

  // Codex 019e1bed C-prime AGREE — guard reads through shell auth
  // singleton instead of the previous `usePermissions().isSuperAdmin()`
  // call, which resolved against a duplicated `PermissionContext` when
  // mfe-users' Vite alias bypassed Module Federation shared
  // registration. The shell-level `authzSnapshot.superAdmin` is the
  // canonical source; fail-closed if shell-services is not yet
  // configured (matches the parent `UserDetailDrawer` mount gate).
  const canImpersonate = (() => {
    try {
      return getShellServices().auth.isSuperAdmin();
    } catch {
      return false;
    }
  })();
  if (!canImpersonate) {
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
            Bu işlem audit log&apos;una kaydedilir. Devam etmek için sebep ve hedef Keycloak subject
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
