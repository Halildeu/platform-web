// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { EditPolicyDialog } from '../EditPolicyDialog';
import type { CompliancePolicyItem } from '../../../entities/endpoint-device-compliance/types';

const useUpdateCompliancePolicyItemMutationMock = vi.fn();

vi.mock('../../../app/services/endpointAdminApi', () => ({
  useUpdateCompliancePolicyItemMutation: () => useUpdateCompliancePolicyItemMutationMock(),
}));

function buildPolicy(overrides: Partial<CompliancePolicyItem> = {}): CompliancePolicyItem {
  return {
    id: 'policy-1',
    tenantId: 'tenant-1',
    catalogItemId: 'catalog-uuid-1',
    catalogItemKey: '7zip.7zip',
    catalogDisplayName: '7-Zip',
    enforcementMode: 'REQUIRED',
    enabled: true,
    createdBySubject: null,
    createdAt: '2026-05-28T10:00:00Z',
    lastUpdatedBySubject: null,
    lastUpdatedAt: '2026-05-28T10:00:00Z',
    version: 3,
    ...overrides,
  };
}

describe('EditPolicyDialog', () => {
  beforeEach(() => {
    useUpdateCompliancePolicyItemMutationMock.mockReset();
    useUpdateCompliancePolicyItemMutationMock.mockReturnValue([
      vi.fn(() => ({ unwrap: () => Promise.resolve({}) })),
      { isLoading: false },
    ]);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders nothing when open=false or item=null', () => {
    const { container } = render(
      <EditPolicyDialog open={false} item={buildPolicy()} onClose={() => undefined} canManage />,
    );
    expect(container.textContent).toBe('');
    cleanup();
    const { container: c2 } = render(
      <EditPolicyDialog open item={null} onClose={() => undefined} canManage />,
    );
    expect(c2.textContent).toBe('');
  });

  it('shows catalog field as read-only metadata (immutable)', () => {
    const item = buildPolicy();
    render(<EditPolicyDialog open item={item} onClose={() => undefined} canManage />);
    const catalogReadonly = screen.getByTestId('edit-policy-dialog-catalog');
    expect(catalogReadonly.textContent).toBe('7-Zip (7zip.7zip)');
    // There is NO interactive select / input with catalog field — confirm
    // that no input element exists under the edit dialog catalog slot.
    expect(catalogReadonly.querySelector('input, select')).toBeNull();
  });

  it('pre-populates enforcement + enabled from item', () => {
    const item = buildPolicy({ enforcementMode: 'FORBIDDEN', enabled: false });
    render(<EditPolicyDialog open item={item} onClose={() => undefined} canManage />);
    expect((screen.getByTestId('edit-policy-dialog-enforcement') as HTMLSelectElement).value).toBe(
      'FORBIDDEN',
    );
    expect((screen.getByTestId('edit-policy-dialog-enabled') as HTMLInputElement).checked).toBe(
      false,
    );
  });

  it('PUT body omits version field (backend does not honor it)', async () => {
    const triggerMock = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
    useUpdateCompliancePolicyItemMutationMock.mockReturnValue([triggerMock, { isLoading: false }]);

    const item = buildPolicy({ version: 42 });
    render(<EditPolicyDialog open item={item} onClose={() => undefined} canManage />);
    fireEvent.change(screen.getByTestId('edit-policy-dialog-enforcement'), {
      target: { value: 'ALLOWED' },
    });
    fireEvent.click(screen.getByTestId('edit-policy-dialog-submit'));

    await waitFor(() => {
      expect(triggerMock).toHaveBeenCalled();
    });
    const callArg = triggerMock.mock.calls[0]?.[0] as
      | { id: string; body: Record<string, unknown> }
      | undefined;
    expect(callArg?.id).toBe('policy-1');
    expect(callArg?.body).toEqual({
      catalogItemId: 'catalog-uuid-1',
      enforcementMode: 'ALLOWED',
      enabled: true,
    });
    expect('version' in (callArg?.body ?? {})).toBe(false);
  });

  it('shows conflict toast on 409', async () => {
    const triggerMock = vi.fn(() => ({ unwrap: () => Promise.reject({ status: 409 }) }));
    useUpdateCompliancePolicyItemMutationMock.mockReturnValue([triggerMock, { isLoading: false }]);

    render(<EditPolicyDialog open item={buildPolicy()} onClose={() => undefined} canManage />);
    fireEvent.click(screen.getByTestId('edit-policy-dialog-submit'));
    await waitFor(() => {
      expect(screen.getByTestId('edit-policy-dialog-toast')).toBeTruthy();
    });
  });

  it('submit disabled when canManage=false', () => {
    render(
      <EditPolicyDialog open item={buildPolicy()} onClose={() => undefined} canManage={false} />,
    );
    const submit = screen.getByTestId('edit-policy-dialog-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });
});
