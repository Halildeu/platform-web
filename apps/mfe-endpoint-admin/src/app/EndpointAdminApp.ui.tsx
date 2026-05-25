// Faz 22.2 — AG Grid module registration at the federation EXPOSE entry.
// Shell host imports `mfe_endpoint_admin/EndpointAdminApp` (this file),
// NOT bootstrap.tsx — so the bootstrap-level setup import only covers
// standalone open of the MFE. When loaded as a remote into the shell,
// the shell host bundle is responsible for registering AG Grid modules
// via this side-effect import. Mirror of `apps/mfe-users/src/app/UsersApp.ui.tsx`.
import '@mfe/design-system/advanced/data-grid/setup';
import React, { useMemo } from 'react';
import { Provider as ReduxProvider } from 'react-redux';
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

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

export const EndpointAdminApp: React.FC = () => {
  // useMemo so HMR + StrictMode double-mount don't recreate the store
  // (which would reset RTK Query cache between mounts).
  const store = useMemo(() => createEndpointAdminStore(), []);
  return (
    <EndpointAdminAppErrorBoundary>
      <ReduxProvider store={store}>
        <QueryClientProvider client={queryClient}>
          <EndpointAdminRouter />
        </QueryClientProvider>
      </ReduxProvider>
    </EndpointAdminAppErrorBoundary>
  );
};

export default EndpointAdminApp;
