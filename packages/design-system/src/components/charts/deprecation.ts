/* ------------------------------------------------------------------ */
/*  Chart Shim Deprecation — runtime warn-once helper                  */
/*                                                                     */
/*  Faz 21.6 PR-C1: design-system chart entries are deprecated         */
/*  shims around `@mfe/x-charts`. The shims emit a single dev-only     */
/*  warning per chart name to nudge consumers toward the canonical    */
/*  import without polluting the console on every render.              */
/* ------------------------------------------------------------------ */

const warned = new Set<string>();

/**
 * Emit a console.warn message once per chart name in development.
 * No-op in production builds.
 *
 * @internal — exported only so the chart shim modules can call it.
 *   Not part of the public design-system API.
 */
export function warnDeprecatedChartOnce(name: string): void {
  if (process.env.NODE_ENV === 'production') return;
  if (warned.has(name)) return;
  warned.add(name);
   
  console.warn(`[design-system] ${name} is deprecated. Import from @mfe/x-charts instead.`);
}

/**
 * Test-only helper to reset the warn-once cache between test cases so
 * each test can independently assert the warning behavior.
 *
 * @internal
 */
export function __resetDeprecationCacheForTests(): void {
  warned.clear();
}
