-- 0277_delivery_booking_two_stage.sql
-- Delivery Module D1 — two-stage booking (Provisional → Confirmed).
-- Loo approved 2026-07-26. Frozen source: Carres_Delivery_Module_Build_Prompt.md
-- §7 (Two-Stage Booking) + DELIVERY_IMPLEMENTATION.md D1.
--
-- Booking state lives on the ops_order_control overlay, NOT on orders (Loo's
-- call 2026-07-26): 0159 keeps core `orders` untouched, and the three nearest
-- relatives — logistic_eta (0189), delivery_time_slot (0161),
-- customer_confirmed (0220) — already live here, with RLS + the 0211 activity
-- trigger in place.
--
-- The D1 vocabulary (locked):
--   * logistic_eta (0189)       = Stage 1 PROVISIONAL date — what the CARRIER
--                                 said. It was never the customer's yes.
--   * booking_stage             = none / provisional / confirmed.
--   * confirmed_date + slot     = Stage 2 — what the CUSTOMER confirmed.
--   * customer_confirmed_at/by  = the confirmation evidence stamp.
-- customer_confirmed (0220, dormant since drawer rev25) is DEPRECATED by
-- booking_stage: kept so history reads, but no writer and no reader.

set search_path = public;

-- ── columns ──────────────────────────────────────────────────────────────────
alter table public.ops_order_control
  add column if not exists booking_stage text not null default 'none',
  add column if not exists confirmed_date date,
  add column if not exists confirmed_time_slot text,
  add column if not exists customer_confirmed_at timestamptz,
  add column if not exists customer_confirmed_by uuid;

alter table public.ops_order_control
  add constraint ooc_booking_stage_check
    check (booking_stage in ('none', 'provisional', 'confirmed'));

-- Invariant #1 (D1, 永不能破): date + time slot BOTH present before a booking
-- may read Confirmed. A carrier date alone — or a date with no slot — is never
-- a confirmation. Enforced here AND in the confirm endpoint (belt + braces).
alter table public.ops_order_control
  add constraint ooc_confirmed_needs_date_and_slot
    check (
      booking_stage <> 'confirmed'
      or (confirmed_date is not null and confirmed_time_slot is not null)
    );

comment on column public.ops_order_control.booking_stage is
  'D1 two-stage booking (0277): none / provisional (a carrier date sits in logistic_eta) / confirmed (the CUSTOMER confirmed date + time slot).';
comment on column public.ops_order_control.confirmed_date is
  'Customer-confirmed delivery date (Stage 2, 0277). Only the customer''s own yes goes here — a carrier-suggested date stays in logistic_eta.';
comment on column public.ops_order_control.confirmed_time_slot is
  'Customer-confirmed delivery time slot (Stage 2, 0277). Required together with confirmed_date — a date with no slot is still Provisional.';
comment on column public.ops_order_control.customer_confirmed_at is
  'Confirmation evidence stamp (0277) — when the customer''s yes was recorded.';
comment on column public.ops_order_control.customer_confirmed_by is
  'app_users.id of whoever recorded the customer''s confirmation (actor-column convention, no FK).';
comment on column public.ops_order_control.customer_confirmed is
  'DEPRECATED — use booking_stage (0277). 0220 drawer marker, UI removed rev25; kept only so history reads.';

-- ── backfill ─────────────────────────────────────────────────────────────────
-- BEFORE the audit trigger learns the new fields (no activity-log spam): a
-- carrier date already on file is exactly the Stage-1 provisional state. No
-- row is backfilled to confirmed — that is the whole D1 point: nothing the
-- system holds today is a customer confirmation.
update public.ops_order_control
  set booking_stage = 'provisional'
  where logistic_eta is not null and booking_stage = 'none';

-- ── stage derivation trigger ─────────────────────────────────────────────────
-- Whoever writes logistic_eta — the drawer PUT today, any future door — the
-- stage follows by construction (the 0274 lesson: put the rule on the table,
-- not in one route). A confirmed booking never silently downgrades here;
-- leaving `confirmed` is the confirm endpoint's business only.
create or replace function public.trg_ops_control_booking_stage()
returns trigger
language plpgsql
as $$
begin
  if new.booking_stage = 'confirmed' then
    return new;
  end if;
  if new.logistic_eta is not null and new.booking_stage = 'none' then
    new.booking_stage := 'provisional';
  elsif new.logistic_eta is null and new.booking_stage = 'provisional' then
    new.booking_stage := 'none';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ops_control_booking_stage on public.ops_order_control;
create trigger trg_ops_control_booking_stage
  before insert or update on public.ops_order_control
  for each row execute function public.trg_ops_control_booking_stage();

