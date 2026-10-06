-- =============================================================================
-- 0356_a_delivery_order_is_a_document_with_its_own_register.sql
-- DELIVERY ORDER BLUEPRINT — SLICE 1 · the DO becomes a first-class document
-- (owner-approved card docs/cards/CARD-2026-08-16-delivery-order-blueprint.md;
--  docs/delivery/MASTER.md §3; docs/orders/MASTER.md §8).
--
-- THE RULING THIS SERVES — one delivery TRIP = one DO:
--
--   · most orders: one trip, one DO
--   · a split delivery or two destinations = one DO PER TRIP
--   · a failed trip keeps its Delivery exception FOREVER; a rebooked date
--     issues a NEW DO — the old one stays as history, both linked to the SO
--   · staff can never delete or void a DO; only an order cancellation or a
--     system-side reschedule voids one, recording reason + actor + time
--
-- WHY A TABLE, AND WHY NOW. `orders.do_number` holds exactly one number per
-- order, so a second trip's document had nowhere to exist and the register had
-- nothing to read. This table is the DO truth the register lists and the DO
-- object page renders.
--
-- ONE WRITER AT THE BOTTOM (Architecture Law A / D). Every path that mints a
-- DO today writes `orders.do_number` — the API mint, and the legacy 0098
-- dispatch backstop. Rather than teach each path about this table (a second
-- assembly per door, drifting apart), ONE trigger on that column materialises
-- the row. A future split-trip issue door inserts here directly and mirrors
-- the latest active number onto `orders.do_number` for the readers that
-- pre-date this table.
--
-- WHAT IS DELIBERATELY NOT STORED (Law D — one arithmetic):
--   · goods lines — derived from the order's lines through the ONE shared
--     delivery-groups module, scoped by `trip_groups` (0282 semantics:
--     NULL = the whole order). The print path already derives them this way.
--   · document status — derived from `delivery_attempts` (0344) + `voided_at`
--     by ONE shared arithmetic (`packages/shared/src/delivery-order-status.ts`).
--     A stored status a second writer could contradict is the retired
--     `payment_status` defect again.
--
-- NO ROW COUNT IS ASSERTED. The backfill walks whatever `orders.do_number`
-- rows exist; schema is what this migration owns (CLAUDE.md §5.8).
-- =============================================================================

create table if not exists public.ops_delivery_orders (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete restrict,
  do_number    text not null unique,
  issued_at    timestamptz not null default now(),
  -- The trip's scope, 0282's own semantics: NULL = the whole order; a split
  -- trip names its delivery groups. Never a second copy of the goods lines.
  trip_groups  text[],
  -- Facts of THIS trip as they stood at issue. The live booking columns move
  -- on to the next trip; the document keeps what it was issued for.
  delivery_date date,
  time_slot    text,
  logistics_partner text,
  issued_by    uuid references auth.users(id),

  -- Void — a stamp, never a delete (the 0343 rule, applied to documents).
  voided_at    timestamptz,
  void_reason  text check (void_reason in ('order_cancelled', 'rescheduled')),
  voided_by    uuid references auth.users(id),

  -- A voided document carries its full stamp, and a live one carries none.
  constraint ops_delivery_orders_void_stamped
    check ((voided_at is null) = (void_reason is null))
);

create index if not exists ops_delivery_orders_order_idx
  on public.ops_delivery_orders (order_id);

comment on table public.ops_delivery_orders is
  'One row per delivery TRIP''s document (blueprint card 2026-08-16). Status is DERIVED from delivery_attempts + voided_at; goods are DERIVED from the order''s lines scoped by trip_groups — neither is stored twice.';
comment on column public.ops_delivery_orders.trip_groups is
  '0282 semantics: NULL = the whole order; a split trip lists its delivery groups.';

alter table public.ops_delivery_orders enable row level security;

-- Everyone internal READS the register. Nobody writes it directly — rows are
-- materialised by the trigger below, and the only mutation is the void door.
drop policy if exists ops_delivery_orders_read_internal
  on public.ops_delivery_orders;
create policy ops_delivery_orders_read_internal
  on public.ops_delivery_orders
  for select using ((select public.is_internal()));

revoke insert, update, delete on public.ops_delivery_orders
  from authenticated, anon;

-- A DO handed to anyone is history. Wrong ones are VOIDED with their reason.
create or replace function public.ops_delivery_orders_no_delete()
returns trigger
language plpgsql
as $fn$
begin
  raise exception
    'a delivery order is never deleted — an order cancellation or a system reschedule voids it'
    using errcode = 'P0001', detail = 'delivery_order_not_deletable';
