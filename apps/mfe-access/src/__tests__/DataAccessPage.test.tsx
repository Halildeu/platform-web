// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../app/services/shell-services', () => ({
  getShellServices: () => {
    throw new Error('no shell services');
  },
}));

vi.mock('../shared/notifications', () => ({
  pushToast: vi.fn(),
}));

vi.mock('../data/dataAccessScopeApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/dataAccessScopeApi')>();
  return {
    ...actual,
    dataAccessScopeApi: {
      list: vi.fn(),
      grant: vi.fn(),
      revoke: vi.fn(),
    },
  };
});

import { dataAccessScopeApi, ScopeServiceUnavailableError } from '../data/dataAccessScopeApi';
import DataAccessPage from '../pages/data-access/DataAccessPage.ui';

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DataAccessPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('DataAccessPage', () => {
  beforeEach(() => {
    vi.mocked(dataAccessScopeApi.list).mockReset();
    vi.mocked(dataAccessScopeApi.grant).mockReset();
    vi.mocked(dataAccessScopeApi.revoke).mockReset();
  });

  it('renders the page shell with all 5 tabs', () => {
    renderPage();
    expect(screen.getByTestId('access-data-access-page')).toBeInTheDocument();
    // Initial active tab is "companies"
    expect(screen.getByTestId('data-access-tab-companies')).toBeInTheDocument();
    // The other tab triggers must be present (one button per tab)
    expect(screen.getByRole('tab', { name: /companies/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /projects/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /depots/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /branches/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /assignments/i })).toBeInTheDocument();
  });

  it('switches to depots tab when its trigger is clicked and shows hierarchy note', () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /depots/i }));
    expect(screen.getByTestId('data-access-tab-depots')).toBeInTheDocument();
    expect(screen.getByTestId('data-access-tab-depots-hierarchy-note')).toBeInTheDocument();
  });

  it('shows the service-unavailable banner when list query reports 503', async () => {
    vi.mocked(dataAccessScopeApi.list).mockRejectedValueOnce(new ScopeServiceUnavailableError());

    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /assignments/i }));

    fireEvent.change(screen.getByTestId('data-access-filter-user-id'), {
      target: { value: '7e6e29ab-0000-0000-0000-000000000001' },
    });
    fireEvent.change(screen.getByTestId('data-access-filter-org-id'), {
      target: { value: '1' },
    });
    fireEvent.click(screen.getByTestId('data-access-filter-apply'));

    const banner = await screen.findByTestId('data-access-service-unavailable');
    expect(banner).toBeInTheDocument();
  });
});
