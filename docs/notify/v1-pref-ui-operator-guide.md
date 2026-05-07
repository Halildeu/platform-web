# Notification Preferences UI — Operator Guide

> **Status**: ACTIVE (Faz 23.5 PR3)
> **Scope**: subscriber-facing notification preferences page (mute /
> wildcard rules / quiet hours).
> Companion to `docs/notify/v1-ui-operator-guide.md` (Faz 23.4 inbox UI).

---

## What ships in Faz 23.5

The mfe-shell now exposes a "Bildirim Tercihleri" entry in the user
menu. The page lives at `/settings/notifications` and lets the
authenticated user inspect and edit preference rules that gate
notification delivery for their account.

UI capability matrix (v1 minimal):

| Action              | Surface                                | API call                                     |
| ------------------- | -------------------------------------- | -------------------------------------------- |
| List existing rules | Table, newest-first by `updated_at`    | `GET /api/v1/notify/preferences/me`          |
| Add a new rule      | Inline form: topic + channel + enabled | `PUT /api/v1/notify/preferences/me`          |
| Toggle enabled      | Per-row "Açık / Kapalı" pill           | `PUT /api/v1/notify/preferences/me`          |
| Delete a rule       | Per-row "Sil" → two-stage confirm      | `DELETE /api/v1/notify/preferences/me/{id}`  |
| Bulk mark-all-read  | Bell drawer "Tümünü okundu say"        | `POST /api/v1/notify/inbox/me/mark-all-read` |

---

## Backend wire

| Surface        | Endpoint                                     | Identity                               |
| -------------- | -------------------------------------------- | -------------------------------------- |
| List rules     | `GET /api/v1/notify/preferences/me`          | `X-Org-Id` + `X-Subscriber-Id` headers |
| Upsert rule    | `PUT /api/v1/notify/preferences/me`          | same headers                           |
| Delete rule    | `DELETE /api/v1/notify/preferences/me/{id}`  | same headers                           |
| Bulk mark-read | `POST /api/v1/notify/inbox/me/mark-all-read` | same headers                           |

