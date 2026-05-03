/**
 * Event-agnostic guard for chart-level interaction callbacks.
 *
 * Returns the original handler when access is `'full'`, `undefined`
 * otherwise. This lets the chart wrapper pass the result straight
 * through to ECharts (`onClick={guarded}`) — when blocked, ECharts
 * receives `undefined` and never installs the listener at all
 * (no cursor: pointer, no hover ripple, no event allocation).
 *
 * This is intentionally NOT the DOM-coupled `withAccessGuard` from
 * `@mfe/design-system/internal/access-controller` — that helper expects
 * a `React.SyntheticEvent` and calls `preventDefault()` /
 * `stopPropagation()`. ECharts callbacks receive bare ECharts param
 * objects, not synthetic events; trying to call `preventDefault` on
 * those would crash. The two helpers solve different problems:
 *
 * - `withAccessGuard` — DOM events, suppresses bubbling
 * - `guardChartCallback` — non-DOM callbacks, suppresses installation
 *
 * Usage:
 *
 * ```tsx
 * const { state } = resolveAccessState(access);
 * <BarChartInner onDataPointClick={guardChartCallback(state, onDataPointClick)} />
 * ```
 *
 * Type signature uses `any[]` because ECharts callbacks have many
 * shapes (ECElementEvent, brush params, mouseup params, etc.) and a
 * stricter `unknown[]` would force the consumer to cast at every
 * site. The eslint-disable is local and defensible — the function
 * itself never inspects the args.
 */
import type { AccessLevel } from '@mfe/shared-types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function guardChartCallback<T extends (...args: any[]) => unknown>(
  state: AccessLevel,
  handler: T | undefined,
): T | undefined {
  return handler && state === 'full' ? handler : undefined;
}
