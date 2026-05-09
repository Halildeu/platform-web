 
/**
 * devWarn — single-line `console.warn` wrapper isolated in its own
 * file so the rest of the markup-adapter code can stay
 * `no-console`-clean. Codex iter-3 absorb: pre-commit prettier kept
 * stripping the inline `eslint-disable-next-line` comment, leaving
 * stray whitespace; moving the call here removes the trigger
 * entirely.
 */
export function devWarn(message: string): void {
  console.warn(message);
}
