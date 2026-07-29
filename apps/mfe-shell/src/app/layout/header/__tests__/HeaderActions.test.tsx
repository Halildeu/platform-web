// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HeaderActions, isRemoteViewRoute } from '../HeaderActions';

vi.mock('../../../store/store.hooks', () => ({
  useAppSelector: () => ({ token: 'test-token' }),
}));

vi.mock('../../../auth/auth-config', () => ({
  buildAppRedirectUri: (value: string) => value,
  isPermitAllMode: () => false,
}));

vi.mock('../../../i18n', () => ({
  useShellCommonI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('../../NotificationCenter', () => ({
  default: () => <div data-testid="notification-center" />,
}));

vi.mock('../../ThemeRuntimePanelButton', () => ({
  ThemeRuntimePanelButton: () => <div data-testid="theme-button" />,
}));

vi.mock('../../LoginPopover', () => ({
  default: () => <div data-testid="login-popover" />,
}));

vi.mock('../LanguageSelector', () => ({
  LanguageSelector: () => <div data-testid="language-selector" />,
}));

vi.mock('../UserMenuDropdown', () => ({
  UserMenuDropdown: () => <div data-testid="user-menu" />,
}));

function renderAt(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <HeaderActions />
    </MemoryRouter>,
  );
}

describe('HeaderActions VIEW_ONLY notification boundary', () => {
  it('omits the notification center on the exact remote VIEW_ONLY route', () => {
    renderAt('/endpoint-admin/remote-access/sessions/session-1/view?streamId=operation-1');

    expect(screen.queryByTestId('notification-center')).not.toBeInTheDocument();
    expect(screen.getByTestId('language-selector')).toBeInTheDocument();
    expect(screen.getByTestId('theme-button')).toBeInTheDocument();
    expect(screen.getByTestId('user-menu')).toBeInTheDocument();
  });

  it('keeps the notification center on other authenticated routes', () => {
    renderAt('/endpoint-admin/devices');

    expect(screen.getByTestId('notification-center')).toBeInTheDocument();
  });

  it.each([
    '/endpoint-admin/remote-access/sessions/session-1',
    '/endpoint-admin/remote-access/sessions/session-1/view/extra',
    '/endpoint-admin/remote-access/sessions/session%2F1/view',
    '/endpoint-admin/remote-access/sessions//view',
  ])('does not classify a near-match as the remote VIEW_ONLY route: %s', (pathname) => {
    expect(isRemoteViewRoute(pathname)).toBe(false);
  });
});
