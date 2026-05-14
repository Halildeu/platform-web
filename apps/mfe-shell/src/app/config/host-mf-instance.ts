/**
 * PERF-INIT-V2 PR-B5b2-hostfix — single source of truth for host MF
 * runtime instance lookup.
 *
 * Bug context (Codex thread `019e2528` PARTIAL→AGREE):
 *
 * Before this module, 7 on-demand canary wrappers + the
 * `ensure-remote-shell-services` helper each had their own copy of
 * `getHostMfInstance()` that did exact-equality lookup
 * `instance.options.name === 'mfe_shell'`.  In production builds the
 * `@module-federation/vite` plugin emits the host instance with name
 * `__mfe_internal__mfe_shell` (an internal namespace prefix that does
 * NOT appear in unit-test environments where `__FEDERATION__` is mocked
 * manually).  Result: all 7 on-demand routes rendered classified
 * fallback in production, while every wrapper unit test passed.
 *
 * This single-source helper uses `isHostRuntimeName()` to accept both
 * the configured name (`mfe_shell`) AND any prefix-then-`__mfe_shell`
 * variant (`__mfe_internal__mfe_shell` today; future plugin prefixes
 * tolerated as long as they continue to use the `__<prefix>__` shape).
 *
 * Performance / DCE notes:
 *   - No top-level side effects: `globalThis.__FEDERATION__` is read
 *     ONLY when `getHostMfInstance()` is called.
 *   - Type imports for callers are co-located in this module so a
 *     consumer can `import type { MfHostInstance } from './host-mf-instance'`
 *     without paying the runtime cost of the lookup function.
 *   - No React / shell-services / admin-bootstrap-resolver imports.
 *     The host idle-deferred bundle ships this module once instead of
 *     the prior 8 duplicate copies.
 */

/** Configured host federation name in `apps/mfe-shell/vite.config.ts`. */
const HOST_NAME = 'mfe_shell';

/**
 * Re-export the configured host name for call-sites that want to
 * include it in error diagnostics without redeclaring the constant.
 */
export const CONFIGURED_HOST_NAME = HOST_NAME;

/**
 * Minimal interface for the host MF runtime instance — narrowed to
 * the two methods on-demand wrappers + ensure helper call.
 *
 * `registerRemotes` is invoked by the ensure helper to lazily register
 * an on-demand remote at route-time; wrappers only call `loadRemote`
 * after the ensure helper has resolved.
 */
export interface MfHostInstance {
  options: { name: string };
  registerRemotes(
    remotes: Array<{ name: string; entry: string; type?: string }>,
    options?: { force?: boolean },
  ): void;
  loadRemote<T = unknown>(key: string): Promise<T | null>;
}

/**
 * Shape of the global federation registry we care about.  The runtime
 * may attach additional fields (`__GLOBAL_PLUGIN__`, `__SHARE__`,
 * `__MANIFEST_LOADING__`, `__PRELOADED_MAP__`, `moduleInfo`) — we do
 * not depend on any of them.
 */
export interface FederationGlobal {
  __INSTANCES__?: Array<MfHostInstance & { name?: string }>;
}

/**
 * True if `name` is the configured host name OR any
 * `<prefix>__mfe_shell` variant (e.g. `__mfe_internal__mfe_shell`
 * emitted by `@module-federation/vite` in production builds).
 *
 * Exported for the dedicated unit test in
 * `__tests__/host-mf-instance.test.ts`.  Wrapper / helper consumers
 * should call `getHostMfInstance()` instead — they should not need to
 * inspect candidate names directly.
 */
export function isHostRuntimeName(name: unknown): name is string {
  if (typeof name !== 'string') return false;
  if (name === HOST_NAME) return true;
  // `__<prefix>__mfe_shell` — anchored on the configured host name as
  // the SUFFIX, with at least one preceding underscore-separated
  // prefix segment.  `endsWith` alone would accept `myshell` which is
  // wrong; require `__` separator before the host name to scope to
  // plugin-prefix conventions.
  return name.endsWith(`__${HOST_NAME}`);
}

/**
 * Internal: read the federation global without paying for type
 * gymnastics at every call-site.
 */
function readFederationGlobal(): FederationGlobal | undefined {
  const root: typeof globalThis & { __FEDERATION__?: FederationGlobal } =
    typeof globalThis === 'object' ? globalThis : (window as unknown as typeof globalThis);
  return (root as { __FEDERATION__?: FederationGlobal }).__FEDERATION__;
}

/**
 * Resolve the host MF runtime instance from
 * `globalThis.__FEDERATION__.__INSTANCES__` using the
 * `isHostRuntimeName` predicate.  Returns `null` when no
 * host-shaped name is present (test environments without runtime
 * bootstrap, or pre-MF setup error).
 *
 * Why `find` (not `index[0]`): the host's array position is not a
 * runtime invariant the federation plugin guarantees; the name (or its
 * prefixed runtime form) IS.  Codex thread `019e2528` PARTIAL: prefer
 * the name predicate so a future "multiple hosts" or re-ordered
 * registry layout does not silently shift the lookup target.
 */
export function getHostMfInstance(): MfHostInstance | null {
  const federation = readFederationGlobal();
  const instances = federation?.__INSTANCES__ ?? [];
  return (
    instances.find((instance) => {
      const candidateName =
        (instance as MfHostInstance).options?.name ??
        (instance as { name?: string }).name;
      return isHostRuntimeName(candidateName);
    }) ?? null
  );
}

/**
 * List the `options.name` of every instance currently registered in
 * `__FEDERATION__.__INSTANCES__`.  Used by ensure-remote-shell-services
 * to enrich the "host not found" error with the actual candidates so a
 * future name-shape change can be diagnosed from a single console
 * message instead of requiring live `globalThis` inspection.
 */
export function listHostMfInstanceCandidates(): string[] {
  const federation = readFederationGlobal();
  const instances = federation?.__INSTANCES__ ?? [];
  return instances.map((instance) => {
    const name =
      (instance as MfHostInstance).options?.name ??
      (instance as { name?: string }).name;
    return typeof name === 'string' ? name : '<unnamed>';
  });
}
