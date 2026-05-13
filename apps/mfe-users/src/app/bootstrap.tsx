import { createRoot } from 'react-dom/client';
import { setupAgGridLicense } from '@mfe/design-system';
// PERF-INIT-V2 PR-B1a: AG Grid module registration side-effect import.
// Previously mfe-shell bootstrap owned this import for the entire monorepo
// (relying on Module Federation singleton sharing). This leaked AG Grid
// Enterprise (~6 MB) into the shell's eager bundle even when no grid was
// on screen. Each grid-using MFE now imports the setup explicitly so the
// chunk lives in the MFE's own lazy-load tree, NOT in shell's bootstrap.
import '@mfe/design-system/advanced/data-grid/setup';
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
