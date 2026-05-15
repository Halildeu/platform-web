import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { UserSummary } from '@mfe/shared-types';
import { useUserMutations } from '../../../features/user-management/model/use-users-query.model';
import { usePermissions } from '@mfe/auth';
import { PERMISSIONS } from '../../../features/user-management/lib/permissions.constants';
import { useUsersI18n } from '../../../i18n/useUsersI18n';
import { pushToast } from '../../../shared/notifications';
import { getShellServices } from '../../../app/services/shell-services';

// Codex 019e27bf fresh-context audit follow-up — single source of truth
// for impersonation error code → Turkish UI message mapping. Previously
// duplicated as ROW_IMPERSONATE_ERROR_MESSAGES inline; now imported from
// the shared helper that ImpersonateAction.tsx also consumes, so adding
// a new backend error code requires only one edit.
import { friendlyImpersonationErrorMessage as friendlyRowImpersonateError } from '../lib/impersonation-error-messages';

interface UserActionsProps {
  user: UserSummary;
  onSelect: () => void;
}

const UserActions: React.FC<UserActionsProps> = ({ user, onSelect }) => {
  const {
    resetPasswordMutation,
    toggleStatusMutation,
    grantSuperAdminMutation,
    revokeSuperAdminMutation,
  } = useUserMutations();
  const { hasModule, isSuperAdmin } = usePermissions();
  const hasPermission = (perm: string | string[] | undefined) => {
    if (!perm || isSuperAdmin()) return true;
    return hasModule('USER_MANAGEMENT');
  };
  // Codex 019dda1c iter-33: super-admin grant/revoke items only visible to
  // current super-admins. Backend enforces the same check (403 on non-super-
  // admin); this UI guard avoids surfacing a button that always errors.
  const callerIsSuperAdmin = isSuperAdmin();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const { t } = useUsersI18n();

  // Codex 019e2022 follow-up — row-level impersonate quick action.
  // The action is gated by the shell auth singleton (matches
  // ImpersonateAction's defense-in-depth contract). Self-target is
  // suppressed via the shell's getUser()/subscriberId comparison.
  const shellAuth = useMemo(() => {
    try {
      return getShellServices().auth;
    } catch {
      return null;
    }
  }, []);
  const shellSuperAdmin = useMemo(() => {
    try {
      return Boolean(shellAuth?.isSuperAdmin?.());
    } catch {
      return false;
    }
  }, [shellAuth]);
  const shellImpersonating = useMemo(() => {
    try {
      return Boolean(shellAuth?.isImpersonating?.());
    } catch {
      return false;
    }
  }, [shellAuth]);
  const callerSubscriberId = useMemo(() => {
    try {
      const profile = shellAuth?.getUser?.() as { subscriberId?: string | number } | null;
      const raw = profile?.subscriberId;
      return raw != null ? String(raw) : null;
    } catch {
      return null;
    }
  }, [shellAuth]);
  const isSelfTarget = callerSubscriberId != null && callerSubscriberId === String(user.id);
  const canRowImpersonate = shellSuperAdmin && !shellImpersonating && !isSelfTarget;

  const [impersonateOpen, setImpersonateOpen] = useState(false);
  const [impersonateReason, setImpersonateReason] = useState('');
  const [impersonateSubmitting, setImpersonateSubmitting] = useState(false);
  const [impersonateError, setImpersonateError] = useState<string | null>(null);

  const closeImpersonateModal = useCallback(() => {
    setImpersonateOpen(false);
    setImpersonateReason('');
    setImpersonateError(null);
    setImpersonateSubmitting(false);
  }, []);

  const submitImpersonate = useCallback(async () => {
    if (!shellAuth || impersonateReason.trim().length < 10) {
      return;
    }
    setImpersonateSubmitting(true);
    setImpersonateError(null);
    try {
      const numericUserId = typeof user.id === 'number' ? user.id : parseInt(String(user.id), 10);
      await shellAuth.enterImpersonationSession({
        targetUserId: numericUserId,
        targetEmail: user.email,
        reason: impersonateReason.trim(),
      });
      closeImpersonateModal();
    } catch (e) {
      setImpersonateError(friendlyRowImpersonateError(e));
      setImpersonateSubmitting(false);
    }
  }, [shellAuth, impersonateReason, user.email, user.id, closeImpersonateModal]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const items = useMemo(() => {
    const menu: { key: string; label: string; onClick: () => void }[] = [
      {
        key: 'view',
        label: t('users.actions.view'),
        onClick: onSelect,
      },
    ];

    if (hasPermission(PERMISSIONS.USER_MANAGEMENT_RESET_PASSWORD)) {
      menu.push({
        key: 'reset-password',
        label: t('users.actions.resetPassword'),
        onClick: async () => {
          try {
            await resetPasswordMutation.mutateAsync({ email: user.email });
            pushToast('success', t('users.actions.resetPassword.success'));
          } catch (error: unknown) {
            pushToast('error', (error as Error).message);
          }
        },
      });
    }

    if (hasPermission(PERMISSIONS.USER_MANAGEMENT_TOGGLE_STATUS)) {
      const nextEnabled = user.status !== 'ACTIVE';
      menu.push({
        key: 'toggle-status',
        label:
          user.status === 'ACTIVE'
            ? t('users.actions.toggleStatus.disable')
            : t('users.actions.toggleStatus.enable'),
        onClick: async () => {
          try {
            const result = await toggleStatusMutation.mutateAsync({
              userId: user.id,
              enabled: nextEnabled,
            });
            const auditId = result?.auditId;
            pushToast(
              'success',
              t('users.actions.status.success'),
              auditId
                ? {
                    description: t('users.notifications.activation.description', { auditId }),
                    meta: {
                      auditId,
                      route: '/audit/events',
                      action: 'users.toggle_activation',
                      userId: user.id,
                      targetStatus: nextEnabled ? 'ACTIVE' : 'INACTIVE',
                    },
                    openInCenter: true,
                  }
                : undefined,
            );
          } catch (error: unknown) {
            pushToast('error', (error as Error).message);
          }
        },
      });
    }

    if (canRowImpersonate) {
      // Codex 019e2022 follow-up — row-level quick action mirrors
      // ImpersonateAction's contract: SuperAdmin only, not self, not
      // during an active session. Opens an inline reason modal so the
      // operator does not have to navigate into UserDetailDrawer first.
      menu.push({
        key: 'impersonate',
        label: t('users.actions.impersonate.menu') || 'Hesaba Geç',
        onClick: () => {
          setImpersonateOpen(true);
          setImpersonateReason('');
          setImpersonateError(null);
        },
      });
    }

    if (callerIsSuperAdmin) {
      menu.push({
        key: 'grant-super-admin',
        label: t('users.actions.superAdmin.grant'),
        onClick: async () => {
          try {
            const result = await grantSuperAdminMutation.mutateAsync({ userId: user.id });
            const successMsg = result.alreadyHadGrant
              ? t('users.actions.superAdmin.grant.alreadySuccess')
              : t('users.actions.superAdmin.grant.success');
            pushToast(
              'success',
              successMsg,
              result.bootstrapWarning
                ? { description: t('users.actions.superAdmin.bootstrapWarning') }
                : undefined,
            );
          } catch (error: unknown) {
            pushToast('error', (error as Error).message);
          }
        },
      });
      menu.push({
        key: 'revoke-super-admin',
        label: t('users.actions.superAdmin.revoke'),
        onClick: async () => {
          try {
            const result = await revokeSuperAdminMutation.mutateAsync({ userId: user.id });
            const successMsg = result.hadActiveGrant
              ? t('users.actions.superAdmin.revoke.success')
              : t('users.actions.superAdmin.revoke.alreadySuccess');
            pushToast(
              'success',
              successMsg,
              result.bootstrapWarning
                ? { description: t('users.actions.superAdmin.bootstrapWarning') }
                : undefined,
            );
          } catch (error: unknown) {
            pushToast('error', (error as Error).message);
          }
        },
      });
    }

    return menu;
  }, [
    hasPermission,
    onSelect,
    resetPasswordMutation,
    toggleStatusMutation,
    grantSuperAdminMutation,
    revokeSuperAdminMutation,
    callerIsSuperAdmin,
    canRowImpersonate,
    user.email,
    user.id,
    user.status,
    t,
  ]);

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        type="button"
        className="rounded-md border border-border-subtle bg-surface-default px-3 py-1 text-xs font-semibold text-text-secondary shadow-xs hover:bg-surface-muted"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((prev) => {
            const next = !prev;
            if (next && containerRef.current && typeof window !== 'undefined') {
              const rect = containerRef.current.getBoundingClientRect();
              setMenuPosition({
                top: rect.bottom + window.scrollY + 4,
                left: rect.right + window.scrollX - 192,
              });
            }
            return next;
          });
        }}
      >
        {t('users.actions.menuLabel')}
      </button>
      {open &&
        menuPosition &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed z-50 w-48 rounded-2xl border border-border-subtle bg-surface-default p-1 text-sm shadow-xl"
            style={{ top: menuPosition.top, left: menuPosition.left }}
          >
            {items.map((item) => (
              <button
                key={item.key}
                type="button"
                className="flex w-full items-center rounded-xl px-3 py-2 text-left text-text-secondary hover:bg-surface-muted"
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
      {impersonateOpen && typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => {
              if (!impersonateSubmitting) {
                closeImpersonateModal();
              }
            }}
            data-testid="row-impersonate-modal"
          >
            <div
              className="w-full max-w-md rounded-2xl border border-state-warning-border bg-surface-default p-4 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <p className="font-semibold text-state-warning-text">
                Impersonate {user.fullName || user.email}
              </p>
              <p className="mt-1 text-xs text-state-warning-text">
                Bu işlem audit log&apos;una kaydedilir. Devam etmek için sebep (min 10 karakter) gerekli;
                hedef kullanıcı sistem tarafından otomatik çözümlenir.
              </p>
              <label className="mt-3 block">
                <span className="block text-xs font-semibold uppercase tracking-wide text-state-warning-text">
                  Sebep (min 10 karakter)
                </span>
                <textarea
                  value={impersonateReason}
                  onChange={(e) => setImpersonateReason(e.target.value)}
                  rows={3}
                  minLength={10}
                  maxLength={500}
                  className="mt-1 w-full rounded-md border border-state-warning-border bg-surface-default p-2 text-sm"
                  data-testid="row-impersonate-reason"
                  autoFocus
                />
              </label>
              {impersonateError ? (
                <p
                  className="mt-2 text-xs text-state-danger-text"
                  data-testid="row-impersonate-error"
                >
                  {impersonateError}
                </p>
              ) : null}
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeImpersonateModal}
                  disabled={impersonateSubmitting}
                  className="rounded-xl border border-border-subtle px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-surface-muted disabled:opacity-60"
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  onClick={submitImpersonate}
                  disabled={
                    impersonateSubmitting || impersonateReason.trim().length < 10
                  }
                  className="rounded-xl bg-state-warning-text px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  data-testid="row-impersonate-submit-btn"
                >
                  {impersonateSubmitting ? 'Başlatılıyor…' : 'Impersonate başlat'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default UserActions;
