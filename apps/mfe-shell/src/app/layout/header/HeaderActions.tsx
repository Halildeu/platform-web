import React, { useState, useCallback } from 'react';
import { LogIn } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAppSelector } from '../../store/store.hooks';
import { isPermitAllMode, buildAppRedirectUri } from '../../auth/auth-config';
import { useShellCommonI18n } from '../../i18n';
import NotificationCenter from '../NotificationCenter';
import { ThemeRuntimePanelButton } from '../ThemeRuntimePanelButton';
import LoginPopover from '../LoginPopover';
import { LanguageSelector } from './LanguageSelector';
import { UserMenuDropdown } from './UserMenuDropdown';

/* ------------------------------------------------------------------ */
/*  HeaderActions — Right-side action buttons container                 */
/*                                                                     */
/*  Three auth states:                                                 */
/*  1. Authenticated — full actions + user menu                        */
/*  2. PermitAll — badge "no login required"                           */
/*  3. Unauthenticated — login button (Keycloak + LoginPopover)        */
/* ------------------------------------------------------------------ */

const REMOTE_VIEW_ROUTE =
  /^\/endpoint-admin\/remote-access\/sessions\/[A-Za-z0-9._:-]{1,160}\/view$/;

export function isRemoteViewRoute(pathname: string): boolean {
  return REMOTE_VIEW_ROUTE.test(pathname);
}

export const HeaderActions: React.FC = () => {
  const { token } = useAppSelector((s) => s.auth);
  const { pathname } = useLocation();
  const { t } = useShellCommonI18n();
  const permitAllMode = isPermitAllMode();
  const [loginOpen, setLoginOpen] = useState(false);
  const suppressNotifications = isRemoteViewRoute(pathname);

  const handleLogin = useCallback(() => {
    setLoginOpen(false);
    const currentPath =
      `${window.location.pathname}${window.location.search}${window.location.hash}` || '/';
    window.location.href = buildAppRedirectUri(
      `/login?redirect=${encodeURIComponent(currentPath)}`,
    );
  }, []);

  return (
    <div className="flex shrink-0 items-center gap-1">
      {/* Notification + Language + Theme — always visible when authenticated */}
      {token && (
        <>
          {!suppressNotifications && (
            <>
              <NotificationCenter />
              <div className="mx-0.5 h-5 w-px bg-border-subtle/50" aria-hidden />
            </>
          )}
          <LanguageSelector />
          <ThemeRuntimePanelButton />
          <div className="mx-0.5 h-5 w-px bg-border-subtle/50" aria-hidden />
          <UserMenuDropdown />
        </>
      )}

      {/* PermitAll mode */}
      {!token && permitAllMode && (
        <span className="rounded-lg border border-border-subtle bg-surface-muted px-3 py-1.5 text-xs font-medium text-text-subtle">
          {t('shell.header.permitAllNoLogin')}
        </span>
      )}

      {/* Unauthenticated — login button */}
      {!token && !permitAllMode && (
        <>
          <button
            type="button"
            onClick={handleLogin}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--action-primary)] px-4 py-2 text-xs font-semibold text-[var(--action-primary-text)] shadow-xs transition-opacity duration-150 hover:opacity-90"
          >
            <LogIn className="h-4 w-4" aria-hidden />
            <span>{t('shell.header.loginPanel')}</span>
          </button>
          {loginOpen && (
            <LoginPopover
              onClose={() => setLoginOpen(false)}
              onNavigate={() => {
                setLoginOpen(false);
                window.location.href = '/login';
              }}
            />
          )}
        </>
      )}
    </div>
  );
};
