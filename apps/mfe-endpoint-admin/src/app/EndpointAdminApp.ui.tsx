// WEB-014D perf follow-up (Codex 019e707e iter-2 must-fix #2 absorb):
// AG Grid module registration moved out of the federation EXPOSE entry
// and into the `EndpointDevicesPage` lazy route wrapper (see
// `./router/EndpointAdminRouter.tsx`). The previous eager import pulled
// ag-grid-community + ag-grid-enterprise + setup into the cold graph
// for every endpoint-admin sub-route, even ones that never render a
// grid. With route-level lazy loading the setup runs before the
// devices page's first render via `Promise.all([setup, page])` and the
// other routes pay zero AG Grid cost.
import React from 'react';
import { Provider as ReduxProvider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { logUnexpected } from '@mfe/shared-http';
import EndpointAdminRouter from './router/EndpointAdminRouter';
import EndpointAdminLayout from './layout/EndpointAdminLayout';
import { endpointAdminApi } from './services/endpointAdminApi';
import { endpointAdminReduxContext } from './services/redux-context';

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
 * Codex iter-3 absorb (thread 019e6068): bind both the MFE-local
 * `<ReduxProvider>` and every generated RTK Query hook to a single
 * locally-owned `React.createContext` instance. The default
 * `ReactReduxContext` becomes irrelevant — even when the AG Grid +
 * ag-charts chain pulls in a second react-redux instance with its
 * own internal context, our subscription chain stays intact because
 * Provider and hooks share the explicit `endpointAdminReduxContext`
 * import. Previous source-order / Provider-mirror attempts did not
 * change runtime behavior because (a) the bundler reorders chunks
 * regardless of source line order, and (b) `mfe-users` works only
 * because it uses TanStack Query, not RTK Query — `mfe-endpoint-admin`
 * cannot rely on the same survival pattern.
 *
 * QueryClient bridge from the shell stays (mirrors mfe-users +
 * mfe-access window-bridge convention).
 */
const EndpointAdminAppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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

  const storeRef = React.useRef<ReturnType<typeof createEndpointAdminStore>>();
  if (!storeRef.current) {
    storeRef.current = createEndpointAdminStore();
  }

  return (
    <ReduxProvider store={storeRef.current} context={endpointAdminReduxContext}>
      <QueryClientProvider client={effectiveQueryClient}>{children}</QueryClientProvider>
    </ReduxProvider>
  );
};

export const EndpointAdminApp: React.FC = () => {
  return (
    <EndpointAdminAppErrorBoundary>
      <EndpointAdminAppProviders>
        <EndpointAdminLayout>
          <EndpointAdminRouter />
        </EndpointAdminLayout>
      </EndpointAdminAppProviders>
    </EndpointAdminAppErrorBoundary>
  );
};

export default EndpointAdminApp;
