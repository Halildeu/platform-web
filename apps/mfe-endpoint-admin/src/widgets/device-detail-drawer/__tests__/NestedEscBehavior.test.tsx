// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BottomSheetDrawer } from '@mfe/design-system';
import { DestructiveCommandModal } from '../components/DestructiveCommandModal';

afterEach(() => cleanup());

/**
 * Codex 019e602f iter-1 blocker fix verification: when the destructive
 * command modal is rendered INSIDE an open `BottomSheetDrawer`, the
 * modal participates in the overlay-engine LIFO via its own `layerId`.
 *
 * The layer stack uses a monotonically incrementing counter for
 * z-index → "top dismissable layer" = highest counter = LAST registered.
 * In real usage the user opens the sheet first, then opens the modal
 * (the modal registers AFTER the sheet → modal is top). The tests
 * below simulate that sequential flow rather than mounting both as
 * open from t=0.
 */

const SequentialHarness: React.FC<{
  onSheetClose: () => void;
  onModalCancel: () => void;
}> = ({ onSheetClose, onModalCancel }) => {
  const [modalOpen, setModalOpen] = React.useState(false);
  return (
    <>
      <BottomSheetDrawer open onClose={onSheetClose} title="Sheet">
        <div data-testid="sheet-body">Sheet body</div>
        <button data-testid="open-modal-btn" onClick={() => setModalOpen(true)}>
          Open Modal
        </button>
      </BottomSheetDrawer>
      <DestructiveCommandModal
        open={modalOpen}
        type="LOCK_USER_LOGIN"
        isSubmitting={false}
        onCancel={() => {
          onModalCancel();
          setModalOpen(false);
        }}
        onSubmit={vi.fn()}
      />
    </>
  );
};

describe('Nested overlay LIFO — BottomSheetDrawer + DestructiveCommandModal', () => {
  it('modal sheet acikken acildiginda, ESC modal cancel tetikler (sheet acik kalir)', () => {
    const onSheetClose = vi.fn();
    const onModalCancel = vi.fn();

    render(<SequentialHarness onSheetClose={onSheetClose} onModalCancel={onModalCancel} />);

    // Sheet mounted first, then user clicks → modal opens (registers AFTER sheet)
    fireEvent.click(screen.getByTestId('open-modal-btn'));
    expect(screen.getByTestId('destructive-command-modal')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onModalCancel).toHaveBeenCalledTimes(1);
    expect(onSheetClose).not.toHaveBeenCalled();
  });

  it('iki seviyeli ESC LIFO: ilk modal, sonra sheet', () => {
    const onSheetClose = vi.fn();
    const onModalCancel = vi.fn();

    render(<SequentialHarness onSheetClose={onSheetClose} onModalCancel={onModalCancel} />);
    fireEvent.click(screen.getByTestId('open-modal-btn'));

    // First ESC → modal cancel (modal is top layer)
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onModalCancel).toHaveBeenCalledTimes(1);
    expect(onSheetClose).not.toHaveBeenCalled();

    // Modal unregistered after cancel → second ESC closes the sheet
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onSheetClose).toHaveBeenCalledTimes(1);
  });

  it('modal kapali iken sheet ESC ile kapanir', () => {
    const onSheetClose = vi.fn();

    render(
      <BottomSheetDrawer open onClose={onSheetClose} title="Sheet">
        <div>Sheet body</div>
      </BottomSheetDrawer>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onSheetClose).toHaveBeenCalledTimes(1);
  });
});
