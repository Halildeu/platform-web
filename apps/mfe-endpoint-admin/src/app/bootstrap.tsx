// WEB-014D perf follow-up: AG Grid module registration is now performed
// inside the `EndpointDevicesPage` lazy route wrapper (see
// `./router/EndpointAdminRouter.tsx`). Standalone dev runs (port 3009)
// reach `/devices` through the same router, so the setup still fires
// before the grid renders — without paying for every other route's
// cold path the way an eager bootstrap import did.
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
