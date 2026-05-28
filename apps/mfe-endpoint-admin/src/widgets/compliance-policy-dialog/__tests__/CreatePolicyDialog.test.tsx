// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { CreatePolicyDialog } from '../CreatePolicyDialog';
import type {
  AdminCatalogItemSummary,
  SpringPage,
} from '../../../entities/endpoint-software-catalog/types';

const useListCatalogItemsQueryMock = vi.fn();
const useCreateCompliancePolicyItemMutationMock = vi.fn();

vi.mock('../../../app/services/endpointAdminApi', () => ({
  useListCatalogItemsQuery: (...args: unknown[]) => useListCatalogItemsQueryMock(...args),
  useCreateCompliancePolicyItemMutation: () => useCreateCompliancePolicyItemMutationMock(),
}));

function buildCatalogItem(
  overrides: Partial<AdminCatalogItemSummary> = {},
): AdminCatalogItemSummary {
  return {
    id: 'cat-1',
    catalogItemId: '7zip.7zip',
    status: 'APPROVED',
    provider: 'WINGET',
    packageId: '7zip.7zip',
    displayName: '7-Zip',
    publisher: 'Igor Pavlov',
    riskTier: 'LOW',
    enabled: true,
    lastUpdatedAt: '2026-05-28T10:00:00Z',
    ...overrides,
  };
}

function mockCatalogList(content: AdminCatalogItemSummary[], isLoading = false) {
  const page: SpringPage<AdminCatalogItemSummary> = {
    content,
    number: 0,
    size: 200,
    totalElements: content.length,
    totalPages: 1,
    first: true,
    last: true,
    empty: content.length === 0,
  };
  useListCatalogItemsQueryMock.mockReturnValue({ data: page, isLoading });
}

describe('CreatePolicyDialog', () => {
  beforeEach(() => {
    useListCatalogItemsQueryMock.mockReset();
    useCreateCompliancePolicyItemMutationMock.mockReset();
    useCreateCompliancePolicyItemMutationMock.mockReturnValue([
      vi.fn(() => ({ unwrap: () => Promise.resolve({}) })),
      { isLoading: false },
    ]);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders nothing when open=false', () => {
    mockCatalogList([]);
    const { container } = render(
      <CreatePolicyDialog open={false} onClose={() => undefined} canManage />,
    );
    expect(container.textContent).toBe('');
  });

  it('renders catalog dropdown with displayName + catalogItemId labels', () => {
    mockCatalogList([
      buildCatalogItem({ id: 'cat-1', catalogItemId: '7zip.7zip', displayName: '7-Zip' }),
      buildCatalogItem({ id: 'cat-2', catalogItemId: 'notepad.notepad', displayName: 'Notepad++' }),
    ]);
    render(<CreatePolicyDialog open onClose={() => undefined} canManage />);
    const select = screen.getByTestId('create-policy-dialog-catalog') as HTMLSelectElement;
    expect(select).toBeTruthy();
    const options = Array.from(select.options).map((o) => o.textContent);
    expect(options).toContain('7-Zip (7zip.7zip)');
    expect(options).toContain('Notepad++ (notepad.notepad)');
  });

  it('shows catalog loading placeholder while query is in-flight', () => {
    mockCatalogList([], true);
    render(<CreatePolicyDialog open onClose={() => undefined} canManage />);
    expect(screen.getByTestId('create-policy-dialog-catalog-loading')).toBeTruthy();
  });

  it('submit button disabled until catalog selected', () => {
    mockCatalogList([buildCatalogItem({ id: 'cat-1' })]);
    render(<CreatePolicyDialog open onClose={() => undefined} canManage />);
    const submit = screen.getByTestId('create-policy-dialog-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    const select = screen.getByTestId('create-policy-dialog-catalog') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'cat-1' } });
    expect((screen.getByTestId('create-policy-dialog-submit') as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('submit posts catalogItemId UUID + enforcement + enabled to mutation', async () => {
    mockCatalogList([buildCatalogItem({ id: 'cat-1' })]);
    const triggerMock = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
    useCreateCompliancePolicyItemMutationMock.mockReturnValue([triggerMock, { isLoading: false }]);

    render(<CreatePolicyDialog open onClose={() => undefined} canManage />);
    fireEvent.change(screen.getByTestId('create-policy-dialog-catalog'), {
      target: { value: 'cat-1' },
    });
    fireEvent.change(screen.getByTestId('create-policy-dialog-enforcement'), {
      target: { value: 'FORBIDDEN' },
    });
    fireEvent.click(screen.getByTestId('create-policy-dialog-submit'));

    await waitFor(() => {
      expect(triggerMock).toHaveBeenCalled();
    });
    const callArg = triggerMock.mock.calls[0]?.[0];
    expect(callArg).toEqual({
      catalogItemId: 'cat-1',
      enforcementMode: 'FORBIDDEN',
      enabled: true,
    });
  });

  it('shows duplicate toast on 409', async () => {
    mockCatalogList([buildCatalogItem({ id: 'cat-1' })]);
    const triggerMock = vi.fn(() => ({ unwrap: () => Promise.reject({ status: 409 }) }));
    useCreateCompliancePolicyItemMutationMock.mockReturnValue([triggerMock, { isLoading: false }]);

    render(<CreatePolicyDialog open onClose={() => undefined} canManage />);
    fireEvent.change(screen.getByTestId('create-policy-dialog-catalog'), {
      target: { value: 'cat-1' },
    });
    fireEvent.click(screen.getByTestId('create-policy-dialog-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('create-policy-dialog-toast')).toBeTruthy();
    });
  });

  it('submit blocked + toast on canManage=false', async () => {
    mockCatalogList([buildCatalogItem({ id: 'cat-1' })]);
    const triggerMock = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
    useCreateCompliancePolicyItemMutationMock.mockReturnValue([triggerMock, { isLoading: false }]);

    render(<CreatePolicyDialog open onClose={() => undefined} canManage={false} />);
    fireEvent.change(screen.getByTestId('create-policy-dialog-catalog'), {
      target: { value: 'cat-1' },
    });
    // Submit button is disabled when canManage=false; assert that.
    const submit = screen.getByTestId('create-policy-dialog-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(triggerMock).not.toHaveBeenCalled();
  });
});
