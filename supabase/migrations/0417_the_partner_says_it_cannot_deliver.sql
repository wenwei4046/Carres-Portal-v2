-- 0417_the_partner_says_it_cannot_deliver.sql
-- Delivery Card 07 — the partner portal's second act, AND the repair of
-- 0412's latent door defect (docs/delivery/MASTER.md §2 + §5).
--
-- ── THE DEFECT, STATED PLAINLY ──────────────────────────────────────────────
-- 0386 keyed ops_delivery_arrangement_events by `arrangement_id NOT NULL`.
-- 0412's door (`delivery_arrangement_message_prepared`) inserts by
-- `(order_id, leg, …)` — columns the table never had. plpgsql defers column
-- resolution to run time and the rolled-back probe stopped at the auth check,
-- so the defect reached production silently: every message-prepared record
-- since 0412 failed (the web call is deliberately fire-and-forget, so no
-- operator was blocked). This migration adds the scope columns the door
-- already speaks, backfills them, and the door works unchanged.
--
-- ── WHY SCOPE COLUMNS RATHER THAN FORCING AN ARRANGEMENT ROW ────────────────
-- `message_prepared` and `cannot_deliver` are facts about a SCOPE. Minting an
-- arrangement row just to hang an activity on it would write assignment truth
-- as a side effect of an activity — the exact quiet-write shape the
-- architecture forbids. So the event carries its scope directly; the
-- arrangement link stays when one exists.
--
-- ── THE PARTNER'S SECOND ACT ────────────────────────────────────────────────
--   "NETS uses Cannot Deliver only when it cannot perform the arrangement.
--    A reason and actual reply/report evidence are required."
-- A portal-direct report IS its own evidence (the partner's own login,
-- append-only, governed reason). It blocks nothing and reassigns nothing;
-- Operations decides what happens next through its own doors.

set search_path = public;

-- ── scope columns, backfilled from the arrangement link ─────────────────────
alter table public.ops_delivery_arrangement_events
  add column if not exists order_id uuid references public.orders(id) on delete cascade,
  add column if not exists leg smallint;

update public.ops_delivery_arrangement_events e
   set order_id = a.order_id,
       leg      = a.leg
  from public.ops_delivery_arrangements a
 where e.arrangement_id = a.id
   and e.order_id is null;

-- Every event names its scope; the arrangement link becomes optional.
alter table public.ops_delivery_arrangement_events
  alter column arrangement_id drop not null;

alter table public.ops_delivery_arrangement_events
  drop constraint if exists ops_delivery_arrangement_events_scope_named;
alter table public.ops_delivery_arrangement_events
  add constraint ops_delivery_arrangement_events_scope_named
    check (order_id is not null and leg is not null and leg between 0 and 20);

comment on column public.ops_delivery_arrangement_events.order_id is
  '0413: the scope''s order — every event names its scope directly; arrangement_id remains as an optional link so an activity event never mints an arrangement row.';

-- ── the event dictionary grows the partner report ───────────────────────────
alter table public.ops_delivery_arrangement_events
  drop constraint if exists ops_delivery_arrangement_events_event_check;
alter table public.ops_delivery_arrangement_events
  add constraint ops_delivery_arrangement_events_event_check
    check (event in ('assigned', 'changed', 'cleared', 'message_prepared', 'cannot_deliver'));

-- A Cannot Deliver without a reason is a shrug, not a report.
alter table public.ops_delivery_arrangement_events
  drop constraint if exists ops_delivery_arrangement_events_cannot_deliver_needs_reason;
alter table public.ops_delivery_arrangement_events
  add constraint ops_delivery_arrangement_events_cannot_deliver_needs_reason
    check (event <> 'cannot_deliver' or reason_key is not null);
