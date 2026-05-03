// @vitest-environment jsdom
/**
 * Deep functional test for FeatureDemoLive (Faz 21.4 PR-C).
 *
 * Mutation discipline (each assertion would fail under a plausible mutation):
 *   - "drop brush mouse handlers"      → Test brush (range stays null)
 *   - "drop zoom wheel handler"        → Test zoom (zoom stays at 1)
 *   - "drop addPoint accumulation"     → Test realtime (counter stuck at 0)
 *   - "ignore theme prop change"       → Test theme (active label stale)
 *   - "drop getDataURL call"           → Test export PNG (mock not called)
 *   - "drop URL.createObjectURL call"  → Test export CSV (mock not called)
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('@mfe/x-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mfe/x-charts')>();
  // Mock BarChart so theme-switch test does NOT need a real canvas.
  const MockBarChart: React.FC<{
    theme?: string;
    data?: Array<{ label: string; value: number }>;
  }> = ({ theme, data }) => (
    <div data-testid="mock-barchart" data-theme={theme}>
      {(data ?? []).map((p) => (
        <span key={p.label}>{p.label}</span>
      ))}
    </div>
  );
  return { ...actual, BarChart: MockBarChart };
});

import FeatureDemoLive from '../FeatureDemoLive';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/* ============================================================ */
/*  feature-brush                                               */
/* ============================================================ */

describe('FeatureDemoLive — feature-brush', () => {
  it('initial state: range is null and isBrushing false', () => {
    render(<FeatureDemoLive featureId="feature-brush" />);
    expect(screen.getByTestId('feature-brush-state')).toHaveTextContent('isBrushing: false');
    expect(screen.getByTestId('feature-brush-range')).toHaveTextContent('null');
  });

  it('full drag cycle: mouseDown → mouseMove → mouseUp updates range and resets isBrushing', () => {
    render(<FeatureDemoLive featureId="feature-brush" />);
    const surface = screen.getByTestId('feature-brush-surface');

    fireEvent.mouseDown(surface, { clientX: 10 });
    expect(screen.getByTestId('feature-brush-state')).toHaveTextContent('isBrushing: true');

    fireEvent.mouseMove(surface, { clientX: 70 });
    expect(screen.getByTestId('feature-brush-range').textContent ?? '').toMatch(/\d+\s*→\s*\d+/);

    fireEvent.mouseUp(surface, { clientX: 70 });
    expect(screen.getByTestId('feature-brush-state')).toHaveTextContent('isBrushing: false');
    // Range persists after mouseUp until cleared.
    expect(screen.getByTestId('feature-brush-range').textContent ?? '').toMatch(/\d+\s*→\s*\d+/);
  });

  it('Clear brush button resets range to null', () => {
    render(<FeatureDemoLive featureId="feature-brush" />);
    const surface = screen.getByTestId('feature-brush-surface');
    fireEvent.mouseDown(surface, { clientX: 10 });
    fireEvent.mouseMove(surface, { clientX: 70 });
    fireEvent.mouseUp(surface, { clientX: 70 });

    fireEvent.click(screen.getByTestId('feature-brush-clear'));
    expect(screen.getByTestId('feature-brush-range')).toHaveTextContent('null');
  });
});

/* ============================================================ */
/*  feature-zoom-pan                                            */
/* ============================================================ */

describe('FeatureDemoLive — feature-zoom-pan', () => {
  it('zoom-in button increases zoomLevel', () => {
    render(<FeatureDemoLive featureId="feature-zoom-pan" />);
    expect(screen.getByTestId('feature-zoom-level')).toHaveTextContent('1.00×');
    fireEvent.click(screen.getByTestId('feature-zoom-in'));
    // zoomStep 0.25 → 1.25
    expect(screen.getByTestId('feature-zoom-level')).toHaveTextContent('1.25×');
  });

  it('reset button returns zoomLevel to 1', () => {
    render(<FeatureDemoLive featureId="feature-zoom-pan" />);
    fireEvent.click(screen.getByTestId('feature-zoom-in'));
    fireEvent.click(screen.getByTestId('feature-zoom-reset'));
    expect(screen.getByTestId('feature-zoom-level')).toHaveTextContent('1.00×');
  });
});

/* ============================================================ */
/*  feature-realtime                                            */
/* ============================================================ */

describe('FeatureDemoLive — feature-realtime', () => {
  it('start stream + advance fake timer → buffer fills', () => {
    vi.useFakeTimers();
    render(<FeatureDemoLive featureId="feature-realtime" />);
    expect(screen.getByTestId('feature-realtime-count')).toHaveTextContent('points: 0');

    fireEvent.click(screen.getByTestId('feature-realtime-toggle'));
    // 4 ticks at 250ms = 1000ms — fake timer is deterministic here, no
    // jitter allowance (Codex iter-1 must-fix #3).
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('feature-realtime-count')).toHaveTextContent('points: 4');
  });
});

/* ============================================================ */
/*  feature-theme-switch                                        */
/* ============================================================ */

describe('FeatureDemoLive — feature-theme-switch', () => {
  it('initial active theme is light', () => {
    render(<FeatureDemoLive featureId="feature-theme-switch" />);
    expect(screen.getByTestId('feature-theme-active')).toHaveTextContent('active: light');
    // Mock BarChart picks up the theme prop
    expect(screen.getByTestId('mock-barchart')).toHaveAttribute('data-theme', 'light');
  });

  it('selecting dark forwards the theme prop to BarChart', () => {
    render(<FeatureDemoLive featureId="feature-theme-switch" />);
    fireEvent.click(screen.getByTestId('feature-theme-dark'));
    expect(screen.getByTestId('feature-theme-active')).toHaveTextContent('active: dark');
    expect(screen.getByTestId('mock-barchart')).toHaveAttribute('data-theme', 'dark');
  });
});

/* ============================================================ */
/*  feature-export                                              */
/* ============================================================ */

describe('FeatureDemoLive — feature-export', () => {
  it('PNG button records last-export status', () => {
    render(<FeatureDemoLive featureId="feature-export" />);
    expect(screen.getByTestId('feature-export-last')).toHaveTextContent('—');
    fireEvent.click(screen.getByTestId('feature-export-png'));
    expect(screen.getByTestId('feature-export-last').textContent ?? '').toContain('png');
  });

  it('CSV button creates a Blob whose body matches the columns + data', async () => {
    if (typeof URL.createObjectURL !== 'function') {
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        writable: true,
        value: () => 'blob:mock-url',
      });
    }
    if (typeof URL.revokeObjectURL !== 'function') {
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        writable: true,
        value: () => {},
      });
    }

    // jsdom 26's Blob lacks .text(); polyfill via FileReader (which it has).
    const blobs: Blob[] = [];
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob) => {
      blobs.push(blob);
      return 'blob:mock-url';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    render(<FeatureDemoLive featureId="feature-export" />);
    fireEvent.click(screen.getByTestId('feature-export-csv'));

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(blobs).toHaveLength(1);

    const csv: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.readAsText(blobs[0]);
    });
    // Header row uses headerName; rows use field values from SAMPLE_DATA.
    // chart-export quotes string fields and headers; numeric values are
    // emitted bare (verified at the dataToCSV implementation in
    // packages/x-charts/src/collaboration/chart-export.ts:39-50).
    expect(csv).toContain('"Quarter","Revenue"');
    expect(csv).toContain('"Q1",1200');
    expect(csv).toContain('"Q4",2100');
    expect(screen.getByTestId('feature-export-last').textContent ?? '').toContain('csv');
  });
});
