import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { NotificationDrawer, type NotificationSurfaceItem } from '@mfe/design-system';
import { NotificationBell } from './header/NotificationBell';

import {
  useNotificationCenterActions,
  useNotificationCenterState,
} from '../../features/notifications/model/use-notification-center.model';
import {
  useArchiveMutation,
  useListInboxQuery,
  useMarkAllAsReadMutation,
  useMarkReadMutation,
} from '../../features/notifications/api/notify-inbox.api';
import { useInboxUnreadSse } from '../../features/notifications/api/useInboxUnreadSse';
import { selectNotifyIdentity } from '../../features/notifications/model/identity.selectors';
import {
  extractInboxRowId,
  inboxItemToSurfaceItem,
} from '../../features/notifications/model/inbox-item-mapper';
import { useAppSelector } from '../store/store.hooks';

type NotificationPrimaryNavigation = {
  pathname: string;
  search?: string;
  actionLabel: string;
};

/**
 * Two tabs surfaced in the drawer header (Faz 23.4 PR-E.5 v1 UI):
 * - {@code system}: legacy local-first surface (toasts, audit pings).
 * - {@code inbox}: server-side notification-orchestrator inbox via
 *   RTK Query.
 *
 * Default tab is {@code system} so existing behavior is preserved for
 * users who haven't yet been migrated to the new backend surface.
 * The badge sums both sources so users see one total unread count.
 */
type ActiveTab = 'system' | 'inbox';

const DEFAULT_TAB: ActiveTab = 'system';

const normalizeSearch = (search: string): string => search.replace(/^\?+/, '');

const resolvePrimaryNavigation = (
  item: NotificationSurfaceItem,
): NotificationPrimaryNavigation | null => {
  const auditId = typeof item.meta?.auditId === 'string' ? item.meta.auditId : null;
  if (auditId) {
    const search = new URLSearchParams({ auditId });
    return {
      pathname: '/audit/events',
      search: search.toString(),
      actionLabel: 'Audit kaydını aç',
    };
  }

  const pathname = typeof item.meta?.pathname === 'string' ? item.meta.pathname.trim() : '';
  if (!pathname) {
    return null;
  }

  return {
    pathname,
    search: typeof item.meta?.search === 'string' ? normalizeSearch(item.meta.search) : undefined,
    actionLabel:
      typeof item.meta?.actionLabel === 'string' && item.meta.actionLabel.trim().length > 0
        ? item.meta.actionLabel
        : 'Detaya git',
  };
};

const isInboxSurfaceItem = (item: NotificationSurfaceItem): boolean =>
  item.meta?.source === 'inbox' || extractInboxRowId(item.id) !== null;

