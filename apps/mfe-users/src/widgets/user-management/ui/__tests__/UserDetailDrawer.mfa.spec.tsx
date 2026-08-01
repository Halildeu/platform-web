// @vitest-environment jsdom
//
// gitops#3211 — MFA section in the user detail drawer.
//
// The second factor lives in Keycloak, not in the user-service tables, so the
// panel reads it through a separate query that can fail on its own (the
// user-service answers 503 where the Keycloak admin client is not
// provisioned). Two behaviours are load-bearing and are pinned here:
//
//   1. A failing MFA query degrades to a single "unavailable" line. The rest
//      of the drawer must keep working — this surface is optional.
//   2. The phone field is E.164-validated in the panel BEFORE the round-trip.
//      The server validates again; the local check exists so a typo does not
//      cost a request, and so the operator sees which field is wrong.
//
// The write path is asserted through the mutation mocks: a rejected phone
// never reaches the mutation, an accepted one reaches it with the exact
// payload the user-service endpoint expects ({userId, phone}), and clearing
// the field sends an explicit null (delete the attribute) rather than "".

import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------- mocks (must be defined BEFORE the SUT import) ----------

const mockPermissions = vi.hoisted(() => ({
  isSuperAdmin: vi.fn(() => true),
  hasModule: vi.fn(() => true),
  sessionExpired: false,
  initialized: true,
  authz: { userId: '1', superAdmin: true } as Record<string, unknown> | null,
}));

const mfaMocks = vi.hoisted(() => ({
  status: {
    data: undefined as Record<string, unknown> | undefined,
    isError: false,
    isLoading: false,
  },
  resetTotp: vi.fn(async () => ({})),
  updatePhone: vi.fn(async () => ({})),
  setRequired: vi.fn(async () => ({})),
  setMethods: vi.fn(async () => ({})),
}));

vi.mock('@mfe/auth', () => ({
  usePermissions: () => mockPermissions,
}));

vi.mock('../../../../i18n/useUsersI18n', () => ({
  useUsersI18n: () => ({ t: (k: string) => k, locale: 'tr' }),
}));

const pushToastMock = vi.hoisted(() => vi.fn());
vi.mock('../../../../shared/notifications', () => ({
  pushToast: pushToastMock,
}));

vi.mock('@mfe/shared-http', () => ({
  api: {
    get: vi.fn(async () => ({ data: [{ id: 1, name: 'ADMIN' }] })),
    post: vi.fn(async () => ({ data: {} })),
    delete: vi.fn(async () => ({ data: {} })),
    put: vi.fn(async () => ({ data: {} })),
  },
  logExpected: vi.fn(),
  registerAuthTokenResolver: vi.fn(),
}));

vi.mock('../../../../features/user-management/model/use-users-query.model', () => ({
  useUserMutations: () => ({
    toggleStatusMutation: { mutate: vi.fn(), isPending: false },
    updateSessionTimeoutMutation: { mutate: vi.fn(), isPending: false },
    resetTotpMutation: { mutateAsync: mfaMocks.resetTotp, isPending: false },
    updateMfaPhoneMutation: { mutateAsync: mfaMocks.updatePhone, isPending: false },
    updateMfaRequiredMutation: { mutateAsync: mfaMocks.setRequired, isPending: false },
    updateMfaMethodsMutation: { mutateAsync: mfaMocks.setMethods, isPending: false },
  }),
  useUserMfaStatus: () => mfaMocks.status,
}));

