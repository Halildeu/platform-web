// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import NotificationCenter from './NotificationCenter';

const navigateMock = vi.fn();

const stateMock = {
  items: [] as Array<{
    id: string;
    message: string;
    description?: string;
    type?: 'success' | 'info' | 'warning' | 'error' | 'loading';
    createdAt?: number;
    read?: boolean;
    meta?: Record<string, unknown>;
  }>,
  unreadCount: 0,
  isOpen: false,
};

const actionsMock = {
  toggle: vi.fn(),
  markAllRead: vi.fn(),
  markSelectedRead: vi.fn(),
  clear: vi.fn(),
  remove: vi.fn(),
  removeMany: vi.fn(),
};

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('../../features/notifications/model/use-notification-center.model', () => ({
  useNotificationCenterState: () => stateMock,
  useNotificationCenterActions: () => actionsMock,
}));

vi.mock('../theme/theme-context.provider', () => ({
  useThemeContext: () => ({
    axes: {
      overlayIntensity: 80,
      overlayOpacity: 60,
    },
  }),
}));

// Faz 23.4 PR-E.5 v1 UI: NotificationCenter now reads the notify identity
// selector and dispatches inbox API hooks. The mocks below use mutable
// module-level state so individual tests can flip identity / inbox-query
// data without reloading the module (vi.mock factories close over these
// variables, which are read at hook-call time, not at mock-define time).
type InboxRowFixture = {
  id: number;
  intentId: string | null;
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  locale: string | null;
  topicKey: string;
  severity: 'info' | 'warning' | 'critical';
  state: 'UNREAD' | 'READ' | 'ARCHIVED';
  readAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  expiresAt: string | null;
};

let identityMock: { orgId: string; subscriberId: string } | null = null;
let inboxQueryMock: {
  data:
    | {
        items: InboxRowFixture[];
        page: number;
        size: number;
        totalElements: number;
        totalPages: number;
        unreadCount: number;
      }
    | undefined;
  isLoading: boolean;
  isError: boolean;
} = { data: undefined, isLoading: false, isError: false };
const markReadMutationMock = vi.fn();
const archiveMutationMock = vi.fn();

vi.mock('../store/store.hooks', () => ({
  useAppSelector: (selector: unknown) => {
    // Faz 23.4 M6a (P1 regression guard — Codex thread `019e40ec`):
    // selectNotifyIdentity rebuilds the identity object on every
    // invocation in production, so the mock returns a FRESH
    // {orgId,subscriberId} object each call. The history reset effect
    // must therefore key on identity VALUES, not the object reference —
    // a ref-keyed effect would wipe the accumulation on every render.
    void selector;
    return identityMock ? { ...identityMock } : null;
  },
}));

const markAllAsReadMutationMock = vi.fn();

// Faz 23.4 PR-E.5 follow-up (Codex thread `019e075d` PARTIAL iter-1):
// useListInboxQuery mock now captures the call arguments so tests can
// assert that NotificationCenter passes `skipToken` while identity is
// unresolved (instead of the previous placeholder that opened the
// page-load race). The mutable `useListInboxQueryMock` lets each test
// inspect what the hook was called with via `.mock.calls`.
const useListInboxQueryMock = vi.fn((_arg: unknown, _opts?: unknown) => inboxQueryMock);

// Faz 23.4 M6a: useListHistoryQuery mock. The component passes skipToken
// (a non-object) until the history tab is active, then an object with a
// `page` field. The mock honours that contract — it yields no data for
// skipToken and a per-page fixture otherwise, so the page-accumulation
// effect can be exercised deterministically.
type HistoryQueryResult = {
  data:
    | {
        items: InboxRowFixture[];
        page: number;
        size: number;
        totalElements: number;
        totalPages: number;
        windowStart: string;
        windowDays: number;
      }
    | undefined;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
};
const EMPTY_HISTORY_RESULT: HistoryQueryResult = {
  data: undefined,
  isLoading: false,
  isError: false,
  isFetching: false,
};
let historyQueryByPage: Record<number, HistoryQueryResult> = {};
const useListHistoryQueryMock = vi.fn((arg: unknown, _opts?: unknown) => {
  if (arg && typeof arg === 'object' && 'page' in arg) {
    const page = (arg as { page: number }).page;
    return historyQueryByPage[page] ?? EMPTY_HISTORY_RESULT;
  }
  return EMPTY_HISTORY_RESULT;
});

