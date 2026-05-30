-- 0154_fix_per_unit_id_hooks.sql — corrects 0153's signature mistakes.
--
-- 0153 was authored against WRONG function signatures for two RPCs, so its
-- mint/void blocks landed on ghost overloads (never called), and it OVERWROTE
-- operation_receive_po_with_do with a wrong simplified body (lost thread-advance
-- + reservation logic). This migration:
--   1. drops the 2 ghost overloads 0153 created
--   2. re-adds the PO-open mint onto the REAL 7-arg _operation_create_po_inner
--   3. re-adds the PO-cancel void onto the REAL 2-arg operation_cancel_po
--   4. RESTORES operation_receive_po_with_do to its real body + incoming->free flip
-- operation_attach_do_and_deliver (the sold block from 0153) was correct and is
-- left untouched. Replaying 0153 then 0154 yields the correct end state.

-- 1. Drop the 2 ghost overloads 0153 created.
drop function if exists public._operation_create_po_inner(uuid, uuid, jsonb, integer, integer[], uuid);
drop function if exists public.operation_cancel_po(text);

-- 2. REAL _operation_create_po_inner (7-arg) — verbatim + PO-open mint.
CREATE OR REPLACE FUNCTION public._operation_create_po_inner(p_supplier_id uuid, p_warehouse_id uuid, p_lines jsonb, p_eta_date date, p_so_refs integer[], p_note text, p_procurement_partner_id uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor        text;
  v_max_seq      int;
  v_po_id        text;
  v_line_count   int;
  v_line         jsonb;
  v_sku          text;
  v_qty          int;
  v_cost         numeric(14,2);
  v_cost_source  cost_source_enum;
  v_attrs        jsonb;
  v_is_own       boolean := false;        -- 0154
  v_supplier_name text;                   -- 0154
begin
  if p_warehouse_id is null then
    raise exception 'warehouse is required'
      using errcode = '22023', detail = 'warehouse_required';
  end if;
  if not exists (select 1 from suppliers where id = p_supplier_id) then
    raise exception 'supplier not found'
      using errcode = 'P0001', detail = 'supplier_not_found';
  end if;
  if not exists (select 1 from warehouses where id = p_warehouse_id) then
    raise exception 'warehouse not found'
      using errcode = 'P0001', detail = 'warehouse_not_found';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) = 0 then
    raise exception 'lines must be a non-empty array'
      using errcode = 'P0001', detail = 'lines_empty';
  end if;
  if p_procurement_partner_id is not null
     and not exists (select 1 from delivery_partners where id = p_procurement_partner_id) then
    raise exception 'procurement partner not found'
      using errcode = 'P0001', detail = 'partner_not_found';
  end if;

  v_actor := coalesce((select name from app_users where id = auth.uid()), 'Logistics');

  -- 0154: resolve once for the per-unit mint (Carres-owned warehouses only).
  select (kind = 'own') into v_is_own from warehouses where id = p_warehouse_id;
  select name into v_supplier_name from suppliers where id = p_supplier_id;

  select coalesce(max((substring(id from 'PO-(\d+)$'))::int), 2030)
    into v_max_seq
    from purchase_orders
   where id ~ '^PO-\d+$';

  v_max_seq := v_max_seq + 1;
  v_po_id := 'PO-' || v_max_seq::text;

  insert into purchase_orders
    (id, so_refs, supplier_id, warehouse_id, eta_date, status, sup_status, placed_at,
     procurement_partner_id)
  values
    (v_po_id, p_so_refs, p_supplier_id, p_warehouse_id, p_eta_date,
     'open', 'pending', now(),
     p_procurement_partner_id);

  v_line_count := 0;
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_sku := v_line->>'sku';
    v_qty := (v_line->>'qty')::int;
    if v_sku is null or v_qty is null or v_qty <= 0 then
      raise exception 'invalid line: sku=%, qty=%', v_sku, v_qty
        using errcode = 'P0001', detail = 'invalid_qty';
    end if;
    v_cost        := (v_line->>'cost')::numeric(14,2);
    v_cost_source := (v_line->>'cost_source')::cost_source_enum;
    if v_cost is null or v_cost_source is null then
      raise exception 'cost and cost_source required for new PO line (sku=%)', v_sku
        using errcode = '22023', detail = 'cost_required';
    end if;
    v_attrs := v_line->'attrs';
    insert into purchase_order_lines (po_id, sku, qty, received_qty, cost, cost_source, attrs)
    values (v_po_id, v_sku, v_qty, 0, v_cost, v_cost_source, v_attrs);

    -- 0153/0154: mint one tracked unit per physical piece, status 'incoming'
    -- (excluded from stock_balances rollup until it arrives). Forced
    -- id-abc123456 unit_code per row. Carres-owned warehouses only.
    if v_is_own and v_qty > 0 then
      insert into ops_stock_items (unit_code, sku, warehouse_id, status, supplier, po_no, source_ref, date_in)
      select public.gen_unit_code(), v_sku, p_warehouse_id, 'incoming',
             v_supplier_name, v_po_id, 'po_mint', current_date
        from generate_series(1, v_qty);
    end if;

    v_line_count := v_line_count + 1;
  end loop;

  insert into audit_log (role, actor_text, action, ref)
  values ('operation', v_actor,
          format('Created PO %s · %s lines%s',
                 v_po_id, v_line_count,
                 case when p_note is not null and btrim(p_note) <> ''
                      then ' · ' || btrim(p_note)
                      else '' end),
          v_po_id);

  return v_po_id;
