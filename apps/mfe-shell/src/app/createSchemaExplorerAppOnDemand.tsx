/**
 * PERF-INIT-V2 PR-B5b2a — `mfe_schema_explorer` on-demand bootstrap canary.
 *
 * Build-time flag `__MFE_SCHEMA_EXPLORER_ON_DEMAND__` (driven by
 * `MFE_ON_DEMAND_BOOTSTRAP=1` / `VITE_MFE_ON_DEMAND_BOOTSTRAP=1` at
 * shell build time):
 *
 *   1. `apps/mfe-shell/vite.config.ts` omits the `mfe_schema_explorer`
 *      entry from `federation({remotes})`, so the host bundle does
 *      not emit the synchronous `remoteEntry.js` fetch at bootstrap.
 *   2. `lazy-routes.ts` swaps the static
 *      `import('mfe_schema_explorer/SchemaExplorerApp')` specifier for the
 *      `SchemaExplorerAppOnDemand` component declared below.
 *   3. On first navigation to `/schema-explorer`, the lazy factory
 *      registers the remote against the **host MF runtime instance**
 *      then resolves `mfe_schema_explorer/SchemaExplorerApp`.
 *
 * --- Codex iter-2 fix (thread `019e228d` P0-1) ---
 *
 * Package-level `registerRemotes` / `loadRemote` helpers from
 * `@module-federation/runtime` are bound to a **module-local**
 * `FederationInstance` variable that is only set by `init()`.  When
 * this on-demand chunk imports the runtime package dynamically, that
 * module-local is NULL even though the host's MF instance is alive
 * in `globalThis.__FEDERATION__.__INSTANCES__`.  Calling
 * `registerRemotes` against the package-level helper throws
 * `#RUNTIME-009` ("Please call createInstance first").
 *
 * Fix: resolve the host instance from the global registry directly
 * and call `host.registerRemotes(...)` / `host.loadRemote(...)` on
 * it.  The global structure is part of the MF runtime contract
 * (`@module-federation/runtime-core` `global.js` `__INSTANCES__`).
 *
 * --- Codex iter-2 fix (thread `019e228d` P1) ---
 *
 * Wrap the runtime register + load preamble inside the existing
 * `createLazyRemoteModule` factory so we inherit its
 * `isValidRemoteComponent` guard + `classifyRemoteError` + classified
 * fallback card.  This matches the eager path's safety net so a
 * remote-offline scenario shows the same user-visible fallback as
 * a routine eager remote failure.
 *
 * --- Rollback semantic clarification (Codex iter-2 P0-2) ---
 *
 * The `MFE_ON_DEMAND_BOOTSTRAP` runtime flag is read at BUILD TIME
 * via `process.env`.  Once a build has been made with the flag on,
 * `__MFE_SCHEMA_EXPLORER_ON_DEMAND__` is `true` and the eager branch
 * (`createLazyRemoteModule('SchemaExplorer', () => import('mfe_schema_explorer/...'))`)
 * has been dead-code-eliminated from the bundle entirely.  There is
 * NO post-build runtime path back to the eager branch — a full
 * rebuild without the flag is required.  See PR body "Rollback"
 * section for the operational matrix.
 */

import React, { Suspense } from 'react';
import type { FC, PropsWithChildren } from 'react';
import { createLazyRemoteModule } from './createLazyRemoteModule';

declare const __MFE_SCHEMA_EXPLORER_ON_DEMAND__: boolean;

const SCHEMA_EXPLORER_HOST_NAME = 'mfe_shell';
const SCHEMA_EXPLORER_REMOTE_NAME = 'mfe_schema_explorer';
const SCHEMA_EXPLORER_REMOTE_KEY = `${SCHEMA_EXPLORER_REMOTE_NAME}/SchemaExplorerApp`;

/**
 * Shape of the MF host instance we use — narrowed from
 * `ModuleFederation` to the two methods we actually call.  Keeping
 * the surface narrow makes the module easy to mock in unit tests
 * without pulling the full `@module-federation/runtime-core` type
 * graph.
 */
interface MfHostInstance {
  options: { name: string };
  registerRemotes(
    remotes: Array<{ name: string; entry: string; type?: string }>,
    options?: { force?: boolean },
  ): void;
  loadRemote<T = unknown>(key: string): Promise<T | null>;
}

interface FederationGlobal {
  __INSTANCES__?: MfHostInstance[];
}

let schemaExplorerRegistered = false;

/**
 * Resolve the host MF runtime instance from the global registry that
 * `@module-federation/runtime-core` maintains at
 * `globalThis.__FEDERATION__.__INSTANCES__`.  The host bundle's
 * `federation({ name: 'mfe_shell', ... })` call ends up pushed there
 * during host bootstrap.
 *
 * Returns `null` when no host instance is present (test environment
 * without runtime bootstrap, or pre-MF setup error).
 */
function getHostMfInstance(): MfHostInstance | null {
  const root: typeof globalThis & { __FEDERATION__?: FederationGlobal } =
    typeof globalThis === 'object' ? globalThis : (window as unknown as typeof globalThis);
  const federation = (root as { __FEDERATION__?: FederationGlobal }).__FEDERATION__;
  const instances = federation?.__INSTANCES__ ?? [];
  return instances.find((i) => i.options.name === SCHEMA_EXPLORER_HOST_NAME) ?? null;
}

/**
 * Read the ethic remoteEntry URL from runtime env injected by
 * the index.html transform.  Lookup order matches the build-time
 * `MFE_SCHEMA_EXPLORER_URL` env that `vite.config.ts` reads for the
 * eager mode federation manifest.
 */
