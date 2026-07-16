import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

/**
 * platform-web #922 slice S4a — capability-state migration coverage for the
 * catalog-items list-load error branch. The page previously rendered a flat
 * `catalog-items-error` <p>; it now delegates status interpretation to the
 * shared `classifyCapabilityError(error, FLEET_CAPABILITY_POLICY)` classifier
 * and renders `<CapabilityState testId="catalog-items-state">`. These specs
 * assert the classifier verdict surfaced via `data-capability-kind`.
 */

const okResult = {
  data: {
    content: [],
    number: 0,
    size: 20,
    totalElements: 0,
    totalPages: 0,
    first: true,
    last: true,
    empty: true,
  },
  error: undefined as unknown,
  isLoading: false,
  isFetching: false,
  refetch: vi.fn(),
};

const h = vi.hoisted(() => ({
  // Mutable list-query result the mock reads on every render; error specs
  // reassign it, and afterEach resets it back to a benign default.
  listResult: {
    data: undefined,
    error: undefined,
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  } as Record<string, unknown>,
}));

vi.mock('../../../app/services/endpointAdminApi', () => ({
  useListCatalogItemsQuery: () => h.listResult,
}));
vi.mock('../../compliance-policies/useManageGate', () => ({ useManageGate: () => true }));

import { EndpointCatalogItemsPage } from '../EndpointCatalogItemsPage';

afterEach(() => {
  cleanup();
  h.listResult = { ...okResult, refetch: vi.fn() };
});

describe('EndpointCatalogItemsPage capability-state error branch', () => {
  it('list-load 404 → catalog-items-state capability kind=notEnabled (fleet policy)', () => {
    h.listResult = {
      data: undefined,
      error: { status: 404 },
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    };
    render(<EndpointCatalogItemsPage />);
    const state = screen.getByTestId('catalog-items-state');
    expect(state).toBeInTheDocument();
    expect(state.getAttribute('data-capability-kind')).toBe('notEnabled');
    // the old flat error surface is gone
    expect(screen.queryByTestId('catalog-items-error')).toBeNull();
  });

  it('list-load 403 → catalog-items-state capability kind=forbidden', () => {
    h.listResult = {
      data: undefined,
      error: { status: 403 },
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    };
    render(<EndpointCatalogItemsPage />);
    expect(screen.getByTestId('catalog-items-state').getAttribute('data-capability-kind')).toBe(
      'forbidden',
    );
  });

  it('list-load transport failure (string status) → catalog-items-state kind=error', () => {
    h.listResult = {
      data: undefined,
      error: { status: 'FETCH_ERROR', error: 'network down' },
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    };
    render(<EndpointCatalogItemsPage />);
    expect(screen.getByTestId('catalog-items-state').getAttribute('data-capability-kind')).toBe(
      'error',
    );
  });
});