vi.mock('../../features/notifications/api/notify-inbox.api', () => ({
  useListInboxQuery: (arg: unknown, opts?: unknown) => useListInboxQueryMock(arg, opts),
  useListHistoryQuery: (arg: unknown, opts?: unknown) => useListHistoryQueryMock(arg, opts),
  useMarkReadMutation: () => [markReadMutationMock, { isLoading: false }],
  useArchiveMutation: () => [archiveMutationMock, { isLoading: false }],
  useMarkAllAsReadMutation: () => [markAllAsReadMutationMock, { isLoading: false }],
}));

// Faz 23.4 PR-E.5 PR4: live SSE hook is a no-op in jsdom unit tests
// (EventSource semantics covered by useInboxUnreadSse.test.ts). Returning
// a stable stub keeps NotificationCenter render deterministic.
vi.mock('../../features/notifications/api/useInboxUnreadSse', () => ({
  useInboxUnreadSse: () => ({ connected: false, lastUnreadCount: null, retryCount: 0 }),
}));

vi.mock('../../features/notifications/model/identity.selectors', () => ({
  selectNotifyIdentity: () => identityMock,
}));

vi.mock('../../features/notifications/model/inbox-item-mapper', async () => {
  const actual = await vi.importActual<
    typeof import('../../features/notifications/model/inbox-item-mapper')
  >('../../features/notifications/model/inbox-item-mapper');
  return actual;
});

