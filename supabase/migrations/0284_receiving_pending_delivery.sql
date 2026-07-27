-- =============================================================================
-- 0284_receiving_pending_delivery.sql — R1 of the receiving & claim queue
-- =============================================================================
-- Card R1 (docs/receiving-claim-execution-queue.md, locked with Jess 2026-07-27):
-- "the receive flow records per line: Received qty · Pending delivery qty ·
--  Damaged qty · Wrong item qty".
--
-- Receiving is an INSPECTION, not a checkbox. Before this migration a PO line
-- could only say how many good units arrived; a broken or wrong unit had
-- nowhere to live except the free-text receiving note, which nothing can count,
-- chase or roll up. R2 turns these numbers into supplier claim cases — they
-- have to exist first.
--
-- What this does:
--   1. purchase_order_lines gains `damaged_qty` + `wrong_item_qty` (both
--      NOT NULL DEFAULT 0, >= 0). Existing rows read 0 — i.e. "no problem
--      recorded", which is exactly what they mean.
--   2. `operation_receive_po_with_do` learns to record them, per DO. Same
--      signature, same role gate, same stock / thread / reserve behaviour —
--      every other line of the body is unchanged from the live version.
--
-- Deliberate design decisions (each one is load-bearing):
--
--   * A damaged / wrong unit is NOT received. `received_qty` stays "good units
--     booked into stock", so the stock ledger can never gain a broken unit and
--     the PO stays OPEN with its pending qty visible. That is also why R4 will
--     have something to quarantine and nothing to un-book.
--   * `damaged_qty` / `wrong_item_qty` in the payload are what THIS delivery
--     found — the RPC ADDS them to the line's running counters. `received_qty`
--     keeps its existing new-total semantics (changing it would break every
--     caller); the difference is documented at both read sites.
--   * NO table-level check on received + damaged + wrong <= qty. A line ordered
--     10 can legitimately record 10 damaged and later 10 received, once the
--     supplier replaces them — a cumulative cap would refuse the replacement.
--     The real rule is per-delivery and lives in the RPC: one DO may never
--     account for more units than the line still owes.
--   * Vocabulary law (Jess, locked): the not-yet-arrived qty is PENDING
--     DELIVERY, never "missing" — the goods are not lost, the supplier just has
--     not sent them. It stays DERIVED (qty - received_qty), so it cannot drift
--     from the two numbers it is made of.
--
-- Verified before apply: the whole migration ran in a rolled-back transaction
-- against live with 10 assertions (defaults · both counters land · a damaged
-- unit is not received · the PO stays open · stock gained only the good units ·
-- the history line carries the inspection · over-report refused · negative
-- refused · the replacement DO closes the PO and the damage history survives).
-- =============================================================================