end;
$function$;

-- 3. REAL operation_cancel_po (2-arg) — verbatim + PO-cancel void.
CREATE OR REPLACE FUNCTION public.operation_cancel_po(p_po_id text, p_reason text)
 RETURNS purchase_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_po               purchase_orders;
  v_dealer_id        uuid;
  v_actor            text;
  v_threads_released int;
  v_units_voided     int := 0;   -- 0154
begin
  if not public.is_operation() then
    raise exception 'forbidden: logistics role required'
      using errcode = '42501', detail = 'forbidden';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reason required'
      using errcode = 'P0001', detail = 'reason_required';
  end if;

  select * into v_po from purchase_orders where id = p_po_id;
  if not found then
    raise exception 'PO not found: %', p_po_id
      using errcode = '42P01', detail = 'po_not_found';
  end if;

  if v_po.status <> 'open' then
    raise exception 'PO is not open (current status: %)', v_po.status
      using errcode = '22023', detail = 'wrong_status';
  end if;

  if v_po.so is not null then
    select dealer_id into v_dealer_id
      from orders where so = v_po.so
      limit 1;
  end if;

  v_actor := coalesce((select name from app_users where id = auth.uid()), 'Logistics');

  update purchase_orders
    set status = 'cancelled',
        updated_at = now()
    where id = p_po_id
    returning * into v_po;

  update order_supplier_threads
     set po_id        = null,
         warehouse_id = null,
         updated_at   = now()
   where po_id = p_po_id;
  get diagnostics v_threads_released = row_count;

  -- 0154: void this PO's never-arrived (incoming) tracked units so phantom IDs
  -- don't linger in the per-unit register.
  update ops_stock_items
     set status = 'voided', updated_at = now()
   where po_no = p_po_id and status = 'incoming';
  get diagnostics v_units_voided = row_count;

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values (
    'operation',
    v_actor,
    format('Cancelled PO %s · %s threads released · %s unit(s) voided · %s',
           p_po_id, v_threads_released, v_units_voided, p_reason),
    v_dealer_id,
    p_po_id
  );

  return v_po;
end;
$function$;

