import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppSidebar } from '@mfe/design-system/components';
import { useEndpointAdminI18n } from '../../i18n';
import {
  ENDPOINT_ADMIN_NAV,
  resolveActiveNavPath,
  resolveEndpointAdminTo,
} from './endpoint-admin-nav.config';

/** A plain left-click (no modifier / middle button) — the only case we take over
 *  for SPA nav; modifier/middle clicks keep native open-in-new-tab / copy-link. */
function isPlainLeftClick(event: React.MouseEvent): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

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
 * The nav items render as real anchors (`<a href>` via {@link resolveEndpointAdminTo}
 * — a mount-aware ABSOLUTE target, since react-router relative resolution under
 * the shell's `/endpoint-admin/*` splat route would append to the current path
 * instead of resolving a sibling). A plain left-click (or keyboard Enter, which
 * fires a click) is delegated to SPA navigation; modifier/middle clicks stay
 * native. This needs no change to the shared `AppSidebar` component.
 *
 * Nav visibility is NOT a security boundary — the whole domain is already OpenFGA
 * `ENDPOINT_ADMIN`-gated by the shell, and each surface enforces its own
 * `can_view`/`can_manage` on the backend (403/503). The content region is a
 * `<section>` (not a second `<main>`); the shell already owns the page `<main>`.
 */
export const EndpointAdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useEndpointAdminI18n();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const navPaths = ENDPOINT_ADMIN_NAV.flatMap((section) => section.items.map((item) => item.path));
  const activePath = resolveActiveNavPath(pathname, navPaths);

  const handleNavClick = (event: React.MouseEvent<HTMLElement>) => {
    if (event.defaultPrevented || !isPlainLeftClick(event)) return;
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[data-sidebar-item]');
    const to = anchor?.getAttribute('href');
    if (!anchor || !to) return;
    event.preventDefault();
    navigate(to);
  };

  return (
    <div style={{ display: 'flex', minHeight: '100%', height: '100%', alignItems: 'stretch' }}>
      {/* Click delegation: the interactive controls are the keyboard-navigable
          <a> nav items below; this only upgrades their plain-click to SPA nav
          (keyboard Enter also fires a click, so it is handled too). */}
      <div onClick={handleNavClick}>
        <AppSidebar>
          <AppSidebar.Header title={t('endpointAdmin.title')} action={<AppSidebar.Trigger />} />
          <AppSidebar.Nav>
            {ENDPOINT_ADMIN_NAV.map((section) => (
              <AppSidebar.Section key={section.key} title={t(section.titleKey)}>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <AppSidebar.NavItem
                      key={item.key}
                      icon={<Icon size={18} />}
                      label={t(item.labelKey)}
                      href={resolveEndpointAdminTo(pathname, item.path)}
                      active={item.path === activePath}
                    />
                  );
                })}
              </AppSidebar.Section>
            ))}
          </AppSidebar.Nav>
        </AppSidebar>
      </div>
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