All endpoints share the `SubscriberIdentityGuard` trusted-claim-set
match (PR #94: `subscriberId` → `userId` → `sub` priority); identity
mismatch returns 403.

The preference surface is feature-gated by
`notify.preferences.enabled` (default `true`). When disabled (e.g.
`NOTIFY_PREFERENCES_ENABLED=false` overlay override), every endpoint
returns 503 with `{"error":"preferences_disabled"}`. The page surfaces
this as an inline message: "Bildirim tercihi özelliği bu ortamda
kapalı."

---

## Wildcard semantics

`topicKey` and `channel` are nullable; `null` means "all topics" /
"all channels". The composite-key index
`(org_id, subscriber_id, topic_key, channel)` honors NULL on both
sides, so a subscriber can write at most one row per tuple of:

- `(topicKey="auth.password-reset", channel="email")` — exact rule
- `(topicKey="auth.password-reset", channel=null)` — channel wildcard
- `(topicKey=null, channel="email")` — topic wildcard
- `(topicKey=null, channel=null)` — full mute ("all topics & channels")

Dispatch resolution priority (Faz 23.5 PR2 absorb — Codex iter P1):

1. Exact tuple match
2. Channel wildcard
3. Topic wildcard
4. Both-null wildcard
5. No match → default ALLOW (per ADR-0013 D46 #8)

Critical bypass: `severity=critical` AND `bypassForCritical=true` →
ALLOW regardless of `enabled`.

---

## Bulk mark-all-read

The bell drawer's "Tümünü okundu say" button (Faz 23.5 PR4) replaces
the v1 N+1 per-row mark-read loop with a single backend call. Backend
captures a server-side cutoff timestamp on the handler's first line and
the WHERE clause filters
`state=UNREAD AND createdAt <= cutoff`, so a notification arriving
between the request landing and the UPDATE is not collateral-marked-as-
read — UX-correct for "mark everything I've seen".

Returns `{updatedCount, cutoff}` for audit / future UX feedback. SSE
fires a single `inbox-updated` event post-bulk (not per row) so the
bell badge updates once.

Race-safe on a single pod with NTP-synced cluster (sub-second drift).
Canonical DB-clock cutoff (`CURRENT_TIMESTAMP`) tracked as Faz 23.5
hardening if multi-pod clock drift surfaces in production.

---

## Browser smoke (operator)

Pre-requisite: the user is logged into the gateway with a valid JWT
cookie; backend pod is up (ESO Vault `kv/platform/notify` seeded).

### 1. Navigate to the page

```
1. Click avatar → "Bildirim Tercihleri" → /settings/notifications
2. Or browse directly to https://testai.acik.com/settings/notifications
```

### 2. Add a rule

```
1. Konu: report.export.ready
2. Kanal: email
3. Etkin: ☐ (unchecked = mute)
4. Click "Kuralı kaydet"
   → row appears in the table; PUT request fires; LIST refetch
```

### 3. Toggle an existing rule

```
1. Click the "Açık" / "Kapalı" pill → PUT with inverted enabled
2. Wait ~200ms → row updates after refetch
```

### 4. Delete a rule

```
1. Click "Sil" on a row → "Emin misiniz?" inline prompt appears
2. Click "Onayla" → DELETE fires; row drops on refetch
2'. (Or click "Vazgeç" to cancel; no mutation fires)
```

### 5. Bulk mark-all-read smoke

```
1. Open the bell drawer
2. Switch to "Bildirimlerim" tab
3. Click "Tümünü okundu say" → single POST /me/mark-all-read
4. Bell badge drops to 0 (or to the count of rows arriving after cutoff)
5. SSE event arrives → no individual row events
```

To verify the request shape:

```js
// DevTools → Network → Filter "preferences" or "mark-all-read"
// PUT /api/v1/notify/preferences/me
//   Request payload: {topicKey, channel, enabled, ...}
//   No orgId/subscriberId in body — those are headers
// POST /api/v1/notify/inbox/me/mark-all-read
//   Empty body; response: {updatedCount: N, cutoff: "2026-..."}
```

---

## Faz 23.6 PR-B1 — richer editor (shipped)

The page now ships a `FormDrawer`-based detailed editor alongside the
inline quick-add form. Operators reach it via "Detaylı kural ekle"
under the inline form, or per-row "Düzenle". The drawer covers:

- **Quiet hours** — canonical shape `{ start: "HH:mm", end: "HH:mm",
timezone, days: ["MON".."SUN"] }`. `start === end` is rejected (use
  the rule's `Etkin: kapalı` for 24h mute). Non-canonical (legacy or
  hand-edited) payloads are preserved verbatim while editing unrelated
  fields — the row summary surfaces them as "Özel sessiz saatler".
- **Daily frequency limit** — number input with a "Limit yok" checkbox.
  Both `null` (legacy rows) and `0` collapse to "Limit yok" in the UI;
  saving "Limit yok" sends `frequencyLimitPerDay: 0` so the backend's
  "0 disables" contract becomes canonical.
- **`bypassForCritical`** — under "Gelişmiş ayarlar"; defaults to ON.
  Turning it off makes the rule apply to severity=critical messages
  too; the row summary highlights `OFF` with an amber badge.

The new "Kısıtlar" table column shows compact badges (clock icon for
quiet hours, gauge for the daily limit, bell-off for bypass turned
off) so operators can scan rules without opening each one.

Quick "Açık / Kapalı" toggle preserves `quietHours`,
`frequencyLimitPerDay`, and `bypassForCritical` so a one-click mute
does not silently reset the rule's restrictions.

## Out of scope (deferred)

- **Bulk preference operations** (mute all email, restore defaults) —
  needs a backend bulk contract (Faz 23.6 **PR-A**); the FE bulk
  buttons land in **PR-C** once the contract is canonical.

- **DLR admin view** (delivery attempt table by intent_id) —
  shipped in [Faz 23.5 PR6](./v1-dlr-admin-operator-guide.md) (PR #104
  - PR #291).

---

## Cross-AI peer review trail (HARD RULE)

Codex thread `019e021f` ran the Faz 23.5 plan. Findings absorbed
across the 4 PRs:

- **PR1 #97 backend bulk mark-all-read** (iter-1..2). PARTIAL →
  AGREE. Cutoff captured on the handler's first line; clock model
  documented honestly; repo Testcontainers integration tests added;
  endpoint moved to `/me/mark-all-read` for symmetry with the inbox
  surface.

- **PR2 #99 backend preferences API** (iter-1..2). REVISE → AGREE.
  Both-null wildcard previously writeable but unread on dispatch
  (would have leaked through as `no_preference_set` ALLOW). Added
  `findByOrgIdAndSubscriberIdAndTopicKeyIsNullAndChannelIsNull` to
  the repo + 4th evaluate fallback. `enabled` field flipped from
  primitive `boolean` to `Boolean + @NotNull` so a missing payload
  field surfaces as 400 instead of silent unintended mute. Stale
  retry-by-update Javadoc claim removed.

- **PR3 #285 FE preferences UI** (iter-1..2). REVISE → AGREE. Page
  was added but had no AppRouter route + user menu still pointed
  to `/admin/themes` — fixed with new Route `/settings/notifications`
  - user menu entry visible to all authenticated users. Delete
    button switched from single-click to two-stage inline confirm
    (Sil → Emin misiniz? → Onayla / Vazgeç) so accidental clicks no
    longer clear mute rules.

- **PR4 #286 FE bulk integration** (iter-1, AGREE). N+1 markRead
  loop replaced with single `useMarkAllAsReadMutation`; Inbox/LIST
  - UnreadCount/BADGE tag invalidation; tests verify per-row
    `markRead` is never called.

---

## Referans

- Backend: `notification-orchestrator/src/main/java/com/serban/notify/`
  - `api/PreferenceController.java`
  - `api/InboxController.java` (`markAllAsRead`)
  - `preference/SubscriberPreferenceService.java`
  - `repository/SubscriberPreferenceRepository.java`
- Frontend: `apps/mfe-shell/src/`
  - `pages/settings/NotificationPreferencesPage.tsx`
  - `features/notifications/api/notify-prefs.api.ts`
  - `features/notifications/api/notify-inbox.api.ts` (`markAllAsRead`)
  - `app/router/AppRouter.tsx` (`/settings/notifications`)
  - `app/layout/header/UserMenuDropdown.tsx` (menu entry)
- Codex review thread: `019e021f-1194-7493-b287-1a6897e8ec4b`
