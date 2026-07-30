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
import { createMeetingApp } from '../createMeetingApp';
import { createProtectedRemoteApp } from '../createProtectedRemoteApp';

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
 * `__MFE_ADMIN_REMOTES_ON_DEMAND__` is deliberately NOT declared here any more.
 *
 * It still exists and still does its build-time job elsewhere — whether
 * `vite.config.ts buildRemotes()` declares the four admin remotes in the
 * federation manifest, and which prewarm branch `shell-services-wiring.ts`
 * takes. What it must never do again is decide, in this file, whether the route
 * awaits `ensureRemoteShellServicesConfigured()` before mounting the remote:
 * that is a correctness invariant, not a loading strategy. Removing the
 * declaration is what makes a reintroduced branch a compile error rather than a
 * silent regression.
 */

export const SuggestionsApp: React.ComponentType = __MFE_SUGGESTIONS_ON_DEMAND__
  ? SuggestionsAppOnDemand
  : createLazyRemoteModule('Suggestions', () => import('mfe_suggestions/SuggestionsApp'));

export const EthicApp: React.ComponentType = __MFE_ETHIC_ON_DEMAND__
  ? EthicAppOnDemand
  : createLazyRemoteModule('Ethic', () => import('mfe_ethic/EthicApp'));

/**
 * The four admin remotes take the wrapper path in EVERY build, regardless of
 * `__MFE_ADMIN_REMOTES_ON_DEMAND__`.
 *
 * These used to branch on that define, and the eager branch handed
 * `createLazyRemoteModule` a bare dynamic import of the remote's App expose
 * (the specifier is deliberately not spelled out here — `on-demand-federation-guard.mjs`
 * S3 greps this file for it, and prose would trip the guard). That
 * mounts the remote app with no ordering guarantee against the work that
 * configures it: `wireRemoteShellServices()` is idle-deferred AND gated on
 * `authState.token` via `shouldWireRemoteShellServices()`. On a cold session the
 * token is not in the store at route render, so the configure is not late — it
 * is unscheduled. `getShellServices()` then throws inside the remote and the
 * surface renders an error having issued no request at all.
 *
 * Measured on ai.acik.com 2026-07-30 with the eager build: 2 of 3 cold loads of
 * `/admin/users` rendered `[mfe-users] Shell servisleri konfigüre edilmedi.`
 * with zero `/api/v1/users` traffic — corroborated server-side, where prod
 * user-service logged no such request across 25 minutes while the admin was
 * retrying. Grants were never missing; the request was never made.
 *
 * The wrappers await `ensureRemoteShellServicesConfigured()` before they
 * `loadRemote` the App expose, and that helper reads no auth state, so the
 * ordering holds whether or not a token exists yet. Injecting before auth is
 * safe because the shared facade hands over live store closures
 * (`getToken: () => store.getState().auth.token ?? null`).
 *
 * `__MFE_ADMIN_REMOTES_ON_DEMAND__` keeps its build-time job — whether
 * `buildRemotes()` declares these four in the federation manifest — but it no
 * longer decides whether configure-before-mount happens. In a manifest build
 * the wrapper's `registerRemotes` call is a name-based no-op (see
 * `ensure-remote-shell-services.ts`), so the static entry stays authoritative.
 *
 * Enforced by `createUsersAppOnDemand.test.tsx` (module-factory call order via
 * the real `UsersModule` export) and by `scripts/ci/on-demand-federation-guard.mjs`
 * S3 (no eager admin App import specifier may return to this file).
 *
 * Cross-AI: Codex thread 019fb1f7 D1 — collapse rather than wrapping both
 * branches, because two paths that must stay in sync is the condition that
 * produced this bug.
 */
export const AccessModule: React.ComponentType = AccessAppOnDemand;

export const AuditModule: React.ComponentType = AuditAppOnDemand;

export const UsersModule: React.ComponentType = UsersAppOnDemand;

export const ReportingModule: React.ComponentType = ReportingAppOnDemand;

export const SchemaExplorerModule: React.ComponentType = __MFE_SCHEMA_EXPLORER_ON_DEMAND__
  ? SchemaExplorerAppOnDemand
  : createLazyRemoteModule('SchemaExplorer', () => import('mfe_schema_explorer/SchemaExplorerApp'));

export const MeetingModule: React.ComponentType = createMeetingApp(
  () => import('mfe_meeting/MeetingApp'),
  () => import('mfe_meeting/shell-services'),
);

// 39d-6: shell-token köprüsü — mount ÖNCESİ configureShellServices (meeting deseni);
// canlı /api/ats çağrıları Bearer/auth-ready zincirini shell'den alır.
export const InterviewEvidenceModule: React.ComponentType = createProtectedRemoteApp(
  'InterviewEvidence',
  () => import('mfe_interview_evidence/InterviewEvidenceApp'),
  () => import('mfe_interview_evidence/shell-services'),
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
