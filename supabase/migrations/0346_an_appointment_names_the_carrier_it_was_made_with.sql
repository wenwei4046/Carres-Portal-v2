-- =============================================================================
-- 0346_an_appointment_names_the_carrier_it_was_made_with.sql
-- SALES ORDER V2 · CARD 3 — EARLY LOGISTICS ASSIGNMENT + CUSTOMER BOOKING
-- (owner ruling 2026-08-13, docs/orders/MASTER.md).
--
-- THE RULE THIS CLOSES, verbatim from the ruling:
--
--   "These are THREE SEPARATE TRUTHS: Assigned Logistics ≠ Latest Stock ETA ≠
--    Confirmed Customer Appointment. Do not collapse them into one status/date."
--
--   "The confirmed appointment ... must be capable of representing at minimum:
--    delivery date · delivery slot / time window · assigned logistics / carrier
--    · delivery scope."
--
-- MEASURED BEFORE BUILDING (production, 2026-08-13): the appointment already
-- carries three of those four — `confirmed_date` + `confirmed_time_slot` (0277)
-- and `booking_groups` (0282). The CARRIER it names is the fourth, and today it
-- is not stored at all: every reader takes whichever company happens to sit on
-- `orders.ops_assigned_logistic` RIGHT NOW. That is the two truths collapsed —
-- reassigning logistics silently rewrites which carrier the customer's already
-- agreed appointment belongs to, and the superseded trips archived in
-- `delivery_trips` name no carrier at all, so the history cannot answer
-- "who was this day agreed with?" even in principle.
--
-- The fix is ONE column, not a second booking store. The live appointment stays
-- exactly where every reader built since 0277 already looks; it simply gains the
-- fourth fact the ruling requires of it.
--
-- SAFE BY MEASUREMENT: production holds 86 `ops_order_control` rows and ZERO
-- confirmed bookings (0 provisional, 0 scoped, 0 archived trips), so the NOT
-- NULL-when-confirmed CHECK cannot fail on existing data and no backfill exists
-- to write. 51 live orders DO carry an assigned logistics company and not one of
-- them has ever recorded a customer appointment — which is the shape of the gap
-- this card exists to close, and the reason the column is born clean.
-- =============================================================================

set search_path = public;

-- ── the fourth fact ──────────────────────────────────────────────────────────
-- A real FK: a carrier is a `delivery_partners` row, and an appointment naming a
-- company that no longer exists is not history, it is a dangling id. ON DELETE
-- RESTRICT by omission — a partner with appointments against it may not vanish.
alter table public.ops_order_control
  add column if not exists confirmed_partner_id uuid references public.delivery_partners(id);

-- Invariant: a CONFIRMED appointment names its carrier. Below `confirmed` there
-- is no appointment to attribute, so the column stays null — the same shape
-- 0277 gave date + slot.
alter table public.ops_order_control
  add constraint ooc_confirmed_needs_partner
    check (
      booking_stage <> 'confirmed'
      or confirmed_partner_id is not null
    );

comment on column public.ops_order_control.confirmed_partner_id is
  'CARD 3 (0346): the logistics company the CUSTOMER''s confirmed appointment was made with — the fourth required fact of an appointment (date · slot · carrier · scope). Stamped by POST /:id/booking/confirm from the order''s assignment at the moment of confirmation, and NEVER re-read from the current assignment: reassigning logistics afterwards is a drift the surfaces must SHOW, not a silent rewrite of what the customer agreed to.';

-- ── activity capture (0211 trigger, extended) ────────────────────────────────
-- Body pulled from live `pg_get_functiondef` 2026-08-13 (repo rule: never retype
-- a live function) with ONE appended block: confirmed_partner_id. Everything
-- above it is byte-identical to live 0282. Which company a customer's day was
-- agreed with is exactly as audit-worthy as the day itself.
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
    -- T8 delivery groups (0282): which groups the trip carries. NULL reads as
    -- 'all' in the timeline so the line is a sentence, not a blank.
    if new.booking_groups is distinct from old.booking_groups then
      perform public._ola_field_changed(new.order_id, v_actor, 'booking_groups',
        coalesce(array_to_string(old.booking_groups, '+'), 'all'),
        coalesce(array_to_string(new.booking_groups, '+'), 'all'));
    end if;
    -- CARD 3 (0346): the carrier the appointment was agreed with. Logged as the
    -- company NAME, not the uuid — the timeline is read by an operator, and
    -- "who did we agree this day with?" is the question it has to answer.
    if new.confirmed_partner_id is distinct from old.confirmed_partner_id then
      perform public._ola_field_changed(new.order_id, v_actor, 'confirmed_partner',
        (select name from delivery_partners where id = old.confirmed_partner_id),
        (select name from delivery_partners where id = new.confirmed_partner_id));
    end if;
  exception when others then
    null;
  end;
  return new;
end;
$function$;

-- ── sanity ───────────────────────────────────────────────────────────────────
-- Schema is what a migration owns; production row counts are what it walks past
-- (CLAUDE.md §5.8), so nothing below asserts one.
do $sanity$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'ops_order_control'
       and column_name = 'confirmed_partner_id'
  ) then
    raise exception '0346 sanity: confirmed_partner_id missing';
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'ooc_confirmed_needs_partner'
  ) then
    raise exception '0346 sanity: the confirmed-names-its-carrier CHECK is missing';
  end if;

  -- The FK is the point: an appointment may not name a company that is not a
  -- registered carrier.
  if not exists (
    select 1
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
     where c.conrelid = 'public.ops_order_control'::regclass
       and c.contype = 'f'
       and a.attname = 'confirmed_partner_id'
  ) then
    raise exception '0346 sanity: confirmed_partner_id is not a foreign key';
  end if;

  raise notice '0346 OK: an appointment names the carrier it was made with';
end $sanity$;