function resolveSchemaExplorerRemoteEntry(): string {
  if (typeof window !== 'undefined') {
    const w = window as Window & { __env__?: Record<string, string> };
    const url =
      w.__env__?.MFE_SCHEMA_EXPLORER_URL ?? w.__env__?.VITE_MFE_SCHEMA_EXPLORER_URL ?? null;
    if (url) return url;
  }
  if (typeof process !== 'undefined' && process.env) {
    const url =
      process.env.MFE_SCHEMA_EXPLORER_URL ?? process.env.VITE_MFE_SCHEMA_EXPLORER_URL ?? null;
    if (url) return url;
  }
  // Dev fallback — matches default in apps/mfe-shell/vite.config.ts.
  return 'http://localhost:3008/remoteEntry.js';
}

/**
 * Lazy registration: invoke `host.registerRemotes` on the host MF
 * instance ONLY on the first call.  Subsequent invocations are
 * no-ops thanks to the `schemaExplorerRegistered` guard.
 *
 * Idempotency rationale: `registerRemotes` is idempotent on identical
 * remote configs in `@module-federation/runtime@2.x`, but our guard
 * keeps the call site predictable for test assertions and avoids any
 * future regression where the MF team changes that idempotency.
 */
function ensureSchemaExplorerRegistered(): void {
  if (schemaExplorerRegistered) return;
  const host = getHostMfInstance();
  if (!host) {
    throw new Error(
      `[B5b2a] Host MF runtime instance "${SCHEMA_EXPLORER_HOST_NAME}" not initialized — ` +
        `eager bootstrap chain broken or this module rendered before host setup.`,
    );
  }
  host.registerRemotes([
    {
      name: SCHEMA_EXPLORER_REMOTE_NAME,
      entry: resolveSchemaExplorerRemoteEntry(),
      // `type: 'esm'` matches the @module-federation/vite-emitted
      // federation manifest shape (eager `federation({ remotes })`
      // entries default to ESM).  Explicit avoids relying on runtime
      // defaults.
      type: 'esm',
    },
  ]);
  schemaExplorerRegistered = true;
}

/**
 * Inner async loader: register-on-first-call → loadRemote → return the
 * resolved module to React.lazy.  Errors propagate to
 * `createLazyRemoteModule`'s outer try/catch which converts them
 * into a classified-fallback card.
 */
async function loadSchemaExplorerRemote(): Promise<{ default: FC<PropsWithChildren> }> {
  ensureSchemaExplorerRegistered();
  const host = getHostMfInstance();
  // The host must still be present — defence-in-depth for the
  // (extremely unlikely) case where the host instance was torn down
  // between register and load.
  if (!host) {
    throw new Error(
      `[B5b2a] Host MF runtime instance "${SCHEMA_EXPLORER_HOST_NAME}" disappeared between register and load.`,
    );
  }
  const mod = await host.loadRemote<{ default: FC<PropsWithChildren> }>(SCHEMA_EXPLORER_REMOTE_KEY);
  if (!mod) {
    // Surface as a classified "remote unavailable" rather than React
    // invalid-element-type crash; createLazyRemoteModule will convert
    // this throw into the standard fallback card.
    throw new Error(
      `[B5b2a] loadRemote(${SCHEMA_EXPLORER_REMOTE_KEY}) returned null — remote may not be reachable. ` +
        `Check MFE_SCHEMA_EXPLORER_URL.`,
    );
  }
  return { default: mod.default ?? (mod as unknown as FC<PropsWithChildren>) };
}

/**
 * Lazy React component for the on-demand canary path.  Wraps the
 * `loadSchemaExplorerRemote` register-then-load preamble in the same
 * `createLazyRemoteModule` factory used for eager remotes, inheriting
 * its `isValidRemoteComponent` guard + `classifyRemoteError` +
 * `createRemoteUnavailableFallback` safety net.
 */
const SchemaExplorerAppLazy = createLazyRemoteModule('SchemaExplorer', loadSchemaExplorerRemote);

/**
 * Public export used by `lazy-routes.ts` when the on-demand canary
 * is active.  Wraps `SchemaExplorerAppLazy` in a Suspense fallback so
 * the parent route doesn't have to.  The surrounding `<AppRouter>`
 * already provides its own Suspense boundary; this Suspense is a
 * defensive layer in case the canary path is mounted outside the
 * router (e.g. tests).
 */
export const SchemaExplorerAppOnDemand: FC = () => (
  <Suspense fallback={null}>
    <SchemaExplorerAppLazy />
  </Suspense>
);
SchemaExplorerAppOnDemand.displayName = 'SchemaExplorerAppOnDemand';

/**
 * Test-only export: returns the registered-guard boolean without
 * pulling internal module state through prototype hacks.  NOT part
 * of the public API.
 *
 * @internal
 */
export function __getSchemaExplorerRegisteredForTests(): boolean {
  return schemaExplorerRegistered;
}

/**
 * Reset the registration guard between test cases.  Production code
 * MUST NOT call this; it would re-trigger registration on the next
 * render.
 *
 * @internal
 */
export function __resetSchemaExplorerRegisteredForTests(): void {
  schemaExplorerRegistered = false;
}

/**
 * Re-export the build-time flag for downstream consumers that want
 * to branch on it without importing the runtime reader.  This is the
 * BUILD-TIME value — once a build has been made with the flag on,
 * the eager branch is fully dead-code-eliminated and no runtime
 * override can restore it (see file header).
 */
export const SCHEMA_EXPLORER_ON_DEMAND_BUILD_FLAG = __MFE_SCHEMA_EXPLORER_ON_DEMAND__;
