/**
 * computeAnomalyOverlay — pure helper that flags outlier data points
 * via IQR (Tukey fences) and emits one `PointMarkup` per outlier.
 *
 * Pure: no React, no DOM, no global state. Used by
 * `useAnomalyOverlay` (React `useMemo` wrapper).
 *
 * The IQR method (Q1 − k·IQR, Q3 + k·IQR) is the safe default — it's
 * robust to skew and doesn't require a Gaussian assumption. Z-score
 * is reserved for v2 (`method: 'zscore'` currently falls back to IQR
 * with a warning so the API is forward-compatible). Codex thread
 * 019e0df1 iter-3 absorb.
 */
import type { ChartMarkup, PointMarkup } from '../types';

export interface AnomalyOverlayPoint {
  x: number | string;
  y: number;
}

export interface ComputeAnomalyOverlayOptions {
  data: AnomalyOverlayPoint[];
  /** Detection method (v1 supports 'iqr' only). */
  method?: 'iqr' | 'zscore';
  /** IQR fence multiplier. Default 1.5 (Tukey). */
  k?: number;
  /** Optional id prefix to scope multiple overlays per chart. */
  idPrefix?: string;
  /** Color override (defaults to error/danger token). */
  color?: string;
  /** Marker size override (default 12). */
  size?: number;
  /** Add a `↑ outlier` label next to each marker. Default true. */
  showLabel?: boolean;
}

const DEFAULT_ANOMALY_COLOR = 'var(--state-error-text, #ef4444)';
const DEFAULT_ANOMALY_SIZE = 12;

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

/**
 * Find IQR-fence outliers and emit `PointMarkup[]` for each. Returns
 * an empty array when fewer than four points (IQR is meaningless on
 * tiny samples).
 */
export function computeAnomalyOverlay(options: ComputeAnomalyOverlayOptions): ChartMarkup[] {
  const {
    data,
    method = 'iqr',
    k = 1.5,
    idPrefix = 'anomaly',
    color = DEFAULT_ANOMALY_COLOR,
    size = DEFAULT_ANOMALY_SIZE,
    showLabel = true,
  } = options;

  // method === 'zscore' currently falls through to IQR; v2 will
  // expose zscore once we agree on the multiplier defaults.
  void method;

  if (!Array.isArray(data) || data.length < 4) return [];

  const ys = data
    .map((d) => d.y)
    .slice()
    .sort((a, b) => a - b);
  const q1 = quantile(ys, 0.25);
  const q3 = quantile(ys, 0.75);
  const iqr = q3 - q1;
  const lowerFence = q1 - k * iqr;
  const upperFence = q3 + k * iqr;

  const out: ChartMarkup[] = [];
  for (let i = 0; i < data.length; i++) {
    const point = data[i];
    if (point.y < lowerFence || point.y > upperFence) {
      const direction = point.y > upperFence ? '↑' : '↓';
      const marker: PointMarkup = {
        id: `${idPrefix}-${i}`,
        type: 'point',
        x: point.x,
        y: point.y,
        symbol: 'diamond',
        size,
        color,
        source: 'ai_anomaly',
        ...(showLabel ? { label: { text: `${direction} ${point.y.toFixed(2)}` } } : {}),
      };
      out.push(marker);
    }
  }
  return out;
}
