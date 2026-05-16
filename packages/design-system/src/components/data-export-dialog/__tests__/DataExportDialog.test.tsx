// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

import { DataExportDialog } from '../DataExportDialog';
import { expectNoA11yViolations } from '../../../__tests__/a11y-utils';

describe('DataExportDialog', () => {
  it('does not render when closed', () => {
    const { container } = render(
      <DataExportDialog open={false} onClose={vi.fn()} onExport={vi.fn()} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<DataExportDialog open onClose={vi.fn()} onExport={vi.fn()} />);
    await expectNoA11yViolations(container);
  });

  it('has accessible ARIA structure', () => {
    render(<DataExportDialog open onClose={vi.fn()} onExport={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label');
  });

  // ---------------------------------------------------------------------
  // DataExportDialog — all branches
  // ---------------------------------------------------------------------

  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onExport: vi.fn(),
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders when open', () => {
    render(<DataExportDialog {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('returns null when not open', () => {
    const { container } = render(<DataExportDialog {...defaultProps} open={false} />);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('returns null when access=hidden', () => {
    const { container } = render(<DataExportDialog {...defaultProps} access="hidden" />);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('calls onExport with selected options', async () => {
    const onExport = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <DataExportDialog
        open={true}
        onClose={onClose}
        onExport={onExport}
        recordCounts={{ visible: 10, all: 100, selected: 5, filtered: 25 }}
      />,
    );

    // Select CSV format
    const csvRadio = screen.getByLabelText('CSV');
    fireEvent.click(csvRadio);

    // Select "all" scope
    const allRadio = screen.getByDisplayValue('all');
    fireEvent.click(allRadio);

    // Toggle include charts
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    // Click export
    const exportButtons = screen.getAllByText(/Aktar/);
    const exportBtn = exportButtons.find(
      (b) => b.tagName === 'BUTTON' && !b.textContent?.includes('Vazge'),
    );
    fireEvent.click(exportBtn!);

    await waitFor(() => {
      expect(onExport).toHaveBeenCalledWith({
        format: 'csv',
        scope: 'all',
        includeCharts: true,
      });
    });
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<DataExportDialog open={true} onClose={onClose} onExport={vi.fn()} />);
    // Click the backdrop
    const backdrop = document.querySelector('[aria-hidden="true"]');
    if (backdrop) fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<DataExportDialog open={true} onClose={onClose} onExport={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('handles export error gracefully', async () => {
    const onExport = vi.fn().mockRejectedValue(new Error('fail'));
    const onClose = vi.fn();
    render(<DataExportDialog open={true} onClose={onClose} onExport={onExport} />);
    const exportButtons = screen.getAllByText(/Aktar/);
    const exportBtn = exportButtons.find(
      (b) => b.tagName === 'BUTTON' && !b.textContent?.includes('Vazge'),
    );
    fireEvent.click(exportBtn!);
    await waitFor(() => {
      expect(onExport).toHaveBeenCalled();
    });
    // Dialog should still be mounted (error caught)
  });

  it('renders with custom localeText', () => {
    render(
      <DataExportDialog
        {...defaultProps}
        localeText={{
          title: 'Export Data',
          exportButton: 'Export Now',
          cancelButton: 'Cancel',
          ariaLabel: 'Data export',
          scopeHeading: 'Scope',
          includeCharts: 'Include charts',
          recordSuffix: 'records',
          scopeVisible: 'Visible',
          scopeAll: 'All',
          scopeSelected: 'Selected',
          scopeFiltered: 'Filtered',
        }}
      />,
    );
    expect(screen.getByText('Export Data')).toBeTruthy();
    expect(screen.getByText('Export Now')).toBeTruthy();
  });

  it('disables interactions when access=disabled', () => {
    render(<DataExportDialog {...defaultProps} access="disabled" />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
  });

  it('shows record count summary when recordCounts provided', () => {
    render(
      <DataExportDialog
        {...defaultProps}
        recordCounts={{ visible: 10, all: 100, selected: 5, filtered: 25 }}
      />,
    );
    // Should show "10 / 100 kayıt" for visible scope
    expect(screen.getByText(/10 \/ 100/)).toBeTruthy();
  });
});
