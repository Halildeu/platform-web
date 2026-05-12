/**
 * ImpersonateAction — User Impersonation v1.
 *
 * SuperAdmin-only action mounted inside {@code UserDetailDrawer} as a
 * top-of-drawer affordance for the platform admin grid.
 *
 * Codex thread `019e1bed` AGREE C-prime: this component used to ask the
 * operator to paste the target user's Keycloak UUID into a UI field —
 * which is impossible for real admins to know and made the feature
 * effectively unusable. The flow is now:
 *
 *   - Reason (≥10 chars enforced backend) is the only operator input.
 *   - Target Keycloak subject is resolved server-side from
 *     {@code targetUserId} by the auth-service ImpersonationController
 *     (which reads {@code users.kc_subject} via user-service).
 *   - The orchestration owns the start request, broker cookie write,
 *     target authz/me fetch, queryClient invalidation, Redux dispatch
 *     and persisted metadata for hydrate + audit-safe stop.
 *
 * Defense-in-depth (Codex 019e1bed C-prime + this PR):
 *   - SuperAdmin gate reads `getShellServices().auth.isSuperAdmin()`
 *     instead of `usePermissions()` (alias-bypass guard).
 *   - Backend rejects self-target with `SELF_IMPERSONATION_FORBIDDEN`
 *     regardless of UI guard. UI still hides the action when targeting
 *     self (handled in `UserDetailDrawer.canShowImpersonateAction`).
 *   - Backend rejects unresolved targets with `TARGET_SUBJECT_UNRESOLVABLE`
 *     when `users.kc_subject` is null (pre-V16 backfill).
 *   - All known backend error codes are mapped to human-readable
 *     Turkish messages so the generic 401 "Oturum süreniz doldu" toast
 *     never masks an impersonation-specific failure.
 */
import React, { useCallback, useState } from 'react';
import { getShellServices } from '../../../app/services/shell-services';
import type { UserDetail } from '@mfe/shared-types';

interface ImpersonateActionProps {
  user: Pick<UserDetail, 'id' | 'email' | 'fullName'>;
}

/**
 * Codex 019e1bed AGREE — backend errorCode → Turkish UI message mapping.
 * Generic Error.message falls through when the code is unknown so the
 * orchestration's existing failure modes (network errors, etc.) still
 * surface a useful string.
 */
const ERROR_CODE_MESSAGES: Record<string, string> = {
  SELF_IMPERSONATION_FORBIDDEN: 'Kendi hesabını impersonate edemezsin.',
  TARGET_USER_DISABLED: 'Pasif kullanıcı için impersonation başlatılamaz.',
  TARGET_SUBJECT_UNRESOLVABLE:
    'Hedef kullanıcının Keycloak eşlemesi eksik (kc_subject backfill bekleniyor). Operatöre bildirin.',
  ADMIN_IDENTITY_MISSING:
    'Admin kimliği eksik. Çıkış yapıp tekrar giriş yapın veya KC userId attribute kontrolü gerekiyor.',
  INSUFFICIENT_AUTHORITY: 'Bu işlem için süper admin yetkisi gerekiyor.',
  NESTED_IMPERSONATION_FORBIDDEN:
    'Zaten aktif bir impersonation oturumu var. Önce mevcut oturumu durdurun.',
  ACTIVE_SESSION_EXISTS: 'Zaten aktif bir impersonation oturumu var. Önce mevcut oturumu durdurun.',
  TARGET_SUBJECT_MISMATCH:
    'KC token-exchange hedef kullanıcı kontrolü tutmadı (audit poisoning koruması).',
  EXCHANGED_TOKEN_NOT_BROKER_ISSUED: 'KC token-exchange yanıtı broker-imzalı değil.',
  EXCHANGED_TOKEN_EXPIRED: 'KC tarafından dönen token süresi dolmuş.',
  TOKEN_EXCHANGE_FAILED: 'Keycloak token-exchange başarısız.',
  SESSION_PERSIST_FAILED: 'Impersonation oturumu kaydedilemedi (permission-service hatası).',
};

const friendlyErrorMessage = (err: unknown): string => {
  if (err instanceof Error) {
    // Codex 019e1e0f BUG #3 follow-up: orchestration adapter wraps
    // Spring's `MethodArgumentNotValidException` (400 with shape
    // `{error: "VALIDATION_ERROR", fieldErrors: [...]}`) into a regular
    // Error whose `errorCode` property is "VALIDATION_ERROR" and whose
    // `message` is the localized field message (e.g.
    // "boyut '10' ile '500' arasında olmalı"). Prefer this verbatim
    // over the generic ERROR_CODE_MESSAGES fallback because the
    // backend already localized it via Spring's Turkish ValidationMessages.
    const withCode = err as Error & { errorCode?: string };
    if (withCode.errorCode === 'VALIDATION_ERROR' && err.message) {
      return err.message;
    }
    // Orchestration surfaces errorCode in error.message when backend
    // returns a structured StartResponse with errorCode set.
    const msg = err.message ?? '';
    for (const [code, friendly] of Object.entries(ERROR_CODE_MESSAGES)) {
      if (msg.includes(code)) return friendly;
    }
    return msg || 'Impersonation başlatılamadı. Lütfen tekrar deneyin.';
  }
  return 'Impersonation başlatılamadı. Lütfen tekrar deneyin.';
};

export const ImpersonateAction: React.FC<ImpersonateActionProps> = ({ user }) => {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reasonValid = reason.trim().length >= 10;
  const canSubmit = reasonValid && !submitting;

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
        setError(ERROR_CODE_MESSAGES.ACTIVE_SESSION_EXISTS);
        setSubmitting(false);
        return;
      }
      // Codex 019e1bed REVISE-2 — `targetSubject` REMOVED from the
      // request payload. Backend resolves it server-side from
      // `targetUserId` via the service-token protected internal
      // user-service endpoint, so the admin UI never sees the KC UUID.
      // The shell type `ShellEnterImpersonationPayload.targetSubject`
      // is now optional; omitting the key entirely keeps audit logs
      // and contract tests clean (no "client sent empty subject" noise).
      await auth.enterImpersonationSession({
        targetUserId: numericUserId,
        targetEmail: user.email,
        reason: reason.trim(),
      });
      // On success the host has swapped Redux + cookie + queryClient;
      // closing the drawer is enough — the banner mounts via the
      // ShellLayout selector and PermissionProvider re-resolves with
      // the target authz snapshot.
      setOpen(false);
      setReason('');
      setSubmitting(false);
    } catch (e) {
      setError(friendlyErrorMessage(e));
      setSubmitting(false);
    }
  }, [reason, user.email, user.id]);

  // Codex 019e1bed C-prime AGREE — guard reads through shell auth
  // singleton instead of `usePermissions().isSuperAdmin()`, which
  // resolved against a duplicated `PermissionContext` when mfe-users'
  // Vite alias bypassed Module Federation shared registration.
  // Fail-closed if shell-services is not yet configured (matches the
  // parent `UserDetailDrawer` mount gate).
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
            Bu işlem audit log&apos;una kaydedilir. Devam etmek için sebep (min 10 karakter)
            gerekli; hedef kullanıcı sistem tarafından otomatik çözümlenir.
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
