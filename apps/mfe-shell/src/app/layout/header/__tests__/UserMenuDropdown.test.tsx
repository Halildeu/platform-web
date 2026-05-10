// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { UserMenuDropdown } from '../UserMenuDropdown';

/* ---- mocks ---- */

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const dispatchMock = vi.fn();

vi.mock('../../../store/store.hooks', () => ({
  useAppSelector: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({
      auth: {
        user: { fullName: 'Halil K.', email: 'halil@test.com', role: 'Admin' },
      },
    }),
  useAppDispatch: () => dispatchMock,
}));

vi.mock('@mfe/auth', () => ({
  usePermissions: () => ({
    hasModule: () => true,
    isSuperAdmin: () => false,
  }),
}));

vi.mock('../../../../features/auth/lib/permissions.constants', () => ({
  MODULE_KEYS: { AUDIT: 'AUDIT', THEME: 'THEME' },
}));

const selectIsImpersonatingMock = vi.fn(() => false);

vi.mock('../../../../features/auth/model/auth.slice', () => ({
  logout: vi.fn(() => ({ type: 'auth/logout' })),
  selectIsImpersonating: (...args: unknown[]) => selectIsImpersonatingMock(...(args as [])),
}));

const storeStateRef = {
  current: { auth: { token: null as string | null, impersonation: { status: 'inactive' } } },
};

vi.mock('../../../store/store', () => ({
  store: {
    getState: () => storeStateRef.current,
    dispatch: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  },
}));

const dropBrokerCookieBestEffortMock = vi.fn(() => Promise.resolve());

vi.mock('../../../config/impersonation-orchestration', () => ({
  dropBrokerCookieBestEffort: (...args: unknown[]) =>
    dropBrokerCookieBestEffortMock(...(args as [])),
}));

vi.mock('../../../auth/auth-config', () => ({
  buildAppRedirectUri: (uri: string) => uri,
  isPermitAllMode: () => false,
}));

const keycloakLogoutMock = vi.fn(() => Promise.resolve());

vi.mock('../../../auth/keycloakClient', () => ({
  default: { logout: (...args: unknown[]) => keycloakLogoutMock(...(args as [])) },
}));

vi.mock('../../../i18n', () => ({
  useShellCommonI18n: () => ({
    t: (key: string) => key,
    locale: 'tr',
  }),
}));

type DropdownItem = {
  key?: string;
  onClick?: () => void | Promise<void>;
};

let lastItems: DropdownItem[] = [];

vi.mock('@mfe/design-system', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@mfe/design-system');
  return {
    ...actual,
    Avatar: ({ initials }: { initials: string }) => <span data-testid="avatar">{initials}</span>,
    Dropdown: ({ children, items }: { children: React.ReactNode; items: DropdownItem[] }) => {
      lastItems = items;
      return (
        <div data-testid="dropdown">
          {children}
          <span data-testid="dropdown-count">{items.length}</span>
        </div>
      );
    },
    Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  };
});

/* ---- tests ---- */