alter table public.purchase_order_lines
  add column if not exists damaged_qty    int not null default 0,
  add column if not exists wrong_item_qty int not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.purchase_order_lines'::regclass and conname='po_lines_damaged_qty_nonneg') then
    alter table public.purchase_order_lines add constraint po_lines_damaged_qty_nonneg check (damaged_qty >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.purchase_order_lines'::regclass and conname='po_lines_wrong_item_qty_nonneg') then
    alter table public.purchase_order_lines add constraint po_lines_wrong_item_qty_nonneg check (wrong_item_qty >= 0);
  end if;
end $$;

comment on column public.purchase_order_lines.damaged_qty is
  'R1: units that arrived broken, cumulative across every DO on this line. NOT counted as received — the supplier still owes a good unit, so the qty stays Pending delivery.';
comment on column public.purchase_order_lines.wrong_item_qty is
  'R1: units that arrived as something other than what was ordered, cumulative. NOT counted as received.';

create or replace function public.operation_receive_po_with_do(
  p_po_id        text,
  p_do_file_path text,
  p_do_number    text,
  p_lines        jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_po                 purchase_orders;
  v_role               app_role;
  v_uid                uuid;
  v_actor              text;
  v_was_relocated      boolean;
  v_line               jsonb;
  v_line_id            uuid;
  v_received_qty       int;
  v_damaged_add        int;
  v_wrong_add          int;
  v_damaged_total      int := 0;
  v_wrong_total        int := 0;
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
    -- R1: what THIS delivery found wrong. Absent = 0, so a pre-R1 caller
    -- behaves exactly as before.
    v_damaged_add := coalesce(nullif(v_line->>'damaged_qty', '')::int, 0);
    v_wrong_add   := coalesce(nullif(v_line->>'wrong_item_qty', '')::int, 0);

    if v_line_id is null or v_received_qty is null or v_received_qty < 0 then
      raise exception 'invalid line: id=%, received_qty=%', v_line_id, v_received_qty
        using errcode = '22023', detail = 'invalid_line';
    end if;
    if v_damaged_add < 0 or v_wrong_add < 0 then
      raise exception 'invalid line: damaged_qty=%, wrong_item_qty=%', v_damaged_add, v_wrong_add
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

    -- R1: one delivery may never account for more units than the line still
    -- owes. NOTE this is deliberately per-DO, not cumulative — a line ordered
    -- 10 can record 10 damaged and later 10 received once they are replaced.
    if v_received_qty + v_damaged_add + v_wrong_add > v_existing_line.qty then
      raise exception 'reported % units on a line of % (received % + damaged % + wrong %)',
                      v_received_qty + v_damaged_add + v_wrong_add, v_existing_line.qty,
                      v_received_qty, v_damaged_add, v_wrong_add
        using errcode = 'P0001', detail = 'report_exceeds_ordered';
    end if;

    v_delta := v_received_qty - v_existing_line.received_qty;
    if v_delta < 0 then
      raise exception 'received_qty must be >= currently received (%)', v_existing_line.received_qty
        using errcode = 'P0001', detail = 'received_qty_decrease';
    end if;

    -- R1: the issue counters ACCUMULATE; received_qty keeps new-total semantics.
    update purchase_order_lines
       set received_qty   = v_received_qty,
           damaged_qty    = damaged_qty + v_damaged_add,
           wrong_item_qty = wrong_item_qty + v_wrong_add
     where id = v_line_id;

    v_damaged_total := v_damaged_total + v_damaged_add;
    v_wrong_total   := v_wrong_total + v_wrong_add;

    if v_delta > 0 then
      insert into stock_balances (sku, warehouse_id, qty)
        values (v_sku, v_po.warehouse_id, v_delta)
        on conflict (sku, warehouse_id)
        do update set qty = stock_balances.qty + v_delta, updated_at = now();

      insert into stock_movements (sku, warehouse_id, qty, kind, ref, by_role, by_user_id)
      values (v_sku, v_po.warehouse_id, v_delta, 'in', p_po_id, v_role, v_uid);

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
     where po_id = p_po_id and operation_stage = 'in_production'
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
          format('Received with DO %s (%s path) — %s line(s), %s thread(s)%s',
                 btrim(p_do_number),
                 case when v_was_relocated then 'relocated→at_warehouse_waiting' else 'normal→delivered' end,
                 v_lines_updated, v_threads_advanced,
                 case when v_damaged_total + v_wrong_total > 0
                      then format(' · issue: %s damaged, %s wrong item', v_damaged_total, v_wrong_total)
                      else '' end),
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
    'was_relocated',     v_was_relocated,
    'damaged_qty',       v_damaged_total,
    'wrong_item_qty',    v_wrong_total
  );
end;
$fn$;

grant execute on function public.operation_receive_po_with_do(text, text, text, jsonb) to authenticated;

do $$
declare v_copies int; v_cols int;
begin
  select count(*) into v_cols from information_schema.columns
   where table_schema='public' and table_name='purchase_order_lines'
     and column_name in ('damaged_qty','wrong_item_qty');
  if v_cols <> 2 then raise exception 'sanity: expected both R1 columns, found %', v_cols; end if;
  select count(*) into v_copies from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='operation_receive_po_with_do';
  if v_copies <> 1 then raise exception 'sanity: % copies of the RPC', v_copies; end if;
  if not has_function_privilege('authenticated','public.operation_receive_po_with_do(text, text, text, jsonb)','execute') then
    raise exception 'sanity: authenticated lost execute';
  end if;
end $$;
