// @vitest-environment jsdom
import React, { Suspense } from 'react';
import type { FC } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createEndpointAdminApp } from './createEndpointAdminApp';
import { getSharedShellServices } from './config/shell-services-wiring';

/**
 * Faz 22 #655 — `createEndpointAdminApp` contract tests.
 *
 * Verifies the deep-link race fix: the route-level lazy loader MUST
 * `await` the endpoint-admin `configureShellServices` (shell auth-token
 * resolver injection) BEFORE importing/rendering `EndpointAdminApp`, so the
 * MFE's RTK queries carry the `Authorization: Bearer` header (no 401).
 *
 * Mock strategy mirrors `createUsersAppOnDemand.test.tsx`: stub
 * `./config/shell-services-wiring` so `getSharedShellServices()` resolves
 * to a stable fake without dragging the Redux store + Keycloak chain into
 * the test runtime. The `vi.mock` factory references no outer variable
 * (hoisting-safe).
 */

vi.mock('./config/shell-services-wiring', () => {
  const shared = { auth: { getToken: () => 'tok' } };
  return {
    getSharedShellServices: () => shared,
    wireRemoteShellServices: vi.fn(),
    __resetSharedShellServicesForTests: vi.fn(),
  };
});

const RemoteApp: FC = () => <div data-testid="endpoint-admin-loaded">EndpointAdminApp loaded</div>;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('createEndpointAdminApp (#655 shell-services race protection)', () => {
  it('configures shell-services BEFORE loading EndpointAdminApp', async () => {
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

    const EndpointAdminApp = createEndpointAdminApp(appLoader, shellServicesLoader);
    render(
      <Suspense fallback={<div>Loading</div>}>
        <EndpointAdminApp />
      </Suspense>,
    );

    expect(await screen.findByTestId('endpoint-admin-loaded')).toBeInTheDocument();
    // The race fix: shell-services configured STRICTLY before the App import.
    expect(order).toEqual(['shell-services-import', 'configure', 'app-import']);
    // configureShellServices receives the shell's shared services.
    expect(configureShellServices).toHaveBeenCalledWith(getSharedShellServices());
    expect(appLoader).toHaveBeenCalledTimes(1);
  });

  it('a failing shell-services loader is non-fatal — EndpointAdminApp still loads', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const shellServicesLoader = vi.fn(async () => {
      throw new Error('shell-services unreachable');
    });
    const appLoader = vi.fn(async () => ({ default: RemoteApp }));

    const EndpointAdminApp = createEndpointAdminApp(appLoader, shellServicesLoader);
    render(
      <Suspense fallback={<div>Loading</div>}>
        <EndpointAdminApp />
      </Suspense>,
    );

    expect(await screen.findByTestId('endpoint-admin-loaded')).toBeInTheDocument();
    expect(appLoader).toHaveBeenCalledTimes(1);
    expect(debugSpy).toHaveBeenCalled();
  });

  it('returns an FC with displayName EndpointAdminApp', () => {
    const EndpointAdminApp = createEndpointAdminApp(
      async () => ({ default: RemoteApp }),
      async () => ({ configureShellServices: vi.fn() }),
    );
    expect(EndpointAdminApp.displayName).toBe('EndpointAdminApp');
  });
});
