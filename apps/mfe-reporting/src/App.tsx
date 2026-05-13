// PERF-INIT-V2 PR-B1a: AG Grid module registration at the federation
// EXPOSE entry. Shell host imports `mfe_reporting/ReportingApp` (which
// resolves to this file via vite.config.ts `exposes` map), NOT
// bootstrap.tsx — so the bootstrap-level setup import only covers
// standalone open of the MFE. See mfe-users/UsersApp.ui.tsx comment.
import '@mfe/design-system/advanced/data-grid/setup';
import ReportingApp from './app/reporting/ReportingApp';
import { ReportingProviders } from './app/reporting/ReportingProviders';

const App = () => (
  <ReportingProviders>
    <ReportingApp />
  </ReportingProviders>
);

export default App;
