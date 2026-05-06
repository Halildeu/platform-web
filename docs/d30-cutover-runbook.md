# D30 Pre-Production Cutover Runbook

> **Purpose:** Operational checklist for the atomic pre-production →
> production cutover. Generic release health is covered by
> [release-health-checklist.md](./release-health-checklist.md); this
> document is the **D30 single-event** cutover plan with environment
> switch, credential rotation, irreversible-action gating, smoke
> verification, rollback, and go/no-go decision recording.
>
> **Why D30:** The repo has been operating in
> [Pre-Production Full Authority mode](../.claude/CLAUDE.md) where the
> agent owns end-to-end credential generation, schema seeding, and
> persona test fixtures. At cutover (T-D30), production credentials,
> persona accounts, and any secret materials reset to permanent values
> and the agent's pre-production authority shrinks back to its normal
> production-time boundary. This document is the **closing transaction**
> for that mode.

---

## §0 Quick reference

| Field                      | Value                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------- |
| Cutover window             | _set on go decision; T-D30 to T+0_                                                    |
| Window length              | 2-hour code freeze + 1-hour switch + 4-hour soak                                      |
| Owner (one-pager)          | _assign at T-D7 planning_                                                             |
| Comms channel              | _slack channel set at T-D14_                                                          |
| Rollback decision deadline | T+1h from switch (any longer = forward-fix)                                           |
| Go/no-go quorum            | Owner + 1 reviewer + 1 ops lead — written approval in `docs/d30-cutover-decisions.md` |

---

## §1 T-D14 — Pre-cutover preparation (pre-window)

### §1.1 Inventory + freeze prep

- [ ] Generate **artifact inventory** at frozen commit:
      `node scripts/release/inventory.mjs --frozen-commit <sha> > docs/d30-inventory.txt`
      (file lists every package version, every workflow, every container tag)
- [ ] Confirm artifact inventory committed to repo so it's part of the
      audit trail (not a fly-away file).
- [ ] Lock branch protection: only owner + CI bot can push to `main`
      during the cutover window.
- [ ] **Pin `web-test-gate-required` aggregator as required check** in
      branch protection (Settings → Branches → main → Required status
      checks). Do NOT pin individual jobs — the aggregator already
      `needs:` the required set and is the single intentional pin
      point. Pre-prod state: branch protection currently OFF (verified
      via `gh api repos/<owner>/<repo>/branches/main/protection`); this
      step flips it on.
- [ ] **Run dry-run suite** with `pnpm gate:dry-run:all` (PR-13).
      The script asserts every fixture under
      `scripts/ci/fixtures/strict-gates/` matches its declared
      `_expected_exit`; mismatch means the aggregator's logic has
      drifted from the YAML and the cutover plan needs review.
      Operator reference:
      [`docs/operations/strict-gates-cheat-sheet.md`](operations/strict-gates-cheat-sheet.md).
- [ ] **Flip `STRICT_GATES=true` repo Actions variable** (Settings →
      Secrets and variables → Actions → Variables). Pre-prod default
      is unset (advisory). Once flipped, advisory job **infra**
      failures fail the aggregator: cssom-full install crash, lint
      job install crash, missing/empty/invalid `eslint-report.json`,
      or a crash in the summarize/comment script. ESLint's own exit
      code is masked by `|| true` in the lint step (intentional —
      severity-2 diagnostics are counted as `ignored_errors` and
      tracked as separate debt). Warning **count** is intentionally
      NOT promoted by STRICT_GATES — that needs a baseline shrink
      first. cssom-full has 3 strict-gates checks; lint has 2 (no
      `outcome != success/skipped` rule on lint — see cheat-sheet).
- [ ] Comms message draft (T-D7 send).

### §1.2 Credential / secret materials map

List every secret that must rotate at cutover. Each row gets a binary
"rotated?" check at T-D1.

| Secret                                   | Source                    | Pre-prod value   | Prod target         | Owner         |
| ---------------------------------------- | ------------------------- | ---------------- | ------------------- | ------------- |
| `KEYCLOAK_ADMIN_PASSWORD`                | Vault `kv/keycloak/admin` | randomized dev   | rotate to prod      | ops-lead      |
| `DB_SUPERUSER`                           | Vault `kv/postgres/super` | dev superuser    | rotate to prod      | ops-lead      |
| `JWT_SIGNING_KEY`                        | Vault `kv/auth/jwt`       | dev rotating key | persistent prod RSA | sec-lead      |
| `OAUTH_CLIENT_SECRET`                    | Vault `kv/oauth/internal` | dev secret       | rotate to prod      | sec-lead      |
| `GITHUB_RELEASE_TOKEN`                   | GH Actions secrets        | personal PAT     | org PAT             | release-mgr   |
| User personas (`d35-admin-persona`, etc) | Keycloak                  | seeded by agent  | retired             | persona-owner |

