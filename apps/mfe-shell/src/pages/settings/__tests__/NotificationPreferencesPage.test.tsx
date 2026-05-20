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
const restoreDefaultsMutationMock = vi.fn();
const muteChannelMutationMock = vi.fn();

vi.mock('../../../app/store/store.hooks', () => ({
  useAppSelector: () => identityMock,
}));

vi.mock('../../../features/notifications/model/identity.selectors', () => ({
  selectNotifyIdentity: () => identityMock,
}));

// Faz 23.5 M5 G3b: NotificationPreferenceForm (loaded transitively when
// the drawer opens or page renders form) calls useListTopicCatalogQuery.
// Without a Redux Provider wrapper the hook throws; mock it to a no-op
// so page-level interaction tests do not depend on store wiring.
// Existing page-level tests still exercise the Form's pref-form-topic
// field (e.g. "opens the rich editor" test), so the Form component
// itself stays real; only its catalog hook is mocked.
vi.mock('../../../features/notifications/api/notify-topic-catalog.api', () => ({
  useListTopicCatalogQuery: () => ({ data: undefined, isLoading: false, error: undefined }),
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
  useRestoreDefaultsMutation: () => [
    (args: unknown) => ({
      unwrap: async () => restoreDefaultsMutationMock(args),
    }),
    { isLoading: false },
  ],
  useMuteChannelMutation: () => [
    (args: unknown) => ({
      unwrap: async () => muteChannelMutationMock(args),
    }),
    { isLoading: false },
  ],
}));

