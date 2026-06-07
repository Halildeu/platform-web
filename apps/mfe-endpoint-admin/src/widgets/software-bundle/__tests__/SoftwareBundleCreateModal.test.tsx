import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const h = vi.hoisted(() => ({
  createMock: vi.fn((_args: { body: Record<string, unknown> }) => ({
    unwrap: () => Promise.resolve({ bundleId: 'bundle-x' }),
  })),
}));

vi.mock('../../../app/services/endpointAdminApi', () => ({
  useCreateSoftwareBundleMutation: () => [h.createMock, { isLoading: false, error: undefined }],
}));

import { SoftwareBundleCreateModal } from '../SoftwareBundleCreateModal';

afterEach(() => {
  cleanup();
  h.createMock.mockClear();
});

const renderModal = () =>
  render(<SoftwareBundleCreateModal open onCancel={vi.fn()} onCreated={vi.fn()} />);

describe('SoftwareBundleCreateModal', () => {
  it('open=false iken render etmez', () => {
    const { container } = render(
      <SoftwareBundleCreateModal open={false} onCancel={vi.fn()} onCreated={vi.fn()} />,
    );
    expect(container.querySelector('[data-testid="bundle-create-modal"]')).toBeNull();
  });

  it('boş katalog id listesi / bad bundleId ile submit edilmez', () => {
    renderModal();
    fireEvent.change(screen.getByTestId('bundle-field-bundleId'), {
      target: { value: '.bad-slug' }, // starts with '.'
    });
    fireEvent.change(screen.getByTestId('bundle-field-displayName'), {
      target: { value: 'My bundle' },
    });
    // leave catalogItemIds empty
    fireEvent.submit(screen.getByTestId('bundle-create-form'));
    expect(h.createMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('bundle-create-validation')).toBeInTheDocument();
  });

  it('geçerli form: catalogItemIds parse edilir + create body doğru', async () => {
    renderModal();
    fireEvent.change(screen.getByTestId('bundle-field-bundleId'), {
      target: { value: 'office-suite' },
    });
    fireEvent.change(screen.getByTestId('bundle-field-displayName'), {
      target: { value: 'Office Suite' },
    });
    fireEvent.change(screen.getByTestId('bundle-field-catalogItemIds'), {
      target: { value: '7zip, vlc\nnotepad-plus-plus' }, // comma + space + newline
    });
    fireEvent.submit(screen.getByTestId('bundle-create-form'));

    expect(h.createMock).toHaveBeenCalledTimes(1);
    const arg = h.createMock.mock.calls[0][0] as { body: Record<string, unknown> };
    expect(arg.body).toMatchObject({
      bundleId: 'office-suite',
      displayName: 'Office Suite',
      catalogItemIds: ['7zip', 'vlc', 'notepad-plus-plus'],
    });
    // empty optional description omitted, not sent as ''
    expect(arg.body).not.toHaveProperty('description');
  });
});
