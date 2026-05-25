// Faz 22.2 — AG Grid module registration at the federation EXPOSE entry.
// Shell host imports `mfe_endpoint_admin/EndpointAdminApp` (this file),
// NOT bootstrap.tsx — so the bootstrap-level setup import only covers
// standalone open of the MFE. When loaded as a remote into the shell,
// the shell host bundle is responsible for registering AG Grid modules
// via this side-effect import. Mirror of `apps/mfe-users/src/app/UsersApp.ui.tsx`.
import '@mfe/design-system/advanced/data-grid/setup';
import React from 'react';
import { Provider as ReduxProvider, ReactReduxContext } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { logUnexpected } from '@mfe/shared-http';
import EndpointAdminRouter from './router/EndpointAdminRouter';
import { endpointAdminApi } from './services/endpointAdminApi';

/**
 * Codex iter-1 PARTIAL absorb (must-fix #1): MFE always owns its own
 * RTK store + middleware. Daha önceki `ReactReduxContext.Consumer`
 * dual-mount yaklaşımı yanıltıcıydı — shell store'u
 * (`apps/mfe-shell/src/app/store/store.ts`) `endpointAdminApi.reducer`
 * veya middleware barındırmıyor, dolayısıyla shell altında
 * `useGetAgentStatusQuery()` reducer state ve middleware bulamazdı.
 *
 * İzole local store + nested `<ReduxProvider>` model'i Redux'ın
 * desteklediği pattern: `useSelector`/`useDispatch` en yakın
 * Provider'a bağlanır. Shell'in `auth` state'i kullanılmıyor (auth
 * token shared-http resolver üzerinden bridge'leniyor — bkz.
 * `endpointAdminApi.ts` prepareHeaders).
 */
const createEndpointAdminStore = () =>
  configureStore({
    reducer: {
      [endpointAdminApi.reducerPath]: endpointAdminApi.reducer,
    },
    middleware: (getDefault) => getDefault().concat(endpointAdminApi.middleware),
  });

class EndpointAdminAppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }
  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    logUnexpected('EndpointAdminApp.errorBoundary', error, {
      componentStack: info.componentStack ?? undefined,
    });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24 }}>
          <h2>Uç birim yönetimi modülü yüklenirken beklenmeyen bir hata oluştu.</h2>
          <p>Lütfen sayfayı yenileyin. Sorun devam ederse sistem yöneticinizle iletişime geçin.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Codex iter-2 absorb (post-#660 regression): mirror the `mfe-users`
 * `UsersAppProviders` pattern exactly — `useRef` for store identity,
 * `useContext(ReactReduxContext)` to honor an outer Redux Provider when
 * one is genuinely present, and only wrap with our own Provider when
 * the host context isn't already in scope. The previous `useMemo`
 * variant lost its store ref under the new ag-grid setup import +
 * StrictMode double-mount combination, leaving the page subscribed to
 * an empty store ↔ data lived in a sibling store → `isLoading` stuck
 * true forever (live testai smoke 2026-05-25). The `useRef` value
 * persists across renders + StrictMode double-mount; the outer-
 * context check matches the working `mfe-users` shape so we stay
 * trace-compatible with the rest of the monorepo's MFE conventions.
 */
const EndpointAdminAppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const existingReduxContext = React.useContext(ReactReduxContext);

  // Shell's QueryClient is shared via window bridge because
  // @tanstack/react-query is resolved via alias in shell (bypassing MF
  // loadShare), so React context from shell's instance is not accessible
  // here. Window bridge is the safe path (mirror of mfe-users / mfe-access).
  const shellQueryClient = (
    typeof window !== 'undefined'
      ? (window as Record<string, unknown>).__SHELL_QUERY_CLIENT__
      : undefined
  ) as QueryClient | undefined;

  const queryClientRef = React.useRef<QueryClient>();
  if (!shellQueryClient && !queryClientRef.current) {
    queryClientRef.current = new QueryClient({
      defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
    });
  }
  const effectiveQueryClient = shellQueryClient ?? queryClientRef.current!;

  // Codex iter-1 P2 absorb (thread 019e6068): outer context truthiness
  // alone isn't a safe reuse signal — the shell store does NOT include
  // `endpointAdminApi.reducer`, so a future singleton-share fix that
  // makes the cross-bundle context visible to this MFE would land us
  // in a "shared context but missing slice" trap and resurrect the
  // exact stuck-loading symptom this hotfix is meant to close. We only
  // reuse the outer Provider if its store actually carries our
  // `endpointAdminApi.reducerPath` slice; otherwise we wrap with our
  // own local store. Today both branches behave identically (the
  // outer context is always invisible due to cross-bundle isolation),
  // but the check guards the day singleton resolution gets fixed.
  const outerStoreHasOurSlice =
    !!existingReduxContext &&
    typeof existingReduxContext.store?.getState === 'function' &&
    (existingReduxContext.store.getState() as Record<string, unknown>)[
      endpointAdminApi.reducerPath
    ] !== undefined;

  const shouldOwnStore = !existingReduxContext || !outerStoreHasOurSlice;

  const storeRef = React.useRef<ReturnType<typeof createEndpointAdminStore>>();
  if (shouldOwnStore && !storeRef.current) {
    storeRef.current = createEndpointAdminStore();
  }

  let content = children;

  content = <QueryClientProvider client={effectiveQueryClient}>{content}</QueryClientProvider>;

  if (shouldOwnStore && storeRef.current) {
    content = <ReduxProvider store={storeRef.current}>{content}</ReduxProvider>;
  }

  return <>{content}</>;
};

export const EndpointAdminApp: React.FC = () => {
  return (
    <EndpointAdminAppErrorBoundary>
      <EndpointAdminAppProviders>
        <EndpointAdminRouter />
      </EndpointAdminAppProviders>
    </EndpointAdminAppErrorBoundary>
  );
};

export default EndpointAdminApp;
