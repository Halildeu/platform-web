// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SparklineChart } from '../SparklineChart';

/* ------------------------------------------------------------------ */
/*  Tests — uses x-charts internal cn (no DS runtime mock).            */
/* ------------------------------------------------------------------ */

describe('SparklineChart', () => {
  const sampleData = [10, 20, 15, 25, 30];

  it('renders SVG with correct dimensions', () => {
    const { container } = render(<SparklineChart data={sampleData} width={200} height={40} />);

    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg!.getAttribute('width')).toBe('200');
    expect(svg!.getAttribute('height')).toBe('40');
    expect(svg!.getAttribute('viewBox')).toBe('0 0 200 40');
  });

  it('renders polyline for line type (default)', () => {
    const { container } = render(<SparklineChart data={sampleData} type="line" />);

    const polyline = container.querySelector('polyline');
    expect(polyline).toBeTruthy();
    expect(polyline!.getAttribute('fill')).toBe('none');
    expect(polyline!.getAttribute('stroke')).toBeTruthy();
    // PR #295 sweep regression guard — the default stroke color uses
    // `var(--action-primary)`. Pre-PR the literal had a stray `))`
    // closing paren that produced an invalid CSS color; svg
    // attributes accept arbitrary strings so renderers don't error,
    // they just paint with the browser's default fallback color.
    expect(polyline!.getAttribute('stroke')).toBe('var(--action-primary)');
  });

  it('renders bars (rect elements) for bar type', () => {
    const { container } = render(<SparklineChart data={sampleData} type="bar" />);

    const rects = container.querySelectorAll('rect');
    expect(rects.length).toBe(sampleData.length);
  });

  it('renders area path and polyline for area type', () => {
    const { container } = render(<SparklineChart data={sampleData} type="area" />);

    const path = container.querySelector('path');
    const polyline = container.querySelector('polyline');
    expect(path).toBeTruthy();
    expect(polyline).toBeTruthy();
    // area path should close with Z
    expect(path!.getAttribute('d')).toContain('Z');
  });

  it('shows last point marker when showLastPoint=true', () => {
    const { container } = render(<SparklineChart data={sampleData} showLastPoint />);

    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBe(1);
    expect(circles[0].getAttribute('r')).toBe('2.5');
  });

  it('does not show last point marker when showLastPoint=false (default)', () => {
    const { container } = render(<SparklineChart data={sampleData} />);

    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBe(0);
  });

  it('shows min/max markers when showMinMax=true', () => {
    const { container } = render(<SparklineChart data={sampleData} showMinMax />);

    // min + max = 2 circles
    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBe(2);
    // min marker has r=2
    expect(circles[0].getAttribute('r')).toBe('2');
    expect(circles[1].getAttribute('r')).toBe('2');
  });

  it('shows min/max and lastPoint markers together', () => {
    const { container } = render(<SparklineChart data={sampleData} showMinMax showLastPoint />);

    // lastPoint (r=2.5) + min (r=2) + max (r=2) = 3 circles
    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBe(3);
  });

  it('applies custom color', () => {
    const { container } = render(
      <SparklineChart data={sampleData} type="line" color="var(--state-danger-text)" />,
    );

    const polyline = container.querySelector('polyline');
    expect(polyline!.getAttribute('stroke')).toBe('var(--state-danger-text)');
  });

  it('handles empty data array', () => {
    render(<SparklineChart data={[]} />);

    const emptyEl = screen.getByTestId('sparkline-chart-empty');
    expect(emptyEl).toBeInTheDocument();
    expect(emptyEl.querySelector('svg')).toBeNull();
  });

  it('renders aria-label with data summary', () => {
    const { container } = render(<SparklineChart data={[5, 10, 15]} />);

    const svg = container.querySelector('svg');
    expect(svg!.getAttribute('aria-label')).toBe('Sparkline chart: 3 data points, last value 15');
  });

  /* ---------- Faz 21.10 wave 3: fluid width API ---------- */

  it('Faz 21.10 wave 3: width="auto" renders SVG with width=100% + viewBox 0 0 100 h + preserveAspectRatio="none"', () => {
    const { container } = render(<SparklineChart data={sampleData} width="auto" height={32} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg!.getAttribute('width')).toBe('100%');
    expect(svg!.getAttribute('height')).toBe('32');
    expect(svg!.getAttribute('viewBox')).toBe('0 0 100 32');
    expect(svg!.getAttribute('preserveAspectRatio')).toBe('none');
  });

  it('Faz 21.10 wave 3: width="auto" root uses block w-full instead of inline-block', () => {
    const { container } = render(<SparklineChart data={sampleData} width="auto" height={32} />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain('block');
    expect(root.className).toContain('w-full');
    expect(root.className).not.toMatch(/\binline-block\b/);
    // Inline width is dropped — only height remains.
    expect(root.style.width).toBe('');
    expect(root.style.height).toBe('32px');
  });

  it('Faz 21.10 wave 3: empty data + width="auto" keeps fluid root sizing', () => {
    const { container } = render(<SparklineChart data={[]} width="auto" height={32} />);
    const empty = container.querySelector('[data-testid="sparkline-chart-empty"]') as HTMLElement;
    expect(empty).toBeTruthy();
    expect(empty.className).toContain('block');
    expect(empty.className).toContain('w-full');
    expect(empty.style.width).toBe('');
    expect(empty.style.height).toBe('32px');
    // No SVG in empty state.
    expect(empty.querySelector('svg')).toBeNull();
  });

  it('Faz 21.10 wave 3: default numeric width keeps inline-block + fixed viewBox (backwards compat)', () => {
    const { container } = render(<SparklineChart data={sampleData} />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain('inline-block');
    expect(root.className).not.toContain('w-full');
    const svg = container.querySelector('svg');
    expect(svg!.getAttribute('width')).toBe('120');
    expect(svg!.getAttribute('viewBox')).toBe('0 0 120 32');
    // No preserveAspectRatio when width is numeric.
    expect(svg!.getAttribute('preserveAspectRatio')).toBeNull();
  });

  it('Faz 21.10 wave 3: type="bar" + width="auto" renders bars on the 100-unit grid', () => {
    const { container } = render(
      <SparklineChart data={sampleData} type="bar" width="auto" height={32} />,
    );
    const rects = container.querySelectorAll('rect');
    expect(rects.length).toBe(sampleData.length);
    // viewBox uses logicalWidth=100 — bar geometry must stay inside that grid.
    const svg = container.querySelector('svg');
    expect(svg!.getAttribute('viewBox')).toBe('0 0 100 32');
  });

  it('Faz 21.10 wave 3: line stroke gets vector-effect="non-scaling-stroke" only in auto mode', () => {
    const { container: autoC } = render(
      <SparklineChart data={sampleData} type="line" width="auto" />,
    );
    const autoLine = autoC.querySelector('polyline');
    // React renders the JSX `vectorEffect` prop as the DOM attribute
    // `vector-effect` (kebab-case). querying by either getAttribute name
    // is normalized to lowercase by jsdom.
    expect(autoLine!.getAttribute('vector-effect')).toBe('non-scaling-stroke');

    const { container: fixedC } = render(<SparklineChart data={sampleData} type="line" />);
    const fixedLine = fixedC.querySelector('polyline');
    expect(fixedLine!.getAttribute('vector-effect')).toBeNull();
  });

  /* ---------- Faz 21.10 wave 5: fluid height ---------- */

  it('Faz 21.10 wave 5: height="auto" renders SVG with height=100% + h-full root + numeric width grid', () => {
    const { container } = render(<SparklineChart data={sampleData} width={120} height="auto" />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain('inline-block');
    expect(root.className).toContain('h-full');
    expect(root.style.height).toBe('');
    expect(root.style.width).toBe('120px');

    const svg = container.querySelector('svg');
    expect(svg!.getAttribute('width')).toBe('120');
    expect(svg!.getAttribute('height')).toBe('100%');
    expect(svg!.getAttribute('viewBox')).toBe('0 0 120 32');
    expect(svg!.getAttribute('preserveAspectRatio')).toBe('none');
  });

  it('Faz 21.10 wave 5: width="auto" + height="auto" renders fully fluid SVG', () => {
    const { container } = render(<SparklineChart data={sampleData} width="auto" height="auto" />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain('block');
    expect(root.className).toContain('w-full');
    expect(root.className).toContain('h-full');
    expect(root.style.width).toBe('');
    expect(root.style.height).toBe('');

    const svg = container.querySelector('svg');
    expect(svg!.getAttribute('width')).toBe('100%');
    expect(svg!.getAttribute('height')).toBe('100%');
    expect(svg!.getAttribute('viewBox')).toBe('0 0 100 32');
    expect(svg!.getAttribute('preserveAspectRatio')).toBe('none');
  });

  it('Faz 21.10 wave 5: vector-effect activates when only height is auto', () => {
    const { container } = render(
      <SparklineChart data={sampleData} type="line" width={120} height="auto" />,
    );
    const line = container.querySelector('polyline');
    expect(line!.getAttribute('vector-effect')).toBe('non-scaling-stroke');
  });

  it('Faz 21.10 wave 5: empty data + height="auto" keeps fluid root sizing', () => {
    const { container } = render(<SparklineChart data={[]} width={120} height="auto" />);
    const empty = container.querySelector('[data-testid="sparkline-chart-empty"]') as HTMLElement;
    expect(empty).toBeTruthy();
    expect(empty.className).toContain('inline-block');
    expect(empty.className).toContain('h-full');
    expect(empty.style.width).toBe('120px');
    expect(empty.style.height).toBe('');
  });
});
