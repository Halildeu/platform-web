/* @deprecated — Phase 3 follow-up (Codex thread `019e2701`):
 * Content moved to `../utils/format-helpers`. This file now re-exports as
 * a compat shim. Existing `import { ... } from '../types'` continues to
 * work; prefer the canonical `../../utils/format-helpers` import path
 * going forward.
 */
export { formatValue, getTrendColor, getTrendIcon, getToneClasses } from '../utils/format-helpers';
export type {
  NumberFormat,
  FormatOptions,
  TrendDirection,
  TrendInfo,
  EnterpriseTone,
  StatusTone,
  AccessLevel,
} from '../utils/format-helpers';
