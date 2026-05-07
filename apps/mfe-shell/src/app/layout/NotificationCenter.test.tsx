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
    // Most callers pass selectNotifyIdentity; we treat any selector arg
    // as a no-op and just return the current identity fixture so the
    // component sees the same value its selector mock would produce.
    if (typeof selector === 'function') {
      return identityMock;
    }
    return identityMock;
  },
}));

vi.mock('../../features/notifications/api/notify-inbox.api', () => ({
  useListInboxQuery: () => inboxQueryMock,
  useMarkReadMutation: () => [markReadMutationMock, { isLoading: false }],
  useArchiveMutation: () => [archiveMutationMock, { isLoading: false }],
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
    markReadMutationMock.mockReset();
    archiveMutationMock.mockReset();
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
  });
});
