// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ChartContainer } from '../ChartContainer';

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
});
