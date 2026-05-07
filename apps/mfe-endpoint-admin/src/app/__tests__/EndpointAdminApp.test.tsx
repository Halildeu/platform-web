// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import EndpointAdminApp from '../EndpointAdminApp.ui';

afterEach(() => {
  cleanup();
});

describe('EndpointAdminApp — FE-000 skeleton', () => {
  it('renders the placeholder card with stable testid', () => {
    render(<EndpointAdminApp />);
    expect(screen.getByTestId('endpoint-admin-skeleton')).toBeInTheDocument();
  });

  it('explains the module is shell-safe skeleton', () => {
    render(<EndpointAdminApp />);
    expect(screen.getByText(/hazırlık aşamasında/i)).toBeInTheDocument();
  });

  it('mentions the feature flag so operators can find it', () => {
    render(<EndpointAdminApp />);
    expect(screen.getByText(/VITE_SHELL_ENABLE_ENDPOINT_ADMIN_REMOTE/)).toBeInTheDocument();
  });
});
