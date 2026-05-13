/**
 * PERF-INIT-V2 PR-B5b2-prep — Route-level ensure helper for on-demand
 * shell-services configuration.
 *
 * Context (Codex thread `019e2358` AGREE Option B + 3 critical adds):
 *
 * When `__MFE_ADMIN_REMOTES_ON_DEMAND__` is true, the 4 admin remotes
 * (mfe_users, mfe_audit, mfe_access, mfe_reporting) are omitted from
 * the federation manifest at build time, AND their `shell-services`
 * static imports are gated behind the same define in
 * `shell-services-wiring.ts`.  The idle-deferred batch wiring path
 * picks them up post-auth, but a deep-link to `/admin/users` can race
 * the idle callback — the route component would mount before its
 * remote's `configureShellServices(sharedServices)` runs.
 *
 * This helper provides a route-level safety net: each on-demand admin
 * wrapper calls `ensureRemoteShellServicesConfigured(remoteName)`
 * BEFORE loading the route component.  The helper:
 *
 *   - Returns immediately if the remote has already been configured.
 *   - Otherwise registers the remote (idempotent in MF runtime
 *     `@module-federation/runtime@2.x` for identical config) and
 *     loads `${remote}/shell-services` via the host MF runtime
 *     instance.
 *   - Calls `configureShellServices(sharedServices)` exactly once
 *     per remote (subsequent calls are no-ops).
 *
 * The same helper is called by `shell-services-wiring.ts`'s idle
 * batch loader so the two entry points share semantics + state.
 *
 * Rollback semantic: same as B5b1 — `__MFE_ADMIN_REMOTES_ON_DEMAND__`
 * is build-time DCE'd; once a build has been made with the flag on,
 * the static-import branch is removed from the bundle.  Full rollback
 * requires rebuild with the flag off.
 */

// Generic type for shared services — caller provides shape;
// helper just passes through to remote.configureShellServices.

/**
 * Shape of the MF host instance we use — narrowed to the two methods
 * we call.  Mirrors the type used by B5b1's
 * `createSuggestionsAppOnDemand.tsx` (kept in sync deliberately;
 * future factory refactor could share a single type).
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

const HOST_NAME = 'mfe_shell';

/**
 * Resolve the host MF runtime instance from the global registry.
 * Returns `null` when no host instance is present (test environment
 * without runtime bootstrap, or pre-MF setup error).
 */
function getHostMfInstance(): MfHostInstance | null {
  const root: typeof globalThis & { __FEDERATION__?: FederationGlobal } =
    typeof globalThis === 'object' ? globalThis : (window as unknown as typeof globalThis);
  const federation = (root as { __FEDERATION__?: FederationGlobal }).__FEDERATION__;
  const instances = federation?.__INSTANCES__ ?? [];
  return instances.find((i) => i.options.name === HOST_NAME) ?? null;
}

/**
 * Per-remote configured-once guard map.  Once a remote's
 * `configureShellServices` has been called, subsequent ensure calls
 * for the same remote are no-ops.
 */
const configuredRemotes = new Set<string>();

/**
 * Per-remote in-flight promise map.  Prevents racing parallel
 * ensure calls for the same remote (e.g. idle batch + deep-link
 * route render firing simultaneously).
 */
const inflightConfigurations = new Map<string, Promise<void>>();

interface ConfigureShellServicesModule {
  configureShellServices?: (services: unknown) => void;
}

/**
 * Idempotent ensure: register + load `${remote}/shell-services` via
 * host MF runtime, then call `configureShellServices(sharedServices)`
 * exactly once.  Safe to call from:
 *
 *   - Route-level on-demand wrappers (deep-link race protection)
 *   - shell-services-wiring idle batch loader (post-auth pre-warm)
 *   - Multiple call sites in parallel (in-flight promise map dedupes)
 *
 * Throws on host instance missing or load failure; wrap in try/catch
 * at the call site if you want to surface a classified fallback (the
 * idle batch loader does this in shell-services-wiring.ts).
 *
 * @param remoteName Full federation name (e.g. `'mfe_users'`).
 * @param remoteEntryUrl Runtime URL of the remote's `remoteEntry.js`.
 * @param sharedServices The shared services object to pass to the
 *                       remote's `configureShellServices` function.
 */
export async function ensureRemoteShellServicesConfigured(
  remoteName: string,
  remoteEntryUrl: string,
  sharedServices: unknown,
): Promise<void> {
  if (configuredRemotes.has(remoteName)) return;

  // Deduplication: if a parallel call is already in flight for this
  // remote, await its promise instead of re-issuing the register+load.
  const existing = inflightConfigurations.get(remoteName);
  if (existing) {
    await existing;
    return;
  }

  const work = (async (): Promise<void> => {
    const host = getHostMfInstance();
    if (!host) {
      throw new Error(
        `[B5b2-prep] Host MF runtime instance "${HOST_NAME}" not initialized — ` +
          `cannot ensure shell-services for "${remoteName}".`,
      );
    }
    // Register the remote (idempotent in MF runtime 2.x for identical
    // config — but our `configuredRemotes` guard prevents repeat
    // ensures anyway).
    host.registerRemotes([
      {
        name: remoteName,
        entry: remoteEntryUrl,
        type: 'esm',
      },
    ]);
    const mod = await host.loadRemote<ConfigureShellServicesModule>(`${remoteName}/shell-services`);
    if (!mod) {
      throw new Error(
        `[B5b2-prep] loadRemote(${remoteName}/shell-services) returned null — ` +
          `remote may not be reachable.  Check the remote's runtime URL.`,
      );
    }
    if (typeof mod.configureShellServices !== 'function') {
      throw new Error(
        `[B5b2-prep] ${remoteName}/shell-services module does not export ` +
          `\`configureShellServices\`.  Remote contract violation.`,
      );
    }
    mod.configureShellServices(sharedServices);
    configuredRemotes.add(remoteName);
  })();

  inflightConfigurations.set(remoteName, work);
  try {
    await work;
  } finally {
    inflightConfigurations.delete(remoteName);
  }
}

/**
 * Test-only export: returns whether a remote has been configured.
 * NOT part of the public API.
 *
 * @internal
 */
export function __isRemoteShellServicesConfiguredForTests(remoteName: string): boolean {
  return configuredRemotes.has(remoteName);
}

/**
 * Reset the configured-remotes set between test cases.  Production
 * code MUST NOT call this; remote configuration is one-shot per
 * remote per page load.
 *
 * @internal
 */
export function __resetRemoteShellServicesConfiguredForTests(): void {
  configuredRemotes.clear();
  inflightConfigurations.clear();
}
