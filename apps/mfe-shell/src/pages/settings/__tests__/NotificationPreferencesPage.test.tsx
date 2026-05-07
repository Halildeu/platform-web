// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import NotificationPreferencesPage from '../NotificationPreferencesPage';

/**
 * Faz 23.5 PR3 — Preferences page render + interaction tests.
 *
 * Pattern: same mutable-mock approach as NotificationCenter tests —
 * vi.mock factories close over module-level fixtures so each test can
 * flip identity / list / mutation state without resetModules.
 */

let identityMock: { orgId: string; subscriberId: string } | null = null;

let listQueryMock = {
  data: undefined as unknown[] | undefined,
  isLoading: false,
  isError: false,
  error: undefined as unknown,
};
const upsertMutationMock = vi.fn();
const deleteMutationMock = vi.fn();

vi.mock('../../../app/store/store.hooks', () => ({
  useAppSelector: () => identityMock,
}));

vi.mock('../../../features/notifications/model/identity.selectors', () => ({
  selectNotifyIdentity: () => identityMock,
}));

vi.mock('../../../features/notifications/api/notify-prefs.api', () => ({
  useListPreferencesQuery: () => listQueryMock,
  useUpsertPreferenceMutation: () => [
    (args: unknown) => ({
      unwrap: async () => upsertMutationMock(args),
    }),
    { isLoading: false },
  ],
  useDeletePreferenceMutation: () => [
    (args: unknown) => ({
      unwrap: async () => deleteMutationMock(args),
    }),
    { isLoading: false },
  ],
}));