-- ── activity capture (0211 trigger, extended) ────────────────────────────────
-- Body pulled from live pg_get_functiondef 2026-07-26 (repo rule: never retype
-- a live function), with three appended blocks: booking_stage, confirmed_date,
-- confirmed_time_slot. Everything above them is byte-identical to live.
create or replace function public.trg_log_ops_control_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor uuid := coalesce(auth.uid(), new.updated_by);
begin
  begin
    if new.balance is distinct from old.balance then
      perform public._ola_field_changed(new.order_id, v_actor, 'balance',
        old.balance::text, new.balance::text);
    end if;
    if new.payment_status is distinct from old.payment_status then
      perform public._ola_field_changed(new.order_id, v_actor, 'payment_status',
        old.payment_status, new.payment_status);
    end if;
    if new.logistic_eta is distinct from old.logistic_eta then
      perform public._ola_field_changed(new.order_id, v_actor, 'logistic_eta',
        old.logistic_eta::text, new.logistic_eta::text);
    end if;
    if new.stock_eta is distinct from old.stock_eta then
      perform public._ola_field_changed(new.order_id, v_actor, 'stock_eta',
        old.stock_eta::text, new.stock_eta::text);
    end if;
    if new.balance_due_date is distinct from old.balance_due_date then
      perform public._ola_field_changed(new.order_id, v_actor, 'balance_due_date',
        old.balance_due_date::text, new.balance_due_date::text);
    end if;
    if new.called_customer is distinct from old.called_customer then
      perform public._ola_field_changed(new.order_id, v_actor, 'called_customer',
        old.called_customer::text, new.called_customer::text);
    end if;
    if new.delivery_time_slot is distinct from old.delivery_time_slot then
      perform public._ola_field_changed(new.order_id, v_actor, 'delivery_time_slot',
        old.delivery_time_slot, new.delivery_time_slot);
    end if;
    if new.customer_request is distinct from old.customer_request then
      perform public._ola_field_changed(new.order_id, v_actor, 'customer_request',
        left(old.customer_request, 120), left(new.customer_request, 120));
    end if;
    if new.carres_remark is distinct from old.carres_remark then
      perform public._ola_field_changed(new.order_id, v_actor, 'carres_remark',
        left(old.carres_remark, 120), left(new.carres_remark, 120));
    end if;
    if new.warehouse_remark is distinct from old.warehouse_remark then
      perform public._ola_field_changed(new.order_id, v_actor, 'warehouse_remark',
        left(old.warehouse_remark, 120), left(new.warehouse_remark, 120));
    end if;
    if new.storage_waiver_status is distinct from old.storage_waiver_status then
      insert into ops_activity_log (order_id, action, actor_id, detail)
      values (
        new.order_id,
        case new.storage_waiver_status
          when 'requested' then 'waiver.requested'
          when 'approved'  then 'waiver.approved'
          when 'rejected'  then 'waiver.rejected'
          else 'order.field_changed'
        end,
        v_actor,
        jsonb_build_object('field', 'storage_waiver_status',
          'from', old.storage_waiver_status, 'to', new.storage_waiver_status)
      );
    end if;
    -- D1 two-stage booking (0277): the booking state + the customer-confirmed
    -- date/slot are audit-worthy facts — every change lands in the timeline.
    if new.booking_stage is distinct from old.booking_stage then
      perform public._ola_field_changed(new.order_id, v_actor, 'booking_stage',
        old.booking_stage, new.booking_stage);
    end if;
    if new.confirmed_date is distinct from old.confirmed_date then
      perform public._ola_field_changed(new.order_id, v_actor, 'confirmed_date',
        old.confirmed_date::text, new.confirmed_date::text);
    end if;
    if new.confirmed_time_slot is distinct from old.confirmed_time_slot then
      perform public._ola_field_changed(new.order_id, v_actor, 'confirmed_time_slot',
        old.confirmed_time_slot, new.confirmed_time_slot);
    end if;
  exception when others then
    null;
  end;
  return new;
end;
$function$;

-- ── sanity ───────────────────────────────────────────────────────────────────
do $$
begin
  assert (select count(*) from information_schema.columns
          where table_schema = 'public' and table_name = 'ops_order_control'
            and column_name in ('booking_stage', 'confirmed_date',
              'confirmed_time_slot', 'customer_confirmed_at',
              'customer_confirmed_by')) = 5,
    '0277: booking columns missing';
  assert (select count(*) from pg_constraint
          where conname in ('ooc_booking_stage_check',
            'ooc_confirmed_needs_date_and_slot')) = 2,
    '0277: booking constraints missing';
  assert (select count(*) from pg_trigger
          where tgname = 'trg_ops_control_booking_stage') = 1,
    '0277: stage derivation trigger missing';
  assert not exists (select 1 from public.ops_order_control
          where logistic_eta is not null and booking_stage = 'none'),
    '0277: provisional backfill incomplete';
  assert not exists (select 1 from public.ops_order_control
          where booking_stage = 'confirmed'),
    '0277: nothing may be born confirmed';
  raise notice 'migration 0277 sanity OK';
end;
$$;
