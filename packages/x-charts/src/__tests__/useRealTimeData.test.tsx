// @vitest-environment jsdom
/**
 * useRealTimeData — Faz 21.8 PR-X1.
 *
 * Mutation discipline (each assertion would fail under a plausible mutation):
 *   - "drop tickIntervalMs effect"     → autoTickFillsBuffer (count stays at 0)
 *   - "drop pausedRef gate in addPoint"→ pauseStopsBufferGrow (count grows past pause)
 *   - "drop clearInterval cleanup"     → resumeAfterPauseTickAgain (interval leaks
 *                                          under fake timers between pause/resume)
 *   - "ignore onTick undefined return" → onTickUndefinedSkipsPush (count > 0)
 *   - "drop assertion on negative ms"  → negativeIntervalThrowsInDev (no error)
 *
 * Notes:
 *   - We use vi.useFakeTimers() everywhere so the interval is deterministic.
 *   - Tests rely on React act() + advanceTimersByTime to flush both the
 *     interval callback and the React state update inside `addPoint`.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

import {
  useRealTimeData,
  type RealTimeDataOptions,
  type RealTimeDataOptionsAutoTick,
} from '../useRealTimeData';

interface Tick {
  t: number;
  v: number;
}

const Probe: React.FC<{ options: RealTimeDataOptions<Tick> }> = ({ options }) => {
  const stream = useRealTimeData<Tick>(options);
  return (
    <div>
      <span data-testid="count">{stream.data.length}</span>
      <span data-testid="paused">{String(stream.isPaused)}</span>
      <button data-testid="pause" onClick={stream.pause} type="button">
        pause
      </button>
      <button data-testid="resume" onClick={stream.resume} type="button">
        resume
      </button>
      <button data-testid="add" onClick={() => stream.addPoint({ t: 0, v: 1 })} type="button">
        add
      </button>
    </div>
  );
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/* ================================================================== */
/*  Auto-tick mode (Faz 21.8 PR-X1)                                   */
/* ================================================================== */

describe('useRealTimeData — auto-tick mode', () => {
  it('autoTickFillsBuffer: tickIntervalMs + onTick → buffer fills deterministically', () => {
    let counter = 0;
    const onTick = (): Tick => ({ t: counter, v: counter++ });

    render(
      <Probe
        options={{
          maxPoints: 50,
          tickIntervalMs: 100,
          onTick,
        }}
      />,
    );

    // 0 ticks initially.
    expect(screen.getByTestId('count')).toHaveTextContent('0');

    // 5 × 100ms = 500ms → 5 ticks.
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByTestId('count')).toHaveTextContent('5');
  });

  it('onTickUndefinedSkipsPush: undefined return value skips the push', () => {
    let calls = 0;
    const onTick = (): Tick | undefined => {
      calls += 1;
      return calls % 2 === 0 ? { t: calls, v: calls } : undefined;
    };

    render(
      <Probe
        options={{
          maxPoints: 50,
          tickIntervalMs: 100,
          onTick,
        }}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(400); // 4 ticks: skip, push, skip, push.
    });
    // 4 calls total, 2 pushes.
    expect(calls).toBe(4);
    expect(screen.getByTestId('count')).toHaveTextContent('2');
  });

  it('pauseStopsBufferGrow: pause() halts the interval-driven push', () => {
    const onTick = vi.fn(() => ({ t: 0, v: 0 }));
    render(<Probe options={{ maxPoints: 50, tickIntervalMs: 100, onTick }} />);

    act(() => {
      vi.advanceTimersByTime(300); // 3 ticks.
    });
    expect(screen.getByTestId('count')).toHaveTextContent('3');

    fireEvent.click(screen.getByTestId('pause'));
    expect(screen.getByTestId('paused')).toHaveTextContent('true');

    act(() => {
      vi.advanceTimersByTime(500); // would be 5 more ticks if not paused.
    });
    expect(screen.getByTestId('count')).toHaveTextContent('3'); // frozen
  });

  it('resumeAfterPauseTickAgain: resume() restarts the interval (single owner)', () => {
    const onTick = vi.fn(() => ({ t: 0, v: 0 }));
    render(<Probe options={{ maxPoints: 50, tickIntervalMs: 100, onTick }} />);

    fireEvent.click(screen.getByTestId('pause'));
    act(() => {
      vi.advanceTimersByTime(500); // paused, no growth.
    });
    expect(screen.getByTestId('count')).toHaveTextContent('0');

    fireEvent.click(screen.getByTestId('resume'));
    expect(screen.getByTestId('paused')).toHaveTextContent('false');

    act(() => {
      vi.advanceTimersByTime(300); // 3 ticks.
    });
    // Crucial: only 3, not 8 — the paused interval was actually cleared.
    expect(screen.getByTestId('count')).toHaveTextContent('3');
  });
});

/* ================================================================== */
/*  Manual mode preserved                                              */
/* ================================================================== */

describe('useRealTimeData — manual mode (no auto-tick)', () => {
  it('manualMode: addPoint still works without tickIntervalMs', () => {
    render(<Probe options={{ maxPoints: 50 }} />);
    expect(screen.getByTestId('count')).toHaveTextContent('0');

    fireEvent.click(screen.getByTestId('add'));
    fireEvent.click(screen.getByTestId('add'));
    expect(screen.getByTestId('count')).toHaveTextContent('2');
  });

  it('noTickWithoutInterval: empty options never schedules a setInterval', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    render(<Probe options={{ maxPoints: 50 }} />);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });
});

/* ================================================================== */
/*  Dev-mode runtime assertions (Codex iter-3)                        */
/* ================================================================== */

describe('useRealTimeData — dev-mode runtime assertions', () => {
  it('negativeIntervalThrowsInDev: tickIntervalMs <= 0 throws (positive finite required)', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const onTick = () => ({ t: 0, v: 0 });
    expect(() =>
      render(
        <Probe
          options={
            {
              maxPoints: 50,
              // Cast — TypeScript would refuse this normally; we cast to
              // simulate a misconfigured caller (e.g. `as any` from JS).
              tickIntervalMs: -1,
              onTick,
            } as RealTimeDataOptionsAutoTick<Tick>
          }
        />,
      ),
    ).toThrow(/positive finite/);

    process.env.NODE_ENV = originalEnv;
    errSpy.mockRestore();
  });

  it('noThrowInProduction: same misconfig is silent in NODE_ENV=production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const onTick = () => ({ t: 0, v: 0 });
    expect(() =>
      render(
        <Probe
          options={
            {
              maxPoints: 50,
              tickIntervalMs: -1,
              onTick,
            } as RealTimeDataOptionsAutoTick<Tick>
          }
        />,
      ),
    ).not.toThrow();

    process.env.NODE_ENV = originalEnv;
  });
});
