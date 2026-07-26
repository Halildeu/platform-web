import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  dispatchMock: vi.fn(() => ({ unwrap: () => Promise.resolve({ id: 'command-tpm-1' }) })),
  state: { isLoading: false, isError: false },
}));

vi.mock('../../../app/services/endpointAdminApi', () => ({
  useRenewTpmCertificateMutation: () => [h.dispatchMock, h.state],
}));

vi.mock('../../../i18n', () => ({
  useEndpointAdminI18n: () => ({ t: (key: string) => key }),
}));

import { TpmCertificateRenewalModal } from '../components/TpmCertificateRenewalModal';

afterEach(() => {
  cleanup();
  h.dispatchMock.mockClear();
  h.state.isLoading = false;
  h.state.isError = false;
});

describe('TpmCertificateRenewalModal', () => {
  it('does not render while closed', () => {
    render(
      <TpmCertificateRenewalModal
        open={false}
        deviceId="device-1"
        onCancel={vi.fn()}
        onDispatched={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('tpm-renewal-modal')).toBeNull();
  });

  it('sends only reason and idempotency metadata, never token or PowerShell', async () => {
    const onDispatched = vi.fn();
    render(
      <TpmCertificateRenewalModal
        open
        deviceId="device-1"
        onCancel={vi.fn()}
        onDispatched={onDispatched}
      />,
    );

    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.queryByText(/token|powershell/i)).toBeNull();
    fireEvent.change(screen.getByTestId('tpm-renewal-reason'), {
      target: { value: '  scheduled certificate rotation  ' },
    });
    fireEvent.click(screen.getByTestId('tpm-renewal-submit'));

    await waitFor(() => expect(h.dispatchMock).toHaveBeenCalledTimes(1));
    const request = h.dispatchMock.mock.calls[0][0] as {
      deviceId: string;
      body: Record<string, unknown>;
    };
    expect(request.deviceId).toBe('device-1');
    expect(request.body.reason).toBe('scheduled certificate rotation');
    expect(request.body.idempotencyKey).toEqual(expect.any(String));
    expect(Object.keys(request.body).sort()).toEqual(['idempotencyKey', 'reason']);
    expect(JSON.stringify(request)).not.toMatch(/enrollmentToken|powershell|secret/i);
    await waitFor(() => expect(onDispatched).toHaveBeenCalledWith('command-tpm-1'));
  });

  it('keeps submit disabled without a reason', () => {
    render(
      <TpmCertificateRenewalModal
        open
        deviceId="device-1"
        onCancel={vi.fn()}
        onDispatched={vi.fn()}
      />,
    );

    expect((screen.getByTestId('tpm-renewal-submit') as HTMLButtonElement).disabled).toBe(true);
  });
});
