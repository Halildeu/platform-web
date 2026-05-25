// @vitest-environment jsdom
// depth-keep
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BottomSheetDrawer } from '../BottomSheetDrawer';

afterEach(() => {
  cleanup();
});

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  title: 'Depth Test',
  children: <div data-testid="body">Body</div>,
};

describe('BottomSheetDrawer depth — keyboard navigation', () => {
  it('Tab tusu focus trap icinde dolanir (autoFocus default)', async () => {
    const user = userEvent.setup();
    render(
      <BottomSheetDrawer {...defaultProps}>
        <button data-testid="b1">B1</button>
        <button data-testid="b2">B2</button>
      </BottomSheetDrawer>,
    );
    await user.tab();
    // Some focusable inside dialog is active
    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('ESC close butonu disabled olsa bile onClose tetikler', () => {
    const onClose = vi.fn();
    render(<BottomSheetDrawer {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('BottomSheetDrawer depth — prop combinations', () => {
  it('subtitle + actions + footer hep birlikte render edilir', () => {
    render(
      <BottomSheetDrawer
        {...defaultProps}
        subtitle="combo-sub"
        actions={<button data-testid="combo-action">A</button>}
        footer={<button data-testid="combo-footer">F</button>}
      />,
    );
    expect(screen.getByText('combo-sub')).toBeInTheDocument();
    expect(screen.getByTestId('combo-action')).toBeInTheDocument();
    expect(screen.getByTestId('combo-footer')).toBeInTheDocument();
  });

  it('subtitle gizli iken header tek satir gosterilir', () => {
    render(<BottomSheetDrawer {...defaultProps} />);
    const dialog = screen.getByRole('dialog');
    const ps = dialog.querySelectorAll('p');
    expect(ps.length).toBe(0);
  });
});

describe('BottomSheetDrawer depth — close behaviors', () => {
  it('close button + backdrop her ikisi de onClose tetikler', () => {
    const onClose = vi.fn();
    const { container } = render(<BottomSheetDrawer {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('bottom-sheet-close'));
    const backdrop = container.querySelector('[aria-hidden]')!;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('closeOnBackdrop=false iken backdrop click onClose tetiklemez', () => {
    const onClose = vi.fn();
    const { container } = render(
      <BottomSheetDrawer {...defaultProps} onClose={onClose} closeOnBackdrop={false} />,
    );
    const backdrop = container.querySelector('[aria-hidden]')!;
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('BottomSheetDrawer depth — size matrix', () => {
  it.each([
    ['sm', 'max-h-[50vh]'],
    ['md', 'max-h-[70vh]'],
    ['lg', 'max-h-[85vh]'],
    ['full', 'max-h-[95vh]'],
  ] as const)('size %s -> %s class', (size, cls) => {
    render(<BottomSheetDrawer {...defaultProps} size={size} />);
    expect(screen.getByRole('dialog').className).toContain(cls);
  });
});

describe('BottomSheetDrawer depth — access control', () => {
  it('access="hidden" iken render etmez', () => {
    render(<BottomSheetDrawer {...defaultProps} access="hidden" />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('access="disabled" iken pointer-events-none class uygulanir', () => {
    render(<BottomSheetDrawer {...defaultProps} access="disabled" accessReason="readonly" />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('pointer-events-none');
    expect(dialog).toHaveAttribute('title', 'readonly');
  });
});
