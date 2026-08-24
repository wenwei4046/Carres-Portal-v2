-- =============================================================================
-- 0379_delivery_owns_the_arrangement_the_order_owns_the_promise.sql
-- DELIVERY WORK CORRECTION (owner ruling 2026-08-24) · docs/delivery/MASTER.md §8
-- =============================================================================
--
-- THE OWNER'S SENTENCE THIS MIGRATION EXISTS FOR:
--
--   "Write to the Delivery scope/Journey leg — not the Sales Order as
--    duplicated truth."
--
-- Until now, picking a carrier wrote `orders.delivery_partner_id` — a SALES
-- ORDER column holding a DELIVERY fact. Architecture Law A ("one record, one
-- owner") forbids it, and the cost was not theoretical:
--
--   1. A Journey cannot be expressed. KL → JB → Singapore has TWO carriers and
--      one column holds one of them.
--   2. A change leaves no trace. `Change logistics` requires a reason and a
--      history; an UPDATE on a column keeps neither.
--   3. Two writers, one column: Sales' Accept-Proceed door sets it, and
--      Delivery setting it too meant last-writer-wins, silently.
--
-- So Delivery gets its own record, keyed by the SCOPE — `(order_id, leg)` —
-- with `leg = 0` meaning the whole-order trip and `leg >= 1` meaning one leg of
-- a Delivery Journey (matching `orders.delivery_stops[].leg`).
--
-- ── WHAT THIS MIGRATION DELIBERATELY DOES NOT DO ────────────────────────────
--
-- It does NOT backfill, and it does NOT drop `orders.delivery_partner_id`.
--
-- · No backfill, because CLAUDE.md §6 is explicit that every row in this
--   database today is TEST data and go-live starts clean. A backfill would
--   invent an arrangement history that nobody performed — and this table's
--   whole value is that its history is real (see
--   `feedback_events_record_business_not_system_steps`).
-- · The Sales column stays because Sales' own doors still write it for their
--   own purposes and other surfaces still read it. Delivery simply stops being
--   one of its writers. Removing it is a separate Sales-owned decision, and a
--   migration that reaches into another module's column to delete it is exactly
--   the boundary defect this card is correcting.
--
-- READS during the transition: the workspace prefers the ARRANGEMENT and falls
-- back to the order's column when no arrangement row exists yet, so nothing
-- disappears from the screen on the day this ships and no row needs touching.
--
-- ── SCHEMA IS WHAT THIS OWNS; DATA IS WHAT IT WALKS PAST (Red line 8) ────────
-- No row count is asserted anywhere below.
--
-- Migration number: tracker tail 0374, repository tail 0376, and branch
-- `claude/purchasing-02-so-batch-purchase` claims 0377 + 0378. Taken as MAX + 1
-- per ENGINEERING §5, never from `ls`.
-- =============================================================================

create table if not exists public.ops_delivery_arrangements (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  -- 0 = the whole-order scope; 1..n = a Delivery Journey leg.
  leg           smallint not null default 0 check (leg >= 0 and leg <= 20),

  partner_id    uuid references public.delivery_partners(id),
  -- Delivery's own agreed operational date. A BARE DATE on purpose: a delivery
  -- happens on a day in Malaysia, and storing a timestamp would let a UTC
  -- runner and a Klang operator disagree about which day that is.
  confirmed_date      date,
  confirmed_time      text,
  -- Narrower than the window, and optional: `14:30`.
  expected_arrival    time,
  logistics_note      text,
  -- The partner's ACTUAL reply on file. Prepared, copied, opened or sent never
  -- means confirmed (docs/delivery/MASTER.md §2), so the proof has its own home.
  reply_proof_path    text,
  -- Condo trips: the building wants a name and a plate before the day.
  driver_name   text,
  vehicle       text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id),

  -- ONE arrangement per scope. This is the constraint that makes the table a
  -- record of a scope rather than a log of edits.
  constraint ops_delivery_arrangements_scope_key unique (order_id, leg)
);

comment on table public.ops_delivery_arrangements is
  '0379 — Delivery''s OWN record of how one delivery scope travels, keyed by '
  '(order_id, leg). Delivery is its only writer. Sales Orders keeps the '
  'commercial promise (orders.delivery_date, address, goods); this keeps the '
  'operational arrangement. leg=0 is the whole-order trip, leg>=1 a Journey leg.';

comment on column public.ops_delivery_arrangements.confirmed_date is
  'A bare business DATE, never a timestamp: a delivery happens on a day in '
  'Malaysia and a stamp would let UTC and MYT disagree about which day.';

create index if not exists ops_delivery_arrangements_order_idx
  on public.ops_delivery_arrangements (order_id);
create index if not exists ops_delivery_arrangements_partner_idx
  on public.ops_delivery_arrangements (partner_id)
  where partner_id is not null;
