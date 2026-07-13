import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: 1 } },
});

async function bootstrap() {
  // The shell remains the canonical style provider for federated consumers.
  // Only the explicit local acceptance entry loads the same shell stylesheet.
  if (import.meta.env.VITE_MFE_INTERVIEW_EVIDENCE_STANDALONE_ACCEPTANCE === '1') {
    await import('../../mfe-shell/src/index.css');
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
