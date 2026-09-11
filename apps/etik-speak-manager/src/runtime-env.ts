/**
 * Build-time runtime env for the manager bundle (platform-web#1155).
 *
 * The design system reads `window.__env__` in the browser
 * (packages/design-system/src/lib/ag-grid-license.ts); its `process.env` branch is
 * guarded by `typeof process !== 'undefined'`, which a Vite `define` of `process.env`
 * cannot satisfy — the browser has no `process` global. So, like the platform shell,
 * the key is written into index.html's `window.__env__` shim at build time.
 *
 * Explicit allowlist: only the AG Grid licence key (public by design — it ships in
 * the client bundle) crosses from the build host into the page. Nothing else that
 * happens to be exported as VITE_* on a CI runner or a developer machine leaks in.
 */
export const RUNTIME_ENV_ALLOWLIST = ['VITE_AG_GRID_LICENSE_KEY'] as const;

const SHIM = 'window.__env__ = window.__env__ || {};';

export function buildRuntimeEnv(env: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of RUNTIME_ENV_ALLOWLIST) {
    const value = env[key];
    if (typeof value === 'string' && value.trim() !== '') out[key] = value;
  }
  return out;
}

export function injectRuntimeEnv(html: string, runtimeEnv: Record<string, string>): string {
  if (!html.includes(SHIM)) {
    throw new Error(`index.html is missing the runtime env shim: ${SHIM}`);
  }
  return html.replace(SHIM, `window.__env__ = Object.assign({}, ${JSON.stringify(runtimeEnv)});`);
}
