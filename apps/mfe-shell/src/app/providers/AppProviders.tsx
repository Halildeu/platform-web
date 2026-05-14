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

/**
 * Codex 019e27bf — P1 shell-test-infra fix. The previous gate
 * (`process.env.NODE_ENV !== 'production'`) was brittle because Vite's
 * client bundle does not unconditionally inline `process.env`, so the
 * Playwright dev-mode + production-preview harness both observed
 * `window.__shellStore` as undefined ("No store surface").
 *
 * Read precedence: `import.meta.env` (Vite-native, set at build time) →
 * guarded `process.env` (some hosts/webpack DefinePlugin) → runtime
 * `window.__env__` / `window.__ENV__` (set by `installFakeAuthEnv` in
 * Playwright fixtures via addInitScript before the bundle boots).
 *
 * The shell store is exposed when ANY of these conditions hold:
 *   - dev build (`import.meta.env.DEV` === true OR resolved NODE_ENV !== 'production')
 *   - VITE_AUTH_CONTRACT_E2E flag set (the existing probe surface flag)
 *   - permitAll fake-auth shell (VITE_AUTH_MODE=permitAll + VITE_ENABLE_FAKE_AUTH=1)
 *
 * Production bundles without any of these flags continue to hide the store.
 */
const readShellTestEnv = (key: string): string => {
  try {
    const importMetaEnv = (import.meta as { env?: Record<string, string | undefined> }).env;
    const fromImportMeta = importMetaEnv?.[key];
    if (typeof fromImportMeta === 'string' && fromImportMeta.length > 0) {
      return fromImportMeta;
    }
  } catch {
    /* import.meta unavailable in some compile targets */
  }
  try {
    if (typeof process !== 'undefined' && typeof process.env?.[key] === 'string') {
      return process.env[key] as string;
    }
  } catch {
    /* process undefined in browser bundle — fall through */
  }
  if (typeof window !== 'undefined') {
    const win = window as Window & {
      __env__?: Record<string, string | undefined>;
      __ENV__?: Record<string, string | undefined>;
    };
    const candidate = win.__env__?.[key] ?? win.__ENV__?.[key];
    if (typeof candidate === 'string') {
      return candidate;
    }
  }
  return '';
};

const isShellStoreExposureAllowed = (): boolean => {
  try {
    // Vite-native dev gate.
    const importMetaEnv = (import.meta as { env?: { DEV?: boolean; MODE?: string } }).env;
    if (importMetaEnv?.DEV === true) return true;
    if (importMetaEnv?.MODE && importMetaEnv.MODE !== 'production') return true;
  } catch {
    /* ignore */
  }
  if (readShellTestEnv('NODE_ENV') && readShellTestEnv('NODE_ENV') !== 'production') {
    return true;
  }
  const contractE2e = readShellTestEnv('VITE_AUTH_CONTRACT_E2E').toLowerCase();
  if (contractE2e === '1' || contractE2e === 'true') return true;
  const nextPublicContractE2e = readShellTestEnv('NEXT_PUBLIC_AUTH_CONTRACT_E2E').toLowerCase();
  if (nextPublicContractE2e === '1' || nextPublicContractE2e === 'true') return true;
  const authMode = readShellTestEnv('VITE_AUTH_MODE').toLowerCase();
  const fakeAuthEnabled = readShellTestEnv('VITE_ENABLE_FAKE_AUTH');
  if (authMode === 'permitall' && (fakeAuthEnabled === '1' || fakeAuthEnabled.toLowerCase() === 'true')) {
    return true;
  }
  return false;
};

export const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (typeof window !== 'undefined' && isShellStoreExposureAllowed()) {
    window.__shellStore = store;
  }
  // Phase 2 PR-E2E-6: install test-only window probe surface (idempotent;
  // no-op when VITE_AUTH_CONTRACT_E2E is unset). The probe helper now
  // resolves the flag through the same safe reader to match the shell
  // store gate above (Codex 019e27bf).
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
