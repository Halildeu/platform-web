import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  ENDPOINT_ADMIN_NAV,
  ENDPOINT_ADMIN_BASE,
  isRemoteViewPath,
  resolveActiveNavPath,
  resolveEndpointAdminTo,
} from '../endpoint-admin-nav.config';
import { createEndpointAdminT } from '../../../i18n';
import {
  ENDPOINT_ADMIN_ROUTES,
  FLEET_DISCOVERABLE_PATHS,
} from '../../router/endpoint-admin-routes';

/**
 * Guards the Faz 22 product-surface IA nav (platform-web #922 slice S1) against
 * the ways it silently rots: a nav item pointing at a route that doesn't exist
 * (dead link), a shippable fleet route left OUT of the nav (the "built but
 * invisible" gap the owner goal targets), a label whose i18n key was never added
 * (raw-key leak), and active-state that mis-highlights. The route manifest is the
 * single source of truth; drift from the actual router `<Route>` set fails here.
 */

const tTr = createEndpointAdminT('tr');
const tEn = createEndpointAdminT('en');
const allItems = ENDPOINT_ADMIN_NAV.flatMap((section) => section.items);
const navPaths = allItems.map((item) => item.path);

describe('endpoint-admin IA nav config (platform-web #922 S1)', () => {
  it('mounts at the shell-provided endpoint-admin base', () => {
    expect(ENDPOINT_ADMIN_BASE).toBe('/endpoint-admin');
  });

  it('nav paths EXACTLY equal the manifest fleet+discoverable routes (both directions)', () => {
    // ⊆ : no dead nav links. ⊇ : no shippable fleet surface left invisible.
    expect([...navPaths].sort()).toEqual([...FLEET_DISCOVERABLE_PATHS].sort());
  });

  it('route manifest matches the router declared <Route> paths (no drift)', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, '../../router/EndpointAdminRouter.tsx'), 'utf8');
    const routerPaths: string[] = [];
    const routeRegex = /<Route\s+path="([^"]+)"/g;
    let match = routeRegex.exec(src);
    while (match !== null) {
      if (match[1] !== '*') routerPaths.push(match[1]);
      match = routeRegex.exec(src);
    }
    expect([...routerPaths].sort()).toEqual(
      [...ENDPOINT_ADMIN_ROUTES.map((route) => route.path)].sort(),
    );
  });

  it('resolves every section + item label in tr and en (no raw-key leak)', () => {
    const keys = [
      ...ENDPOINT_ADMIN_NAV.map((section) => section.titleKey),
      ...allItems.map((item) => item.labelKey),
    ];
    for (const key of keys) {
      expect(tTr(key), `missing tr translation for ${key}`).not.toBe(key);
      expect(tEn(key), `missing en translation for ${key}`).not.toBe(key);
    }
  });

  it('has unique, relative, non-empty keys and paths', () => {
    const keys = allItems.map((item) => item.key);
    expect(new Set(keys).size, 'duplicate item keys').toBe(keys.length);
    expect(new Set(navPaths).size, 'duplicate item paths').toBe(navPaths.length);
    for (const item of allItems) {
      expect(item.path, `empty path for ${item.key}`).not.toBe('');
      expect(item.path.startsWith('/'), `path "${item.path}" must be router-relative`).toBe(false);
    }
  });
});

