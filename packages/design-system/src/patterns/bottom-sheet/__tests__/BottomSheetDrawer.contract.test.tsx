// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BottomSheetDrawer } from '../BottomSheetDrawer';
import { expectNoA11yViolations } from '../../../__tests__/a11y-utils';

afterEach(() => {
  cleanup();
});

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  title: 'Device Detail',
  children: <div data-testid="body-content">Body</div>,
};

describe('BottomSheetDrawer contract — default render', () => {
  it('renders dialog when open is true', () => {
    render(<BottomSheetDrawer {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does not render when open is false', () => {
    render(<BottomSheetDrawer {...defaultProps} open={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders title as h2 heading', () => {
    render(<BottomSheetDrawer {...defaultProps} />);
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('Device Detail');
  });

  it('sets aria-modal on the dialog', () => {
    render(<BottomSheetDrawer {...defaultProps} />);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('uses string title as aria-label', () => {
    render(<BottomSheetDrawer {...defaultProps} />);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'Device Detail');
  });

  it('falls back to ariaLabel prop when title is non-string', () => {
    render(
      <BottomSheetDrawer
        {...defaultProps}
        title={<span>Composite Title</span>}
        ariaLabel="composite-sheet"
      />,
    );
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'composite-sheet');
  });
});

describe('BottomSheetDrawer contract — slot rendering', () => {
  it('renders children in the body', () => {
    render(<BottomSheetDrawer {...defaultProps} />);
    expect(screen.getByTestId('body-content')).toBeInTheDocument();
  });

  it('renders subtitle when provided', () => {
    render(<BottomSheetDrawer {...defaultProps} subtitle="SRB-AIDENETIMPC" />);
    expect(screen.getByText('SRB-AIDENETIMPC')).toBeInTheDocument();
  });

  it('renders actions slot in header', () => {
    render(
      <BottomSheetDrawer
        {...defaultProps}
        actions={<button data-testid="hdr-btn">Refresh</button>}
      />,
    );
    expect(screen.getByTestId('hdr-btn')).toBeInTheDocument();
  });

  it('renders footer slot', () => {
    render(
      <BottomSheetDrawer
        {...defaultProps}
        footer={<button data-testid="footer-btn">Done</button>}
      />,
    );
    expect(screen.getByTestId('footer-btn')).toBeInTheDocument();
  });

  it('renders the decorative drag handle', () => {
    render(<BottomSheetDrawer {...defaultProps} />);
    expect(screen.getByTestId('bottom-sheet-drag-handle')).toBeInTheDocument();
  });
});

describe('BottomSheetDrawer contract — close behaviors', () => {
  it('fires onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<BottomSheetDrawer {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('bottom-sheet-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fires onClose on backdrop click when closeOnBackdrop is true', () => {
    const onClose = vi.fn();
    const { container } = render(
      <BottomSheetDrawer {...defaultProps} onClose={onClose} closeOnBackdrop />,
    );
    const backdrop = container.querySelector('[aria-hidden]')!;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClose on backdrop click when closeOnBackdrop is false', () => {
    const onClose = vi.fn();
    const { container } = render(
      <BottomSheetDrawer {...defaultProps} onClose={onClose} closeOnBackdrop={false} />,
    );
    const backdrop = container.querySelector('[aria-hidden]')!;
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('BottomSheetDrawer contract — size variants', () => {
  it.each([
    ['sm', 'max-h-[50vh]'],
    ['md', 'max-h-[70vh]'],
    ['lg', 'max-h-[85vh]'],
    ['full', 'max-h-[95vh]'],
  ] as const)('size="%s" applies expected max-height class', (size, expectedClass) => {
    render(<BottomSheetDrawer {...defaultProps} size={size} />);
    expect(screen.getByRole('dialog').className).toContain(expectedClass);
  });

  it('default size is "lg"', () => {
    render(<BottomSheetDrawer {...defaultProps} />);
    expect(screen.getByRole('dialog').className).toContain('max-h-[85vh]');
  });
});

describe('BottomSheetDrawer contract — className merging', () => {
  it('merges custom className onto the panel', () => {
    render(<BottomSheetDrawer {...defaultProps} className="custom-bs-class" />);
    expect(screen.getByRole('dialog').className).toContain('custom-bs-class');
  });
});

describe('BottomSheetDrawer — accessibility', () => {
  it('has no accessibility violations', async () => {
    const { container } = render(<BottomSheetDrawer {...defaultProps} />);
    await expectNoA11yViolations(container);
  });
});
