/**
 * `fetchFn` for the endpoint-admin RTK Query client.
 *
 * Workaround for the `Request`-object header drop observed at the wire
 * layer between the frontend pod's nginx and the orchestrator. Mirrors
 * the notify-domain shim documented in
 * `apps/mfe-shell/src/features/notifications/api/notify-request-fetch-fn.ts`
 * (originally extracted in platform-web #652 mergeCommit `07805aa`;
 * shared module pattern refined in Codex thread `019e50ac` /
 * `019e5112`).
 *
 * <p>Faz 22 ALLOW-path browser smoke (2026-05-24) caught the same drop
 * on `endpointAdminApi`. Live evidence captured in-browser on
 * testai.acik.com against all three endpoint-admin routes:
 * <pre>
 *   fetch(url, { headers: { Authorization: 'Bearer ...' } })
 *     → 200 / 403 (header reached backend, FGA evaluated)
 *   fetch(new Request(url, { headers: new Headers(...) }))
 *     → 401 "JWT token zorunludur." (header dropped end-to-end)
 * </pre>
 * Both calls carried identical header key/value pairs; the only
 * difference was the Request-vs-string input form to `fetch`. RTK
 * Query 2.x `fetchBaseQuery` defaults to the Request-object form
 * (`new Request(url, init)` → `fetch(request)`), which trips the
 * drop. Without this shim, all three endpoint-admin RTK queries
 * (`getAgentStatus`, `listEndpointDevices`, `listEndpointAuditEvents`)
 * return 401 even when `localStorage.token` is set + `prepareHeaders`
 * writes `Authorization`. With this shim, the same calls return
 * 200/403 as appropriate.
 *
 * <p>Investigation of the underlying proxy/runtime difference is queued
 * as a shared follow-up — once isolated we can revert both notify and
 * endpoint-admin to RTK's default fetcher and remove the shim. Until
 * then the shim is copied (not shared) because module-federation
 * singleton sharing is not effective for endpoint-admin (`#655`
 * forensics: separate `__FEDERATION__.__INSTANCES__` entry per remote;
 * cross-remote utility imports fall through to local instance and
 * miss the shell-registered version).
 *
 * <p>Wire into a client via `fetchBaseQuery({ fetchFn:
 * unwrapRequestFetchFn, ... })`.
 */
export async function unwrapRequestFetchFn(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (typeof Request !== 'undefined' && input instanceof Request) {
    const headers: Record<string, string> = {};
    input.headers.forEach((value, key) => {
      headers[key] = value;
    });
    // Full Request semantics preservation (matches notify shim Codex
    // iter-7 absorb). `signal` is the critical one — RTK Query writes
    // `api.signal` (and any timeout signal) onto the Request before
    // calling fetchFn; dropping it would silently disable
    // abort/timeout/cancel for these API queries. The remaining
    // properties (referrerPolicy, keepalive) are added for parity so
    // the unwrapped reissue is byte-equivalent to the original Request.
    const reissue: RequestInit = {
      method: input.method,
      headers,
      credentials: input.credentials,
      mode: input.mode,
      cache: input.cache,
      redirect: input.redirect,
      referrer: input.referrer,
      referrerPolicy: input.referrerPolicy,
      integrity: input.integrity,
      keepalive: input.keepalive,
      signal: input.signal,
    };
    // Don't fabricate an empty ArrayBuffer when the caller never set a
    // body. The endpoint-admin client is GET-only at the moment, but
    // we forward the body branch for parity with the notify shim so
    // future POST/PATCH mutations carry payload correctly.
    if (input.method !== 'GET' && input.method !== 'HEAD' && input.body !== null) {
      reissue.body = await input.clone().arrayBuffer();
    }
    return fetch(input.url, reissue);
  }
  return fetch(input, init);
}
