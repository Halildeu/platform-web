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
import { isCandidateApplicationPath } from './app/public-entry-routes';
installStaleBundleRecovery();
// AG Grid + other CSS loaded via Vite native CSS handling
// Public candidate applications must not wait for the authenticated shell,
// auth bootstrap or any internal Module Federation remote. A failed admin
// remote must never turn the applicant-facing form into a blank page.
const showBootstrapFailure = () => {
  const container = document.getElementById('root');
  if (!container) return;
  const alert = document.createElement('div');
  alert.setAttribute('role', 'alert');
  alert.style.cssText =
    'max-width:42rem;margin:4rem auto;padding:1.5rem;border:1px solid #cbd5e1;border-radius:1rem;font:500 1rem/1.6 system-ui,sans-serif;color:#0f172a;background:#fff';
  alert.textContent =
    'Sayfa şu anda yüklenemedi. Lütfen bağlantınızı kontrol edip sayfayı yeniden deneyin.';
  container.replaceChildren(alert);
};

const applicationBootstrap = isCandidateApplicationPath(
  window.location.pathname,
  import.meta.env.BASE_URL,
)
  ? import('./app/public-candidate-bootstrap')
  : import('./app/bootstrap');

void applicationBootstrap.catch(showBootstrapFailure);
