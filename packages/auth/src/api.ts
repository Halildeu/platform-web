import type {
  AuthzMeResponse,
  CheckRequest,
  CheckResponse,
  BatchCheckRequest,
  BatchCheckResponse,
  BatchCheckItem,
} from './types';
import { isUnauthorizedError, isServerError } from './errors';

/**
 * Fetch current user's authorization context from backend.
 * Backend proxies to OpenFGA; in dev/permitAll mode returns dev defaults.
 * Retries up to 2 times on 5xx errors (Hibernate session race condition).
 */
// iter-34 — empty-body transient guard.
//
// Live capture (Playwright against testai.acik.com 2026-04-30):
//   call #1: 200 application/json content-length: 0 body: ""
//   call #2: 200 application/json content-length: 1214 body: {"userId":"1204",...,"superAdmin":true}
//
// Same Bearer token, same URL, ~1.5s apart. The first hop returns an empty
// body (suspected api-gateway WebFlux ↔ permission-service Servlet handoff
// race). PermissionProvider used to silently accept the empty payload as
// `authz = {} as AuthzMeResponse`, which made `authz?.superAdmin` undefined
// and `canEdit` false — drawer rendered all role checkboxes as
// cursor:not-allowed even for super-admins.
//
// Defensive contract: an authz/me response with no userId is treated the
// same as a transient 5xx. Same retry budget, same back-off. Frontend never
// caches a payload that has lost the identity field.
const isEmptyOrIncompleteAuthzPayload = (data: unknown): boolean => {
  if (data == null) return true;
  if (typeof data !== 'object') return true;
  const userId = (data as { userId?: unknown }).userId;
  return userId == null || userId === '';
};

export async function fetchAuthzMe(
  httpGet: (url: string) => Promise<{ data: AuthzMeResponse }>,
): Promise<AuthzMeResponse> {
  const MAX_RETRIES = 2;
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { data } = await httpGet('/v1/authz/me');
      // iter-34: reject empty / userId-less payloads as transient — same
      // back-off as a 5xx. Without this guard the drawer's canEdit gate
      // collapses to false on the first paint and never recovers because
      // the polling fallback only re-fetches when authzVersion changes.
      if (isEmptyOrIncompleteAuthzPayload(data)) {
        if (attempt === MAX_RETRIES) {
          throw new Error('authz/me returned empty body after retries');
        }
        await new Promise((r) => setTimeout(r, (attempt + 1) * 500));
        continue;
      }
      return data;
    } catch (err: unknown) {
      lastError = err;
      const status = (err as { response?: { status?: number } })?.response?.status;
      // Only retry on server errors (5xx), not auth errors (4xx)
      if (!status || status < 500 || attempt === MAX_RETRIES) {
        throw err;
      }
      // Wait before retry: 500ms, then 1000ms
      await new Promise((r) => setTimeout(r, (attempt + 1) * 500));
    }
  }

  throw lastError;
}

/**
 * Lightweight version check for cache invalidation polling.
 * Frontend calls this instead of full /me to detect permission changes.
 *
 * Codex 019dd818 iter-4 (B-prime): 401 must NOT be swallowed. Returning -1
 * triggered an unconditional /me re-fetch which then 401'ed again — semantik
 * "session expired" sinyalini kaybediyordu. 401 propagate edilir; PermissionProvider
 * `isUnauthorizedError(err)` true ise sessionExpired state'ini set eder.
 *
 * Network/5xx hata ise -1 fallback korunur (transient, retry next poll).
 */
export async function fetchAuthzVersion(
  httpGet: (url: string) => Promise<{ data: { authzVersion: number } }>,
): Promise<number> {
  try {
    const { data } = await httpGet('/v1/authz/version');
    return data.authzVersion;
  } catch (err: unknown) {
    if (isUnauthorizedError(err)) {
      throw err;
    }
    // Network/5xx/unknown — keep silent fallback so polling doesn't break.
    if (isServerError(err) || typeof (err as { response?: unknown })?.response === 'undefined') {
      return -1;
    }
    return -1;
  }
}

/**
 * Point authorization check via backend proxy.
 * CNS-20260411-005: Returns full CheckResponse with reason (not just boolean).
 */
export async function checkPermission(
  httpPost: (url: string, body: CheckRequest) => Promise<{ data: CheckResponse }>,
  request: CheckRequest,
): Promise<CheckResponse> {
  const { data } = await httpPost('/v1/authz/check', request);
  return data;
}

/**
 * Batch authorization check — multiple object-level checks in a single request.
 * CNS-20260411-005: Codex REJECT (without batch) — max 20 per call.
 */
export async function checkPermissionBatch(
  httpPost: (url: string, body: BatchCheckRequest) => Promise<{ data: BatchCheckResponse }>,
  checks: CheckRequest[],
): Promise<BatchCheckItem[]> {
  const { data } = await httpPost('/v1/authz/batch-check', { checks });
  return data.results;
}
