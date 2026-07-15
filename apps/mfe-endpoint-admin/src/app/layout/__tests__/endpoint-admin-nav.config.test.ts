import { describe, it, expect } from 'vitest';
import { ENDPOINT_ADMIN_NAV, ENDPOINT_ADMIN_BASE } from '../endpoint-admin-nav.config';
import { createEndpointAdminT } from '../../../i18n';

/**
 * Guards the Faz 22 product-surface IA nav (platform-web #922 slice S1) against
 * the two ways it silently rots: a nav item pointing at a route that doesn't
 * exist (dead link), and a label whose i18n key was never added (raw-key leak to
 * the user). Both are "looks wired but isn't" failures the owner goal targets.
 */

// Fleet-level routes declared in `router/EndpointAdminRouter.tsx` that the IA
// nav is allowed to target. Device-/session-scoped routes (remote-response,
// remote-access viewer, device-scoped uninstall/approval-case, propose-form)
// are intentionally excluded — they need a device/session context (slice S2).
// Keep in sync with the router when fleet routes change.
const ROUTER_FLEET_PATHS = new Set([
  'status',
  'devices',
  'audit',
  'compliance',
  'compliance/policies',
  'compliance/gaps',
  'approvals',
  'enrollments',
  'catalog/items',
  'agent-updates/releases',
  'software-bundles',
  'outdated-software-list',
  'prohibited-software-list',
  'software-diff-list',
]);

const tTr = createEndpointAdminT('tr');
const tEn = createEndpointAdminT('en');
const allItems = ENDPOINT_ADMIN_NAV.flatMap((section) => section.items);

describe('endpoint-admin IA nav config (platform-web #922 S1)', () => {
  it('mounts at the shell-provided endpoint-admin base', () => {
    expect(ENDPOINT_ADMIN_BASE).toBe('/endpoint-admin');
  });

  it('targets only real fleet-level router routes (no dead nav links)', () => {
    for (const item of allItems) {
      expect(
        ROUTER_FLEET_PATHS.has(item.path),
        `nav item "${item.key}" path "${item.path}" is not a declared fleet route`,
      ).toBe(true);
    }
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
    const paths = allItems.map((item) => item.path);
    expect(new Set(keys).size, 'duplicate item keys').toBe(keys.length);
    expect(new Set(paths).size, 'duplicate item paths').toBe(paths.length);
    for (const item of allItems) {
      expect(item.path, `empty path for ${item.key}`).not.toBe('');
      expect(item.path.startsWith('/'), `path "${item.path}" must be router-relative`).toBe(false);
    }
  });
});