-- The workspace's own rail question: what is going out on a given day.
create index if not exists ops_delivery_arrangements_confirmed_idx
  on public.ops_delivery_arrangements (confirmed_date)
  where confirmed_date is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- THE HISTORY — append-only, and the reason `Change logistics` can be governed
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Owner ruling: "Never silently replace an existing Logistics Partner.
-- Changing an existing Partner uses governed `Change logistics`, requiring
-- reason and history."
--
-- The reason lives HERE rather than as a column on the arrangement, because an
-- arrangement that has changed partners three times has three reasons and a
-- column can hold one. A row here is written by the same transaction that moves
-- the partner, so a change without its reason cannot exist.

create table if not exists public.ops_delivery_arrangement_events (
  id              uuid primary key default gen_random_uuid(),
  arrangement_id  uuid not null
                    references public.ops_delivery_arrangements(id) on delete cascade,
  event           text not null check (event in ('assigned', 'changed', 'cleared')),
  from_partner_id uuid references public.delivery_partners(id),
  to_partner_id   uuid references public.delivery_partners(id),
  -- Governed key from CHANGE_LOGISTICS_REASONS (@carres/shared). Required for
  -- 'changed' by the constraint below; absent on a first assignment, because
  -- picking a carrier for the first time is not a change and inventing a reason
  -- for it would make every history line say the same meaningless thing.
  reason_key      text,
  note            text,
  recorded_by     uuid references auth.users(id),
  recorded_at     timestamptz not null default clock_timestamp(),

  constraint ops_delivery_arrangement_events_change_needs_reason
    check (event <> 'changed' or reason_key is not null)
);

comment on table public.ops_delivery_arrangement_events is
  '0379 — append-only history of an arrangement''s carrier. A ''changed'' row '
  'cannot exist without its governed reason (check constraint), which is how '
  '"never silently replace an existing Logistics Partner" is enforced in the '
  'database rather than only in a dialog.';

-- `clock_timestamp()`, not `now()`: 0372's lesson. `now()` is TRANSACTION time,
-- so two events written in one transaction tie and the history cannot be
-- ordered. A lineage you cannot order is not a lineage.
comment on column public.ops_delivery_arrangement_events.recorded_at is
  'clock_timestamp(), never now() — see 0372: transaction time ties within one '
  'statement and an unorderable history is not a history.';

create index if not exists ops_delivery_arrangement_events_arrangement_idx
  on public.ops_delivery_arrangement_events (arrangement_id, recorded_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- GRANTS AND RLS
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 0367's lesson applied on the way IN: Supabase's ALTER DEFAULT PRIVILEGES
-- hands `authenticated` ALL on every new object in `public`. Revoke first, then
-- grant only what these tables exist to give.

revoke all on public.ops_delivery_arrangements from authenticated, anon;
revoke all on public.ops_delivery_arrangement_events from authenticated, anon;

grant select on public.ops_delivery_arrangements to authenticated;
grant select on public.ops_delivery_arrangement_events to authenticated;

-- Said twice on purpose (0363's shape): the blanket revoke above already covers
-- these, and naming them makes the intent unmissable to the next reader.
revoke insert, update, delete on public.ops_delivery_arrangements from authenticated, anon;
revoke insert, update, delete on public.ops_delivery_arrangement_events from authenticated, anon;

alter table public.ops_delivery_arrangements enable row level security;
alter table public.ops_delivery_arrangement_events enable row level security;

-- READ: any signed-in INTERNAL user. `public.is_internal()` is the portal's one
-- answer to "is this an employee" (0363 and every RLS migration since use it);
-- a hand-rolled role list here would be a second answer that drifts the first
-- time a role is added. Wrapped in a scalar sub-select so Postgres evaluates it
-- ONCE per query rather than once per row (the RLS performance rule in
-- docs/ENGINEERING.md).
drop policy if exists ops_delivery_arrangements_read on public.ops_delivery_arrangements;
create policy ops_delivery_arrangements_read
  on public.ops_delivery_arrangements for select
  using ((select public.is_internal()));

drop policy if exists ops_delivery_arrangement_events_read on public.ops_delivery_arrangement_events;
create policy ops_delivery_arrangement_events_read
  on public.ops_delivery_arrangement_events for select
  using ((select public.is_internal()));

-- WRITE: no policy at all, deliberately — 0366's shape. Every write goes
-- through the Worker's service-role route, which is where the governed
-- `Change logistics` reason check and the history write live together in one
-- transaction. A direct client UPDATE could move a partner without its history,
-- which is precisely what the owner ruled must be impossible.

-- `updated_at` is maintained by the writing route, not a trigger: the route
-- already writes `updated_by` in the same statement and a trigger that sets one
-- while the route sets the other is two authors for one row.
