import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const h = vi.hoisted(() => ({
  createMock: vi.fn((_args: { body: Record<string, unknown> }) => ({
    unwrap: () => Promise.resolve({ releaseId: 'rel-x' }),
  })),
}));

vi.mock('../../../app/services/endpointAdminApi', () => ({
  useCreateAgentUpdateReleaseMutation: () => [h.createMock, { isLoading: false, error: undefined }],
}));

import { AgentUpdateReleaseCreateModal } from '../AgentUpdateReleaseCreateModal';

afterEach(() => {
  cleanup();
  h.createMock.mockClear();
});

const renderModal = () =>
  render(<AgentUpdateReleaseCreateModal open onCancel={vi.fn()} onCreated={vi.fn()} />);

const VALID_SHA256 = 'a'.repeat(64);

const fillValid = () => {
  fireEvent.change(screen.getByTestId('release-field-releaseId'), {
    target: { value: 'agent-0.2.0-stable' },
  });
  fireEvent.change(screen.getByTestId('release-field-targetVersion'), {
    target: { value: '0.2.0' },
  });
  fireEvent.change(screen.getByTestId('release-field-binaryUrl'), {
    target: { value: 'https://ghcr.example/agent-0.2.0.exe' },
  });
  fireEvent.change(screen.getByTestId('release-field-sha256'), { target: { value: VALID_SHA256 } });
  fireEvent.change(screen.getByTestId('release-field-signerThumbprint'), {
    target: { value: 'ABCDEF0123456789' },
  });
};

describe('AgentUpdateReleaseCreateModal', () => {
  it('open=false iken render etmez', () => {
    const { container } = render(
      <AgentUpdateReleaseCreateModal open={false} onCancel={vi.fn()} onCreated={vi.fn()} />,
    );
    expect(container.querySelector('[data-testid="release-create-modal"]')).toBeNull();
  });

  it('malformed sha256/non-https binaryUrl ile submit edilmez', () => {
    renderModal();
    fireEvent.change(screen.getByTestId('release-field-releaseId'), {
      target: { value: 'rel-1' },
    });
    fireEvent.change(screen.getByTestId('release-field-targetVersion'), {
      target: { value: '0.1.0' },
    });
    fireEvent.change(screen.getByTestId('release-field-binaryUrl'), {
      target: { value: 'http://insecure/x.exe' }, // not https
    });
    fireEvent.change(screen.getByTestId('release-field-sha256'), {
      target: { value: 'tooshort' }, // not 64 hex
    });
    fireEvent.change(screen.getByTestId('release-field-signerThumbprint'), {
      target: { value: 'ABCD' },
    });
    fireEvent.submit(screen.getByTestId('release-create-form'));
    expect(h.createMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('release-create-validation')).toBeInTheDocument();
  });

  it('LAB_ONLY_EVIDENCE seçilince uyarı gösterir', () => {
    renderModal();
    fireEvent.change(screen.getByTestId('release-field-signingTier'), {
      target: { value: 'LAB_ONLY_EVIDENCE' },
    });
    expect(screen.getByTestId('release-lab-warning')).toBeInTheDocument();
  });

  it('geçerli form create body trust material taşır', async () => {
    renderModal();
    fillValid();
    fireEvent.submit(screen.getByTestId('release-create-form'));

    expect(h.createMock).toHaveBeenCalledTimes(1);
    const arg = h.createMock.mock.calls[0][0] as { body: Record<string, unknown> };
    expect(arg.body).toMatchObject({
      releaseId: 'agent-0.2.0-stable',
      channel: 'STAGING',
      targetVersion: '0.2.0',
      binaryUrl: 'https://ghcr.example/agent-0.2.0.exe',
      sha256: VALID_SHA256,
      signerThumbprint: 'ABCDEF0123456789',
      signingTier: 'TRUSTED_SIGNED',
    });
    // optional empty fields are omitted, not sent as ''
    expect(arg.body).not.toHaveProperty('sha512');
    expect(arg.body).not.toHaveProperty('manifestUrl');
  });
});
