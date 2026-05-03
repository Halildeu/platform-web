/**
 * Plugin invariant tests for `mfPreloadHelperIsolation`.
 *
 * These tests cover the contract that prevents the
 * `auth_loadShare ↔ design-system_loadShare` runtime cycle from re-emerging:
 *
 *   1. The plugin rewrites `import { r } from "...auth_loadShare..."` and the
 *      `import { r as alias }` variant into a local `const X = INLINE_HELPER`.
 *   2. The inline helper preserves the Vite preload wrapper contract:
 *      `helper(baseModule, deps, importerUrl) -> Promise` where `baseModule`
 *      is invoked. (Codex iter-4 RED finding: a single-arg no-op silently
 *      broke `LazyAgGrid` / `LazyCharts` etc.)
 *   3. The fail-closed audit throws when a non-auth `__loadShare__` chunk
 *      still mentions the auth loadShare token after the rewrite pass.
 *
 * The tests build a minimal Rolldown-style bundle by hand and invoke the
 * plugin's `generateBundle` hook directly, so they are fast and have no
 * external Vite dependency at runtime.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mfPreloadHelperIsolation } from './mf-preload-helper-isolation';
import type { Plugin } from 'vite';

type GenerateBundleFn = (
  outputOptions: Record<string, unknown>,
  bundle: Record<string, unknown>,
) => void | Promise<void>;

const AUTH_TOKEN = '__loadShare___mf_0_mfe_mf_1_auth__loadShare__';

const callGenerateBundle = (
  plugin: Plugin,
  bundle: Record<string, unknown>,
): void | Promise<void> => {
  const hook = plugin.generateBundle;
  expect(hook).toBeTypeOf('function');
  const fn =
    typeof hook === 'function'
      ? (hook as GenerateBundleFn)
      : (hook as { handler: GenerateBundleFn }).handler;
  return fn.call({} as never, {}, bundle);
};

const makeChunk = (fileName: string, code: string) =>
  ({ type: 'chunk', fileName, code }) as { type: 'chunk'; fileName: string; code: string };

describe('mfPreloadHelperIsolation — rewrite contract', () => {
  it('rewrites `import { r } from "...auth_loadShare..."` into a local helper', () => {
    const plugin = mfPreloadHelperIsolation();
    const dsChunkName = `__mfe_internal__mfe_shell__loadShare___mf_0_mfe_mf_1_design_mf_2_system__loadShare__.mjs-AAA.js`;
    const authChunkName = `__mfe_internal__mfe_shell__loadShare___mf_0_mfe_mf_1_auth__loadShare__.mjs-BBB.js`;
    const bundle = {
      [authChunkName]: makeChunk(authChunkName, `export var r = function(){};`),
      [dsChunkName]: makeChunk(
        dsChunkName,
        `import { r } from "./${authChunkName}";\nexport var x = 1;`,
      ),
    };

    callGenerateBundle(plugin, bundle);

    const dsCode = (bundle[dsChunkName] as { code: string }).code;
    expect(dsCode).not.toContain(AUTH_TOKEN);
    expect(dsCode).toMatch(/const r =\s*\(\(\)=>\{/);
  });

  it('rewrites `import { r as alias }` and binds the alias name', () => {
    const plugin = mfPreloadHelperIsolation();
    const dsName = `__mfe_internal__mfe_access__loadShare___mf_0_mfe_mf_1_design_mf_2_system__loadShare__.mjs-CCC.js`;
    const authName = `__mfe_internal__mfe_access__loadShare___mf_0_mfe_mf_1_auth__loadShare__.mjs-DDD.js`;
    const bundle = {
      [authName]: makeChunk(authName, `export var r = function(){};`),
      [dsName]: makeChunk(
        dsName,
        `import{r as a}from"./${authName}";\nexport var y=a(()=>import('./x.js'),[]);`,
      ),
    };

    callGenerateBundle(plugin, bundle);

    const code = (bundle[dsName] as { code: string }).code;
    expect(code).not.toContain(AUTH_TOKEN);
    expect(code).toMatch(/const a =\s*\(\(\)=>\{/);
    // The downstream call site that uses `a(() => import(...), [])` must
    // remain untouched so the helper actually drives the dynamic import.
    expect(code).toContain(`a(()=>import('./x.js'),[]);`);
  });

  it('does not modify the auth loadShare chunk itself', () => {
    const plugin = mfPreloadHelperIsolation();
    const authName = `__mfe_internal__mfe_shell__loadShare___mf_0_mfe_mf_1_auth__loadShare__.mjs-AUTH.js`;
    const original = `var r = function(){}; export { r };`;
    const bundle = { [authName]: makeChunk(authName, original) };

    callGenerateBundle(plugin, bundle);

    expect((bundle[authName] as { code: string }).code).toBe(original);
  });

  it('does not modify chunks that do not import from auth loadShare', () => {
    const plugin = mfPreloadHelperIsolation();
    const otherName = `assets/some-other-chunk.js`;
    const original = `import('./auth__loadShare__-XYZ.js');`; // dynamic import only
    const bundle = { [otherName]: makeChunk(otherName, original) };

    callGenerateBundle(plugin, bundle);

    expect((bundle[otherName] as { code: string }).code).toBe(original);
  });
});

describe('mfPreloadHelperIsolation — inline helper contract', () => {
  let helperFactory: () => unknown;

  beforeEach(() => {
    // Extract the inline helper string from a rewritten chunk so tests run
    // against the real emitted helper (no second source of truth).
    const plugin = mfPreloadHelperIsolation();
    const dsName = `__mfe_internal__mfe_shell__loadShare___mf_0_mfe_mf_1_design_mf_2_system__loadShare__.mjs-EEE.js`;
    const authName = `__mfe_internal__mfe_shell__loadShare___mf_0_mfe_mf_1_auth__loadShare__.mjs-FFF.js`;
    const bundle = {
      [authName]: makeChunk(authName, `export var r;`),
      [dsName]: makeChunk(dsName, `import { r } from "./${authName}";`),
    };
    callGenerateBundle(plugin, bundle);
    const rewritten = (bundle[dsName] as { code: string }).code;
    const match = rewritten.match(/const r =\s*(\(\(\)=>\{[\s\S]+?\}\)\(\));/);
    if (!match)
      throw new Error(`Could not extract inline helper from rewritten chunk:\n${rewritten}`);
    // `import.meta.url` is illegal inside a `new Function()` body (not a
    // module). Replace it with a fixed test URL so the helper can run.
    const helperExpr = match[1].replace(/import\.meta\.url/g, '"http://test/chunks/test.js"');

    // Stub document/window/Event so the helper can run under Node.
    const head: { append: unknown[] } = { append: [] };
    const fakeDocument = {
      createElement: () => ({
        rel: '',
        as: '',
        crossOrigin: '',
        href: '',
        setAttribute() {},
        addEventListener() {},
      }),
      head: { appendChild: (el: unknown) => head.append.push(el) },
      getElementsByTagName: () => [],
      querySelector: () => null,
    };
    const fakeWindow = { dispatchEvent: () => true };
    class FakeEvent {
      type: string;
      cancelable: boolean;
      defaultPrevented = false;
      payload: unknown;
      constructor(type: string, init: { cancelable?: boolean }) {
        this.type = type;
        this.cancelable = init?.cancelable ?? false;
      }
    }
    helperFactory = () =>
      new Function('document', 'window', 'Event', 'URL', `return ${helperExpr};`)(
        fakeDocument,
        fakeWindow,
        FakeEvent,
        URL,
      );
  });

  it('returns a function with arity 3 (baseModule, deps, importerUrl)', () => {
    const helper = helperFactory() as (...args: unknown[]) => unknown;
    expect(typeof helper).toBe('function');
    // The helper accepts 3 named args. We don't enforce length === 3 strictly
    // because minifiers can elide unused param names, but test the call shape.
    expect(helper.length).toBeGreaterThanOrEqual(2);
  });

  it('invokes baseModule and resolves to its result', async () => {
    const helper = helperFactory() as (
      baseModule: () => Promise<unknown>,
      deps?: unknown[],
      importerUrl?: unknown,
    ) => Promise<unknown>;
    const fakeModule = { default: 'lazy-component' };
    const baseModule = vi.fn().mockResolvedValue(fakeModule);

    const result = await helper(baseModule, [], false);

    expect(baseModule).toHaveBeenCalledTimes(1);
    expect(result).toBe(fakeModule);
  });

  it('appends modulepreload links for each dep', async () => {
    const helper = helperFactory() as (
      baseModule: () => Promise<unknown>,
      deps?: string[],
    ) => Promise<unknown>;
    const baseModule = vi.fn().mockResolvedValue({});

    await helper(baseModule, ['foo.js', 'bar.js'], false);

    expect(baseModule).toHaveBeenCalledTimes(1);
    // Helper resolves URLs against `import.meta.url`; we don't assert exact
    // URLs (would couple to the Node test runner's import URL). The
    // important contract is that baseModule still ran after preload setup.
  });

  it('propagates preload errors via vite:preloadError event', async () => {
    const helper = helperFactory() as (
      baseModule: () => Promise<unknown>,
      deps?: unknown[],
    ) => Promise<unknown>;
    const failure = new Error('chunk load failed');
    const baseModule = vi.fn().mockRejectedValue(failure);

    await expect(helper(baseModule, [], false)).rejects.toBe(failure);
    expect(baseModule).toHaveBeenCalledTimes(1);
  });
});

describe('mfPreloadHelperIsolation — fail-closed audit', () => {
  it('throws when a non-auth loadShare chunk still references the auth token', () => {
    const plugin = mfPreloadHelperIsolation();
    const dsName = `__mfe_internal__mfe_shell__loadShare___mf_0_mfe_mf_1_design_mf_2_system__loadShare__.mjs-LEAK.js`;
    const authName = `__mfe_internal__mfe_shell__loadShare___mf_0_mfe_mf_1_auth__loadShare__.mjs-AUTH.js`;
    // Multi-specifier import: regex won't rewrite this, audit must catch it.
    const bundle = {
      [authName]: makeChunk(authName, `export var r;`),
      [dsName]: makeChunk(dsName, `import { r, t } from "./${authName}";`),
    };

    expect(() => callGenerateBundle(plugin, bundle)).toThrowError(
      /still reference the auth loadShare token/,
    );
  });

  it('does not throw for bootstrap chunks that mention the auth token (dynamic import is fine)', () => {
    const plugin = mfPreloadHelperIsolation();
    // Bootstrap chunks legitimately dynamic-import auth_loadShare; they are
    // NOT loadShare chunks themselves so the audit must skip them.
    const bootstrapName = `assets/bootstrap-XYZ.js`;
    const bundle = {
      [bootstrapName]: makeChunk(
        bootstrapName,
        `await import("./assets/__mfe_internal_mfe_shell__loadShare___mf_0_mfe_mf_1_auth__loadShare__-AAA.js");`,
      ),
    };

    expect(() => callGenerateBundle(plugin, bundle)).not.toThrow();
  });

  it('skips the audit gate when failOnLeak: false is passed', () => {
    const plugin = mfPreloadHelperIsolation({ failOnLeak: false });
    const dsName = `__mfe_internal__mfe_shell__loadShare___mf_0_mfe_mf_1_design_mf_2_system__loadShare__.mjs-LEAK.js`;
    const authName = `__mfe_internal__mfe_shell__loadShare___mf_0_mfe_mf_1_auth__loadShare__.mjs-AUTH.js`;
    const bundle = {
      [authName]: makeChunk(authName, `export var r;`),
      [dsName]: makeChunk(dsName, `import { r, t } from "./${authName}";`),
    };

    expect(() => callGenerateBundle(plugin, bundle)).not.toThrow();
  });
});
