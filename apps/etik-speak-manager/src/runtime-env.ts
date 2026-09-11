import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

/**
 * Build-time runtime env for the manager bundle (platform-web#1155).
 *
 * The design system reads `window.__env__` in the browser
 * (packages/design-system/src/lib/ag-grid-license.ts); its `process.env` branch is
 * guarded by `typeof process !== 'undefined'`, which a Vite `define` of `process.env`
 * cannot satisfy — the browser has no `process` global. And the manager's CSP is
 * `script-src 'self'` (security-headers.conf.inc), so the value cannot ride in an
 * inline `<script>` either. The allowlisted env is therefore emitted as a small
 * same-origin, content-hashed asset that index.html loads with `<script src>` before
 * the application module runs.
 *
 * Explicit allowlist: only the AG Grid licence key (public by design — it ships in
 * the client bundle) crosses from the build host into the page. Nothing else that
 * happens to be exported as VITE_* on a CI runner or a developer machine leaks in.
 */
export const RUNTIME_ENV_ALLOWLIST = ['VITE_AG_GRID_LICENSE_KEY'] as const;

export function buildRuntimeEnv(env: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of RUNTIME_ENV_ALLOWLIST) {
    const value = env[key];
    if (typeof value === 'string' && value.trim() !== '') out[key] = value;
  }
  return out;
}

/** The asset's JavaScript: merges into an existing `window.__env__`, never replaces it. */
export function runtimeEnvSource(runtimeEnv: Record<string, string>): string {
  return `window.__env__ = Object.assign({}, window.__env__ || {}, ${JSON.stringify(runtimeEnv)});\n`;
}

/** Content-hashed so nginx's immutable cache policy for /ethic/assets/ is safe. */
export function runtimeEnvFileName(source: string): string {
  const hash = createHash('sha256').update(source).digest('hex').slice(0, 8);
  return `assets/runtime-env-${hash}.js`;
}

export function runtimeEnvPlugin(env: Record<string, string | undefined>): Plugin {
  const source = runtimeEnvSource(buildRuntimeEnv(env));
  const fileName = runtimeEnvFileName(source);
  let base = '/';
  return {
    name: 'inject-runtime-env',
    configResolved(config) {
      base = config.base.endsWith('/') ? config.base : `${config.base}/`;
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName, source });
    },
    configureServer(server) {
      // Dev server: the asset is not on disk, serve it from memory at the same path.
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] === `${base}${fileName}`) {
          res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
          res.end(source);
          return;
        }
        next();
      });
    },
    transformIndexHtml() {
      // A classic (non-module) script at the top of <head>: it runs before the deferred module entry.
      return [{ tag: 'script', attrs: { src: `${base}${fileName}` }, injectTo: 'head-prepend' }];
    },
  };
}
