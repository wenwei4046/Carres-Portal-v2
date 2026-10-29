-- =============================================================================
-- 0733_stock_units_follow_their_order.sql
-- =============================================================================
-- Six stock bugs from the whole-repo audit at 945f667 (2026-10-29). A Unit is
-- one physical item (`ops_stock_items`).
--
--   1 · An approved amendment that changes a line's SKU, lowers its qty or
--       removes it left the line's Units reserved (both items shipped), and a
--       removed line with a reserved Unit failed on the raw foreign key
--       (0471 `reserved_order_line_id`). The Units the new lines no longer
--       hold are now released before the lines are written.
--   2 · `operation_abandon_order` kept Units reserved and DOs live. It now
--       voids the DOs that have not run (as `cancel_order` does, 0357) and
--       releases every Unit reserved to the order.
--   3 · "Delivered" (mark delivered and load scan) sold every reserved Unit on
--       the DO, even one reserved to another order since. One helper now sells
--       only the order's own Units and refuses the rest by name; a Unit on a
--       live DO can no longer be released or moved to another order.
--   4 · An office DO for one delivery group had no Unit list, so no handover
--       could be recorded. The API passes the reserved Units of the picked
--       groups and the mint records them.
--   5 · Stock Take refused a labelled Unit that reached the Site after the
--       count opened, so staff added it as an extra and a duplicate was born.
--       Such a Unit is now counted as found.
--   6 · `date_in = current_date` is the UTC date: before 08:00 Malaysia time it
--       is yesterday. Every writer now uses the Malaysian date.
--
-- Functions changed by text rewrite are edited on their LIVE body (the 0721
-- pattern), so whatever later migrations did to them is kept.
-- =============================================================================

set search_path = public;

create or replace function pg_temp.mig0733_rewrite(p_fn regprocedure, p_old text, p_new text, p_times int default 1)
returns void
language plpgsql
as $rw$
declare
  v_def text := replace(pg_get_functiondef(p_fn), E'\r\n', E'\n');
  v_n   integer;
begin
  if position(p_new in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_old, ''))) / greatest(length(p_old), 1);
  if v_n <> p_times then
    raise exception '0733: % holds the text to change % times, not %: %', p_fn, v_n, p_times, left(p_old, 90);
  end if;
  execute replace(v_def, p_old, p_new);
end;
$rw$;

-- ── 3a · a Unit on a live DO stays with that DO ──────────────────────────────
-- Release (reserved_ref → null), hold and reassign (→ another SO) all change
-- the reference. A DO that is void or has delivered no longer holds the Unit;
-- neither does one the Unit was already returned from (0716).
create or replace function public._stock_unit_stays_on_its_live_do()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_do text;
begin
  -- The failed-trip door (0496) puts the Units it brought back into stock.
  if coalesce(current_setting('carres.unit_leaves_its_do', true), '') = 'on' then
    return new;
  end if;
  select d.do_number into v_do
    from delivery_order_units du
    join ops_delivery_orders d on d.id = du.delivery_order_id
   where du.item_id = old.id
     and d.voided_at is null
     and not exists (select 1 from delivery_attempts a
                      where a.do_number = d.do_number and a.result = 'delivered')
     and not exists (select 1 from delivery_return_units ru
                       join delivery_returns r on r.id = ru.return_id
                      where r.delivery_order_id = d.id and ru.unit_id = old.id)
   limit 1;
  if v_do is not null then
    raise exception 'Unit % is on Delivery Order % - void that Delivery Order first', old.unit_code, v_do
      using errcode = 'P0001', detail = 'unit_on_live_delivery_order';
  end if;
  return new;
end;
$fn$;
revoke all on function public._stock_unit_stays_on_its_live_do() from public, anon, authenticated;

drop trigger if exists ops_stock_items_stay_on_live_do on public.ops_stock_items;
create trigger ops_stock_items_stay_on_live_do
  before update of reserved_ref on public.ops_stock_items
  for each row
  when (old.status = 'reserved' and new.reserved_ref is distinct from old.reserved_ref)
  execute function public._stock_unit_stays_on_its_live_do();

