-- =============================================================================
-- 0096_partner_confirm_receive_sofa_thread_state.sql (Loo 2026-05-12)
-- =============================================================================
-- Bug: HoOKkA sofa (SOFA_SPECIAL + own_logistics path) — after partner pressed
-- "Confirm receive" and logistics pressed "Receive", the customer-leg thread
-- ended up at stage='dispatched' but with NULL warehouse_id, NULL
-- delivery_partner_id, NULL partner_accepted_at, NULL confirm_delivery_date,
-- AND stock_balances.reserved was never incremented.
--
-- Symptoms Loo reported:
--   - Partner Deliveries tab (filter: delivery_partner_id = me AND
--     stage = dispatched, RPC partner_threads_to_deliver 0071:60-61) was empty
--   - Warehouse stock_balances showed qty in but reserved = 0
--
-- Root cause: two RPCs each did half the job.
--   1. partner_confirm_receive (0090:90-94) pushed thread to dispatched but only
--      wrote logistics_stage + updated_at.
--   2. logistics_receive_po_with_do (0076:204-206) only iterated threads at
--      'awaiting_logistics_action' — by the time it ran, sofa threads were
--      already at 'dispatched' so its reserve + warehouse_id write loop saw 0
--      rows. po_history logged "0 thread(s)" both times.
--
-- Fix:
--   1. partner_confirm_receive — in the WH-owner branch (v_owns_via_wh = true,
--      sofa direct-ship to partner WH), write the full thread state in one
--      shot: warehouse_id, delivery_partner_id (= calling partner), partner_
--      accepted_at, confirm_delivery_date (= orders.delivery_date). The
--      procurement-partner branch keeps current behavior (only stage update —
--      a separate logistics_assign_partner step still assigns the LP there).
--      Reserve does NOT run here: stock_balances row only exists after
--      receive_po_with_do has run, so reserve happens there.
--   2. logistics_receive_po_with_do — broaden thread filter to include threads
--      already at 'dispatched'. Conditionally update logistics_stage only when
--      currently 'awaiting_logistics_action'. Use coalesce on warehouse_id +
--      reserved_at so any value partner_confirm_receive already wrote is
--      preserved. Reserve loop runs for all eligible threads.
--
-- Backfill for already-broken PO-2031 + PO-2032 is a separate one-shot SQL,
-- not part of this migration. Apply this migration first, then run the
-- backfill against staging via execute_sql.
--
-- No new columns. No RLS changes. No DROP. Reversible: re-apply 0090/0076.
-- Authorized in conversation 2026-05-12 per CLAUDE.md §7.
-- =============================================================================


-- 1. partner_confirm_receive — branch on v_owns_via_wh for sofa direct-ship.
CREATE OR REPLACE FUNCTION public.partner_confirm_receive(p_po_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_po                purchase_orders;
  v_role              app_role;
  v_partner_id        uuid;
  v_actor             text;
  v_threads_advanced  int;
  v_owns_via_wh       boolean;
BEGIN
  v_role := public.app_role();
  v_partner_id := public.app_partner_id();

  IF v_role IS DISTINCT FROM 'partner' THEN
    RAISE EXCEPTION 'forbidden: partner only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;
  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'partner JWT missing partner_id'
      USING ERRCODE = '42501', DETAIL = 'partner_id_missing';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO not found'
      USING ERRCODE = '42P01', DETAIL = 'po_not_found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM warehouses w
    WHERE w.id = v_po.warehouse_id
      AND w.owning_partner_id = v_partner_id
  ) INTO v_owns_via_wh;

  IF v_po.procurement_partner_id IS DISTINCT FROM v_partner_id AND NOT v_owns_via_wh THEN
    RAISE EXCEPTION 'forbidden: cross-partner confirm-receive'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  IF v_po.sup_status IS DISTINCT FROM 'ready_confirm_sent' THEN
    RAISE EXCEPTION 'PO is not in ready_confirm_sent state (got %)', v_po.sup_status
      USING ERRCODE = '22023', DETAIL = 'wrong_sup_status';
  END IF;

  v_actor := COALESCE((SELECT name FROM app_users WHERE id = (SELECT auth.uid())), 'Partner');

  UPDATE purchase_orders
     SET sup_status            = 'partner_confirmed',
         partner_confirmed_at  = now(),
         updated_at            = now()
   WHERE id = p_po_id;

  -- Branch on path:
  --   WH-owner path (sofa direct-ship to partner WH): write full thread state
  --     so partner Deliveries tab (partner_threads_to_deliver, 0071) picks
  --     it up and the LP knows the sofa is at their WH awaiting delivery
  --     to customer. Pulls confirm_delivery_date from the parent order.
  --   Procurement-partner path (factory pickup): keep prior behavior — only
  --     advance stage. A separate logistics_assign_partner call will set the
  --     customer-leg LP later.
  IF v_owns_via_wh THEN
    UPDATE order_supplier_threads ost
       SET logistics_stage       = 'dispatched',
           warehouse_id          = v_po.warehouse_id,
           delivery_partner_id   = v_partner_id,
           partner_accepted_at   = now(),
           confirm_delivery_date = (SELECT o.delivery_date FROM orders o WHERE o.id = ost.order_id),
           updated_at            = now()
     WHERE po_id = p_po_id;
  ELSE
    UPDATE order_supplier_threads
       SET logistics_stage = 'dispatched',
           updated_at      = now()
     WHERE po_id = p_po_id;
  END IF;
  GET DIAGNOSTICS v_threads_advanced = ROW_COUNT;

  INSERT INTO po_history (po_id, text, by_role)
  VALUES (
    p_po_id,
    'Partner confirmed receive · supplier may dispatch',
    'partner'
  );

  INSERT INTO audit_log (role, actor_text, action, ref)
  VALUES ('partner', v_actor,
          format('Partner confirmed receive on PO %s (%s thread(s) advanced, %s path)',
                 p_po_id, v_threads_advanced,
                 CASE WHEN v_owns_via_wh THEN 'wh-owner' ELSE 'procurement' END),
          p_po_id);

  RETURN jsonb_build_object(
    'po_id',                p_po_id,
    'sup_status',           'partner_confirmed',
    'partner_confirmed_at', now(),
    'threads_advanced',     v_threads_advanced,
    'wh_owner_path',        v_owns_via_wh
  );
