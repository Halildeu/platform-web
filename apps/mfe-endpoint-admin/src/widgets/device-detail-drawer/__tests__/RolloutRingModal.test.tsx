import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const h = vi.hoisted(() => ({
  patchMock: vi.fn(
    (_a: { deviceId: string; body: { deploymentRing: string | null; deviceTags: string[] } }) => ({
      unwrap: () => Promise.resolve({}),
    }),
  ),
}));

vi.mock('../../../app/services/endpointAdminApi', () => ({
  usePatchDeviceRolloutMutation: () => [h.patchMock, { isLoading: false, error: undefined }],
}));

import { RolloutRingModal } from '../components/RolloutRingModal';

afterEach(() => {
  cleanup();
  h.patchMock.mockClear();
});

const renderModal = (props?: Partial<React.ComponentProps<typeof RolloutRingModal>>) =>
  render(
    <RolloutRingModal
      open
      deviceId="dev-1"
      currentRing={null}
      currentTags={[]}
      onCancel={vi.fn()}
      onSaved={vi.fn()}
      {...props}
    />,
  );

describe('RolloutRingModal', () => {
  it('open=false iken render etmez', () => {
    const { container } = render(
      <RolloutRingModal
        open={false}
        deviceId="dev-1"
        currentRing={null}
        currentTags={[]}
        onCancel={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(container.querySelector('[data-testid="rollout-ring-modal"]')).toBeNull();
  });

  it('mevcut ring + tags ile pre-fill eder', () => {
    renderModal({ currentRing: 'IT', currentTags: ['vip', 'eng'] });
    expect((screen.getByTestId('rollout-field-ring') as HTMLSelectElement).value).toBe('IT');
    expect((screen.getByTestId('rollout-field-tags') as HTMLTextAreaElement).value).toBe(
      'vip, eng',
    );
  });

  it('ring + tags seçip kaydet → patch({deviceId, body:{deploymentRing, deviceTags}})', async () => {
    renderModal();
    fireEvent.change(screen.getByTestId('rollout-field-ring'), { target: { value: 'PILOT' } });
    fireEvent.change(screen.getByTestId('rollout-field-tags'), {
      target: { value: 'canary, west' },
    });
    fireEvent.submit(screen.getByTestId('rollout-ring-form'));
    expect(h.patchMock).toHaveBeenCalledTimes(1);
    expect(h.patchMock.mock.calls[0][0]).toEqual({
      deviceId: 'dev-1',
      body: { deploymentRing: 'PILOT', deviceTags: ['canary', 'west'] },
    });
  });

  it('unassigned ("") seçilince deploymentRing: null gönderir', async () => {
    renderModal({ currentRing: 'ALL' });
    fireEvent.change(screen.getByTestId('rollout-field-ring'), { target: { value: '' } });
    fireEvent.submit(screen.getByTestId('rollout-ring-form'));
    expect(h.patchMock.mock.calls[0][0].body.deploymentRing).toBeNull();
  });

  it('geçersiz tag (bad slug) ile submit edilmez', () => {
    renderModal();
    fireEvent.change(screen.getByTestId('rollout-field-tags'), {
      target: { value: '.bad-tag' }, // starts with '.'
    });
    fireEvent.submit(screen.getByTestId('rollout-ring-form'));
    expect(h.patchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('rollout-validation')).toBeInTheDocument();
  });
});
