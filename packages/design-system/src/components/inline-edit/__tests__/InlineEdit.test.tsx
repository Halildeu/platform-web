// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

import { InlineEdit } from '../InlineEdit';
import { expectNoA11yViolations } from '../../../__tests__/a11y-utils';

describe('InlineEdit', () => {
  it('renders display value', () => {
    const { container } = render(<InlineEdit value="Hello" onSave={vi.fn()} />);
    expect(container.textContent).toContain('Hello');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<InlineEdit value="Hello" onSave={vi.fn()} />);
    await expectNoA11yViolations(container);
  });

  it('has accessible ARIA structure', () => {
    render(<InlineEdit value="Hello" onSave={vi.fn()} />);
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-label');
  });

  // ---------------------------------------------------------------------
  // InlineEdit — all type/validation/error branches
  // ---------------------------------------------------------------------

  it('renders display mode with formatDisplay', () => {
    render(<InlineEdit value="100" onSave={vi.fn()} formatDisplay={(v) => `$${v}`} />);
    expect(screen.getByText('$100')).toBeTruthy();
  });

  it('enters edit mode on double click', () => {
    render(<InlineEdit value="hello" onSave={vi.fn()} />);
    const display = screen.getByText('hello');
    fireEvent.doubleClick(display);
    const input = document.querySelector('input');
    expect(input).toBeTruthy();
  });

  it('saves on Enter key', async () => {
    const onSave = vi.fn();
    render(<InlineEdit value="old" onSave={onSave} />);
    fireEvent.doubleClick(screen.getByText('old'));
    const input = document.querySelector('input')!;
    fireEvent.change(input, { target: { value: 'new' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('new');
    });
  });

  it('cancels on Escape key', () => {
    const onSave = vi.fn();
    render(<InlineEdit value="old" onSave={onSave} />);
    fireEvent.doubleClick(screen.getByText('old'));
    const input = document.querySelector('input')!;
    fireEvent.change(input, { target: { value: 'new' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onSave).not.toHaveBeenCalled();
    // Should show display mode again
    expect(screen.getByText('old')).toBeTruthy();
  });

  it('shows validation error', async () => {
    const validate = (v: string) => (v.length < 3 ? 'Too short' : null);
    render(<InlineEdit value="ok" onSave={vi.fn()} validate={validate} />);
    fireEvent.doubleClick(screen.getByText('ok'));
    const input = document.querySelector('input')!;
    fireEvent.change(input, { target: { value: 'ab' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(screen.getByText('Too short')).toBeTruthy();
    });
  });

  it('handles onSave error', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Server error'));
    render(<InlineEdit value="old" onSave={onSave} />);
    fireEvent.doubleClick(screen.getByText('old'));
    const input = document.querySelector('input')!;
    fireEvent.change(input, { target: { value: 'new' } });
    fireEvent.click(screen.getByLabelText('Save'));
    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeTruthy();
    });
  });

  it('handles non-Error throw on save', async () => {
    const onSave = vi.fn().mockRejectedValue('string error');
    render(<InlineEdit value="old" onSave={onSave} />);
    fireEvent.doubleClick(screen.getByText('old'));
    const input = document.querySelector('input')!;
    fireEvent.change(input, { target: { value: 'new' } });
    fireEvent.click(screen.getByLabelText('Save'));
    await waitFor(() => {
      expect(screen.getByText(/hatası/)).toBeTruthy();
    });
  });

  it('does not save if value unchanged', () => {
    const onSave = vi.fn();
    render(<InlineEdit value="same" onSave={onSave} />);
    fireEvent.doubleClick(screen.getByText('same'));
    fireEvent.keyDown(document.querySelector('input')!, { key: 'Enter' });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('renders select type', () => {
    render(
      <InlineEdit
        value="a"
        type="select"
        options={[
          { value: 'a', label: 'Option A' },
          { value: 'b', label: 'Option B' },
        ]}
        onSave={vi.fn()}
      />,
    );
    fireEvent.doubleClick(screen.getByText('a'));
    const select = document.querySelector('select');
    expect(select).toBeTruthy();
  });

  it('renders number type', () => {
    render(<InlineEdit value="42" type="number" onSave={vi.fn()} />);
    fireEvent.doubleClick(screen.getByText('42'));
    const input = document.querySelector('input[type="number"]');
    expect(input).toBeTruthy();
  });

  it('shows placeholder when value is empty', () => {
    render(<InlineEdit value="" onSave={vi.fn()} placeholder="Enter text" />);
    expect(screen.getByText('Enter text')).toBeTruthy();
  });

  it('returns null when access=hidden', () => {
    const { container } = render(<InlineEdit value="x" onSave={vi.fn()} access="hidden" />);
    expect(container.innerHTML).toBe('');
  });

  it('cannot enter edit mode when access=readonly', () => {
    render(<InlineEdit value="readonly" onSave={vi.fn()} access="readonly" />);
    fireEvent.doubleClick(screen.getByText('readonly'));
    expect(document.querySelector('input')).toBeNull();
  });

  it('cannot enter edit mode when access=disabled', () => {
    render(<InlineEdit value="disabled" onSave={vi.fn()} access="disabled" />);
    fireEvent.doubleClick(screen.getByText('disabled'));
    expect(document.querySelector('input')).toBeNull();
  });

  it('Enter key on display mode enters edit when canEdit', () => {
    render(<InlineEdit value="test" onSave={vi.fn()} />);
    const display = screen.getByText('test');
    fireEvent.keyDown(display, { key: 'Enter' });
    expect(document.querySelector('input')).toBeTruthy();
  });

  it('Tab key triggers save', async () => {
    const onSave = vi.fn();
    render(<InlineEdit value="old" onSave={onSave} />);
    fireEvent.doubleClick(screen.getByText('old'));
    const input = document.querySelector('input')!;
    fireEvent.change(input, { target: { value: 'new' } });
    fireEvent.keyDown(input, { key: 'Tab' });
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('new');
    });
  });

  it('cancel button returns to display mode', () => {
    render(<InlineEdit value="val" onSave={vi.fn()} />);
    fireEvent.doubleClick(screen.getByText('val'));
    fireEvent.click(screen.getByLabelText('Cancel'));
    expect(screen.getByText('val')).toBeTruthy();
    expect(document.querySelector('input')).toBeNull();
  });
});