end;
$fn$;

drop trigger if exists ops_delivery_orders_no_delete
  on public.ops_delivery_orders;
create trigger ops_delivery_orders_no_delete
  before delete on public.ops_delivery_orders
  for each row execute function public.ops_delivery_orders_no_delete();

-- ── the ONE materialiser — every mint path already writes orders.do_number ──

create or replace function public.ops_delivery_orders_materialise()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_ctl record;
begin
  if new.do_number is null then
    return new;
  end if;
  if exists (select 1 from ops_delivery_orders d where d.do_number = new.do_number) then
    return new;
  end if;

  -- The trip facts as they stand at mint: the live booking columns (0277/0282)
  -- and the partner the appointment names (0346 first — the carrier the
  -- booking was actually made with; the assignment columns are the fallback).
  -- Absent facts stay NULL — a legacy mint with no booking is still a document.
  select c.booking_groups, c.confirmed_date, c.confirmed_time_slot,
         c.confirmed_partner_id
    into v_ctl
    from ops_order_control c
   where c.order_id = new.id;

  insert into ops_delivery_orders
    (order_id, do_number, trip_groups, delivery_date, time_slot,
     logistics_partner, issued_by)
  values
    (new.id,
     new.do_number,
     v_ctl.booking_groups,
     v_ctl.confirmed_date,
     v_ctl.confirmed_time_slot,
     (select p.name from delivery_partners p
       where p.id = coalesce(v_ctl.confirmed_partner_id,
                             new.ops_assigned_logistic,
                             new.delivery_partner_id)),
     auth.uid());
  return new;
end;
$fn$;

comment on function public.ops_delivery_orders_materialise() is
  'ONE writer for the DO register (0356): whichever door mints orders.do_number, the document row exists. A future split-trip door inserts directly and mirrors the active number.';

drop trigger if exists ops_delivery_orders_materialise on public.orders;
create trigger ops_delivery_orders_materialise
  after insert or update of do_number on public.orders
  for each row execute function public.ops_delivery_orders_materialise();

-- ── the void door — order cancellation / system reschedule only ─────────────

create or replace function public.delivery_order_void(
  p_do_id  uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role app_role;
  v_row  ops_delivery_orders;
begin
  -- Operation runs the cancellation and reschedule flows; principal is the
  -- go-live fallback (the 0355 pattern). There is deliberately NO free-form
  -- reason: the two enumerated causes ARE the whole law — staff cannot void.
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'forbidden: a delivery order is voided only by the cancellation or reschedule flow'
      using errcode = '42501', detail = 'forbidden';
  end if;

  if p_do_id is null
     or p_reason is null
     or p_reason not in ('order_cancelled', 'rescheduled') then
    raise exception 'a void names its cause: order_cancelled or rescheduled'
      using errcode = '22023', detail = 'invalid_void_reason';
  end if;

  select * into v_row from ops_delivery_orders where id = p_do_id for update;
  if v_row.id is null then
    raise exception 'delivery order not found'
      using errcode = '42P01', detail = 'delivery_order_not_found';
  end if;
  if v_row.voided_at is not null then
    return to_jsonb(v_row); -- idempotent: already voided, same answer
  end if;

  update ops_delivery_orders
     set voided_at   = now(),
         void_reason = p_reason,
         voided_by   = auth.uid()
   where id = p_do_id
   returning * into v_row;

  return to_jsonb(v_row);
end;
$fn$;

comment on function public.delivery_order_void(uuid, text) is
  'The ONE void door (0356). Reason is constrained to order_cancelled | rescheduled — staff cannot void a DO; the flows call this, recording reason + actor + time.';

-- ── backfill: the documents that already exist become register rows ─────────
-- Walks whatever orders carry a number today; asserts nothing about counts.

insert into public.ops_delivery_orders
  (order_id, do_number, trip_groups, delivery_date, time_slot,
   logistics_partner, issued_at)
select o.id,
       o.do_number,
       c.booking_groups,
       c.confirmed_date,
       c.confirmed_time_slot,
       (select p.name from public.delivery_partners p
         where p.id = coalesce(c.confirmed_partner_id,
                               o.ops_assigned_logistic,
                               o.delivery_partner_id)),
       coalesce(o.dispatched_at, now())
  from public.orders o
  left join public.ops_order_control c on c.order_id = o.id
 where o.do_number is not null
on conflict (do_number) do nothing;
