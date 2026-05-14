// @vitest-environment jsdom
//
// Codex 019e2022 follow-up — row-level impersonate quick action coverage.
//
// Mirrors the contract pinned in ImpersonateAction.canImpersonate.spec.tsx
// (FE Faz 1) and UserDetailDrawer.impersonate.spec.tsx (drawer-level
// gate), but for the grid-row action menu. Acceptance:
//
//   - SuperAdmin sees the new "Hesaba Geç" item in the row-level menu.
//   - Non-superAdmin shell auth = item hidden.
//   - Active impersonation session = item hidden (nested guard).
//   - Self-target (caller.subscriberId == row.id) = item hidden.
//   - Click opens an inline reason modal (min 10 chars required).
//   - Submit calls shellAuth.enterImpersonationSession with the resolved
//     payload.
//   - VALIDATION_ERROR / known backend codes surface localized messages.

import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ---------- mocks (must be defined BEFORE the SUT import) ----------

const mockShellAuth = vi.hoisted(() => ({
  isSuperAdmin: vi.fn(() => true),
  isImpersonating: vi.fn(() => false),
  getUser: vi.fn(() => ({ id: 'admin-kc-uuid', subscriberId: '1' })),
  enterImpersonationSession: vi.fn(async () => undefined),
}));

let mockShellServicesImpl: () => { auth: typeof mockShellAuth } = () => ({
  auth: mockShellAuth,
});

vi.mock('../../../../app/services/shell-services', () => ({
  getShellServices: () => mockShellServicesImpl(),
  configureShellServices: vi.fn(),
}));

vi.mock('@mfe/auth', () => ({
  usePermissions: () => ({
    isSuperAdmin: () => true,
    hasModule: () => true,
  }),
}));

vi.mock('../../../../features/user-management/model/use-users-query.model', () => ({
  useUserMutations: () => ({
    resetPasswordMutation: { mutateAsync: vi.fn(), isPending: false },
    toggleStatusMutation: { mutateAsync: vi.fn(), isPending: false },
    grantSuperAdminMutation: { mutateAsync: vi.fn(), isPending: false },
    revokeSuperAdminMutation: { mutateAsync: vi.fn(), isPending: false },
  }),
}));

vi.mock('../../../../i18n/useUsersI18n', () => ({
  useUsersI18n: () => ({ t: (k: string) => k, locale: 'tr' }),
}));

vi.mock('../../../../shared/notifications', () => ({
  pushToast: vi.fn(),
}));

// ---------- SUT ----------

import UserActions from '../UserActions.ui';

const buildUser = (overrides?: Partial<{ id: number; email: string; fullName: string }>) => ({
  id: 42,
  email: 'halil.kocoglu@example.com',
  fullName: 'Halil Kocoglu',
  status: 'ACTIVE' as const,
  ...overrides,
});

const openMenu = () => {
  fireEvent.click(screen.getByText('users.actions.menuLabel'));
};

