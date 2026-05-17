import type { Plugin } from 'vite';

/**
 * Faz 21.8 PR-X8 (Codex iter-5): isolate the Vite modulepreload helper across
 * Module Federation `loadShare` chunks to break a runtime cycle.
 *
 * ## Background
 *
 * After upgrading `@module-federation/vite` 1.14.2 → 1.15.1 (PR-X7), the
 * eager-shared-singleton flow began emitting a back-edge in the runtime
 * chunk graph:
 *
 *   - `__loadShare___mf_0_mfe_mf_1_auth__loadShare__-*.js` defines the
 *     Vite modulepreload helper (the `r` export).
 *   - `__loadShare___mf_0_mfe_mf_1_design-system__loadShare__-*.js` imports
 *     `r` from that auth chunk instead of inlining its own helper, creating
 *     the edge `design-system → auth`.
 *   - The reverse edge `auth → design-system` already exists at the source
 *     level: `@mfe/auth/ui` (ExplainPermissionModal) consumes
 *     `@mfe/design-system` primitives.
 *   - Combined: `auth ↔ design-system` runtime cycle. Both chunks contain a
 *     top-level `await initContainer(...)`, so the cycle deadlocks
 *     `hostAutoInit` — the React tree silently never mounts.
 *
 * ## Fix strategy
 *
 * Rewrite the `import { r } from './...auth_loadShare....js'` statement in
 * any chunk that imports it (only `design-system_loadShare` in practice) so
 * the helper is **inlined** as a fresh local function with the SAME
 * observable contract as Vite's emitted helper:
 *
 *   `r(baseModule, deps, importerUrl) => Promise<modules>`
 *
 * The original Vite helper preloads `deps` (each as `<link rel="modulepreload">`),
 * then calls `baseModule()` (a function returning the dynamic `import(...)`
 * promise), and propagates errors via the `vite:preloadError` event. The
 * inline replacement mirrors this contract byte-for-byte from the emitted
 * auth-chunk source so DS lazy export call sites like
 *
 *   `r(() => import("./data-grid-...js"), __vite__mapDeps([0, 1, 2]))`
 *
 * still execute the dynamic import. (Codex iter-4 RED finding: the previous
 * single-arg `((href) => { ... })` no-op silently broke `LazyAgGrid`,
 * `LazyCharts`, etc.)
 *
 * The cycle is broken because the import edge from DS to auth disappears
 * entirely from the generated chunk; downstream Module Federation
 * `Promise.all([...])` preloading in `mf-entry-bootstrap-0.js` covers
 * cross-chunk ordering and the inline helper handles in-chunk dynamic import
 * preloading without crossing chunk boundaries.
 *
 * ## Acceptance gate (fail-closed)
 *
 * After this plugin runs, no `__loadShare__` chunk OTHER than the auth
 * loadShare chunk itself may contain the literal token
 * `__loadShare___mf_0_mfe_mf_1_auth__loadShare__`. This catches every
 * import shape (named, multi-specifier, namespace, re-export, dynamic
 * import inside a loadShare chunk, minified-whitespace variants, etc.) in
 * a single grammar-free check. Bootstrap/entry chunks are excluded by the
 * `__loadShare__` filter — they legitimately dynamic-import auth_loadShare
 * to materialise the share and do NOT close the TLA cycle.
 */

