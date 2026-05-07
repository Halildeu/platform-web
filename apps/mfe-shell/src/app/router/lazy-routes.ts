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

// Endpoint-admin remote — defensive lazy. Wrapped in
// `createLazyRemoteModule` so import failures (e.g. flag-OFF STUB
// reached because something bypassed the route flag-gate) collapse
// to the standard EmptyErrorLoading fallback rather than crashing
// the shell. The wiring chain in `shell-services-wiring.ts` and the
// route in `AppRouter.tsx` BOTH gate on
// `isEndpointAdminRemoteEnabled()`, so this loader is only reached
// when the feature is explicitly enabled.
export const EndpointAdminModule = createLazyRemoteModule(
  'EndpointAdmin',
  () => import('mfe_endpoint_admin/EndpointAdminApp'),
);
