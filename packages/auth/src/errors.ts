/**
 * Auth/HTTP error classification helpers.
 *
 * Frontend signals from gateway:
 *  - 401 Unauthorized → JWT/session expired or missing → user must re-login.
 *  - 403 Forbidden    → JWT valid but authz deny (real "no permission") → keep cache.
 *  - 5xx              → server fault → transient error, may retry.
 *
 * Codex 019dd818 iter-4 (B-prime focused semantic fix):
 * "401 yakalandığında authz cache invalidate + 'oturum yenile' sınıfı; stale
 *  superAdmin:false kullanmama. 403'te cache korunur, 5xx/network transient."
 *
 * Helpers below are axios-agnostic — derive HTTP status from the canonical
 * `error.response.status` shape that `shared-http` and most fetch wrappers
 * surface. If the status cannot be determined, returns `undefined`.
 */

export function getHttpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  const candidate = (error as { response?: { status?: number } }).response;
  if (candidate && typeof candidate.status === 'number') {
    return candidate.status;
  }
  return undefined;
}

export function isUnauthorizedError(error: unknown): boolean {
  return getHttpStatus(error) === 401;
}

export function isForbiddenError(error: unknown): boolean {
  return getHttpStatus(error) === 403;
}

export function isServerError(error: unknown): boolean {
  const status = getHttpStatus(error);
  return typeof status === 'number' && status >= 500;
}

/**
 * Only identity-snapshot endpoints can prove that the global session is gone.
 * Resource and downstream-service 401 responses stay local to their feature.
 */
export function isAuthCriticalUnauthorizedUrl(url: unknown): boolean {
  if (typeof url !== 'string') {
    return false;
  }

  try {
    const pathname = new URL(url, 'http://auth-url.local').pathname;
    return pathname.endsWith('/v1/authz/me') || pathname.endsWith('/v1/authz/version');
  } catch {
    return false;
  }
}