beforeEach(() => {
  identityMock = null;
  listQueryMock = { data: undefined, isLoading: false, isError: false, error: undefined };
  upsertMutationMock.mockReset();
  deleteMutationMock.mockReset();
  restoreDefaultsMutationMock.mockReset();
  muteChannelMutationMock.mockReset();
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

  it('renders rows + dispatches upsert on toggle and preserves rich fields (Faz 23.6)', async () => {
    identityMock = { orgId: 'default', subscriberId: 'sub-1' };
    const rowQuietHours = {
      start: '22:00',
      end: '07:00',
      timezone: 'Europe/Istanbul',
      days: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    };
    listQueryMock = {
      data: [
        {
          id: 1,
          topicKey: 'report.export.ready',
          channel: 'email',
          enabled: true,
          quietHours: rowQuietHours,
          frequencyLimitPerDay: 5,
          bypassForCritical: false,
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

    // Mutation called with the inverted enabled flag + identity + rich fields.
    await vi.waitFor(() => {
      expect(upsertMutationMock).toHaveBeenCalledTimes(1);
    });
    const arg = upsertMutationMock.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.enabled).toBe(false);
    expect(arg.orgId).toBe('default');
    expect(arg.subscriberId).toBe('sub-1');
    // Faz 23.6 PR-B1: quick toggle MUST preserve rich fields so they
    // do not silently reset.
    expect(arg.quietHours).toEqual(rowQuietHours);
    expect(arg.frequencyLimitPerDay).toBe(5);
    expect(arg.bypassForCritical).toBe(false);
  });

  it('renders constraints summary badges based on row data (Faz 23.6)', () => {
    identityMock = { orgId: 'default', subscriberId: 'sub-1' };
    listQueryMock = {
      data: [
        {
          id: 1,
          topicKey: 'report.export.ready',
          channel: 'email',
          enabled: true,
          quietHours: {
            start: '22:00',
            end: '07:00',
            timezone: 'Europe/Istanbul',
            days: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
          },
          frequencyLimitPerDay: 5,
          bypassForCritical: false,
          createdAt: '2026-05-07T08:00:00Z',
          updatedAt: '2026-05-07T08:00:00Z',
        },
      ],
      isLoading: false,
      isError: false,
      error: undefined,
    };

    render(<NotificationPreferencesPage />);

    expect(screen.getByTestId('pref-row-badge-quiet')).toBeInTheDocument();
    expect(screen.getByTestId('pref-row-badge-freq')).toBeInTheDocument();
    expect(screen.getByTestId('pref-row-badge-bypass-off')).toBeInTheDocument();
  });

  it('opens the rich editor when "Düzenle" is clicked', () => {
    identityMock = { orgId: 'default', subscriberId: 'sub-1' };
    listQueryMock = {
      data: [
        {
          id: 42,
          topicKey: 'system.maintenance',
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

    render(<NotificationPreferencesPage />);

    fireEvent.click(screen.getByTestId('pref-row-edit-42'));
    // The form drawer mounts and the topic input is hydrated with the
    // row's existing value.
    expect(screen.getByTestId('pref-form-topic')).toHaveValue('system.maintenance');
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

  // ── Faz 23.6 PR-C1 — Restore defaults destructive bulk action ─────────

  it('disables the restore-defaults button when there are no rows', () => {
    identityMock = { orgId: 'default', subscriberId: 'sub-1' };
    listQueryMock = { data: [], isLoading: false, isError: false, error: undefined };

    render(<NotificationPreferencesPage />);
    const arm = screen.getByTestId('pref-restore-defaults-arm') as HTMLButtonElement;
    expect(arm).toBeDisabled();
  });

  it('enables the button when rows exist; arms two-stage confirm on first click', () => {
    identityMock = { orgId: 'default', subscriberId: 'sub-1' };
    listQueryMock = {
      data: [
        {
          id: 1,
          topicKey: 'auth.password-reset',
          channel: 'email',
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

    render(<NotificationPreferencesPage />);
    fireEvent.click(screen.getByTestId('pref-restore-defaults-arm'));

    expect(screen.getByTestId('pref-restore-defaults-confirm-row')).toBeInTheDocument();
    expect(restoreDefaultsMutationMock).not.toHaveBeenCalled();
  });

  it('cancels the confirm without calling the mutation', () => {
    identityMock = { orgId: 'default', subscriberId: 'sub-1' };
    listQueryMock = {
      data: [
        {
          id: 1,
          topicKey: 'auth.password-reset',
          channel: 'email',
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

    render(<NotificationPreferencesPage />);
    fireEvent.click(screen.getByTestId('pref-restore-defaults-arm'));
    fireEvent.click(screen.getByTestId('pref-restore-defaults-cancel'));

    expect(screen.queryByTestId('pref-restore-defaults-confirm-row')).not.toBeInTheDocument();
    expect(restoreDefaultsMutationMock).not.toHaveBeenCalled();
  });

  it('confirms + calls mutation + shows success banner with deletedCount', async () => {
    identityMock = { orgId: 'default', subscriberId: 'sub-1' };
    listQueryMock = {
      data: [
        {
          id: 1,
          topicKey: 'auth.password-reset',
          channel: 'email',
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
    restoreDefaultsMutationMock.mockResolvedValue({ deletedCount: 5 });

    render(<NotificationPreferencesPage />);
    fireEvent.click(screen.getByTestId('pref-restore-defaults-arm'));
    fireEvent.click(screen.getByTestId('pref-restore-defaults-confirm'));

    await vi.waitFor(() => {
      expect(restoreDefaultsMutationMock).toHaveBeenCalledTimes(1);
    });
    const arg = restoreDefaultsMutationMock.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.orgId).toBe('default');
    expect(arg.subscriberId).toBe('sub-1');

    await vi.waitFor(() => {
      expect(screen.getByTestId('pref-restore-defaults-success')).toBeInTheDocument();
    });
    expect(screen.getByText(/5 kural silindi/)).toBeInTheDocument();
  });

  it('shows the no-rules-deleted message when deletedCount is zero', async () => {
    identityMock = { orgId: 'default', subscriberId: 'sub-1' };
    listQueryMock = {
      data: [
        {
          id: 1,
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
    restoreDefaultsMutationMock.mockResolvedValue({ deletedCount: 0 });

    render(<NotificationPreferencesPage />);
    fireEvent.click(screen.getByTestId('pref-restore-defaults-arm'));
    fireEvent.click(screen.getByTestId('pref-restore-defaults-confirm'));

    await vi.waitFor(() => {
      expect(screen.getByTestId('pref-restore-defaults-success')).toBeInTheDocument();
    });
    expect(screen.getByText(/Silinecek kural yoktu/)).toBeInTheDocument();
  });

  it('renders inline error banner with status-aware Türkçe copy on 503', async () => {
    identityMock = { orgId: 'default', subscriberId: 'sub-1' };
    listQueryMock = {
      data: [
        {
          id: 1,
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
    restoreDefaultsMutationMock.mockRejectedValue({ status: 503 });

    render(<NotificationPreferencesPage />);
    fireEvent.click(screen.getByTestId('pref-restore-defaults-arm'));
    fireEvent.click(screen.getByTestId('pref-restore-defaults-confirm'));

    await vi.waitFor(() => {
      expect(screen.getByTestId('pref-restore-defaults-error')).toBeInTheDocument();
    });
    expect(screen.getByText(/bu ortamda kapalı/)).toBeInTheDocument();
  });

  // ── Faz 23.6 PR-C2 — Channel-mute action ─────────────────────────────

  it('arms mute-channel confirm when a channel is picked from the select', () => {
    identityMock = { orgId: 'default', subscriberId: 'sub-1' };
    listQueryMock = { data: [], isLoading: false, isError: false, error: undefined };

    render(<NotificationPreferencesPage />);
    const select = screen.getByTestId('pref-mute-channel-select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'email' } });

    expect(screen.getByTestId('pref-mute-channel-confirm-row')).toBeInTheDocument();
    expect(muteChannelMutationMock).not.toHaveBeenCalled();
  });

  it('cancels mute-channel without firing the mutation', () => {
    identityMock = { orgId: 'default', subscriberId: 'sub-1' };
    listQueryMock = { data: [], isLoading: false, isError: false, error: undefined };

    render(<NotificationPreferencesPage />);
    fireEvent.change(screen.getByTestId('pref-mute-channel-select'), {
      target: { value: 'email' },
    });
    fireEvent.click(screen.getByTestId('pref-mute-channel-cancel'));

    expect(screen.queryByTestId('pref-mute-channel-confirm-row')).not.toBeInTheDocument();
    expect(muteChannelMutationMock).not.toHaveBeenCalled();
  });

  it('confirms mute-channel and shows success banner with both counts', async () => {
    identityMock = { orgId: 'default', subscriberId: 'sub-1' };
    listQueryMock = { data: [], isLoading: false, isError: false, error: undefined };
    muteChannelMutationMock.mockResolvedValue({
      channel: 'email',
      muted: true,
      deletedOverrideCount: 3,
      shadowDenyCount: 2,
    });

    render(<NotificationPreferencesPage />);
    fireEvent.change(screen.getByTestId('pref-mute-channel-select'), {
      target: { value: 'email' },
    });
    fireEvent.click(screen.getByTestId('pref-mute-channel-confirm'));

    await vi.waitFor(() => {
      expect(muteChannelMutationMock).toHaveBeenCalledTimes(1);
    });
    const arg = muteChannelMutationMock.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.orgId).toBe('default');
    expect(arg.subscriberId).toBe('sub-1');
    expect(arg.channel).toBe('email');

    await vi.waitFor(() => {
      expect(screen.getByTestId('pref-mute-channel-success')).toBeInTheDocument();
    });
    expect(screen.getByText(/3 mevcut kural silindi/)).toBeInTheDocument();
    expect(screen.getByText(/2 konu için bu kanal ayrıca kapatıldı/)).toBeInTheDocument();
  });

  it('shows the no-rules-touched message when both counts are zero', async () => {
    identityMock = { orgId: 'default', subscriberId: 'sub-1' };
    listQueryMock = { data: [], isLoading: false, isError: false, error: undefined };
    muteChannelMutationMock.mockResolvedValue({
      channel: 'sms',
      muted: true,
      deletedOverrideCount: 0,
      shadowDenyCount: 0,
    });

    render(<NotificationPreferencesPage />);
    fireEvent.change(screen.getByTestId('pref-mute-channel-select'), {
      target: { value: 'sms' },
    });
    fireEvent.click(screen.getByTestId('pref-mute-channel-confirm'));

    await vi.waitFor(() => {
      expect(screen.getByTestId('pref-mute-channel-success')).toBeInTheDocument();
    });
    expect(screen.getByText(/Hiç başka kural yoktu/)).toBeInTheDocument();
  });

  it('renders error banner with status-aware copy when mute-channel fails 403', async () => {
    identityMock = { orgId: 'default', subscriberId: 'sub-1' };
    listQueryMock = { data: [], isLoading: false, isError: false, error: undefined };
    muteChannelMutationMock.mockRejectedValue({ status: 403 });

    render(<NotificationPreferencesPage />);
    fireEvent.change(screen.getByTestId('pref-mute-channel-select'), {
      target: { value: 'email' },
    });
    fireEvent.click(screen.getByTestId('pref-mute-channel-confirm'));

    await vi.waitFor(() => {
      expect(screen.getByTestId('pref-mute-channel-error')).toBeInTheDocument();
    });
    // Codex thread `019e03d1` REVISE iter-2 absorb: assert the
    // channel-mute domain language, not the restore-defaults one
    // (the previous /yetkiniz yok/ regex would match either).
    expect(
      screen.getByText(/Bu organizasyon \/ abone için kanal susturma yetkiniz yok/),
    ).toBeInTheDocument();
    // Negative assertion guarding against regression: the
    // restore-defaults copy must NOT leak into the mute-channel
    // banner.
    expect(screen.queryByText(/tercih sıfırlama/)).not.toBeInTheDocument();
  });

  // Codex thread `019e03d1` REVISE iter-2 absorb: 400 unknown-channel
  // is a real user-correctable error path (the dispatcher's allow-list
  // can change), so the page must surface it with channel-mute domain
  // copy instead of falling through to the generic fallback.
  it('renders 400 unknown-channel copy when backend rejects the channel', async () => {
    identityMock = { orgId: 'default', subscriberId: 'sub-1' };
    listQueryMock = { data: [], isLoading: false, isError: false, error: undefined };
    muteChannelMutationMock.mockRejectedValue({
      status: 400,
      data: {
        error: 'validation',
        message: 'channel must be one of email, sms, slack, webhook, in-app',
      },
    });

    render(<NotificationPreferencesPage />);
    fireEvent.change(screen.getByTestId('pref-mute-channel-select'), {
      target: { value: 'email' },
    });
    fireEvent.click(screen.getByTestId('pref-mute-channel-confirm'));

    await vi.waitFor(() => {
      expect(screen.getByTestId('pref-mute-channel-error')).toBeInTheDocument();
    });
    expect(
      screen.getByText(/Seçilen kanal tanınmıyor\. Kanal listesini yenileyip tekrar deneyin/),
    ).toBeInTheDocument();
    // Negative assertion: the generic "Kanal susturulamadı" fallback
    // copy must NOT appear when status === 400 — that would mean we
    // forgot to special-case the error and fell through to the
    // catch-all.
    expect(screen.queryByText(/^Kanal susturulamadı/)).not.toBeInTheDocument();
  });
});