> **HARD RULE — Kullanıcı login user'ının şifresine dokunma.** Test
> personas (e.g. `test-admin@`, `d35-admin-persona`) get retired here.
> Real user accounts (e.g. the project lead's login) keep their
> existing credentials; we do NOT reset them as part of cutover.

### §1.3 Backout artifacts

- [ ] Pre-build the **previous-release** container images and tag them
      `<service>:rollback-d30`. Store digest in `docs/d30-rollback-tags.txt`.
- [ ] Confirm backup snapshot of every stateful service (Postgres,
      Vault, Keycloak realm) within the last 24h.
- [ ] Test the backup restore on a staging clone — record duration in
      `docs/d30-rollback-tags.txt` so the T+1h decision has a real
      number to weigh against.

---

## §2 T-D7 — Stage parity validation

The cutover only succeeds if pre-prod and a staging clone behave
identically against the **production database schema**. This phase
gives that signal.

### §2.1 Stage smoke

- [ ] Stage = pre-prod commit `<sha>` deployed against a copy of the
      production database (most recent backup restored to stage).
- [ ] Run the SSRM contract smoke (#7 follow-up, see
      [backend-integration.md](../.claude/rules/backend-integration.md))
      against stage: - `/api/v1/users` pagination, sort, search, filter contract - reporting grid endpoints listed in adoption matrix
- [ ] Run a11y gate against deployed Storybook (already covered by
      `a11y-gate.yml`).
- [ ] Run x-charts visual gate desktop + mobile baselines on the
      stage build (Faz 21.10 W8).
- [ ] Run end-to-end happy paths (login, CRUD on each MFE).

### §2.2 Parity exit criteria

Stage smoke must produce a **clean** diff vs. pre-prod baseline:

- [ ] No new tracebacks, error spikes, or `5xx` responses on stage.
- [ ] No drift in `docs/x-charts-adoption-matrix.json`.
- [ ] CI workflows pass on the frozen commit (re-run, not stale).

If parity fails: **abort cutover**, fix, re-validate. Do **not** treat
stage failures as advisory.

---

## §3 T-D1 — Final preparation day

### §3.1 Credential rotation rehearsal

- [ ] In a sealed shell (recorded session), rotate each secret in the
      §1.2 table. Confirm Vault writes succeed without manual
      intervention.
- [ ] Update GH Actions / Vault / Keycloak with the **production**
      values, but keep them gated behind a feature flag or service
      account that only activates at T+0.
- [ ] Verify production smoke account (read-only service account)
      can authenticate against the new values.

### §3.2 Comms freeze

- [ ] Send T-D1 reminder to comms channel; freeze any scope-creep
      requests until T+4h soak completes.
- [ ] Confirm on-call rotation covers T-1h to T+8h.

---

## §4 T-0 — Atomic cutover execution

The atomic cutover is a **single sequenced window**. Each step has an
explicit success signal and an explicit failure mode.

### §4.1 Code freeze (T-2h to T-0)

```bash
# Lock branch protection harder — block even owner pushes during the
# freeze. Audit log will show this transition.
gh api -X PUT repos/{owner}/{repo}/branches/main/protection \
  --input docs/d30-branch-protection-locked.json
```

- Success signal: GH UI shows protection rule active + last commit
  matches the frozen artifact inventory commit.
- Failure mode: any commit lands during the freeze → abort cutover,
  rewind protection, restart at T-D1.

### §4.2 Environment switch (T-0 to T+30m)

Sequenced switch:

1. **DB target switch** — point production gateway at the new
   schema (DNS + connection-pool drain).
2. **Auth provider switch** — Keycloak realm activated; old realm
   tagged read-only.
3. **App layer switch** — gateway routes traffic to the post-cutover
   app cluster (`prod-d30` → `prod`).
4. **Edge cache flush** — CDN purge, browser cache headers verified.

Each step's success signal:

- DB: connection-pool stats show old pool drained, new pool active.
- Auth: a service account can mint a fresh JWT against the new realm.
- App: `/healthz` returns 200 from prod cluster.
- CDN: a fresh `index.html` request returns the post-cutover hash.

Failure mode for any step → **rollback** (see §6).

### §4.3 Credential rotation activation (T+30m)

- [ ] Rotate every secret in §1.2 to the prod target value.
- [ ] Retire pre-prod test personas (delete from Keycloak realm).
- [ ] Update Vault policies so the agent role no longer carries
      pre-prod admin grants. **Pre-Production Full Authority closes
      here.**
- [ ] Confirm CI workflows re-authenticate against new GH org PAT.

---

## §5 T+0 to T+4h — Soak window

### §5.1 Smoke checklist (run at T+30m, T+1h, T+2h, T+4h)

| Check               | Tool                                       | Pass signal                                 |
| ------------------- | ------------------------------------------ | ------------------------------------------- |
| Login → dashboard   | Playwright happy-path                      | <5s, no console error                       |
| User CRUD           | curl + token                               | 200/201/204 with expected body              |
| Reporting grid SSRM | curl + filter model                        | rows + total + secondaryColumns             |
| x-charts dashboard  | Playwright visual                          | no regression vs. desktop + mobile baseline |
| A11y gate           | `node scripts/ci/a11y-gate.mjs`            | coverage ≥ 70%                              |
| Bundle size         | `node scripts/ci/bundle-size.mjs --budget` | within budget                               |
| Error rate          | monitoring                                 | <0.1% over 15-min sliding window            |

- Each smoke run logs to `docs/d30-soak-log.md` with timestamp + pass/fail
  per row. **No empty rows; every check fires.**

### §5.2 Decision points

- **T+1h**: continue soak, partial rollback, or full rollback. Decision
  gets recorded with names + reasoning.
- **T+2h**: continue soak or partial rollback (no full rollback past
  this point — forward-fix only).
- **T+4h**: cutover complete; close window.

---

## §6 Rollback procedure

> **Decision deadline: T+1h from switch.** After that, partial fixes
> only. Full revert past T+1h costs more than forward-fixing.

### §6.1 Trigger conditions

Any of:

- Error rate >1% over 5-min window
- Login flow broken end-to-end
- Data integrity issue detected (mismatched row counts, orphaned FKs)
- Auth provider unreachable
- Unrecoverable cache poisoning

### §6.2 Rollback sequence

1. Flip CDN routes back to `prod-pre-d30` cluster.
2. Restore Vault secrets to **pre-prod** snapshot from §1.3 backup.
3. Re-deploy `<service>:rollback-d30` container tags.
4. Run §5.1 smoke checks; confirm pre-prod state restored.
5. File `docs/d30-rollback-postmortem.md` within 24h.

### §6.3 What rollback does NOT undo

- Data writes that landed on the new prod schema after T+0 → manual
  reconciliation if rollback fires.
- Comms broadcasts already sent → follow-up correction only.

---

## §7 Closure

### §7.1 Sign-off

- [ ] Owner records final decision in `docs/d30-cutover-decisions.md`.
- [ ] Update Pre-Production Full Authority section in `.claude/CLAUDE.md`
      with the cutover timestamp and confirm the agent boundary has
      shrunk to production-time policy.
- [ ] Close T-D14 comms message thread with summary.

### §7.2 Post-mortem (within 7 days)

- [ ] What worked, what didn't.
- [ ] Did rollback ever come close to firing? Why?
- [ ] Update this runbook with lessons learned for the next cutover
      (D60? D90? gradual production ramp?).
- [ ] If any HARD RULE in `.claude/CLAUDE.md` got bent during cutover,
      explicit retrospective + reaffirm.

---

## §8 Related docs

- [release-health-checklist.md](./release-health-checklist.md) — generic
  per-release smoke (use for non-cutover releases)
- [incident-response.md](./incident-response.md) — pager + escalation
- [`.claude/rules/backend-integration.md`](../.claude/rules/backend-integration.md)
  — SSRM contract referenced by §2.1 / §5.1 stage smoke
- [`.claude/CLAUDE.md` — Pre-Production Full Authority](../.claude/CLAUDE.md)
  — the operating mode this cutover closes

---

## §9 Owner protocol

- One-pager owner is named at T-D7 planning. They own this document
  during the window.
- Document changes during the cutover window are PR-only with same-day
  review by the cutover quorum (§0).
- After T+4h, normal docs review applies.
