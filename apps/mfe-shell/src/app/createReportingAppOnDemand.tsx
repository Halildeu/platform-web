/**
 * PERF-INIT-V2 PR-B5b2-prep-2 — `mfe_reporting` on-demand bootstrap canary.
 *
 * Build-time flag `__MFE_ADMIN_REMOTES_ON_DEMAND__` (driven by the same
 * `MFE_ON_DEMAND_BOOTSTRAP=1` / `VITE_MFE_ON_DEMAND_BOOTSTRAP=1` master
 * canary toggle as B5b1 / B5b1.5 / B5b2a):
 *
 *   1. `apps/mfe-shell/vite.config.ts` omits the `mfe_reporting` entry from
 *      `federation({remotes})` so the host bundle does not emit the
 *      synchronous `remoteEntry.js` fetch at bootstrap.
 *   2. `lazy-routes.ts` swaps the static
 *      `import('mfe_reporting/ReportingApp')` specifier for the
 *      `ReportingAppOnDemand` component declared below.
 *   3. `shell-services-wiring.ts` swaps the static
 *      `import('mfe_reporting/shell-services')` line for an idle-deferred
 *      `ensureRemoteShellServicesConfigured('mfe_reporting', ...)` call so
 *      the shell-services contract (notify / SSE / impersonation / auth
 *      ready) is still wired post-auth without the eager fetch.
 *   4. On first navigation to `/reporting`, the lazy factory FIRST awaits
 *      `ensureRemoteShellServicesConfigured` (route-level race
 *      protection — Codex thread `019e2358` AGREE Option B critical
 *      add #2) so the remote's `configureShellServices(sharedServices)`
 *      hook runs BEFORE the route component mounts.  Then it loads
 *      `mfe_reporting/ReportingApp` from the (now registered) remote.
 *
 * --- Codex iter-1 thread `019e2358` AGREE Option B design summary ---
 *
 *   - Single build-time define `__MFE_ADMIN_REMOTES_ON_DEMAND__` gates
 *     all 4 admin remotes in the shell-services 4-remote contract —
 *     atomic
 *     refactor so the static `import('mfe_<admin>/shell-services')` 4-remote
 *     contract block in `shell-services-wiring.ts` can be DCE'd as a
 *     single hunk when the canary fires.
 *   - One shared `ensureRemoteShellServicesConfigured` helper (PR
 *     B5b2-prep-1 #459) handles register + load + configure with
 *     idempotency + in-flight dedup + failure rethrow.
 *   - Route-level wrappers call the helper BEFORE `loadRemote(XxxApp)`
 *     to protect deep-link renders against an idle batch that hasn't
 *     fired yet.
 *   - Idle batch (`shell-services-wiring.ts` post-auth) ALSO calls the
 *     helper — both paths converge on the same configured-remotes Set
 *     so whichever fires first wins (idempotent).
 *
 * --- Rollback semantic (same as B5b1 / B5b1.5 / B5b2a) ---
 *
 * `__MFE_ADMIN_REMOTES_ON_DEMAND__` is build-time DCE'd by Vite's
 * `define`.  Once a build has been made with the flag on, the eager
 * `import('mfe_reporting/ReportingApp')` specifier no longer exists in the
 * bundle and CANNOT be re-enabled by any runtime env.  Full
 * post-build rollback requires rebuilding with the flag OFF.
 */

import React, { Suspense } from 'react';
import type { FC, PropsWithChildren } from 'react';
import { createLazyRemoteModule } from './createLazyRemoteModule';
import { ensureRemoteShellServicesConfigured } from './config/ensure-remote-shell-services';
import { getSharedShellServices } from './config/shell-services-wiring';

declare const __MFE_ADMIN_REMOTES_ON_DEMAND__: boolean;

const REPORTING_HOST_NAME = 'mfe_shell';
const REPORTING_REMOTE_NAME = 'mfe_reporting';
const REPORTING_REMOTE_KEY = `${REPORTING_REMOTE_NAME}/ReportingApp`;

/**
 * Shape of the MF host instance we use — narrowed from
 * `ModuleFederation` to the one method we actually call (`loadRemote`).
 * `registerRemotes` is handled inside the ensure helper, so the
 * wrapper's only direct call is `loadRemote`.
 */
interface MfHostInstance {
  options: { name: string };
  loadRemote<T = unknown>(key: string): Promise<T | null>;
}

interface FederationGlobal {
  __INSTANCES__?: MfHostInstance[];
}

/**
 * Resolve the host MF runtime instance from the global registry that
 * `@module-federation/runtime-core` maintains at
 * `globalThis.__FEDERATION__.__INSTANCES__`.  See B5b1/B5b1.5/B5b2a
 * canaries + ensure-remote-shell-services helper for the same lookup.
 */
