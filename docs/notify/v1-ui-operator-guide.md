# Notification UI v1 — Operator Guide

> **Status**: ACTIVE (Faz 23.4 PR-E.5)
> **Scope**: notification-orchestrator subscriber-facing UI (in-app inbox).
> Companion to `docs/runbooks/RB-faz-23-2-hpa-prometheus-adapter.md`
> in the gitops repo.

---

## What ships in v1

The mfe-shell `NotificationCenter` drawer now has **two tabs**:

| Tab               | Source                                    | Storage                                                      |
| ----------------- | ----------------------------------------- | ------------------------------------------------------------ |
| **Sistem**        | Local UI events (toasts, audit pings)     | `notifications` Redux slice (localStorage-persisted, max 50) |
| **Bildirimlerim** | Backend `notification-orchestrator` inbox | RTK Query (`notifyInboxApi`) + live SSE                      |

The bell badge sums both sources so the user sees one total unread
count. The inbox tab is **disabled** until the AuthBootstrapper resolves
the user identity (`/api/v1/authz/me`); the SSE connection is also
skipped in that state to avoid 401 burst at boot.

---

## Backend wire

| Surface               | Endpoint                                                      | Identity                                              |
| --------------------- | ------------------------------------------------------------- | ----------------------------------------------------- |
| List active inbox     | `GET /api/v1/notify/inbox/me?page&size`                       | `X-Org-Id` + `X-Subscriber-Id` headers                |
| Unread badge          | `GET /api/v1/notify/inbox/me/unread-count`                    | same headers                                          |
| Mark as READ          | `POST /api/v1/notify/inbox/{id}/read`                         | same headers                                          |
| Archive (soft delete) | `POST /api/v1/notify/inbox/{id}/archive`                      | same headers                                          |
| Live unread stream    | `GET /api/v1/notify/inbox/me/stream?orgId&subscriberId` (SSE) | query params (EventSource cannot send custom headers) |

