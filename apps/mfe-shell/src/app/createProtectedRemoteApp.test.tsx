// @vitest-environment jsdom
import React from 'react';
import type { FC } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createProtectedRemoteApp } from './createProtectedRemoteApp';
import { createMeetingApp } from './createMeetingApp';

/**
 * 39d-6 — generic `createProtectedRemoteApp` contract tests (Codex 019f50b7 iter):
 * 1) SIRA SÖZLEŞMESİ: shell-services import + configure, App import'undan ÖNCE
 *    (remote ilk isteğini Bearer'sız atamaz — deep-link race koruması).
 * 2) Eksik `configureShellServices` export'u sınıflandırılmış hataya dönüşür
 *    (sessiz token'sız mount YOK).
 * 3) `createMeetingApp` delegasyonu davranış-koruyucu (mevcut meeting yolu kırılmaz).
 *
 * Mock stratejisi `createEndpointAdminApp.test.tsx` aynası: shell-services-wiring
 * stub'lanır ki Redux store + Keycloak zinciri test runtime'ına girmesin.
 */

vi.mock('./config/shell-services-wiring', () => {
  const shared = { auth: { getToken: () => 'tok' } };
  return {
    getSharedShellServices: () => shared,
    wireRemoteShellServices: vi.fn(),
    __resetSharedShellServicesForTests: vi.fn(),
  };
});

const RemoteApp: FC = () => <div data-testid="protected-remote-loaded">Remote loaded</div>;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('createProtectedRemoteApp (39d-6 shell-token köprüsü)', () => {
  it('shell-services CONFIGURE, App import edilmeden ÖNCE koşar (sıra sözleşmesi)', async () => {
    const order: string[] = [];
    const configureShellServices = vi.fn(() => {
      order.push('configure');
    });
    const shellServicesLoader = vi.fn(async () => {
      order.push('shell-services-import');
      return { configureShellServices };
    });
    const appLoader = vi.fn(async () => {
      order.push('app-import');
      return { default: RemoteApp };
    });

    const App = createProtectedRemoteApp('InterviewEvidence', appLoader, shellServicesLoader);
    render(<App />);

    expect(await screen.findByTestId('protected-remote-loaded')).toBeInTheDocument();
    expect(order).toEqual(['shell-services-import', 'configure', 'app-import']);
    expect(configureShellServices).toHaveBeenCalledWith(
      expect.objectContaining({ auth: expect.anything() }),
    );
  });

  it('configureShellServices export etmeyen remote sınıflandırılmış hata üretir (fail-closed)', async () => {
    const shellServicesLoader = vi.fn(async () => ({}) as Record<string, never>);
    const appLoader = vi.fn(async () => ({ default: RemoteApp }));
    // createLazyRemoteModule hata sınıfını error-state UI'ına çevirir; App import
    // edilmemiş olmalı (token'sız mount yok).
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const App = createProtectedRemoteApp('InterviewEvidence', appLoader, shellServicesLoader);
    render(<App />);

    await vi.waitFor(() => {
      expect(shellServicesLoader).toHaveBeenCalled();
    });
    // Hata yüzeyi asenkron; App loader'ın hiç çağrılmadığı garanti edilene dek bekle.
    await new Promise((r) => setTimeout(r, 0));
    expect(appLoader).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('createMeetingApp generic yola delege eder — davranış korunur', async () => {
    const order: string[] = [];
    const configureShellServices = vi.fn(() => order.push('configure'));
    const App = createMeetingApp(
      async () => {
        order.push('app-import');
        return { default: RemoteApp };
      },
      async () => {
        order.push('shell-services-import');
        return { configureShellServices };
      },
    );
    render(<App />);
    expect(await screen.findByTestId('protected-remote-loaded')).toBeInTheDocument();
    expect(order).toEqual(['shell-services-import', 'configure', 'app-import']);
  });
});
