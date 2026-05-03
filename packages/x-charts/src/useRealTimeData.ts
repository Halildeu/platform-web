import { useState, useCallback, useRef, useEffect } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/**
 * Common options shared by both manual and auto-tick modes.
 */
interface RealTimeDataOptionsCommon<T> {
  /** Maximum number of data points to retain (circular buffer). @default 500 */
  maxPoints?: number;
  /** Called each time a new point is added. */
  onNewPoint?: (point: T) => void;
}

/**
 * Manual mode — caller pushes points via `addPoint`/`addPoints`.
 *
 * `tickIntervalMs` and `onTick` MUST both be `undefined` in this mode.
 * The discriminated union ensures TypeScript rejects half-configured
 * auto-tick options at compile time.
 */
export interface RealTimeDataOptionsBase<T> extends RealTimeDataOptionsCommon<T> {
  tickIntervalMs?: undefined;
  onTick?: undefined;
}

/**
 * Auto-tick mode — hook owns a setInterval that calls `onTick()` and pushes
 * the returned point. Both `tickIntervalMs` (positive finite ms) and `onTick`
 * (producer) are required together.
 *
 * If `pause()` is called the interval is suspended; `resume()` restarts it.
 *
 * Faz 21.8 PR-X1: prior to this PR `interval` was declared on the type but
 * the hook body never destructured or read it — fake API. Renamed to
 * `tickIntervalMs` for clarity and made part of a discriminated union with
 * `onTick` so neither can be set without the other.
 */
export interface RealTimeDataOptionsAutoTick<T> extends RealTimeDataOptionsCommon<T> {
  /** Interval in milliseconds between auto-ticks. Must be a positive finite number. */
  tickIntervalMs: number;
  /** Producer called on each tick. Return `undefined` to skip a tick. */
  onTick: () => T | undefined;
}

export type RealTimeDataOptions<T> = RealTimeDataOptionsBase<T> | RealTimeDataOptionsAutoTick<T>;

export interface RealTimeDataState<T> {
  /** Current buffered data. */
  data: T[];
  /** Append a single point (evicts oldest if over maxPoints). */
  addPoint: (point: T) => void;
  /** Append many points at once. */
  addPoints: (points: T[]) => void;
  /** Clear all data. */
  clear: () => void;
  /** Whether the stream is paused. */
  isPaused: boolean;
  /** Pause: stops accepting new points and pauses the auto-interval. */
  pause: () => void;
  /** Resume: accepts points again and restarts the auto-interval. */
  resume: () => void;
}

/* ------------------------------------------------------------------ */
/*  Type guard                                                         */
/* ------------------------------------------------------------------ */

/**
 * User-defined type guard — narrows `RealTimeDataOptions<T>` to the
 * auto-tick branch by checking `tickIntervalMs` is a number.
 *
 * Because the base branch declares `tickIntervalMs?: undefined`, accessing
 * the property on the union is type-safe without a cast.
 */
function hasAutoTick<T>(
  options: RealTimeDataOptions<T>,
): options is RealTimeDataOptionsAutoTick<T> {
  return typeof options.tickIntervalMs === 'number';
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

/**
 * Manages a capped circular buffer of data points suitable for
 * real-time / streaming chart visualisations.
 *
 * Two modes (discriminated union):
 *
 * - **Manual** (default) — caller pushes points via `addPoint` / `addPoints`.
 * - **Auto-tick** — supply `tickIntervalMs` + `onTick`, the hook owns a
 *   `setInterval` that calls `onTick()` and pushes the returned point.
 *
 * Works standalone — no charting library dependency.
 */
export function useRealTimeData<T>(
  options: RealTimeDataOptions<T> = {} as RealTimeDataOptionsBase<T>,
): RealTimeDataState<T> {
  const { maxPoints = 500, onNewPoint } = options;
  const autoTick = hasAutoTick(options) ? options : null;
  const tickIntervalMs = autoTick?.tickIntervalMs;

  // Store the buffer in a ref for O(1) push; mirror to state for re-renders
  const bufferRef = useRef<T[]>([]);
  const [data, setData] = useState<T[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const pausedRef = useRef(false);

  // Keep callback refs stable so setInterval doesn't reset on every render
  const onNewPointRef = useRef(onNewPoint);
  onNewPointRef.current = onNewPoint;

  const onTickRef = useRef<RealTimeDataOptionsAutoTick<T>['onTick'] | undefined>(autoTick?.onTick);
  onTickRef.current = autoTick?.onTick;

  const maxRef = useRef(maxPoints);
  maxRef.current = maxPoints;

  const flush = useCallback(() => {
    setData([...bufferRef.current]);
  }, []);

  const addPoint = useCallback(
    (point: T) => {
      if (pausedRef.current) return;

      const buf = bufferRef.current;
      buf.push(point);

      // Evict oldest when over capacity
      if (buf.length > maxRef.current) {
        const excess = buf.length - maxRef.current;
        bufferRef.current = buf.slice(excess);
      }

      onNewPointRef.current?.(point);
      flush();
    },
    [flush],
  );

  const addPoints = useCallback(
    (points: T[]) => {
      if (pausedRef.current || points.length === 0) return;

      const buf = bufferRef.current;
      buf.push(...points);

      if (buf.length > maxRef.current) {
        const excess = buf.length - maxRef.current;
        bufferRef.current = buf.slice(excess);
      }

      // Fire callback for the last point only (perf)
      onNewPointRef.current?.(points[points.length - 1]);
      flush();
    },
    [flush],
  );

  const clear = useCallback(() => {
    bufferRef.current = [];
    setData([]);
  }, []);

  const pause = useCallback(() => {
    pausedRef.current = true;
    setIsPaused(true);
  }, []);

  const resume = useCallback(() => {
    pausedRef.current = false;
    setIsPaused(false);
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Auto-tick mode (Faz 21.8 PR-X1: previously declared but unused) */
  /* ---------------------------------------------------------------- */

  // Dev-only assertions — TypeScript already enforces shape at compile time,
  // but caller may pass `unknown` cast. These give a loud signal in dev.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    if (tickIntervalMs === undefined) return;
    if (!Number.isFinite(tickIntervalMs) || tickIntervalMs <= 0) {
      throw new Error('useRealTimeData: tickIntervalMs must be a positive finite number');
    }
    if (typeof onTickRef.current !== 'function') {
      throw new Error('useRealTimeData: tickIntervalMs requires onTick callback');
    }
  }, [tickIntervalMs]);

  useEffect(() => {
    if (tickIntervalMs === undefined) return;
    if (isPaused) return;

    const id = setInterval(() => {
      const point = onTickRef.current?.();
      if (point !== undefined) addPoint(point);
    }, tickIntervalMs);

    return () => clearInterval(id);
  }, [tickIntervalMs, isPaused, addPoint]);

  return { data, addPoint, addPoints, clear, isPaused, pause, resume };
}

export default useRealTimeData;
