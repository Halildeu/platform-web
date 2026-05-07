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
