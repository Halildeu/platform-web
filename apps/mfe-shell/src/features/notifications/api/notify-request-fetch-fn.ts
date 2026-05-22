/**
 * Shared `fetchFn` for the authenticated notification-orchestrator RTK
 * Query clients (inbox / preferences / push / topic-catalog). The public
 * unsubscribe client carries no auth/identity headers, so it does not
 * need this workaround.
 *
 * Workaround for `Request`-object header drop observed at the wire layer
 * (PR-5.X-quartet follow-up; Codex thread {@code 019e075d} iter-7).
 * Extracted to this shared module 2026-05-22 (Codex {@code 019e50ac} /
 * {@code 019e5112} re-smoke): the WebPush §3.10 interactive smoke caught
 * {@code notify-prefs.api} + {@code notify-push.api} returning 401 on a
 * cold-load of {@code /settings/notifications} because — unlike
 * {@code notify-inbox.api} — they did not wire this fetchFn, so their
 * headers were dropped end-to-end.
 *
 * <p>Live evidence captured in DevTools on testai.acik.com:
 * <pre>
 *   fetch(url, { headers })                   → 200
 *   fetch(new Request(url, { headers }))      → 400 MissingRequestHeader
 *   fetch(url, { headers: new Headers(...) }) → 200
 * </pre>
 *
 * <p>The two failing and passing calls carried identical header
 * key/value pairs (asserted via header-entries dump in the spy); the
 * only difference was the Request-vs-string input form to {@code fetch}.
 * RTK Query 2.x's {@code fetchBaseQuery} defaults to the Request-object
 * form ({@code new Request(url, init)} → {@code fetch(request)}), which
 * trips this drop somewhere between the frontend pod's nginx and the
 * orchestrator.
 *
 * <p>This fetchFn unwraps an incoming {@code Request} and re-issues the
 * call with the string URL + plain init shape so the headers survive
 * end-to-end. Investigation of the underlying proxy/runtime difference
 * is queued as a separate follow-up — once isolated we can revert to
 * RTK's default fetcher.
 *
 * <p>Wire into a client via {@code fetchBaseQuery({ fetchFn:
 * unwrapRequestFetchFn, ... })}.
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
    // Codex iter-7 REVISE absorb: full Request semantics preservation.
    // {@code signal} is the critical one — RTK Query writes
    // {@code api.signal} (and any timeout signal) onto the Request
    // before calling fetchFn, so dropping it would silently disable
    // abort / timeout / cancel for these API queries. The remaining
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
    // body — the RTK Query mutations that do carry payloads will hit
    // this branch with input.body !== null and we faithfully forward.
    if (input.method !== 'GET' && input.method !== 'HEAD' && input.body !== null) {
      reissue.body = await input.clone().arrayBuffer();
    }
    return fetch(input.url, reissue);
  }
  return fetch(input, init);
}
