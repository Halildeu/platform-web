// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BottomSheetDrawer } from '../BottomSheetDrawer';

afterEach(() => {
  cleanup();
});

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  title: 'Sheet Title',
  children: <div data-testid="body">Body</div>,
};

describe('BottomSheetDrawer — temel render', () => {
  it('open=true iken dialog gosterir', () => {
    render(<BottomSheetDrawer {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('open=false iken hicbir sey render etmez', () => {
    render(<BottomSheetDrawer {...defaultProps} open={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('drag handle gorsel olarak render edilir', () => {
    render(<BottomSheetDrawer {...defaultProps} />);
    expect(screen.getByTestId('bottom-sheet-drag-handle')).toBeInTheDocument();
  });

  it('drag handle aria-hidden olarak isaretlenir (v1 dekoratif)', () => {
    render(<BottomSheetDrawer {...defaultProps} />);
    const handle = screen.getByTestId('bottom-sheet-drag-handle');
    expect(handle).toHaveAttribute('aria-hidden');
  });
});

describe('BottomSheetDrawer — ESC kapatma', () => {
  it('ESC tusu onClose tetikler', () => {
    const onClose = vi.fn();
    render(<BottomSheetDrawer {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('BottomSheetDrawer — focus trap', () => {
  it('autoFocus etkin oldugunda dialog ici bir focusable odaklanir', async () => {
    render(
      <BottomSheetDrawer {...defaultProps}>
        <button data-testid="first-focusable">First</button>
        <button>Second</button>
      </BottomSheetDrawer>,
    );
    await new Promise((r) => setTimeout(r, 80));
    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('disableFocusTrap true iken dialog otomatik odak almaz', async () => {
    const before = document.createElement('button');
    before.textContent = 'Outside';
    document.body.appendChild(before);
    before.focus();

    render(
      <BottomSheetDrawer {...defaultProps} disableFocusTrap>
        <button data-testid="bypass-focusable">First</button>
      </BottomSheetDrawer>,
    );
    await new Promise((r) => setTimeout(r, 80));
    expect(document.activeElement).toBe(before);
    document.body.removeChild(before);
  });
});

describe('BottomSheetDrawer — header + body + footer slots', () => {
  it('subtitle render edilir', () => {
    render(<BottomSheetDrawer {...defaultProps} subtitle="Sub" />);
    expect(screen.getByText('Sub')).toBeInTheDocument();
  });

  it('actions header sagda render edilir', () => {
    render(
      <BottomSheetDrawer {...defaultProps} actions={<button data-testid="action">A</button>} />,
    );
    expect(screen.getByTestId('action')).toBeInTheDocument();
  });

  it('footer slot footer alaninda render edilir', () => {
    render(
      <BottomSheetDrawer {...defaultProps} footer={<button data-testid="footer">F</button>} />,
    );
    expect(screen.getByTestId('footer')).toBeInTheDocument();
  });

  it('children body alaninda render edilir', () => {
    render(<BottomSheetDrawer {...defaultProps} />);
    expect(screen.getByTestId('body')).toBeInTheDocument();
  });
});

describe('BottomSheetDrawer — close icon', () => {
  it('close butonu icin aria-label "Close drawer" atanir', () => {
    render(<BottomSheetDrawer {...defaultProps} />);
    expect(screen.getByLabelText('Close drawer')).toBeInTheDocument();
  });
});
