// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { KPICard } from '../KPICard';

/* ------------------------------------------------------------------ */
/*  Tests — uses x-charts internal cn / Text (no DS runtime mock).     */
/* ------------------------------------------------------------------ */

describe('KPICard', () => {
  it('renders title and value', () => {
    render(<KPICard title="Revenue" value="$12,345" />);

    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('$12,345')).toBeInTheDocument();
  });

  it('shows subtitle when provided', () => {
    render(<KPICard title="Revenue" value="$12,345" subtitle="vs last month" />);

    expect(screen.getByText('vs last month')).toBeInTheDocument();
  });

  it("shows trend with up arrow for direction='up'", () => {
    const { container } = render(
      <KPICard title="Revenue" value="$12,345" trend={{ direction: 'up', value: '+12.4%' }} />,
    );

    expect(screen.getByText('+12.4%')).toBeInTheDocument();
    // Up arrow SVG has a specific path
    const svgs = container.querySelectorAll("svg[aria-hidden='true']");
    expect(svgs.length).toBeGreaterThan(0);
  });

  it("shows trend with down arrow for direction='down'", () => {
    const { container } = render(
      <KPICard title="Revenue" value="$12,345" trend={{ direction: 'down', value: '-3.2%' }} />,
    );

    expect(screen.getByText('-3.2%')).toBeInTheDocument();
    const svgs = container.querySelectorAll("svg[aria-hidden='true']");
    expect(svgs.length).toBeGreaterThan(0);
  });

  it('applies positive color for positive trend (direction=up)', () => {
    const { container } = render(
      <KPICard title="Revenue" value="$12,345" trend={{ direction: 'up', value: '+5%' }} />,
    );

    // The trend span uses inline style with success color
    const trendSpan = container.querySelector('span[style]');
    expect(trendSpan).toBeTruthy();
    const style = trendSpan!.getAttribute('style') ?? '';
    expect(style).toContain('var(--state-success-text)');
    // PR #294 (Codex iter-1) regression guard — the previous
    // implementation emitted `var(--state-success-text))` with a stray
    // closing paren that produced an invalid CSS color. Substring
    // match alone (above) PASSES against the broken string because
    // `var(--state-success-text)` is a prefix of `var(--state-success-text))`.
    // Asserting the absence of the double-paren keeps the bug out.
    expect(style).not.toContain('var(--state-success-text))');
  });

  it('applies negative color for negative trend (direction=down)', () => {
    const { container } = render(
      <KPICard title="Revenue" value="$12,345" trend={{ direction: 'down', value: '-5%' }} />,
    );

    const trendSpan = container.querySelector('span[style]');
    expect(trendSpan).toBeTruthy();
    const style = trendSpan!.getAttribute('style') ?? '';
    expect(style).toContain('var(--state-error-text)');
    expect(style).not.toContain('var(--state-error-text))');
  });

  it('applies muted color for flat trend (direction=flat)', () => {
    // Codex iter-1 (thread 019e0330) — flat-trend regression guard.
    // Previously untested; the consumer in DemographicDashboard
    // passes `direction: 'flat'` for `trend === 0` and the chip
    // must render with `--text-secondary`, not the success/error
    // colors.
    const { container } = render(
      <KPICard title="Headcount" value="1,234" trend={{ direction: 'flat', value: '0%' }} />,
    );

    const trendSpan = container.querySelector('span[style]');
    expect(trendSpan).toBeTruthy();
    const style = trendSpan!.getAttribute('style') ?? '';
    expect(style).toContain('var(--text-secondary)');
    expect(style).not.toContain('var(--text-secondary))');
  });

  it('allows overriding positive via trend.positive', () => {
    const { container } = render(
      <KPICard
        title="Churn"
        value="2.1%"
        trend={{ direction: 'down', value: '-1.2%', positive: true }}
      />,
    );

    // down direction but positive=true should use success color
    const trendSpan = container.querySelector('span[style]');
    const style = trendSpan!.getAttribute('style') ?? '';
    expect(style).toContain('var(--state-success-text)');
    expect(style).not.toContain('var(--state-success-text))');
  });

  it('renders icon slot', () => {
    render(<KPICard title="Users" value="1,234" icon={<span data-testid="kpi-icon">IC</span>} />);

    expect(screen.getByTestId('kpi-icon')).toBeInTheDocument();
  });

  it('renders chart slot', () => {
    render(
      <KPICard title="Users" value="1,234" chart={<div data-testid="kpi-chart">sparkline</div>} />,
    );

    expect(screen.getByTestId('kpi-chart')).toBeInTheDocument();
  });

  it('fires onClick when clicked', () => {
    const handleClick = vi.fn();
    render(<KPICard title="Users" value="1,234" onClick={handleClick} />);

    const card = screen.getByTestId('kpi-card');
    fireEvent.click(card);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('sets role=button and tabIndex when onClick provided', () => {
    const handleClick = vi.fn();
    render(<KPICard title="Users" value="1,234" onClick={handleClick} />);

    const card = screen.getByTestId('kpi-card');
    expect(card.getAttribute('role')).toBe('button');
    expect(card.getAttribute('tabindex')).toBe('0');
  });

  it('fires onClick on Enter key press', () => {
    const handleClick = vi.fn();
    render(<KPICard title="Users" value="1,234" onClick={handleClick} />);

    const card = screen.getByTestId('kpi-card');
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('applies className', () => {
    render(<KPICard title="Users" value="1,234" className="my-custom" />);

    const card = screen.getByTestId('kpi-card');
    expect(card.className).toContain('my-custom');
  });

  it('includes aria-label with title and value', () => {
    render(<KPICard title="Revenue" value="$12,345" />);

    const card = screen.getByTestId('kpi-card');
    expect(card.getAttribute('aria-label')).toContain('Revenue');
    expect(card.getAttribute('aria-label')).toContain('$12,345');
  });
});