The backend `SubscriberIdentityGuard`
(`notification-orchestrator/.../api/SubscriberIdentityGuard.java`,
landed in PR #94) validates that the supplied `subscriberId` matches one
of the JWT principal's trusted identity claims (`subscriberId | userId |
sub` priority). Cross-account access returns **403** Forbidden.

---

## Identity resolution (frontend)

`selectNotifyIdentity(state)` in
`apps/mfe-shell/src/features/notifications/model/identity.selectors.ts`
returns `{ orgId, subscriberId }` or `null`. Resolution priority:

1. `state.auth.authzSnapshot.userId` — canonical DB user id from the
   `/api/v1/authz/me` response (matches what notification producers
   stamp into `recipient.subscriberId`).
2. `state.auth.user.id` — JWT `sub` claim fallback (Keycloak UUID).

`orgId` is hard-coded to `"default"` until the multi-tenant claim lands
(Faz 24 hardening).

---

## Live badge — SSE

`useInboxUnreadSse(identity)` in
`apps/mfe-shell/src/features/notifications/api/useInboxUnreadSse.ts`
opens an `EventSource` with `withCredentials: true` so the gateway
httpOnly JWT cookie travels with the SSE handshake. On every
`unread-count` event the hook:

1. Patches the `getUnreadCount` RTK Query cache directly (immediate UI
   re-render of the badge).
2. Patches the `listInbox` cache's `unreadCount` field (so the drawer
   summary stays consistent without a full refetch).
3. Invalidates the `Inbox / LIST` tag (next drawer mount fetches the
   fresh row collection).

Reconnect: exponential backoff `1s → 2s → 4s … capped at 30s`. The
backoff resets on a clean `open` event.

Race protection (Codex iter-7 absorb): every effect run scopes its own
`cancelled` flag; stale handlers and timers from a prior identity check
the captured flag, never the new one. Identity flip from alice → bob
during a pending reconnect timer cannot resurrect alice's connection.

---

## Browser smoke (operator)

Pre-requisite: ESO `kv/platform/notify` Vault path seeded so the backend
pod is up (see gitops runbook). The user must be logged into the
gateway with a valid JWT cookie.

### 1. Cookie / SameSite verify

The shell's auth flow stores the JWT in an `httpOnly` `Secure`
`SameSite=Lax` cookie via `POST /auth/cookie` (gateway). On a same-origin
deploy (`testai.acik.com` for both UI and gateway) the cookie travels
automatically with `credentials: 'include'`.

```bash
# 1. Open https://testai.acik.com and log in normally.
# 2. DevTools → Application → Cookies → testai.acik.com.
#    Look for the JWT cookie (name set by the auth-service); should
#    show HttpOnly ✓, Secure ✓, SameSite Lax.
```

### 2. Inbox list smoke

```bash
# DevTools → Console:
fetch('/api/v1/notify/inbox/me', {
  credentials: 'include',
  headers: {
    'X-Org-Id': 'default',
    'X-Subscriber-Id': '<your-userId-from-/v1/authz/me>',
  },
}).then(r => r.json()).then(console.log);
# Expected: { items: [...], page: 0, size: 20, totalElements: N, totalPages: M, unreadCount: K }
```

### 3. SSE live badge smoke

Open the bell drawer and switch to the **Bildirimlerim** tab. In a
second terminal trigger a NOTIFY (cluster-side) — the recipe in the
gitops runbook
[`RB-faz-23-2-hpa-prometheus-adapter.md`](https://github.com/Halildeu/platform-k8s-gitops/blob/main/docs/runbooks/RB-faz-23-2-hpa-prometheus-adapter.md)
"Cross-pod smoke deterministik" section produces a `pg_notify` event in
a transactional INSERT. The browser badge should update **without a
page refresh**.

To verify the SSE connection in the browser:

```js
// DevTools → Network → Filter: EventStream
// Look for: /api/v1/notify/inbox/me/stream?orgId=default&subscriberId=<id>
// Status: 200, Type: eventsource, time-to-first-byte should be < 500ms.
```

### 4. Mark-read / archive smoke

The active list (`/me`) shows rows in state `UNREAD` or `READ`; only
`ARCHIVED` is filtered out. So:

- **Mark-read** (primary action / deep-link click): the row state flips
  `UNREAD → READ` server-side. The row **stays in the list** (now styled
  as read). The bell badge drops by 1 because `unreadCount` decremented.
- **Archive** ("Arşivle" button): the row state flips to `ARCHIVED`. The
  row **disappears** from the active list on the next render (RTK Query
  invalidates the `Inbox / LIST` tag and refetches). If the archived row
  was unread, the badge also drops by 1.

---

## Out of scope (deferred)

Bullet list (instead of a Markdown table) because the items contain
pipe characters in JWT claim names and TypeScript union types that
break table rendering on GitHub.

- **DLR admin view** (delivery attempt table by intent_id) — defer to
  **Faz 23.5 PR1**. Backend gap: `GET /api/v1/notify/intents/{id}/deliveries`
  and `GET /api/v1/admin/notify/deliveries` endpoints don't exist yet.
  v1 UI focuses on the subscriber-facing inbox; operator/audit DLR
  surface lives in mfe-audit and needs the new endpoints first.

- **Bulk mark-all-read** server endpoint — defer to **Faz 23.5
  wishlist**. v1 UI loops mark-read per visible row. Acceptable for
  typical drawer sizes (≤ 50 rows); heavy-volume users get N+1
  requests.

- **Canonical `subscriberId` JWT claim** — defer to **Faz 23.5 / 24
  hardening**. Backend guard accepts any of three trusted JWT claim
  names today, in priority order: `subscriberId`, `userId`, `sub`.
  Long-term Keycloak emits a single canonical `subscriberId` claim;
  producers and consumers pin to it; the selector tightens at that
  point.

- **Multi-tenancy** (`orgId` from JWT claim) — defer to **Faz 24**.
  Single-tenant for now (`"default"`). When the tenant claim lands,
  `selectNotifyIdentity` extends to read it, and
  `SubscriberIdentityGuard` extends to validate it.

---

## Cross-AI peer review trail (HARD RULE)

Every PR in the v1 UI plan went through Code Claude → Reviewer Codex
peer review (thread `019e01ba`). Findings caught and absorbed (bullet
list because the trusted-claim-set names contain pipe characters that
break Markdown tables):

- **Backend #94 SubscriberIdentityGuard** — iter-1..3. Trusted claim
  set (priority order: `subscriberId`, `userId`, `sub`) — producer
  convention was undefined; the original sub-only design would have
  broken legitimate access.

- **FE #276 identity bootstrap + RTK Query** — iter-4 (RED). Wire
  types didn't match Spring DTOs: real fields are
  `subject/bodyText/locale/page/size`, not made-up
  `pageNumber/pageSize`. Selector picked JWT `sub` UUID instead of
  the canonical `userId` claim.

- **FE #277 NotificationCenter 2-tab** — iter-5..6 (RED + cleanup).
  design-system `NotificationDrawer` was stripping `headerAccessory`
  so the tab switcher would never render. Mapper priority
  `low/medium/high` violated the `"normal"` / `"high"` contract.

- **FE #278 SSE hook** — iter-7..8 (REVISE). Stale reconnect race
  (shared `cancelledRef`) and SSE-pushed count not actually wired
  into the badge.

The full thread is preserved in
`/Users/halilkocoglu/.claude/projects/-Users-halilkocoglu-Documents-platform-web/memory/`
for audit and future reference.

---

## Referans

- Backend: `notification-orchestrator/src/main/java/com/serban/notify/api/`
  - `InboxController.java` (REST CRUD)
  - `InboxSseController.java` (SSE stream)
  - `SubscriberIdentityGuard.java` (auth boundary)
- Frontend: `apps/mfe-shell/src/features/notifications/`
  - `api/notify-inbox.api.ts` (RTK Query)
  - `api/useInboxUnreadSse.ts` (SSE hook)
  - `model/identity.selectors.ts` (identity resolution)
  - `model/inbox-item-mapper.ts` (DTO → surface adapter)
- GitOps: `kustomize/overlays/test/kustomization.yaml`
  notification-orchestrator-config (SECURITY_JWT_ISSUER_URI override)
