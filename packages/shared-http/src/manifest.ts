import axios from 'axios';
import { Manifest, ManifestPageRef, PageLayoutManifest } from '@mfe/shared-types';

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

/**
 * 2026-05-08 hotfix (browser console ERR_CONNECTION_REFUSED):
 * Production build was baking `http://localhost:8080/manifest/v1` into
 * the bundle because:
 *   1. VITE_GATEWAY_URL is not set at vite build time on testai/prod
 *      (gateway is reached via same-origin /api, not a separate URL).
 *   2. The previous default was `http://localhost:8080/api`, which
 *      then got `/api` stripped → manifestBase = `http://localhost:8080/manifest/v1`.
 *   3. Browsers loading the bundle from testai.acik.com tried to
 *      connect to localhost:8080 and obviously failed.
 *
 * Fix: when no explicit env override is provided, default to a
 * SAME-ORIGIN relative path (`/manifest/v1`). Production bundles
 * served from any host then fetch the manifest from that same host's
 * gateway via the regular ingress path. Local dev still works because
 * VITE_MANIFEST_BASE / VITE_GATEWAY_URL can override.
 */
const resolveGatewayOrigin = (): string | null => {
  const raw =
    (typeof process !== 'undefined' && process.env.VITE_GATEWAY_URL) ||
    (typeof process !== 'undefined' && process.env.GATEWAY_URL);
  if (!raw) return null;
  // static manifest root gateway kökünde; /api varsa kaldır
  return trimTrailingSlash(raw.replace(/\/api\/?$/, ''));
};

/**
 * Manifest kaynağını mümkün olduğunca aynı origin üzerinden çekerek CORS sorununu önle.
 * Öncelik sırası:
 * 1) VITE_MANIFEST_BASE / MANIFEST_BASE_URL (explicit override; full URL or path)
 * 2) resolveGatewayOrigin() + "/manifest/v1" (only if VITE_GATEWAY_URL set)
 * 3) Same-origin relative `/manifest/v1` (production default — works on any host)
 */
const envManifestBase =
  (typeof process !== 'undefined' &&
    (process.env.VITE_MANIFEST_BASE ?? process.env.MANIFEST_BASE_URL)) ||
  (typeof window !== 'undefined' &&
    ((window as Window & { __env__?: Record<string, string>; __ENV__?: Record<string, string> })
      .__env__?.VITE_MANIFEST_BASE ||
      (window as Window & { __env__?: Record<string, string>; __ENV__?: Record<string, string> })
        .__ENV__?.VITE_MANIFEST_BASE));

const gatewayOrigin = resolveGatewayOrigin();

const manifestBase =
  envManifestBase && envManifestBase.trim().length > 0
    ? envManifestBase.replace(/\/+$/, '')
    : gatewayOrigin
      ? `${gatewayOrigin}/manifest/v1`
      : '/manifest/v1';

export const fetchManifest = async (): Promise<Manifest> => {
  const res = await axios.get<Manifest>(`${manifestBase}/manifest.json`);
  return res.data;
};

export const fetchPageLayout = async (pageId: string): Promise<PageLayoutManifest> => {
  const manifest = await fetchManifest();
  const pageRef: ManifestPageRef | undefined = manifest.pages?.[pageId];
  const layoutUrl = pageRef?.layoutUrl ?? `${manifestBase}/page-${pageId}.layout.json`;
  const res = await axios.get<PageLayoutManifest>(
    layoutUrl.startsWith('http') ? layoutUrl : `${manifestBase}/page-${pageId}.layout.json`,
  );
  return res.data;
};
