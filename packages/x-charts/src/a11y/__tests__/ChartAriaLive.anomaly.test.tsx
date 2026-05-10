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

// Faz 21.11 batch3 contract — domain-aware default formatter tests
// (Codex thread `019e10a5` iter-2). Each new `kind` selects a
// dedicated EN/TR template; legacy flat consumers (tests above)
// continue to receive the byte-identical pre-batch3 output.
describe('ChartAriaLive — domain-aware default formatter (batch3)', () => {
  it('legacy flat (no kind) — EN backwards-compat byte-identical output', () => {
    render(<ChartAriaLive message="" anomalies={[ANOM_A]} locale="en" />);
    act(() => {
      vi.runAllTimers();
    });
    const text = screen.getByTestId('chart-aria-live-anomalies').textContent ?? '';
    // Pre-batch3 template: "1 outlier detected (1 above expected range). Most extreme: x=May, y=100.00."
    expect(text).toMatch(/1 outlier detected/);
    expect(text).toMatch(/Most extreme: x=May/);
  });

  it('explicit kind: "flat" produces the same template as omitted kind', () => {
    const flatExplicit: AnomalySummary = { ...ANOM_A, kind: 'flat' };
    render(<ChartAriaLive message="" anomalies={[flatExplicit]} locale="en" />);
    act(() => {
      vi.runAllTimers();
    });
    const text = screen.getByTestId('chart-aria-live-anomalies').textContent ?? '';
    expect(text).toMatch(/1 outlier detected/);
    expect(text).toMatch(/Most extreme: x=May/);
  });

  it('kind: "radar" — EN announces indicator + series + axisUnit', () => {
    const radarAnom: AnomalySummary = {
      ...ANOM_A,
      kind: 'radar',
      seriesName: 'Q1 Performance',
      indicatorName: 'Latency',
      indicatorIndex: 2,
      axisUnit: 'ms',
    };
    render(<ChartAriaLive message="" anomalies={[radarAnom]} locale="en" />);
    act(() => {
      vi.runAllTimers();
    });
    const text = screen.getByTestId('chart-aria-live-anomalies').textContent ?? '';
    expect(text).toMatch(/radar indicator/);
    expect(text).toMatch(/Q1 Performance/);
    expect(text).toMatch(/Latency=100\.00 ms/);
  });

  it('kind: "radar" — TR localised', () => {
    const radarAnom: AnomalySummary = {
      ...ANOM_A,
      kind: 'radar',
      seriesName: 'Q1',
      indicatorName: 'Gecikme',
      axisUnit: 'ms',
    };
    render(<ChartAriaLive message="" anomalies={[radarAnom]} locale="tr-TR" />);
    act(() => {
      vi.runAllTimers();
    });
    const text = screen.getByTestId('chart-aria-live-anomalies').textContent ?? '';
    expect(text).toMatch(/radar gösterge anomalisi/);
    expect(text).toMatch(/Gecikme=100\.00/);
  });

  it('kind: "hierarchical" — EN announces breadcrumb path', () => {
    const hierAnom: AnomalySummary = {
      ...ANOM_A,
      kind: 'hierarchical',
      path: ['Region', 'Team', 'Segment'],
      depth: 3,
    };
    render(<ChartAriaLive message="" anomalies={[hierAnom]} locale="en" />);
    act(() => {
      vi.runAllTimers();
    });
    const text = screen.getByTestId('chart-aria-live-anomalies').textContent ?? '';
    expect(text).toMatch(/hierarchy anomaly/);
    expect(text).toMatch(/Region > Team > Segment/);
    expect(text).toMatch(/value 100\.00/);
  });

  it('kind: "hierarchical" — TR localised', () => {
    const hierAnom: AnomalySummary = {
      ...ANOM_A,
      kind: 'hierarchical',
      path: ['Bölge', 'Takım'],
    };
    render(<ChartAriaLive message="" anomalies={[hierAnom]} locale="tr-TR" />);
    act(() => {
      vi.runAllTimers();
    });
    const text = screen.getByTestId('chart-aria-live-anomalies').textContent ?? '';
    expect(text).toMatch(/hiyerarşi anomalisi/);
    expect(text).toMatch(/Bölge > Takım/);
  });

  it('kind: "sankey-edge" — EN announces source → target', () => {
    const edgeAnom: AnomalySummary = {
      ...ANOM_A,
      kind: 'sankey-edge',
      source: 'Visit',
      target: 'Purchase',
      flowValue: 100,
    };
    render(<ChartAriaLive message="" anomalies={[edgeAnom]} locale="en" />);
    act(() => {
      vi.runAllTimers();
    });
    const text = screen.getByTestId('chart-aria-live-anomalies').textContent ?? '';
    expect(text).toMatch(/flow anomaly/);
    expect(text).toMatch(/Visit → Purchase/);
    expect(text).toMatch(/flow 100\.00/);
  });

  it('kind: "sankey-node" — EN announces nodeId', () => {
    const nodeAnom: AnomalySummary = {
      ...ANOM_A,
      kind: 'sankey-node',
      nodeId: 'Node-X',
    };
    render(<ChartAriaLive message="" anomalies={[nodeAnom]} locale="en" />);
    act(() => {
      vi.runAllTimers();
    });
    const text = screen.getByTestId('chart-aria-live-anomalies').textContent ?? '';
    expect(text).toMatch(/node flow anomaly/);
    expect(text).toMatch(/Node-X/);
    expect(text).toMatch(/flow-through 100\.00/);
  });

  // Codex thread `019e10a5` iter-3 — mixed-kind fallback. Tek chart
  // tek kind üretir varsayımı; mixed batch (radar + hierarchical) flat
  // template'ine düşer ki yanlış domain announcement çıkmasın.
  it('mixed kind batch — falls back to flat template (Codex iter-3)', () => {
    const radarAnom: AnomalySummary = {
      ...ANOM_A,
      kind: 'radar',
      seriesName: 'Q1',
      indicatorName: 'Latency',
    };
    const hierAnom: AnomalySummary = {
      ...ANOM_B,
      kind: 'hierarchical',
      path: ['Region', 'Team'],
    };
    render(<ChartAriaLive message="" anomalies={[radarAnom, hierAnom]} locale="en" />);
    act(() => {
      vi.runAllTimers();
    });
    const text = screen.getByTestId('chart-aria-live-anomalies').textContent ?? '';
    // Should NOT pick the radar branch (would say "indicator anomalies").
    expect(text).not.toMatch(/radar indicator/);
    expect(text).not.toMatch(/hierarchy anomaly/);
    // Should use the flat template ("X outliers detected ...").
    expect(text).toMatch(/2 outliers detected/);
    expect(text).toMatch(/Most extreme: x=May/);
  });

  it('kind: "3d" reserved — EN uses ariaLabel as the most-extreme detail', () => {
    const threeDAnom: AnomalySummary = {
      ...ANOM_A,
      kind: '3d',
      ariaLabel: 'Outlier at (x=10, y=20, z=30)',
    };
    render(<ChartAriaLive message="" anomalies={[threeDAnom]} locale="en" />);
    act(() => {
      vi.runAllTimers();
    });
    const text = screen.getByTestId('chart-aria-live-anomalies').textContent ?? '';
    expect(text).toMatch(/3D anomaly/);
    expect(text).toMatch(/Outlier at \(x=10, y=20, z=30\)/);
  });
});