-- shortcut: the flag lasts to the end of the attempt's transaction (one
-- PostgREST call); scope it to the returned-Units loop if the door ever does more.
select pg_temp.mig0733_rewrite('public.delivery_attempt_record(uuid,text,text,text,text,uuid[],jsonb,int)'::regprocedure,
$old$  for v_ret in select * from jsonb_array_elements(coalesce(p_returned, '[]'::jsonb)) loop$old$,
$new$  perform set_config('carres.unit_leaves_its_do', 'on', true);   -- 0733
  for v_ret in select * from jsonb_array_elements(coalesce(p_returned, '[]'::jsonb)) loop$new$);

-- ── 3b · one sell, of the order's own Units ──────────────────────────────────
create or replace function public._delivery_sell_do_units(p_doc_id uuid, p_order_id uuid)
returns uuid[]
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_ref   text := 'SO-' || (select so from orders where id = p_order_id)::text;
  v_other text;
  v_sold  uuid[];
begin
  select string_agg(i.unit_code || ' (' || coalesce(i.reserved_ref, 'no order') || ')', ', ' order by i.unit_code)
    into v_other
    from delivery_order_units du
    join ops_stock_items i on i.id = du.item_id
   where du.delivery_order_id = p_doc_id
     and i.status = 'reserved'
     and i.reserved_ref is distinct from v_ref;
  if v_other is not null then
    raise exception 'Reserved to another order: %. Void this Delivery Order and issue a new one.', v_other
      using errcode = 'P0001', detail = 'unit_reserved_elsewhere';
  end if;

  with sold as (
    update ops_stock_items i
       set status        = 'sold',
           sold_at       = now(),
           sold_order_id = p_order_id,
           ref_history   = array_append(coalesce(i.ref_history, '{}'::text[]), v_ref),
           updated_at    = now()
     where i.id in (select du.item_id from delivery_order_units du where du.delivery_order_id = p_doc_id)
       and i.status = 'reserved'
       and i.reserved_ref = v_ref
    returning i.id)
  select coalesce(array_agg(id), '{}'::uuid[]) into v_sold from sold;
  return v_sold;
end;
$fn$;
revoke all on function public._delivery_sell_do_units(uuid, uuid) from public, anon, authenticated;

select pg_temp.mig0733_rewrite('public._delivery_mark_delivered(uuid,text,text,text,text,text,text)'::regprocedure,
$old$    WITH sold AS (
      UPDATE ops_stock_items i
         SET status        = 'sold',
             sold_at       = now(),
             sold_order_id = p_order_id,
             reserved_ref  = 'SO-' || v_order.so::text,
             ref_history   = array_append(coalesce(i.ref_history, '{}'::text[]), 'SO-' || v_order.so::text),
             updated_at    = now()
       WHERE i.id IN (SELECT du.item_id FROM delivery_order_units du WHERE du.delivery_order_id = v_doc.id)
         AND i.status = 'reserved'
      RETURNING i.id
    )
    SELECT count(*), coalesce(array_agg(id), '{}'::uuid[]) INTO v_units_sold, v_sold_ids FROM sold;$old$,
$new$    v_sold_ids := public._delivery_sell_do_units(v_doc.id, p_order_id);   -- 0733
    v_units_sold := cardinality(v_sold_ids);$new$);

select pg_temp.mig0733_rewrite('public.delivery_load_scan(text)'::regprocedure,
$old$    with sold as (
      update public.ops_stock_items i
         set status        = 'sold',
             sold_at       = now(),
             sold_order_id = v_order.id,
             reserved_ref  = 'SO-' || v_order.so::text,
             ref_history   = array_append(coalesce(i.ref_history, '{}'::text[]), 'SO-' || v_order.so::text),
             updated_at    = now()
       where i.id in (select du.item_id from public.delivery_order_units du where du.delivery_order_id = v_doc.id)
         and i.status = 'reserved'
      returning i.id)
    select coalesce(array_agg(id), '{}'::uuid[]) into v_sold from sold;$old$,
$new$    v_sold := public._delivery_sell_do_units(v_doc.id, v_order.id);   -- 0733$new$);

