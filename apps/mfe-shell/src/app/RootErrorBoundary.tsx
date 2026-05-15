/**
 * Codex 019e27bf fresh-context audit follow-up — defensive hardening
 * for the React root mount layer.
 *
 * <p>Run 25881861854 diagnostic dump pinpointed that the shell bundle
 * loads (`readyState: "complete"`, env vars set) but
 * `document.body.innerText` stays empty. That signals an unhandled
 * exception in the React tree (AppProviders / bootstrap / Module
 * Federation remote preload) that left the root unrendered. Without
 * an error boundary at the root, Playwright + operator devtools see
 * a blank page and have to dig through source maps to find the
 * underlying throw.
 *
 * <p>This component wraps {@link ShellApp} so:
 *   1. The user/operator sees a minimal fallback DOM instead of a blank
 *      body — body is never empty.
 *   2. The error message + component stack is captured in
 *      `window.__shellRootError` so Playwright's diagnostic dump and
 *      operator devtools both find the actual signal in one place.
 *   3. Console output preserves the stack so source maps resolve it.
 *
 * <p>Production-safe: only affects the unhappy path (caught exception).
 * On the happy path the boundary is a no-op pass-through wrapper.
 */

import React from 'react';

interface RootErrorBoundaryState {
  error: Error | null;
  componentStack: string | null;
}

declare global {
  interface Window {
    __shellRootError?: {
      message: string;
      stack?: string;
      componentStack?: string | null;
      capturedAt: string;
    };
  }
}

export class RootErrorBoundary extends React.Component<
  React.PropsWithChildren<unknown>,
  RootErrorBoundaryState
> {
  state: RootErrorBoundaryState = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): RootErrorBoundaryState {
    return { error, componentStack: null };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    this.setState({ componentStack: info.componentStack ?? null });
    try {
      // eslint-disable-next-line no-console
      console.error('[shell-root] React root crashed:', error, info.componentStack);
    } catch {
      /* console may be silenced in prod */
    }
    if (typeof window !== 'undefined') {
      window.__shellRootError = {
        message: error.message,
        stack: error.stack,
        componentStack: info.componentStack ?? null,
        capturedAt: new Date().toISOString(),
      };
    }
  }

  render(): React.ReactNode {
    const { error, componentStack } = this.state;
    if (!error) {
      return this.props.children;
    }
    // Minimal fallback DOM — body is never empty. Operator can copy
    // text + open `window.__shellRootError` for the full stack. Keep
    // styling inline so the boundary works even when CSS chunks failed.
    return (
      <div
        data-testid="shell-root-error-boundary"
        style={{
          padding: '24px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          color: '#1f2937',
          background: '#fef2f2',
          minHeight: '100vh',
        }}
      >
        <h1 style={{ fontSize: '18px', fontWeight: 600, color: '#b91c1c' }}>
          Shell başlatma hatası
        </h1>
        <p style={{ marginTop: '8px', fontSize: '14px' }}>
          Uygulama başlatılırken bir hata oluştu. Tarayıcı devtools
          konsolunda tam stack trace görünür, ayrıca
          <code style={{ marginLeft: '4px', background: '#e5e7eb', padding: '2px 4px' }}>
            window.__shellRootError
          </code>{' '}
          objesinden de erişebilirsiniz.
        </p>
        <pre
          data-testid="shell-root-error-message"
          style={{
            marginTop: '16px',
            padding: '12px',
            background: '#fff',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            fontSize: '12px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {error.message}
          {componentStack ? `\n\nComponent stack:\n${componentStack}` : ''}
        </pre>
      </div>
    );
  }
}

export default RootErrorBoundary;
