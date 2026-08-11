-- =============================================================================
-- 0344_every_trip_leaves_an_attempt.sql
-- SALES ORDER V2 · CARD 5 — DELIVERY ATTEMPT + DELIVERY EXCEPTION
-- (owner ruling 2026-08-11, docs/orders/MASTER.md).
--
-- The Card 5 trace (2026-08-11) measured a genuine ENGINE GAP — the first in
-- this programme: NO attempt store, NO exception store, and the ONE success
-- door (`operation_attach_do_and_deliver`) flips the WHOLE order delivered.
-- "Bed delivered while sofa remains" had no truthful record at all, and a
-- failed run left nothing but a rebooking.
--
-- THE MODEL, and why it does not violate §6.2's "the trip is a derived view":
-- an ATTEMPT is what the portal OBSERVED happen on one run FOR ONE ORDER — a
-- fact about the order's delivery, not about the van. No trip record is
-- minted; the §6.2 upgrade clause stays untriggered.
--
--   result 'delivered'  the whole-order success door mints it (below)
--   result 'partial'    some obligations reached the customer; the order STAYS
--                       Scheduled (the 5-stage lock: partial ≠ delivered)
--   result 'failed'     ONE Delivery Exception: reason (the T4 Reason Library,
--                       never a second word list) + where the goods are
--
-- The four exception questions, answered by OWNERSHIP not by prose:
--   1 what happened      = result + reason_key (+ note)
--   2 where are the goods = where_goods + the unit doors the same transaction
--                          walked (release → Available · customer_return →
--                          Inspection/Hold — Card 2's 0341 doors, composed,
--                          never re-implemented)
--   3 what is still owed  = DERIVED — Card 1's commitment minus Card 2's
--                          allocation. Never stored as prose.
--   4 who does what next  = the Work engine's (Card 9), derived from these
--                          facts. An attempt stores facts, not to-dos.
--
-- A failure structurally cannot leave a unit falsely sold: only the units the
-- caller NAMES as delivered flip to sold, and only from `reserved to THIS SO`
-- — delivering a unit that was never reserved is the silent allocation Card 2
-- closed, and it is refused here too.
--
-- History is append-only: no UPDATE, no DELETE, ever — a wrong attempt is
-- corrected by the next attempt, exactly as Receiving corrects with Amend/Void
-- events rather than edits. (A void lane can be added the day a business case
-- exists; silently editable history cannot be un-shipped.)
-- =============================================================================

-- ── 1 · the attempt and its units ────────────────────────────────────────────
create table if not exists public.delivery_attempts (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders(id) on delete restrict,
  attempt_no     int  not null check (attempt_no >= 1),
  result         text not null check (result in ('delivered','partial','failed')),
  -- The T4 Reason Library KEY (delivery-reasons.ts). Stored as text exactly as
  -- 0196 stores extension_reason; the library owns the labels.
  reason_key     text,
  where_goods    text check (where_goods is null or where_goods in
                   ('returned_to_warehouse','still_with_logistics','with_customer')),
  note           text,
  do_number      text,
  logistics_name text,
  scheduled_date date,
  recorded_by    uuid references auth.users(id),
  recorded_at    timestamptz not null default now(),
  unique (order_id, attempt_no),
  -- A non-success states its exception; a success carries none.
  constraint delivery_attempts_exception_stated check (
    (result = 'delivered' and reason_key is null and where_goods is null)
    or (result in ('partial','failed') and reason_key is not null and where_goods is not null)
  )
);

create table if not exists public.delivery_attempt_units (
  attempt_id uuid not null references public.delivery_attempts(id) on delete restrict,
  item_id    uuid not null references public.ops_stock_items(id) on delete restrict,
  outcome    text not null check (outcome in ('delivered','returned_to_pool','inspection_hold')),
  primary key (attempt_id, item_id)
);

comment on table public.delivery_attempts is
  'One row per vehicle run for one order (SO V2 Card 5, 0344). Append-only; result partial/failed carries its ONE exception (reason + where the goods are). Remaining obligation is DERIVED (Card 1 commitment − Card 2 allocation), never stored.';

alter table public.delivery_attempts enable row level security;
alter table public.delivery_attempt_units enable row level security;

drop policy if exists delivery_attempts_read_internal on public.delivery_attempts;
create policy delivery_attempts_read_internal on public.delivery_attempts
  for select using ((select public.is_internal()));
drop policy if exists delivery_attempt_units_read_internal on public.delivery_attempt_units;
create policy delivery_attempt_units_read_internal on public.delivery_attempt_units
  for select using ((select public.is_internal()));

