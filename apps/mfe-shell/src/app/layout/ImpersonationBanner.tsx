/**
 * ImpersonationBanner — User Impersonation v1 PR-C2 (Codex AGREE thread
 * `019e109c` iter-4 absorb).
 *
 * Mounted by {@code ShellLayout} when {@link selectIsImpersonating}
 * resolves true. Renders a sticky warning strip with the original
 * admin email ↔ target email pair plus a "Stop" button that delegates
 * to {@code getShellServices().auth.exitImpersonationSession()}.
 *
 * Audit-complete stop contract (Codex iter-3 invariant): the
 * orchestration calls the backend revoke FIRST and only mutates state
 * if the revoke succeeds. On revoke failure the banner shows an error
 * + retry button — silent cleanup is forbidden because it would leak
 * the session without a corresponding {@code IMPERSONATION_REVOKED}
 * audit row.
 *
 * The Stop button no longer touches localStorage / cookies directly;
 * the orchestration owns every side effect (cookie, authz/me,
 * queryClient, Redux dispatch, storage clear).
 */
import React, { useCallback, useMemo, useState } from 'react';
import { useAppSelector } from '../store/store.hooks';
import {
  selectIsImpersonating,
  selectImpersonationOriginalAdmin,
  selectImpersonationExpiresAt,
} from '../../features/auth/model/auth.slice';
import { getShellServices } from '../services/shell-services';

export const ImpersonationBanner: React.FC = () => {
  const isImpersonating = useAppSelector(selectIsImpersonating);
  const originalAdmin = useAppSelector(selectImpersonationOriginalAdmin);
  const targetUser = useAppSelector((state) => state.auth.user);
  const brokerExpiresAt = useAppSelector(selectImpersonationExpiresAt);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expiresInMinutes = useMemo(() => {
    if (typeof brokerExpiresAt !== 'number' || brokerExpiresAt <= 0) return null;
    const remainingMs = brokerExpiresAt - Date.now();
    if (remainingMs <= 0) return 0;
    return Math.round(remainingMs / 60_000);
  }, [brokerExpiresAt]);

  const handleStop = useCallback(async () => {
    if (stopping) return;
    setStopping(true);
    setError(null);
    try {
      const result = await getShellServices().auth.exitImpersonationSession();
      if (!result.ok) {
        if (result.reason === 'revoke-failed' || result.reason === 'restore-failed') {
          // Codex iter-3 invariant: surface the revoke failure so the
          // user can retry without producing a missing audit row.
          setError(
            result.message
              ? `Impersonation kapatılamadı: ${result.message}. Tekrar deneyin.`
              : 'Impersonation kapatılamadı; tekrar deneyin.',
          );
          setStopping(false);
          return;
        }
        if (result.reason === 'session-lost' || result.reason === 'admin-expired') {
          // Cleanup happened reducer-side; redirect to /login so a
          // fresh admin session is established.
          if (typeof window !== 'undefined') {
            window.location.assign('/login?reason=impersonation_expired');
          }
          return;
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Impersonation stop failed; please retry.';
      setError(`Impersonation kapatılamadı: ${message}.`);
      setStopping(false);
    }
  }, [stopping]);

  if (!isImpersonating) {
    return null;
  }

  const targetLabel = targetUser?.email ?? targetUser?.id ?? 'hedef kullanıcı';
  const originalLabel = originalAdmin?.email ?? 'admin';

  return (
    <div
      role="alert"
      data-testid="impersonation-banner"
      // Codex 019e1bed PR-2 AGREE — viewport overflow fix.
      // The previous markup used `flex w-full` with no `min-w-0` on the
      // text container and no `shrink-0` on the stop button, so a long
      // admin/target email pair pushed the stop button beyond the right
      // edge of the viewport (rect left=1519 + width=176 > viewport
      // 1568). On wide layouts this hid the stop affordance entirely
      // unless the user scrolled. Defenses now:
      //   - `box-border max-w-full` keeps the banner inside its parent
      //   - `flex-wrap` allows the action column to wrap on narrow
      //     viewports instead of overflowing
      //   - `min-w-0` on the text column lets its content shrink/truncate
      //   - `flex-shrink-0` + `ml-auto` on the action column keeps the
      //     stop button visible regardless of message length
      className="sticky top-0 z-50 box-border flex w-full max-w-full flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-state-warning-border bg-state-warning-bg px-4 py-2 text-sm font-medium text-state-warning-text shadow-sm"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span aria-hidden="true" className="shrink-0">
          ⚠
        </span>
        <span className="min-w-0 truncate">
          <strong>{originalLabel}</strong> olarak <strong>{targetLabel}</strong> adına işlem
          yapıyorsun
          {expiresInMinutes !== null ? ` (oturum ${expiresInMinutes} dk içinde sona erer)` : ''}.
        </span>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-3">
        {error ? (
          <span className="text-state-danger-text" data-testid="impersonation-banner-error">
            {error}
          </span>
        ) : null}
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
