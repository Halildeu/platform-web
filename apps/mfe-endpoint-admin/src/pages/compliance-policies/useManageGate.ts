import { getShellServices } from '../../app/services/shell-services';

/**
 * WEB-014C — Frontend MANAGE gate for the policy CRUD page.
 *
 * Codex 019e6e10 iter-1 RED absorb: the shared shell-services contract
 * (`SharedShellServices.auth` / `RemoteShellServices.auth`) does NOT
 * yet expose `getModuleLevel(module)`; wiring that getter through the
 * shell is a separate change. Until that lands, the only authoritative
 * MANAGE signal the remote can read is `isSuperAdmin()`. To avoid
 * false-negatives that would block legitimate MANAGE-level operators
 * from using the page, the frontend gate runs in PERMISSIVE mode by
 * default: it returns `true` UNLESS the shell explicitly signals
 * `VIEW` via the future `getModuleLevel` API.
 *
 * Backend remains authoritative (`can_manage` relation gates the
 * mutation endpoints); 403 responses surface as dialog toasts. The
 * frontend gate is therefore an ergonomics layer, not a security
 * boundary — a permissive default is the right failure mode here.
 *
 * When the shell-side `getModuleLevel` wiring lands as a follow-up,
 * this hook tightens automatically: explicit `'VIEW'` returns `false`,
 * everything else (`'MANAGE'`, super admin, missing API) stays
 * permissive and only the explicit VIEW signal disables the page
 * mutations.
 */
export function useManageGate(): boolean {
  try {
    const services = getShellServices();
    const auth = services.auth as
      | {
          getModuleLevel?: (mod: string) => string | null | undefined;
          isSuperAdmin?: () => boolean;
        }
      | undefined;
    if (!auth) return true;
    if (typeof auth.isSuperAdmin === 'function' && auth.isSuperAdmin()) {
      return true;
    }
    if (typeof auth.getModuleLevel === 'function') {
      const level = auth.getModuleLevel('ENDPOINT_ADMIN');
      if (level === 'VIEW') return false;
      return true;
    }
    return true;
  } catch {
    return true;
  }
}
