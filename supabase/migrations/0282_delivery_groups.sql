-- 0282_delivery_groups.sql
-- Delivery execution queue T8 — delivery groups / partial delivery.
-- Jess's ruling, verbatim (2026-07-27, docs/delivery-execution-queue.md T8):
--   mattress + bed frame = together (HARD, never split)
--   sofa                 = prefer together but MAY go as a second trip
--                          (SOFT — ASK the customer wait-vs-split, never auto-split)
--   pillow / protector   = NEVER block a delivery (back-order them)
--
-- TWO additive columns, nothing else. The group rule itself is NOT stored: it
-- is derived from the line's own category by packages/shared/delivery-groups.ts,
-- which the API gate and the drawer both read. A stored group per line would be
-- a second copy of a fact the sku already carries, and would drift the first
-- time someone edited an order line.
--
--   * booking_groups  — which groups the CONFIRMED trip carries. NULL means
--     "the whole order", so every row that exists today is already correct and
--     there is NO backfill: a pre-T8 confirmation was, by definition, for
--     everything. Only the confirm endpoint writes it (the generic control PUT
--     rejects it — the zod schema is .strict(), same as booking_stage).
--   * delivery_trips  — archive of superseded trips ({groups, date, slot, at,
--     by}). Not a second booking store: the LIVE booking stays in
--     booking_stage / confirmed_date / confirmed_time_slot, which every reader
--     built in T1/T5/T7 (and T10's calendar next) already speaks. When a split
--     order books its second trip through the same endpoint, the first trip
--     moves HERE rather than being overwritten into nothing.
--
-- Why no second booking ROW: the second trip cannot be booked at split time —
-- the whole reason for splitting is that the other group has no date yet. So
-- the split records what THIS trip covers, and the follow-up trip is confirmed
-- later through the same door. One live booking, one set of columns, no mirror.
--
-- RLS: ops_order_control's existing policies (0159) already cover new columns —
-- read = internal, write = operation/principal.

set search_path = public;

-- ── columns ──────────────────────────────────────────────────────────────────
alter table public.ops_order_control
  add column if not exists booking_groups text[],
  add column if not exists delivery_trips jsonb not null default '[]'::jsonb;

-- Only the two real groups, no empties, no duplicates. An empty array is NOT
-- "everything" — a trip carrying nothing is not a delivery; NULL is the way to
-- say "the whole order".
alter table public.ops_order_control
  add constraint ooc_booking_groups_valid
    check (
      booking_groups is null
      or (
        array_length(booking_groups, 1) between 1 and 2
        and booking_groups <@ array['bed', 'sofa']::text[]
        -- No duplicates. Written without a subquery on purpose: a CHECK
        -- constraint may not contain one, and with a 2-element ceiling the
        -- direct comparison IS the whole rule.
        and (array_length(booking_groups, 1) = 1
             or booking_groups[1] <> booking_groups[2])
      )
    );

-- A scope only means something for a booking the customer confirmed. Before
-- that there is no trip to scope.
alter table public.ops_order_control
  add constraint ooc_booking_groups_need_confirmed
    check (booking_groups is null or booking_stage = 'confirmed');

alter table public.ops_order_control
  add constraint ooc_delivery_trips_is_array
    check (jsonb_typeof(delivery_trips) = 'array');

comment on column public.ops_order_control.booking_groups is
  'T8 (0282): which delivery groups the confirmed trip carries — subset of {bed,sofa}. NULL = the whole order (the default, and what every pre-T8 confirmation means). bed = mattress + bed frame, ONE atom that never splits; sofa may take a second trip only when the customer said so. Written only by POST /:id/booking/confirm.';
comment on column public.ops_order_control.delivery_trips is
  'T8 (0282): archive of superseded delivery trips — jsonb array of {groups, date, slot, at, by}. The LIVE booking stays in booking_stage/confirmed_date/confirmed_time_slot; this only holds trips that a later confirmation replaced, so a split order does not lose its first trip.';

-- ── activity capture (0211 trigger, extended) ────────────────────────────────
-- Body pulled from live pg_get_functiondef 2026-07-27 (repo rule: never retype
-- a live function) with ONE appended block: booking_groups. Everything above it
-- is byte-identical to live 0277. A trip's scope changing is exactly as
-- audit-worthy as its date changing — "why did only the bed set go?" must be
-- answerable from the timeline.
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
  exception when others then
    null;
  end;
  return new;
end;
$function$;

-- ── sanity ───────────────────────────────────────────────────────────────────
do $$
declare
  v_ok boolean;
  v_row public.ops_order_control%rowtype;
begin
  assert (select count(*) from information_schema.columns
          where table_schema = 'public' and table_name = 'ops_order_control'
            and column_name in ('booking_groups', 'delivery_trips')) = 2,
    '0282: group columns missing';
  assert (select count(*) from pg_constraint
          where conname in ('ooc_booking_groups_valid',
            'ooc_booking_groups_need_confirmed',
            'ooc_delivery_trips_is_array')) = 3,
    '0282: group constraints missing';

  -- NULL is the whole order: no existing row may have been touched.
  assert not exists (select 1 from public.ops_order_control
                     where booking_groups is not null),
    '0282: no row should carry a trip scope yet';
  assert not exists (select 1 from public.ops_order_control
                     where delivery_trips <> '[]'::jsonb),
    '0282: no row should carry a trip archive yet';

  -- The constraints actually refuse what they claim to. Two rules make these
  -- safe AND meaningful:
  --   * every probe UPDATE is followed by a sentinel RAISE, so the enclosing
  --     subtransaction rolls back either way — a probe can NEVER persist a bad
  --     value into a live row, not even when the constraint is missing;
  --   * the verdict is a FLAG checked OUTSIDE the handler. An assert that
  --     RAISEs inside the handler it is testing catches itself and proves
  --     nothing (guardrail #4). Reaching the sentinel means the UPDATE was
  --     ACCEPTED — that is the failure, and it reads as v_ok = false.
  select * into v_row from public.ops_order_control limit 1;
  if v_row.order_id is not null then
    v_ok := false;
    begin
      update public.ops_order_control set booking_groups = array['sofa', 'sofa']
        where order_id = v_row.order_id;
      raise exception using errcode = 'P0001', message = '0282-probe-accepted';
    exception
      when check_violation then v_ok := true;
      when raise_exception then v_ok := false;
    end;
    assert v_ok, '0282: duplicate groups must be refused';

    v_ok := false;
    begin
      update public.ops_order_control set booking_groups = array[]::text[]
        where order_id = v_row.order_id;
      raise exception using errcode = 'P0001', message = '0282-probe-accepted';
    exception
      when check_violation then v_ok := true;
      when raise_exception then v_ok := false;
    end;
    assert v_ok, '0282: an empty scope must be refused';

    v_ok := false;
    begin
      update public.ops_order_control set booking_groups = array['mattress']
        where order_id = v_row.order_id;
      raise exception using errcode = 'P0001', message = '0282-probe-accepted';
    exception
      when check_violation then v_ok := true;
      when raise_exception then v_ok := false;
    end;
    assert v_ok, '0282: an unknown group must be refused';

    -- A scope with no confirmed booking. Needs a row that is NOT confirmed;
    -- when every live row happens to be confirmed the probe is skipped rather
    -- than asserted falsely.
    select * into v_row from public.ops_order_control
      where booking_stage <> 'confirmed' limit 1;
    if v_row.order_id is not null then
      v_ok := false;
      begin
        update public.ops_order_control set booking_groups = array['bed']
          where order_id = v_row.order_id;
        raise exception using errcode = 'P0001', message = '0282-probe-accepted';
      exception
        when check_violation then v_ok := true;
        when raise_exception then v_ok := false;
      end;
      assert v_ok, '0282: a scope without a confirmed booking must be refused';
    end if;
  end if;
end $$;