vi.mock('@mfe/design-system', () => {
  const drawerShell = ({
    children,
    footer,
    subtitle,
    title,
  }: {
    children: React.ReactNode;
    footer?: React.ReactNode;
    subtitle?: React.ReactNode;
    title?: React.ReactNode;
  }) => (
    <div data-testid="drawer">
      <div data-testid="drawer-title">{title}</div>
      {subtitle ? <div data-testid="drawer-subtitle">{subtitle}</div> : null}
      <div data-testid="drawer-body">{children}</div>
      {footer ? <div data-testid="drawer-footer">{footer}</div> : null}
    </div>
  );
  return {
    DetailDrawer: drawerShell,
    FormDrawer: drawerShell,
    Avatar: ({ initials }: { initials?: string }) => <span aria-hidden="true">{initials}</span>,
    Skeleton: ({ className }: { className?: string }) => <div className={className} />,
    Tabs: () => <div data-testid="tabs" />,
    Checkbox: ({
      checked,
      disabled,
      onChange,
    }: {
      label?: React.ReactNode;
      checked?: boolean;
      disabled?: boolean;
      onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    }) => <input type="checkbox" checked={!!checked} disabled={!!disabled} onChange={onChange} />,
  };
});

// ---------- SUT ----------

import UserDetailDrawer from '../UserDetailDrawer.ui';
import type { UserDetail } from '@mfe/shared-types';

const TEST_USER: UserDetail = {
  id: '2',
  fullName: 'Test User',
  email: 'testuser@testai.acik.com',
  role: 'Standart Kullanıcı',
  status: 'ACTIVE',
  modulePermissions: [],
  sessionTimeoutMinutes: 15,
};

const renderDrawer = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <UserDetailDrawer open onClose={() => {}} user={TEST_USER} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  mfaMocks.status = { data: undefined, isError: false, isLoading: false };
  mfaMocks.resetTotp.mockClear();
  mfaMocks.updatePhone.mockClear();
  mfaMocks.setRequired.mockClear();
  mfaMocks.setMethods.mockClear();
  pushToastMock.mockClear();
  mockPermissions.isSuperAdmin.mockReset().mockReturnValue(true);
  mockPermissions.hasModule.mockReset().mockReturnValue(true);
  mockPermissions.sessionExpired = false;
  mockPermissions.initialized = true;
  mockPermissions.authz = { userId: '1', superAdmin: true };
});

