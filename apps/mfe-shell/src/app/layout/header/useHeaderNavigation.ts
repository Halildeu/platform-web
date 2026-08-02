import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { usePermissions } from '@mfe/auth';
import { useAppSelector } from '../../store/store.hooks';
import {
  isSuggestionsRemoteEnabled,
  isEthicRemoteEnabled,
  isEndpointAdminRemoteEnabled,
  isMeetingRemoteEnabled,
} from '../../shell-navigation';
import { useShellCommonI18n } from '../../i18n';
import type { NavGroup, NavGroupItem } from './header-navigation.config';
import { NAV_GROUPS } from './header-navigation.config';

/* ------------------------------------------------------------------ */
/*  Resolved types (labels translated, items filtered)                 */
/* ------------------------------------------------------------------ */

export interface ResolvedNavItem {
  key: string;
  label: string;
  description?: string;
  path: string;
  icon: NavGroupItem['icon'];
  activePathPrefixes?: readonly string[];
}

export interface ResolvedNavGroup {
  key: string;
  label: string;
  icon: NavGroup['icon'];
  items?: ResolvedNavItem[];
  directPath?: string;
}

export interface HeaderNavigationState {
  groups: ResolvedNavGroup[];
  activeGroupKey: string | null;
  activeItemKey: string | null;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useHeaderNavigation(): HeaderNavigationState {
  const { pathname } = useLocation();
  const { hasModule, isSuperAdmin } = usePermissions();
  const { initialized } = useAppSelector((s) => s.auth);
  const { t } = useShellCommonI18n();

  const suggestionsEnabled = isSuggestionsRemoteEnabled();
  const ethicEnabled = isEthicRemoteEnabled();
  const endpointAdminEnabled = isEndpointAdminRemoteEnabled();
  const meetingEnabled = isMeetingRemoteEnabled();

  /** Check if a nav config item is accessible. Prefers module key over legacy permission. */
  const canAccess = (item: {
    module?: string;
    permission?: string;
    modulesAnyOf?: readonly string[];
  }) => {
    if (isSuperAdmin()) return true;
    if (item.modulesAnyOf) return item.modulesAnyOf.some((key) => hasModule(key));
    if (item.module) return hasModule(item.module);
    // No module key — always visible (e.g. schema-explorer has no permission gate)
    return true;
  };

  const remoteAllows = (flag?: 'suggestions' | 'ethic' | 'endpointAdmin' | 'meeting') => {
    if (flag === 'suggestions') return suggestionsEnabled;
    if (flag === 'ethic') return ethicEnabled;
    if (flag === 'endpointAdmin') return endpointAdminEnabled;
    if (flag === 'meeting') return meetingEnabled;
    return true;
  };

  const groups = useMemo<ResolvedNavGroup[]>(() => {
    if (!initialized) return [];

    return NAV_GROUPS.reduce<ResolvedNavGroup[]>((acc, group) => {
      // Direct path group — check module/permission and remote readiness
      if (group.directPath) {
        if (!remoteAllows(group.remoteFlag)) {
          return acc;
        }
        if ((group.module || group.modulesAnyOf) && !canAccess(group)) {
          return acc;
        }
        acc.push({
          key: group.key,
          label: t(group.labelKey),
          icon: group.icon,
          directPath: group.directPath,
        });
        return acc;
      }

      // Group with items — filter items by module + remote flags
      const filteredItems = (group.items ?? []).reduce<ResolvedNavItem[]>((items, item) => {
        if (!remoteAllows(item.remoteFlag)) return items;
        if ((item.module || item.modulesAnyOf) && !canAccess(item)) return items;
        items.push({
          key: item.key,
          label: t(item.labelKey),
          description: item.descriptionKey ? t(item.descriptionKey) : undefined,
          path: item.path,
          icon: item.icon,
          activePathPrefixes: item.activePathPrefixes,
        });
        return items;
      }, []);

      // 'any-child': show group only if at least one item is visible
      if (group.permission === 'any-child' && filteredItems.length === 0) return acc;

      acc.push({
        key: group.key,
        label: t(group.labelKey),
        icon: group.icon,
        items: filteredItems,
      });
      return acc;
    }, []);
  }, [
    initialized,
    hasModule,
    isSuperAdmin,
    suggestionsEnabled,
    ethicEnabled,
    endpointAdminEnabled,
    meetingEnabled,
    t,
  ]);

  // Resolve active group and item from current path (longest prefix match)
  const { activeGroupKey, activeItemKey } = useMemo(() => {
    let bestGroupKey: string | null = null;
    let bestItemKey: string | null = null;
    let bestLen = 0;

    for (const group of groups) {
      if (group.directPath) {
        const len = group.directPath.length;
        if (pathname.startsWith(group.directPath) && len > bestLen) {
          bestGroupKey = group.key;
          bestItemKey = null;
          bestLen = len;
        }
        continue;
      }
      for (const item of group.items ?? []) {
        for (const activePath of [item.path, ...(item.activePathPrefixes ?? [])]) {
          const len = activePath.length;
          if (activePath === '/') {
            if (pathname === '/' && len >= bestLen) {
              bestGroupKey = group.key;
              bestItemKey = item.key;
              bestLen = len;
            }
          } else if (pathname.startsWith(activePath) && len > bestLen) {
            bestGroupKey = group.key;
            bestItemKey = item.key;
            bestLen = len;
          }
        }
      }
    }
    return { activeGroupKey: bestGroupKey, activeItemKey: bestItemKey };
  }, [groups, pathname]);

  return { groups, activeGroupKey, activeItemKey };
}
