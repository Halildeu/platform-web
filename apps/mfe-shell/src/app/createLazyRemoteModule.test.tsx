// @vitest-environment jsdom
import React, { Suspense } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createLazyRemoteModule } from './createLazyRemoteModule';

describe('createLazyRemoteModule', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('loader basarili oldugunda remote modulunu render eder', async () => {
    const RemoteModule = createLazyRemoteModule('Users', async () => ({
      default: () => <div>Users module</div>,
    }));

    render(
      <Suspense fallback={<div>Yukleniyor</div>}>
        <RemoteModule />
      </Suspense>,
    );

    expect(await screen.findByText('Users module')).toBeInTheDocument();
  });

  it('loader hata verirse fallback kartini render eder', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const RemoteModule = createLazyRemoteModule('Reporting', async () => {
      throw new Error('remote offline');
    });

    render(
      <Suspense fallback={<div>Yukleniyor</div>}>
        <RemoteModule />
      </Suspense>,
    );

    expect(await screen.findByText('Reporting su anda kullanilamiyor')).toBeInTheDocument();
    expect(screen.getByText('Beklenmeyen bir hata olustu. Detaylar asagida.')).toBeInTheDocument();
    expect(screen.getByTestId('remote-module-fallback-reporting')).toBeInTheDocument();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  /**
   * PR #280 reapply, Codex iter-1 must-fix #1: the disabled-remote
   * STUB (`data:text/javascript,export default {}; ...`) resolves
   * **successfully** — promise does not reject. Without the
   * isValidRemoteComponent guard, React.lazy would treat `default: {}`
   * as the component and crash with "invalid element type". The guard
   * raises a synthetic error so we land in the classified fallback.
   */
  it('STUB modulu (default: {}) fallback kartina dusurulur', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const RemoteModule = createLazyRemoteModule(
      'EndpointAdmin',
      async () => ({ default: {} }) as unknown as { default: React.ComponentType },
    );

    render(
      <Suspense fallback={<div>Yukleniyor</div>}>
        <RemoteModule />
      </Suspense>,
    );

    expect(await screen.findByTestId('remote-module-fallback-endpointadmin')).toBeInTheDocument();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('loader default exportu eksik moduldonse fallback kartina dusurulur', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Modul tamamen bos — `default` undefined.
    const RemoteModule = createLazyRemoteModule(
      'EndpointAdmin',
      async () => ({}) as unknown as { default: React.ComponentType },
    );

    render(
      <Suspense fallback={<div>Yukleniyor</div>}>
        <RemoteModule />
      </Suspense>,
    );

    expect(await screen.findByTestId('remote-module-fallback-endpointadmin')).toBeInTheDocument();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
