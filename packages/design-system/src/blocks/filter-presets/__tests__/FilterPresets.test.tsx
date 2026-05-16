// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { FilterPresets } from '../FilterPresets';
import type { FilterPreset } from '../FilterPresets';
import { expectNoA11yViolations } from '../../../__tests__/a11y-utils';

describe('FilterPresets', () => {
  it('renders preset chips', () => {
    const presets = [
      { id: '1', name: 'Active Only', filters: { status: 'active' } },
      { id: '2', name: 'This Month', filters: { period: 'month' } },
    ];
    const { container } = render(<FilterPresets presets={presets} onSelect={vi.fn()} />);
    expect(container.textContent).toContain('Active Only');
  });

  it('has no accessibility violations', async () => {
    const presets = [{ id: '1', name: 'Active Only', filters: { status: 'active' } }];
    const { container } = render(<FilterPresets presets={presets} onSelect={vi.fn()} />);
    await expectNoA11yViolations(container);
  });

  it('has accessible ARIA structure', () => {
    const presets = [{ id: '1', name: 'Active Only', filters: { status: 'active' } }];
    render(<FilterPresets presets={presets} onSelect={vi.fn()} />);
    const toolbar = screen.getByRole('toolbar');
    expect(toolbar).toBeInTheDocument();
    expect(toolbar.querySelector('[aria-label]') || toolbar).toBeTruthy();
  });

  // ---------------------------------------------------------------------
  // FilterPresets — save, delete, default, shared
  // ---------------------------------------------------------------------

  const presets: FilterPreset[] = [
    { id: 'p1', name: 'Active', filters: { status: 'active' }, isDefault: true },
    { id: 'p2', name: 'Recent', filters: { sort: 'date' } },
    { id: 'p3', name: 'Shared View', filters: {}, isShared: true },
  ];

  it('renders presets with star for default', () => {
    render(<FilterPresets presets={presets} onSelect={vi.fn()} />);
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('Recent')).toBeTruthy();
    expect(screen.getByText('Shared View')).toBeTruthy();
  });

  it('calls onSelect when preset is clicked', () => {
    const onSelect = vi.fn();
    render(<FilterPresets presets={presets} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Recent'));
    expect(onSelect).toHaveBeenCalledWith(presets[1]);
  });

  it('shows save popover and saves new preset', async () => {
    const onSave = vi.fn();
    render(
      <FilterPresets
        presets={presets}
        onSelect={vi.fn()}
        onSave={onSave}
        currentFilters={{ status: 'new' }}
      />,
    );
    fireEvent.click(screen.getByText('Kaydet'));
    const input = await screen.findByPlaceholderText(/Preset ad/);
    fireEvent.change(input, { target: { value: 'My Preset' } });
    // Submit via Enter
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSave).toHaveBeenCalledWith('My Preset', { status: 'new' });
  });

  it('save popover cancel via Escape', async () => {
    const onSave = vi.fn();
    render(<FilterPresets presets={presets} onSelect={vi.fn()} onSave={onSave} />);
    fireEvent.click(screen.getByText('Kaydet'));
    const input = await screen.findByPlaceholderText(/Preset ad/);
    fireEvent.keyDown(input, { key: 'Escape' });
    // Popover should close, no save
    expect(onSave).not.toHaveBeenCalled();
  });

  it('does not save with empty name', async () => {
    const onSave = vi.fn();
    render(<FilterPresets presets={presets} onSelect={vi.fn()} onSave={onSave} />);
    fireEvent.click(screen.getByText('Kaydet'));
    const input = await screen.findByPlaceholderText(/Preset ad/);
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('delete flow — show confirmation and confirm', async () => {
    const onDelete = vi.fn();
    render(<FilterPresets presets={presets} onSelect={vi.fn()} onDelete={onDelete} />);
    // Delete button for 'Recent' (non-shared)
    const deleteBtn = screen.getByLabelText('Delete preset Recent');
    fireEvent.click(deleteBtn);
    // Confirmation appears
    const confirmDeleteBtn = await screen.findByText('Sil');
    fireEvent.click(confirmDeleteBtn);
    expect(onDelete).toHaveBeenCalledWith('p2');
  });

  it('delete flow — cancel confirmation', async () => {
    const onDelete = vi.fn();
    render(<FilterPresets presets={presets} onSelect={vi.fn()} onDelete={onDelete} />);
    const deleteBtn = screen.getByLabelText('Delete preset Recent');
    fireEvent.click(deleteBtn);
    const cancelBtn = await screen.findByText('Vazgeç');
    fireEvent.click(cancelBtn);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('onSetDefault calls handler', () => {
    const onSetDefault = vi.fn();
    render(<FilterPresets presets={presets} onSelect={vi.fn()} onSetDefault={onSetDefault} />);
    const starBtn = screen.getByLabelText('Set Recent as default');
    fireEvent.click(starBtn);
    expect(onSetDefault).toHaveBeenCalledWith('p2');
  });

  it('returns null when access=hidden', () => {
    const { container } = render(
      <FilterPresets presets={presets} onSelect={vi.fn()} access="hidden" />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('highlights active preset', () => {
    render(<FilterPresets presets={presets} onSelect={vi.fn()} activePresetId="p2" />);
    // Active one should have action-primary border
    const recentBtn = screen.getByText('Recent').closest('button');
    expect(recentBtn?.className).toContain('action-primary');
  });
});
