// TW4 CSS — processed by @tailwindcss/vite plugin (native @layer support)
import './index.css';
// 2026-05-10 stale-bundle deploy recovery (PR #383 iter-2 / Codex
// 019e1372 P1 absorb): install the runtime stale-asset listeners
// HERE — at the genuinely earliest entry — BEFORE the dynamic
// `import('./app/bootstrap')` below. Putting the install inside
// bootstrap.tsx itself was wrong under ESM semantics: bootstrap.tsx
// has multiple `import` statements at the top of the file, and ESM
// hoists imports BEFORE the module body runs, so the install call
// would not be earliest. By calling it from index.tsx (whose only
// imports are CSS + this module) before the dynamic
// `import('./app/bootstrap')`, we guarantee the listeners are
// attached before any chunk-loading code can fire its first
// dynamic import.
import { installStaleBundleRecovery } from './app/runtime/stale-bundle-recovery';
installStaleBundleRecovery();
// AG Grid + other CSS loaded via Vite native CSS handling
import('./app/bootstrap');
