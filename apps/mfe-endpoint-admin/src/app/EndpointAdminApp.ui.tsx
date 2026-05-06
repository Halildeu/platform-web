import React from 'react';
import { Provider as ReduxProvider, ReactReduxContext } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { logUnexpected } from '@mfe/shared-http';
import EndpointAdminRouter from './router/EndpointAdminRouter';
import { endpointAdminApi } from './services/endpointAdminApi';

/**
 * Standalone Redux store (used when the MFE runs without the shell).
 * When the shell mounts us under its own `<Provider>`, we detect the
 * existing context and reuse it via `ReactReduxContext.Consumer`.
 */
const createStandaloneStore = () =>
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
  return (
    <EndpointAdminAppErrorBoundary>
      <ReactReduxContext.Consumer>
        {(ctx) => {
          if (ctx) {
            // Shell-mounted: reuse host store; the host's middleware
            // chain must include `endpointAdminApi.middleware`. This is
            // wired by the shell's MF service-injection step.
            return (
              <QueryClientProvider client={queryClient}>
                <EndpointAdminRouter />
              </QueryClientProvider>
            );
          }
          // Standalone dev (port 3009): own store + provider.
          const store = createStandaloneStore();
          return (
            <ReduxProvider store={store}>
              <QueryClientProvider client={queryClient}>
                <EndpointAdminRouter />
              </QueryClientProvider>
            </ReduxProvider>
          );
        }}
      </ReactReduxContext.Consumer>
    </EndpointAdminAppErrorBoundary>
  );
};

export default EndpointAdminApp;
