import React from 'react';
// PERF-INIT-V2 PR-B5a: consumer-side subpath migration.
// createLazyRemoteModule is invoked at MFE boot. EmptyErrorLoading
// lives in the components barrel; this aligns the call site for the
// future B5d subpath share-scope split. Under the current root shared
// package topology the loadShare wrapper is unchanged.
import { EmptyErrorLoading } from '@mfe/design-system/components';

type RemoteModule = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- React.lazy expects ComponentType with arbitrary props for federated remotes
  default: React.ComponentType<any>;
};

/* ------------------------------------------------------------------ */
/*  Error classification — turns generic import failures into          */
/*  actionable diagnostics for developers                              */
/* ------------------------------------------------------------------ */

type ErrorClass = {
  type: 'network' | 'share-scope' | 'context' | 'auth' | 'unknown';
  title: string;
  description: string;
  errorLabel: string;
};

function classifyRemoteError(label: string, error: unknown): ErrorClass {
  const msg = error instanceof Error ? error.message : String(error);

  // 1. Network — remoteEntry.js unreachable
  if (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('remoteEntry') ||
    msg.includes('fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('ERR_CONNECTION_REFUSED')
  ) {
    return {
      type: 'network',
      title: `${label} — remote uygulama erisilemedi`,
      description:
        'MFE dev server calismiyor olabilir. Services sayfasindan baslatin veya terminalde npm start komutunu calistirin.',
      errorLabel: `remoteEntry.js yuklenemedi (network hatasi)`,
    };
  }

  // 2. Share-scope — shared dependency mismatch (loadShare, constructor, version)
  if (
    msg.includes('is not a constructor') ||
    msg.includes('is not a function') ||
    msg.includes('loadShare') ||
    msg.includes('Shared module') ||
    msg.includes('initPromise')
  ) {
    return {
      type: 'share-scope',
      title: `${label} — shared dependency uyumsuzlugu`,
      description:
        'Shell ve remote arasinda paylasilan bagimliliklarin versiyonlari uyusmuyor. Shell restart gerekebilir.',
      errorLabel: `Share-scope hatasi: ${msg.slice(0, 100)}`,
    };
  }

  // 3. Context — React context mismatch (duplicate React, _context undefined)
  if (
    msg.includes('_context') ||
    msg.includes('useContext') ||
    msg.includes('Cannot read properties of undefined') ||
    msg.includes('Invalid hook call')
  ) {
    return {
      type: 'context',
      title: `${label} — React context uyumsuzlugu`,
      description:
        'Farkli React instance kullaniliyor olabilir. Shell restart edin veya shared dependency ayarlarini kontrol edin.',
      errorLabel: `Context hatasi: ${msg.slice(0, 100)}`,
    };
  }

  // 4. Auth redirect — not an MF error, auth flow intercepted
  if (
    msg.includes('login') ||
    msg.includes('unauthorized') ||
    msg.includes('401') ||
    msg.includes('403')
  ) {
    return {
      type: 'auth',
      title: `${label} — yetkilendirme sorunu`,
      description:
        'Bu module erisim icin oturum acmaniz veya gerekli yetkilere sahip olmaniz gerekiyor.',
      errorLabel: `Auth hatasi: ${msg.slice(0, 100)}`,
    };
  }

  // 5. Unknown — provide raw error for debugging
  return {
    type: 'unknown',
    title: `${label} su anda kullanilamiyor`,
    description: 'Beklenmeyen bir hata olustu. Detaylar asagida.',
    errorLabel: msg.slice(0, 150) || 'Bilinmeyen hata',
  };
}

/* ------------------------------------------------------------------ */
/*  Type badge colors                                                  */
/* ------------------------------------------------------------------ */

const TYPE_COLORS: Record<ErrorClass['type'], string> = {
  network: 'bg-state-warning-bg text-state-warning-text',
  'share-scope': 'bg-state-danger-bg text-state-danger-text',
  context: 'bg-state-danger-bg text-state-danger-text',
  auth: 'bg-state-info-bg text-state-info-text',
  unknown: 'bg-surface-muted text-text-secondary',
};

const TYPE_LABELS: Record<ErrorClass['type'], string> = {
  network: 'NETWORK',
  'share-scope': 'SHARE-SCOPE',
  context: 'CONTEXT',
  auth: 'AUTH',
  unknown: 'UNKNOWN',
};

/* ------------------------------------------------------------------ */
/*  Fallback component                                                 */
/* ------------------------------------------------------------------ */

const toTestIdSuffix = (value: string) => value.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

const createRemoteUnavailableFallback = (label: string, classified: ErrorClass): React.FC => {
  const RemoteUnavailableFallback: React.FC = () => (
    <div className="max-w-3xl" data-testid={`remote-module-fallback-${toTestIdSuffix(label)}`}>
      <div className="mb-2">
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${TYPE_COLORS[classified.type]}`}
        >
          {TYPE_LABELS[classified.type]}
        </span>
      </div>
      <EmptyErrorLoading
        mode="error"
        title={classified.title}
        description={classified.description}
        errorLabel={classified.errorLabel}
      />
    </div>
  );

  RemoteUnavailableFallback.displayName = `${label}UnavailableFallback`;
  return RemoteUnavailableFallback;
};

/* ------------------------------------------------------------------ */
/*  Lazy remote loader with error classification                       */
/* ------------------------------------------------------------------ */

/**
 * STUB resolution guard (PR #280 absorb, Codex iter-1 must-fix #1):
 *
 * The MF disabled-remote stub is `data:text/javascript,export default
 * {}; export function configureShellServices(){}`. This URI resolves
 * **successfully** (no Promise rejection) and returns
 * `{ default: {}, configureShellServices: function }`. Without this
 * guard, `React.lazy` would treat `{}` as the component, raising
 * "invalid element type" at render time instead of routing through
 * our classified fallback.
 *
 * Render-time triggers for the STUB path: flag drift between
 * shell-navigation flag and AppRouter redirect, deep-link to a
 * disabled remote's route, dev-tool mount of the lazy module without
 * the route guard. The Forbidden screen is reserved for permissions;
 * the fallback path here is for "remote unavailable".
 */
const isValidRemoteComponent = (candidate: unknown): boolean => {
  if (candidate == null) return false;
  const t = typeof candidate;
  if (t === 'function') return true;
  // forwardRef / memo wrappers
  if (t === 'object') {
    const obj = candidate as { $$typeof?: symbol; render?: unknown; type?: unknown };
    return (
      Boolean(obj.$$typeof) &&
      (typeof obj.render === 'function' || typeof obj.type === 'function' || obj.type != null)
    );
  }
  return false;
};

export const createLazyRemoteModule = (label: string, loader: () => Promise<RemoteModule>) =>
  React.lazy(async () => {
    try {
      const mod = await loader();
      if (!isValidRemoteComponent(mod?.default)) {
        // STUB or otherwise empty module — surface as a classified
        // "remote unavailable" so the user sees an actionable
        // diagnostic instead of React's invalid-element-type crash.
        throw new Error(
          `Remote module "${label}" did not export a valid React component (likely disabled/STUB)`,
        );
      }
      return mod;
    } catch (error: unknown) {
      const classified = classifyRemoteError(label, error);
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[shell] ${label} remote yuklenemedi [${classified.type}]`, error);
      }
      return { default: createRemoteUnavailableFallback(label, classified) };
    }
  });

export default createLazyRemoteModule;
