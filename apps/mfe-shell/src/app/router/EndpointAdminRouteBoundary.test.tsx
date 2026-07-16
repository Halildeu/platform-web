// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { EndpointAdminRouteBoundary } from './EndpointAdminRouteBoundary';

const authState = {
  auth: {
    token: null as string | null,
    initialized: true,
  },
};

const permissionsMock = {
  hasModule: (_module: string) => false,
  isSuperAdmin: () => false,
  authorizationReady: true,
};

vi.mock('../store/store.hooks', () => ({
  useAppSelector: (selector: (state: typeof authState) => unknown) => selector(authState),
}));

vi.mock('../auth/auth-config', () => ({
  isPermitAllMode: () => false,
}));

vi.mock('@mfe/auth', () => ({
  usePermissions: () => permissionsMock,
}));

const jwt = (roles: string[]) => {
  const payload = Buffer.from(JSON.stringify({ realm_access: { roles } })).toString('base64url');
  return `header.${payload}.signature`;
};

const renderPath = (path: string, enabled = true) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/endpoint-admin/*"
          element={
            <EndpointAdminRouteBoundary enabled={enabled}>
              <Routes>
                <Route
                  path="remote-access/sessions/:sessionId/view"
                  element={<div>Remote View Page</div>}
                />
                <Route path="devices" element={<div>Devices Page</div>} />
              </Routes>
            </EndpointAdminRouteBoundary>
          }
        />
        <Route path="/unauthorized" element={<div>Unauthorized Page</div>} />
        <Route path="/home" element={<div>Home Page</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe('EndpointAdminRouteBoundary', () => {
  beforeEach(() => {
    authState.auth.token = jwt([]);
    permissionsMock.hasModule = () => false;
    permissionsMock.isSuperAdmin = () => false;
    permissionsMock.authorizationReady = true;
  });

  afterEach(cleanup);

  it('preserves the splat remainder and renders the descendant remote-view route', () => {
    authState.auth.token = jwt(['remote-bridge-operator']);

    renderPath('/endpoint-admin/remote-access/sessions/session-1/view?streamId=stream-1');

    expect(screen.getByText('Remote View Page')).toBeInTheDocument();
  });

  it('denies the remote-view route without the exact realm role', () => {
    permissionsMock.hasModule = () => true;

    renderPath('/endpoint-admin/remote-access/sessions/session-1/view');

    expect(screen.getByText('Unauthorized Page')).toBeInTheDocument();
  });

  it('keeps fleet routes on the ENDPOINT_ADMIN module boundary', () => {
    permissionsMock.hasModule = (module) => module === 'ENDPOINT_ADMIN';

    renderPath('/endpoint-admin/devices');

    expect(screen.getByText('Devices Page')).toBeInTheDocument();
  });

  it('does not let the remote-support role enter fleet routes', () => {
    authState.auth.token = jwt(['remote-bridge-operator']);

    renderPath('/endpoint-admin/devices');

    expect(screen.getByText('Unauthorized Page')).toBeInTheDocument();
  });

  it('redirects every endpoint-admin route when the remote is disabled', () => {
    authState.auth.token = jwt(['remote-bridge-operator']);

    renderPath('/endpoint-admin/remote-access/sessions/session-1/view', false);

    expect(screen.getByText('Home Page')).toBeInTheDocument();
  });
});
