// @vitest-environment jsdom
/**
 * GridToolbar.export.test.tsx
 *
 * PR-0.5b2 (Codex thread 019e2d85): raw vs view export controls.
 * Covers the supportsViewExport branch — the legacy two-button
 * Excel/CSV layout vs the "İndir" dropdown offering raw-data and
 * current-view variants — and the exportMode value handed to
 * onServerExport.
 *
 * This is a NON-depth test file so the standard `vitest run` (CI
 * Unit jsdom job) picks it up; the *-depth.test.tsx files are
 * excluded from that config.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

import { GridToolbar } from '../GridToolbar';

afterEach(() => {
  cleanup();
});

/*
 * handleExport early-returns on a null gridApi, so the export tests
 * need a stub that satisfies the calls handleExport makes:
 * getFilterModel / getColumnState / getGridOption.
 */
const exportGridApi = {
  getFilterModel: () => ({}),
  getColumnState: () => [],
  getGridOption: () => '',
} as unknown as Parameters<typeof GridToolbar>[0]['gridApi'];

const baseProps = {
  theme: 'quartz' as const,
  density: 'comfortable' as const,
  isServerMode: true,
  exportConfig: { fileBaseName: 'rep' },
};

describe('GridToolbar — PR-0.5b2 raw vs view export', () => {
  it('supportsViewExport=false → legacy two Excel/CSV buttons, no İndir dropdown', () => {
    render(
      <GridToolbar
        {...baseProps}
        gridApi={exportGridApi}
        onServerExport={vi.fn()}
        supportsViewExport={false}
      />,
    );
    expect(screen.getByTitle('Excel')).toBeInTheDocument();
    expect(screen.getByTitle('CSV')).toBeInTheDocument();
    expect(screen.queryByTitle('İndir')).not.toBeInTheDocument();
  });

  it('supportsViewExport absent → defaults to legacy two-button layout', () => {
    render(<GridToolbar {...baseProps} gridApi={exportGridApi} onServerExport={vi.fn()} />);
    expect(screen.getByTitle('Excel')).toBeInTheDocument();
    expect(screen.queryByTitle('İndir')).not.toBeInTheDocument();
  });

  it('supportsViewExport=true → single İndir dropdown, no bare format buttons', () => {
    render(
      <GridToolbar
        {...baseProps}
        gridApi={exportGridApi}
        onServerExport={vi.fn()}
        supportsViewExport
      />,
    );
    expect(screen.getByTitle('İndir')).toBeInTheDocument();
    // the bare format buttons are gone — the dropdown holds them
    expect(screen.queryByTitle('Excel')).not.toBeInTheDocument();
    expect(screen.queryByTitle('CSV')).not.toBeInTheDocument();
  });

  it('İndir dropdown is closed until clicked', () => {
    render(
      <GridToolbar
        {...baseProps}
        gridApi={exportGridApi}
        onServerExport={vi.fn()}
        supportsViewExport
      />,
    );
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle('İndir'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    // 4 menu items: Ham veri (Excel/CSV) + Mevcut görünüm (Excel/CSV)
    expect(screen.getAllByText('Excel')).toHaveLength(2);
    expect(screen.getAllByText('CSV')).toHaveLength(2);
    // group headers
    expect(screen.getByText('Ham veri')).toBeInTheDocument();
    expect(screen.getByText('Mevcut görünüm')).toBeInTheDocument();
  });

  it('raw-group Excel → onServerExport(excel, {exportMode:raw})', async () => {
    const onServerExport = vi.fn().mockResolvedValue(undefined);
    render(
      <GridToolbar
        {...baseProps}
        gridApi={exportGridApi}
        onServerExport={onServerExport}
        supportsViewExport
      />,
    );
    fireEvent.click(screen.getByTitle('İndir'));
    // first Excel item belongs to the "Ham veri" group
    fireEvent.click(screen.getAllByText('Excel')[0]);
    await waitFor(() => expect(onServerExport).toHaveBeenCalledTimes(1));
    expect(onServerExport.mock.calls[0][0]).toBe('excel');
    expect(onServerExport.mock.calls[0][1].exportMode).toBe('raw');
  });

  it('raw-group CSV → onServerExport(csv, {exportMode:raw})', async () => {
    const onServerExport = vi.fn().mockResolvedValue(undefined);
    render(
      <GridToolbar
        {...baseProps}
        gridApi={exportGridApi}
        onServerExport={onServerExport}
        supportsViewExport
      />,
    );
    fireEvent.click(screen.getByTitle('İndir'));
    fireEvent.click(screen.getAllByText('CSV')[0]);
    await waitFor(() => expect(onServerExport).toHaveBeenCalledTimes(1));
    expect(onServerExport.mock.calls[0][0]).toBe('csv');
    expect(onServerExport.mock.calls[0][1].exportMode).toBe('raw');
  });

  it('view-group Excel → onServerExport(excel, {exportMode:view})', async () => {
    const onServerExport = vi.fn().mockResolvedValue(undefined);
    render(
      <GridToolbar
        {...baseProps}
        gridApi={exportGridApi}
        onServerExport={onServerExport}
        supportsViewExport
      />,
    );
    fireEvent.click(screen.getByTitle('İndir'));
    // second Excel item belongs to the "Mevcut görünüm" group
    fireEvent.click(screen.getAllByText('Excel')[1]);
    await waitFor(() => expect(onServerExport).toHaveBeenCalledTimes(1));
    expect(onServerExport.mock.calls[0][0]).toBe('excel');
    expect(onServerExport.mock.calls[0][1].exportMode).toBe('view');
  });

  it('view-group CSV → onServerExport(csv, {exportMode:view})', async () => {
    const onServerExport = vi.fn().mockResolvedValue(undefined);
    render(
      <GridToolbar
        {...baseProps}
        gridApi={exportGridApi}
        onServerExport={onServerExport}
        supportsViewExport
      />,
    );
    fireEvent.click(screen.getByTitle('İndir'));
    fireEvent.click(screen.getAllByText('CSV')[1]);
    await waitFor(() => expect(onServerExport).toHaveBeenCalledTimes(1));
    expect(onServerExport.mock.calls[0][0]).toBe('csv');
    expect(onServerExport.mock.calls[0][1].exportMode).toBe('view');
  });

  it('legacy two-button export sends no exportMode (undefined)', async () => {
    const onServerExport = vi.fn().mockResolvedValue(undefined);
    render(
      <GridToolbar
        {...baseProps}
        gridApi={exportGridApi}
        onServerExport={onServerExport}
        supportsViewExport={false}
      />,
    );
    fireEvent.click(screen.getByTitle('Excel'));
    await waitFor(() => expect(onServerExport).toHaveBeenCalledTimes(1));
    expect(onServerExport.mock.calls[0][1].exportMode).toBeUndefined();
  });

  it('selecting a menu item closes the dropdown', async () => {
    const onServerExport = vi.fn().mockResolvedValue(undefined);
    render(
      <GridToolbar
        {...baseProps}
        gridApi={exportGridApi}
        onServerExport={onServerExport}
        supportsViewExport
      />,
    );
    fireEvent.click(screen.getByTitle('İndir'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.click(screen.getAllByText('Excel')[0]);
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });
});
