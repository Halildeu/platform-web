/**
 * Endpoint-admin capability/error-state classifier (platform-web #922 slice S4a,
 * Codex istişare 019f67ba AGREE).
 *
 * Codex RED-flag this design exists to AVOID: "treating an HTTP status as a
 * UNIVERSAL feature-state contract". The same `404` means "capability not
 * deployed" on a fleet capability-list endpoint but "record not found" on a
 * detail endpoint; a bare `503` is a transient outage UNLESS the endpoint
 * documents a dark-ship flag. So classification is ENDPOINT-SPECIFIC: each call
 * site passes the policy describing what its ambiguous statuses mean.
 *
 * Two-part seam (keep them apart): this pure classifier reads the raw RTK/API
 * error and returns a `CapabilityStateKind`; the `<CapabilityState>` presentation
 * component renders a kind and never inspects a raw error. That keeps HTTP/API
 * interpretation unit-testable and decoupled from copy.
 */

/**
 * The mutually-exclusive states a fleet surface can present. `empty` is a
 * SUCCESSFUL-response concern owned by the page (2xx + zero rows) and is never
 * produced by {@link classifyCapabilityError} — the classifier only ever runs on
 * the error branch.
 */
export type CapabilityStateKind =
  | 'empty'
  | 'forbidden'
  | 'notEnabled'
  | 'disabled'
  | 'temporarilyUnavailable'
  | 'error';

/**
 * Per-ENDPOINT interpretation of otherwise-ambiguous statuses. Omitting a field
 * means "this endpoint gives that status its plain HTTP meaning" (e.g. no
 * `notEnabledOn` ⇒ a 404 here is a generic not-found/error, not "not enabled").
 */
export interface EndpointCapabilityPolicy {
  /** Statuses that mean "capability not deployed/installed here" (e.g. `[404]` on a fleet capability list). */
  readonly notEnabledOn?: readonly number[];
  /** Statuses that mean "feature switched off" — ONLY where a dark-ship flag is documented (e.g. `[503]` on display-policy). */
  readonly disabledOn?: readonly number[];
}

/** Fleet capability-list surface: 404 ⇒ not deployed; 503 stays transient. */
export const FLEET_CAPABILITY_POLICY: EndpointCapabilityPolicy = { notEnabledOn: [404] };

/** Dark-ship feature-flagged surface: 404 ⇒ not deployed; 503 ⇒ switched off (documented). */
export const FEATURE_FLAGGED_POLICY: EndpointCapabilityPolicy = {
  notEnabledOn: [404],
  disabledOn: [503],
};

/** Detail/record surface: a 404 is "record not found" (generic), never "not enabled". */
export const RESOURCE_DETAIL_POLICY: EndpointCapabilityPolicy = {};

/**
 * Machine-readable problem codes — the DURABLE contract. When the backend sends a
 * structured reason (`error.data.code`, RFC-7807-ish) it WINS over status
 * heuristics, so adding a code server-side needs no page change. The backend does
 * not emit these for most endpoints yet; the status + policy path is today's
 * fallback.
 */
const PROBLEM_CODE_KIND: Readonly<Record<string, CapabilityStateKind>> = {
  FEATURE_DISABLED: 'disabled',
  MODULE_NOT_INSTALLED: 'notEnabled',
  MODULE_NOT_ENABLED: 'notEnabled',
  DEPENDENCY_UNAVAILABLE: 'temporarilyUnavailable',
};

/**
 * Numeric HTTP status if the RTK error is an HTTP `FetchBaseQueryError`, else
 * `undefined`. RTK's transport failures carry a STRING status
 * (`'FETCH_ERROR' | 'TIMEOUT_ERROR' | 'PARSING_ERROR' | 'CUSTOM_ERROR'`), so a
 * non-numeric status deliberately yields `undefined` → generic error (never a
 * capability verdict). A `PARSING_ERROR`'s `originalStatus` is intentionally
 * ignored: a body we could not parse is not evidence of a capability state.
 */
export function httpStatusOf(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: unknown }).status;
    if (typeof status === 'number') return status;
  }
  return undefined;
}

/** Structured problem code (`error.data.code`), upper-cased, if present. */
function problemCodeOf(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data: unknown }).data;
    if (data && typeof data === 'object' && 'code' in data) {
      const code = (data as { code: unknown }).code;
      if (typeof code === 'string' && code.length > 0) return code.toUpperCase();
    }
  }
  return undefined;
}

/**
 * Classify a FAILED request into a capability/error state.
 *
 * Only ever call this on the error branch. It never returns `empty`: an absent
 * error or absent data must NOT become `empty`/`notEnabled` — that would mask a
 * transport failure as "no data" (a Codex data-integrity RED-flag). Deciding
 * `empty` is the page's job, and only after a SUCCESSFUL response.
 *
 * Precedence: structured problem code → endpoint status policy → HTTP-status
 * defaults → generic `error`. Non-HTTP errors always fall to `error`.
 */
export function classifyCapabilityError(
  error: unknown,
  policy: EndpointCapabilityPolicy = {},
): CapabilityStateKind {
  // Durable path: an explicit machine-readable reason wins over any heuristic.
  const code = problemCodeOf(error);
  if (code && code in PROBLEM_CODE_KIND) return PROBLEM_CODE_KIND[code];

  const status = httpStatusOf(error);
  // Transport / parse / custom / unknown — never a capability verdict.
  if (status === undefined) return 'error';

  // Endpoint policy first, so an endpoint can override a status' plain meaning.
  if (policy.notEnabledOn?.includes(status)) return 'notEnabled';
  if (policy.disabledOn?.includes(status)) return 'disabled';

  // A 401 is a SESSION concern (token expiry → re-auth at the shell), NOT an
  // authorization verdict; never render it as "forbidden".
  if (status === 401) return 'error';
  if (status === 403) return 'forbidden';
  // 404 without a `notEnabledOn` policy is a generic not-found, not "not enabled".
  if (status === 404) return 'error';
  // A bare 503 (no documented dark-ship flag) is a transient dependency outage.
  if (status === 503) return 'temporarilyUnavailable';
  return 'error';
}

/** Kinds whose remedy is a retry — the others (forbidden/notEnabled/disabled/empty) will not change on retry. */
export const RETRYABLE_KINDS: ReadonlySet<CapabilityStateKind> = new Set<CapabilityStateKind>([
  'error',
  'temporarilyUnavailable',
]);