describe('resolveActiveNavPath', () => {
  it('picks the longest matching path under the shell mount', () => {
    expect(resolveActiveNavPath('/endpoint-admin/compliance/policies', navPaths)).toBe(
      'compliance/policies',
    );
    expect(resolveActiveNavPath('/endpoint-admin/compliance/gaps', navPaths)).toBe(
      'compliance/gaps',
    );
    expect(resolveActiveNavPath('/endpoint-admin/compliance', navPaths)).toBe('compliance');
  });

  it('works standalone (no /endpoint-admin prefix)', () => {
    expect(resolveActiveNavPath('/compliance/policies', navPaths)).toBe('compliance/policies');
    expect(resolveActiveNavPath('/devices', navPaths)).toBe('devices');
  });

  it('ignores a trailing slash and highlights the parent of a detail route', () => {
    expect(resolveActiveNavPath('/endpoint-admin/compliance/policies/', navPaths)).toBe(
      'compliance/policies',
    );
    expect(resolveActiveNavPath('/endpoint-admin/compliance/policies/123', navPaths)).toBe(
      'compliance/policies',
    );
  });

  it('does not partial-match across a segment boundary', () => {
    expect(resolveActiveNavPath('/endpoint-admin/devices-extra', navPaths)).toBe('');
    expect(resolveActiveNavPath('/endpoint-admin/unknown', navPaths)).toBe('');
  });
});

describe('resolveEndpointAdminTo (mount-aware absolute target)', () => {
  it('prefixes the shell base for a sibling, not the current path', () => {
    // The bug this guards: react-router relative resolution under the
    // /endpoint-admin/* splat would append -> /endpoint-admin/devices/status.
    expect(resolveEndpointAdminTo('/endpoint-admin/devices', 'status')).toBe(
      '/endpoint-admin/status',
    );
    expect(resolveEndpointAdminTo('/endpoint-admin/compliance/policies', 'audit')).toBe(
      '/endpoint-admin/audit',
    );
    expect(resolveEndpointAdminTo('/endpoint-admin', 'devices')).toBe('/endpoint-admin/devices');
  });

  it('emits a root-relative target when standalone', () => {
    expect(resolveEndpointAdminTo('/devices', 'status')).toBe('/status');
    expect(resolveEndpointAdminTo('/compliance/policies', 'audit')).toBe('/audit');
  });
});

describe('isRemoteViewPath', () => {
  it('recognizes only the session-bound VIEW_ONLY route', () => {
    expect(isRemoteViewPath('/endpoint-admin/remote-access/sessions/session-1/view')).toBe(true);
    expect(isRemoteViewPath('/remote-access/sessions/session-1/view')).toBe(true);
    expect(isRemoteViewPath('/endpoint-admin/remote-access/sessions/session-1/view/')).toBe(true);
  });

  it('does not classify fleet or malformed paths as restricted remote view', () => {
    expect(isRemoteViewPath('/endpoint-admin/devices')).toBe(false);
    expect(isRemoteViewPath('/endpoint-admin/remote-access/sessions/session-1')).toBe(false);
    expect(isRemoteViewPath('/endpoint-admin/remote-access/sessions/a/b/view')).toBe(false);
  });
});

/**
 * Faz 22 slice S5 — pin the mount's index-landing + wildcard fallback (platform-web
 * #922). The overview dashboard is the index; mounting the full lazy router in a
 * unit test is too heavy (every page pulls the store + AG-Grid setup), so we assert
 * the source contract here (the behavioral index-landing lives in the overview page
 * test, where the api module is mocked). The manifest ⇄ router drift guard above
 * still covers the `<Route path>` set.
 */
describe('EndpointAdminRouter index + wildcard contract (source)', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const routerSrc = readFileSync(resolve(here, '../../router/EndpointAdminRouter.tsx'), 'utf8');

  it('lands the index route on the overview page', () => {
    expect(routerSrc).toMatch(
      /<Route\s+index\s+element=\{<Navigate\s+to="overview"\s+replace\s*\/>\}/,
    );
  });

  it('declares an explicit overview route', () => {
    expect(routerSrc).toMatch(/<Route\s+path="overview"\s+element=\{<EndpointOverviewPage\s*\/>\}/);
  });

  it('keeps devices on its own route (a known child stays put)', () => {
    expect(routerSrc).toMatch(/<Route\s+path="devices"\s+element=\{<EndpointDevicesPage\s*\/>\}/);
  });

  it('redirects an unknown child to devices', () => {
    expect(routerSrc).toMatch(
      /<Route\s+path="\*"\s+element=\{<Navigate\s+to="devices"\s+replace\s*\/>\}/,
    );
  });
});
