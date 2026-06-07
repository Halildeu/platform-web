import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

// Hoisted mocks for the two RTK Query hooks the modal uses internally.
const h = vi.hoisted(() => ({
  dispatchMock: vi.fn(() => ({ unwrap: () => Promise.resolve({ id: 'cmd-42' }) })),
  releases: [
    {
      releaseId: 'rel-1',
      targetVersion: '0.1.3-lab.1',
      channel: 'lab',
      ring: null,
      signingTier: 'LAB_ONLY_EVIDENCE' as const,
      status: 'APPROVED' as const,
      enabled: true,
    },
  ],
  releasesState: { isLoading: false, isError: false },
}));

vi.mock('../../../app/services/endpointAdminApi', () => ({
  useListAgentUpdateReleasesQuery: () => ({ data: h.releases, ...h.releasesState }),
  useDispatchAgentUpdateMutation: () => [h.dispatchMock, { isLoading: false, error: undefined }],
}));

import { AgentUpdateModal } from '../components/AgentUpdateModal';

afterEach(() => {
  cleanup();
  h.dispatchMock.mockClear();
  h.releases.length = 1;
  h.releasesState.isLoading = false;
  h.releasesState.isError = false;
});

const renderModal = (props?: Partial<React.ComponentProps<typeof AgentUpdateModal>>) =>
  render(
    <AgentUpdateModal open deviceId="dev-1" onCancel={vi.fn()} onDispatched={vi.fn()} {...props} />,
  );

describe('AgentUpdateModal', () => {
  it('open=false iken hicbir sey render etmez', () => {
    renderModal({ open: false });
    expect(screen.queryByTestId('agent-update-modal')).toBeNull();
  });

  it('open=true iken approved release picker render eder', () => {
    renderModal();
    expect(screen.getByTestId('agent-update-modal')).toBeInTheDocument();
    expect(screen.getByTestId('agent-update-release-list')).toBeInTheDocument();
    expect(screen.getByTestId('agent-update-release-rel-1')).toBeInTheDocument();
    // SECURITY: the modal must NOT collect trust material — no free-form URL,
    // hash, signer or tier inputs. Only a release radio + a reason textarea.
    const textboxes = screen.getAllByRole('textbox');
    expect(textboxes).toHaveLength(1); // reason textarea only
    expect(screen.queryByPlaceholderText(/http|url|sha|thumbprint/i)).toBeNull();
  });

  it('release secilmeden / reason bos iken submit disabled', () => {
    renderModal();
    const submit = screen.getByTestId('agent-update-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    // select a release but leave reason empty → still disabled
    fireEvent.click(screen.getByTestId('agent-update-release-radio-rel-1'));
    expect(submit.disabled).toBe(true);
  });

  it('SECURITY: dispatch body EXACTLY { releaseId, reason } — no trust fields', async () => {
    renderModal();
    fireEvent.click(screen.getByTestId('agent-update-release-radio-rel-1'));
    fireEvent.change(screen.getByTestId('agent-update-reason'), {
      target: { value: 'lab self-update smoke' },
    });
    fireEvent.submit(screen.getByTestId('agent-update-modal-form'));

    expect(h.dispatchMock).toHaveBeenCalledTimes(1);
    const arg = h.dispatchMock.mock.calls[0][0] as {
      deviceId: string;
      body: Record<string, unknown>;
    };
    expect(arg.deviceId).toBe('dev-1');
    expect(arg.body).toEqual({ releaseId: 'rel-1', reason: 'lab self-update smoke' });
    // The forbidden trust material must never reach the wire.
    for (const k of ['binaryUrl', 'sha256', 'signerThumbprint', 'signingTier']) {
      expect(arg.body).not.toHaveProperty(k);
    }
  });

  it('dispatchable release yokken empty-state gosterir + submit disabled', () => {
    h.releases.length = 0;
    renderModal();
    expect(screen.getByTestId('agent-update-no-releases')).toBeInTheDocument();
    expect((screen.getByTestId('agent-update-submit') as HTMLButtonElement).disabled).toBe(true);
  });
});