// Faithful inline of Vite's emitted modulepreload helper.
//
// Source: copied from the auth loadShare chunk emitted by
// @module-federation/vite 1.15.1 + Vite 8.0.10 + Rolldown rc.17. The shape
// is intentionally mirrored byte-for-byte (modulo variable renames) so the
// inlined helper is observably indistinguishable from the original.
//
// Contract:
//   helper(baseModule: () => Promise<Module>, deps?: string[], importerUrl?: boolean)
//     -> Promise<Module>
//
// Behaviour:
//   1. For each dep URL (resolved via `import.meta.url` of the inlining
//      chunk), append a `<link rel="modulepreload">` (or `rel="stylesheet"`
//      for `.css`) to `<head>` exactly once per chunk-local dedup set.
//   2. Wait for CSS preloads to finish (`load`/`error`); JS preloads are
//      fire-and-forget.
//   3. Dispatch `vite:preloadError` for any rejected dep; if the listener
//      does not call `preventDefault`, rethrow.
//   4. Resolve to `baseModule()` (the dynamic `import(...)`) with the same
//      error propagation.
//
// The dedup cache `n` is per-chunk now (auth and DS no longer share it).
// In the worst case this means a dep referenced by both chunks gets two
// link tags instead of one — browsers de-duplicate at the network layer,
// so this is observable only in DOM tree size, not behaviour.
const INLINE_HELPER = [
  '(()=>{',
  "const e='modulepreload',",
  't=function(e,t){return new URL("../"+e,import.meta.url).href},',
  'n={};',
  'return function(r,i,a){',
  'let o=Promise.resolve();',
  'if(i&&i.length>0){',
  "const c=document.getElementsByTagName('link'),",
  "u=document.querySelector('meta[property=csp-nonce]'),",
  "v=u&&(u.nonce||u.getAttribute('nonce')),",
  "p=function(e){return Promise.all(e.map(function(e){return Promise.resolve(e).then(function(e){return{status:'fulfilled',value:e}},function(e){return{status:'rejected',reason:e}})}))};",
  'o=p(i.map(function(i){',
  'i=t(i,a);',
  'if(i in n)return;',
  'n[i]=!0;',
  "const o=i.endsWith('.css'),",
  "s=o?'[rel=\"stylesheet\"]':'';",
  'if(a){',
  'for(let e=c.length-1;e>=0;e--){',
  'const t=c[e];',
  "if(t.href===i&&(!o||t.rel==='stylesheet'))return}",
  '}',
  "else if(document.querySelector('link[href=\"'+i+'\"]'+s))return;",
  "const l=document.createElement('link');",
  "l.rel=o?'stylesheet':e;",
  "if(!o)l.as='script';",
  "l.crossOrigin='';",
  'l.href=i;',
  "if(v)l.setAttribute('nonce',v);",
  'document.head.appendChild(l);',
  'if(o)return new Promise(function(e,t){',
  "l.addEventListener('load',e);",
  "l.addEventListener('error',function(){t(Error('Unable to preload CSS for '+i))})",
  '})',
  '}))',
  '}',
  'function s(e){',
  "const t=new Event('vite:preloadError',{cancelable:!0});",
  't.payload=e;',
  'window.dispatchEvent(t);',
  'if(!t.defaultPrevented)throw e',
  '}',
  'return o.then(function(e){',
  "for(const t of e||[])t.status==='rejected'&&s(t.reason);",
  'return r().catch(s)',
  '})',
  '}',
  '})()',
].join('');

const AUTH_LOADSHARE_TOKEN = '__loadShare___mf_0_mfe_mf_1_auth__loadShare__';

