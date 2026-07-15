import React, { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppSidebar } from '@mfe/design-system/components';
import { useEndpointAdminI18n } from '../../i18n';
import { ENDPOINT_ADMIN_BASE, ENDPOINT_ADMIN_NAV } from './endpoint-admin-nav.config';

/**
 * Domain shell for the endpoint-admin MFE: a persistent left-nav (design-system
 * `AppSidebar`) wrapping the route content, so every shipped fleet-level surface
 * is discoverable to an authorized user without typing a URL.
 *
 * Faz 22 product-surface completion, slice S1 (platform-web #922). The MFE
 * previously rendered `<EndpointAdminRouter/>` with no navigation chrome
 * (`EndpointAdminApp.ui.tsx`), so only the shell mega-menu's single
 * `/endpoint-admin/devices` entry was reachable. See
 * {@link ENDPOINT_ADMIN_NAV} for the IA rationale.
 *
 * Nav visibility is NOT a security boundary — the whole domain is already
 * OpenFGA `ENDPOINT_ADMIN`-gated by the shell, and each surface enforces its own
 * `can_view`/`can_manage` on the backend (403/503). This only makes the built
 * surfaces findable; it grants nothing.
 */
export const EndpointAdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useEndpointAdminI18n();
  const navigate = useNavigate();
  const location = useLocation();

  const current = location.pathname.startsWith(ENDPOINT_ADMIN_BASE)
    ? location.pathname.slice(ENDPOINT_ADMIN_BASE.length).replace(/^\/+/, '')
    : '';

  // The single active item = the LONGEST configured path that the current
  // location matches (so `compliance/policies` wins over `compliance`).
  const activePath = useMemo(() => {
    const paths = ENDPOINT_ADMIN_NAV.flatMap((section) => section.items.map((item) => item.path));
    const matches = paths.filter((path) => current === path || current.startsWith(`${path}/`));
    return matches.sort((a, b) => b.length - a.length)[0] ?? '';
  }, [current]);

  return (
    <div style={{ display: 'flex', minHeight: '100%', height: '100%', alignItems: 'stretch' }}>
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
                    active={item.path === activePath}
                    onClick={() => navigate(`${ENDPOINT_ADMIN_BASE}/${item.path}`)}
                  />
                );
              })}
            </AppSidebar.Section>
          ))}
        </AppSidebar.Nav>
      </AppSidebar>
      <main style={{ flex: 1, minWidth: 0, overflow: 'auto' }} data-testid="endpoint-admin-content">
        {children}
      </main>
    </div>
  );
};

export default EndpointAdminLayout;