-- ── 1 · an approved amendment gives back the Units its lines no longer hold ──
-- Per line: every Unit when the line goes or its SKU changes, else the Units
-- above the new qty (shelf Units are kept before PO-bound ones). A delivered
-- Unit is refused by name: goods that left cannot be amended away.
-- shortcut: Units reserved by SO reference with no line (before 0471) are not
-- matched; match them by stock key if such reservations still exist.
create or replace function public._so_release_units_left_by_lines(p_order_id uuid, p_lines jsonb)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_sold text;
  v_id   uuid;
  v_n    int := 0;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    return 0;
  end if;

  with kept as (
    select (e->>'id')::uuid as id, btrim(e->>'sku') as sku
      from jsonb_array_elements(p_lines) e
     where nullif(e->>'id', '') is not null)
  select string_agg(i.unit_code || ' (' || l.sku || ')', ', ' order by i.unit_code) into v_sold
    from ops_stock_items i
    join order_lines l on l.id = i.reserved_order_line_id
    left join kept k on k.id = l.id
   where l.order_id = p_order_id
     and i.status = 'sold'
     and (k.id is null or k.sku is distinct from l.sku);
  if v_sold is not null then
    raise exception 'Already delivered: %. A delivered item cannot be removed or changed here.', v_sold
      using errcode = '22023', detail = 'line_has_delivered_units';
  end if;

  for v_id in
    with kept as (
      select (e->>'id')::uuid as id, btrim(e->>'sku') as sku, (e->>'qty')::int as qty
        from jsonb_array_elements(p_lines) e
       where nullif(e->>'id', '') is not null)
    select b.id from (
      select i.id, l.sku as line_sku, k.id as kept_id, k.sku as new_sku, k.qty as new_qty,
             sum(coalesce(i.qty, 1)) over (partition by l.id order by (i.status = 'incoming'), i.id) as running
        from ops_stock_items i
        join order_lines l on l.id = i.reserved_order_line_id
        left join kept k on k.id = l.id
       where l.order_id = p_order_id
         and i.status in ('reserved', 'incoming')
    ) b
    where b.kept_id is null or b.new_sku is distinct from b.line_sku or b.running > b.new_qty
    order by b.id
  loop
    if public.ops_stock_release(v_id) is null then
      raise exception 'A Unit of this order could not be released' using errcode = '40001',
        detail = 'unit_not_released · unit_id=' || v_id::text;
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$fn$;
revoke all on function public._so_release_units_left_by_lines(uuid, jsonb) from public, anon, authenticated;

select pg_temp.mig0733_rewrite('public.sales_order_decide_amendment(uuid,text,text)'::regprocedure,
$old$    v_lines := v_a.proposed_snapshot->'lines';$old$,
$new$    v_lines := v_a.proposed_snapshot->'lines';
    perform public._so_release_units_left_by_lines(v_a.order_id, v_lines);   -- 0733$new$);

