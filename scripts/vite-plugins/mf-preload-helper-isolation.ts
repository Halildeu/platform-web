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

// Matches any named import statement (`import { ... } from "...auth_loadShare..."`)
// regardless of specifier count or alias usage. The captured group is the raw
// specifier list inside the braces, which `parseSpecifiers` then decomposes
// into `{ importedName, localName }` entries. The rewrite then validates each
// `importedName` against `ALLOWED_AUTH_IMPORTS`; only `r` (preload helper) and
// `i` (lazy init wrapper) are accepted — `r` is inlined, `i` is replaced with
// a no-op. Any other imported name (e.g. `t` = PermissionProvider) causes the
// rewrite to skip this import statement, so the fail-closed audit then fires
// with the offending chunk file name. This preserves the Codex iter-5 audit
// invariant end-to-end (Codex iter-6 absorb on PR-I1).
//
// Observed shapes (Vite 8 + @module-federation/vite 1.15.1 + Rolldown rc.17):
//   `import { r } from "..."`               — original PR-X8 shape
//   `import { r as alias } from "..."`      — original PR-X8 alias variant
//   `import { i as n, r } from "..."`       — new (router__loadShare__)
//   `import { i as t, r as n } from "..."`  — new (router_dom__loadShare__)
//
// Multi-line specifier lists are not produced by Vite/Rolldown for federation
// chunks (single-line minified output), but the regex tolerates whitespace.
const AUTH_HELPER_NAMED_IMPORT_RE =
  /import\s*\{([^}]+)\}\s*from\s*["']\.\/[^"']*__loadShare___mf_0_mfe_mf_1_auth__loadShare__[^"']*["'];?/g;

// Matches namespace import: `import * as ns from "...auth_loadShare..."`.
// Replacement is a Proxy that enforces the same allowlist at runtime: `.r`
// returns the inline helper, `.i` returns a no-op, and any other property
// access throws a meaningful error so a future MF shape that reaches into a
// real auth binding fails visibly instead of silently. Not currently observed
// in Vite output for our federation graph, but covered defensively because
// the fail-closed audit would otherwise throw on any future occurrence and
// extending coverage is cheaper than re-running the build to debug.
const AUTH_HELPER_NAMESPACE_IMPORT_RE =
  /import\s*\*\s+as\s+([A-Za-z_$][\w$]*)\s*from\s*["']\.\/[^"']*__loadShare___mf_0_mfe_mf_1_auth__loadShare__[^"']*["'];?/g;

interface ParsedSpecifier {
  /** Imported (pre-alias) name as it appears on the export side. */
  importedName: string;
  /** Local binding name introduced by this specifier (alias if present). */
  localName: string;
}

/**
 * Allowlist of auth-loadShare exports that the rewrite is permitted to
 * inline or no-op. The chunk graph we are breaking only references the
 * preload helper (`r`) and the lazy init wrapper (`i`); any other imported
 * name means a consumer chunk is reaching into a real auth binding (e.g.
 * `t` = PermissionProvider React component, `n` = usePermissions hook) that
 * MUST NOT be silently rewritten to a no-op. Such bindings are not safe to
 * replace and the rewrite refuses them so the fail-closed audit fires
 * (Codex iter-5 invariant preserved end-to-end).
 */
const ALLOWED_AUTH_IMPORTS = new Set(['r', 'i']);

/**
 * Parse the inner text of an `import { ... }` specifier list. Tolerates
 * whitespace, `<imported> as <local>` aliasing, and trailing commas. Each
 * entry reports the imported (pre-alias) name and the local binding it
 * introduces. The caller validates `importedName` against
 * `ALLOWED_AUTH_IMPORTS` before generating the rewrite so unknown bindings
 * are not silently converted to no-ops.
 */
function parseSpecifiers(inner: string): ParsedSpecifier[] {
  return inner
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const aliasMatch = part.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
      if (aliasMatch) {
        const [, importedName, localName] = aliasMatch;
        return { importedName, localName };
      }
      return { importedName: part, localName: part };
    });
}

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
        // Reset stateful regex state before reuse.
        AUTH_HELPER_NAMED_IMPORT_RE.lastIndex = 0;
        AUTH_HELPER_NAMESPACE_IMPORT_RE.lastIndex = 0;

        let chunkRewrites = 0;
        let rewritten = code;

        // Pass 1: named imports `import { ... } from "...auth_loadShare..."`
        // Refuses to rewrite if any specifier names an import outside
        // ALLOWED_AUTH_IMPORTS — keeping the original import statement intact
        // so the fail-closed audit fires with a meaningful chunk reference
        // instead of silently masking a real auth binding (e.g. PermissionProvider).
        rewritten = rewritten.replace(AUTH_HELPER_NAMED_IMPORT_RE, (match, inner) => {
          const specifiers = parseSpecifiers(inner as string);
          if (specifiers.length === 0) return match as string;
          const disallowed = specifiers.filter((s) => !ALLOWED_AUTH_IMPORTS.has(s.importedName));
          if (disallowed.length > 0) {
            // Leave the import untouched. The audit gate will throw on this
            // chunk and report the offending file name to the maintainer.
            return match as string;
          }
          chunkRewrites += 1;
          const decls = specifiers
            .map(({ importedName, localName }) =>
              importedName === 'r'
                ? `const ${localName} = ${INLINE_HELPER};`
                : `const ${localName} = () => {};`,
            )
            .join('');
          return decls;
        });

        // Pass 2: namespace imports `import * as ns from "...auth_loadShare..."`
        // The Proxy enforces the same allowlist at runtime: `.r` returns the
        // inline helper, `.i` returns a no-op, and any other property access
        // throws so a future MF shape that reaches into a real binding fails
        // visibly instead of silently rendering nothing (or worse, calling a
        // React component as a function).
        rewritten = rewritten.replace(AUTH_HELPER_NAMESPACE_IMPORT_RE, (_match, nsName) => {
          chunkRewrites += 1;
          return (
            `const ${nsName as string} = new Proxy({}, { get: (_, k) => { ` +
            `if (k === 'r') return ${INLINE_HELPER}; ` +
            `if (k === 'i') return () => {}; ` +
            `throw new Error('[mf-preload-helper-isolation] namespace import of auth loadShare ' + ` +
            `'access "' + String(k) + '" not in allowlist {r,i}. ' + ` +
            `'If this is a legitimate auth binding, add a dedicated import and review the share graph.'); ` +
            `} });`
          );
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
        const leaks: string[] = [];
        for (const [fileName, chunk] of Object.entries(bundle)) {
          if (chunk.type !== 'chunk') continue;
          if (fileName.includes(AUTH_LOADSHARE_TOKEN)) continue;
          if (!fileName.includes('__loadShare__')) continue;
          if (chunk.code.includes(AUTH_LOADSHARE_TOKEN)) {
            leaks.push(fileName);
          }
        }
        if (leaks.length > 0) {
          const list = leaks.map((f) => `  - ${f}`).join('\n');
          throw new Error(
            `[mf-preload-helper-isolation] FAIL: ${leaks.length} loadShare chunk(s) still reference the auth loadShare token after rewrite:\n${list}\n` +
              `This is the back-edge that closes the auth ↔ design-system runtime cycle. ` +
              `Neither AUTH_HELPER_NAMED_IMPORT_RE nor AUTH_HELPER_NAMESPACE_IMPORT_RE in ` +
              `scripts/vite-plugins/mf-preload-helper-isolation.ts matched the new import shape — ` +
              `inspect the offending chunks above and extend the regexes (and parseSpecifiers) to cover them.`,
          );
        }
      }
    },
  };
}

export default mfPreloadHelperIsolation;
