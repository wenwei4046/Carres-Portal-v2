-- =============================================================================
-- 0097_relocate_to_ready_to_dispatch.sql (Loo 2026-05-13)
-- =============================================================================
-- Bug: when sofa flow is rejected by the partner (partner_reject_customer →
-- po.sup_status='customer_rejected'), Logistics calls
-- logistics_relocate_warehouse to point the PO at a Carres-owned warehouse
-- instead. The supplier re-delivers there, Logistics presses Receive, and
-- the customer-leg thread is currently set to logistics_stage='waiting'
-- (receive RPC 0076:209-211 — the relocated branch).
--
-- Loo's expectation: post-relocate the sofa is at a Carres WH, NOT a
-- partner-owned one, so the LP is no longer implicitly assigned via WH
-- ownership. The thread should go to 'ready_to_dispatch' so Logistics
-- explicitly assigns a delivery partner via logistics_assign_partner. Same
-- pattern as the mattress / bedframe (STANDARD SOP) flow.
--
-- Fix: re-create logistics_receive_po_with_do with the single line change:
--   v_target_thread_stage := 'waiting'  →  'ready_to_dispatch'
-- inside the v_was_relocated branch. Body is otherwise identical to 0096's
-- definition, so this migration is reversible by re-applying 0096.
--
-- Authorized in conversation 2026-05-13 per CLAUDE.md §7.
-- =============================================================================

create or replace function public.logistics_receive_po_with_do(
  p_po_id        text,
  p_do_file_path text,
  p_do_number    text,
  p_lines        jsonb
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_po                 purchase_orders;
  v_role               app_role;
  v_partner_id         uuid;
  v_actor              text;
  v_line               jsonb;
  v_line_id            uuid;
  v_sku                text;
  v_received_qty       int;
  v_existing_line      purchase_order_lines;
  v_delta              int;
  v_outstanding        int;
  v_lines_updated      int := 0;
  v_threads_advanced   int := 0;
  v_thread             record;
  v_reserve            record;
  v_uid                uuid;
  v_was_relocated      boolean;
  v_target_thread_stage logistics_stage;
  v_target_sup_status  po_sup_status;
begin
  v_role := public.app_role();
  v_partner_id := public.app_partner_id();
  v_uid := (select auth.uid());

  if v_role not in ('logistics', 'partner') then
    raise exception 'forbidden: logistics or partner only'
      using errcode = '42501', detail = 'forbidden';
  end if;

  if p_do_file_path is null or length(btrim(p_do_file_path)) = 0 then
    raise exception 'DO file path is required' using errcode = '22023', detail = 'do_file_path_required';
  end if;
  if p_do_number is null or length(btrim(p_do_number)) < 3 then
    raise exception 'DO number must be at least 3 characters' using errcode = '22023', detail = 'do_number_too_short';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'lines must be a non-empty array' using errcode = '22023', detail = 'lines_empty';
  end if;

  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO not found' using errcode = '42P01', detail = 'po_not_found';
  end if;

  if v_role = 'partner' then
    if v_partner_id is null or v_po.procurement_partner_id is distinct from v_partner_id then
      raise exception 'forbidden: cross-partner receive' using errcode = '42501', detail = 'forbidden';
    end if;
  end if;

  if v_po.status is distinct from 'open' then
    raise exception 'PO is not open (status=%)', v_po.status using errcode = '22023', detail = 'po_not_open';
  end if;

  v_was_relocated := (v_po.sup_status = 'relocated');

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

      v_lines_updated := v_lines_updated + 1;
    end if;
  end loop;

  for v_thread in
    select * from order_supplier_threads
     where po_id = p_po_id
       and logistics_stage in ('awaiting_logistics_action', 'dispatched')
  loop
    if v_thread.logistics_stage = 'awaiting_logistics_action' then
      if v_was_relocated then
        -- 0097: was 'waiting' in 0096/0076. After relocate the sofa lives at
        -- a Carres WH; Logistics must explicitly assign a delivery LP via
        -- logistics_assign_partner. 'ready_to_dispatch' mirrors the STANDARD
        -- SOP path so the UI surfaces the assign affordance.
        v_target_thread_stage := 'ready_to_dispatch';
      else
        v_target_thread_stage := case when v_thread.sop_name = 'SOFA_SPECIAL'
                                      then 'dispatched'
                                      else 'ready_to_dispatch'
                                 end;
      end if;
    else
      v_target_thread_stage := v_thread.logistics_stage;
    end if;

    update order_supplier_threads
       set logistics_stage = v_target_thread_stage,
           warehouse_id    = coalesce(warehouse_id, v_po.warehouse_id),
           reserved_at     = coalesce(reserved_at, now()),
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
$$;

revoke all on function public.logistics_receive_po_with_do(text, text, text, jsonb) from public;
revoke all on function public.logistics_receive_po_with_do(text, text, text, jsonb) from anon;
grant execute on function public.logistics_receive_po_with_do(text, text, text, jsonb) to authenticated;
