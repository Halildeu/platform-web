// Faz 22.2 — AG Grid module registration for standalone dev runs (port
// 3009). When loaded under the shell via Module Federation the
// EndpointAdminApp.ui.tsx import covers registration; this entry only
// fires for `pnpm --filter mfe-endpoint-admin start`.
import '@mfe/design-system/advanced/data-grid/setup';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import EndpointAdminApp from './EndpointAdminApp.ui';

/**
 * Standalone development bootstrap (port 3009). When mounted under the
 * shell host via Module Federation, the shell renders `<EndpointAdminApp/>`
 * directly inside its own router; this entrypoint is only used for `pnpm
 * --filter mfe-endpoint-admin start` smoke runs.
 */
const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <BrowserRouter>
        <EndpointAdminApp />
      </BrowserRouter>
    </React.StrictMode>,
  );
}