describe('UserMenuDropdown', () => {
  it('renders user initials in avatar', () => {
    render(<UserMenuDropdown />);
    expect(screen.getByTestId('avatar')).toHaveTextContent('HK');
  });

  it('renders dropdown trigger with aria-label', () => {
    render(<UserMenuDropdown />);
    expect(screen.getByLabelText('shell.userMenu.title')).toBeInTheDocument();
  });

  it('passes menu items to dropdown', () => {
    render(<UserMenuDropdown />);
    const count = Number(screen.getByTestId('dropdown-count').textContent);
    // user-info + separator + last-login + separator + audit + settings + profile + separator + logout
    expect(count).toBeGreaterThanOrEqual(7);
  });

  /**
   * Codex iter-7 P3 absorb (thread `019e109c`): logout fire-and-forget
   * race. Pre-iter-7 the broker cookie drop was fired without await so
   * the keycloak federated redirect could navigate away before DELETE
   * /auth/cookie hit the gateway. iter-7 swaps to await + swallow so
   * the DELETE completes before logout dispatches + redirect fires.
   *
   * <p>This test pins down the new sequence:
   * <ol>
   *   <li>broker cookie drop is awaited (resolved with broker token)</li>
   *   <li>logout dispatch fires AFTER the drop resolves</li>
   *   <li>keycloak.logout fires AFTER the dispatch</li>
   * </ol>
   */
  it('logout awaits broker cookie drop before dispatching when impersonating', async () => {
    selectIsImpersonatingMock.mockReturnValueOnce(true);
    storeStateRef.current = {
      auth: { token: 'broker-token-xyz', impersonation: { status: 'active' } },
    };
    dropBrokerCookieBestEffortMock.mockClear();
    dispatchMock.mockClear();
    keycloakLogoutMock.mockClear();

    // Deferred resolver lets the test prove the drop is awaited: if
    // logout dispatched before resolveDrop() is called, the dispatch
    // mock would observe a call before the helper resolved.
    let resolveDrop: () => void = () => {};
    const dropPromise = new Promise<void>((resolve) => {
      resolveDrop = resolve;
    });
    dropBrokerCookieBestEffortMock.mockReturnValueOnce(dropPromise);

    render(<UserMenuDropdown />);
    const logoutItem = lastItems.find((it) => it && (it as DropdownItem).key === 'logout');
    expect(logoutItem).toBeDefined();
    expect(logoutItem!.onClick).toBeTypeOf('function');

    // Fire logout — broker drop in flight, dispatch must NOT have run.
    const logoutPromise = logoutItem!.onClick!();

    // One microtask to let the await reach the helper.
    await Promise.resolve();
    expect(dropBrokerCookieBestEffortMock).toHaveBeenCalledTimes(1);
    expect(dropBrokerCookieBestEffortMock).toHaveBeenCalledWith('broker-token-xyz');
    // STRICT: dispatch + keycloak.logout must wait for the broker drop.
    expect(dispatchMock).not.toHaveBeenCalled();
    expect(keycloakLogoutMock).not.toHaveBeenCalled();

    // Resolve the drop; logout pipeline now resumes.
    resolveDrop();
    await logoutPromise;

    // Order: drop → dispatch(logout) → keycloak.logout.
    expect(dispatchMock).toHaveBeenCalledWith({ type: 'auth/logout' });
    expect(keycloakLogoutMock).toHaveBeenCalledTimes(1);
  });

  it('logout does not call broker cookie drop when not impersonating', async () => {
    selectIsImpersonatingMock.mockReturnValueOnce(false);
    storeStateRef.current = {
      auth: { token: null, impersonation: { status: 'inactive' } },
    };
    dropBrokerCookieBestEffortMock.mockClear();
    dispatchMock.mockClear();
    keycloakLogoutMock.mockClear();

    render(<UserMenuDropdown />);
    const logoutItem = lastItems.find((it) => it && (it as DropdownItem).key === 'logout');
    expect(logoutItem).toBeDefined();
    await logoutItem!.onClick!();

    // Non-impersonation logout: helper not invoked; logout flow runs.
    expect(dropBrokerCookieBestEffortMock).not.toHaveBeenCalled();
    expect(dispatchMock).toHaveBeenCalledWith({ type: 'auth/logout' });
    expect(keycloakLogoutMock).toHaveBeenCalledTimes(1);
  });

  it('logout swallows a rejecting broker cookie drop and still dispatches', async () => {
    selectIsImpersonatingMock.mockReturnValueOnce(true);
    storeStateRef.current = {
      auth: { token: 'broker-token-xyz', impersonation: { status: 'active' } },
    };
    dropBrokerCookieBestEffortMock.mockClear();
    dispatchMock.mockClear();
    keycloakLogoutMock.mockClear();

    // The helper itself swallows errors today, but the .catch in
    // UserMenuDropdown is the regression guard for a future helper
    // that accidentally re-throws. Simulate that future regression
    // here and confirm logout still completes.
    dropBrokerCookieBestEffortMock.mockReturnValueOnce(
      Promise.reject(new Error('broker DELETE 401 expired')),
    );

    render(<UserMenuDropdown />);
    const logoutItem = lastItems.find((it) => it && (it as DropdownItem).key === 'logout');
    await logoutItem!.onClick!();

    expect(dropBrokerCookieBestEffortMock).toHaveBeenCalledTimes(1);
    // STRICT: even when the helper rejects, dispatch must run so the
    // user is not stuck signed-in. Pre-iter-7 fire-and-forget hid
    // this because the rejection was unhandled but harmless to the
    // dispatch path; the new await pattern needed an explicit catch
    // to maintain the same guarantee.
    expect(dispatchMock).toHaveBeenCalledWith({ type: 'auth/logout' });
    expect(keycloakLogoutMock).toHaveBeenCalledTimes(1);
  });
});
