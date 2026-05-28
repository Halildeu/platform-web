import { getShellServices } from '../../app/services/shell-services';

/**
 * WEB-014C — Frontend MANAGE gate for the policy CRUD page.
 *
 * Pulls the module-level permission from the shell-injected
 * `auth.getModuleLevel('ENDPOINT_ADMIN')` getter (matches the shared
 * `PermissionProvider` contract — see Codex 019e6dff iter-1 §B).
 * Returns `true` only when the level is `'MANAGE'` (or the user is a
 * super admin — same as the shell-side gate).
 *
 * Frontend-only — backend remains authoritative (`can_manage`
 * relation), and any mutation that slips through still surfaces 403
 * via the dialog toasts.
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
    if (!auth) return false;
    if (typeof auth.isSuperAdmin === 'function' && auth.isSuperAdmin()) {
      return true;
    }
    if (typeof auth.getModuleLevel === 'function') {
      return auth.getModuleLevel('ENDPOINT_ADMIN') === 'MANAGE';
    }
    return false;
  } catch {
    // Shell services not yet configured (standalone dev) — fail closed.
    return false;
  }
}
