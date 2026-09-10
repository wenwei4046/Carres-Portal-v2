-- ============================================================================
-- 0427 · An amendment may correct the paper's evidence
--        (owner correction 2026-09-06 — 【RECEIVING】 CARD 01 completion)
--
-- The owner's amendable list names "Supplier DO number and evidence"; 0426's
-- receiving_amend moved the number but not the paper. This redefines
-- receiving_amend (committed migrations never change — red line 6) with two
-- additive p_changes keys and NOTHING else altered:
--
--   do_file_path          a corrected signed-DO file. The old path is
--                         preserved in the amendment's before/after and the
--                         file itself is never deleted.
--   arrival_evidence_add  additional arrival photo/video entries.
--                         APPEND-ONLY — an amendment never removes recorded
--                         evidence.
--
-- Everything else (gates, date/DO-number/site/lines corrections, safe stock
-- recalculation, idempotency, append-only event) is reproduced verbatim from
-- 0426 §7.
-- ============================================================================

begin;

create or replace function public.receiving_amend(
  p_receipt_id uuid,
  p_reason text,
  p_changes jsonb,
  p_save_key uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  v_ctx jsonb;
  v_receipt warehouse_receipts;
  v_po purchase_orders;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_new_date date; v_new_do text; v_new_site uuid;
  v_clash warehouse_receipts;
  v_lines jsonb; v_chg jsonb; v_stored jsonb; v_stored_lines jsonb;
  v_line_id uuid; v_old_recv int; v_new_recv int; v_d int;
  v_pol purchase_order_lines;
  v_posts_stock boolean; v_site uuid; v_is_own boolean;
  v_moved int; v_supplier_name text;
  v_today_myt date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_qty_changed boolean := false;
  v_outstanding int;
  v_prior_event receiving_events;
  -- 0427
  v_new_do_file text;
  v_evidence_add jsonb;
  v_evidence_before int;
begin
  v_ctx := public.receiving_require_post_authority();
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'a correction reason is required'
      using errcode = '22023', detail = 'amend_reason_required';
  end if;

  -- Idempotency: the same amendment save key returns the recorded event.
  if p_save_key is not null then
    select * into v_prior_event from receiving_events
     where receipt_id = p_receipt_id and event = 'amended'
       and payload->>'save_key' = p_save_key::text
     limit 1;
    if found then
      return jsonb_build_object('receipt_id', p_receipt_id,
                                'status', 'posted', 'already_saved', true);
    end if;
  end if;

  select * into v_receipt from warehouse_receipts where id = p_receipt_id for update;
  if not found then
    raise exception 'receipt not found' using errcode = '42P01', detail = 'receipt_not_found';
  end if;
  if v_receipt.status <> 'posted' then
    raise exception 'only a posted receiving can be amended'
      using errcode = '22023', detail = 'receipt_not_posted';
  end if;

  select * into v_po from purchase_orders where id = v_receipt.po_id for update;

  -- Where this session's stock consequence lives.
  v_site := coalesce(v_receipt.actual_site_id, v_po.warehouse_id);
  select (pd.warehouse_id is not null and pd.warehouse_id = v_po.warehouse_id)
    into v_posts_stock
    from purchasing_destinations pd
   where pd.id = v_po.destination_id;
  v_posts_stock := coalesce(v_posts_stock, false) or v_receipt.actual_site_id is not null;
  select (kind = 'own') into v_is_own from warehouses where id = v_site;
  v_is_own := coalesce(v_is_own, false);
  select name into v_supplier_name from suppliers where id = v_po.supplier_id;

  -- ── header facts ─────────────────────────────────────────────────────────
  if p_changes ? 'goods_received_at' then
    v_new_date := nullif(p_changes->>'goods_received_at','')::date;
    if v_new_date is null or v_new_date > v_today_myt then
      raise exception 'Goods received on cannot be in the future'
        using errcode = '22023', detail = 'received_date_future';
    end if;
    if v_new_date < (v_po.placed_at at time zone 'Asia/Kuala_Lumpur')::date then
      raise exception 'Goods received on cannot be before the PO date (%)',
                      to_char((v_po.placed_at at time zone 'Asia/Kuala_Lumpur')::date, 'DD Mon YY')
        using errcode = '22023', detail = 'received_date_before_po';
    end if;
    if v_new_date is distinct from v_receipt.goods_received_at then
      v_before := v_before || jsonb_build_object('goods_received_at', v_receipt.goods_received_at);
      v_after  := v_after  || jsonb_build_object('goods_received_at', v_new_date);
      update warehouse_receipts set goods_received_at = v_new_date, updated_at = now()
       where id = p_receipt_id;
    end if;
  end if;

  if p_changes ? 'do_number' then
    v_new_do := btrim(coalesce(p_changes->>'do_number',''));
    if length(v_new_do) < 3 then
      raise exception 'a DO number is required' using errcode = '22023', detail = 'do_number_required';
    end if;
    if lower(v_new_do) is distinct from lower(coalesce(v_receipt.do_number,'')) then
      select * into v_clash from warehouse_receipts
       where po_id = v_receipt.po_id and lower(btrim(do_number)) = lower(v_new_do)
         and id <> v_receipt.id and status <> 'voided' limit 1;
      if found then
        raise exception 'DO % already belongs to another receiving (session %)', v_new_do, v_clash.id
          using errcode = 'P0001', detail = 'do_already_received';
      end if;
      v_before := v_before || jsonb_build_object('do_number', v_receipt.do_number);
      v_after  := v_after  || jsonb_build_object('do_number', v_new_do);
      update warehouse_receipts set do_number = v_new_do, updated_at = now()
       where id = p_receipt_id;
    end if;
  end if;

  if p_changes ? 'actual_site_id' then
    v_new_site := nullif(p_changes->>'actual_site_id','')::uuid;
    if v_new_site is not null and not exists (select 1 from warehouses where id = v_new_site) then
      raise exception 'actual site not found' using errcode = '22023', detail = 'actual_site_invalid';
    end if;
    if v_new_site is distinct from v_receipt.actual_site_id then
      v_before := v_before || jsonb_build_object('actual_site_id', v_receipt.actual_site_id);
      v_after  := v_after  || jsonb_build_object('actual_site_id', v_new_site);
      update warehouse_receipts set actual_site_id = v_new_site, updated_at = now()
       where id = p_receipt_id;
      -- The recorded location truth changes; posted stock is NOT silently
      -- relocated — a physical move is Stock's transfer door.
    end if;
  end if;

  -- ── 0427 · the paper's evidence ──────────────────────────────────────────
  if p_changes ? 'do_file_path' then
    v_new_do_file := btrim(coalesce(p_changes->>'do_file_path',''));
    if length(v_new_do_file) < 3 then
      raise exception 'a corrected DO file is required'
        using errcode = '22023', detail = 'do_file_invalid';
    end if;
    if v_new_do_file is distinct from coalesce(v_receipt.do_file_path,'') then
      -- The old paper is PRESERVED in before/after; the file is never deleted.
      v_before := v_before || jsonb_build_object('do_file_path', v_receipt.do_file_path);
      v_after  := v_after  || jsonb_build_object('do_file_path', v_new_do_file);
      update warehouse_receipts set do_file_path = v_new_do_file, updated_at = now()
       where id = p_receipt_id;
    end if;
  end if;

  if p_changes ? 'arrival_evidence_add' then
    v_evidence_add := p_changes->'arrival_evidence_add';
    if v_evidence_add is not null and jsonb_typeof(v_evidence_add) = 'array'
       and jsonb_array_length(v_evidence_add) > 0 then
      for v_chg in select * from jsonb_array_elements(v_evidence_add) loop
        if length(btrim(coalesce(v_chg->>'path',''))) < 3
           or coalesce(v_chg->>'kind','') not in ('photo','video') then
          raise exception 'invalid arrival evidence entry'
            using errcode = '22023', detail = 'evidence_invalid';
        end if;
      end loop;
      v_evidence_before :=
        coalesce(jsonb_array_length(coalesce(v_receipt.arrival_evidence, '[]'::jsonb)), 0);
      v_before := v_before || jsonb_build_object('arrival_evidence_count', v_evidence_before);
      v_after  := v_after  || jsonb_build_object(
        'arrival_evidence_count', v_evidence_before + jsonb_array_length(v_evidence_add));
      -- APPEND-ONLY: an amendment never removes recorded evidence.
      update warehouse_receipts
         set arrival_evidence = coalesce(arrival_evidence, '[]'::jsonb) || v_evidence_add,
             updated_at = now()
       where id = p_receipt_id;
    end if;
  end if;

  -- ── per-line received-quantity corrections ───────────────────────────────
  v_lines := p_changes->'lines';
  if v_lines is not null and jsonb_typeof(v_lines) = 'array' and jsonb_array_length(v_lines) > 0 then
    v_stored_lines := coalesce(v_receipt.lines, '[]'::jsonb);
    for v_chg in select * from jsonb_array_elements(v_lines) loop
      v_line_id := nullif(v_chg->>'id','')::uuid;
      v_new_recv := nullif(v_chg->>'received_now','')::int;
      if v_line_id is null or v_new_recv is null or v_new_recv < 0 then
        raise exception 'invalid correction line' using errcode = '22023', detail = 'invalid_line';
      end if;
      select t.val into v_stored
        from jsonb_array_elements(v_stored_lines) as t(val)
       where (t.val->>'id')::uuid = v_line_id limit 1;
      if v_stored is null then
        raise exception 'this receiving did not count that line'
          using errcode = '22023', detail = 'line_not_in_session';
      end if;
      v_old_recv := coalesce((v_stored->>'received_now')::int, 0);
      v_d := v_new_recv - v_old_recv;
      if v_d = 0 then continue; end if;
      v_qty_changed := true;

      select * into v_pol from purchase_order_lines
       where id = v_line_id and po_id = v_receipt.po_id for update;
      if not found then
        raise exception 'PO line not found for id=%', v_line_id
          using errcode = '42P01', detail = 'po_line_not_found';
      end if;

      if v_d > 0 then
        -- Under-count correction: the goods were in the SAME physical
        -- arrival, so they join this session (a NEW arrival is a NEW
        -- session/GRN, never an amendment).
        if v_pol.received_qty + v_d > v_pol.qty then
          raise exception 'line % would exceed its Order Qty', v_pol.sku
            using errcode = 'P0001', detail = 'over_received';
        end if;
        update purchase_order_lines set received_qty = received_qty + v_d
         where id = v_line_id;
        if v_posts_stock then
          -- 0366 · stock posts by flipping/minting Units only; the rollup
          -- triggers derive `stock_balances` from the unit register.
          with freed as (
            update ops_stock_items
               set status = 'free', warehouse_id = v_site, updated_at = now()
             where id in (
               select id from ops_stock_items
                where po_no = v_receipt.po_id and sku = v_pol.sku and status = 'incoming'
                order by created_at limit v_d)
            returning 1)
          select count(*) into v_moved from freed;
          if v_is_own and v_moved < v_d then
            insert into ops_stock_items
              (unit_code, sku, warehouse_id, status, supplier, po_no, source_ref, date_in)
            select public.gen_unit_code(), v_pol.sku, v_site, 'free',
                   v_supplier_name, v_receipt.po_id,
                   format('amend:%s', p_receipt_id), current_date
              from generate_series(1, v_d - v_moved);
          end if;
        end if;
      else
        -- Over-count correction: reverse the exact consequence, or refuse
        -- with the named blocker.
        if exists (
          select 1 from order_supplier_threads
           where po_id = v_receipt.po_id
             and operation_stage in ('ready_to_dispatch','dispatched','delivered')
        ) then
          raise exception 'goods from % already moved to dispatch — the count cannot be lowered', v_receipt.po_id
            using errcode = 'P0001', detail = 'threads_block_amend';
        end if;
        if v_pol.received_qty + v_d < 0 then
          raise exception 'line % cannot go below zero received', v_pol.sku
            using errcode = 'P0001', detail = 'lines_block_amend';
        end if;
        if v_posts_stock then
          -- Exact units first: this session's own received results, still free.
          with take as (
            select r.stock_item_id from receiving_unit_results r
              join ops_stock_items i on i.id = r.stock_item_id
             where r.receipt_id = p_receipt_id and r.outcome = 'received'
               and i.status = 'free'
             order by r.created_at desc limit (-v_d)
          ), back as (
            update ops_stock_items set status = 'incoming',
                   warehouse_id = v_po.warehouse_id, updated_at = now()
             where id in (select stock_item_id from take)
            returning id)
          select count(*) into v_moved from back;
          if v_moved < (-v_d) then
            with take as (
              select id from ops_stock_items
               where po_no = v_receipt.po_id and sku = v_pol.sku and status = 'free'
               order by created_at desc limit ((-v_d) - v_moved)
            ), back as (
              update ops_stock_items set status = 'incoming',
                     warehouse_id = v_po.warehouse_id, updated_at = now()
               where id in (select id from take)
              returning id)
            select v_moved + count(*) into v_moved from back;
          end if;
          if v_moved < (-v_d) then
            raise exception 'units on % are reserved or moved — the count cannot be lowered', v_pol.sku
              using errcode = 'P0001', detail = 'units_block_amend';
          end if;
          -- The rollup triggers lower the derived `stock_balances` as the
          -- Units return to incoming (0366).
          -- The unit results this correction reversed read Not received now.
          update receiving_unit_results r
             set outcome = 'not_received', issue_kind = null
            from ops_stock_items i
           where r.receipt_id = p_receipt_id and r.stock_item_id = i.id
             and r.outcome = 'received' and i.status = 'incoming';
        end if;
        update purchase_order_lines set received_qty = received_qty + v_d
         where id = v_line_id;
        -- Un-completing the PO restores the snapshot taken at posting.
        select count(*) into v_outstanding
          from purchase_order_lines where po_id = v_receipt.po_id and received_qty < qty;
        if v_po.status = 'received' and v_outstanding > 0 then
          if v_receipt.po_status_before is null then
            raise exception 'this receiving completed the PO before state snapshots existed'
              using errcode = 'P0001', detail = 'legacy_completion_block_amend';
          end if;
          update purchase_orders
             set status = v_receipt.po_status_before::po_status,
                 sup_status = v_receipt.sup_status_before::po_sup_status,
                 updated_at = now()
           where id = v_receipt.po_id;
        end if;
      end if;

      v_before := v_before || jsonb_build_object('line_' || v_line_id, v_old_recv);
      v_after  := v_after  || jsonb_build_object('line_' || v_line_id, v_new_recv);
      -- The session's own record states the corrected count.
      update warehouse_receipts
         set lines = (
           select jsonb_agg(case when (t.val->>'id')::uuid = v_line_id
                                 then jsonb_set(t.val, '{received_now}', to_jsonb(v_new_recv))
                                 else t.val end)
             from jsonb_array_elements(warehouse_receipts.lines) as t(val)),
             updated_at = now()
       where id = p_receipt_id;
    end loop;
  end if;

  if v_before = '{}'::jsonb then
    raise exception 'nothing changed — state the correction first'
      using errcode = '22023', detail = 'nothing_to_amend';
  end if;

  insert into receiving_events (receipt_id, event, actor_id, payload)
  values (p_receipt_id, 'amended', v_uid,
          jsonb_build_object('reason', btrim(p_reason),
                             'before', v_before, 'after', v_after,
                             'save_key', p_save_key,
                             'grn_no', v_receipt.grn_no,
                             'quantities_changed', v_qty_changed,
                             'normal_user_id', v_ctx->>'normal_user_id',
                             'acting_user_id', v_ctx->>'acting_user_id'));
  insert into po_history (po_id, text, by_role, by_user_id)
  values (v_receipt.po_id,
          format('Receiving %s amended — %s',
                 coalesce(v_receipt.grn_no, 'record'), btrim(p_reason)),
          public.app_role(), v_uid);
  insert into audit_log (role, actor_text, action, ref)
  values (public.app_role(),
          coalesce((select name from app_users where id = v_uid), 'Operations'),
          format('Amended %s — %s', coalesce(v_receipt.grn_no, p_receipt_id::text), btrim(p_reason)),
          v_receipt.po_id);

  return jsonb_build_object('receipt_id', p_receipt_id, 'status', 'posted',
                            'before', v_before, 'after', v_after);
end;
$fn$;

revoke all on function public.receiving_amend(uuid, text, jsonb, uuid) from public, anon;
grant execute on function public.receiving_amend(uuid, text, jsonb, uuid) to authenticated;

commit;
