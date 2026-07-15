import React from 'react';
import { useHref, useLinkClickHandler, useLocation } from 'react-router-dom';
import { AppSidebar } from '@mfe/design-system/components';
import { useEndpointAdminI18n } from '../../i18n';
import {
  ENDPOINT_ADMIN_NAV,
  resolveActiveNavPath,
  type EndpointAdminNavItem,
} from './endpoint-admin-nav.config';

/**
 * A single sidebar entry rendered as a real anchor (`<a href>`) whose left-click
 * is intercepted for SPA navigation. `useHref`/`useLinkClickHandler` resolve the
 * relative path against the current route context, so the same config works
 * under the shell mount and standalone — and modifier/middle clicks keep native
 * open-in-new-tab / copy-link behaviour.
 */
const NavEntry: React.FC<{
  item: EndpointAdminNavItem;
  label: string;
  active: boolean;
}> = ({ item, label, active }) => {
  const href = useHref(item.path);
  const handleClick = useLinkClickHandler<HTMLElement>(item.path);
  const Icon = item.icon;
  return (
    <AppSidebar.NavItem
      icon={<Icon size={18} />}
      label={label}
      href={href}
      active={active}
      onClick={handleClick}
    />
  );
};

/**
 * Domain shell for the endpoint-admin MFE: a persistent left-nav (design-system
 * `AppSidebar`) wrapping the route content, so every shipped fleet-level surface
 * is discoverable to an authorized user without typing a URL.
 *
 * Faz 22 product-surface completion, slice S1 (platform-web #922). The MFE
 * previously rendered `<EndpointAdminRouter/>` with no navigation chrome, so only
 * the shell mega-menu's single `/endpoint-admin/devices` entry was reachable.
 * See {@link ENDPOINT_ADMIN_NAV} for the IA rationale.
 *
 * Nav visibility is NOT a security boundary — the whole domain is already OpenFGA
 * `ENDPOINT_ADMIN`-gated by the shell, and each surface enforces its own
 * `can_view`/`can_manage` on the backend (403/503). This only makes the built
 * surfaces findable; it grants nothing. The content region is a `<section>` (not
 * a second `<main>`) since the shell already owns the page's `<main>` landmark.
 */
export const EndpointAdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useEndpointAdminI18n();
  const { pathname } = useLocation();

  const navPaths = ENDPOINT_ADMIN_NAV.flatMap((section) => section.items.map((item) => item.path));
  const activePath = resolveActiveNavPath(pathname, navPaths);

  return (
    <div style={{ display: 'flex', minHeight: '100%', height: '100%', alignItems: 'stretch' }}>
      <AppSidebar>
        <AppSidebar.Header title={t('endpointAdmin.title')} action={<AppSidebar.Trigger />} />
        <AppSidebar.Nav>
          {ENDPOINT_ADMIN_NAV.map((section) => (
            <AppSidebar.Section key={section.key} title={t(section.titleKey)}>
              {section.items.map((item) => (
                <NavEntry
                  key={item.key}
                  item={item}
                  label={t(item.labelKey)}
                  active={item.path === activePath}
                />
              ))}
            </AppSidebar.Section>
          ))}
        </AppSidebar.Nav>
      </AppSidebar>
      <section
        aria-label={t('endpointAdmin.title')}
        style={{ flex: 1, minWidth: 0, overflow: 'auto' }}
        data-testid="endpoint-admin-content"
      >
        {children}
      </section>
    </div>
  );
};

export default EndpointAdminLayout;
