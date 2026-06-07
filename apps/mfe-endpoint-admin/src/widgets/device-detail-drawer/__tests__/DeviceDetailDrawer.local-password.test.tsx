import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { EndpointDevice } from '../../../entities/endpoint-device/types';

const apiMocks = vi.hoisted(() => ({
  createGeneric: vi.fn(),
  createLocalPassword: vi.fn(),
}));

vi.mock('@mfe/design-system/patterns/bottom-sheet', () => ({
  BottomSheetDrawer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mock-bottom-sheet">{children}</div>
  ),
}));

vi.mock('@mfe/design-system/components/tabs', () => ({
  Tabs: ({
    items,
    activeKey,
  }: {
    items: Array<{ key: string; content: React.ReactNode }>;
    activeKey: string;
  }) => <div data-testid="mock-tabs">{items.find((item) => item.key === activeKey)?.content}</div>,
}));

vi.mock('../../../app/services/endpointAdminApi', () => ({
  useListDeviceCommandsQuery: () => ({ data: [] }),
  useCreateDeviceCommandMutation: () => [apiMocks.createGeneric, { isLoading: false }],
  useCreateLocalPasswordChangeMutation: () => [apiMocks.createLocalPassword, { isLoading: false }],
}));

import { DeviceDetailDrawer } from '../DeviceDetailDrawer';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const device: EndpointDevice = {
  id: 'dev-1',
  tenantId: 'tenant-1',
  hostname: 'SRB-AIDENETIMPC',
  displayName: null,
  osType: 'WINDOWS',
  osVersion: '11 23H2',
  agentVersion: '1.4.0',
  machineFingerprint: null,
  domainName: null,
  status: 'ONLINE',
  lastSeenAt: '2026-06-07T09:00:00Z',
  enrolledAt: '2026-05-24T00:00:00Z',
  createdAt: '2026-05-24T00:00:00Z',
  updatedAt: '2026-06-07T09:00:00Z',
};

function renderActionsDrawer() {
  render(<DeviceDetailDrawer open device={device} onClose={vi.fn()} initialTab="islemler" />);
}

describe('DeviceDetailDrawer AG-042 local password routing', () => {
  it('CHANGE_LOCAL_PASSWORD uses the dedicated local-password mutation, not generic commands', async () => {
    apiMocks.createLocalPassword.mockReturnValue({
      unwrap: async () => ({
        command: {
          id: 'cmd-local-1',
          type: 'CHANGE_LOCAL_PASSWORD',
          approvalStatus: 'PENDING',
        },
        oneTimePassword: 'BackendGenerated123!',
      }),
    });
    apiMocks.createGeneric.mockReturnValue({ unwrap: async () => ({ id: 'generic' }) });

    renderActionsDrawer();
    fireEvent.click(screen.getByTestId('command-button-CHANGE_LOCAL_PASSWORD'));
    fireEvent.change(screen.getByTestId('destructive-command-username'), {
      target: { value: 'localadmin' },
    });
    fireEvent.change(screen.getByTestId('destructive-command-reason'), {
      target: { value: 'break-glass recovery' },
    });
    fireEvent.click(screen.getByTestId('destructive-command-submit'));

    await waitFor(() => expect(apiMocks.createLocalPassword).toHaveBeenCalledTimes(1));
    expect(apiMocks.createGeneric).not.toHaveBeenCalled();
    expect(apiMocks.createLocalPassword.mock.calls[0]?.[0]).toEqual({
      deviceId: 'dev-1',
      body: {
        username: 'localadmin',
        reason: 'break-glass recovery',
        idempotencyKey: expect.any(String),
        notBefore: undefined,
        expiresAt: undefined,
      },
    });
    expect(JSON.stringify(apiMocks.createLocalPassword.mock.calls[0]?.[0])).not.toMatch(
      /newPassword|password|secret|credential/i,
    );
    expect(await screen.findByTestId('local-password-one-time-value')).toHaveTextContent(
      'BackendGenerated123!',
    );
  });

  it('LOCK_USER_LOGIN keeps using the generic dual-control command mutation', async () => {
    apiMocks.createGeneric.mockReturnValue({
      unwrap: async () => ({
        id: 'cmd-lock-1',
        type: 'LOCK_USER_LOGIN',
        approvalStatus: 'PENDING',
      }),
    });
    apiMocks.createLocalPassword.mockReturnValue({
      unwrap: async () => ({ command: { id: 'local' }, oneTimePassword: null }),
    });

    renderActionsDrawer();
    fireEvent.click(screen.getByTestId('command-button-LOCK_USER_LOGIN'));
    fireEvent.change(screen.getByTestId('destructive-command-username'), {
      target: { value: 'acme\\admin' },
    });
    fireEvent.change(screen.getByTestId('destructive-command-reason'), {
      target: { value: 'brute force lockout' },
    });
    fireEvent.click(screen.getByTestId('destructive-command-submit'));

    await waitFor(() => expect(apiMocks.createGeneric).toHaveBeenCalledTimes(1));
    expect(apiMocks.createLocalPassword).not.toHaveBeenCalled();
    expect(apiMocks.createGeneric.mock.calls[0]?.[0]).toMatchObject({
      deviceId: 'dev-1',
      body: {
        type: 'LOCK_USER_LOGIN',
        reason: 'brute force lockout',
        payload: { username: 'acme\\admin' },
        idempotencyKey: expect.any(String),
      },
    });
  });
});
