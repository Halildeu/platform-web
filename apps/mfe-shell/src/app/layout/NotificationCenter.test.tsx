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
// selector and dispatches inbox API hooks. The existing tests cover
// local-toast behavior only; we mock the new dependencies so identity is
// null + inbox query is empty — falling back to the system-tab path that
// these tests already exercise.
const inboxQueryMock = {
  data: undefined,
  isLoading: false,
  isError: false,
};
const markReadMutationMock = vi.fn();
const archiveMutationMock = vi.fn();

vi.mock('../store/store.hooks', () => ({
  useAppSelector: () => null,
}));

vi.mock('../../features/notifications/api/notify-inbox.api', () => ({
  useListInboxQuery: () => inboxQueryMock,
  useMarkReadMutation: () => [markReadMutationMock, { isLoading: false }],
  useArchiveMutation: () => [archiveMutationMock, { isLoading: false }],
}));

vi.mock('../../features/notifications/model/identity.selectors', () => ({
  selectNotifyIdentity: () => null,
}));

vi.mock('../../features/notifications/model/inbox-item-mapper', () => ({
  inboxItemToSurfaceItem: (row: unknown) => row,
  extractInboxRowId: (id: string) => {
    if (typeof id !== 'string' || !id.startsWith('inbox-')) return null;
    const parsed = Number.parseInt(id.slice('inbox-'.length), 10);
    return Number.isFinite(parsed) ? parsed : null;
  },
}));

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
});
