import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { UserSummary } from '@mfe/shared-types';
import { useUserMutations } from '../../../features/user-management/model/use-users-query.model';
import { useUsersI18n } from '../../../i18n/useUsersI18n';
import { pushToast } from '../../../shared/notifications';
import { getShellServices, type ShellModuleLevel } from '../../../app/services/shell-services';

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
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const { t } = useUsersI18n();

  // Codex 019e2022 + 019ea409 — EVERY authz gate in this menu (impersonate
  // AND the user-management mutations) reads the shell auth singleton, NOT
  // the local `@mfe/auth` usePermissions() context. That context degrades
  // to its no-op default (`isSuperAdmin: () => false`,
  // `getModuleLevel: () => 'NONE'`) in mfe-users when the Vite alias
  // bypasses MF shared-singleton registration (documented in
  // app/services/shell-services.ts) — which previously hid
  // reset/toggle/grant/revoke even for a super-admin.
  const shellAuth = useMemo(() => {
    try {
      return getShellServices().auth;
    } catch {
      return null;
    }
  }, []);

  // Codex 019ea409 — recompute the gates on a shell auth TOKEN/EPOCH change
  // (login/logout, broker token swap, impersonation enter/exit) instead of
  // freezing them at mount. onTokenChange fires immediately with the current
  // token and again on every swap/epoch bump; the state bump forces a
  // re-render so the fresh getter reads below pick up the new authz. Note:
  // this tracks token/epoch, not an authzSnapshot-only/module-level delta —
  // but opening the menu re-renders and re-reads anyway, and the backend
  // stays authoritative, so a live mid-open revocation is not a UI concern.
  const [, bumpAuthTick] = useState(0);
  useEffect(() => {
    if (!shellAuth?.onTokenChange) return undefined;
    try {
      return shellAuth.onTokenChange(() => bumpAuthTick((n) => n + 1));
    } catch {
      return undefined;
    }
  }, [shellAuth]);

  // Fresh reads each render (cheap getter calls) — never frozen. Staleness
  // is avoided by the onTokenChange-driven re-render above; all reads are
  // wrapped fail-closed so a throwing/absent getter degrades to no access.
  const shellSuperAdmin = ((): boolean => {
    try {
      return Boolean(shellAuth?.isSuperAdmin?.());
    } catch {
      return false;
    }
  })();
  const shellImpersonating = ((): boolean => {
    try {
      return Boolean(shellAuth?.isImpersonating?.());
    } catch {
      return false;
    }
  })();
  // Destructive user-management actions require MANAGE specifically (not any
  // VIEW); reset-password / deactivate are mutations. getModuleLevel is
  // optional-chained so an older shell without the method fails closed while
  // the super-admin path still works via isSuperAdmin().
  const userManagementLevel: ShellModuleLevel = ((): ShellModuleLevel => {
    try {
      return shellAuth?.getModuleLevel?.('USER_MANAGEMENT') ?? 'NONE';
    } catch {
      return 'NONE';
    }
  })();
  const callerSubscriberId = ((): string | null => {
    try {
      const profile = shellAuth?.getUser?.() as { subscriberId?: string | number } | null;
      const raw = profile?.subscriberId;
      return raw != null ? String(raw) : null;
    } catch {
      return null;
    }
  })();
  const isSelfTarget = callerSubscriberId != null && callerSubscriberId === String(user.id);
  const canRowImpersonate = shellSuperAdmin && !shellImpersonating && !isSelfTarget;
  // Codex 019ea409 — super-admin OR module-manager (USER_MANAGEMENT=MANAGE)
  // may reset passwords / toggle status. Grant/revoke super-admin stays
  // super-admin only (mirrors the backend 403 on non-super-admins).
  const canManageUsers = shellSuperAdmin || userManagementLevel === 'MANAGE';
  // Codex 019dda1c iter-33: super-admin grant/revoke items only visible to
  // current super-admins (now sourced from the shell singleton, not the
  // possibly-empty local PermissionContext).
  const callerIsSuperAdmin = shellSuperAdmin;

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

    if (canManageUsers) {
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

    if (canManageUsers) {
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
        // Codex 019ea409 — the `|| 'Hesaba Geç'` fallback was dead code:
        // translateSync returns the raw key string (truthy) on a miss, so
        // `||` never fired. The key now exists in all locale dicts.
        label: t('users.actions.impersonate.menu'),
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
    canManageUsers,
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
      {impersonateOpen &&
        typeof document !== 'undefined' &&
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
                Bu işlem audit log&apos;una kaydedilir. Devam etmek için sebep (min 10 karakter)
                gerekli; hedef kullanıcı sistem tarafından otomatik çözümlenir.
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
                  disabled={impersonateSubmitting || impersonateReason.trim().length < 10}
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
