import { describe, expect, it } from 'vitest';
import { buildRuntimeEnv, injectRuntimeEnv } from './runtime-env';

/**
 * platform-web#1155 — the manager bundle never carried the AG Grid licence key, so
 * every grid printed the Enterprise licence banner. The key has to reach the page
 * through window.__env__ (the only branch the design-system reader can take in a
 * browser, which has no `process` global), and nothing else may ride along.
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

  it('writes the env into the index.html shim where a browser without `process` reads it', () => {
    const html = '<script>window.__env__ = window.__env__ || {};</script><div id="root"></div>';
    const out = injectRuntimeEnv(html, { VITE_AG_GRID_LICENSE_KEY: 'licence-sentinel' });
    expect(out).toContain('window.__env__ = Object.assign({}, {"VITE_AG_GRID_LICENSE_KEY":"licence-sentinel"});');
    expect(out).not.toContain('window.__env__ || {}');

    // Execute the injected script the way the browser would: no `process`, only `window`.
    const win: { __env__?: Record<string, string> } = {};
    const script = /<script>(.*?)<\/script>/su.exec(out)?.[1] ?? '';
    new Function('window', script)(win);
    expect(win.__env__?.VITE_AG_GRID_LICENSE_KEY).toBe('licence-sentinel');
  });

  it('fails the build loudly when index.html lost the shim', () => {
    expect(() => injectRuntimeEnv('<div id="root"></div>', {})).toThrow('runtime env shim');
  });
});
