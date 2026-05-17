/**
 * OpenFGA module keys — matches backend PermissionCatalogService.
 * Used with usePermissions().hasModule() from @mfe/auth.
 *
 * @deprecated Legacy string constants below kept for backward compat.
 * Prefer MODULE_KEYS for new code.
 */
export const MODULE_KEYS = {
  USER_MANAGEMENT: 'USER_MANAGEMENT',
  ACCESS: 'ACCESS',
  AUDIT: 'AUDIT',
  REPORT: 'REPORT',
  WAREHOUSE: 'WAREHOUSE',
  PURCHASE: 'PURCHASE',
  THEME: 'THEME',
  /**
   * ENDPOINT_ADMIN — uppercase enum key consumed via
   * `usePermissions().hasModule()` (backend-mapped from
   * `/v1/authz/me`). Distinct from the OpenFGA tuple object id, which
   * is kebab-case `module:endpoint-admin` (see `EndpointAdminAuthz.MODULE`
   * on the backend). Auth-service is responsible for keeping the two
   * in sync per Faz 22.1.1b.
   */
  ENDPOINT_ADMIN: 'ENDPOINT_ADMIN',
  /**
   * SUGGESTIONS / ETHIC — the Öneriler and Etik remote MFEs are
   * permission-gated features (backend PermissionCatalogService modules,
   * ADMIN gets MANAGE by default). Gate the nav, search and route guards
   * on these keys; without them the features leak to every authenticated
   * user.
   */
  SUGGESTIONS: 'SUGGESTIONS',
  ETHIC: 'ETHIC',
} as const;

export type ModuleKey = keyof typeof MODULE_KEYS;

/**
 * Legacy PERMISSIONS removed — all access checks now use MODULE_KEYS
 * with usePermissions().hasModule() from @mfe/auth.
 * See: STORY-0318, Faz 5 cleanup.
 */
