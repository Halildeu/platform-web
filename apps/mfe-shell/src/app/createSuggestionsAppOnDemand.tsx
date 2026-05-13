/**
 * PERF-INIT-V2 PR-B5b1 — `mfe_suggestions` on-demand bootstrap canary.
 *
 * When the build-time `__MFE_SUGGESTIONS_ON_DEMAND__` define constant is
 * `true` (driven by `MFE_ON_DEMAND_BOOTSTRAP=1` / `VITE_MFE_ON_DEMAND_BOOTSTRAP=1`
 * env at build time):
 *   1. `apps/mfe-shell/vite.config.ts` OMITS the `mfe_suggestions` entry
 *      from `federation({remotes})`, so the host bundle does NOT emit
 *      the synchronous `remoteEntry.js` fetch at bootstrap.
 *   2. `lazy-routes.ts` selects THIS module's `SuggestionsAppOnDemand`
 *      component instead of the eager `createLazyRemoteModule`-based
 *      one (the static `import('mfe_suggestions/SuggestionsApp')`
 *      specifier is dead-code-eliminated by Rolldown).
 *   3. When the user navigates to `/suggestions` (or another route
 *      that renders the component), the `React.lazy` factory below
 *      calls `@module-federation/runtime` `registerRemotes` to teach
 *      the runtime where the remote lives, then `loadRemote` to
 *      resolve `mfe_suggestions/SuggestionsApp`.
 *
 * **Rollback**: the runtime reader `isMfeOnDemandBootstrapEnabled()`
 * still controls behaviour at runtime even after a build was made
 * with the flag on.  However, the build-time define cannot be undone
 * post-build — i.e. a build made with `__MFE_SUGGESTIONS_ON_DEMAND__ = true`
 * will always use THIS module's lazy path, even if the runtime env
 * later sets `MFE_ON_DEMAND_BOOTSTRAP=0`.  To fully roll back, redeploy
 * a build without the build-time flag.  The runtime flag is the
 * "additional safety net" that lets operators flip behaviour
 * deterministically; it is NOT a substitute for a clean rebuild when
 * the canary needs full reversal.
 *
 * **Idempotency**: `registerRemotes` is idempotent on identical remote
 * configs in `@module-federation/runtime@2.x`.  We still guard with
 * a module-level boolean so subsequent route mounts skip the
 * registration call.
 */

import React, { Suspense } from 'react';
import type { FC, PropsWithChildren } from 'react';

declare const __MFE_SUGGESTIONS_ON_DEMAND__: boolean;

const SUGGESTIONS_REMOTE_NAME = 'mfe_suggestions';
const SUGGESTIONS_REMOTE_KEY = `${SUGGESTIONS_REMOTE_NAME}/SuggestionsApp`;

let suggestionsRegistered = false;

/**
 * Read the suggestions remoteEntry URL from runtime env injected by
 * the index.html transform.  Falls back to localhost for dev.  The
 * lookup order mirrors the build-time `MFE_SUGGESTIONS_URL` env that
 * `vite.config.ts` already reads when assembling the federation
 * manifest in eager mode.
 */
function resolveSuggestionsRemoteEntry(): string {
  if (typeof window !== 'undefined') {
    const w = window as Window & { __env__?: Record<string, string> };
    const url = w.__env__?.MFE_SUGGESTIONS_URL ?? w.__env__?.VITE_MFE_SUGGESTIONS_URL ?? null;
    if (url) return url;
  }
  if (typeof process !== 'undefined' && process.env) {
    const url = process.env.MFE_SUGGESTIONS_URL ?? process.env.VITE_MFE_SUGGESTIONS_URL ?? null;
    if (url) return url;
  }
  // Dev fallback — matches default in apps/mfe-shell/vite.config.ts.
  return 'http://localhost:3001/remoteEntry.js';
}

/**
 * Lazy registration: invoke `@module-federation/runtime` `registerRemotes`
 * ONLY on first call.  Subsequent calls are no-ops thanks to the
 * `suggestionsRegistered` guard.
 *
 * We resolve the runtime import dynamically with `import()` so the
 * `@module-federation/runtime` package is not pulled into the shell's
 * eager critical bundle — it lands in its own chunk that ships only
 * when the canary path actually fires.
 */
async function ensureSuggestionsRegistered(): Promise<void> {
  if (suggestionsRegistered) return;
  const { registerRemotes } = await import('@module-federation/runtime');
  const entry = resolveSuggestionsRemoteEntry();
  registerRemotes([
    {
      name: SUGGESTIONS_REMOTE_NAME,
      entry,
      // type: 'esm' is the @module-federation/vite-emitted shape;
      // matches what the eager federation({remotes}) would have
      // declared.  Explicit avoids relying on runtime defaults.
      type: 'esm',
    },
  ]);
  suggestionsRegistered = true;
}

/**
 * Lazy React component for the on-demand canary path.
 *
 * Each first-time mount triggers the registration + loadRemote
 * sequence; subsequent navigations to/from the route are normal
 * React.lazy behaviour (cached module).
 */
const SuggestionsAppLazy = React.lazy(async () => {
  await ensureSuggestionsRegistered();
  const { loadRemote } = await import('@module-federation/runtime');
  const mod = await loadRemote<{ default: FC<PropsWithChildren> }>(SUGGESTIONS_REMOTE_KEY);
  if (!mod) {
    throw new Error(
      `[B5b1] loadRemote(${SUGGESTIONS_REMOTE_KEY}) returned null — remote may not be reachable. Check MFE_SUGGESTIONS_URL.`,
    );
  }
  // `loadRemote` returns the exposed module object; the consumer here
  // expects a React component (default export from
  // `mfe_suggestions/SuggestionsApp`).
  return { default: mod.default ?? (mod as unknown as FC) };
});

/**
 * Public export used by `lazy-routes.ts` when the on-demand canary
 * is active.  Wraps `SuggestionsAppLazy` in a Suspense fallback so
 * the parent route doesn't have to.
 *
 * The fallback is intentionally minimal — the surrounding `<AppRouter>`
 * already provides its own Suspense boundary for route-level lazy
 * loading.  This Suspense is just a defensive layer in case the
 * canary path is mounted outside the router (e.g. tests).
 */
export const SuggestionsAppOnDemand: FC = () => (
  <Suspense fallback={null}>
    <SuggestionsAppLazy />
  </Suspense>
);
SuggestionsAppOnDemand.displayName = 'SuggestionsAppOnDemand';

/**
 * Sanity-export so unit tests can assert the registered state without
 * importing internal module locals.  NOT part of the public API.
 *
 * @internal
 */
export function __getSuggestionsRegisteredForTests(): boolean {
  return suggestionsRegistered;
}

/**
 * Reset the registration guard between test cases.  Production code
 * MUST NOT call this; it would re-trigger registration on the next
 * render.
 *
 * @internal
 */
export function __resetSuggestionsRegisteredForTests(): void {
  suggestionsRegistered = false;
}

// Re-export the build-time flag for downstream consumers that want
// to branch on it without importing the runtime reader.  Note: this
// is the BUILD-TIME value; the runtime override happens at lazy-routes
// selection time, not here.
export const SUGGESTIONS_ON_DEMAND_BUILD_FLAG = __MFE_SUGGESTIONS_ON_DEMAND__;