describe('UserDetailDrawer — MFA section (gitops#3211)', () => {
  it('MFA query error → only the unavailable line, no controls, drawer still renders', async () => {
    mfaMocks.status = { data: undefined, isError: true, isLoading: false };
    renderDrawer();

    await waitFor(() => expect(screen.getByTestId('mfa-section')).toBeTruthy());
    expect(screen.getByTestId('mfa-unavailable')).toBeTruthy();
    expect(screen.queryByTestId('mfa-phone-input')).toBeNull();
    expect(screen.queryByTestId('mfa-totp-reset')).toBeNull();
    // the rest of the drawer is unaffected
    expect(screen.getByTestId('drawer-body')).toBeTruthy();
  });

  it('status present → the three state lines reflect the payload', async () => {
    mfaMocks.status = {
      data: {
        requiresMfa: true,
        totpConfigured: true,
        phoneNumber: '+905321234567',
        smsLaneReady: true,
      },
      isError: false,
      isLoading: false,
    };
    renderDrawer();

    await waitFor(() => expect(screen.getByTestId('mfa-required-state')).toBeTruthy());
    expect(screen.getByTestId('mfa-required-state').textContent).toContain(
      'users.detail.mfa.required',
    );
    expect(screen.getByTestId('mfa-totp-state').textContent).toBe(
      'users.detail.mfa.totp.configured',
    );
    expect(screen.getByTestId('mfa-sms-state').textContent).toBe('users.detail.mfa.smsReady');
    // the server value seeds the input
    expect(screen.getByTestId<HTMLInputElement>('mfa-phone-input').value).toBe('+905321234567');
  });

  it('malformed phone → local E.164 rejection, mutation never called', async () => {
    mfaMocks.status = {
      data: { requiresMfa: false, totpConfigured: false, phoneNumber: null, smsLaneReady: false },
      isError: false,
      isLoading: false,
    };
    renderDrawer();

    const input = await screen.findByTestId<HTMLInputElement>('mfa-phone-input');
    fireEvent.change(input, { target: { value: '0532 123 45 67' } });
    fireEvent.click(screen.getByTestId('mfa-phone-save'));

    await waitFor(() => expect(screen.getByTestId('mfa-phone-error')).toBeTruthy());
    expect(screen.getByTestId('mfa-phone-error').textContent).toBe(
      'users.detail.mfa.phone.invalid',
    );
    expect(mfaMocks.updatePhone).not.toHaveBeenCalled();
  });

  it('valid E.164 → mutation receives the exact payload and a success toast fires', async () => {
    mfaMocks.status = {
      data: { requiresMfa: false, totpConfigured: false, phoneNumber: null, smsLaneReady: false },
      isError: false,
      isLoading: false,
    };
    renderDrawer();

    const input = await screen.findByTestId<HTMLInputElement>('mfa-phone-input');
    fireEvent.change(input, { target: { value: ' +905321234567 ' } });
    fireEvent.click(screen.getByTestId('mfa-phone-save'));

    await waitFor(() => expect(mfaMocks.updatePhone).toHaveBeenCalledTimes(1));
    expect(mfaMocks.updatePhone).toHaveBeenCalledWith({ userId: '2', phone: '+905321234567' });
    await waitFor(() =>
      expect(pushToastMock).toHaveBeenCalledWith('success', 'users.detail.mfa.phone.saved'),
    );
  });

  it('cleared field → explicit null so the attribute is deleted, not stored empty', async () => {
    mfaMocks.status = {
      data: {
        requiresMfa: true,
        totpConfigured: false,
        phoneNumber: '+905321234567',
        smsLaneReady: true,
      },
      isError: false,
      isLoading: false,
    };
    renderDrawer();

    const input = await screen.findByTestId<HTMLInputElement>('mfa-phone-input');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(screen.getByTestId('mfa-phone-save'));

    await waitFor(() => expect(mfaMocks.updatePhone).toHaveBeenCalledTimes(1));
    expect(mfaMocks.updatePhone).toHaveBeenCalledWith({ userId: '2', phone: null });
  });

  it('TOTP reset is disabled when nothing is enrolled, and calls the mutation when it is', async () => {
    mfaMocks.status = {
      data: { requiresMfa: true, totpConfigured: false, phoneNumber: null, smsLaneReady: false },
      isError: false,
      isLoading: false,
    };
    const { unmount } = renderDrawer();
    const disabledBtn = await screen.findByTestId<HTMLButtonElement>('mfa-totp-reset');
    expect(disabledBtn.disabled).toBe(true);
    unmount();

    mfaMocks.status = {
      data: { requiresMfa: true, totpConfigured: true, phoneNumber: null, smsLaneReady: false },
      isError: false,
      isLoading: false,
    };
    renderDrawer();
    const btn = await screen.findByTestId<HTMLButtonElement>('mfa-totp-reset');
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);

    await waitFor(() => expect(mfaMocks.resetTotp).toHaveBeenCalledWith({ userId: '2' }));
    await waitFor(() =>
      expect(pushToastMock).toHaveBeenCalledWith('success', 'users.detail.mfa.totp.resetDone'),
    );
  });

  it('no edit permission → both controls are disabled', async () => {
    mockPermissions.isSuperAdmin.mockReturnValue(false);
    mockPermissions.hasModule.mockReturnValue(false);
    mfaMocks.status = {
      data: {
        requiresMfa: true,
        totpConfigured: true,
        phoneNumber: '+905321234567',
        smsLaneReady: true,
      },
      isError: false,
      isLoading: false,
    };
    renderDrawer();

    const input = await screen.findByTestId<HTMLInputElement>('mfa-phone-input');
    expect(input.disabled).toBe(true);
    expect(screen.getByTestId<HTMLButtonElement>('mfa-phone-save').disabled).toBe(true);
    expect(screen.getByTestId<HTMLButtonElement>('mfa-totp-reset').disabled).toBe(true);
  });

  it('the requirement is a switch: flipping it calls the endpoint with the new value', async () => {
    // Server-side this assigns/removes a Keycloak realm role, so it is its own
    // write rather than part of the drawer's autosaved draft.
    mfaMocks.status = {
      data: { requiresMfa: false, totpConfigured: false, phoneNumber: null, smsLaneReady: false },
      isError: false,
      isLoading: false,
    };
    renderDrawer();

    const toggle = await screen.findByTestId<HTMLInputElement>('mfa-required-toggle');
    expect(toggle.checked).toBe(false);
    fireEvent.click(toggle);

    await waitFor(() =>
      expect(mfaMocks.setRequired).toHaveBeenCalledWith({ userId: '2', required: true }),
    );
    await waitFor(() =>
      expect(pushToastMock).toHaveBeenCalledWith('success', 'users.detail.mfa.required.enabled'),
    );
  });

  it('turning it off sends required:false', async () => {
    mfaMocks.status = {
      data: { requiresMfa: true, totpConfigured: false, phoneNumber: null, smsLaneReady: false },
      isError: false,
      isLoading: false,
    };
    renderDrawer();

    const toggle = await screen.findByTestId<HTMLInputElement>('mfa-required-toggle');
    expect(toggle.checked).toBe(true);
    fireEvent.click(toggle);

    await waitFor(() =>
      expect(mfaMocks.setRequired).toHaveBeenCalledWith({ userId: '2', required: false }),
    );
  });

  it('no edit permission → the requirement switch is disabled too', async () => {
    mockPermissions.isSuperAdmin.mockReturnValue(false);
    mockPermissions.hasModule.mockReturnValue(false);
    mfaMocks.status = {
      data: { requiresMfa: true, totpConfigured: true, phoneNumber: null, smsLaneReady: false },
      isError: false,
      isLoading: false,
    };
    renderDrawer();

    const toggle = await screen.findByTestId<HTMLInputElement>('mfa-required-toggle');
    expect(toggle.disabled).toBe(true);
    expect(mfaMocks.setRequired).not.toHaveBeenCalled();
  });

  it('checking a method adds it; the list starts empty meaning unrestricted', async () => {
    mfaMocks.status = {
      data: { requiresMfa: true, totpConfigured: false, phoneNumber: null,
              smsLaneReady: false, allowedMethods: [] },
      isError: false, isLoading: false,
    };
    renderDrawer();

    const sms = await screen.findByTestId<HTMLInputElement>('mfa-method-sms');
    expect(sms.checked).toBe(false);
    fireEvent.click(sms);

    await waitFor(() =>
      expect(mfaMocks.setMethods).toHaveBeenCalledWith({ userId: '2', methods: ['sms'] }),
    );
  });

  it('unchecking the last method sends an empty list, which lifts the restriction', async () => {
    // Not "no methods at all" — an account with no way in is the one outcome
    // this control must not be able to produce by accident.
    mfaMocks.status = {
      data: { requiresMfa: true, totpConfigured: false, phoneNumber: null,
              smsLaneReady: false, allowedMethods: ['sms'] },
      isError: false, isLoading: false,
    };
    renderDrawer();

    const sms = await screen.findByTestId<HTMLInputElement>('mfa-method-sms');
    expect(sms.checked).toBe(true);
    fireEvent.click(sms);

    await waitFor(() =>
      expect(mfaMocks.setMethods).toHaveBeenCalledWith({ userId: '2', methods: [] }),
    );
  });

  it('says plainly that the authenticator app is not governed here', async () => {
    // A third checkbox would silently do nothing: OTP Form is stock Keycloak
    // and never reads the allow-list.
    mfaMocks.status = {
      data: { requiresMfa: true, totpConfigured: true, phoneNumber: null,
              smsLaneReady: false, allowedMethods: [] },
      isError: false, isLoading: false,
    };
    renderDrawer();

    expect(await screen.findByTestId('mfa-methods-totp-note')).toBeTruthy();
    expect(screen.queryByTestId('mfa-method-totp')).toBeNull();
  });
});
