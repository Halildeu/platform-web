/**
 * PERF-INIT-V2 PR-B5b1.5 — `mfe_ethic` on-demand bootstrap canary.
 *
 * Build-time flag `__MFE_ETHIC_ON_DEMAND__` (driven by
 * `MFE_ON_DEMAND_BOOTSTRAP=1` / `VITE_MFE_ON_DEMAND_BOOTSTRAP=1` at
 * shell build time):
 *
 *   1. `apps/mfe-shell/vite.config.ts` omits the `mfe_ethic`
 *      entry from `federation({remotes})`, so the host bundle does
 *      not emit the synchronous `remoteEntry.js` fetch at bootstrap.
 *   2. `lazy-routes.ts` swaps the static
 *      `import('mfe_ethic/EthicApp')` specifier for the
 *      `EthicAppOnDemand` component declared below.
 *   3. On first navigation to `/ethic`, the lazy factory
 *      registers the remote against the **host MF runtime instance**
 *      then resolves `mfe_ethic/EthicApp`.
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
 * `__MFE_ETHIC_ON_DEMAND__` is `true` and the eager branch
 * (`createLazyRemoteModule('Ethic', () => import('mfe_ethic/...'))`)
 * has been dead-code-eliminated from the bundle entirely.  There is
 * NO post-build runtime path back to the eager branch — a full
 * rebuild without the flag is required.  See PR body "Rollback"
 * section for the operational matrix.
 */

import React, { Suspense } from 'react';
import type { FC, PropsWithChildren } from 'react';
import { createLazyRemoteModule } from './createLazyRemoteModule';
// PR-B5b2-hostfix (Codex `019e2528`): host lookup centralized.
import { getHostMfInstance, CONFIGURED_HOST_NAME } from './config/host-mf-instance';

declare const __MFE_ETHIC_ON_DEMAND__: boolean;

const ETHIC_REMOTE_NAME = 'mfe_ethic';
const ETHIC_REMOTE_KEY = `${ETHIC_REMOTE_NAME}/EthicApp`;

let ethicRegistered = false;

/**
 * Read the ethic remoteEntry URL from runtime env injected by
 * the index.html transform.  Lookup order matches the build-time
 * `MFE_ETHIC_URL` env that `vite.config.ts` reads for the
 * eager mode federation manifest.
 */
function resolveEthicRemoteEntry(): string {
  if (typeof window !== 'undefined') {
    const w = window as Window & { __env__?: Record<string, string> };
    const url = w.__env__?.MFE_ETHIC_URL ?? w.__env__?.VITE_MFE_ETHIC_URL ?? null;
    if (url) return url;
  }
  if (typeof process !== 'undefined' && process.env) {
    const url = process.env.MFE_ETHIC_URL ?? process.env.VITE_MFE_ETHIC_URL ?? null;
    if (url) return url;
  }
  // Dev fallback — matches default in apps/mfe-shell/vite.config.ts.
  return 'http://localhost:3002/remoteEntry.js';
}

/**
 * Lazy registration: invoke `host.registerRemotes` on the host MF
 * instance ONLY on the first call.  Subsequent invocations are
 * no-ops thanks to the `ethicRegistered` guard.
 *
 * Idempotency rationale: `registerRemotes` is idempotent on identical
 * remote configs in `@module-federation/runtime@2.x`, but our guard
 * keeps the call site predictable for test assertions and avoids any
 * future regression where the MF team changes that idempotency.
 */
function ensureEthicRegistered(): void {
  if (ethicRegistered) return;
  const host = getHostMfInstance();
  if (!host) {
    throw new Error(
      `[B5b1.5] Host MF runtime instance "${CONFIGURED_HOST_NAME}" not initialized — ` +
        `eager bootstrap chain broken or this module rendered before host setup.`,
    );
  }
  host.registerRemotes([
    {
      name: ETHIC_REMOTE_NAME,
      entry: resolveEthicRemoteEntry(),
      // `type: 'esm'` matches the @module-federation/vite-emitted
      // federation manifest shape (eager `federation({ remotes })`
      // entries default to ESM).  Explicit avoids relying on runtime
      // defaults.
      type: 'esm',
    },
  ]);
  ethicRegistered = true;
}

/**
 * Inner async loader: register-on-first-call → loadRemote → return the
 * resolved module to React.lazy.  Errors propagate to
 * `createLazyRemoteModule`'s outer try/catch which converts them
 * into a classified-fallback card.
 */
async function loadEthicRemote(): Promise<{ default: FC<PropsWithChildren> }> {
  ensureEthicRegistered();
  const host = getHostMfInstance();
  // The host must still be present — defence-in-depth for the
  // (extremely unlikely) case where the host instance was torn down
  // between register and load.
  if (!host) {
    throw new Error(
      `[B5b1.5] Host MF runtime instance "${CONFIGURED_HOST_NAME}" disappeared between register and load.`,
    );
  }
  const mod = await host.loadRemote<{ default: FC<PropsWithChildren> }>(ETHIC_REMOTE_KEY);
  if (!mod) {
    // Surface as a classified "remote unavailable" rather than React
    // invalid-element-type crash; createLazyRemoteModule will convert
    // this throw into the standard fallback card.
    throw new Error(
      `[B5b1.5] loadRemote(${ETHIC_REMOTE_KEY}) returned null — remote may not be reachable. ` +
        `Check MFE_ETHIC_URL.`,
    );
  }
  return { default: mod.default ?? (mod as unknown as FC<PropsWithChildren>) };
}

/**
 * Lazy React component for the on-demand canary path.  Wraps the
 * `loadEthicRemote` register-then-load preamble in the same
 * `createLazyRemoteModule` factory used for eager remotes, inheriting
 * its `isValidRemoteComponent` guard + `classifyRemoteError` +
 * `createRemoteUnavailableFallback` safety net.
 */
const EthicAppLazy = createLazyRemoteModule('Ethic', loadEthicRemote);

/**
 * Public export used by `lazy-routes.ts` when the on-demand canary
 * is active.  Wraps `EthicAppLazy` in a Suspense fallback so
 * the parent route doesn't have to.  The surrounding `<AppRouter>`
 * already provides its own Suspense boundary; this Suspense is a
 * defensive layer in case the canary path is mounted outside the
 * router (e.g. tests).
 */
export const EthicAppOnDemand: FC = () => (
  <Suspense fallback={null}>
    <EthicAppLazy />
  </Suspense>
);
EthicAppOnDemand.displayName = 'EthicAppOnDemand';

/**
 * Test-only export: returns the registered-guard boolean without
 * pulling internal module state through prototype hacks.  NOT part
 * of the public API.
 *
 * @internal
 */
export function __getEthicRegisteredForTests(): boolean {
  return ethicRegistered;
}

/**
 * Reset the registration guard between test cases.  Production code
 * MUST NOT call this; it would re-trigger registration on the next
 * render.
 *
 * @internal
 */
export function __resetEthicRegisteredForTests(): void {
  ethicRegistered = false;
}

/**
 * Re-export the build-time flag for downstream consumers that want
 * to branch on it without importing the runtime reader.  This is the
 * BUILD-TIME value — once a build has been made with the flag on,
 * the eager branch is fully dead-code-eliminated and no runtime
 * override can restore it (see file header).
 */
export const ETHIC_ON_DEMAND_BUILD_FLAG = __MFE_ETHIC_ON_DEMAND__;