describe('UserActions — row-level impersonate quick action (Faz 1 follow-up)', () => {
  beforeEach(() => {
    mockShellAuth.isSuperAdmin.mockReset().mockReturnValue(true);
    mockShellAuth.isImpersonating.mockReset().mockReturnValue(false);
    mockShellAuth.getUser.mockReset().mockReturnValue({
      id: 'admin-kc-uuid',
      subscriberId: '1',
    });
    mockShellAuth.enterImpersonationSession.mockReset();
    mockShellServicesImpl = () => ({ auth: mockShellAuth });
  });

  it('exposes the Hesaba Geç item when shell auth is SuperAdmin and target is not self', () => {
    render(<UserActions user={buildUser() as never} onSelect={vi.fn()} />);
    openMenu();
    const item = screen.queryByText((content) => content.includes('users.actions.impersonate.menu'));
    expect(item).toBeTruthy();
  });

  it('hides the item when shell auth reports superAdmin=false', () => {
    mockShellAuth.isSuperAdmin.mockReturnValue(false);
    render(<UserActions user={buildUser() as never} onSelect={vi.fn()} />);
    openMenu();
    expect(screen.queryByText((c) => c.includes('users.actions.impersonate.menu'))).toBeNull();
  });

  it('hides the item during an active impersonation session', () => {
    mockShellAuth.isImpersonating.mockReturnValue(true);
    render(<UserActions user={buildUser() as never} onSelect={vi.fn()} />);
    openMenu();
    expect(screen.queryByText((c) => c.includes('users.actions.impersonate.menu'))).toBeNull();
  });

  it('hides the item when row.id matches the caller subscriberId (self target)', () => {
    mockShellAuth.getUser.mockReturnValue({ id: 'admin-kc-uuid', subscriberId: '42' });
    render(<UserActions user={buildUser() as never} onSelect={vi.fn()} />);
    openMenu();
    expect(screen.queryByText((c) => c.includes('users.actions.impersonate.menu'))).toBeNull();
  });

  it('hides the item when getShellServices throws (fail-closed)', () => {
    mockShellServicesImpl = () => {
      throw new Error('Shell services not yet configured');
    };
    render(<UserActions user={buildUser() as never} onSelect={vi.fn()} />);
    openMenu();
    expect(screen.queryByText((c) => c.includes('users.actions.impersonate.menu'))).toBeNull();
  });

  it('opens the inline reason modal on click and exposes the submit testid', () => {
    render(<UserActions user={buildUser() as never} onSelect={vi.fn()} />);
    openMenu();
    fireEvent.click(screen.getByText((c) => c.includes('Hesaba Geç')));
    expect(screen.queryByTestId('row-impersonate-modal')).toBeTruthy();
    expect(screen.queryByTestId('row-impersonate-reason')).toBeTruthy();
    expect(screen.queryByTestId('row-impersonate-submit-btn')).toBeTruthy();
  });

  it('submits the orchestration call with reason + targetUserId + targetEmail', async () => {
    render(<UserActions user={buildUser() as never} onSelect={vi.fn()} />);
    openMenu();
    fireEvent.click(screen.getByText((c) => c.includes('Hesaba Geç')));

    fireEvent.change(screen.getByTestId('row-impersonate-reason'), {
      target: { value: 'Row-level impersonate quick action — 15 chars ok' },
    });
    fireEvent.click(screen.getByTestId('row-impersonate-submit-btn'));

    await waitFor(() => {
      expect(mockShellAuth.enterImpersonationSession).toHaveBeenCalledTimes(1);
    });
    const args = mockShellAuth.enterImpersonationSession.mock.calls[0]?.[0] as {
      targetUserId: number;
      targetEmail: string;
      reason: string;
    };
    expect(args.targetUserId).toBe(42);
    expect(args.targetEmail).toBe('halil.kocoglu@example.com');
    expect(args.reason).toContain('Row-level impersonate');
  });

  it('surfaces VALIDATION_ERROR localized message verbatim (BUG #3 path)', async () => {
    const validationError = new Error('Sebep en az 10 karakter olmalı') as Error & {
      errorCode?: string;
    };
    validationError.errorCode = 'VALIDATION_ERROR';
    mockShellAuth.enterImpersonationSession.mockRejectedValue(validationError);

    render(<UserActions user={buildUser() as never} onSelect={vi.fn()} />);
    openMenu();
    fireEvent.click(screen.getByText((c) => c.includes('Hesaba Geç')));

    fireEvent.change(screen.getByTestId('row-impersonate-reason'), {
      target: { value: 'valid 15 chars row' },
    });
    fireEvent.click(screen.getByTestId('row-impersonate-submit-btn'));

    await waitFor(() => {
      const node = screen.queryByTestId('row-impersonate-error');
      expect(node).toBeTruthy();
      expect(node?.textContent).toContain('Sebep en az 10 karakter olmalı');
    });
  });
});
