import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@mfe/design-system';
import { useShellCommonI18n } from '../../app/i18n';
import { resolveKeycloakLoginUrl, startKeycloakLogin } from '../../app/auth/keycloakClient';
import { buildAppRedirectUri, isPermitAllMode } from '../../app/auth/auth-config';
import { useAppSelector } from '../../app/store/store.hooks';

/**
 * LoginPage — Güvenli login sayfası
 *
 * OAuth 2.0 Authorization Code + PKCE akışı kullanır.
 * Kullanıcı Keycloak login sayfasına yönlendirilir (custom theme ile).
 * Şifre hiçbir zaman frontend'te işlenmez.
 *
 * Direct Grant (Resource Owner Password) kullanılMAZ:
 * - RFC 9700: "MUST NOT be used"
 * - OAuth 2.1'den kaldırılacak
 * - Keycloak 26'da deprecated
 */
const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useShellCommonI18n();
  const permitAllMode = isPermitAllMode();
  const { token, initialized } = useAppSelector((state) => state.auth);
  const [loginHref, setLoginHref] = useState<string | null>(null);
  const [loginHrefReady, setLoginHrefReady] = useState(false);
  const loginButtonClassName =
    'flex w-full items-center justify-center gap-2 rounded-lg bg-action-primary text-action-primary-text shadow-xs hover:opacity-90';

  const redirectPath = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const redirect = params.get('redirect');
    // 2026-05-10 hotfix (login flow P0 #2): when user lands on
    // /login?redirect=/login (e.g. after a stale bookmark or after the
    // browser history navigates back to /login post-SSO), the previous
    // logic returned '/login' as the post-SSO target. KC then sent the
    // browser BACK to /login with the auth code in the fragment — the
    // onAuthSuccess catch-up handler in AuthBootstrapper recovered, but
    // the user paid an extra round-trip + saw a brief blank page.
    //
    // Filter out '/login' (and any nested /login* path) so the user
    // always lands at '/' after successful SSO. Cross-AI Codex review
    // (thread 019e1336) flagged this as a P0 redirect-loop class bug.
    if (
      !redirect ||
      redirect === '/login' ||
      redirect.startsWith('/login?') ||
      redirect.startsWith('/login/')
    ) {
      return '/';
    }
    return redirect;
  }, [location.search]);

  const redirectUri = useMemo(() => buildAppRedirectUri(redirectPath), [redirectPath]);

  useEffect(() => {
    let active = true;

    if (permitAllMode) {
      setLoginHref(null);
      setLoginHrefReady(true);
      return () => {
        active = false;
      };
    }

    // 2026-05-08 second hotfix: re-introduce `initialized` dependency
    // for the URL build (was removed in first hotfix to recover the
    // no-op button, but caused a race — useEffect ran before
    // keycloak.init() resolved, so keycloak.adapter was undefined and
    // `keycloak.createLoginUrl()` threw `TypeError: Cannot read
    // properties of undefined (reading 'redirectUri')`).
    //
    // Why this is now safe even with re-mount loops: the user-facing
    // button no-op is fixed at handleLogin level — handleLogin no
    // longer has a `!initialized` early return, and falls back to
    // `startKeycloakLogin()` (which awaits init internally) when
    // loginHref is null. So even if useEffect skips because
    // initialized=false, the button still works.
    //
    // The contract here is now:
    //   - kc.init() pending  → loginHref stays null  → button click
    //     falls through to startKeycloakLogin (awaits init, then
    //     builds URL, then redirects)
    //   - kc.init() done     → loginHref resolved   → button click
    //     navigates instantly via the cached URL
    if (!initialized) {
      setLoginHref(null);
      setLoginHrefReady(false);
      return () => {
        active = false;
      };
    }

    setLoginHrefReady(false);
    resolveKeycloakLoginUrl({ redirectUri })
      .then((value) => {
        if (!active) {
          return;
        }
        setLoginHref(value);
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        console.error('[LoginPage] resolveKeycloakLoginUrl() failed:', error);
        setLoginHref(null);
      })
      .finally(() => {
        if (active) {
          setLoginHrefReady(true);
        }
      });

    return () => {
      active = false;
    };
  }, [initialized, permitAllMode, redirectUri]);

  const handleLogin = () => {
    if (permitAllMode) {
      navigate(redirectPath);
      return;
    }
    // 2026-05-08 hotfix: removed `!initialized` short-circuit. The
    // login button MUST work whether or not the auth FSM has finished
    // bootstrapping — bootstrap can hang on silent SSO iframe issues,
    // and a user who clicks "Güvenli Kurumsal Giriş" expects a
    // redirect, not a silent no-op. If `loginHref` is cached use it;
    // otherwise fall back to `startKeycloakLogin()` which builds the
    // URL inline.
    if (loginHref) {
      window.location.assign(loginHref);
      return;
    }
    startKeycloakLogin({ redirectUri }).catch((err) =>
      console.error('[LoginPage] startKeycloakLogin() failed:', err),
    );
  };

  if (initialized && token) {
    return <Navigate to={redirectPath} replace />;
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 py-10">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-border-subtle bg-surface-default p-8 shadow-xs">
          {/* Header */}
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-action-primary text-sm font-bold text-action-primary-text shadow-xs">
              S
            </div>
            <div>
              <h1 className="text-xl font-semibold text-text-primary">
                {t('auth.login.title') || 'Giriş Yap'}
              </h1>
              <p className="text-xs text-text-secondary">
                Kurumsal hesabınızla güvenli oturum açın
              </p>
            </div>
          </div>

          {permitAllMode ? (
            <div className="rounded-xl border border-state-success-border bg-state-success-bg/50 px-4 py-3">
              <p className="text-xs font-medium text-state-success-text">
                Geliştirme modunda oturum açmaya gerek yok.
              </p>
              <Button
                type="button"
                className="mt-3 w-full bg-action-primary text-action-primary-text hover:opacity-90"
                onClick={handleLogin}
              >
                Devam Et
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Güvenli SSO Login */}
              {loginHref ? (
                <a
                  href={loginHref}
                  className={loginButtonClassName}
                  onClick={handleLogin}
                  data-testid="corporate-login-button"
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  Güvenli Kurumsal Giriş
                </a>
              ) : (
                <Button
                  type="button"
                  className={loginButtonClassName}
                  onClick={handleLogin}
                  data-testid="corporate-login-button"
                  // 2026-05-10 hotfix (login flow P0 #1): button no longer
                  // disabled while loginHref resolves. Previously users saw
                  // a no-op "first click" because the button was disabled
                  // during the kc.init() race; the only feedback was tiny
                  // "hazırlanıyor..." text below. handleLogin already falls
                  // back to startKeycloakLogin() (which awaits init
                  // internally) when loginHref is null, so the click is
                  // safe even before bootstrap completes.
                  // Cross-AI Codex review (thread 019e1336) flagged this
                  // as the primary "first-click açılmıyor" bug.
                  disabled={false}
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  Güvenli Kurumsal Giriş
                </Button>
              )}

              {!loginHrefReady ? (
                <p
                  className="text-[11px] text-text-secondary"
                  data-testid="corporate-login-pending"
                >
                  Kurumsal kimlik doğrulama hazırlanıyor...
                </p>
              ) : null}

              {/* Güvenlik bilgisi */}
              <div className="rounded-xl border border-border-subtle bg-surface-muted/50 px-4 py-3">
                <div className="flex items-start gap-2">
                  <svg
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-state-success-text"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                  <div>
                    <p className="text-[11px] font-medium text-text-primary">Güvenli oturum açma</p>
                    <p className="mt-0.5 text-[10px] text-text-tertiary">
                      OAuth 2.0 Authorization Code + PKCE ile korunan kurumsal kimlik doğrulama.
                      Şifreniz yalnızca güvenli kimlik sağlayıcıda işlenir.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
