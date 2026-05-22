import React, { Suspense } from 'react';
import type { ComponentType, FC } from 'react';
import { createLazyRemoteModule } from './createLazyRemoteModule';
import { getSharedShellServices } from './config/shell-services-wiring';

/**
 * Faz 22 #655 — endpoint-admin route-level shell-services race protection.
 *
 * `mfe_endpoint_admin` is an EAGER federation remote (declared in the
 * shell's `federation({remotes})` manifest), unlike the on-demand admin
 * remotes (users / access / audit / reporting) which load via the host MF
 * runtime.
 *
 * The shell injects the auth token resolver into the remote by loading
 * `mfe_endpoint_admin/shell-services` and calling
 * `configureShellServices(sharedServices)` (which `registerAuthTokenResolver`s
 * the shell token into the remote's `@mfe/shared-http` instance). That
 * wiring runs in a DEFERRED idle window (`shell-services-wiring.ts` PR-B3a
 * idle deferral).
 *
 * A deep-link / fresh load to `/endpoint-admin/*` mounts `EndpointAdminApp`
 * and fires its RTK Query requests BEFORE the idle wiring runs → no
 * resolver → `resolveAuthToken()` returns null → no `Authorization: Bearer`
 * header → backend 401 (RTK Query has no auto-retry → permanent error
 * state). See platform-web#655.
 *
 * Fix — mirror the `createUsersAppOnDemand` precedent (route-level
 * `await ensureRemoteShellServicesConfigured` before the App loads): the
 * lazy loader below `await`s `configureShellServices` BEFORE importing
 * `EndpointAdminApp`, so the auth resolver is registered before any query
 * fires. `configureShellServices` is idempotent (it just re-sets the
 * services object + re-registers the resolver), so the idle-batch call and
 * this route-level call converge harmlessly.
 *
 * The federation specifiers (`import('mfe_endpoint_admin/...')`) are passed
 * in as loader callbacks from `lazy-routes.ts`, where they stay behind the
 * `__SHELL_ENDPOINT_ADMIN_REMOTE_ENABLED__` compile-time gate — a build
 * with the remote disabled (prod, Faz 22 deferred) dead-code-eliminates
 * them so Rolldown never sees an unresolvable specifier. This file itself
 * carries no federation specifiers (loaders are typed abstractly).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- federated remote App, arbitrary props (mirrors createLazyRemoteModule's RemoteModule)
type EndpointAdminAppModule = { default: ComponentType<any> };

/**
 * Build an `EndpointAdminApp` route component that injects the shell
 * auth-token resolver into the endpoint-admin remote BEFORE the App
 * renders and fires its first query.
 *
 * @param appLoader            `() => import('mfe_endpoint_admin/EndpointAdminApp')`
 * @param shellServicesLoader  `() => import('mfe_endpoint_admin/shell-services')`
 *                             — resolved module is duck-typed for its
 *                             `configureShellServices` export.
 */
export function createEndpointAdminApp(
  appLoader: () => Promise<EndpointAdminAppModule>,
  shellServicesLoader: () => Promise<unknown>,
): FC {
  const EndpointAdminLazy = createLazyRemoteModule('EndpointAdmin', async () => {
    // Deep-link race protection: inject the shell auth-token resolver
    // into the remote before EndpointAdminApp mounts + fires queries.
    try {
      const shellServices = (await shellServicesLoader()) as {
        configureShellServices?: (services: unknown) => void;
      };
      shellServices.configureShellServices?.(getSharedShellServices());
    } catch (error) {
      // Non-fatal: EndpointAdminApp still loads. A genuine config
      // failure surfaces as the page's own error state rather than
      // blocking the route render.
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[shell] mfe_endpoint_admin shell-services preconfigure failed', error);
      }
    }
    return appLoader();
  });

  const EndpointAdminApp: FC = () => (
    <Suspense fallback={null}>
      <EndpointAdminLazy />
    </Suspense>
  );
  EndpointAdminApp.displayName = 'EndpointAdminApp';
  return EndpointAdminApp;
}

export default createEndpointAdminApp;
