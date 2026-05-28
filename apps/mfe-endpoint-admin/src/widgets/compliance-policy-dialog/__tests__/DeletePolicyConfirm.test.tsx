// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { DeletePolicyConfirm } from '../DeletePolicyConfirm';
import type { CompliancePolicyItem } from '../../../entities/endpoint-device-compliance/types';

function buildPolicy(): CompliancePolicyItem {
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
    version: 1,
  };
}

describe('DeletePolicyConfirm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders nothing when open=false or item=null', () => {
    const { container } = render(
      <DeletePolicyConfirm
        open={false}
        item={buildPolicy()}
        onClose={() => undefined}
        onConfirm={() => undefined}
        isLoading={false}
        error={undefined}
      />,
    );
    expect(container.textContent).toBe('');
  });

  it('renders body with catalog name + key interpolation', () => {
    render(
      <DeletePolicyConfirm
        open
        item={buildPolicy()}
        onClose={() => undefined}
        onConfirm={() => undefined}
        isLoading={false}
        error={undefined}
      />,
    );
    expect(screen.getByTestId('delete-policy-confirm')).toBeTruthy();
    // Body should contain the interpolated catalog string somewhere.
    expect(screen.getByText(/7-Zip \(7zip\.7zip\)/)).toBeTruthy();
  });

  it('calls onConfirm on confirm button click', () => {
    const onConfirm = vi.fn();
    render(
      <DeletePolicyConfirm
        open
        item={buildPolicy()}
        onClose={() => undefined}
        onConfirm={onConfirm}
        isLoading={false}
        error={undefined}
      />,
    );
    fireEvent.click(screen.getByTestId('delete-policy-confirm-submit'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on cancel button click', () => {
    const onClose = vi.fn();
    render(
      <DeletePolicyConfirm
        open
        item={buildPolicy()}
        onClose={onClose}
        onConfirm={() => undefined}
        isLoading={false}
        error={undefined}
      />,
    );
    fireEvent.click(screen.getByTestId('delete-policy-confirm-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables confirm button when isLoading=true', () => {
    render(
      <DeletePolicyConfirm
        open
        item={buildPolicy()}
        onClose={() => undefined}
        onConfirm={() => undefined}
        isLoading
        error={undefined}
      />,
    );
    const submit = screen.getByTestId('delete-policy-confirm-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('renders toast on 403 error', () => {
    render(
      <DeletePolicyConfirm
        open
        item={buildPolicy()}
        onClose={() => undefined}
        onConfirm={() => undefined}
        isLoading={false}
        error={403}
      />,
    );
    expect(screen.getByTestId('delete-policy-confirm-toast')).toBeTruthy();
  });
});
