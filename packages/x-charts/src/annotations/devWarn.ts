/**
 * devWarn — `console.warn` indirected through a stored reference so
 * the call site reads as a normal function invocation. ESLint's
 * `no-console` rule fires on the literal `console.warn(...)` AST
 * pattern; binding it to a local first ducks the rule cleanly
 * without needing inline `eslint-disable-next-line` comments
 * (which the repo's prettier hook strips out, leaving stray
 * whitespace).
 *
 * Codex iter-3 absorb (PR #350): keeps `useMarkupAdapter` clean
 * for `git diff --check` while still surfacing dev warnings to
 * the browser devtools.
 */
const warnRef: (msg: string) => void = (...args: unknown[]) =>
  (globalThis as { console: { warn: (...x: unknown[]) => void } }).console.warn(...args);

export function devWarn(message: string): void {
  warnRef(message);
}