const NotificationCenter: React.FC = () => {
  const localState = useNotificationCenterState();
  const localActions = useNotificationCenterActions();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<ActiveTab>(DEFAULT_TAB);

  // Backend inbox: only fetch once we have an authenticated identity. The
  // selector returns null while AuthBootstrapper is still resolving — we
  // pass {@code skipToken} in that case so RTK Query never schedules a
  // request and never inspects a placeholder argument.
  //
  // <p>PR-5.X follow-up (Codex thread {@code 019e075d}): the previous
  // {@code inboxQueryArg ?? { orgId: '', subscriberId: '' }} placeholder
  // combined with {@code skip: identity === null} let race conditions
  // during {@code AuthBootstrapper}'s repeated init cycles slip an empty
  // argument through to the fetcher; the request went out with blank
  // {@code X-Org-Id} headers and the orchestrator returned 400.
  // {@code skipToken} eliminates the placeholder branch entirely — when
  // identity is {@code null} no request is dispatched and no headers are
  // computed. Endpoint args still travel as-is when identity resolves so
  // the orchestrator inbox cache key remains keyed by {@code (org, subscriber)}.
  const identity = useAppSelector(selectNotifyIdentity);
  const inboxQuery = useListInboxQuery(identity ?? skipToken, {
    // Refetch when the user opens the drawer so the list is fresh after
    // mark-read / archive calls performed in another tab/window.
    refetchOnMountOrArgChange: true,
  });
  const [markReadMutation] = useMarkReadMutation();
  const [archiveMutation] = useArchiveMutation();
  // Faz 23.5 PR4: bulk mark-all-read mutation. One server round trip
  // instead of the previous N+1 per-row markRead loop.
  const [markAllAsReadMutation] = useMarkAllAsReadMutation();

  // Faz 23.4 PR-E.5 PR4: subscribe to the live SSE unread-count stream so
  // the badge updates the moment a notification is read/archived from
  // another tab or device. The hook patches both getUnreadCount and
  // listInbox caches directly (no refetch round trip for the count) AND
  // invalidates Inbox/LIST so the drawer's row collection re-fetches.
  // Returns the latest pushed count so the bell can prefer it over the
  // (potentially stale) listInbox cache before the refetch resolves.
  const sseStatus = useInboxUnreadSse(identity);

  const inboxItems = useMemo<NotificationSurfaceItem[]>(() => {
    if (!inboxQuery.data) return [];
    return inboxQuery.data.items.map(inboxItemToSurfaceItem);
  }, [inboxQuery.data]);

  // Prefer the live SSE-pushed count when available; fall back to the
  // listInbox cache. The cache is also patched by the SSE hook, but the
  // SSE-pushed value is the authoritative immediate-render source — the
  // cache write may not have propagated to this component's selector
  // yet on the same React tick.
  const inboxUnreadCount = sseStatus.lastUnreadCount ?? inboxQuery.data?.unreadCount ?? 0;
  const totalUnreadCount = localState.unreadCount + inboxUnreadCount;

  const drawerTitle = useMemo(() => {
    if (totalUnreadCount === 0) {
      return 'Bildirimler';
    }
    return `Bildirimler (${totalUnreadCount} okunmamış)`;
  }, [totalUnreadCount]);

  const activeItems = activeTab === 'inbox' ? inboxItems : localState.items;

  const summaryLabel = useMemo(() => {
    if (activeTab === 'inbox') {
      if (inboxQuery.isLoading) return 'Bildirimler yükleniyor…';
      if (inboxQuery.isError) return 'Bildirimler şu anda yüklenemiyor.';
      if (inboxItems.length === 0) return 'Yeni bildirim yok.';
      return `${inboxItems.length} bildirim · ${inboxUnreadCount} okunmamış`;
    }
    if (localState.items.length === 0) {
      return 'Yeni olaylar geldiğinde burada görünecek.';
    }
    return `Son ${localState.items.length} etkinlik listelenir`;
  }, [
    activeTab,
    inboxItems.length,
    inboxQuery.isError,
    inboxQuery.isLoading,
    inboxUnreadCount,
    localState.items.length,
  ]);

  const openNotificationTarget = useCallback(
    (target: NotificationPrimaryNavigation, item: NotificationSurfaceItem) => {
      navigate({
        pathname: target.pathname,
        search: target.search,
      });
      // For local items, removing also dismisses the toast; for backend
      // items we mark them read so the badge drops without losing the row.
      if (isInboxSurfaceItem(item)) {
        const id = extractInboxRowId(item.id);
        if (id !== null && identity) {
          void markReadMutation({ ...identity, id });
        }
      } else {
        localActions.remove(item.id);
      }
      localActions.toggle(false);
    },
    [identity, localActions, markReadMutation, navigate],
  );

  const getPrimaryActionLabel = useCallback((item: NotificationSurfaceItem) => {
    return resolvePrimaryNavigation(item)?.actionLabel ?? null;
  }, []);

  const handlePrimaryAction = useCallback(
    (item: NotificationSurfaceItem) => {
      const target = resolvePrimaryNavigation(item);
      if (!target) return;
      openNotificationTarget(target, item);
    },
    [openNotificationTarget],
  );

  const handleRemoveItem = useCallback(
    (id: string) => {
      const inboxRowId = extractInboxRowId(id);
      if (inboxRowId !== null) {
        if (identity) void archiveMutation({ ...identity, id: inboxRowId });
        return;
      }
      localActions.remove(id);
    },
    [archiveMutation, identity, localActions],
  );

  const handleMarkAllRead = useCallback(() => {
    if (activeTab === 'inbox') {
      // Faz 23.5 PR4: single bulk mutation replaces the prior N+1
      // per-row mark-read loop. Backend
      // (POST /api/v1/notify/inbox/me/mark-all-read) captures a server-
      // side cutoff timestamp and only flips rows that existed before
      // the request — UX-correct for "mark everything I've seen as
      // read", while a notification arriving mid-bulk is preserved.
      // The LIST + UnreadCount tag invalidations refresh the drawer
      // row collection and the bell badge in one cycle.
      if (!identity) return;
      void markAllAsReadMutation(identity);
      return;
    }
    localActions.markAllRead();
  }, [activeTab, identity, localActions, markAllAsReadMutation]);

  const handleClear = useCallback(() => {
    if (activeTab === 'inbox') {
      // Archive every visible row — backend equivalent of clear for the
      // active tab. ARCHIVED rows are filtered out of the list automatically.
      if (!identity || !inboxQuery.data) return;
      for (const row of inboxQuery.data.items) {
        void archiveMutation({ ...identity, id: row.id });
      }
      return;
    }
    localActions.clear();
  }, [activeTab, archiveMutation, identity, inboxQuery.data, localActions]);

  const handleRemoveSelected = useCallback(
    (ids: string[]) => {
      // Split into backend ids vs local ids so each side gets the right call.
      const inboxIds: number[] = [];
      const localIds: string[] = [];
      for (const id of ids) {
        const rowId = extractInboxRowId(id);
        if (rowId !== null) {
          inboxIds.push(rowId);
        } else {
          localIds.push(id);
        }
      }
      if (inboxIds.length > 0 && identity) {
        for (const rowId of inboxIds) {
          void archiveMutation({ ...identity, id: rowId });
        }
      }
      if (localIds.length > 0) {
        localActions.removeMany(localIds);
      }
    },
    [archiveMutation, identity, localActions],
  );

  const handleMarkSelectedRead = useCallback(
    (ids: string[]) => {
      const inboxIds: number[] = [];
      const localIds: string[] = [];
      for (const id of ids) {
        const rowId = extractInboxRowId(id);
        if (rowId !== null) {
          inboxIds.push(rowId);
        } else {
          localIds.push(id);
        }
      }
      if (inboxIds.length > 0 && identity) {
        for (const rowId of inboxIds) {
          void markReadMutation({ ...identity, id: rowId });
        }
      }
      if (localIds.length > 0) {
        localActions.markSelectedRead(localIds);
      }
    },
    [identity, localActions, markReadMutation],
  );

  const tabSwitcher = (
    <div role="tablist" aria-label="Bildirim sekmeleri" className="flex gap-1 text-xs">
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'system'}
        onClick={() => setActiveTab('system')}
        className={`px-2 py-1 rounded ${
          activeTab === 'system' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-500'
        }`}
      >
        Sistem ({localState.unreadCount})
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'inbox'}
        onClick={() => setActiveTab('inbox')}
        className={`px-2 py-1 rounded ${
          activeTab === 'inbox' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-500'
        }`}
        disabled={identity === null}
      >
        Bildirimlerim ({inboxUnreadCount})
      </button>
    </div>
  );

  return (
    <>
      <NotificationBell
        unreadCount={totalUnreadCount}
        onClick={() => localActions.toggle()}
        label={drawerTitle}
      />
      <NotificationDrawer
        open={localState.isOpen}
        onClose={() => localActions.toggle(false)}
        title={drawerTitle}
        dialogLabel="Bildirim merkezi"
        items={activeItems}
        summaryLabel={summaryLabel}
        emptyTitle={
          activeTab === 'inbox' && identity === null ? 'Önce oturum açın' : 'Şu anda bildirim yok'
        }
        emptyDescription="Yeni olaylar geldiğinde burada görünecek."
        filteredEmptyTitle="Bu filtre için bildirim yok"
        markAllReadLabel="Tümünü okundu say"
        clearLabel={activeTab === 'inbox' ? 'Tümünü arşivle' : 'Temizle'}
        removeLabel={activeTab === 'inbox' ? 'Arşivle' : 'Bildirimi kapat'}
        onMarkAllRead={handleMarkAllRead}
        onMarkSelectedRead={handleMarkSelectedRead}
        onClear={handleClear}
        onRemoveItem={handleRemoveItem}
        onRemoveSelected={handleRemoveSelected}
        getPrimaryActionLabel={getPrimaryActionLabel}
        onPrimaryAction={handlePrimaryAction}
        headerAccessory={tabSwitcher}
        showFilters
        selectable
        grouping="priority"
        dateGrouping="relative-day"
        closeOnOverlayClick
        closeOnEscape
        portalTarget={typeof document !== 'undefined' ? document.body : null}
      />
    </>
  );
};

export default NotificationCenter;
