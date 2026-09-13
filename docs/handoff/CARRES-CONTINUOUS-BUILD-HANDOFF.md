# HANDOFF — Carres Portal v2 · continuous build

Paste everything below the line into a fresh session. It is self-contained.

> **`docs/handoff/` HOLDS EXACTLY ONE LIVE PROMPT, AND THIS IS IT.**
>
> Two prompts existed here for four hours on 2026-09-01 and disagreed; a fresh
> session could not tell which one ruled (Law 5: *can the project have one file
> fewer?*). **When this lane's mission changes, OVERWRITE this file — never add a
> second one beside it.** Re-measure every number in §2 before trusting it.

---

CARRES PORTAL v2 — CONTINUOUS BUILD · PAYMENT OWNERSHIP SEAM · checkpoint 2026-09-13

## 1 · Where main and production stand

- `origin/main` = `f2fb3efe` (#1283); deployed on erp · pos · pages.dev · api (`/__carres_deploy.json`, `/health`).
  Working tree: clean on branch `build/so-assignment-source` from `f2fb3efe` (this file is the only change).
- Production tracker tail `0499`. Applied this lane: `0489` (collection-owner ledger + three doors), `0495`,
  `0498`, `0499` (all forward-only; function bodies reconcile by `md5(prosrc)`). Delivery's `0489…proof_is_reviewed`
  shares its number — baselined in `scripts/check-migrations.mjs` (#1269), both halves applied.
- `payment_collection_owners`: **0 rows**. `payment_duty`: 0 assignment rows, retired from the catalogue.
  `delivery_duty`: **not assigned**. `ops_delivery_contacts`: 5 rows, all recorded by the shared `Operations` login,
  0 with `acting_user_id`.

## 2 · Completed Payment functionality (production-verified, do not rebuild)

- PAYMENTS → Monitor · Payment Records (#1252–#1254), Work cache-key fix + regression proof (#1257/#1258),
  the two-calendar clock, collection timing as a setting (0486), 7-day free storage, approval doors shut.
- **Owner ruling 2026-09-13 delivered:** `Payment Duty` is gone from ordinary collection; the owner rule is
  `collection_owner` (shared engine) — ordinary balance, missed promise and storage-invoice collection resolve
  the same stable per-order owner; Finance exception → `finance_duty`; wrong/duplicate Payment → Payment
  Approver. Web: Monitor owner cell (`Nobody holds Delivery Duty. Staff & Duties` when unresolved; avatar title
  `Normal owner: X · Today's cover: Y`), workspace `Collection owner` section with `Hand over collection`
  (principal/manager), Communication History merges recorded results. API `/api/finance/collection-owner`
  (GET, POST /handover). All proven on the deployed UI with a labelled read-only injection (Monitor · Team Work ·
  My Work · Quick Rail agree; an unowned action stays visible and never enters an unrelated My Work).
- Ledger law (0489, keep): append-only `payment_collection_owners`; `payment_collection_owner_establish` is
  idempotent (an order with a row is never touched); `_handover` gated by `workspace_duty_settings_gate` with
  previous owner · new owner · reason · changed by · changed on · effective from; `_context` returns normal ·
  today's cover · acting · history. Cover = `workspace_duty_covers` on `delivery_duty` keyed by the NORMAL
  person; cover never rewrites the owner; work returns when cover ends.

## 3 · The newly discovered SO assignment source (VERIFIED on main + production)

`docs/orders/MASTER.md` §"How the PIC is decided" (LIVE, 0232 + 0235):
`ops_order_control.assigned_staff / assigned_by / assigned_at` + `ops_staff_settings` (available) + the
server-side sweep `POST /api/operation/staff/auto-assign` (`apps/api/src/routes/operation/staff.ts`) and
heartbeat `touch_last_seen` (0235). Rules as written: *one order, one owner, decided when the order arrives;
the system never moves an order off a person mid-flight on its own* — **and, in the same section**: *the sweep
re-spreads SYSTEM-assigned orders (`assigned_by` null) evenly across whoever is IN today; from 10:00 MYT a
member with no heartbeat counts as out and their system-assigned orders flow to whoever is in, then flow back*.
Human-assigned orders (`assigned_by` set, `ops_manager` only, `order-control.ts`) never move.

Measured in code (`staff.ts`): the pool is `ops_staff_settings` — a non-manager `operation` account is
auto-enrolled on its FIRST login unless `isOpsGenericAccount(email)` matches (an email heuristic; the test
account `operation-test@x.com` passed it, which is why it holds 100 orders); `available=false` is the existing
PERSON-LEVEL planned-leave flag ("temporarily away — new orders skip them"); `countsAsInToday(last_seen_at)`
is the 10:00 MYT heartbeat rule; the sweep (`POST /auto-assign`, fired by the web after each heartbeat)
re-splits EVERY open system-assigned order plus the unassigned evenly across members in today, every run —
so a system-assigned `assigned_staff` is an actor of the day, not a stable owner.

**Measured 2026-09-13:** 101 controls, 101 `assigned_by` null (all system); 100 → `E2E Test · operation`
(a test account, `staff_code` null), 1 → Shasha; `SO-1321`/`SO-1313` PIC = the test account.
The Work engine already resolves `order_pic` from `assigned_staff` (`work.ts`, `work-engine.ts`).

## 4 · The exact ownership mismatch to resolve (NOT resolved — hypothesis, not law)

Owner's rule (2026-09-13): an SO is auto-assigned to an INDIVIDUAL Operation follow-up person when it enters
Operations; that person continues customer follow-up incl. ordinary balance and storage collection; normal
responsibility stays stable; leave = buddy cover; permanent change = handover; PO/GRN/Finance keep their own
specialist rules (no universal SO owner).

- Today `assigned_staff` is **two things at once**: a stable owner for human-assigned orders, and a
  heartbeat-redistributed *actor* for system-assigned ones. That contradicts "stable normal responsibility";
  the redistribution is what buddy cover should express instead.
- This lane's 0489→0499 chain **overlooked `assigned_staff`** and inferred responsibility from the earliest
  contact (0495/0498) and the Delivery Duty holder (0489/0499). Per the owner: do not infer from contact
  history and do not ask for a Delivery Duty holder as a workaround.

Resolution direction to verify and build (forward-only; keep 0489 ledger/handover/cover; consolidate sources):
1. `delivery_responsible_operation(order, day)` → **ledger row (establishment/handover) → `assigned_staff`
   when an individual (`staff_code`), active, and the assignment is the NORMAL one → nobody**. Remove the
   contact-history and Delivery-Duty inference as owner sources (the contact writer keeps writing the four
   identities FROM this read; `acting_user_id` stays).
2. Make system assignment **stable**: the sweep deals UNASSIGNED orders once on arrival and stops re-spreading
   system-assigned ones; heartbeat absence becomes **cover** (acting today), not reassignment. Decide where the
   person-level cover fact lives (today cover is per DUTY in `workspace_duty_covers`; `ops_staff_settings.
   available` is a person-level leave flag) — reuse, do not add a third source.
3. A non-person account (`staff_code` null, e.g. `E2E Test · operation`, `Operations`) must never be a normal
   owner: keep the pool to individuals (Orders MASTER already says a generic account never joins — measure why
   the test account did).
4. Payment then reads the same function; `payment_collection_owner_establish` unchanged in shape.
Files: `apps/api/src/routes/operation/staff.ts` (sweep, `countsAsInToday`, `autoEnroll`),
`order-control.ts:188-198`, `orders.ts`, `work.ts` (`order_pic`, `collectionOwnerFor`),
`packages/shared/src/work-engine.ts`, `apps/web/src/pages/operation/OperationOrdersControl.tsx` (TeamPopover),
`supabase/migrations/0232_ops_staff_assignment.sql`, `0235_…presence.sql`, `0489/0495/0498/0499`,
`docs/orders/MASTER.md` §PIC, `docs/workspace/MASTER.md` §3–§4, `docs/delivery/MASTER.md` §5.1 · §13.1,
`docs/payment/MASTER.md` §10 · §14.

## 5 · Tests, migrations, PR state

- Green on main: `work.collection-owner.test.ts` (14), `collection-owner.test.ts` (5),
  `InvoiceCollectionOwner.test.tsx` (6), `delivery-arrangements.test.ts` (46 incl. the four-identity tests),
  `work-cache-isolation.test.tsx` (8); full web/API/shared suites green at #1267.
- Migrations: next free number = **0500** (re-measure across `git branch -r`; the Delivery lane moves fast).
- Open PRs from this lane: none. Rolled-back production probes are the SQL verification method
  (`begin … set_config(request.jwt.claims …) … rollback`; use the governed doors for assignments/covers; create
  temp tables AFTER switching role).

## 6 · Approved rules to preserve (owner, 2026-09-13)

Normal owner · today's cover · actual recorder · partner provenance are FOUR separate facts. A shared login may
record evidence, never own. Cover never rewrites the normal owner; work returns when cover ends. Only a formal
handover (full evidence, append-only) changes the normal owner. Owner identity is avatar/metadata, never words
in the action sentence. An unresolved owner keeps the action visible under its duty word with the Staff & Duties
door and never lands in an unrelated My Work. Payment UI stays unchanged. No new owner field; no daily rotating
owner; no per-customer manual assignment.

## 7 · Next step

Resolve §4 as one BUILD slice: verify the sweep/heartbeat behaviour in `staff.ts` against the owner's rule,
consolidate `delivery_responsible_operation` onto `assigned_staff` (forward-only migration 05xx), make system
assignment stable with cover instead of redistribution, keep the individual-only guard, re-run the full-chain
rolled-back probe (assignment → collection owner → cover → Monitor/My Work/Team Work/Quick Rail → handover
history), overwrite Orders/Workspace/Delivery/Payment MASTERs, PR → CI → merge → deploy → authenticated walk.
Ask the owner only if a genuine business choice remains (e.g. how the FIRST individual is dealt when the pool
holds no individual) — not for engineering mechanics.