describe('NotificationCenter', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    navigateMock.mockReset();
    actionsMock.toggle.mockReset();
    actionsMock.markAllRead.mockReset();
    actionsMock.markSelectedRead.mockReset();
    actionsMock.clear.mockReset();
    actionsMock.remove.mockReset();
    actionsMock.removeMany.mockReset();
    stateMock.items = [];
    stateMock.unreadCount = 0;
    stateMock.isOpen = false;
    // Faz 23.4 PR-E.5: reset inbox-tab fixtures.
    identityMock = null;
    inboxQueryMock = { data: undefined, isLoading: false, isError: false };
    historyQueryByPage = {};
    markReadMutationMock.mockReset();
    archiveMutationMock.mockReset();
    markAllAsReadMutationMock.mockReset();
    useListInboxQueryMock.mockClear();
    useListHistoryQueryMock.mockClear();
  });

  it('okunmamis sayiyi bell butonunda gosterir', () => {
    stateMock.unreadCount = 3;

    render(<NotificationCenter />);

    expect(screen.getByRole('button', { name: 'Bildirimler (3 okunmamış)' })).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('audit aksiyonunu NotificationPanel uzerinden yonlendirir ve bildirimi kapatir', () => {
    stateMock.isOpen = true;
    stateMock.unreadCount = 1;
    stateMock.items = [
      {
        id: 'notif-1',
        message: 'Audit kaydi olustu',
        description: 'Detaylar hazir',
        type: 'info',
        createdAt: 1710000000000,
        read: false,
        meta: { auditId: 'audit-42' },
      },
    ];

    render(<NotificationCenter />);

    fireEvent.click(screen.getByRole('button', { name: 'Audit kaydını aç' }));

    expect(navigateMock).toHaveBeenCalledWith({
      pathname: '/audit/events',
      search: 'auditId=audit-42',
    });
    expect(actionsMock.remove).toHaveBeenCalledWith('notif-1');
    expect(actionsMock.toggle).toHaveBeenCalledWith(false);
  });

  it('generic deep-link aksiyonunu meta pathname/search ile yonlendirir', () => {
    stateMock.isOpen = true;
    stateMock.unreadCount = 1;
    stateMock.items = [
      {
        id: 'notif-2',
        message: 'Oturum acildi',
        description: 'Session audit kaydi hazir',
        type: 'success',
        createdAt: 1710000000000,
        read: false,
        meta: {
          pathname: '/audit/events',
          search: 'service=auth-service&action=SESSION_CREATED',
          actionLabel: 'Oturum audit kaydini ac',
        },
      },
    ];

    render(<NotificationCenter />);

    fireEvent.click(screen.getByRole('button', { name: 'Oturum audit kaydini ac' }));

    expect(navigateMock).toHaveBeenCalledWith({
      pathname: '/audit/events',
      search: 'service=auth-service&action=SESSION_CREATED',
    });
    expect(actionsMock.remove).toHaveBeenCalledWith('notif-2');
    expect(actionsMock.toggle).toHaveBeenCalledWith(false);
  });

  it('secili bildirimler icin batch okundu callbackini tetikler', () => {
    stateMock.isOpen = true;
    stateMock.items = [
      {
        id: 'notif-1',
        message: 'Sync tamamlandi',
        type: 'success',
        createdAt: Date.now(),
        read: false,
      },
    ];

    render(<NotificationCenter />);

    const dialog = screen.getByRole('dialog', { name: 'Bildirim merkezi' });
    fireEvent.click(
      within(dialog).getByRole('checkbox', { name: 'Sync tamamlandi bildirimini sec' }),
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Secimi okundu say' }));

    expect(actionsMock.markSelectedRead).toHaveBeenCalledWith(['notif-1']);
  });

  /**
   * Faz 23.4 PR-E.5 v1 UI inbox tab integration tests.
   *
   * The default mocks above lock identity to null + inbox query empty,
   * which exercises the system-tab path. These tests override the mocks
   * via vi.doMock + dynamic import so the inbox-tab path is also covered:
   * - Tab switcher renders both tabs and the inbox row appears under it.
   * - Removing an inbox row dispatches archiveMutation with the prefix-
   *   stripped numeric id and the resolved identity.
   * Codex iter-5 RED absorb requested at minimum these assertions before
   * deferring deeper E2E coverage to PR5.
   */
  describe('inbox tab', () => {
    it('renders inbox-tab items when identity resolved', () => {
      identityMock = { orgId: 'default', subscriberId: '1204' };
      inboxQueryMock = {
        data: {
          items: [
            {
              id: 42,
              intentId: 'intent-1',
              subject: 'Inbox row',
              bodyText: null,
              bodyHtml: null,
              locale: 'tr-TR',
              topicKey: 'inbox.test',
              severity: 'info',
              state: 'UNREAD',
              readAt: null,
              archivedAt: null,
              createdAt: '2026-05-07T08:00:00Z',
              expiresAt: null,
            },
          ],
          page: 0,
          size: 20,
          totalElements: 1,
          totalPages: 1,
          unreadCount: 1,
        },
        isLoading: false,
        isError: false,
      };
      stateMock.isOpen = true;

      render(<NotificationCenter />);

      // Bell badge sums local (0) + inbox (1) = 1 unread.
      expect(
        screen.getByRole('button', { name: /Bildirimler \(1 okunmamış\)/ }),
      ).toBeInTheDocument();
      // Tab switcher renders both tabs.
      expect(screen.getByRole('tab', { name: /Sistem/ })).toBeInTheDocument();
      const inboxTab = screen.getByRole('tab', { name: /Bildirimlerim/ });
      expect(inboxTab).toBeInTheDocument();
      expect(inboxTab).not.toBeDisabled();

      // After clicking the inbox tab, the inbox row's subject should be
      // visible in the drawer.
      fireEvent.click(inboxTab);
      const dialog = screen.getByRole('dialog', { name: 'Bildirim merkezi' });
      expect(within(dialog).getByText('Inbox row')).toBeInTheDocument();
    });

    it('dispatches archiveMutation when the inbox row is removed', () => {
      identityMock = { orgId: 'default', subscriberId: '1204' };
      inboxQueryMock = {
        data: {
          items: [
            {
              id: 42,
              intentId: null,
              subject: 'Archive me',
              bodyText: null,
              bodyHtml: null,
              locale: null,
              topicKey: 'inbox.archive',
              severity: 'info',
              state: 'UNREAD',
              readAt: null,
              archivedAt: null,
              createdAt: '2026-05-07T08:00:00Z',
              expiresAt: null,
            },
          ],
          page: 0,
          size: 20,
          totalElements: 1,
          totalPages: 1,
          unreadCount: 1,
        },
        isLoading: false,
        isError: false,
      };
      stateMock.isOpen = true;

      render(<NotificationCenter />);
      fireEvent.click(screen.getByRole('tab', { name: /Bildirimlerim/ }));
      const dialog = screen.getByRole('dialog', { name: 'Bildirim merkezi' });
      // Inbox tab uses "Arşivle" as remove label (see component).
      fireEvent.click(within(dialog).getByRole('button', { name: 'Arşivle' }));

      expect(archiveMutationMock).toHaveBeenCalledWith({
        orgId: 'default',
        subscriberId: '1204',
        id: 42,
      });
    });

    it('disables the inbox tab while identity is unresolved', () => {
      // Default mocks (identity null) — verifies the disabled state.
      stateMock.isOpen = true;
      render(<NotificationCenter />);

      const inboxTab = screen.getByRole('tab', { name: /Bildirimlerim/ });
      expect(inboxTab).toBeDisabled();
    });

    /**
     * PR-5.X follow-up (Codex thread `019e075d` PARTIAL iter-1):
     * regression guard for the page-load race. Earlier the component
     * passed {@code inboxQueryArg ?? { orgId: '', subscriberId: '' }} as
     * the hook arg, which let RTK Query schedule fetches with empty
     * identity headers during the brief window when {@code identity}
     * was still {@code null}. Now the hook receives {@code skipToken},
     * which RTK Query short-circuits to a no-op without ever calling
     * the endpoint's {@code query} function or initiating fetch.
     */
    it('passes skipToken to useListInboxQuery while identity is unresolved', async () => {
      const { skipToken } = await import('@reduxjs/toolkit/query/react');
      identityMock = null;
      render(<NotificationCenter />);

      expect(useListInboxQueryMock).toHaveBeenCalled();
      const calls = useListInboxQueryMock.mock.calls;
      // Every call before identity resolves must use skipToken — never
      // a placeholder identity object.
      for (const [arg] of calls) {
        expect(arg).toBe(skipToken);
      }
    });

    it('passes the resolved identity object to useListInboxQuery once identity is set', () => {
      identityMock = { orgId: 'default', subscriberId: '1204' };
      render(<NotificationCenter />);

      const lastCall = useListInboxQueryMock.mock.calls.at(-1);
      expect(lastCall).toBeDefined();
      const [arg] = lastCall as [unknown];
      expect(arg).toEqual({ orgId: 'default', subscriberId: '1204' });
    });

    /**
     * Faz 23.5 PR4 absorb — bulk mark-all-read integration.
     * Replaces the prior N+1 markRead loop with a single mutation
     * call. Test verifies: clicking "Tümünü okundu say" on the inbox
     * tab dispatches markAllAsReadMutation exactly once with the
     * resolved identity, and does NOT call the per-row markRead.
     */
    it('dispatches markAllAsReadMutation once when bulk mark-all-read is clicked on inbox tab', () => {
      identityMock = { orgId: 'default', subscriberId: '1204' };
      inboxQueryMock = {
        data: {
          items: [
            {
              id: 11,
              intentId: null,
              subject: 'Row A',
              bodyText: null,
              bodyHtml: null,
              locale: null,
              topicKey: 'k',
              severity: 'info',
              state: 'UNREAD',
              readAt: null,
              archivedAt: null,
              createdAt: '2026-05-07T08:00:00Z',
              expiresAt: null,
            },
            {
              id: 12,
              intentId: null,
              subject: 'Row B',
              bodyText: null,
              bodyHtml: null,
              locale: null,
              topicKey: 'k',
              severity: 'info',
              state: 'UNREAD',
              readAt: null,
              archivedAt: null,
              createdAt: '2026-05-07T08:01:00Z',
              expiresAt: null,
            },
          ],
          page: 0,
          size: 20,
          totalElements: 2,
          totalPages: 1,
          unreadCount: 2,
        },
        isLoading: false,
        isError: false,
      };
      stateMock.isOpen = true;

      render(<NotificationCenter />);
      fireEvent.click(screen.getByRole('tab', { name: /Bildirimlerim/ }));
      const dialog = screen.getByRole('dialog', { name: 'Bildirim merkezi' });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Tümünü okundu say' }));

      // Single bulk call, with the resolved identity. No per-row loop.
      expect(markAllAsReadMutationMock).toHaveBeenCalledTimes(1);
      expect(markAllAsReadMutationMock).toHaveBeenCalledWith({
        orgId: 'default',
        subscriberId: '1204',
      });
      expect(markReadMutationMock).not.toHaveBeenCalled();
    });
  });

  /**
   * Faz 23.4 M6a — 30-day notification history tab.
   *
   * The Geçmiş tab is a read-only review surface: it lists rows in every
   * state (UNREAD + READ + ARCHIVED) and exposes no mutation actions.
   * Pages are accumulated client-side via "Daha fazla göster".
   */
  describe('history tab (Geçmiş)', () => {
    const historyRow = (overrides: Partial<InboxRowFixture> = {}): InboxRowFixture => ({
      id: 70,
      intentId: null,
      subject: 'Geçmiş bildirimi',
      bodyText: null,
      bodyHtml: null,
      locale: null,
      topicKey: 'history.test',
      severity: 'info',
      state: 'ARCHIVED',
      readAt: null,
      archivedAt: '2026-05-10T08:00:00Z',
      createdAt: '2026-05-10T08:00:00Z',
      expiresAt: null,
      ...overrides,
    });

    const historyResult = (
      items: InboxRowFixture[],
      page: number,
      totalElements: number,
      totalPages: number,
    ): HistoryQueryResult => ({
      data: {
        items,
        page,
        size: 50,
        totalElements,
        totalPages,
        windowStart: '2026-04-19T00:00:00Z',
        windowDays: 30,
      },
      isLoading: false,
      isError: false,
      isFetching: false,
    });

    it('renders history rows (including archived) when the Geçmiş tab is selected', () => {
      identityMock = { orgId: 'default', subscriberId: '1204' };
      historyQueryByPage = {
        0: historyResult([historyRow({ id: 70, subject: 'Arşivlenmiş bildirim' })], 0, 1, 1),
      };
      stateMock.isOpen = true;

      render(<NotificationCenter />);
      const historyTab = screen.getByRole('tab', { name: /Geçmiş/ });
      expect(historyTab).toBeInTheDocument();
      fireEvent.click(historyTab);

      const dialog = screen.getByRole('dialog', { name: 'Bildirim merkezi' });
      expect(within(dialog).getByText('Arşivlenmiş bildirim')).toBeInTheDocument();
    });

    it('is read-only — no archive / mark-all-read actions on the history tab', () => {
      identityMock = { orgId: 'default', subscriberId: '1204' };
      historyQueryByPage = { 0: historyResult([historyRow()], 0, 1, 1) };
      stateMock.isOpen = true;

      render(<NotificationCenter />);
      fireEvent.click(screen.getByRole('tab', { name: /Geçmiş/ }));
      const dialog = screen.getByRole('dialog', { name: 'Bildirim merkezi' });

      // Mutation affordances are absent on the read-only history surface.
      expect(within(dialog).queryByRole('button', { name: 'Tümünü okundu say' })).toBeNull();
      expect(within(dialog).queryByRole('button', { name: 'Arşivle' })).toBeNull();
      expect(within(dialog).queryByRole('button', { name: 'Tümünü arşivle' })).toBeNull();
    });

    it('disables the Geçmiş tab while identity is unresolved', () => {
      stateMock.isOpen = true;
      render(<NotificationCenter />);
      expect(screen.getByRole('tab', { name: /Geçmiş/ })).toBeDisabled();
    });

    it('accumulates the next page when "Daha fazla göster" is clicked', () => {
      identityMock = { orgId: 'default', subscriberId: '1204' };
      historyQueryByPage = {
        0: historyResult([historyRow({ id: 70, subject: 'Sayfa 1 bildirimi' })], 0, 2, 2),
        1: historyResult([historyRow({ id: 71, subject: 'Sayfa 2 bildirimi' })], 1, 2, 2),
      };
      stateMock.isOpen = true;

      render(<NotificationCenter />);
      fireEvent.click(screen.getByRole('tab', { name: /Geçmiş/ }));
      const dialog = screen.getByRole('dialog', { name: 'Bildirim merkezi' });
      // Page 0 row visible; page 2 row not yet fetched.
      expect(within(dialog).getByText('Sayfa 1 bildirimi')).toBeInTheDocument();
      expect(within(dialog).queryByText('Sayfa 2 bildirimi')).toBeNull();

      // Load more → page 1 fetched + appended (page 0 row stays present).
      fireEvent.click(within(dialog).getByRole('button', { name: 'Daha fazla göster' }));

      expect(within(dialog).getByText('Sayfa 1 bildirimi')).toBeInTheDocument();
      expect(within(dialog).getByText('Sayfa 2 bildirimi')).toBeInTheDocument();
      // The hook was invoked with page:1 for the second fetch.
      const pageArgs = useListHistoryQueryMock.mock.calls
        .map(([arg]) => arg)
        .filter((arg): arg is { page: number } => !!arg && typeof arg === 'object' && 'page' in arg)
        .map((arg) => arg.page);
      expect(pageArgs).toContain(1);
    });

    it('keeps accumulated history across a re-render when identity values are unchanged (P1)', () => {
      // useAppSelector yields a fresh {orgId,subscriberId} object on every
      // render (production behaviour). The reset effect keys on identity
      // VALUES (identityKey), not the object ref — so a re-render with the
      // same identity values must NOT wipe the accumulated history.
      identityMock = { orgId: 'default', subscriberId: '1204' };
      historyQueryByPage = {
        0: historyResult([historyRow({ id: 70, subject: 'Kalıcı bildirim' })], 0, 1, 1),
      };
      stateMock.isOpen = true;

      const { rerender } = render(<NotificationCenter />);
      fireEvent.click(screen.getByRole('tab', { name: /Geçmiş/ }));
      expect(
        within(screen.getByRole('dialog', { name: 'Bildirim merkezi' })).getByText(
          'Kalıcı bildirim',
        ),
      ).toBeInTheDocument();

      // Re-render — useAppSelector returns a new identity object (same
      // values). A ref-keyed reset effect would blank the list here.
      rerender(<NotificationCenter />);
      expect(
        within(screen.getByRole('dialog', { name: 'Bildirim merkezi' })).getByText(
          'Kalıcı bildirim',
        ),
      ).toBeInTheDocument();
    });
  });
});
