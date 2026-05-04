// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ChartToolbar } from '../ChartToolbar';
import type { ChartInteractionState } from '../useChartInteractions';

/* ------------------------------------------------------------------ */
/*  Tests — uses x-charts internal cn (no DS runtime mock).            */
/*  Faz 21.10 wave 3: toolbar mobile wrap + Sep mobile-hide contract.  */
/* ------------------------------------------------------------------ */

function makeInteractions(over: Partial<ChartInteractionState> = {}): ChartInteractionState {
  return {
    zoomLevel: 1,
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    resetZoom: vi.fn(),
    isPanning: false,
    panOffset: { x: 0, y: 0 },
    isBrushing: false,
    brushRange: null,
    clearBrush: vi.fn(),
    crosshairPosition: null,
    ...over,
  };
}

describe('ChartToolbar', () => {
  it('renders with role=toolbar + aria-label', () => {
    render(<ChartToolbar interactions={makeInteractions()} />);
    const toolbar = screen.getByRole('toolbar', { name: /chart toolbar/i });
    expect(toolbar).toBeInTheDocument();
  });

  it('renders zoom controls when interactions has zoomLevel', () => {
    render(<ChartToolbar interactions={makeInteractions()} />);
    expect(screen.getByLabelText('Zoom in')).toBeInTheDocument();
    expect(screen.getByLabelText('Zoom out')).toBeInTheDocument();
    expect(screen.getByLabelText('Reset zoom')).toBeInTheDocument();
  });

  it('renders brush control when interactions exposes clearBrush', () => {
    render(<ChartToolbar interactions={makeInteractions()} />);
    expect(screen.getByLabelText('Brush select')).toBeInTheDocument();
  });

  it('renders export buttons when callbacks are provided', () => {
    render(
      <ChartToolbar
        interactions={makeInteractions()}
        onExportPNG={vi.fn()}
        onExportSVG={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Export PNG')).toBeInTheDocument();
    expect(screen.getByLabelText('Export SVG')).toBeInTheDocument();
  });

  it('renders fullscreen toggle by default', () => {
    render(<ChartToolbar interactions={makeInteractions()} />);
    expect(screen.getByLabelText('Fullscreen')).toBeInTheDocument();
  });

  it('Faz 21.10 wave 3: wrapper allows mobile wrap (flex-wrap + min-w-0 + max-w-full)', () => {
    render(<ChartToolbar interactions={makeInteractions()} />);
    const toolbar = screen.getByRole('toolbar');
    expect(toolbar.className).toContain('flex-wrap');
    expect(toolbar.className).toContain('min-w-0');
    expect(toolbar.className).toContain('max-w-full');
  });

  it('Faz 21.10 wave 3: wrapper restores single-row inline-flex on sm+ (sm:flex-nowrap)', () => {
    render(<ChartToolbar interactions={makeInteractions()} />);
    const toolbar = screen.getByRole('toolbar');
    expect(toolbar.className).toContain('sm:inline-flex');
    expect(toolbar.className).toContain('sm:w-auto');
    expect(toolbar.className).toContain('sm:flex-nowrap');
  });

  it('Faz 21.10 wave 3: separators are hidden on mobile (hidden sm:block)', () => {
    const { container } = render(
      <ChartToolbar
        interactions={makeInteractions()}
        onExportPNG={vi.fn()}
        onUndo={vi.fn()}
        onDrillUp={vi.fn()}
        drillDepth={1}
      />,
    );
    // Sep is an aria-hidden div with .h-5 and .w-px. SVG icons also use
    // aria-hidden but their className is SVGAnimatedString, so we narrow
    // the query to HTMLDivElement via the .h-5.w-px selector.
    const verticalSeparators = container.querySelectorAll<HTMLDivElement>(
      'div.h-5.w-px[aria-hidden="true"]',
    );
    expect(verticalSeparators.length).toBeGreaterThan(0);
    verticalSeparators.forEach((sep) => {
      expect(sep.className).toContain('hidden');
      expect(sep.className).toContain('sm:block');
    });
  });

  it('renders drill-up button when onDrillUp + drillDepth>0', () => {
    render(<ChartToolbar interactions={makeInteractions()} onDrillUp={vi.fn()} drillDepth={2} />);
    expect(screen.getByLabelText('Drill up')).toBeInTheDocument();
  });

  it('hides drill-up when drillDepth=0', () => {
    render(<ChartToolbar interactions={makeInteractions()} onDrillUp={vi.fn()} drillDepth={0} />);
    expect(screen.queryByLabelText('Drill up')).not.toBeInTheDocument();
  });
});
