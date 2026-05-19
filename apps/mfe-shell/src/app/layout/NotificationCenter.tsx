import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  useListHistoryQuery,
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
 * Three tabs surfaced in the drawer header:
 * - {@code system}: legacy local-first surface (toasts, audit pings).
 * - {@code inbox}: server-side notification-orchestrator active inbox
 *   (UNREAD + READ) via RTK Query.
 * - {@code history}: Faz 23.4 M6a — read-only 30-day notification
 *   history (UNREAD + READ + ARCHIVED) with client-side page
 *   accumulation.
 *
 * Default tab is {@code system} so existing behavior is preserved for
 * users who haven't yet been migrated to the new backend surface.
 * The badge sums system + inbox unread counts (the history tab is a
 * read-only review surface and contributes no badge count).
 */
type ActiveTab = 'system' | 'inbox' | 'history';

const DEFAULT_TAB: ActiveTab = 'system';

/**
 * Page size for the history tab's client-side accumulation. Each
 * "Daha fazla göster" click fetches the next page and appends it; the
 * backend clamps page size at 100.
 */
const HISTORY_PAGE_SIZE = 50;

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

  // Faz 23.4 M6a — 30-day history tab. The query is gated on the tab
  // being active (skipToken otherwise) so opening the drawer on the
  // system/inbox tab never fetches history. Pages are accumulated
  // client-side: "Daha fazla göster" increments `historyPage` and the
  // effect below appends each resolved page (dedup by id — offset
  // pagination has no snapshot isolation, so a row arriving between
  // page fetches could otherwise duplicate).
  const [historyPage, setHistoryPage] = useState(0);
  const [historyItems, setHistoryItems] = useState<NotificationSurfaceItem[]>([]);
  const historyQuery = useListHistoryQuery(
    activeTab === 'history' && identity
      ? { ...identity, page: historyPage, size: HISTORY_PAGE_SIZE }
      : skipToken,
    { refetchOnMountOrArgChange: true },
  );

  // Accumulate resolved history pages. Keyed on the response only — the
  // server-echoed `page` field decides replace (page 0) vs append
  // (page > 0), so a `historyPage` state change alone never re-runs
  // this effect and never double-appends a still-loading page.
  useEffect(() => {
    const data = historyQuery.data;
    if (!data) return;
    const mapped = data.items.map(inboxItemToSurfaceItem);
    setHistoryItems((prev) => {
      if (data.page === 0) return mapped;
      const seen = new Set(prev.map((it) => it.id));
      return [...prev, ...mapped.filter((it) => !seen.has(it.id))];
    });
  }, [historyQuery.data]);

  // Reset the accumulation when the user leaves the history tab.
  useEffect(() => {
    if (activeTab !== 'history') {
      setHistoryPage(0);
      setHistoryItems([]);
    }
  }, [activeTab]);
  // ...and whenever the identity changes. `identity` is a FRESH object on
  // every render (selectNotifyIdentity rebuilds it), so depending on the
  // object reference would wipe the accumulation on every Redux store
  // update (RTK Query pending/fulfilled, etc.). A primitive key fires the
  // reset only on a real identity change. (Codex thread `019e40ec`
  // post-impl P1.)
  const identityKey = identity ? JSON.stringify([identity.orgId, identity.subscriberId]) : null;
  useEffect(() => {
    setHistoryPage(0);
    setHistoryItems([]);
  }, [identityKey]);

  const historyHasMore =
    historyQuery.data != null && historyPage + 1 < historyQuery.data.totalPages;

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

  const isHistory = activeTab === 'history';
  const activeItems =
    activeTab === 'inbox' ? inboxItems : isHistory ? historyItems : localState.items;

  const summaryLabel = useMemo(() => {
    if (activeTab === 'inbox') {
      if (inboxQuery.isLoading) return 'Bildirimler yükleniyor…';
      if (inboxQuery.isError) return 'Bildirimler şu anda yüklenemiyor.';
      if (inboxItems.length === 0) return 'Yeni bildirim yok.';
      return `${inboxItems.length} bildirim · ${inboxUnreadCount} okunmamış`;
    }
    if (activeTab === 'history') {
      if (historyQuery.isLoading) return 'Geçmiş yükleniyor…';
      if (historyQuery.isError) return 'Geçmiş şu anda yüklenemiyor.';
      if (historyItems.length === 0) return 'Son 30 günde bildirim yok.';
      const total = historyQuery.data?.totalElements ?? historyItems.length;
      const windowDays = historyQuery.data?.windowDays ?? 30;
      return `${historyItems.length} / ${total} bildirim · son ${windowDays} gün`;
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
    historyItems.length,
    historyQuery.data,
    historyQuery.isError,
    historyQuery.isLoading,
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
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'history'}
        onClick={() => setActiveTab('history')}
        className={`px-2 py-1 rounded ${
          activeTab === 'history' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-500'
        }`}
        disabled={identity === null}
      >
        Geçmiş (30 gün)
      </button>
    </div>
  );

  // Faz 23.4 M6a — "load more" footer for the history tab. Real page
  // accumulation (Codex thread `019e40ec` iter-2): each click fetches
  // the next page and the effect above appends it. Disabled while a
  // fetch is in flight so a fast double-click cannot skip a page.
  const historyFooter =
    isHistory && historyHasMore ? (
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => setHistoryPage((p) => p + 1)}
          disabled={historyQuery.isFetching}
          className="rounded-full border border-zinc-300 px-4 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {historyQuery.isFetching ? 'Yükleniyor…' : 'Daha fazla göster'}
        </button>
      </div>
    ) : null;

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
          (activeTab === 'inbox' || isHistory) && identity === null
            ? 'Önce oturum açın'
            : isHistory
              ? 'Son 30 günde bildirim yok'
              : 'Şu anda bildirim yok'
        }
        emptyDescription="Yeni olaylar geldiğinde burada görünecek."
        filteredEmptyTitle="Bu filtre için bildirim yok"
        markAllReadLabel="Tümünü okundu say"
        clearLabel={activeTab === 'inbox' ? 'Tümünü arşivle' : 'Temizle'}
        removeLabel={activeTab === 'inbox' ? 'Arşivle' : 'Bildirimi kapat'}
        onMarkAllRead={isHistory ? undefined : handleMarkAllRead}
        onMarkSelectedRead={isHistory ? undefined : handleMarkSelectedRead}
        onClear={isHistory ? undefined : handleClear}
        onRemoveItem={isHistory ? undefined : handleRemoveItem}
        onRemoveSelected={isHistory ? undefined : handleRemoveSelected}
        getPrimaryActionLabel={isHistory ? undefined : getPrimaryActionLabel}
        onPrimaryAction={isHistory ? undefined : handlePrimaryAction}
        tabBar={tabSwitcher}
        listFooter={historyFooter}
        showFilters
        selectable={!isHistory}
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
