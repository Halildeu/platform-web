import React from 'react';
import { Provider } from 'react-redux';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
// PERF-INIT-V2 PR-B5a: consumer-side subpath migration. ToastProvider
// lives in the components barrel; this aligns the call site for the
// future B5d subpath share-scope split. Under the current root shared
// package topology the loadShare wrapper is unchanged.
import { ToastProvider } from '@mfe/design-system/components';
import { PermissionProvider } from '@mfe/auth';
import type { AuthzMeResponse } from '@mfe/auth';
import { store } from '../store/store';
import { ThemeProvider } from '../theme/theme-context.provider';
import { I18nProvider, i18n } from '../i18n';
import { queryClient, shouldShowQueryDevtools } from '../config/query-config';
import { AuthBootstrapper } from './AuthBootstrapper';
import { DownloadProgressListener } from './DownloadProgressListener';
import { ImpersonationExpiredListener } from './ImpersonationExpiredListener';
import { AuthFsmObserver } from '../observability/AuthFsmObserver';
import { AuthDegradedBanner } from '../observability/AuthDegradedBanner';
import { installAuthContractE2eProbe } from '../observability/auth-contract-e2e-probe';
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
      httpGet={api.get}
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
  // Expose the Redux store on `window.__shellStore` in three cases:
  //   1. Dev builds (NODE_ENV !== 'production') — original behaviour.
  //   2. Auth-contract E2E builds (VITE_AUTH_CONTRACT_E2E=1) — re-uses
  //      the existing test-only probe flag for surface coherence.
  //   3. Permit-all + fake-auth shells (Playwright impersonation Faz 1+)
  //      driven by the production `vite preview` CI lane.
  if (typeof window !== 'undefined') {
    const isDev = process.env.NODE_ENV !== 'production';
    const isContractE2e =
      (process.env.VITE_AUTH_CONTRACT_E2E ?? '').toString().toLowerCase() === '1' ||
      (process.env.NEXT_PUBLIC_AUTH_CONTRACT_E2E ?? '').toString().toLowerCase() === '1';
    const isPermitAllFakeAuth =
      (process.env.VITE_AUTH_MODE ?? '').toString().toLowerCase() === 'permitall' &&
      (process.env.VITE_ENABLE_FAKE_AUTH ?? '').toString() === '1';
    if (isDev || isContractE2e || isPermitAllFakeAuth) {
      window.__shellStore = store;
    }
  }
  // Phase 2 PR-E2E-6: install test-only window probe surface (idempotent;
  // no-op when VITE_AUTH_CONTRACT_E2E is unset).
  installAuthContractE2eProbe(store);

  return (
    <Provider store={store}>
      <ThemeProvider>
        <I18nProvider manager={i18n}>
          <QueryClientProvider client={queryClient}>
            <ToastProvider position="top-right" duration={4500} maxVisible={4}>
              <DownloadProgressListener />
              <ImpersonationExpiredListener />
              <AuthFsmObserver />
              <AuthBootstrapper>
                <PermissionProviderWrapper>
                  <AuthDegradedBanner />
                  {children}
                </PermissionProviderWrapper>
              </AuthBootstrapper>
            </ToastProvider>
            {shouldShowQueryDevtools ? <ReactQueryDevtools initialIsOpen={false} /> : null}
          </QueryClientProvider>
        </I18nProvider>
      </ThemeProvider>
    </Provider>
  );
};
