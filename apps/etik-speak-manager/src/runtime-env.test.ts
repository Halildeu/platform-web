import { describe, expect, it } from 'vitest';
import { buildRuntimeEnv, runtimeEnvFileName, runtimeEnvPlugin, runtimeEnvSource } from './runtime-env';

/**
 * platform-web#1155 — the manager bundle never carried the AG Grid licence key, so
 * every grid printed the Enterprise licence banner. The key has to reach the page
 * through window.__env__ (the only branch the design-system reader can take in a
 * browser, which has no `process` global), from a same-origin script file (the CSP is
 * `script-src 'self'`, so no inline script), and nothing else may ride along.
 */
describe('manager runtime env', () => {
  it('passes only the allowlisted licence key, never other VITE_* or host variables', () => {
    const env = buildRuntimeEnv({
      VITE_AG_GRID_LICENSE_KEY: 'licence-sentinel',
      VITE_UNRELATED: 'must-not-leak',
      GITHUB_TOKEN: 'must-not-leak',
      HOME: '/home/runner',
    });
    expect(env).toEqual({ VITE_AG_GRID_LICENSE_KEY: 'licence-sentinel' });
  });

  it('drops an empty or blank licence key so the reader falls back to "no licence"', () => {
    expect(buildRuntimeEnv({ VITE_AG_GRID_LICENSE_KEY: '' })).toEqual({});
    expect(buildRuntimeEnv({ VITE_AG_GRID_LICENSE_KEY: '   ' })).toEqual({});
    expect(buildRuntimeEnv({})).toEqual({});
  });

  it('emits a script a browser without `process` can run, merging into window.__env__', () => {
    const source = runtimeEnvSource({ VITE_AG_GRID_LICENSE_KEY: 'licence-sentinel' });
    const win: { __env__?: Record<string, string> } = { __env__: { EXISTING: 'kept' } };
    new Function('window', source)(win);
    expect(win.__env__).toEqual({ EXISTING: 'kept', VITE_AG_GRID_LICENSE_KEY: 'licence-sentinel' });
  });

  it('names the asset by content under /assets/ so the immutable cache policy is safe', () => {
    const a = runtimeEnvFileName(runtimeEnvSource({ VITE_AG_GRID_LICENSE_KEY: 'a' }));
    const b = runtimeEnvFileName(runtimeEnvSource({ VITE_AG_GRID_LICENSE_KEY: 'b' }));
    expect(a).toMatch(/^assets\/runtime-env-[0-9a-f]{8}\.js$/u);
    expect(a).not.toBe(b);
    expect(runtimeEnvFileName(runtimeEnvSource({ VITE_AG_GRID_LICENSE_KEY: 'a' }))).toBe(a);
  });

  it('injects an external <script src> under the app base instead of an inline script (CSP script-src self)', () => {
    const plugin = runtimeEnvPlugin({ VITE_AG_GRID_LICENSE_KEY: 'licence-sentinel' }) as unknown as {
      configResolved: (c: { base: string }) => void;
      transformIndexHtml: () => Array<{ tag: string; attrs: { src: string }; injectTo: string }>;
      generateBundle: (this: { emitFile: (f: unknown) => void }) => void;
    };
    plugin.configResolved({ base: '/ethic/' });
    const tags = plugin.transformIndexHtml();
    expect(tags).toHaveLength(1);
    expect(tags[0].tag).toBe('script');
    expect(tags[0].injectTo).toBe('head-prepend');
    expect(tags[0].attrs.src).toMatch(/^\/ethic\/assets\/runtime-env-[0-9a-f]{8}\.js$/u);
    expect(tags[0]).not.toHaveProperty('children');

    const emitted: Array<{ type: string; fileName: string; source: string }> = [];
    plugin.generateBundle.call({ emitFile: (f) => emitted.push(f as (typeof emitted)[number]) });
    expect(emitted).toHaveLength(1);
    expect(`/ethic/${emitted[0].fileName}`).toBe(tags[0].attrs.src);
    expect(emitted[0].source).toContain('"VITE_AG_GRID_LICENSE_KEY":"licence-sentinel"');
  });
});
