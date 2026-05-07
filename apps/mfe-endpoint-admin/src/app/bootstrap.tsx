import React from 'react';
import { createRoot } from 'react-dom/client';
import EndpointAdminApp from './EndpointAdminApp.ui';
import { configureShellServices } from './services/shell-services';

// Standalone dev mode (port 3009): no shell host present, so we
// register a noop shell-services bridge before mounting the app.
configureShellServices({});

const container = document.getElementById('root');

if (!container) {
  throw new Error('[mfe-endpoint-admin] root elementi bulunamadı.');
}

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <EndpointAdminApp />
  </React.StrictMode>,
);
