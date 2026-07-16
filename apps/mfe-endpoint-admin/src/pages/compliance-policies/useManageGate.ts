import { getShellServices, type ShellModuleLevel } from '../../app/services/shell-services';

/**
 * WEB-014C / #922 S4b — frontend MANAGE gate for endpoint-admin mutating actions.
 *
 * RUNTIME TRUTH (Codex 019f67ba, verified against the wiring): under shell-mount
 * the shell injects its WHOLE auth object BY REFERENCE via
 * `configureShellServices`, so `getModuleLevel('ENDPOINT_ADMIN')` and
 * `isSuperAdmin()` ARE live functions over the shell's authzSnapshot
 * (from `/v1/authz/me`) — the remote type now names them (optional) instead of
 * reaching them through a cast. In the STANDALONE noop bootstrap the fallback
 * auth has neither.
 *
 * Contract (deliberately PERMISSIVE — an ergonomics layer, NOT a security
 * boundary; the backend `can_manage` relation gates the mutation endpoints and a
 * 403 surfaces as a toast):
 *   - super-admin              → true (short-circuits; `getModuleLevel` not read)
 *   - explicit level `'VIEW'`  → false   ← the ONLY deny path
 *   - `'MANAGE'`               → true
 *   - `'NONE'`                 → true (fail-open: `'NONE'` is ambiguous — the
 *                                shell returns it for an unhydrated snapshot and a
 *                                legacy `allowedModules`-only grant too, so denying
 *                                it would wrongly lock legitimate operators)
 *   - method absent / standalone / any throw → true
 */
export function useManageGate(): boolean {
  try {
    const { auth } = getShellServices();
    if (!auth) return true;
    if (typeof auth.isSuperAdmin === 'function' && auth.isSuperAdmin()) {
      return true;
    }
    if (typeof auth.getModuleLevel === 'function') {
      const level: ShellModuleLevel = auth.getModuleLevel('ENDPOINT_ADMIN');
      if (level === 'VIEW') return false;
      return true;
    }
    return true;
  } catch {
    return true;
  }
}
