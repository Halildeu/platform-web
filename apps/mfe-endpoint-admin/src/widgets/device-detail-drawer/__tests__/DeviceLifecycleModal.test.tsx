import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  decommissionMock: vi.fn((_a: { deviceId: string; body: { reason: string } }) => ({
    unwrap: () => Promise.resolve({}),
  })),
  reactivateMock: vi.fn((_a: { deviceId: string; body: { reason: string } }) => ({
    unwrap: () => Promise.resolve({}),
  })),
}));

vi.mock('../../../app/services/endpointAdminApi', () => ({
  useDecommissionDeviceMutation: () => [h.decommissionMock, { isLoading: false, error: undefined }],
  useReactivateDeviceMutation: () => [h.reactivateMock, { isLoading: false, error: undefined }],
}));

import { DeviceLifecycleModal } from '../components/DeviceLifecycleModal';

afterEach(() => {
  cleanup();
  h.decommissionMock.mockClear();
  h.reactivateMock.mockClear();
});

const renderModal = (props?: Partial<React.ComponentProps<typeof DeviceLifecycleModal>>) =>
  render(
    <DeviceLifecycleModal
      open
      deviceId="dev-1"
      action="decommission"
      onCancel={vi.fn()}
      onDone={vi.fn()}
      {...props}
    />,
  );

describe('DeviceLifecycleModal', () => {
  it('open=false iken render etmez', () => {
    const { container } = renderModal({ open: false });
    expect(container.querySelector('[data-testid="device-lifecycle-modal"]')).toBeNull();
  });

  it('gerekçe boşken submit edilmez + zorunlu alan hatası', () => {
    renderModal();
    fireEvent.submit(screen.getByTestId('device-lifecycle-form'));
    expect(h.decommissionMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('device-lifecycle-reason-error')).toBeInTheDocument();
  });

  it('decommission: gerekçe ile submit → decommissionDevice({deviceId, body:{reason}}) + onDone', async () => {
    const onDone = vi.fn();
    renderModal({ onDone });
    fireEvent.change(screen.getByTestId('device-lifecycle-reason'), {
      target: { value: 'donanım onarımı' },
    });
    fireEvent.submit(screen.getByTestId('device-lifecycle-form'));
    expect(h.decommissionMock).toHaveBeenCalledTimes(1);
    expect(h.decommissionMock.mock.calls[0][0]).toEqual({
      deviceId: 'dev-1',
      body: { reason: 'donanım onarımı' },
    });
    expect(h.reactivateMock).not.toHaveBeenCalled();
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it('reactivate: reactivateDevice çağrılır (decommission değil)', () => {
    renderModal({ action: 'reactivate' });
    fireEvent.change(screen.getByTestId('device-lifecycle-reason'), {
      target: { value: 'tekrar hizmete' },
    });
    fireEvent.submit(screen.getByTestId('device-lifecycle-form'));
    expect(h.reactivateMock).toHaveBeenCalledTimes(1);
    expect(h.reactivateMock.mock.calls[0][0]).toEqual({
      deviceId: 'dev-1',
      body: { reason: 'tekrar hizmete' },
    });
    expect(h.decommissionMock).not.toHaveBeenCalled();
  });

  it('512 karakterden uzun gerekçe submit edilmez', () => {
    renderModal();
    fireEvent.change(screen.getByTestId('device-lifecycle-reason'), {
      target: { value: 'x'.repeat(513) },
    });
    fireEvent.submit(screen.getByTestId('device-lifecycle-form'));
    expect(h.decommissionMock).not.toHaveBeenCalled();
  });

  it('reason trim → boşluk-only gerekçe geçmez', () => {
    renderModal();
    fireEvent.change(screen.getByTestId('device-lifecycle-reason'), {
      target: { value: '   ' },
    });
    fireEvent.submit(screen.getByTestId('device-lifecycle-form'));
    expect(h.decommissionMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('device-lifecycle-reason-error')).toBeInTheDocument();
  });
});
