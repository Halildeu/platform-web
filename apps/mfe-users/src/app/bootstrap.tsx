import { createRoot } from 'react-dom/client';
import { setupAgGridLicense } from '@mfe/design-system';
import UsersApp from './UsersApp.ui';
import { configureShellServices } from './services/shell-services';

// AG Grid Enterprise license — module federation singleton sharing'e
// güvenmek yetmiyor; her AG Grid kullanan MFE bootstrap'inde license
// setter çağrılmalı (mfe-reporting bug 2026-04-30 tespiti).
setupAgGridLicense();

configureShellServices({});

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<UsersApp />);
}