-- 4. RESTORE operation_receive_po_with_do to its REAL body + incoming->free flip.
CREATE OR REPLACE FUNCTION public.operation_receive_po_with_do(p_po_id text, p_do_file_path text, p_do_number text, p_lines jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_po                 purchase_orders;
  v_role               app_role;
  v_uid                uuid;
  v_actor              text;
  v_was_relocated      boolean;
  v_line               jsonb;
  v_line_id            uuid;
  v_received_qty       int;
  v_existing_line      purchase_order_lines;
  v_sku                text;
  v_delta              int;
  v_lines_updated      int := 0;
  v_thread             record;
  v_target_thread_stage operation_stage;
  v_target_sup_status  po_sup_status;
  v_threads_advanced   int := 0;
  v_reserve            record;
  v_thread_satisfied   boolean;
  v_outstanding        int;
begin
  if p_po_id is null or length(btrim(p_po_id)) = 0 then
    raise exception 'p_po_id required' using errcode = '22023', detail = 'invalid_input';
  end if;
  if p_do_file_path is null or length(btrim(p_do_file_path)) = 0 then
    raise exception 'p_do_file_path required' using errcode = '22023', detail = 'invalid_input';
  end if;
  if p_do_number is null or length(btrim(p_do_number)) = 0 then
    raise exception 'p_do_number required' using errcode = '22023', detail = 'invalid_input';
  end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'p_lines required (at least one line)' using errcode = '22023', detail = 'invalid_input';
  end if;

  v_uid  := auth.uid();
  v_role := public.app_role();

  if v_role not in ('operation', 'principal', 'partner') then
    raise exception 'forbidden: only logistics/principal/partner can receive POs'
      using errcode = '42501', detail = 'forbidden';
  end if;

  if v_role = 'partner' then
    select * into v_po from purchase_orders
     where id = p_po_id and procurement_partner_id = public.app_partner_id()
     for update;
  else
    select * into v_po from purchase_orders where id = p_po_id for update;
  end if;
  if not found then
    raise exception 'PO not found or not assigned to caller'
      using errcode = '42501', detail = 'po_not_found_or_cross_tenant';
  end if;

  if v_po.status = 'received' then
    raise exception 'PO already fully received'
      using errcode = '22023', detail = 'already_received';
  end if;

  v_was_relocated := v_po.sup_status = 'relocated';
  v_actor := coalesce((select name from app_users where id = v_uid), initcap(v_role::text));

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_line_id := nullif(v_line->>'id', '')::uuid;
    v_received_qty := nullif(v_line->>'received_qty', '')::int;

    if v_line_id is null or v_received_qty is null or v_received_qty < 0 then
      raise exception 'invalid line: id=%, received_qty=%', v_line_id, v_received_qty
        using errcode = '22023', detail = 'invalid_line';
    end if;

    select * into v_existing_line from purchase_order_lines
     where id = v_line_id and po_id = p_po_id for update;
    if not found then
      raise exception 'PO line not found for id=%', v_line_id using errcode = '42P01', detail = 'po_line_not_found';
    end if;

    v_sku := v_existing_line.sku;

    if v_received_qty > v_existing_line.qty then
      raise exception 'over-received: % > ordered %', v_received_qty, v_existing_line.qty
        using errcode = 'P0001', detail = 'over_received';
    end if;

    v_delta := v_received_qty - v_existing_line.received_qty;
    if v_delta < 0 then
      raise exception 'received_qty must be >= currently received (%)', v_existing_line.received_qty
        using errcode = 'P0001', detail = 'received_qty_decrease';
    end if;

    update purchase_order_lines set received_qty = v_received_qty
     where id = v_line_id;

    if v_delta > 0 then
      insert into stock_balances (sku, warehouse_id, qty)
        values (v_sku, v_po.warehouse_id, v_delta)
        on conflict (sku, warehouse_id)
        do update set qty = stock_balances.qty + v_delta, updated_at = now();

      insert into stock_movements (sku, warehouse_id, qty, kind, ref, by_role, by_user_id)
      values (v_sku, v_po.warehouse_id, v_delta, 'in', p_po_id, v_role, v_uid);

      -- 0154: flip v_delta of this PO's 'incoming' tracked units of this sku
      -- -> 'free' (they have physically arrived). Flips the SAME rows minted at
      -- PO-open, so the per-unit count never double-counts vs the stock_balances
      -- bump above. No-op for non-Carres warehouses (no incoming rows minted).
      update ops_stock_items
         set status = 'free', updated_at = now()
       where id in (
         select id from ops_stock_items
          where po_no = p_po_id and sku = v_sku and status = 'incoming'
          order by created_at
          limit v_delta
       );

      v_lines_updated := v_lines_updated + 1;
    end if;
  end loop;

  for v_thread in
    select * from order_supplier_threads
     where po_id = p_po_id and operation_stage = 'awaiting_operation_action'
  loop
    select coalesce(bool_and(pol.received_qty >= pol.qty), true)
      into v_thread_satisfied
      from order_lines ol
      join product_skus ps on ps.sku = ol.sku
      join product_models pm on pm.id = ps.model_id
      left join purchase_order_lines pol
        on pol.po_id = p_po_id and pol.sku = ol.sku
     where ol.order_id = v_thread.order_id
       and ps.supplier_id = v_thread.supplier_id
       and pm.category::text = v_thread.category;

    if not v_thread_satisfied then
      continue;
    end if;

    if v_was_relocated then
      v_target_thread_stage := 'waiting';
    else
      v_target_thread_stage := case when v_thread.sop_name = 'SOFA_SPECIAL'
                                    then 'dispatched'
                                    else 'ready_to_dispatch'
                               end;
    end if;

    update order_supplier_threads
       set operation_stage = v_target_thread_stage,
           warehouse_id    = v_po.warehouse_id,
           reserved_at     = now(),
           updated_at      = now()
     where id = v_thread.id;

    v_threads_advanced := v_threads_advanced + 1;

    for v_reserve in
      select ol.sku as sku, ol.qty as qty
        from order_lines ol
        join product_skus ps on ps.sku = ol.sku
        join product_models pm on pm.id = ps.model_id
       where ol.order_id = v_thread.order_id
         and ps.supplier_id = v_thread.supplier_id
         and pm.category::text = v_thread.category
    loop
      begin
        update stock_balances
           set reserved   = reserved + v_reserve.qty, updated_at = now()
         where sku = v_reserve.sku and warehouse_id = v_po.warehouse_id;
        if not found then
          raise exception 'no stock_balances row for sku=% wh=%', v_reserve.sku, v_po.warehouse_id
            using errcode = 'P0001', detail = 'insufficient_stock_for_reserve';
        end if;
      exception
        when check_violation then
          raise exception 'cannot reserve sku=% at wh=% (qty < reserved + %)',
                          v_reserve.sku, v_po.warehouse_id, v_reserve.qty
            using errcode = 'P0001', detail = 'insufficient_stock_for_reserve';
      end;
    end loop;
  end loop;

  select count(*) into v_outstanding
    from purchase_order_lines where po_id = p_po_id and received_qty < qty;

  if v_outstanding = 0 then
    if v_was_relocated then
      v_target_sup_status := 'at_warehouse_waiting';
    else
      v_target_sup_status := 'delivered';
    end if;

    update purchase_orders
       set status         = 'received',
           sup_status     = v_target_sup_status,
           do_file_path   = p_do_file_path,
           do_uploaded_at = now(),
           do_uploaded_by = v_uid,
           updated_at     = now()
     where id = p_po_id;
  else
    update purchase_orders
       set do_file_path   = p_do_file_path,
           do_uploaded_at = now(),
           do_uploaded_by = v_uid,
           updated_at     = now()
     where id = p_po_id;
  end if;

  insert into po_history (po_id, text, by_role)
  values (p_po_id,
          format('Received with DO %s (%s path) — %s line(s), %s thread(s)',
                 btrim(p_do_number),
                 case when v_was_relocated then 'relocated→at_warehouse_waiting' else 'normal→delivered' end,
                 v_lines_updated, v_threads_advanced),
          v_role);

  insert into audit_log (role, actor_text, action, ref)
  values (v_role, v_actor,
          format('Received PO %s with DO %s', p_po_id, btrim(p_do_number)), p_po_id);

  return jsonb_build_object(
    'po_id',             p_po_id,
    'do_file_path',      p_do_file_path,
    'do_number',         btrim(p_do_number),
    'lines_updated',     v_lines_updated,
    'threads_advanced',  v_threads_advanced,
    'po_status',         (select status from purchase_orders where id = p_po_id),
    'sup_status',        (select sup_status from purchase_orders where id = p_po_id),
    'was_relocated',     v_was_relocated
  );
end;
$function$;

-- 5. Sanity — verify hooks are on the REAL signatures + ghosts are gone.
DO $sanity$
DECLARE
  v_def text;
  v_ghost_inner int;
  v_ghost_cancel int;
BEGIN
  SELECT count(*) INTO v_ghost_inner FROM pg_proc WHERE proname='_operation_create_po_inner' AND pronargs=6;
  IF v_ghost_inner <> 0 THEN RAISE EXCEPTION '0154 sanity: 6-arg ghost _operation_create_po_inner still exists'; END IF;
  SELECT count(*) INTO v_ghost_cancel FROM pg_proc WHERE proname='operation_cancel_po' AND pronargs=1;
  IF v_ghost_cancel <> 0 THEN RAISE EXCEPTION '0154 sanity: 1-arg ghost operation_cancel_po still exists'; END IF;

  v_def := pg_get_functiondef('public._operation_create_po_inner(uuid,uuid,jsonb,date,integer[],text,uuid)'::regprocedure);
  IF position('gen_unit_code' in v_def) = 0 THEN RAISE EXCEPTION '0154 sanity: real create_inner missing mint'; END IF;
  IF position('purchase_order_lines' in v_def) = 0 THEN RAISE EXCEPTION '0154 sanity: real create_inner body lost'; END IF;

  v_def := pg_get_functiondef('public.operation_cancel_po(text,text)'::regprocedure);
  IF position('voided' in v_def) = 0 THEN RAISE EXCEPTION '0154 sanity: real cancel_po missing void'; END IF;
  IF position('threads released' in v_def) = 0 THEN RAISE EXCEPTION '0154 sanity: real cancel_po body lost'; END IF;

  v_def := pg_get_functiondef('public.operation_receive_po_with_do(text,text,text,jsonb)'::regprocedure);
  IF position('status = ''incoming''' in v_def) = 0 THEN RAISE EXCEPTION '0154 sanity: receive missing free flip'; END IF;
  IF position('v_threads_advanced' in v_def) = 0 THEN RAISE EXCEPTION '0154 sanity: receive real body (thread advance) lost'; END IF;
  IF position('insufficient_stock_for_reserve' in v_def) = 0 THEN RAISE EXCEPTION '0154 sanity: receive real body (reserve) lost'; END IF;

  RAISE NOTICE '0154 OK: ghosts dropped; mint/void/free on real signatures; receive body restored';
END $sanity$;
