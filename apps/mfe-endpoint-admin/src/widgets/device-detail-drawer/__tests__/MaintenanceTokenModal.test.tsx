import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const RAW = 'mt_SECRET_raw_value_do_not_persist_0123456789';

const h = vi.hoisted(() => ({
  listData: [
    {
      id: 'tok-pending',
      tenantId: 't',
      deviceId: 'dev-1',
      action: 'STOP_AGENT',
      status: 'PENDING',
      reason: 'reboot',
      issuedBySubject: 'admin',
      expiresAt: '2026-06-08T10:00:00Z',
      consumedAt: null,
      consumedByAgentVersion: null,
      createdAt: '2026-06-07T10:00:00Z',
      updatedAt: '2026-06-07T10:00:00Z',
    },
    {
      id: 'tok-consumed',
      tenantId: 't',
      deviceId: 'dev-1',
      action: 'UNINSTALL_AGENT',
      status: 'CONSUMED',
      reason: 'decommission',
      issuedBySubject: 'admin',
      expiresAt: '2026-06-08T10:00:00Z',
      consumedAt: '2026-06-07T11:00:00Z',
      consumedByAgentVersion: '0.1.3',
      createdAt: '2026-06-07T10:00:00Z',
      updatedAt: '2026-06-07T11:00:00Z',
    },
  ],
  createMock: vi.fn((_a: { deviceId: string; body: Record<string, unknown> }) => ({
    unwrap: () =>
      Promise.resolve({ tokenId: 'tok-new', token: RAW, expiresAt: '2026-06-08T10:00:00Z' }),
  })),
  revokeMock: vi.fn((_a: { tokenId: string; deviceId: string }) => ({
    unwrap: () => Promise.resolve({}),
  })),
}));

vi.mock('../../../app/services/endpointAdminApi', () => ({
  useListMaintenanceTokensQuery: () => ({ data: h.listData, isLoading: false }),
  useCreateMaintenanceTokenMutation: () => [h.createMock, { isLoading: false }],
  useRevokeMaintenanceTokenMutation: () => [h.revokeMock, { isLoading: false }],
}));

import { MaintenanceTokenModal } from '../components/MaintenanceTokenModal';

beforeAll(() => {
  Object.assign(navigator, { clipboard: { writeText: vi.fn(() => Promise.resolve()) } });
});
afterEach(() => {
  cleanup();
  h.createMock.mockClear();
  h.revokeMock.mockClear();
});

const renderModal = (props?: Partial<React.ComponentProps<typeof MaintenanceTokenModal>>) =>
  render(<MaintenanceTokenModal open deviceId="dev-1" onClose={vi.fn()} {...props} />);

const fillReason = (v: string) =>
  fireEvent.change(screen.getByTestId('maintenance-field-reason'), { target: { value: v } });

describe('MaintenanceTokenModal', () => {
  it('open=false iken render etmez', () => {
    const { container } = render(
      <MaintenanceTokenModal open={false} deviceId="dev-1" onClose={vi.fn()} />,
    );
    expect(container.querySelector('[data-testid="maintenance-token-modal"]')).toBeNull();
  });

  it('boş gerekçe ile submit edilmez (validation)', () => {
    renderModal();
    fireEvent.submit(screen.getByTestId('maintenance-create-form'));
    expect(h.createMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('maintenance-validation')).toBeInTheDocument();
  });

  it('create body {action, reason, expiresInMinutes} doğru gönderir', async () => {
    renderModal();
    fireEvent.change(screen.getByTestId('maintenance-field-action'), {
      target: { value: 'UNINSTALL_AGENT' },
    });
    fireEvent.change(screen.getByTestId('maintenance-field-expiry'), { target: { value: '1440' } });
    fillReason('decommission lab box');
    fireEvent.submit(screen.getByTestId('maintenance-create-form'));
    await waitFor(() => expect(h.createMock).toHaveBeenCalledTimes(1));
    expect(h.createMock.mock.calls[0][0]).toEqual({
      deviceId: 'dev-1',
      body: { action: 'UNINSTALL_AGENT', reason: 'decommission lab box', expiresInMinutes: 1440 },
    });
  });

  it('SECURITY: token create sonrası BİR KEZ reveal edilir, dismiss sonrası DOM’dan silinir', async () => {
    renderModal();
    fillReason('reboot');
    fireEvent.submit(screen.getByTestId('maintenance-create-form'));
    // revealed once
    await waitFor(() => expect(screen.getByTestId('maintenance-reveal')).toBeInTheDocument());
    expect(screen.getByTestId('maintenance-reveal-value').textContent).toBe(RAW);
    // dismiss ("ack") clears the secret from the DOM
    fireEvent.click(screen.getByTestId('maintenance-reveal-dismiss'));
    expect(screen.queryByTestId('maintenance-reveal')).toBeNull();
    expect(screen.queryByText(RAW)).toBeNull();
    // create form is back (so the secret view is not lingering)
    expect(screen.getByTestId('maintenance-create-form')).toBeInTheDocument();
  });

  it('SECURITY: modal kapatınca onClose çağrılır (secret state temizlenir)', async () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    fillReason('reboot');
    fireEvent.submit(screen.getByTestId('maintenance-create-form'));
    await waitFor(() => expect(screen.getByTestId('maintenance-reveal')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('maintenance-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('copy butonu clipboard.writeText(token) çağırır', async () => {
    renderModal();
    fillReason('reboot');
    fireEvent.submit(screen.getByTestId('maintenance-create-form'));
    await waitFor(() => expect(screen.getByTestId('maintenance-reveal')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('maintenance-reveal-copy'));
    await waitFor(() =>
      expect(navigator.clipboard.writeText as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(RAW),
    );
  });

  it('list metadata gösterir; revoke yalnız PENDING için, wire {tokenId, deviceId}', async () => {
    renderModal();
    // metadata rows, NO raw token in list
    expect(screen.getByTestId('maintenance-row-tok-pending')).toBeInTheDocument();
    expect(screen.getByTestId('maintenance-row-tok-consumed')).toBeInTheDocument();
    expect(screen.getByTestId('maintenance-revoke-tok-pending')).toBeInTheDocument();
    expect(screen.queryByTestId('maintenance-revoke-tok-consumed')).toBeNull();
    // revoke flow
    fireEvent.click(screen.getByTestId('maintenance-revoke-tok-pending'));
    fireEvent.click(screen.getByTestId('maintenance-revoke-confirm-tok-pending'));
    await waitFor(() => expect(h.revokeMock).toHaveBeenCalledTimes(1));
    expect(h.revokeMock.mock.calls[0][0]).toEqual({ tokenId: 'tok-pending', deviceId: 'dev-1' });
  });
});
