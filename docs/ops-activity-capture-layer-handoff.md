# Ops Activity Log — Capture Layer · HANDOFF

> Written 2026-07-12 for Jess (COO). Purpose: continue this work from ANY machine
> (Jess is switching MacBook → office computer). Everything here is on GitHub, so a
> fresh chat on another machine can pick up by reading this file + `git fetch`.
> **First thing a new chat should do:** `git fetch` · confirm you are on branch
> `fix/ops-activity-hide-imports` (or branch from origin/phase/10) · read this file.

## What we are building (this round ONLY — the "capture layer")

Make `ops_activity_log` from now on TRULY record **who did what**, with **controlled
action types**, **append-only**. NO staff-view pages this round. NO backfill of old
May seed data. NO deploy until Jess signs off.

Jess's 5 requirements:
1. Every write carries the acting **staff user_id** (actor) — captured at the DB via `auth.uid()`, never trusted from the client.
2. `action` = a **controlled whitelist/enum**, not free text (list below).
3. **Append-only** — past records not editable/deletable (notes are the only exception; a note edit is itself logged; deletes are tombstoned).
4. The event is written **in the same transaction** as the state change (raise a PO → "PO raised" + who, at that instant), never a manual after-the-fact entry.
5. Do NOT backfill old data — only get NEW actions right from now.

## 🔴 FOUNDATION FIRST — individual logins (Jess's admin task, no code)

The capture layer is worthless if staff share the `Operations`/`logistics@carres.com`
account — then every actor is "Operations". **Priority-1 = one login per staff**
(Shasha, Ching [starts 20 Jul], +1 [1 Aug]), disable shared login. Do this in the
Principal → Accounts UI. Fix this BEFORE (or in parallel with) the migration —
otherwise actor tracking records the wrong person. This is a policy/account action.

## Current state (audited 2026-07-12, all on origin — nothing lost)

- **Controlled action types ALREADY DESIGNED** in `packages/shared/src/order-activity.ts`
  (`OrderEventType`, 26 types + metadata: category / customerVisible / managementOnly /
  immutable / defaultTitle). This is the list to confirm (below). **BUT the DB does NOT
  enforce it** — `ops_activity_log.action` is free `text`, and writes still mix legacy
  strings (autocount_import, stock_reserve, annotation_added…) mapped to the taxonomy
  only at READ time (`eventTypeForLegacyAction`).
- **Actor**: the 5 migrations that write the log (0138, 0139, 0143, 0211, 0214) all
  include `actor_id` in the INSERT — but need a per-site audit of real-user vs system.
- **Append-only**: only a SELECT policy exists → users can't UPDATE/DELETE (good), but
  `service_role` still can. Could harden with a trigger.
- **Same-transaction**: 0211 triggers + inline RPC writes already fire with the change;
  needs a coverage audit for any state change that emits NO event.

## The 26 action types — CONFIRM / trim / add before coding

| Category | Types | Plain meaning |
|---|---|---|
| Milestone | order.placed / confirmed / dispatched / delivered / cancelled | order lifecycle |
| Edit | order.date_changed / order.field_changed | changed delivery date / any field |
| Money | payment.received / payment.voided | payment in / voided |
| Stock | stock.reserved / released / reassigned / takeout / flag_repair / ready | stock ops |
| PO / logistic | po.raised / po.status_changed / partner.assigned | PO + carrier |
| Exception | escalation.raised / resolved / waiver.requested / approved / rejected | escalations + storage waiver |
| Note | note.added / edited / deleted | human notes (only editable kind; edit/delete is itself logged) |
| System | order.imported | AutoCount import (machine) |

**Open question for Jess:** do Loan (borrow/return) and Route (transfer-leg done) need
their OWN event types? Today they don't have one. (migrations 0216 Route legs / 0217 Loan.)

## Planned migration (after Jess confirms the list — SQL shown to her first, apply to prod only on her "go")

1. DB **CHECK constraint** on `action` = the 26 whitelisted types (reject free text).
2. **Audit every write-site**: ensure real actor + canonical dotted type (drop legacy mixing).
3. **Hard append-only** trigger: reject UPDATE/DELETE on immutable events (even service_role; notes exempt).
4. **Coverage audit**: confirm every state-changing RPC emits its event inline; add any missing.
5. NO backfill · NO staff-view page · NO deploy.

## Branches / where things live (all pushed to origin = safe on any machine)

- `fix/ops-activity-hide-imports` (THIS work + the earlier activity-feed import-noise fixes) — pushed.
- `phase/10-order-detail-layout-redesign` = the order-panel redesign (Route/Loan/⋮, migrations 0215-0217) — pushed.
- Preview link (order panel, review-only, NOT prod): https://order-panel-preview.carres-portal.pages.dev
- DO NOT touch: `fix/order-import-canonical-alias` (main dir, other chat) · `feat/masters-thin-stub` (masters) · `phase/11-orders-list-lining-box` (Orders) — other sessions own these.

## International best-practice advice given (2026-07-12) — summary

Foundation = one login per staff (else all tracking is fake). Trust = capture at source ·
no silent gaps (triggers) · append-only but PDPA-legal · logging never breaks the sale.
Management = manage by EXCEPTION not activity counts · measure outcomes not clicks ·
workload/fairness not leaderboard · ramp-aware for new joiners. Scale (design for 10×) =
reads via pre-aggregated rollups not full-scans · index (actor,time)/(order,time)/(type) ·
paginate + archive · InitPlan-wrap RLS. Privacy = work-product logging OK, behavioural
surveillance NOT · transparent to staff · PDPA retention limits.
