// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ChartContainer } from '../ChartContainer';
import { ChartToolbar } from '../ChartToolbar';
import type { ChartInteractionState } from '../useChartInteractions';

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

/* ------------------------------------------------------------------ */
/*  Tests — uses x-charts internal cn / Text / Spinner                 */
/*  (no DS runtime mock; PR-C0 cycle break).                           */
/* ------------------------------------------------------------------ */

describe('ChartContainer', () => {
  it('renders title and description', () => {
    render(
      <ChartContainer title="Revenue" description="Monthly overview">
        <div>chart</div>
      </ChartContainer>,
    );

    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('Monthly overview')).toBeInTheDocument();
  });

  it('shows loading spinner when loading=true', () => {
    render(
      <ChartContainer loading>
        <div>chart</div>
      </ChartContainer>,
    );

    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
    expect(screen.queryByText('chart')).not.toBeInTheDocument();
  });

  it('shows error message when error is set', () => {
    render(
      <ChartContainer error="Something went wrong">
        <div>chart</div>
      </ChartContainer>,
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.queryByText('chart')).not.toBeInTheDocument();
  });

  it('shows empty state when empty=true', () => {
    render(
      <ChartContainer empty>
        <div>chart</div>
      </ChartContainer>,
    );

    expect(screen.getByText('No data available')).toBeInTheDocument();
    expect(screen.queryByText('chart')).not.toBeInTheDocument();
  });

  it('shows custom empty label', () => {
    render(
      <ChartContainer empty emptyLabel="Nothing here">
        <div>chart</div>
      </ChartContainer>,
    );

    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('renders children when not loading/error/empty', () => {
    render(
      <ChartContainer>
        <div>chart content</div>
      </ChartContainer>,
    );

    expect(screen.getByText('chart content')).toBeInTheDocument();
  });

  it('renders actions slot', () => {
    render(
      <ChartContainer title="Sales" actions={<button>Export</button>}>
        <div>chart</div>
      </ChartContainer>,
    );

    expect(screen.getByText('Export')).toBeInTheDocument();
  });

  it('Faz 21.10 wave 2: header uses mobile-first padding (px-3 py-2 sm:px-5 sm:py-3)', () => {
    const { container } = render(
      <ChartContainer title="Sales" actions={<button>Export</button>}>
        <div>chart</div>
      </ChartContainer>,
    );
    // Header is the first border-b div
    const header = container.querySelector('.border-b') as HTMLElement;
    expect(header).toBeTruthy();
    expect(header.className).toContain('px-3');
    expect(header.className).toContain('sm:px-5');
    expect(header.className).toContain('py-2');
    expect(header.className).toContain('sm:py-3');
  });

  it('Faz 21.10 wave 2: title truncates when actions take row space', () => {
    const { container } = render(
      <ChartContainer
        title="Very long chart title that would otherwise wrap and break the header layout"
        actions={<button>Export</button>}
      >
        <div>chart</div>
      </ChartContainer>,
    );
    // The title node has the `truncate` class so overflow ellipsizes
    // instead of pushing the actions group offscreen.
    const titleEls = Array.from(container.querySelectorAll('div'))
      .map((el) => el)
      .filter((el) => el.className.includes('truncate') && el.className.includes('font-semibold'));
    expect(titleEls.length).toBeGreaterThan(0);
  });

  it('applies height style', () => {
    const { container } = render(
      <ChartContainer height={400}>
        <div>chart</div>
      </ChartContainer>,
    );

    const body = container.querySelector('[style]') as HTMLElement;
    expect(body).toBeTruthy();
    expect(body.style.height).toBe('400px');
  });

  it('applies className', () => {
    const { container } = render(
      <ChartContainer className="custom-class">
        <div>chart</div>
      </ChartContainer>,
    );

    const outer = container.firstChild as HTMLElement;
    expect(outer.className).toContain('custom-class');
  });

  /* -------- Faz 21.10 wave 4: actions slot mobile shrink/wrap -------- */

  it('Faz 21.10 wave 4: actions wrapper allows mobile wrap (min-w-0 + flex-wrap)', () => {
    render(
      <ChartContainer title="Sales" actions={<button>Export</button>}>
        <div>chart</div>
      </ChartContainer>,
    );
    // The actions wrapper is the parent of the action button(s).
    const button = screen.getByText('Export');
    const actionsWrapper = button.parentElement as HTMLElement;
    expect(actionsWrapper.classList.contains('min-w-0')).toBe(true);
    expect(actionsWrapper.classList.contains('max-w-full')).toBe(true);
    expect(actionsWrapper.classList.contains('flex-wrap')).toBe(true);
    // Mobile no longer locks shrink-0 — wave 2 unconditional class is gone.
    expect(actionsWrapper.classList.contains('shrink-0')).toBe(false);
  });

  it('Faz 21.10 wave 4: actions wrapper retains wave-2 shrink lock on sm+ (sm:shrink-0)', () => {
    render(
      <ChartContainer title="Sales" actions={<button>Export</button>}>
        <div>chart</div>
      </ChartContainer>,
    );
    const button = screen.getByText('Export');
    const actionsWrapper = button.parentElement as HTMLElement;
    expect(actionsWrapper.classList.contains('sm:shrink-0')).toBe(true);
    expect(actionsWrapper.classList.contains('sm:flex-nowrap')).toBe(true);
  });

  it('Faz 21.10 wave 4: actions wrapper hosts a wrapping ChartToolbar on mobile', () => {
    render(
      <ChartContainer
        title="Long chart title that would push actions on a narrow viewport"
        actions={
          <ChartToolbar
            interactions={makeInteractions()}
            onExportPNG={vi.fn()}
            onExportSVG={vi.fn()}
          />
        }
      >
        <div>chart</div>
      </ChartContainer>,
    );

    const toolbar = screen.getByRole('toolbar', { name: /chart toolbar/i });
    const actionsWrapper = toolbar.parentElement as HTMLElement;

    // Outer slot can shrink and wrap on mobile…
    expect(actionsWrapper.classList.contains('min-w-0')).toBe(true);
    expect(actionsWrapper.classList.contains('flex-wrap')).toBe(true);
    expect(actionsWrapper.classList.contains('sm:shrink-0')).toBe(true);

    // …and the toolbar itself contributes its own wrap-capable class so
    // the wave-3 + wave-4 contracts compose end-to-end.
    expect(toolbar.className).toContain('flex-wrap');
    expect(toolbar.className).toContain('max-w-full');
  });
});
