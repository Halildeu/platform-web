// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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

import {
  dataAccessScopeApi,
  ScopeAlreadyGrantedError,
  ScopeServiceUnavailableError,
} from '../data/dataAccessScopeApi';
import ScopeAssignModal from '../widgets/scope-assign-modal/ScopeAssignModal';

const VALID_UUID = '7e6e29ab-0000-0000-0000-000000000001';

beforeAll(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
  }
});

const renderModal = (overrides?: { onClose?: () => void; onGranted?: () => void }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onClose = overrides?.onClose ?? vi.fn();
  const onGranted = overrides?.onGranted ?? vi.fn();
  const t = (key: string) => key;
  const utils = render(
    <QueryClientProvider client={client}>
      <ScopeAssignModal open initialKind="COMPANY" onClose={onClose} onGranted={onGranted} t={t} />
    </QueryClientProvider>,
  );
  return { ...utils, onClose, onGranted };
};

const fillValidForm = () => {
  fireEvent.change(screen.getByTestId('scope-assign-modal-user-id'), {
    target: { value: VALID_UUID },
  });
  fireEvent.change(screen.getByTestId('scope-assign-modal-org-id'), {
    target: { value: '1' },
  });
  fireEvent.change(screen.getByTestId('scope-assign-modal-scope-ref'), {
    target: { value: '1001' },
  });
};

describe('ScopeAssignModal', () => {
  beforeEach(() => {
    vi.mocked(dataAccessScopeApi.grant).mockReset();
  });

  it('submit happy path — calls grant with built scopeRef and fires onGranted', async () => {
    vi.mocked(dataAccessScopeApi.grant).mockResolvedValueOnce({
      scopeId: 99,
      userId: VALID_UUID,
      orgId: 1,
      scopeKind: 'COMPANY',
      scopeRef: '["1001"]',
      grantedAt: '2026-04-27T00:00:00Z',
      openFgaObjectType: 'company',
      openFgaObjectId: '1001',
    });

    const { onGranted, onClose } = renderModal();
    fillValidForm();
    fireEvent.click(screen.getByTestId('scope-assign-modal-submit'));

    await waitFor(() =>
      expect(vi.mocked(dataAccessScopeApi.grant)).toHaveBeenCalledWith({
        userId: VALID_UUID,
        orgId: 1,
        scopeKind: 'COMPANY',
        scopeRef: '["1001"]',
      }),
    );
    await waitFor(() => expect(onGranted).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the alreadyGranted banner when grant rejects with 409', async () => {
    vi.mocked(dataAccessScopeApi.grant).mockRejectedValueOnce(
      new ScopeAlreadyGrantedError('already granted'),
    );

    renderModal();
    fillValidForm();
    fireEvent.click(screen.getByTestId('scope-assign-modal-submit'));

    const banner = await screen.findByTestId('scope-assign-modal-error');
    expect(banner.textContent).toBe('dataAccess.error.alreadyGranted');
  });

  it('shows the serviceUnavailable banner when grant rejects with 503', async () => {
    vi.mocked(dataAccessScopeApi.grant).mockRejectedValueOnce(new ScopeServiceUnavailableError());

    renderModal();
    fillValidForm();
    fireEvent.click(screen.getByTestId('scope-assign-modal-submit'));

    const banner = await screen.findByTestId('scope-assign-modal-error');
    expect(banner.textContent).toBe('dataAccess.error.serviceUnavailable');
  });

  it('blocks submit when userId is not a UUID', () => {
    renderModal();
    fireEvent.change(screen.getByTestId('scope-assign-modal-user-id'), {
      target: { value: 'not-a-uuid' },
    });
    fireEvent.change(screen.getByTestId('scope-assign-modal-org-id'), {
      target: { value: '1' },
    });
    fireEvent.change(screen.getByTestId('scope-assign-modal-scope-ref'), {
      target: { value: '1001' },
    });

    fireEvent.click(screen.getByTestId('scope-assign-modal-submit'));

    expect(vi.mocked(dataAccessScopeApi.grant)).not.toHaveBeenCalled();
    expect(screen.getByText('dataAccess.assign.invalidUserId')).toBeInTheDocument();
  });
});