-- ── 2 · an abandoned order lets go of its DOs and its Units ──────────────────
-- 0357's void, as `cancel_order`: a DO that delivered is history and stays.
-- Then every Unit reserved to the order, on the shelf or bound on a PO (0600).
create or replace function public._order_void_dos_and_release_units(p_order_id uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_ref text := 'SO-' || (select so from orders where id = p_order_id)::text;
  v_id  uuid;
  v_n   int := 0;
begin
  update ops_delivery_orders d
     set voided_at   = now(),
         void_reason = 'order_cancelled',
         voided_by   = auth.uid()
   where d.order_id = p_order_id
     and d.voided_at is null
     and not exists (
       select 1 from delivery_attempts a
        where a.do_number = d.do_number
          and a.result = 'delivered'
     );
  update orders set do_number = null
   where id = p_order_id and do_number is not null;

  for v_id in
    select i.id from ops_stock_items i
     where (i.status = 'reserved' and i.reserved_ref = v_ref)
        or (i.status = 'incoming'
            and i.reserved_order_line_id in (select l.id from order_lines l where l.order_id = p_order_id))
     order by i.id
  loop
    if public.ops_stock_release(v_id) is not null then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$fn$;
revoke all on function public._order_void_dos_and_release_units(uuid) from public, anon, authenticated;

select pg_temp.mig0733_rewrite('public.operation_abandon_order(uuid,text)'::regprocedure,
$old$  if v_order.operation_stage in ('ready_to_dispatch', 'dispatched') then
    perform public._operation_release_order_reserve(p_order_id);
  end if;$old$,
$new$  if v_order.operation_stage in ('ready_to_dispatch', 'dispatched') then
    perform public._operation_release_order_reserve(p_order_id);
  end if;
  perform public._order_void_dos_and_release_units(p_order_id);   -- 0733$new$);

-- ── 4 · an office DO for some groups records the Units it carries ───────────
-- 0710's body with one more argument. The API picks the Units (the delivery
-- group rule lives once, in packages/shared/src/delivery-groups.ts); this door
-- checks each is reserved to (or sold on) this order and records it. A group
-- DO with no Unit is refused: Warehouse could never hand it over.
drop function if exists public.delivery_office_document_mint(uuid, text[], text);
create or replace function public.delivery_office_document_mint(
  p_order_id uuid, p_groups text[], p_do_number text, p_item_ids uuid[] default null
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_order orders;
  v_ctl ops_order_control;
  v_trip int;
  v_row ops_delivery_orders;
begin
  if not coalesce((select public.is_operation()), false) then
    raise exception 'Only operation or principal may open a Delivery Order' using errcode = '42501', detail = 'forbidden';
  end if;
  if nullif(btrim(coalesce(p_do_number, '')), '') is null then
    raise exception 'a document carries its number' using errcode = '22023', detail = 'do_number_required';
  end if;
  if p_groups is not null and (
       cardinality(p_groups) = 0
       or exists (select 1 from unnest(p_groups) g where g is null or g not in ('bed', 'sofa'))
       or cardinality(p_groups) <> (select count(distinct g) from unnest(p_groups) g)) then
    raise exception 'pick the goods for this Delivery Order' using errcode = '22023', detail = 'invalid_groups';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  if p_groups is not null then
    if coalesce(cardinality(p_item_ids), 0) = 0 then
      raise exception 'no reserved Unit for the picked goods - reserve them first'
        using errcode = '22023', detail = 'no_units_for_groups';
    end if;
    if exists (select 1 from unnest(p_item_ids) x(id)
                where not exists (select 1 from ops_stock_items i
                                   where i.id = x.id and i.qty = 1
                                     and (i.sold_order_id = p_order_id or i.reserved_ref = 'SO-' || v_order.so))) then
      raise exception 'a picked Unit is not reserved to this order'
        using errcode = '22023', detail = 'unit_not_reserved_to_order';
    end if;
  end if;

  if exists (select 1 from ops_delivery_orders d
              where d.order_id = p_order_id and d.voided_at is null and d.leg > 0) then
    raise exception 'this order travels on a Delivery Journey; each leg issues its own Delivery Order'
      using errcode = '22023', detail = 'journey_order';
  end if;
  if exists (select 1 from ops_delivery_orders d
              where d.order_id = p_order_id and d.voided_at is null and d.leg = 0
                and (p_groups is null or d.trip_groups is null or cardinality(d.trip_groups) = 0
                     or d.trip_groups && p_groups)) then
    raise exception 'these goods are already on a Delivery Order'
      using errcode = '22023', detail = 'already_on_a_delivery_order';
  end if;

  if p_groups is null then
    v_trip := 0;
  else
    select min(t) into v_trip from generate_series(1, 3) t
     where not exists (select 1 from ops_delivery_orders d
                        where d.order_id = p_order_id and d.leg = 0 and d.trip = t and d.voided_at is null);
    if v_trip is null then
      raise exception 'an order goes out on three trips at most'
        using errcode = '22023', detail = 'three_trips_at_most';
    end if;
  end if;

  select * into v_ctl from ops_order_control where order_id = p_order_id;
  insert into ops_delivery_orders (order_id, do_number, leg, trip, trip_groups, delivery_date, time_slot, logistics_partner, issued_by)
  values (p_order_id, upper(btrim(p_do_number)), 0, v_trip, p_groups, v_ctl.confirmed_date, v_ctl.confirmed_time_slot,
          (select p.name from delivery_partners p
            where p.id = coalesce(v_ctl.confirmed_partner_id, v_order.ops_assigned_logistic, v_order.delivery_partner_id)),
          auth.uid())
  returning * into v_row;
  -- 0733 · a whole-order DO is snapshotted by 0424's trigger; a group DO
  -- records the picked Units (0424's one-live-claim trigger still binds).
  if p_groups is not null then
    insert into delivery_order_units (delivery_order_id, item_id)
    select distinct v_row.id, x.id from unnest(p_item_ids) x(id)
    on conflict (delivery_order_id, item_id) do nothing;
  end if;
  insert into order_history (order_id, text, by_role)
  values (p_order_id,
          format('%s opened by the office · %s', v_row.do_number,
                 coalesce(array_to_string(v_row.trip_groups, ', '), 'whole order')),
          (select public.app_role()));
  -- Legacy readers see the newest number (0356's rule); the materialiser
  -- finds the row already there and inserts nothing.
  update orders set do_number = v_row.do_number where id = p_order_id;
  return to_jsonb(v_row);
end;
$fn$;
comment on function public.delivery_office_document_mint(uuid, text[], text, uuid[]) is
  '0710 (Weisiang 2026-10-22): office staff open a Delivery Order from SO lines. Scope NULL = whole order, else delivery groups; refuses goods already on a live DO and Journey orders. 0733: a group DO records the reserved Units the API picked for its groups. Called by the one issuing path after its gate; the 0362 money trigger still binds.';
revoke all on function public.delivery_office_document_mint(uuid, text[], text, uuid[]) from public, anon;
grant execute on function public.delivery_office_document_mint(uuid, text[], text, uuid[]) to authenticated;

-- ── 5 · Stock Take counts a labelled Unit that arrived after it opened ───────
select pg_temp.mig0733_rewrite('public.stock_count_record(uuid,text[],jsonb,boolean)'::regprocedure,
$old$  select string_agg(f, ', ') into v_unknown$old$,
$new$  -- 0733 · a scanned Unit at this Site and in stock that reached it after
  -- the count opened is counted as found, never an extra (a duplicate).
  insert into public.stock_count_units (count_id, unit_id)
  select c.id, i.id from public.ops_stock_items i
   where i.unit_code in (select btrim(f) from unnest(coalesce(p_found, '{}')) f)
     and i.warehouse_id = c.warehouse_id
     and i.status in ('free','reserved','on_hold')
     and i.identity_scope = 'unit'
  on conflict (count_id, unit_id) do nothing;

  select string_agg(f, ', ') into v_unknown$new$);

-- ── 6 · the day a Unit came in is the Malaysian day ──────────────────────────
alter table public.ops_stock_items
  alter column date_in set default (now() at time zone 'Asia/Kuala_Lumpur')::date;

select pg_temp.mig0733_rewrite('public.operation_receive_po_with_do(text,text,text,jsonb,uuid)'::regprocedure,
$old$btrim(p_do_number), current_date);$old$,
$new$btrim(p_do_number), (now() at time zone 'Asia/Kuala_Lumpur')::date);$new$, 3);
select pg_temp.mig0733_rewrite('public.receiving_amend(uuid,text,jsonb,uuid)'::regprocedure,
$old$format('amend:%s', p_receipt_id), current_date);$old$,
$new$format('amend:%s', p_receipt_id), (now() at time zone 'Asia/Kuala_Lumpur')::date);$new$);
select pg_temp.mig0733_rewrite('public._operation_create_po_inner_admitted(uuid,uuid,jsonb,date,integer[],text,uuid,uuid,jsonb)'::regprocedure,
$old$'po_mint', current_date$old$,
$new$'po_mint', (now() at time zone 'Asia/Kuala_Lumpur')::date$new$);
select pg_temp.mig0733_rewrite('public.purchasing_revise_po(text,text,jsonb)'::regprocedure,
$old$'po_revision', current_date$old$,
$new$'po_revision', (now() at time zone 'Asia/Kuala_Lumpur')::date$new$);
