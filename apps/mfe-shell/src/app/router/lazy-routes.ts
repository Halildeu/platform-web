/* ------------------------------------------------------------------ */
/*  Lazy remote module definitions                                     */
/* ------------------------------------------------------------------ */

import { createLazyRemoteModule } from '../createLazyRemoteModule';

export const SuggestionsApp = createLazyRemoteModule(
  'Suggestions',
  () => import('mfe_suggestions/SuggestionsApp'),
);

export const EthicApp = createLazyRemoteModule('Ethic', () => import('mfe_ethic/EthicApp'));

export const AccessModule = createLazyRemoteModule('Access', () => import('mfe_access/AccessApp'));

export const AuditModule = createLazyRemoteModule('Audit', () => import('mfe_audit/AuditApp'));

export const UsersModule = createLazyRemoteModule('Users', () => import('mfe_users/UsersApp'));

export const ReportingModule = createLazyRemoteModule(
  'Reporting',
  () => import('mfe_reporting/ReportingApp'),
);

export const SchemaExplorerModule = createLazyRemoteModule(
  'SchemaExplorer',
  () => import('mfe_schema_explorer/SchemaExplorerApp'),
);

// PR #258 reapply (post-#261): export is unconditional so the static
// `import("mfe_endpoint_admin/EndpointAdminApp")` is visible to the MF
// plugin (which produces a STUB binding when the flag is OFF — see
// vite.config buildRemotes). The component is only rendered when the
// AppRouter conditionally mounts the route under
// `isEndpointAdminRemoteEnabled()`; render-time STUB resolution is
// caught by createLazyRemoteModule's error fallback.
export const EndpointAdminModule = createLazyRemoteModule(
  'EndpointAdmin',
  () => import('mfe_endpoint_admin/EndpointAdminApp'),
);