function getHostMfInstance(): MfHostInstance | null {
  const root: typeof globalThis & { __FEDERATION__?: FederationGlobal } =
    typeof globalThis === 'object' ? globalThis : (window as unknown as typeof globalThis);
  const federation = (root as { __FEDERATION__?: FederationGlobal }).__FEDERATION__;
  const instances = federation?.__INSTANCES__ ?? [];
  return instances.find((i) => i.options.name === REPORTING_HOST_NAME) ?? null;
}

/**
 * Read the reporting remoteEntry URL from runtime env injected by the
 * index.html transform.  Lookup order matches the build-time
 * `MFE_REPORTING_URL` env that `vite.config.ts` reads for the eager mode
 * federation manifest (port 3007 default — see `remoteEntries.reporting`).
 */
function resolveReportingRemoteEntry(): string {
  if (typeof window !== 'undefined') {
    const w = window as Window & { __env__?: Record<string, string> };
    const url = w.__env__?.MFE_REPORTING_URL ?? w.__env__?.VITE_MFE_REPORTING_URL ?? null;
    if (url) return url;
  }
  if (typeof process !== 'undefined' && process.env) {
    const url = process.env.MFE_REPORTING_URL ?? process.env.VITE_MFE_REPORTING_URL ?? null;
    if (url) return url;
  }
  // Dev fallback — matches default in apps/mfe-shell/vite.config.ts.
  return 'http://localhost:3007/remoteEntry.js';
}

/**
 * Inner async loader for the route-level lazy factory.
 *
 * Flow:
 *   1. Resolve sharedServices via the host's lazy-cached factory
 *      (`getSharedShellServices`).
 *   2. Await `ensureRemoteShellServicesConfigured` (B5b2-prep-1 helper)
 *      — registers the remote + loads `mfe_reporting/shell-services` +
 *      calls `configureShellServices(sharedServices)`.  Idempotent +
 *      in-flight dedup means concurrent idle batch + route render
 *      collapse onto a single load.
 *   3. `host.loadRemote('mfe_reporting/ReportingApp')` — remote is now
 *      registered, this is just a manifest lookup.
 *
 * Errors propagate to `createLazyRemoteModule`'s outer try/catch which
 * converts them into a classified-fallback card (B5b2a iter-2 P1
 * pattern).
 */
async function loadReportingRemote(): Promise<{ default: FC<PropsWithChildren> }> {
  const sharedServices = getSharedShellServices();
  await ensureRemoteShellServicesConfigured(
    REPORTING_REMOTE_NAME,
    resolveReportingRemoteEntry(),
    sharedServices,
  );
  const host = getHostMfInstance();
  // Defence-in-depth — helper should have registered the remote against
  // the same host instance.  If the host disappeared between
  // register-via-helper and loadRemote, surface as classified fallback.
  if (!host) {
    throw new Error(
      `[B5b2-prep] Host MF runtime instance "${REPORTING_HOST_NAME}" disappeared between ensure and load.`,
    );
  }
  const mod = await host.loadRemote<{ default: FC<PropsWithChildren> }>(REPORTING_REMOTE_KEY);
  if (!mod) {
    throw new Error(
      `[B5b2-prep] loadRemote(${REPORTING_REMOTE_KEY}) returned null — ` +
        `remote may not be reachable. Check MFE_REPORTING_URL.`,
    );
  }
  return { default: mod.default ?? (mod as unknown as FC<PropsWithChildren>) };
}

/**
 * Lazy React component for the on-demand canary path.  Wraps the
 * ensure + load preamble in the same `createLazyRemoteModule` factory
 * used for eager remotes, inheriting its `isValidRemoteComponent`
 * guard + `classifyRemoteError` + `createRemoteUnavailableFallback`
 * safety net.
 */
const ReportingAppLazy = createLazyRemoteModule('Reporting', loadReportingRemote);

/**
 * Public export used by `lazy-routes.ts` when the on-demand canary is
 * active.  Wraps `ReportingAppLazy` in a Suspense fallback so the parent
 * route doesn't have to.  The surrounding `<AppRouter>` already
 * provides its own Suspense boundary; this Suspense is a defensive
 * layer in case the canary path is mounted outside the router (e.g.
 * tests).
 */
export const ReportingAppOnDemand: FC = () => (
  <Suspense fallback={null}>
    <ReportingAppLazy />
  </Suspense>
);
ReportingAppOnDemand.displayName = 'ReportingAppOnDemand';

/**
 * Re-export the build-time flag for downstream consumers that want
 * to branch on it without importing the runtime reader.  This is the
 * BUILD-TIME value — once a build has been made with the flag on,
 * the eager branch is fully dead-code-eliminated and no runtime
 * override can restore it (see file header).
 */
export const REPORTING_ON_DEMAND_BUILD_FLAG = __MFE_ADMIN_REMOTES_ON_DEMAND__;
