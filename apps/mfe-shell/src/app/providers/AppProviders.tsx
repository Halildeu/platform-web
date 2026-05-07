import React from 'react';
import { Provider } from 'react-redux';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ToastProvider } from '@mfe/design-system';
import { PermissionProvider } from '@mfe/auth';
import type { AuthzMeResponse } from '@mfe/auth';
import { store } from '../store/store';
import { ThemeProvider } from '../theme/theme-context.provider';
import { I18nProvider, i18n } from '../i18n';
import { queryClient, shouldShowQueryDevtools } from '../config/query-config';
import { AuthBootstrapper } from './AuthBootstrapper';
import { DownloadProgressListener } from './DownloadProgressListener';
import { api } from '@mfe/shared-http';
import { isPermitAllMode } from '../auth/auth-config';
import { useAppSelector } from '../store/store.hooks';

// Side-effect imports — order matters
import '../config/http-config';
import '../config/shell-services-wiring';
import '../config/i18n-config';

const PermissionProviderWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, initialized, authzSnapshot } = useAppSelector((state) => state.auth);
  const permitAllMode = isPermitAllMode();
  const permissionFetchEnabled = permitAllMode || (initialized && Boolean(token));

  return (
    <PermissionProvider
      // Bug fix (2026-05-08): bind axios `this` context. Passing
      // `api.get` directly loses the axios instance binding because
      // `Axios.prototype.get` calls `this.request(...)` internally —
      // when called as `httpGet(url)` with no receiver, `this` is
      // `undefined` (strict mode) and axios's baseURL/interceptors
      // never apply. Live evidence: testai.acik.com nginx access log
      // showed `GET /v1/authz/me 200 3911 (text/html)` (= SPA fallback)
      // where it should be `GET /api/v1/authz/me`. Without the baseURL
      // (`/api`), the request hit the wrong URL, returned index.html,
      // JSON parse failed silently, PermissionProvider got empty
      // permissions, and the FSM redirected back to /login — the
      // root cause of the testai.acik.com login loop reported on
      // 2026-05-08. Wrapping in an arrow function preserves the
      // binding via lexical capture.
      httpGet={(url) => api.get(url)}
      permitAll={permitAllMode}
      enabled={permissionFetchEnabled}
      initialData={authzSnapshot as AuthzMeResponse | null}
    >
      {children}
    </PermissionProvider>
  );
};

/* ------------------------------------------------------------------ */
/*  AppProviders — Composes all shell-level providers                  */
/* ------------------------------------------------------------------ */

declare global {
  interface Window {
    __shellStore?: typeof store;
  }
}

export const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
    window.__shellStore = store;
  }

  return (
    <Provider store={store}>
      <ThemeProvider>
        <I18nProvider manager={i18n}>
          <QueryClientProvider client={queryClient}>
            <ToastProvider position="top-right" duration={4500} maxVisible={4}>
              <DownloadProgressListener />
              <AuthBootstrapper>
                <PermissionProviderWrapper>{children}</PermissionProviderWrapper>
              </AuthBootstrapper>
            </ToastProvider>
            {shouldShowQueryDevtools ? <ReactQueryDevtools initialIsOpen={false} /> : null}
          </QueryClientProvider>
        </I18nProvider>
      </ThemeProvider>
    </Provider>
  );
};
