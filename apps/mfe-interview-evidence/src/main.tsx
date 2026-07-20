import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { configureShellServices } from './shell-services';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: 1 } },
});

async function bootstrap() {
  // The shell remains the canonical style provider for federated consumers.
  // Only the explicit local acceptance entry loads the same shell stylesheet.
  if (import.meta.env.VITE_MFE_INTERVIEW_EVIDENCE_STANDALONE_ACCEPTANCE === '1') {
    await import('../../mfe-shell/src/index.css');
    // CLI Playwright acceptance has no shell host, but still exercises the
    // production HTTP adapter against route-fulfilled responses. Keep this
    // bridge strictly behind the explicit standalone acceptance build flag;
    // federated/runtime auth remains shell-owned.
    configureShellServices({
      auth: {
        getToken: () => null,
        ready: () => Promise.resolve({ ok: true }),
        getEpoch: () => 0,
      },
    });
  }

  ReactDOM.createRoot(document.getElementById('app')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

void bootstrap();