// Matches `import { r } from "...auth_loadShare..."` and the alias variant
// `import { r as alias } from "...auth_loadShare..."`. The modulepreload
// helper export emitted by Vite/Rolldown is named `r` or `_` depending on
// the chunk-graph shape, so both names are matched. The fail-closed audit
// below catches any other shape (multi-specifier, namespace, re-export, etc.)
// rather than silently leaving them in place.
const AUTH_HELPER_IMPORT_RE =
  /import\s*\{\s*(r|_)(?:\s+as\s+([A-Za-z_$][\w$]*))?\s*\}\s*from\s*["']\.\/[^"']*__loadShare___mf_0_mfe_mf_1_auth__loadShare__[^"']*["'];?/g;

// Diagnostic only: matches ANY import/export statement that references the
// auth loadShare chunk. Used by the fail-closed audit to surface the exact
// offending import shape in the error message, so an unhandled shape is
// immediately actionable instead of needing a separate failOnLeak:false run.
const ANY_AUTH_REF_RE =
  /(?:\bimport\b|\bexport\b)[^;]*?["'][^"']*__loadShare___mf_0_mfe_mf_1_auth__loadShare__[^"']*["'][^;]*;?/g;

export interface MfPreloadHelperIsolationOptions {
  /** Verbose logging of every rewrite. Defaults to false. */
  debug?: boolean;
  /**
   * Fail the build if any non-auth `__loadShare__` chunk still contains the
   * auth loadShare token after the rewrite pass. Defaults to true so that a
   * regression in MF plugin output (new import shape we don't know about)
   * fails the build instead of shipping a deadlock.
   */
  failOnLeak?: boolean;
}

export function mfPreloadHelperIsolation(options: MfPreloadHelperIsolationOptions = {}): Plugin {
  const debug = options.debug === true;
  const failOnLeak = options.failOnLeak !== false;
  return {
    name: 'mf-preload-helper-isolation',
    enforce: 'post',
    apply: 'build',
    generateBundle(_outputOptions, bundle) {
      let totalRewrites = 0;
      const rewrittenChunks: string[] = [];

      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'chunk') continue;
        const code = chunk.code;
        // Reset stateful regex before reuse.
        AUTH_HELPER_IMPORT_RE.lastIndex = 0;
        if (!AUTH_HELPER_IMPORT_RE.test(code)) continue;
        AUTH_HELPER_IMPORT_RE.lastIndex = 0;

        let chunkRewrites = 0;
        const rewritten = code.replace(AUTH_HELPER_IMPORT_RE, (_match, helperName, alias) => {
          const localName = (alias as string | undefined) ?? (helperName as string);
          chunkRewrites += 1;
          return `const ${localName} = ${INLINE_HELPER};`;
        });

        if (chunkRewrites > 0 && rewritten !== code) {
          chunk.code = rewritten;
          totalRewrites += chunkRewrites;
          rewrittenChunks.push(fileName);
          if (debug) {
            console.log(
              `[mf-preload-helper-isolation] ${fileName}: inlined ${chunkRewrites} helper import(s)`,
            );
          }
        }
      }

      if (debug) {
        console.log(
          `[mf-preload-helper-isolation] total rewrites: ${totalRewrites} across ${rewrittenChunks.length} chunk(s)`,
        );
      }

      // Fail-closed post-rewrite audit (Codex iter-5):
      // After rewriting, NO `__loadShare__` chunk other than the auth
      // loadShare chunk itself may still mention the auth loadShare token.
      // This is grammar-free — it catches every import shape (named,
      // multi-specifier, namespace, re-export), every minification variant,
      // even comments. Bootstrap/entry chunks are filtered out because they
      // legitimately dynamic-import auth_loadShare to materialise the share;
      // those calls are async and do not close the TLA runtime cycle.
      if (failOnLeak) {
        const leaks: { fileName: string; refs: string[] }[] = [];
        for (const [fileName, chunk] of Object.entries(bundle)) {
          if (chunk.type !== 'chunk') continue;
          if (fileName.includes(AUTH_LOADSHARE_TOKEN)) continue;
          if (!fileName.includes('__loadShare__')) continue;
          if (chunk.code.includes(AUTH_LOADSHARE_TOKEN)) {
            ANY_AUTH_REF_RE.lastIndex = 0;
            const refs = (chunk.code.match(ANY_AUTH_REF_RE) ?? []).map((s) =>
              s.trim().slice(0, 300),
            );
            leaks.push({ fileName, refs });
          }
        }
        if (leaks.length > 0) {
          const list = leaks
            .map(({ fileName, refs }) => {
              const shown =
                refs.length > 0
                  ? refs.map((r) => `      ${r}`).join('\n')
                  : '      (token present but no import/export statement matched — inspect the chunk)';
              return `  - ${fileName}\n${shown}`;
            })
            .join('\n');
          throw new Error(
            `[mf-preload-helper-isolation] FAIL: ${leaks.length} loadShare chunk(s) still reference the auth loadShare token after rewrite:\n${list}\n` +
              `This is the back-edge that closes the auth ↔ design-system runtime cycle. ` +
              `The rewrite regex AUTH_HELPER_IMPORT_RE in scripts/vite-plugins/mf-preload-helper-isolation.ts ` +
              `did not match the offending import shape(s) shown above — extend it to cover them.`,
          );
        }
      }
    },
  };
}

export default mfPreloadHelperIsolation;
