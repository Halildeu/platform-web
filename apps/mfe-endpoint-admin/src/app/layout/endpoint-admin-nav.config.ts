import type { ComponentType } from 'react';
import {
  IconTable,
  IconChart,
  IconFolder,
  IconFile,
  IconDownload,
  IconClock,
  IconLock,
  IconRefresh,
  IconShield,
  IconInfo,
  IconSettings,
  IconWarning,
  IconSearch,
  type IconProps,
} from '@mfe/design-system/icons';

/**
 * In-MFE information architecture for the endpoint-admin domain.
 *
 * Faz 22 product-surface completion (platform-web #922, owner goal 2026-07-15,
 * Codex istişare 019f67ba). Before this, only `/endpoint-admin/devices` had a
 * shell mega-menu entry; the remaining ~13 fully-built, backend-wired routes
 * (device enrollment, catalog authoring, agent-update releases, software bundles,
 * the compliance suite, fleet software-triage, fleet audit, service status) were
 * reachable ONLY by typing the URL — invisible to authorized users. This is the
 * domain's own left-nav (rendered by {@link EndpointAdminLayout} via the
 * design-system `AppSidebar`), so every shipped fleet-level surface is
 * discoverable. The shell keeps its single "Uç Birim Yönetimi" entry.
 *
 * Grouping mirrors the industry-standard UEM console IA (Intune / Action1 /
 * NinjaOne / ManageEngine Endpoint Central): Devices · Software & Deployment ·
 * Security & Compliance · Audit.
 *
 * The approval inbox is deliberately NOT surfaced here yet: its page still runs
 * on a mock actor + a browser-localStorage policy-approval pilot (not the real
 * backend maker-checker queue), so listing it fleet-wide would be false
 * discoverability. It returns once real OpenFGA authz + a backend-backed global
 * inbox land (slice S3).
 *
 * Device- and session-scoped surfaces (remote-response terminal, VIEW_ONLY
 * viewer, device-scoped uninstall/approval-case pages) are intentionally NOT
 * here — they require a device/session context and are reached from the device
 * grid drawer + contextual launchers (slice S2). Listing them fleet-wide would
 * land the user on a fail-closed/param-less page.
 */
export interface EndpointAdminNavItem {
  /** Stable key (also the test id suffix). */
  key: string;
  /** i18n key resolved via `useEndpointAdminI18n().t`. */
  labelKey: string;
  /** Path relative to the `/endpoint-admin` mount, e.g. `catalog/items`. */
  path: string;
  icon: ComponentType<IconProps>;
}

export interface EndpointAdminNavSection {
  key: string;
  titleKey: string;
  items: EndpointAdminNavItem[];
}

/** Base mount the shell gives the endpoint-admin remote. */
export const ENDPOINT_ADMIN_BASE = '/endpoint-admin';

/**
 * Normalise an absolute location to a router-relative path — strips the optional
 * shell mount (`/endpoint-admin`) and surrounding slashes. `/endpoint-admin` and
 * `/` both normalise to `''`.
 */
export function toRelativePath(pathname: string): string {
  const trimmed = pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  const baseBare = ENDPOINT_ADMIN_BASE.replace(/^\/+/, ''); // 'endpoint-admin'
  if (trimmed === baseBare) return '';
  if (trimmed.startsWith(`${baseBare}/`)) return trimmed.slice(baseBare.length + 1);
  return trimmed;
}

/**
 * Absolute navigation target for a nav item, aware of whether the layout is
 * mounted under the shell (`/endpoint-admin/*`) or standalone (`/*`, dev 3009).
 *
 * Used as a plain `href` — NOT react-router relative resolution: under a
 * multi-segment splat route (`/endpoint-admin/*`) a relative `to` appends to the
 * CURRENT location (`/endpoint-admin/devices/status`) instead of resolving a
 * sibling. Computing the absolute target explicitly avoids that.
 */
export function resolveEndpointAdminTo(pathname: string, itemPath: string): string {
  const shellMounted =
    pathname === ENDPOINT_ADMIN_BASE || pathname.startsWith(`${ENDPOINT_ADMIN_BASE}/`);
  return `${shellMounted ? ENDPOINT_ADMIN_BASE : ''}/${itemPath}`;
}

/**
 * The active nav item for the current absolute location. Base-agnostic:
 * normalises to a router-relative path, then longest boundary-match so
 * `compliance/policies` beats `compliance`, a trailing slash is ignored, and a
 * detail route (`compliance/policies/123`) still highlights its parent item.
 * Pure so {@link EndpointAdminLayout} stays declarative + this is unit-testable.
 */
export function resolveActiveNavPath(pathname: string, navPaths: readonly string[]): string {
  const rel = toRelativePath(pathname);
  const matches = navPaths.filter((path) => rel === path || rel.startsWith(`${path}/`));
  return matches.sort((a, b) => b.length - a.length)[0] ?? '';
}

export const ENDPOINT_ADMIN_NAV: EndpointAdminNavSection[] = [
  {
    key: 'devices',
    titleKey: 'endpointAdmin.nav.section.devices',
    items: [
      { key: 'devices', labelKey: 'endpointAdmin.nav.devices', path: 'devices', icon: IconTable },
      { key: 'status', labelKey: 'endpointAdmin.nav.status', path: 'status', icon: IconChart },
    ],
  },
  {
    key: 'software',
    titleKey: 'endpointAdmin.nav.section.software',
    items: [
      {
        key: 'catalog',
        labelKey: 'endpointAdmin.nav.catalog',
        path: 'catalog/items',
        icon: IconFolder,
      },
      {
        key: 'bundles',
        labelKey: 'endpointAdmin.nav.bundles',
        path: 'software-bundles',
        icon: IconFile,
      },
      {
        key: 'agentUpdates',
        labelKey: 'endpointAdmin.nav.agentUpdates',
        path: 'agent-updates/releases',
        icon: IconDownload,
      },
      {
        key: 'outdated',
        labelKey: 'endpointAdmin.nav.outdated',
        path: 'outdated-software-list',
        icon: IconClock,
      },
      {
        key: 'prohibited',
        labelKey: 'endpointAdmin.nav.prohibited',
        path: 'prohibited-software-list',
        icon: IconLock,
      },
      {
        key: 'softwareDiff',
        labelKey: 'endpointAdmin.nav.softwareDiff',
        path: 'software-diff-list',
        icon: IconRefresh,
      },
    ],
  },
  {
    key: 'security',
    titleKey: 'endpointAdmin.nav.section.security',
    items: [
      {
        key: 'enrollments',
        labelKey: 'endpointAdmin.nav.enrollments',
        path: 'enrollments',
        icon: IconShield,
      },
      {
        key: 'compliance',
        labelKey: 'endpointAdmin.nav.compliance',
        path: 'compliance',
        icon: IconInfo,
      },
      {
        key: 'compliancePolicies',
        labelKey: 'endpointAdmin.nav.compliancePolicies',
        path: 'compliance/policies',
        icon: IconSettings,
      },
      {
        key: 'complianceGaps',
        labelKey: 'endpointAdmin.nav.complianceGaps',
        path: 'compliance/gaps',
        icon: IconWarning,
      },
    ],
  },
  {
    key: 'audit',
    titleKey: 'endpointAdmin.nav.section.audit',
    items: [{ key: 'audit', labelKey: 'endpointAdmin.nav.audit', path: 'audit', icon: IconSearch }],
  },
];
