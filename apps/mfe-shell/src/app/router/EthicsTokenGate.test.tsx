// @vitest-environment jsdom

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authState = { token: 'suite-token-without-ethics-contract' as string | null };
const { hasEthicsManagerTokenContractMock, startKeycloakLoginMock } = vi.hoisted(() => ({
  hasEthicsManagerTokenContractMock: vi.fn(() => false),
  startKeycloakLoginMock: vi.fn(() => new Promise<void>(() => undefined)),
}));

vi.mock('../auth/keycloakClient', () => ({
  hasEthicsManagerTokenContract: hasEthicsManagerTokenContractMock,
  startKeycloakLogin: startKeycloakLoginMock,
}));

vi.mock('../auth/auth-config', () => ({
  buildAppRedirectUri: (path: string) => `https://testai.acik.com${path}`,
}));

vi.mock('../store/store.hooks', () => ({
  useAppSelector: (selector: (state: { auth: typeof authState }) => unknown) =>
    selector({ auth: authState }),
}));

import { EthicsTokenGate } from './EthicsTokenGate';

const renderGate = () =>
  render(
    <MemoryRouter initialEntries={['/ethic/cases/CASE-123?tab=activity']}>
      <EthicsTokenGate>
        <div>Etik yönetimi</div>
      </EthicsTokenGate>
    </MemoryRouter>,
  );

describe('EthicsTokenGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    authState.token = 'suite-token-without-ethics-contract';
    hasEthicsManagerTokenContractMock.mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
    window.sessionStorage.clear();
  });

  it('tam sayfa SSO dönüşünü temsil eden remount sonrasında ikinci otomatik login çağrısını engeller', async () => {
    const firstPage = renderGate();

    await waitFor(() => expect(startKeycloakLoginMock).toHaveBeenCalledTimes(1));
    expect(startKeycloakLoginMock).toHaveBeenCalledWith({
      redirectUri: 'https://testai.acik.com/ethic/cases/CASE-123?tab=activity',
    });
    const marker = window.sessionStorage.getItem('ethicsTokenUpgradeAttempt_v1');
    expect(marker).not.toContain('suite-token');
    expect(marker).not.toContain('CASE-123');

    firstPage.unmount();
    renderGate();

    expect(
      await screen.findByText(
        'Etik Speak yetkili oturumu güvenli biçimde yükseltilemedi. Lütfen yeniden giriş yapın.',
      ),
    ).toHaveAttribute('role', 'alert');
    expect(startKeycloakLoginMock).toHaveBeenCalledTimes(1);
  });

  it('yetkili token geldiğinde deneme bütçesini temizler ve içeriği gösterir', async () => {
    window.sessionStorage.setItem(
      'ethicsTokenUpgradeAttempt_v1',
      JSON.stringify({ attemptedAt: Date.now(), route: '/ethic' }),
    );
    hasEthicsManagerTokenContractMock.mockReturnValue(true);

    renderGate();

    expect(screen.getByText('Etik yönetimi')).toBeInTheDocument();
    await waitFor(() =>
      expect(window.sessionStorage.getItem('ethicsTokenUpgradeAttempt_v1')).toBeNull(),
    );
    expect(startKeycloakLoginMock).not.toHaveBeenCalled();
  });

  it('sessionStorage kullanılamıyorsa yönlendirme döngüsü yerine fail-closed hata verir', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementationOnce(() => {
      throw new Error('storage unavailable');
    });

    renderGate();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(startKeycloakLoginMock).not.toHaveBeenCalled();
    getItem.mockRestore();
  });
});