// Codex iter-2 hardening — anomalySignature extension regression: a
// metadata-only change MUST trigger re-announcement. Two anomaly
// payloads that differ only in `seriesName` / `path` / `nodeId` are
// semantically distinct events and the SR should hear both.
describe('ChartAriaLive — anomalySignature extension (batch3)', () => {
  // Codex thread `019e10a5` PR-Radar plan iter-1 — axisUnit signature
  // gap fix. Formatter announces "<value> <unit>"; if axisUnit changes
  // (e.g. ms → s migration), the SR text changes but old signature
  // would dedupe it away. Signature must include axisUnit.
  it('different axisUnit on radar anomalies re-announces (signature ext)', () => {
    const fmt = vi.fn(() => 'X');
    const a1: AnomalySummary = {
      ...ANOM_A,
      kind: 'radar',
      indicatorName: 'Latency',
      axisUnit: 'ms',
    };
    const a2: AnomalySummary = {
      ...ANOM_A,
      kind: 'radar',
      indicatorName: 'Latency',
      axisUnit: 's',
    };
    const { rerender } = render(
      <ChartAriaLive message="" anomalies={[a1]} formatAnomalyAnnouncement={fmt} />,
    );
    act(() => {
      vi.runAllTimers();
    });
    expect(fmt).toHaveBeenCalledTimes(1);
    rerender(<ChartAriaLive message="" anomalies={[a2]} formatAnomalyAnnouncement={fmt} />);
    act(() => {
      vi.runAllTimers();
    });
    expect(fmt).toHaveBeenCalledTimes(2);
  });

  it('different seriesName on radar anomalies re-announces', () => {
    const fmt = vi.fn(() => 'X');
    const a1: AnomalySummary = { ...ANOM_A, kind: 'radar', seriesName: 'Q1' };
    const a2: AnomalySummary = { ...ANOM_A, kind: 'radar', seriesName: 'Q2' };
    const { rerender } = render(
      <ChartAriaLive message="" anomalies={[a1]} formatAnomalyAnnouncement={fmt} />,
    );
    act(() => {
      vi.runAllTimers();
    });
    expect(fmt).toHaveBeenCalledTimes(1);
    rerender(<ChartAriaLive message="" anomalies={[a2]} formatAnomalyAnnouncement={fmt} />);
    act(() => {
      vi.runAllTimers();
    });
    expect(fmt).toHaveBeenCalledTimes(2);
  });

  it('legacy flat anomaly (no metadata) preserves dedupe — same id+severity does NOT re-announce', () => {
    const fmt = vi.fn(() => 'X');
    const { rerender } = render(
      <ChartAriaLive message="" anomalies={[ANOM_A]} formatAnomalyAnnouncement={fmt} />,
    );
    act(() => {
      vi.runAllTimers();
    });
    expect(fmt).toHaveBeenCalledTimes(1);
    rerender(
      <ChartAriaLive message="" anomalies={[{ ...ANOM_A }]} formatAnomalyAnnouncement={fmt} />,
    );
    act(() => {
      vi.runAllTimers();
    });
    expect(fmt).toHaveBeenCalledTimes(1); // still 1 — backwards compat
  });
});