-- No write policies and no write grants: the RPCs below are the only doors.
revoke insert, update, delete on public.delivery_attempts from authenticated, anon;
revoke insert, update, delete on public.delivery_attempt_units from authenticated, anon;

-- Append-only, enforced at the destination (0299's lesson: a rule inside one
-- RPC is a rule one call walks around).
create or replace function public.delivery_attempts_append_only()
returns trigger
language plpgsql
as $fn$
begin
  raise exception 'a delivery attempt is history — it is never edited or deleted'
    using errcode = 'P0001', detail = 'attempt_append_only';
end;
$fn$;

drop trigger if exists delivery_attempts_no_rewrite on public.delivery_attempts;
create trigger delivery_attempts_no_rewrite
  before update or delete on public.delivery_attempts
  for each row execute function public.delivery_attempts_append_only();
drop trigger if exists delivery_attempt_units_no_rewrite on public.delivery_attempt_units;
create trigger delivery_attempt_units_no_rewrite
  before update or delete on public.delivery_attempt_units
  for each row execute function public.delivery_attempts_append_only();

-- ── 2 · the attempt door (partial / failed — and a success without the DO
--        ceremony is deliberately NOT offered here: full success walks the
--        existing gated door, which now mints its own attempt) ────────────────
create or replace function public.delivery_attempt_record(
  p_order_id  uuid,
  p_result    text,
  p_reason_key text default null,
  p_where_goods text default null,
  p_note      text default null,
  p_delivered_item_ids uuid[] default '{}',
  p_returned  jsonb default '[]'
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role app_role;
  v_uid  uuid;
  v_order orders;
  v_confirmed date;
  v_no   int;
  v_attempt delivery_attempts;
  v_item uuid;
  v_row  ops_stock_items;
  v_so_ref text;
  v_ret  jsonb;
  v_action text;
  v_released uuid;
  v_delivered int := 0;
  v_returned int := 0;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'forbidden: only operation or principal can record a delivery attempt'
      using errcode = '42501', detail = 'forbidden';
  end if;
  v_uid := auth.uid();

  if p_result is null or p_result not in ('partial','failed') then
    raise exception '% is not an attempt this door records (partial · failed — a full success walks the delivery door)',
      coalesce(p_result, 'null')
      using errcode = '22023', detail = 'bad_result';
  end if;
  if p_reason_key is null or btrim(p_reason_key) = '' then
    raise exception 'a non-completed attempt states its reason'
      using errcode = '22023', detail = 'reason_required';
  end if;
  if p_where_goods is null
     or p_where_goods not in ('returned_to_warehouse','still_with_logistics','with_customer') then
    raise exception 'a non-completed attempt states where the goods are'
      using errcode = '22023', detail = 'where_goods_required';
  end if;
  if p_result = 'partial' and coalesce(array_length(p_delivered_item_ids, 1), 0) = 0 then
    raise exception 'a partial attempt names at least one delivered unit'
      using errcode = '22023', detail = 'partial_needs_delivered_units';
  end if;
  if p_result = 'failed' and coalesce(array_length(p_delivered_item_ids, 1), 0) > 0 then
    raise exception 'a failed attempt delivered nothing — record partial instead'
      using errcode = '22023', detail = 'failed_delivers_nothing';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found' using errcode = '42P01', detail = 'order_not_found';
  end if;
  v_so_ref := 'SO-' || v_order.so::text;

  select confirmed_date into v_confirmed
    from ops_order_control where order_id = p_order_id;

  select coalesce(max(attempt_no), 0) + 1 into v_no
    from delivery_attempts where order_id = p_order_id;

  insert into delivery_attempts
    (order_id, attempt_no, result, reason_key, where_goods, note, do_number,
     logistics_name, scheduled_date, recorded_by)
  values
    (p_order_id, v_no, p_result, btrim(p_reason_key), p_where_goods,
     nullif(btrim(coalesce(p_note,'')),''),
     v_order.do_number,
     coalesce((select name from delivery_partners where id = v_order.delivery_partner_id),
              (select name from delivery_partners where id = v_order.ops_assigned_logistic)),
     v_confirmed,
     v_uid)
  returning * into v_attempt;

  -- Delivered units: only a unit RESERVED TO THIS SO can be delivered —
  -- anything else is the silent allocation Card 2 closed.
  foreach v_item in array coalesce(p_delivered_item_ids, '{}'::uuid[]) loop
    select * into v_row from ops_stock_items where id = v_item for update;
    if not found then
      raise exception 'unit % not found', v_item using errcode = '42P01', detail = 'unit_not_found';
    end if;
    if v_row.status <> 'reserved' or v_row.reserved_ref is distinct from v_so_ref then
      raise exception 'unit % is not reserved to % — reserve first, then deliver', v_item, v_so_ref
        using errcode = 'P0001', detail = 'unit_not_reserved_to_order';
    end if;
    update ops_stock_items
       set status = 'sold',
           sold_at = now(),
           sold_order_id = p_order_id,
           ref_history = array_append(coalesce(ref_history, '{}'::text[]), v_so_ref),
           updated_at = now()
     where id = v_item;
    insert into delivery_attempt_units (attempt_id, item_id, outcome)
    values (v_attempt.id, v_item, 'delivered');
    v_delivered := v_delivered + 1;
  end loop;

  -- Returned units move through Card 2's own doors — composed, never copied.
  for v_ret in select * from jsonb_array_elements(coalesce(p_returned, '[]'::jsonb)) loop
    v_item := (v_ret->>'item_id')::uuid;
    v_action := v_ret->>'action';
    if v_item is null or v_action is null
       or v_action not in ('back_to_pool','inspection_hold') then
      raise exception 'a returned unit names its door (back_to_pool · inspection_hold)'
        using errcode = '22023', detail = 'bad_return_action';
    end if;
    select * into v_row from ops_stock_items where id = v_item;
    if not found then
      raise exception 'unit % not found', v_item using errcode = '42P01', detail = 'unit_not_found';
    end if;
    if v_row.status <> 'reserved' or v_row.reserved_ref is distinct from v_so_ref then
      raise exception 'unit % is not reserved to % — nothing to return', v_item, v_so_ref
        using errcode = 'P0001', detail = 'unit_not_reserved_to_order';
    end if;
    if v_action = 'back_to_pool' then
      select public.ops_stock_release(v_item) into v_released;
      if v_released is null then
        raise exception 'unit % could not be released', v_item
          using errcode = 'P0001', detail = 'release_failed';
      end if;
      insert into delivery_attempt_units (attempt_id, item_id, outcome)
      values (v_attempt.id, v_item, 'returned_to_pool');
    else
      perform public.ops_stock_hold_unit(v_item, 'customer_return',
                                         nullif(btrim(coalesce(v_ret->>'note','')),''));
      insert into delivery_attempt_units (attempt_id, item_id, outcome)
      values (v_attempt.id, v_item, 'inspection_hold');
    end if;
    v_returned := v_returned + 1;
  end loop;

  -- The order's own timeline. The order STATUS is deliberately untouched:
  -- partial stays Scheduled (the 5-stage lock), failed stays where it was —
  -- the exception is the record, the Work engine derives what happens next.
  insert into order_history (order_id, text, by_role)
  values (p_order_id,
          format('Delivery attempt %s · %s · %s · goods: %s%s',
                 v_no, p_result, btrim(p_reason_key), p_where_goods,
                 case when v_delivered > 0
                      then format(' · %s unit(s) delivered', v_delivered) else '' end),
          'operation');

  insert into audit_log (role, actor_text, action, ref)
  values (v_role,
          (select name from app_users where id = v_uid),
          format('Delivery attempt %s recorded · %s · %s', v_no, p_result, btrim(p_reason_key)),
          v_so_ref);

  return jsonb_build_object(
    'attempt', to_jsonb(v_attempt),
    'units_delivered', v_delivered,
    'units_returned', v_returned
  );
end;
$fn$;

revoke all on function public.delivery_attempt_record(uuid,text,text,text,text,uuid[],jsonb) from public;
revoke all on function public.delivery_attempt_record(uuid,text,text,text,text,uuid[],jsonb) from anon;
grant execute on function public.delivery_attempt_record(uuid,text,text,text,text,uuid[],jsonb) to authenticated;

-- ── 3 · the success door mints its own attempt ───────────────────────────────
-- Verbatim live body (= 0341's, read 2026-08-11) with TWO additions marked
-- `0344`: the sold unit ids are captured, and one 'delivered' attempt row +
-- its unit rows are minted in the same transaction.
CREATE OR REPLACE FUNCTION public.operation_attach_do_and_deliver(
  p_order_id      uuid,
  p_do_number     text,
  p_do_note       text,
  p_signed        boolean,
  p_do_file_path  text,
  p_signature_url text default null,
  p_signed_by     text default null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order   orders;
  v_actor   text;
  v_line    record;
  v_user_id uuid;
  v_threads_advanced int;
  v_units_sold int := 0;
  v_line_sold  int;
  v_sold_ids uuid[] := '{}';        -- 0344
  v_line_ids uuid[];                -- 0344
  v_attempt_id uuid;                -- 0344
  v_attempt_no int;                 -- 0344
  v_confirmed date;                 -- 0344
BEGIN
  v_user_id := (select auth.uid());

  IF NOT public.is_operation() THEN
    RAISE EXCEPTION 'forbidden: logistics only' USING ERRCODE = '42501';
  END IF;

  IF p_signed IS NULL OR p_signed = false THEN
    RAISE EXCEPTION 'customer must sign DO'
      USING ERRCODE = 'P0001', DETAIL = 'do_required';
  END IF;

  IF p_do_number IS NULL OR length(btrim(p_do_number)) < 3 THEN
    RAISE EXCEPTION 'DO number must be at least 3 characters'
      USING ERRCODE = 'P0001', DETAIL = 'do_required';
  END IF;

  IF p_do_file_path IS NULL OR length(btrim(p_do_file_path)) = 0 THEN
    RAISE EXCEPTION 'DO file required'
      USING ERRCODE = 'P0001', DETAIL = 'do_file_required';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found'
      USING ERRCODE = '42P01', DETAIL = 'order_not_found';
  END IF;

  IF v_order.operation_stage IS DISTINCT FROM 'dispatched'
     OR v_order.status <> 'proceed_order' THEN
    RAISE EXCEPTION 'order is not in dispatched state'
      USING ERRCODE = '22023', DETAIL = 'wrong_stage';
  END IF;

  v_actor := coalesce((SELECT name FROM app_users WHERE id = v_user_id), 'Logistics');

  UPDATE orders
     SET status            = 'delivered',
         operation_stage   = 'delivered',
         do_number         = btrim(p_do_number),
         do_note           = nullif(btrim(coalesce(p_do_note, '')), ''),
         do_file_path      = btrim(p_do_file_path),
         do_uploaded_at    = now(),
         do_uploaded_by    = v_user_id,
         pod_signature_url = nullif(btrim(coalesce(p_signature_url, '')), ''),
         pod_signed_by     = nullif(btrim(coalesce(p_signed_by, '')), ''),
         pod_signed_at     = now(),
         delivered_at      = now(),
         updated_at        = now()
   WHERE id = p_order_id;

  PERFORM public._operation_release_order_reserve(p_order_id);

  FOR v_line IN
    SELECT sku, qty FROM order_lines WHERE order_id = p_order_id
  LOOP
    UPDATE stock_balances
       SET qty        = qty - v_line.qty,
           updated_at = now()
     WHERE sku = v_line.sku
       AND warehouse_id = v_order.warehouse_id;

    INSERT INTO stock_movements
      (sku, warehouse_id, qty, kind, ref, by_role, by_user_id)
    VALUES
      (v_line.sku, v_order.warehouse_id, -v_line.qty, 'out',
       'SO-' || v_order.so::text, 'operation', v_user_id);

    -- 0153: mark up to v_line.qty tracked units SOLD. 0341 (Card 2): the pick
    -- honours the reservation. 0344 (Card 5): the ids are captured so the
    -- attempt can name the units it delivered.
    WITH sold AS (
      UPDATE ops_stock_items i
         SET status        = 'sold',
             sold_at       = now(),
             sold_order_id = p_order_id,
             reserved_ref  = 'SO-' || v_order.so::text,
             ref_history   = array_append(coalesce(i.ref_history, '{}'::text[]),
                                           'SO-' || v_order.so::text),
             updated_at    = now()
       WHERE i.id IN (
         SELECT s.id FROM ops_stock_items s
          WHERE s.sku = v_line.sku
            AND s.warehouse_id = v_order.warehouse_id
            AND ( (s.status = 'reserved' AND s.reserved_ref = 'SO-' || v_order.so::text)
               OR s.status IN ('incoming','free') )
          ORDER BY
            CASE WHEN s.status = 'reserved' THEN 0
                 WHEN s.po_no IN (
                   SELECT t.po_id FROM order_supplier_threads t
                    WHERE t.order_id = p_order_id AND t.po_id IS NOT NULL
                 ) THEN 1 ELSE 2 END,
            s.date_in, s.created_at
          LIMIT v_line.qty
       )
      RETURNING i.id
    )
    SELECT count(*), coalesce(array_agg(id), '{}'::uuid[])
      INTO v_line_sold, v_line_ids FROM sold;
    v_sold_ids := v_sold_ids || v_line_ids;
    v_units_sold := v_units_sold + v_line_sold;
  END LOOP;

  -- 0344 (Card 5): every trip leaves an attempt — the success too.
  SELECT confirmed_date INTO v_confirmed
    FROM ops_order_control WHERE order_id = p_order_id;
  SELECT coalesce(max(attempt_no), 0) + 1 INTO v_attempt_no
    FROM delivery_attempts WHERE order_id = p_order_id;
  INSERT INTO delivery_attempts
    (order_id, attempt_no, result, do_number, logistics_name, scheduled_date, recorded_by)
  VALUES
    (p_order_id, v_attempt_no, 'delivered', btrim(p_do_number),
     coalesce((select name from delivery_partners where id = v_order.delivery_partner_id),
              (select name from delivery_partners where id = v_order.ops_assigned_logistic)),
     v_confirmed, v_user_id)
  RETURNING id INTO v_attempt_id;
  INSERT INTO delivery_attempt_units (attempt_id, item_id, outcome)
  SELECT v_attempt_id, unnest(v_sold_ids), 'delivered';

  UPDATE order_supplier_threads
     SET operation_stage = 'delivered',
         delivered_at    = COALESCE(delivered_at, now()),
         updated_at      = now()
   WHERE order_id = p_order_id
     AND operation_stage <> 'delivered';
  GET DIAGNOSTICS v_threads_advanced = ROW_COUNT;

  INSERT INTO order_history (order_id, text, by_role)
  VALUES (
    p_order_id,
    format('Delivered · DO %s · file %s · signed by %s · %s unit(s) sold%s',
           btrim(p_do_number),
           btrim(p_do_file_path),
           coalesce(nullif(btrim(coalesce(p_signed_by, '')), ''), 'customer'),
           v_units_sold,
           CASE WHEN v_threads_advanced > 0
                THEN format(' · %s thread(s) advanced', v_threads_advanced)
                ELSE '' END),
    'operation'
  );

  INSERT INTO audit_log (role, actor_text, action, dealer_id, ref)
  VALUES ('operation', v_actor,
          format('Delivered SO-%s · DO %s', v_order.so, btrim(p_do_number)),
          v_order.dealer_id, 'SO-' || v_order.so::text);

  RETURN jsonb_build_object(
    'id',                v_order.id,
    'so',                v_order.so,
    'status',            'delivered',
    'operation_stage',   'delivered',
    'do_number',         btrim(p_do_number),
    'do_file_path',      btrim(p_do_file_path),
    'pod_signature_url', nullif(btrim(coalesce(p_signature_url, '')), ''),
    'pod_signed_by',     nullif(btrim(coalesce(p_signed_by, '')), ''),
    'delivered_at',      now(),
    'units_sold',        v_units_sold,
    'threads_advanced',  v_threads_advanced,
    'attempt_id',        v_attempt_id
  );
END;
$function$;

-- ── 4 · sanity ───────────────────────────────────────────────────────────────
do $sanity$
declare
  v int;
  v_def text;
begin
  select count(*) into v from information_schema.tables
   where table_schema = 'public'
     and table_name in ('delivery_attempts','delivery_attempt_units');
  if v <> 2 then
    raise exception '0344 sanity: attempt tables missing (%)', v;
  end if;
  if has_table_privilege('authenticated', 'public.delivery_attempts', 'insert') then
    raise exception '0344 sanity: authenticated can INSERT attempts directly';
  end if;
  select count(*) into v from pg_trigger
   where tgname in ('delivery_attempts_no_rewrite','delivery_attempt_units_no_rewrite');
  if v <> 2 then
    raise exception '0344 sanity: append-only triggers missing';
  end if;
  v_def := pg_get_functiondef(
    'public.operation_attach_do_and_deliver(uuid,text,text,boolean,text,text,text)'::regprocedure);
  if position('delivery_attempts' in v_def) = 0 then
    raise exception '0344 sanity: the success door does not mint an attempt';
  end if;
  if position('s.reserved_ref = ''SO-'' || v_order.so::text' in v_def) = 0 then
    raise exception '0344 sanity: 0341''s reservation-honouring pick was lost in the rewrite';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'delivery_attempt_record') then
    raise exception '0344 sanity: delivery_attempt_record missing';
  end if;
  raise notice '0344 OK: every trip leaves an attempt; a failure states its exception and the units move with reality';
end $sanity$;
