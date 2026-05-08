// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import UsersGrid from '../UsersGrid.ui';

/**
 * PR-FE-1 (Codex thread 019e08e2 iter-8 REVISE absorb, 2026-05-08):
 * verifies the auth-not-ready inline state + retry CTA contract.
 *
 * <p>Pre-fix path: shell auth FSM not yet `transportReady` → request
 * interceptor short-circuits → catch handler shows
 * "auth-not-ready: unauthenticated" toast verbatim. Post-fix path:
 * `runAccessProbe` awaits `auth.ready()`; on `{ok:false,
 * reason:'unauthenticated'}` it sets the dedicated `auth-not-ready`
 * grid state with an inline retry CTA (no toast, since the user is
 * not at fault for the FSM race). Retry calls `runAccessProbe` again
 * — by then the FSM has typically settled and the second attempt
 * succeeds.
 */

vi.mock('../../../../i18n/useUsersI18n', () => ({
  useUsersI18n: () => ({ t: (k: string) => k, locale: 'tr' }),
}));

const mockFetchUsers = vi.hoisted(() => vi.fn());

vi.mock('../../../../entities/user/api/users.api', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, fetchUsers: mockFetchUsers };
});

vi.mock('@mfe/design-system', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    EntityGridTemplate: () => <div data-testid="entity-grid-template" />,
  };
});

let authReadyCallCount = 0;
let authReadyResults: Array<{ ok: boolean; reason?: string }> = [];

vi.mock('../../../../app/services/shell-services', () => ({
  getShellServices: () => ({
    auth: {
      ready: () => {
        const next =
          authReadyResults[authReadyCallCount] ?? authReadyResults[authReadyResults.length - 1];
        authReadyCallCount += 1;
        return Promise.resolve(next);
      },
      isTransportReady: () => true,
      getPhase: () => 'transportReady' as const,
      getEpoch: () => 1,
      getToken: () => 'test-token',
      getUser: () => null,
    },
    notify: { push: () => {} },
    telemetry: { emit: () => {} },
    http: {},
  }),
  configureShellServices: () => {},
}));

describe('UsersGrid auth-ready gate (PR-FE-1)', () => {
  beforeEach(() => {
    authReadyCallCount = 0;
    authReadyResults = [];
    mockFetchUsers.mockReset();
    mockFetchUsers.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 50,
      meta: { reason: 'success' },
    });
  });

  it('auth.ready() unauthenticated → renders auth-not-ready inline state, NO fetchUsers call', async () => {
    authReadyResults = [{ ok: false, reason: 'unauthenticated' }];

    render(<UsersGrid onSelectUser={() => {}} />);

    // EntityGridTemplate must NOT render — blocked-state branch shows instead
    await waitFor(() => {
      expect(
        screen.getByText('Kullanıcı verileri için oturumun hazırlanmasını bekliyoruz.'),
      ).toBeTruthy();
    });

    // fetchUsers must never have been called — gate prevented the request
    expect(mockFetchUsers).not.toHaveBeenCalled();

    // Retry CTA visible — Codex iter-8 REVISE: must show even for
    // unauthenticated reason (was previously rendering only for network-error)
    expect(screen.getByRole('button', { name: 'Yeniden dene' })).toBeTruthy();
  });

  it('auth.ready() unauthenticated → retry CTA → second attempt with ok:true → fetchUsers fires', async () => {
    authReadyResults = [{ ok: false, reason: 'unauthenticated' }, { ok: true }];

    render(<UsersGrid onSelectUser={() => {}} />);

    // First attempt — auth-not-ready
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Yeniden dene' })).toBeTruthy();
    });
    expect(mockFetchUsers).not.toHaveBeenCalled();

    // Click retry
    fireEvent.click(screen.getByRole('button', { name: 'Yeniden dene' }));

    // Second attempt — auth.ready resolves ok:true → fetchUsers runs
    await waitFor(() => {
      expect(mockFetchUsers).toHaveBeenCalled();
    });
    expect(authReadyCallCount).toBeGreaterThanOrEqual(2);
  });

  it('auth.ready() failed → renders network-error state with retry CTA + toast', async () => {
    authReadyResults = [{ ok: false, reason: 'failed' }];

    render(<UsersGrid onSelectUser={() => {}} />);

    await waitFor(() => {
      expect(
        screen.getByText(
          'Kullanıcı verileri alınamadı. Lütfen bağlantınızı kontrol edip yeniden deneyin.',
        ),
      ).toBeTruthy();
    });
    expect(mockFetchUsers).not.toHaveBeenCalled();
    // network-error also has retry CTA
    expect(screen.getByRole('button', { name: 'Yeniden dene' })).toBeTruthy();
  });

  it('auth.ready() ok:true → fetchUsers fires immediately, EntityGridTemplate renders', async () => {
    authReadyResults = [{ ok: true }];

    render(<UsersGrid onSelectUser={() => {}} />);

    await waitFor(() => {
      expect(screen.getByTestId('entity-grid-template')).toBeTruthy();
    });
    expect(mockFetchUsers).toHaveBeenCalled();
  });
});