END;
$$;

REVOKE ALL ON FUNCTION public.partner_confirm_receive(text) FROM public;
GRANT EXECUTE ON FUNCTION public.partner_confirm_receive(text) TO authenticated;


-- 2. logistics_receive_po_with_do — broaden thread filter so already-dispatched
-- threads (sofa direct-ship after partner_confirm_receive) still get
-- reserve + reserved_at written. Conditionally update logistics_stage only on
-- 'awaiting_logistics_action'. Use coalesce on warehouse_id + reserved_at to
-- preserve any value partner_confirm_receive already wrote.
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

  -- Role gate: logistics OR partner.
  if v_role not in ('logistics', 'partner') then
    raise exception 'forbidden: logistics or partner only'
      using errcode = '42501', detail = 'forbidden';
  end if;

  -- Validate inputs.
  if p_do_file_path is null or length(btrim(p_do_file_path)) = 0 then
    raise exception 'DO file path is required' using errcode = '22023', detail = 'do_file_path_required';
  end if;
  if p_do_number is null or length(btrim(p_do_number)) < 3 then
    raise exception 'DO number must be at least 3 characters' using errcode = '22023', detail = 'do_number_too_short';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'lines must be a non-empty array' using errcode = '22023', detail = 'lines_empty';
  end if;

  -- Lock PO row.
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

  -- v3 BRANCH: detect Sofa Reject + Relocate path.
  v_was_relocated := (v_po.sup_status = 'relocated');

  v_actor := coalesce((select name from app_users where id = v_uid), initcap(v_role::text));

  -- 0076: per-line update now keys by `id` (the line UUID) since (po_id, sku)
  -- is no longer unique once same-sku-different-attrs lines coexist.
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

  -- 0096: broaden thread filter. The SOFA_SPECIAL + own_logistics flow pushes
  -- threads to 'dispatched' inside partner_confirm_receive (0090). Without
  -- including those rows here, reserve + reserved_at + warehouse_id never get
  -- written for sofa receives. Standard flow still hits the same loop via
  -- 'awaiting_logistics_action' branch.
  for v_thread in
    select * from order_supplier_threads
     where po_id = p_po_id
       and logistics_stage in ('awaiting_logistics_action', 'dispatched')
  loop
    -- Determine target thread stage. Only transition off 'awaiting'; preserve
    -- 'dispatched' (partner_confirm_receive already set it).
    if v_thread.logistics_stage = 'awaiting_logistics_action' then
      if v_was_relocated then
        v_target_thread_stage := 'waiting';  -- Sofa Reject path
      else
        v_target_thread_stage := case when v_thread.sop_name = 'SOFA_SPECIAL'
                                      then 'dispatched'
                                      else 'ready_to_dispatch'
                                 end;
      end if;
    else
      -- Currently 'dispatched' (came in from partner_confirm_receive). Keep.
      v_target_thread_stage := v_thread.logistics_stage;
    end if;

    update order_supplier_threads
       set logistics_stage = v_target_thread_stage,
           warehouse_id    = coalesce(warehouse_id, v_po.warehouse_id),
           reserved_at     = coalesce(reserved_at, now()),
           updated_at      = now()
     where id = v_thread.id;

    v_threads_advanced := v_threads_advanced + 1;

    -- Reserve stock for thread's slice (unchanged from 0034:893-927).
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

  -- Determine target PO sup_status per branch.
  select count(*) into v_outstanding
    from purchase_order_lines where po_id = p_po_id and received_qty < qty;

  if v_outstanding = 0 then
    -- Full receive. Branch on relocated flag.
    if v_was_relocated then
      v_target_sup_status := 'at_warehouse_waiting';  -- Codex F3: new value from 0043
    else
      v_target_sup_status := 'delivered';  -- Codex F3: existing valid value (0034:938)
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
    -- Partial receive: persist DO + sup_status remains current.
    update purchase_orders
       set do_file_path   = p_do_file_path,
           do_uploaded_at = now(),
           do_uploaded_by = v_uid,
           updated_at     = now()
     where id = p_po_id;
  end if;

  -- Audit + history.
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
