/* ------------------------------------------------------------------ */
/*  Lazy remote module definitions                                     */
/* ------------------------------------------------------------------ */

import React from 'react';
import { createLazyRemoteModule } from '../createLazyRemoteModule';
import { SuggestionsAppOnDemand } from '../createSuggestionsAppOnDemand';
import { EthicAppOnDemand } from '../createEthicAppOnDemand';

/**
 * PERF-INIT-V2 PR-B5b1 + PR-B5b1.5 canary build-time conditional
 * (Codex thread 019e2272 iter-1 per-remote conditional pattern,
 * extended to ethic in B5b1.5):
 *
 * - When `__MFE_SUGGESTIONS_ON_DEMAND__` / `__MFE_ETHIC_ON_DEMAND__`
 *   is `false` (default), the shell ships the eager federated route
 *   (current behaviour; no regression).  The static
 *   `import('mfe_suggestions/SuggestionsApp')` / `import('mfe_ethic/EthicApp')`
 *   specifier is evaluated by Rolldown and resolved against the
 *   federation manifest declared in `apps/mfe-shell/vite.config.ts`.
 *
 * - When the define is `true` (build-time canary active), the eager
 *   branch is dead-code-eliminated — the static import specifier
 *   never enters the bundle — and the shell picks the runtime-register
 *   path from `createSuggestionsAppOnDemand.tsx` /
 *   `createEthicAppOnDemand.tsx`.  This removes the synchronous
 *   `/remotes/suggestions/remoteEntry.js` /
 *   `/remotes/ethic/remoteEntry.js` fetch from host bootstrap
 *   (PR-B5b0 attribution finding; B5b1 measured -6 MB decoded on /login).
 *
 * Same pattern as `EndpointAdminModule` below (PR #287 precedent).
 * Both defines driven by the same `VITE_MFE_ON_DEMAND_BOOTSTRAP` env
 * (single canary master toggle).
 */
declare const __MFE_SUGGESTIONS_ON_DEMAND__: boolean;
declare const __MFE_ETHIC_ON_DEMAND__: boolean;

export const SuggestionsApp: React.ComponentType = __MFE_SUGGESTIONS_ON_DEMAND__
  ? SuggestionsAppOnDemand
  : createLazyRemoteModule('Suggestions', () => import('mfe_suggestions/SuggestionsApp'));

export const EthicApp: React.ComponentType = __MFE_ETHIC_ON_DEMAND__
  ? EthicAppOnDemand
  : createLazyRemoteModule('Ethic', () => import('mfe_ethic/EthicApp'));

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
 * Build-time boolean injected via `vite.config define`. Direct define
 * is the canonical Vite/esbuild/Rollup pattern that yields reliable
 * dead-code elimination — the IIFE-over-`process.env` approach used
 * earlier was not provably tree-shaken (Codex PR #287 iter-1
 * must-fix #1).
 *
 * Companion gate: `vite.config buildRemotes(endpointAdminEnabled)`
 * omits the manifest entry when this value is `false`, so neither
 * side references the disabled remote in the compiled bundle and MF
 * runtime never tries to resolve `init()`/`get()` against a STUB.
 *
 * Pattern reason: PR #258/#280 deploy hit MF Runtime #RUNTIME-002
 * because the previous data-URI STUB did not satisfy the federation
 * runtime's container contract. Build-time omit avoids the contract.
 */
declare const __SHELL_ENDPOINT_ADMIN_REMOTE_ENABLED__: boolean;

const EndpointAdminNoop: React.FC = () => null;
EndpointAdminNoop.displayName = 'EndpointAdminNoop';

export const EndpointAdminModule: React.ComponentType = __SHELL_ENDPOINT_ADMIN_REMOTE_ENABLED__
  ? createLazyRemoteModule('EndpointAdmin', () => import('mfe_endpoint_admin/EndpointAdminApp'))
  : EndpointAdminNoop;
