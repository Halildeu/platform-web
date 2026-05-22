/* ------------------------------------------------------------------ */
/*  Lazy remote module definitions                                     */
/* ------------------------------------------------------------------ */

import React from 'react';
import { createLazyRemoteModule } from '../createLazyRemoteModule';
import { createEndpointAdminApp } from '../createEndpointAdminApp';
import { SuggestionsAppOnDemand } from '../createSuggestionsAppOnDemand';
import { EthicAppOnDemand } from '../createEthicAppOnDemand';
import { SchemaExplorerAppOnDemand } from '../createSchemaExplorerAppOnDemand';
import { UsersAppOnDemand } from '../createUsersAppOnDemand';
import { AccessAppOnDemand } from '../createAccessAppOnDemand';
import { AuditAppOnDemand } from '../createAuditAppOnDemand';
import { ReportingAppOnDemand } from '../createReportingAppOnDemand';

/**
 * PERF-INIT-V2 PR-B5b1 + PR-B5b1.5 + PR-B5b2a canary build-time
 * conditional (Codex thread 019e2272 iter-1 per-remote conditional
 * pattern, extended to ethic in B5b1.5 and schema_explorer in
 * B5b2a):
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
declare const __MFE_SCHEMA_EXPLORER_ON_DEMAND__: boolean;

/**
 * PERF-INIT-V2 PR-B5b2-prep-2 (Codex thread `019e2358` AGREE Option B):
 * single build-time flag gates the 4 admin remotes
 * (users / audit / access / reporting) on-demand path.  When TRUE:
 *
 *   1. `vite.config.ts buildRemotes()` omits the 4 admin manifest
 *      entries.
 *   2. `shell-services-wiring.ts` static-import 4-remote contract
 *      block is DCE'd; idle batch uses
 *      `ensureRemoteShellServicesConfigured` helper instead.
 *   3. The static `import('mfe_<admin>/...App')` specifiers below are
 *      DCE'd and the route renders the on-demand wrappers instead.
 *
 * Same pattern as `__MFE_SUGGESTIONS_ON_DEMAND__` (B5b1) /
 * `__MFE_ETHIC_ON_DEMAND__` (B5b1.5) / `__MFE_SCHEMA_EXPLORER_ON_DEMAND__`
 * (B5b2a) — single `VITE_MFE_ON_DEMAND_BOOTSTRAP` master toggle
 * drives all via `readSuggestionsOnDemandBuildFlag()` reader.
 */
declare const __MFE_ADMIN_REMOTES_ON_DEMAND__: boolean;

export const SuggestionsApp: React.ComponentType = __MFE_SUGGESTIONS_ON_DEMAND__
  ? SuggestionsAppOnDemand
  : createLazyRemoteModule('Suggestions', () => import('mfe_suggestions/SuggestionsApp'));

export const EthicApp: React.ComponentType = __MFE_ETHIC_ON_DEMAND__
  ? EthicAppOnDemand
  : createLazyRemoteModule('Ethic', () => import('mfe_ethic/EthicApp'));

export const AccessModule: React.ComponentType = __MFE_ADMIN_REMOTES_ON_DEMAND__
  ? AccessAppOnDemand
  : createLazyRemoteModule('Access', () => import('mfe_access/AccessApp'));

export const AuditModule: React.ComponentType = __MFE_ADMIN_REMOTES_ON_DEMAND__
  ? AuditAppOnDemand
  : createLazyRemoteModule('Audit', () => import('mfe_audit/AuditApp'));

export const UsersModule: React.ComponentType = __MFE_ADMIN_REMOTES_ON_DEMAND__
  ? UsersAppOnDemand
  : createLazyRemoteModule('Users', () => import('mfe_users/UsersApp'));

export const ReportingModule: React.ComponentType = __MFE_ADMIN_REMOTES_ON_DEMAND__
  ? ReportingAppOnDemand
  : createLazyRemoteModule('Reporting', () => import('mfe_reporting/ReportingApp'));

export const SchemaExplorerModule: React.ComponentType = __MFE_SCHEMA_EXPLORER_ON_DEMAND__
  ? SchemaExplorerAppOnDemand
  : createLazyRemoteModule('SchemaExplorer', () => import('mfe_schema_explorer/SchemaExplorerApp'));

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

// #655: route-level wrapper awaits `configureShellServices` (shell auth
// token resolver injection) BEFORE EndpointAdminApp mounts + fires its
// RTK queries — deep-link race protection (the idle-batch wiring in
// shell-services-wiring.ts can otherwise lose the race → API 401).
// The federation specifiers stay here, inside the
// `__SHELL_ENDPOINT_ADMIN_REMOTE_ENABLED__` ternary, so a disabled-remote
// build DCE's them; `createEndpointAdminApp` itself carries no specifiers.
export const EndpointAdminModule: React.ComponentType = __SHELL_ENDPOINT_ADMIN_REMOTE_ENABLED__
  ? createEndpointAdminApp(
      () => import('mfe_endpoint_admin/EndpointAdminApp'),
      () => import('mfe_endpoint_admin/shell-services'),
    )
  : EndpointAdminNoop;
