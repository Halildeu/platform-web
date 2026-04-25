/**
 * API Logger — expected vs unexpected error taxonomy
 *
 * 2026-04-25 Faz 19.11 eklendi: Codex AGREE 019dc1ee user bulgusu
 * "çok yerde yaratıcı console hatası var" (190 console.warn/error call sites).
 *
 * Taxonomy:
 * - EXPECTED: 401/403/network/parse fallback → prod silent, DEV-only console
 *   Kullanıcı tarafında normal UX akışı (token yok, rol yetmez, transient network)
 *
 * - UNEXPECTED: 5xx/schema mismatch/unknown exception → prod console.error + telemetry
 *   Developer/Ops için gerçek hata sinyali
 *
 * Kullanım:
 * ```ts
 * import { logExpected, logUnexpected } from '@mfe/shared-http';
 *
 * try {
 *   await api.fetch();
 * } catch (err) {
 *   if (isExpectedClientError(err)) {
 *     logExpected('usersApi.list', err, { status: 401, reason: 'unauthenticated' });
 *     return emptyResponse();
 *   }
 *   logUnexpected('usersApi.list', err, { traceId: extractTraceId(err) });
 *   throw err;
 * }
 * ```
 *
 * Migration path (7 MFE + common + design-system):
 *   1. mfe-users pilot (8 warn → helper)
 *   2. mfe-access, mfe-reporting, mfe-audit
 *   3. Kalan MFE'ler + ESLint no-console kural
 */

const isDev = (() => {
  // Vite build-time: import.meta.env.DEV
  // Node fallback: NODE_ENV !== 'production'
  if (typeof import.meta !== 'undefined') {
    const viteEnv = (import.meta as { env?: { DEV?: boolean; MODE?: string } }).env;
    if (viteEnv) {
      if (typeof viteEnv.DEV === 'boolean') return viteEnv.DEV;
      if (viteEnv.MODE) return viteEnv.MODE !== 'production';
    }
  }
  if (typeof process !== 'undefined' && process.env) {
    return process.env.NODE_ENV !== 'production';
  }
  return false;
})();

export type ApiLogMeta = {
  status?: number;
  reason?: string;
  traceId?: string;
  endpoint?: string;
  [key: string]: unknown;
};

/**
 * Expected error — normal UX akışı, 401/403/network/parse fallback.
 * Prod'da sessiz, DEV'de console.warn.
 */
export const logExpected = (context: string, error?: unknown, meta?: ApiLogMeta): void => {
  if (!isDev) {
    return; // Prod silent
  }
  // eslint-disable-next-line no-console
  console.warn(`[${context}] expected:`, error, meta ?? {});
};

/**
 * Unexpected error — gerçek bug/backend issue, her zaman raporla.
 * Prod console.error + (gelecekte) telemetry.
 */
export const logUnexpected = (context: string, error?: unknown, meta?: ApiLogMeta): void => {
  // eslint-disable-next-line no-console
  console.error(`[${context}] unexpected:`, error, meta ?? {});
  // TODO: telemetry Sentry/OTel entegrasyonu (telemetryClient mevcut, Faz sonrası eklenebilir)
};

/**
 * HTTP response status'u expected sınıfında mı?
 * 401, 403, network (status 0), abort → expected
 */
export const isExpectedHttpStatus = (status: number | undefined): boolean => {
  if (status === undefined) return true; // network
  if (status === 0) return true;
  if (status === 401 || status === 403) return true;
  return false;
};

/**
 * AxiosError'dan expected classification.
 */
export const isExpectedAxiosError = (error: unknown): boolean => {
  if (error && typeof error === 'object' && 'isAxiosError' in error) {
    const axiosErr = error as { response?: { status?: number } };
    const status = axiosErr.response?.status;
    return isExpectedHttpStatus(status);
  }
  return false;
};
