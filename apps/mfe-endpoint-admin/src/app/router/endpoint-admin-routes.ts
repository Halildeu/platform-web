/**
 * Canonical manifest of the endpoint-admin router routes + their surface scope.
 *
 * Single source of truth so the IA nav (which surfaces the fleet-discoverable
 * routes) and the router (`EndpointAdminRouter.tsx`) cannot silently drift — a
 * unit test (`__tests__/endpoint-admin-nav.config.test.ts`) asserts, in BOTH
 * directions, that the nav's paths exactly equal the `fleet` + `discoverable`
 * routes here, and that this manifest matches the router's declared `<Route>`
 * paths. Adding a shippable fleet route without a nav entry (or vice-versa) then
 * fails CI instead of quietly re-creating the "built but invisible" gap.
 *
 * Scope:
 * - `fleet`   — a fleet-wide surface reachable with no extra context.
 * - `device`  — needs a device context (reached from the device grid drawer).
 * - `session` — needs a live session id (reached from a session launcher).
 * - `detail`  — a deep-link detail/form reached from a list/contextual action.
 *
 * `discoverable` marks whether the route belongs in the fleet IA nav. A `fleet`
 * route can still be non-discoverable when its page isn't yet a real production
 * capability (e.g. `approvals` runs on a mock actor + localStorage pilot until
 * slice S3), so surfacing it would be false discoverability.
 */
export type EndpointAdminRouteScope = 'fleet' | 'device' | 'session' | 'detail';

export interface EndpointAdminRoute {
  /** Path relative to the `/endpoint-admin` mount (matches `<Route path>`). */
  path: string;
  scope: EndpointAdminRouteScope;
  /** Whether this route is surfaced in the fleet IA left-nav. */
  discoverable: boolean;
  /** Why a `fleet` route is not discoverable yet (audit trail). */
  note?: string;
}

export const ENDPOINT_ADMIN_ROUTES: readonly EndpointAdminRoute[] = [
  { path: 'devices', scope: 'fleet', discoverable: true },
  { path: 'status', scope: 'fleet', discoverable: true },
  { path: 'catalog/items', scope: 'fleet', discoverable: true },
  { path: 'software-bundles', scope: 'fleet', discoverable: true },
  { path: 'agent-updates/releases', scope: 'fleet', discoverable: true },
  { path: 'outdated-software-list', scope: 'fleet', discoverable: true },
  { path: 'prohibited-software-list', scope: 'fleet', discoverable: true },
  { path: 'software-diff-list', scope: 'fleet', discoverable: true },
  { path: 'enrollments', scope: 'fleet', discoverable: true },
  { path: 'compliance', scope: 'fleet', discoverable: true },
  { path: 'compliance/policies', scope: 'fleet', discoverable: true },
  { path: 'compliance/gaps', scope: 'fleet', discoverable: true },
  { path: 'audit', scope: 'fleet', discoverable: true },
  {
    path: 'approvals',
    scope: 'fleet',
    discoverable: false,
    note: 'Mock actor + localStorage policy-approval pilot, not the real backend maker-checker queue — deferred to slice S3.',
  },
  {
    path: 'approvals/uninstall/:deviceId/:requestId',
    scope: 'detail',
    discoverable: false,
  },
  { path: 'approvals/:requestId', scope: 'detail', discoverable: false },
  { path: 'policies/:policyId/approval/new', scope: 'detail', discoverable: false },
  {
    path: 'remote-response',
    scope: 'device',
    discoverable: false,
    note: 'Needs a device context + fail-closed session state; reached from the device drawer (slice S2).',
  },
  { path: 'remote-access/sessions/:sessionId/view', scope: 'session', discoverable: false },
];

/** Paths that belong in the fleet IA nav (fleet + discoverable). */
export const FLEET_DISCOVERABLE_PATHS: readonly string[] = ENDPOINT_ADMIN_ROUTES.filter(
  (route) => route.scope === 'fleet' && route.discoverable,
).map((route) => route.path);
