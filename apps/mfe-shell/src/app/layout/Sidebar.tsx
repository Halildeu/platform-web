import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Home, LifeBuoy, Settings } from 'lucide-react';
// PERF-INIT-V2 PR-B5a: consumer-side subpath migration. Sidebar is on
// every authenticated route's critical render path. ShellSidebar + its
// types live in the patterns barrel; this aligns the call site for the
// future B5d subpath share-scope split. Under the current root shared
// package topology the loadShare wrapper is unchanged.
import { ShellSidebar } from '@mfe/design-system/patterns';
import type {
  ShellSidebarNavItem,
  ShellSidebarFooterActionItem,
} from '@mfe/design-system/patterns';
import { useAppDispatch } from '../store/store.hooks';
import {
  pushNotification,
  toggleOpen,
} from '../../features/notifications/model/notifications.slice';
import { usePermissions } from '@mfe/auth';
import { MODULE_KEYS } from '../../features/auth/lib/permissions.constants';
import { navigateIfStandaloneApp } from '../standalone-apps';
import { resolveKeycloakRouteScope } from '../auth/keycloakRouteScope';
import { useShellCommonI18n } from '../i18n';
import { useHeaderNavigation } from './header/useHeaderNavigation';
import type { ResolvedNavGroup } from './header/useHeaderNavigation';

const STORAGE_KEY = 'shell.sidebar.mode';

/**
 * The sidebar is context-sensitive, not a mirror of the header.
 *
 * The header answers "which product am I in"; the sidebar answers "where am I
 * inside it". Mirroring the same module list in both places (the previous flat
 * list did a version of this) duplicates one question and leaves the other
 * unanswered — the cross-AI review (issue #1120) called this out and it stands.
 *
 * Two modes, both fed by useHeaderNavigation() so entitlement filtering, remote
 * gating, i18n and the initialized guard live in exactly one place:
 *
 * - module mode: the current route belongs to a group with items — the sidebar
 *   shows that module's internal destinations, plus one exit back to the hub.
 * - global mode: no module owns the route (/home, or a direct-path product
 *   like Meetings with no internal nav yet) — the sidebar is the module
 *   launcher, one entry per product the user can actually open.
 *
 * Fail-closed by construction: until entitlements are initialized the hook
 * returns no groups, so nothing privileged ever flashes and then disappears.
 * The items are static config labels — an ethics case title can never appear
 * here, which is a confidentiality requirement, not a styling choice.
 */
export const buildGlobalSidebarItems = (
  groups: ResolvedNavGroup[],
  homeLabel: string,
): ShellSidebarNavItem[] => {
  const items: ShellSidebarNavItem[] = [
    {
      key: 'home',
      label: homeLabel,
      href: '/home',
      icon: <Home aria-hidden />,
      dataTestId: 'nav-home',
    },
  ];
  for (const group of groups) {
    // A group with neither a direct path nor a visible item has nowhere to
    // land; the hook has already dropped unauthorized ones.
    const href = group.directPath ?? group.items?.[0]?.path;
    if (!href) continue;
    const Icon = group.icon;
    items.push({
      key: group.key,
      label: group.label,
      href,
      icon: <Icon aria-hidden />,
      dataTestId: `nav-module-${group.key}`,
    });
  }
  return items;
};

export const buildModuleSidebarItems = (
  group: ResolvedNavGroup,
  allModulesLabel: string,
): ShellSidebarNavItem[] => {
  const items: ShellSidebarNavItem[] = [
    {
      key: 'all-modules',
      label: allModulesLabel,
      href: '/home',
      icon: <Home aria-hidden />,
      dataTestId: 'nav-all-modules',
    },
  ];
  for (const item of group.items ?? []) {
    const Icon = item.icon;
    items.push({
      key: item.key,
      label: item.label,
      href: item.path,
      icon: <Icon aria-hidden />,
      dataTestId: `nav-${item.key}`,
    });
  }
  return items;
};

/**
 * Which of the module's destinations is the one the reader is on.
 *
 * The header hook matches on pathname alone, which cannot tell the ethics work
 * queues apart — all three live at /admin/ethics and differ only in the query.
 * Here the full path (pathname + search) is tried first; only when no
 * query-carrying destination matches does the longest query-less prefix win,
 * so "Tüm vakalar" does not light up while the reader is in "Sahipsiz".
 */
export const resolveModuleActiveKey = (
  group: ResolvedNavGroup,
  pathname: string,
  search: string,
): string | undefined => {
  const items = group.items ?? [];
  const full = pathname + search;
  const exact = items.find((item) => item.path === full);
  if (exact) return exact.key;

  let bestKey: string | undefined;
  let bestLength = -1;
  for (const item of items) {
    if (item.path.includes('?')) continue;
    for (const prefix of [item.path, ...(item.activePathPrefixes ?? [])]) {
      if (pathname.startsWith(prefix) && prefix.length > bestLength) {
        bestKey = item.key;
        bestLength = prefix.length;
      }
    }
  }
  return bestKey;
};

