import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { logUnexpected } from '@mfe/shared-http';
import RolesPage from '../pages/roles/RolesPage.ui';

/**
 * AccessApp — MF remote entry component.
 *
 * Wraps AccessPage with its own QueryClientProvider because MF dev mode
 * runs each remote in a separate Vite server → React context from shell's
 * @tanstack/react-query instance is not accessible here.
 *
 * Uses shell's QueryClient via window bridge if available (production),
 * otherwise creates a standalone instance (dev / independent mode).
 */

class AccessAppErrorBoundary extends React.Component<
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
    // ErrorBoundary catch — gerçek bug sinyali, prod'da telemetry'e
    logUnexpected('AccessApp.errorBoundary', error, {
      componentStack: info.componentStack ?? undefined,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24 }}>
          <h2>Erişim modülü yüklenirken beklenmeyen bir hata oluştu.</h2>
          <p>Lütfen sayfayı yenileyin. Sorun devam ederse sistem yöneticinizle iletişime geçin.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

const AccessApp: React.FC = () => {
  const shellQueryClient = (
    typeof window !== 'undefined'
      ? (window as Record<string, unknown>).__SHELL_QUERY_CLIENT__
      : undefined
  ) as QueryClient | undefined;

  const queryClientRef = React.useRef<QueryClient>();
  if (!shellQueryClient && !queryClientRef.current) {
    queryClientRef.current = new QueryClient({
      defaultOptions: {
        queries: { staleTime: 5 * 60 * 1000, retry: 1 },
      },
    });
  }
  const effectiveQueryClient = shellQueryClient ?? queryClientRef.current!;

  return (
    <QueryClientProvider client={effectiveQueryClient}>
      <AccessAppErrorBoundary>
        <Routes>
          <Route path="roles" element={<RolesPage />} />
          <Route path="*" element={<Navigate to="roles" replace />} />
        </Routes>
      </AccessAppErrorBoundary>
    </QueryClientProvider>
  );
};

export default AccessApp;
