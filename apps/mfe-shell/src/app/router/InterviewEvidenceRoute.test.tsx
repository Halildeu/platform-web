// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import {
  AtsProductHubRoute,
  InterviewEvidenceRoute,
  RecruiterWorkspaceRoute,
} from './InterviewEvidenceRoute';

const authState = {
  auth: {
    token: 'valid-token' as string | null,
    initialized: true,
  },
};

const permissionsMock = {
  hasModule: vi.fn((module: string) => module === 'INTERVIEW_EVIDENCE'),
  isSuperAdmin: vi.fn(() => false),
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

const LocationProbe = () => {
  const location = useLocation();
  return (
    <div>
      <span>Unauthorized destination</span>
      <span data-testid="route-location">{location.pathname}</span>
      <span data-testid="route-reason">
        {String((location.state as { reason?: string } | null)?.reason ?? 'none')}
      </span>
    </div>
  );
};

const renderRoute = (remoteEnabled: boolean) =>
  render(
    <MemoryRouter initialEntries={['/admin/interview-evidence']}>
      <Routes>
        <Route
          path="/admin/interview-evidence/*"
          element={
            <InterviewEvidenceRoute
              remoteEnabled={remoteEnabled}
              remoteContent={<div>Real Interview Evidence MFE</div>}
            />
          }
        />
        <Route path="/unauthorized" element={<LocationProbe />} />
        <Route path="/login" element={<div>Login destination</div>} />
      </Routes>
    </MemoryRouter>,
  );

const renderHubRoute = (remoteEnabled: boolean) =>
  render(
    <MemoryRouter initialEntries={['/admin/ats']}>
      <Routes>
        <Route path="/admin/ats/*" element={<AtsProductHubRoute remoteEnabled={remoteEnabled} />} />
        <Route path="/unauthorized" element={<LocationProbe />} />
        <Route path="/login" element={<div>Login destination</div>} />
      </Routes>
    </MemoryRouter>,
  );

const renderRecruiterRoute = () =>
  render(
    <MemoryRouter initialEntries={['/admin/ats/recruiter']}>
      <Routes>
        <Route
          path="/admin/ats/recruiter/*"
          element={<RecruiterWorkspaceRoute content={<div>Recruiter workspace content</div>} />}
        />
        <Route path="/unauthorized" element={<LocationProbe />} />
        <Route path="/login" element={<div>Login destination</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe('InterviewEvidenceRoute', () => {
  beforeEach(() => {
    authState.auth.token = 'valid-token';
    authState.auth.initialized = true;
    permissionsMock.hasModule.mockImplementation(
      (module: string) => module === 'INTERVIEW_EVIDENCE',
    );
    permissionsMock.isSuperAdmin.mockReturnValue(false);
    permissionsMock.authorizationReady = true;
  });

  afterEach(() => cleanup());

  it('keeps the product hub as a safe fallback for the real module route when remote is off', () => {
    renderRoute(false);

    expect(screen.getByRole('heading', { name: 'ATS Ürün Merkezi' })).toBeInTheDocument();
    expect(screen.queryByText('Real Interview Evidence MFE')).not.toBeInTheDocument();
  });

  it('renders the real MFE for an authorized user when the remote is on', () => {
    renderRoute(true);

    expect(screen.getByText('Real Interview Evidence MFE')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'ATS Ürün Merkezi' })).not.toBeInTheDocument();
  });

  it('keeps the permanent product hub visible in both remote modes', () => {
    renderHubRoute(false);
    expect(screen.getByRole('heading', { name: 'ATS Ürün Merkezi' })).toBeInTheDocument();
    expect(screen.queryByTestId('ats-live-interview-evidence-link')).not.toBeInTheDocument();

    cleanup();
    renderHubRoute(true);
    expect(screen.getByRole('heading', { name: 'ATS Ürün Merkezi' })).toBeInTheDocument();
    expect(screen.getByTestId('ats-live-interview-evidence-link')).toHaveAttribute(
      'href',
      '/admin/interview-evidence',
    );
  });

  it('rejects a direct URL when the module grant is missing in both modes', () => {
    permissionsMock.hasModule.mockReturnValue(false);

    renderRoute(false);
    expect(screen.getByText('Unauthorized destination')).toBeInTheDocument();
    expect(screen.getByTestId('route-location')).toHaveTextContent('/unauthorized');
    expect(screen.getByTestId('route-reason')).toHaveTextContent('module_denied');
    expect(screen.queryByRole('heading', { name: 'ATS Ürün Merkezi' })).not.toBeInTheDocument();

    cleanup();
    permissionsMock.hasModule.mockReturnValue(false);
    renderRoute(true);
    expect(screen.getByText('Unauthorized destination')).toBeInTheDocument();
    expect(screen.queryByText('Real Interview Evidence MFE')).not.toBeInTheDocument();
  });

  it('rejects a direct product-hub URL when the module grant is missing', () => {
    permissionsMock.hasModule.mockReturnValue(false);

    renderHubRoute(true);

    expect(screen.getByText('Unauthorized destination')).toBeInTheDocument();
    expect(screen.getByTestId('route-location')).toHaveTextContent('/unauthorized');
    expect(screen.getByTestId('route-reason')).toHaveTextContent('module_denied');
    expect(screen.queryByRole('heading', { name: 'ATS Ürün Merkezi' })).not.toBeInTheDocument();
  });

  it('keeps anonymous direct URLs behind the login boundary', () => {
    authState.auth.token = null;

    renderRoute(false);

    expect(screen.getByText('Login destination')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'ATS Ürün Merkezi' })).not.toBeInTheDocument();
  });

  it('renders the recruiter workspace only with the ATS module grant', () => {
    renderRecruiterRoute();

    expect(screen.getByText('Recruiter workspace content')).toBeInTheDocument();
  });

  it('rejects a direct recruiter-workspace URL when the module grant is missing', () => {
    permissionsMock.hasModule.mockReturnValue(false);

    renderRecruiterRoute();

    expect(screen.getByText('Unauthorized destination')).toBeInTheDocument();
    expect(screen.getByTestId('route-location')).toHaveTextContent('/unauthorized');
    expect(screen.getByTestId('route-reason')).toHaveTextContent('module_denied');
    expect(screen.queryByText('Recruiter workspace content')).not.toBeInTheDocument();
  });

  it('keeps anonymous recruiter-workspace URLs behind the login boundary', () => {
    authState.auth.token = null;

    renderRecruiterRoute();

    expect(screen.getByText('Login destination')).toBeInTheDocument();
    expect(screen.queryByText('Recruiter workspace content')).not.toBeInTheDocument();
  });
});
