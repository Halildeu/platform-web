const ETHICS_MANAGER_ROUTE_SCOPE = 'openid ethics-manager-audience ethics:case:manage';
const BUDGET_PLANNER_ROUTE_SCOPE = 'openid budget:read budget:write';

/**
 * Returns the optional OIDC scopes required by an exact privileged product
 * route. The same decision is used by both interactive login and silent-SSO
 * bootstrap so a reload cannot replace a route-scoped token with the
 * frontend client's default-scope token.
 */
export const resolveKeycloakRouteScope = (redirectUri: string): string | undefined => {
  try {
    const path = new URL(redirectUri, 'https://invalid.local').pathname;
    if (path === '/ethic' || path.startsWith('/ethic/')) {
      return ETHICS_MANAGER_ROUTE_SCOPE;
    }
    if (
      path === '/admin/reports/budget-control' ||
      path.startsWith('/admin/reports/budget-control/') ||
      path === '/reports/budget-control' ||
      path.startsWith('/reports/budget-control/')
    ) {
      return BUDGET_PLANNER_ROUTE_SCOPE;
    }
  } catch {
    // Invalid URLs receive no optional scope. Keycloak keeps ownership of
    // redirect URI validation.
  }
  return undefined;
};
