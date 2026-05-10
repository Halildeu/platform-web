// @vitest-environment jsdom
/**
 * ChartAriaLive — anomaly announcement contract.
 *
 * Faz 21.11 PR-A2b-a11y. Locks the new `anomalies` prop behaviour
 * Codex thread `019e1027` iter-1 mandated:
 *   - empty anomaly list → no announcement (default no-op,
 *     backwards compat)
 *   - debounced announcement after `anomalyDebounceMs` (1000 default)
 *   - identical anomaly signature does NOT re-announce (dedupe)
 *   - changed signature DOES re-announce
 *   - default formatter handles EN + TR singular/plural mixes
 *   - custom `formatAnomalyAnnouncement` overrides the template
 *   - dedicated SECOND `<div role="status">` for anomalies so chart
 *     update + anomaly stream don't smash each other
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ChartAriaLive } from '../ChartAriaLive';
import type { AnomalySummary } from '../../annotations/computeAnomalyOverlay';

const ANOM_A: AnomalySummary = {
  id: 'a-1',
  x: 'May',
  y: 100,
  formattedY: '100.00',
  direction: 'above',
  severity: 50,
  severityBucket: 'high',
  ariaLabel: 'Outlier above expected at x=May, y=100.00 (high severity)',
};

const ANOM_B: AnomalySummary = {
  id: 'a-2',
  x: 'Jun',
  y: 5,
  formattedY: '5.00',
  direction: 'below',
  severity: 10,
  severityBucket: 'medium',
  ariaLabel: 'Outlier below expected at x=Jun, y=5.00 (medium severity)',
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function flush(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('ChartAriaLive — anomaly announcement (PR-A2b-a11y)', () => {
  it('does NOT mount the anomaly region when the `anomalies` prop is omitted (backwards compat)', () => {
    render(<ChartAriaLive message="" />);
    expect(screen.queryByTestId('chart-aria-live-anomalies')).not.toBeInTheDocument();
    // Existing `getByRole("status")` callers see exactly one region.
    const liveRegions = document.querySelectorAll('[role="status"]');
    expect(liveRegions.length).toBe(1);
  });

  it('mounts an empty anomaly region when `anomalies=[]` (opt-in, no announcement)', () => {
    render(<ChartAriaLive message="" anomalies={[]} />);
    flush(2000);
    const region = screen.getByTestId('chart-aria-live-anomalies');
    expect(region.textContent).toBe('');
  });

  it('fires a debounced announcement after anomalyDebounceMs (default 1000ms)', () => {
    render(<ChartAriaLive message="" anomalies={[ANOM_A]} />);
    // No announcement before the debounce window.
    flush(500);
    expect(screen.getByTestId('chart-aria-live-anomalies').textContent).toBe('');
    // After the debounce + the rAF the live region picks up the message.
    flush(600);
    // Still need to flush the rAF — vitest fake timers handle it.
    act(() => {
      vi.runAllTimers();
    });
    expect(screen.getByTestId('chart-aria-live-anomalies').textContent).toMatch(/1 outlier/);
  });

  it('default EN formatter announces count + direction breakdown + most extreme', () => {
    render(<ChartAriaLive message="" anomalies={[ANOM_A, ANOM_B]} locale="en" />);
    act(() => {
      vi.runAllTimers();
    });
    const text = screen.getByTestId('chart-aria-live-anomalies').textContent ?? '';
    expect(text).toMatch(/2 outliers/);
    expect(text).toMatch(/1 above and 1 below/);
    // Codex iter-2 §P2: "Most extreme" (severity-ranked), NOT
    // "Highest" (y-ranked). ANOM_A.severity=50 > ANOM_B.severity=10
    // so ANOM_A wins.
    expect(text).toMatch(/Most extreme:.*y=100\.00/);
    expect(text).not.toMatch(/Highest/);
  });

  it('Codex iter-2 P2 — low-fence outlier with highest severity is announced as "Most extreme" (not "Highest")', () => {
    // Below-fence outlier with much higher severity than the
    // above-fence one. The previous "Highest" copy would have
    // factually mis-announced y=1 as the highest value.
    const lowSevereAnom: AnomalySummary = {
      id: 'low-1',
      x: 'Mar',
      y: 1,
      formattedY: '1.00',
      direction: 'below',
      severity: 999, // bigger than ANOM_A.severity = 50
      severityBucket: 'high',
      ariaLabel: 'Outlier below expected at x=Mar, y=1.00 (high severity)',
    };
    render(<ChartAriaLive message="" anomalies={[ANOM_A, lowSevereAnom]} locale="en" />);
    act(() => {
      vi.runAllTimers();
    });
    const text = screen.getByTestId('chart-aria-live-anomalies').textContent ?? '';
    expect(text).toMatch(/Most extreme:.*y=1\.00/); // low-fence wins on severity
    expect(text).not.toMatch(/Highest/);
  });

  it('default TR formatter announces in Turkish for tr-TR locale', () => {
    render(<ChartAriaLive message="" anomalies={[ANOM_A, ANOM_B]} locale="tr-TR" />);
    act(() => {
      vi.runAllTimers();
    });
    const text = screen.getByTestId('chart-aria-live-anomalies').textContent ?? '';
    expect(text).toMatch(/2 aykırı değer/);
    expect(text).toMatch(/üstte ve.*altta/);
    expect(text).toMatch(/En uç:.*y=100\.00/);
  });

  it('honours custom formatAnomalyAnnouncement override', () => {
    const fmt = vi.fn(() => 'CUSTOM ANNOUNCEMENT');
    render(<ChartAriaLive message="" anomalies={[ANOM_A]} formatAnomalyAnnouncement={fmt} />);
    act(() => {
      vi.runAllTimers();
    });
    expect(fmt).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('chart-aria-live-anomalies').textContent).toBe('CUSTOM ANNOUNCEMENT');
  });

  it('dedupes identical signatures — same anomaly set re-rendered does NOT re-announce', () => {
    const fmt = vi.fn(() => 'X');
    const { rerender } = render(
      <ChartAriaLive message="" anomalies={[ANOM_A]} formatAnomalyAnnouncement={fmt} />,
    );
    act(() => {
      vi.runAllTimers();
    });
    expect(fmt).toHaveBeenCalledTimes(1);
    // Re-render with the SAME content but a fresh array identity.
    rerender(
      <ChartAriaLive message="" anomalies={[{ ...ANOM_A }]} formatAnomalyAnnouncement={fmt} />,
    );
    act(() => {
      vi.runAllTimers();
    });
    expect(fmt).toHaveBeenCalledTimes(1); // still 1 — dedupe held
  });

  it('re-announces when the anomaly signature changes (different y)', () => {
    const fmt = vi.fn(() => 'X');
    const { rerender } = render(
      <ChartAriaLive message="" anomalies={[ANOM_A]} formatAnomalyAnnouncement={fmt} />,
    );
    act(() => {
      vi.runAllTimers();
    });
    rerender(
      <ChartAriaLive
        message=""
        anomalies={[{ ...ANOM_A, y: 200, formattedY: '200.00', severity: 80 }]}
        formatAnomalyAnnouncement={fmt}
      />,
    );
    act(() => {
      vi.runAllTimers();
    });
    expect(fmt).toHaveBeenCalledTimes(2); // sig changed → re-announce
  });

  it('renders TWO live regions — base message + dedicated anomaly region', () => {
    render(<ChartAriaLive message="Hello" anomalies={[ANOM_A]} />);
    const liveRegions = document.querySelectorAll('[role="status"]');
    expect(liveRegions.length).toBe(2);
  });

  it('both live regions are sr-only (visually hidden)', () => {
    render(<ChartAriaLive message="Hello" anomalies={[ANOM_A]} />);
    const liveRegions = document.querySelectorAll('[role="status"]');
    for (const region of liveRegions) {
      expect((region as HTMLElement).className).toContain('sr-only');
    }
  });
});
