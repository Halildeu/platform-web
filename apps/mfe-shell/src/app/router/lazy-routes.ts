/* ------------------------------------------------------------------ */
/*  Lazy remote module definitions                                     */
/* ------------------------------------------------------------------ */

import React from 'react';
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

/* ------------------------------------------------------------------ */
/*  Endpoint admin — build-time conditional                            */
/* ------------------------------------------------------------------ */

/**
 * Build-time evaluation. Vite's define plugin inlines
 * `process.env.VITE_*` references at compile time; when the flag is
 * unset/false, this constant becomes the literal `false` and the
 * conditional below tree-shakes the `import("mfe_endpoint_admin/...")`
 * dead branch out of the bundle. The vite.config buildRemotes()
 * companion check omits the federation manifest entry for the same
 * remote so MF runtime never tries to resolve a STUB.
 *
 * Pattern reason: PR #280 deploy hit MF Runtime #RUNTIME-002 because
 * the previous data-URI STUB did not satisfy the federation runtime's
 * init()/get() contract. Build-time omit avoids the contract entirely.
 */
const ENDPOINT_ADMIN_REMOTE_ENABLED = (() => {
  const flag = process.env.VITE_SHELL_ENABLE_ENDPOINT_ADMIN_REMOTE;
  if (typeof flag !== 'string') return false;
  const normalized = flag.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
})();

const EndpointAdminNoop: React.FC = () => null;
EndpointAdminNoop.displayName = 'EndpointAdminNoop';

export const EndpointAdminModule: React.ComponentType = ENDPOINT_ADMIN_REMOTE_ENABLED
  ? createLazyRemoteModule('EndpointAdmin', () => import('mfe_endpoint_admin/EndpointAdminApp'))
  : EndpointAdminNoop;