export const Sidebar: React.FC = () => {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const navigate = useNavigate();
  const { hasModule, isSuperAdmin } = usePermissions();
  const sa = isSuperAdmin();
  const { t } = useShellCommonI18n();
  const { groups, activeGroupKey } = useHeaderNavigation();

  /* ---- Online status ---- */
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const update = () => setIsOnline(typeof navigator === 'undefined' ? true : navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  /* ---- Mode + items ---- */
  const activeGroup = useMemo(
    () => groups.find((group) => group.key === activeGroupKey),
    [groups, activeGroupKey],
  );
  const moduleMode = Boolean(activeGroup?.items?.length);

  const navItems: ShellSidebarNavItem[] = useMemo(
    () =>
      moduleMode && activeGroup
        ? buildModuleSidebarItems(activeGroup, t('shell.sidebar.allModules'))
        : buildGlobalSidebarItems(groups, t('shell.breadcrumb.home')),
    [moduleMode, activeGroup, groups, t],
  );

  const activeKey = useMemo(() => {
    if (moduleMode && activeGroup) {
      return resolveModuleActiveKey(activeGroup, location.pathname, location.search) ?? 'all-modules';
    }
    return activeGroupKey ?? 'home';
  }, [moduleMode, activeGroup, activeGroupKey, location.pathname, location.search]);

  /* ---- Footer actions ---- */
  const footerActions: ShellSidebarFooterActionItem[] = useMemo(
    () => [
      {
        key: 'settings',
        label: 'Settings',
        icon: <Settings aria-hidden />,
        href: sa || hasModule(MODULE_KEYS.THEME) ? '/admin/themes' : undefined,
        disabled: !(sa || hasModule(MODULE_KEYS.THEME)),
        dataTestId: 'nav-settings',
      },
      {
        key: 'support',
        label: 'Support',
        icon: <LifeBuoy aria-hidden />,
        onClick: () => {
          dispatch(
            pushNotification({
              id: 'sidebar-support',
              message: 'Destek yakında',
              description: 'Destek merkezi bağlantısı bir sonraki iterasyonda eklenecek.',
              type: 'info',
              meta: { source: 'sidebar', open: true },
            }),
          );
          dispatch(toggleOpen(true));
        },
        dataTestId: 'nav-support',
      },
    ],
    [hasModule, sa, dispatch],
  );

  /* ---- Search ---- */
  const openCommandPalette = () => {
    if (location.pathname.startsWith('/admin/design-lab')) {
      window.dispatchEvent(new CustomEvent('design-lab:open-search'));
    } else {
      navigate('/admin/design-lab?search=open');
    }
  };

  return (
    <ShellSidebar
      navItems={navItems}
      activeKey={activeKey}
      onNavigate={(key, item) => {
        if (!item.href) return;
        // Kenarda yayınlanan ürünler (ör. Etik Speak) kabuk route'u değildir;
        // SPA gezinmesi onları açamaz — tam sayfa gerekir.
        if (navigateIfStandaloneApp(item.href)) return;
        // Rota-kapsamlı ürünler (ör. /admin/ethics): kapsam yalnız sayfa
        // yüklenişinde (AuthBootstrapper) istenir; SPA geçişi eski token'la
        // gider ve ürün API'si 401 döner — sahibin ekranında "Oturum
        // doğrulanamadı" tam buydu. Tam sayfa geçiş aynı kabuğa döner ama
        // sessiz SSO kapsamlı token'ı basar; login ekranı görünmez.
        if (resolveKeycloakRouteScope(item.href)) {
          window.location.assign(item.href);
          return;
        }
        const target = item.href.split('?')[0];
        if (item.href !== location.pathname + location.search && target !== undefined) {
          navigate(item.href);
        }
      }}
      brandTitle={moduleMode && activeGroup ? activeGroup.label : 'Platform'}
      brandSubtitle={moduleMode ? 'Platform' : undefined}
      onSearch={openCommandPalette}
      searchShortcut="Ctrl+K"
      footerActions={footerActions}
      statusIndicator={{ status: isOnline ? 'online' : 'offline' }}
      storageKey={STORAGE_KEY}
      defaultMode="expanded"
      cssWidthVar="--shell-sidebar-w"
      collapsedWidth={76}
      expandedWidth={280}
      className="fixed bottom-0 left-0 top-[var(--shell-header-h)] z-30 mt-4 mx-2 mb-2 pb-2 !rounded-2xl !border !border-border-subtle"
    />
  );
};