beforeEach(() => {
  identityMock = null;
  listQueryMock = { data: undefined, isLoading: false, isError: false, error: undefined };
  upsertMutationMock.mockReset();
  deleteMutationMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('NotificationPreferencesPage', () => {
  it('shows the sign-in fallback when identity unresolved', () => {
    render(<NotificationPreferencesPage />);
    expect(screen.getByText('Önce oturum açın.')).toBeInTheDocument();
  });

  it('renders empty state when there are no rules', () => {
    identityMock = { orgId: 'default', subscriberId: 'sub-1' };
    listQueryMock = { data: [], isLoading: false, isError: false, error: undefined };

    render(<NotificationPreferencesPage />);

    expect(screen.getByRole('heading', { name: 'Bildirim Tercihleri' })).toBeInTheDocument();
    expect(screen.getByText(/Henüz tanımlı bir kural yok/)).toBeInTheDocument();
  });

  it('shows preferences-disabled message on backend 503', () => {
    identityMock = { orgId: 'default', subscriberId: 'sub-1' };
    listQueryMock = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: { status: 503 },
    };

    render(<NotificationPreferencesPage />);
    expect(screen.getByText(/Bildirim tercihi özelliği bu ortamda kapalı/)).toBeInTheDocument();
  });

  it('renders rows + dispatches upsert on toggle', async () => {
    identityMock = { orgId: 'default', subscriberId: 'sub-1' };
    listQueryMock = {
      data: [
        {
          id: 1,
          topicKey: 'report.export.ready',
          channel: 'email',
          enabled: true,
          quietHours: null,
          frequencyLimitPerDay: null,
          bypassForCritical: true,
          createdAt: '2026-05-07T08:00:00Z',
          updatedAt: '2026-05-07T08:00:00Z',
        },
      ],
      isLoading: false,
      isError: false,
      error: undefined,
    };
    upsertMutationMock.mockResolvedValue({ id: 1, enabled: false });

    render(<NotificationPreferencesPage />);

    expect(screen.getByText('report.export.ready')).toBeInTheDocument();
    expect(screen.getByText('email')).toBeInTheDocument();

    const toggle = screen.getByRole('button', {
      name: /report\.export\.ready email kuralını kapat/,
    });
    fireEvent.click(toggle);

    // Mutation called with the inverted enabled flag + identity.
    await vi.waitFor(() => {
      expect(upsertMutationMock).toHaveBeenCalledTimes(1);
    });
    const arg = upsertMutationMock.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.enabled).toBe(false);
    expect(arg.orgId).toBe('default');
    expect(arg.subscriberId).toBe('sub-1');
  });

  it('arms then confirms delete via two-stage flow', async () => {
    identityMock = { orgId: 'default', subscriberId: 'sub-1' };
    listQueryMock = {
      data: [
        {
          id: 7,
          topicKey: null,
          channel: null,
          enabled: false,
          quietHours: null,
          frequencyLimitPerDay: null,
          bypassForCritical: true,
          createdAt: '2026-05-07T08:00:00Z',
          updatedAt: '2026-05-07T08:00:00Z',
        },
      ],
      isLoading: false,
      isError: false,
      error: undefined,
    };
    deleteMutationMock.mockResolvedValue(undefined);

    render(<NotificationPreferencesPage />);

    // First click arms the confirm; mutation NOT yet dispatched.
    fireEvent.click(screen.getByRole('button', { name: /7 numaralı kuralı sil/ }));
    expect(deleteMutationMock).not.toHaveBeenCalled();
    expect(screen.getByText('Emin misiniz?')).toBeInTheDocument();

    // Second click on "Onayla" actually deletes.
    fireEvent.click(
      screen.getByRole('button', { name: /7 numaralı kuralı silme işlemini onayla/ }),
    );

    await vi.waitFor(() => {
      expect(deleteMutationMock).toHaveBeenCalledWith({
        orgId: 'default',
        subscriberId: 'sub-1',
        id: 7,
      });
    });
  });

  it('cancels delete when "Vazgeç" is clicked', async () => {
    identityMock = { orgId: 'default', subscriberId: 'sub-1' };
    listQueryMock = {
      data: [
        {
          id: 8,
          topicKey: 'foo',
          channel: 'bar',
          enabled: true,
          quietHours: null,
          frequencyLimitPerDay: null,
          bypassForCritical: true,
          createdAt: '2026-05-07T08:00:00Z',
          updatedAt: '2026-05-07T08:00:00Z',
        },
      ],
      isLoading: false,
      isError: false,
      error: undefined,
    };

    render(<NotificationPreferencesPage />);

    fireEvent.click(screen.getByRole('button', { name: /8 numaralı kuralı sil/ }));
    expect(screen.getByText('Emin misiniz?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /silmekten vazgeç/ }));

    expect(screen.queryByText('Emin misiniz?')).not.toBeInTheDocument();
    expect(deleteMutationMock).not.toHaveBeenCalled();
  });

  it('dispatches upsert from the inline new-row form', async () => {
    identityMock = { orgId: 'default', subscriberId: 'sub-1' };
    listQueryMock = { data: [], isLoading: false, isError: false, error: undefined };
    upsertMutationMock.mockResolvedValue({ id: 99, enabled: true });

    render(<NotificationPreferencesPage />);
    fireEvent.change(screen.getByLabelText(/Konu/), {
      target: { value: 'system.maintenance' },
    });
    fireEvent.change(screen.getByLabelText(/Kanal/), { target: { value: 'sms' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kuralı kaydet' }));

    await vi.waitFor(() => {
      expect(upsertMutationMock).toHaveBeenCalledTimes(1);
    });
    const arg = upsertMutationMock.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.topicKey).toBe('system.maintenance');
    expect(arg.channel).toBe('sms');
    expect(arg.enabled).toBe(true);
  });

  it('treats blank topic/channel as wildcard nulls in the upsert payload', async () => {
    identityMock = { orgId: 'default', subscriberId: 'sub-1' };
    listQueryMock = { data: [], isLoading: false, isError: false, error: undefined };
    upsertMutationMock.mockResolvedValue({ id: 99, enabled: false });

    render(<NotificationPreferencesPage />);
    fireEvent.click(screen.getByLabelText(/Etkin/));
    fireEvent.click(screen.getByRole('button', { name: 'Kuralı kaydet' }));

    await vi.waitFor(() => {
      expect(upsertMutationMock).toHaveBeenCalledTimes(1);
    });
    const arg = upsertMutationMock.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.topicKey).toBeNull();
    expect(arg.channel).toBeNull();
    expect(arg.enabled).toBe(false);
  });
});
