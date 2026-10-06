-- 0443_a_unit_id_is_born_with_the_official_po.sql
--
-- ⭐ THE PO NUMBER AND EVERY REQUIRED CARRES UNIT ID ARE BORN IN ONE TRANSACTION
-- (PURCHASING × CATALOG × STOCK × RECEIVING · owner ruling 2026-09-07). Depends
-- on 0442 (the Catalog mode, the line snapshot column, the line binding).
--
-- ── WHAT WAS WRONG (measured on production 2026-09-07) ──────────────────────
--
--   1. `_operation_create_po_inner` (0382) minted `qty` Unit IDs for EVERY
--      line regardless of what the goods are, bound them to the PO by
--      `(po_no, sku)` only, and `purchasing_issue_pos_batch` (0401) then
--      stamped commercial treatment / demand onto lines by `(po_id, sku)` —
--      two lines of one SKU shared everything.
--   2. `trg_po_units_follow_destination` (0366) VOIDED every incoming Unit at
--      commit whenever the PO's Deliver To was not a Carres-owned warehouse,
--      and re-minted `id-…` codes through `gen_unit_code()` when it was. 39
--      official `U…` IDs printed on supplier PDFs were voided this way; 35 open
--      traceable lines had zero incoming Units left.
--   3. `purchasing_revise_po` (0364) changed `qty` and left the Unit ledger
--      untouched: a grown line had fewer IDs than pieces, a shrunk line kept
--      IDs for pieces no longer ordered.
--   4. `purchasing_po_document` (0428) printed Units by `(po_no, sku)`.
--
-- ── WHAT THIS FILE DOES ──────────────────────────────────────────────────────
--
--   · Rewrites the creation helper: classification is checked for every line
--     BEFORE a number is drawn; every line fact (mode snapshot, Deliver To,
--     commercial treatment, demand) is written on the line row by its own id;
--     an exact-unit line is born with exactly `qty` line-bound Unit IDs for
--     every destination, a quantity line with none; any failure raises and the
--     caller's transaction rolls back — no PO, no consumed number, no lines,
--     no demand movement, no orphan Units. The batch verifies the ledger
--     against the lines after the birth.
--   · Replaces the destination trigger: Units FOLLOW the PO. A warehouse
--     change moves the incoming Units' booked site; nothing is voided or
--     minted by where the goods are going.
--   · Revision: growth allocates only the additional Units; reduction retires
--     (voids) the surplus not-yet-received Units, newest first. Retired IDs
--     are never deleted or reused.
--   · The document reads each line's own Units and carries the line's mode,
--     so the paper and the object show the same IDs.
--   · THE PREFLIGHT REPAIR (governed by the correction, not by a count): every
--     OPEN exact-unit line whose incoming Units are fewer than its pending
--     quantity has the exact `po_mint` Units the defective trigger voided
--     restored to `incoming` — the same IDs the supplier's paper already
--     carries. If any open exact-unit line still cannot be made whole from its
--     own printed IDs, this migration STOPS rather than invent one.
-- ─────────────────────────────────────────────────────────────────────────────

set search_path = public;

-- ─── 1 · the creation helper ─────────────────────────────────────────────────

drop function if exists public._operation_create_po_inner(uuid, uuid, jsonb, date, integer[], text, uuid);

create function public._operation_create_po_inner(
  p_supplier_id uuid,
  p_warehouse_id uuid,
  p_lines jsonb,
  p_eta_date date,
  p_so_refs integer[],
  p_note text,
  p_procurement_partner_id uuid default null,
  p_destination_id uuid default null
)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor        text;
  v_po_id        text;
  v_line_count   int;
  v_line         jsonb;
  v_sku          text;
  v_qty          int;
  v_cost         numeric(14,2);
  v_cost_source  cost_source_enum;
  v_attrs        jsonb;
  v_supplier_name text;
  v_line_id      uuid;
  v_src          jsonb;
  v_src_total    int;
  v_mode         text;
  v_line_dest    uuid;
  v_minted       int;
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
  -- The PO writes its Deliver To in the SAME insert as its number now (0443),
  -- so a missing destination is refused by name here instead of surfacing as a
  -- raw NOT NULL violation from `purchase_orders.destination_id`.
  if p_destination_id is null or not exists (
    select 1 from purchasing_destinations d where d.id = p_destination_id and d.active
  ) then
    raise exception 'active purchasing destination required'
      using errcode = 'P0001', detail = 'unknown_destination';
  end if;

  v_actor := coalesce((select name from app_users where id = auth.uid()), 'Logistics');
  select name into v_supplier_name from suppliers where id = p_supplier_id;

  -- ⭐ 0443 · CLASSIFY BEFORE ANY WRITE. A SKU Catalog has not answered for
  -- refuses the WHOLE issue here — no PO number is drawn, no line, no demand
  -- movement, no Unit. The error names the SKU and the concrete Catalog act.
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_sku := v_line->>'sku';
    select s.stock_identity_mode into v_mode
      from product_skus s where s.sku = v_sku;
    if not found then
      raise exception 'SKU % is not in the Catalog', v_sku
        using errcode = 'P0001', detail = 'sku_not_in_catalog';
    end if;
    if v_mode is null then
      raise exception 'Set the stock identity (Unit ID or Quantity) for % in Catalog before issuing a PO', v_sku
        using errcode = 'P0001', detail = 'catalog_identity_mode_missing';
    end if;
  end loop;

  -- ⭐ 0381/0382 · THE LOCKED DOCUMENT NUMBER (MASTER §6.1). This replaced
  -- `max(seq) + 1`, which leaked how much Carres buys to anyone holding two of
  -- our purchase orders.
  v_po_id := public.allocate_formal_document_code('PO');

  insert into purchase_orders
    (id, so_refs, supplier_id, warehouse_id, eta_date, status, sup_status, placed_at,
     procurement_partner_id, destination_id)
  values
    (v_po_id, p_so_refs, p_supplier_id, p_warehouse_id, p_eta_date,
     'open', 'pending', now(),
     p_procurement_partner_id, p_destination_id);

  update public.formal_document_codes
     set document_id = v_po_id
   where code_date = (timezone('Asia/Kuala_Lumpur', now()))::date
     and code = split_part(v_po_id, '-', 3);

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
    select s.stock_identity_mode into v_mode from product_skus s where s.sku = v_sku;
    v_line_dest := nullif(v_line->>'destination_id', '')::uuid;
    if v_line_dest is not null and not exists (
      select 1 from purchasing_destinations d where d.id = v_line_dest and d.active
    ) then
      raise exception 'line destination is not an active purchasing destination (sku=%)', v_sku
        using errcode = 'P0001', detail = 'unknown_destination';
    end if;

    -- ⭐ 0443 · EVERY LINE FACT IS WRITTEN ON THE LINE ROW IT BELONGS TO — by
    -- the line's own id, never by `(po_id, sku)`. Two lines of one SKU are
    -- two lines.
    insert into purchase_order_lines
      (po_id, sku, qty, received_qty, cost, cost_source, attrs,
       identity_mode, destination_id,
       commercial_treatment, commercial_reason, demand_id)
    values
      (v_po_id, v_sku, v_qty, 0, v_cost, v_cost_source, v_attrs,
       v_mode, v_line_dest,
       nullif(v_line->>'commercial_treatment', ''),
       nullif(btrim(coalesce(v_line->>'commercial_reason', '')), ''),
       nullif(v_line->>'demand_id', '')::uuid)
    returning id into v_line_id;

    -- ⭐ 0382 · THE LINEAGE. The caller passes the SERVER's own recomputed
    -- allocation; it is validated here rather than trusted, because a browser
    -- that could name a source could put one customer's goods on another
    -- customer's order.
    if jsonb_typeof(v_line->'sources') = 'array' then
      v_src_total := 0;
      for v_src in select * from jsonb_array_elements(v_line->'sources')
      loop
        if not exists (select 1 from orders where id = (v_src->>'order_id')::uuid) then
          raise exception 'source order not found (sku=%)', v_sku
            using errcode = 'P0001', detail = 'unknown_source_order';
        end if;
        if nullif(v_src->>'order_line_id', '') is not null
           and not exists (
             select 1 from order_lines
              where id = (v_src->>'order_line_id')::uuid
                and order_id = (v_src->>'order_id')::uuid
           ) then
          raise exception 'source line does not belong to its order (sku=%)', v_sku
            using errcode = 'P0001', detail = 'source_line_mismatch';
        end if;
        insert into po_line_sources (po_id, po_line_id, sku, order_id, so, order_line_id, qty)
        values (
          v_po_id, v_line_id, v_sku,
          (v_src->>'order_id')::uuid,
          nullif(v_src->>'so', '')::int,
          nullif(v_src->>'order_line_id', '')::uuid,
          (v_src->>'qty')::int
        );
        v_src_total := v_src_total + (v_src->>'qty')::int;
      end loop;
      -- The parts must add up to the line. A lineage that does not is worse
      -- than none: it would look authoritative while hiding units.
      if v_src_total <> v_qty then
        raise exception 'source allocation does not add up (sku=%, sources=%, line=%)',
            v_sku, v_src_total, v_qty
          using errcode = 'P0001', detail = 'source_allocation_mismatch';
      end if;
    end if;

    -- ⭐ 0443 · THE BIRTH. An exact-unit line is born with exactly one
    -- permanent Carres Unit ID per ordered piece, bound to THIS line, for
    -- EVERY governed destination (§6.2: the supplier writes it on the package
    -- wherever the goods go). A quantity line is born with none — it is
    -- reconciled by count, and a fake Unit ID would be a lie on the paper.
    if v_mode = 'exact_unit' then
      insert into ops_stock_items
        (unit_code, sku, warehouse_id, status, supplier, po_no, po_line_id,
         identity_scope, source_ref, date_in)
      select public.allocate_unit_id(), v_sku, p_warehouse_id, 'incoming',
             v_supplier_name, v_po_id, v_line_id, 'unit', 'po_mint', current_date
        from generate_series(1, v_qty);
      get diagnostics v_minted = row_count;
      if v_minted <> v_qty then
        raise exception 'Unit ID allocation failed for % (wanted %, got %)', v_sku, v_qty, v_minted
          using errcode = 'P0001', detail = 'unit_allocation_failed';
      end if;
    elsif v_mode <> 'quantity' then
      raise exception 'unknown stock identity mode % on %', v_mode, v_sku
        using errcode = 'P0001', detail = 'catalog_identity_mode_missing';
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

revoke all on function public._operation_create_po_inner(uuid, uuid, jsonb, date, integer[], text, uuid, uuid)
  from public, anon, authenticated, service_role;

comment on function public._operation_create_po_inner(uuid, uuid, jsonb, date, integer[], text, uuid, uuid) is
  '0443: mints a PO under the locked identities (MASTER §6.1/§6.2). Refuses any SKU without a Catalog stock identity mode BEFORE drawing a number; snapshots the mode onto every line; an exact-unit line is born with one permanent line-bound Unit ID per piece for every destination, a quantity line with none. Reached only through purchasing_issue_pos_batch.';

-- ─── 2 · the ONE issue authority ────────────────────────────────────────────

create or replace function public.purchasing_issue_pos_batch(p_pos jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_count          int;
  v_idx            int := 0;
  v_po             jsonb;
  v_line           jsonb;
  v_po_id          text;
  v_po_ids         jsonb := '[]'::jsonb;
  v_so_refs        int[];
  v_eta             date;
  v_supplier_id     uuid;
  v_supplier_kind   supplier_kind;
  v_partner_id      uuid;
  v_destination_id  uuid;
  v_purpose         text;
  v_demand          purchase_demands%rowtype;
  v_demand_id       uuid;
  v_treatment       text;
  v_reason          text;
  v_cost            numeric(14,2);
  v_cost_source     text;
  v_catalog_supplier uuid;
  v_catalog_cost    numeric(14,2);
  v_err_state       text;
  v_err_msg         text;
  v_err_detail      text;
  v_approval        uuid;
  v_used_approvals  jsonb := '[]'::jsonb;
begin
  if not public.is_operation() then
    raise exception 'forbidden: operation only' using errcode = '42501';
  end if;

  -- ⭐ 0379 · THE ACTOR GATE. This function previously trusted any Operations
  -- login, so a direct RPC call bypassed the duty check that lived in one API
  -- route — and Manual Purchase called it with no duty check at all. Now every
  -- caller meets the same authority.
  if not public.purchasing_actor_may_issue(auth.uid()) then
    raise exception 'only Current PO Duty or its authorised cover may issue purchase orders'
      using errcode = '42501', detail = 'not_po_duty';
  end if;

  if p_pos is null or jsonb_typeof(p_pos) <> 'array' then
    raise exception 'p_pos must be a JSON array'
      using errcode = '22023', detail = 'invalid_batch_size';
  end if;
  v_count := jsonb_array_length(p_pos);
  if v_count < 1 or v_count > 20 then
    raise exception 'batch size must be between 1 and 20 (got %)', v_count
      using errcode = '22023', detail = 'invalid_batch_size';
  end if;

  perform pg_advisory_xact_lock(hashtext('purchasing_issue_pos_batch'));

  for v_po in select * from jsonb_array_elements(p_pos)
  loop
    v_supplier_id := nullif(v_po->>'supplier_id', '')::uuid;
    select kind into v_supplier_kind from suppliers where id = v_supplier_id;
    if v_supplier_kind is null then
      raise exception 'supplier not found'
        using errcode = 'P0001', detail = 'unresolved_supplier';
    end if;

    v_partner_id := nullif(v_po->>'procurement_partner_id', '')::uuid;
    if v_supplier_kind = 'factory_pickup' then
      if v_partner_id is null
         or not exists (select 1 from delivery_partners where id = v_partner_id) then
        raise exception 'valid procurement partner required for factory pickup'
          using errcode = 'P0001', detail = 'pickup_partner_required';
      end if;
    elsif v_partner_id is not null then
      raise exception 'procurement partner is not allowed for own logistics'
        using errcode = 'P0001', detail = 'pickup_partner_not_allowed';
    end if;

    v_destination_id := nullif(v_po->>'destination_id', '')::uuid;
    if v_destination_id is null or not exists (
      select 1 from purchasing_destinations
       where id = v_destination_id and active
    ) then
      raise exception 'active purchasing destination required'
        using errcode = 'P0001', detail = 'unknown_destination';
    end if;

    v_purpose := nullif(v_po->>'purpose', '');
    if v_purpose is not null and v_purpose not in
       ('customer_sales', 'ready_stock', 'display', 'office', 'warranty', 'spare_parts',
        'showroom_display', 'service_case', 'internal_staff_purchase',
        'subsidiary_purchase', 'other_purchase') then
      raise exception 'purpose % is not a purpose', v_purpose
        using errcode = 'P0001', detail = 'unknown_purpose';
    end if;

    if jsonb_typeof(v_po->'lines') <> 'array'
       or jsonb_array_length(v_po->'lines') = 0 then
      raise exception 'lines must be a non-empty array'
        using errcode = 'P0001', detail = 'lines_empty';
    end if;
    for v_line in select * from jsonb_array_elements(v_po->'lines')
    loop
      v_treatment := v_line->>'commercial_treatment';
      v_reason := nullif(btrim(coalesce(v_line->>'commercial_reason', '')), '');
      v_cost := (v_line->>'cost')::numeric(14,2);
      if v_treatment = 'normal' then
        if v_cost is null or v_cost <= 0 or v_reason is not null then
          raise exception 'known positive transaction cost required (sku=%)', v_line->>'sku'
            using errcode = 'P0001', detail = 'cost_required';
        end if;
      elsif v_treatment = 'free_of_charge' then
        if v_cost is distinct from 0::numeric or v_reason is null
           or length(v_reason) > 500
           or v_line->>'cost_source' is distinct from 'hand_entered' then
          raise exception 'Free of Charge requires cost 0 and a reason (sku=%)', v_line->>'sku'
            using errcode = 'P0001', detail = 'free_of_charge_reason_required';
        end if;
      else
        raise exception 'commercial treatment required (sku=%)', v_line->>'sku'
          using errcode = 'P0001', detail = 'commercial_treatment_required';
      end if;

      v_demand_id := nullif(v_line->>'demand_id', '')::uuid;
      if v_demand_id is not null then
        select * into v_demand from purchase_demands where id = v_demand_id;
        if not found then
          raise exception 'demand not found (sku=%)', v_line->>'sku'
            using errcode = 'P0001', detail = 'unknown_demand';
        end if;
        if v_demand.sku is distinct from v_line->>'sku' then
          raise exception 'demand names a different sku (line=%, demand=%)',
              v_line->>'sku', v_demand.sku
            using errcode = 'P0001', detail = 'demand_sku_mismatch';
        end if;
      end if;
    end loop;

    if nullif(v_po->>'eta_date', '') is not null then
      v_eta := (v_po->>'eta_date')::date;
    else
      v_eta := null;
    end if;
    if v_po ? 'so_refs' and jsonb_typeof(v_po->'so_refs') = 'array' then
      select coalesce(array_agg(elem::int), array[]::int[])
        into v_so_refs
        from jsonb_array_elements_text(v_po->'so_refs') elem;
      if array_length(v_so_refs, 1) is null then v_so_refs := null; end if;
    else
      v_so_refs := null;
    end if;

    if v_purpose is null and v_so_refs is not null then
      v_purpose := 'customer_sales';
    end if;

    if v_so_refs is not null and exists (
      select 1
        from unnest(v_so_refs) ref(so)
        left join orders o on o.so = ref.so
       where o.id is null
          or o.delivery_date is null
          or coalesce(o.delivery_date_tbd, false)
    ) then
      raise exception 'Customer delivery date must be confirmed before Issue PO'
        using errcode = 'P0001', detail = 'blocked_delivery_date';
    end if;

    for v_line in select * from jsonb_array_elements(v_po->'lines')
    loop
      select supplier_id, cost
        into v_catalog_supplier, v_catalog_cost
        from product_skus
       where sku = v_line->>'sku';
      if not found or v_catalog_supplier is null
         or v_catalog_supplier is distinct from v_supplier_id then
        raise exception 'SKU supplier truth does not match Issue supplier (sku=%)', v_line->>'sku'
          using errcode = 'P0001', detail = 'unresolved_supplier';
      end if;

      v_cost_source := v_line->>'cost_source';
      if v_cost_source not in ('catalog', 'hand_entered') then
        raise exception 'governed transaction cost source required (sku=%)', v_line->>'sku'
          using errcode = 'P0001', detail = 'cost_source_required';
      end if;

      -- ⭐ 0380 · THE COMMERCIAL GATE.
      --
      -- This replaces a check that compared the live catalog cost against a
      -- number the API had just read from the same column — it agreed with
      -- itself and could never fire. The line now declares the cost the
      -- OPERATOR REVIEWED, and anything that is not the approved catalog price
      -- needs somebody else's approval.
      v_approval := public.purchasing_check_line_commercials(
        v_line->>'sku',
        v_supplier_id,
        v_line->>'commercial_treatment',
        (v_line->>'cost')::numeric(14,2),
        v_cost_source,
        nullif(v_line->>'expected_catalog_cost', '')::numeric(14,2)
      );
      if v_approval is not null then
        v_used_approvals := v_used_approvals || to_jsonb(v_approval);
      end if;
    end loop;

    begin
      -- ⭐ 0443 · ONE ATOMIC BIRTH. The helper draws the number, writes every
      -- line with its commercial facts, its Deliver To and its SNAPSHOTTED
      -- Catalog identity mode, and mints every exact-unit line's permanent
      -- line-bound Unit IDs — or raises, in which case this whole batch
      -- transaction (number, lines, demand movement, Units) rolls back.
      -- Nothing here is keyed by `(po_id, sku)` any more: two lines of one
      -- SKU are two lines.
      v_po_id := public._operation_create_po_inner(
        p_supplier_id := v_supplier_id,
        p_warehouse_id := nullif(v_po->>'warehouse_id', '')::uuid,
        p_lines := v_po->'lines',
        p_eta_date := v_eta,
        p_so_refs := v_so_refs,
        p_note := v_po->>'note',
        p_procurement_partner_id := v_partner_id,
        p_destination_id := v_destination_id
      );

      update purchase_orders
         set eta_date = v_eta,
             purpose = v_purpose
       where id = v_po_id;
      if not found then
        raise exception 'created purchase order not found'
          using errcode = 'P0001', detail = 'po_not_created';
      end if;

      -- The ledger must agree with the lines it was born with: every
      -- exact-unit line owns exactly `qty` incoming Units bound to it, every
      -- quantity line owns none. A mismatch is an integrity failure and
      -- rolls the issue back.
      if exists (
        select 1 from purchase_order_lines l
         where l.po_id = v_po_id
           and (select count(*) from ops_stock_items u
                 where u.po_line_id = l.id and u.status = 'incoming')
               <> case when l.identity_mode = 'exact_unit' then l.qty else 0 end
      ) then
        raise exception 'Unit ID ledger does not match the issued lines on %', v_po_id
          using errcode = 'P0001', detail = 'unit_ledger_mismatch';
      end if;

      for v_line in select * from jsonb_array_elements(v_po->'lines')
      loop
        v_demand_id := nullif(v_line->>'demand_id', '')::uuid;
        if v_line->>'commercial_treatment' = 'free_of_charge' then
          insert into po_history (po_id, text, by_role, by_user_id)
          values (
            v_po_id,
            format('Free of Charge · %s · %s', v_line->>'sku', v_line->>'commercial_reason'),
            public.app_role(),
            auth.uid()
          );
        elsif v_line->>'cost_source' = 'hand_entered' then
          insert into po_history (po_id, text, by_role, by_user_id)
          values (
            v_po_id,
            format('Transaction cost entered · %s · RM%s', v_line->>'sku', v_line->>'cost'),
            public.app_role(),
            auth.uid()
          );
        end if;

        if v_demand_id is not null then
          perform public.purchasing_demand_record_issue(
            v_demand_id, (v_line->>'qty')::int, v_po_id);
        end if;
      end loop;

      -- AN APPROVAL IS SPENT WHEN IT IS USED. Leaving it open would let one
      -- manager decision price every future order of that SKU.
      update po_cost_approvals
         set used_by_po = v_po_id
       where id in (
         select (elem #>> '{}')::uuid from jsonb_array_elements(v_used_approvals) elem
       )
         and used_by_po is null;
      v_used_approvals := '[]'::jsonb;

      perform public._v3_claim_threads_for_po(v_po_id);
    exception when others then
      get stacked diagnostics
        v_err_state = returned_sqlstate,
        v_err_msg = message_text,
        v_err_detail = pg_exception_detail;
      raise exception using
        errcode = v_err_state,
        message = v_err_msg,
        detail = coalesce(nullif(v_err_detail, ''), 'helper_failed'),
        hint = format('pos_index=%s', v_idx);
    end;

    v_po_ids := v_po_ids || to_jsonb(v_po_id);
    v_idx := v_idx + 1;
  end loop;
  return jsonb_build_object('po_ids', v_po_ids);
end;
$function$;

comment on function public.purchasing_issue_pos_batch(jsonb) is
  '0379/0380 (+0399/0401 vocabulary, 0443 Unit birth): the ONE Purchase Order creation authority. Reached through the governed journeys (SO Batch Purchase, Manual Purchase); it asks `purchasing_actor_may_issue` and `purchasing_check_line_commercials` itself, so a direct RPC call can bypass neither duty/cover nor commercial approval. Since 0443 the PO number, its lines (with the snapshotted Catalog identity mode) and every exact-unit line''s permanent line-bound Unit IDs are born in ONE transaction, or none of them are.';

-- ─── 3 · Units follow the PO — the destination never voids or mints ──────────
--
-- 0366's trigger judged Units by where the goods were going. §6.2 says the
-- supplier writes the Carres Unit ID on the package for EVERY governed
-- destination, so the identity exists wherever the goods land. The only thing
-- a warehouse change may touch is the incoming Units' booked site.
create or replace function public.trg_po_units_follow_destination()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.warehouse_id is distinct from old.warehouse_id then
    update public.ops_stock_items
       set warehouse_id = new.warehouse_id, updated_at = now()
     where po_no = new.id and status = 'incoming';
  end if;
  return null;
end;
$$;

comment on function public.trg_po_units_follow_destination() is
  '0443: incoming Units follow the PO''s booked warehouse. Replaces 0366''s version, which voided every incoming Unit for a non-warehouse Deliver To and re-minted id- codes — the identity is born once at issue for every destination and is never voided or minted by destination.';

drop trigger if exists trg_po_units_follow_destination on public.purchase_orders;
create constraint trigger trg_po_units_follow_destination
  after insert or update of destination_id, warehouse_id on public.purchase_orders
  deferrable initially deferred
  for each row execute function public.trg_po_units_follow_destination();

-- ─── 4 · the revision keeps the ledger honest ────────────────────────────────
create or replace function public.purchasing_revise_po(
  p_po_id  text,
  p_reason text,
  p_lines  jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_role      app_role;
  v_uid       uuid;
  v_actor     text;
  v_reason    text;
  v_po        purchase_orders;
  v_el        jsonb;
  v_line_id   uuid;
  v_qty       integer;
  v_dest      uuid;
  v_has_dest  boolean;
  v_line      purchase_order_lines;
  v_changes   text[] := '{}';
  v_updates   jsonb  := '[]'::jsonb;
  v_snap      jsonb;
  v_last_rev  integer;
  v_rev       po_revisions;
  v_version   integer;
  v_dest_name text;
  v_delta     integer;
  v_supplier_name text;
  v_retired   integer;
begin
  v_role := public.purchasing_supplier_call_gate();
  v_uid  := auth.uid();

  -- Reason is required IN SQL — a version without a why is a version nobody
  -- can answer for (the ruling stores the reason and the author).
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'A revision must say why'
      using errcode = '22023', detail = 'reason_required';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) = 0 then
    raise exception 'lines must be a non-empty array'
      using errcode = '22023', detail = 'invalid_input';
  end if;

  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO % not found', p_po_id
      using errcode = '42P01', detail = 'po_not_found';
  end if;
  if v_po.status <> 'open' then
    raise exception 'PO % is %, not open', p_po_id, v_po.status
      using errcode = '22023', detail = 'po_not_open';
  end if;

  -- ── PASS 1 · validate everything and collect the intended updates.
  --    THE FLOOR SPEAKS BEFORE ANY WRITE (2990s' discipline): a violation on
  --    line 3 must leave lines 1 and 2 untouched.
  for v_el in select * from jsonb_array_elements(p_lines) loop
    begin
      v_line_id := (v_el ->> 'line_id')::uuid;
    exception when others then
      raise exception 'line_id must be a uuid'
        using errcode = '22023', detail = 'invalid_input';
    end;

    if v_el -> 'qty' is null or jsonb_typeof(v_el -> 'qty') <> 'number' then
      raise exception 'qty is required per line'
        using errcode = '22023', detail = 'invalid_input';
    end if;
    v_qty := (v_el ->> 'qty')::integer;

    v_has_dest := v_el ? 'destination_id';
    v_dest := null;
    if v_has_dest and jsonb_typeof(v_el -> 'destination_id') <> 'null' then
      begin
        v_dest := (v_el ->> 'destination_id')::uuid;
      exception when others then
        raise exception 'destination_id must be a uuid or null'
          using errcode = '22023', detail = 'invalid_input';
      end;
      if not exists (select 1 from purchasing_destinations d where d.id = v_dest) then
        raise exception 'destination % is not in the registry', v_dest
          using errcode = '22023', detail = 'invalid_input';
      end if;
    end if;

    select * into v_line from purchase_order_lines
     where id = v_line_id and po_id = p_po_id
     for update;
    if not found then
      -- Existing lines ONLY: adding items is a NEW PO (the ruling), so an
      -- unknown line id is refused, never inserted.
      raise exception 'PO line % is not on %', v_line_id, p_po_id
        using errcode = '22023', detail = 'po_line_not_found';
    end if;

    if v_qty is null or v_qty < 1 then
      -- Stopping is still the whole PO (Cancel) — a zero is a line silently
      -- stopped, and the ruling closed that door.
      raise exception 'qty must be at least 1'
        using errcode = '22023', detail = 'invalid_input';
    end if;

    -- THE FLOOR. Goods already received cannot be un-ordered by editing a
    -- document; the excess goes back through a Purchase Return first.
    if v_qty < v_line.received_qty then
      raise exception '% cannot go below the % already received (asked for %)',
          v_line.sku, v_line.received_qty, v_qty
        using errcode = 'P0001', detail = 'received_floor';
    end if;

    if v_qty is distinct from v_line.qty then
      v_changes := v_changes
        || format('%s qty %s → %s', v_line.sku, v_line.qty, v_qty);
    end if;
    if v_has_dest and (v_dest is distinct from v_line.destination_id) then
      v_dest_name := coalesce(
        (select d.name from purchasing_destinations d where d.id = v_dest),
        'PO default');
      v_changes := v_changes
        || format('%s → %s', v_line.sku, v_dest_name);
    end if;

    v_updates := v_updates || jsonb_build_array(jsonb_build_object(
      'line_id', v_line_id,
      'qty', v_qty,
      'has_dest', v_has_dest,
      'destination_id', v_dest
    ));
  end loop;

  if coalesce(array_length(v_changes, 1), 0) = 0 then
    -- An identical document is not a new version: minting one would hand the
    -- factory a Version 2 that asks them to change nothing.
    raise exception 'Nothing changed'
      using errcode = '22023', detail = 'nothing_changed';
  end if;

  -- ── PASS 2 · snapshot the PRIOR version, before any write.
  --    0312's EXACT shape — eta_date · destination_id · every line — so
  --    purchasing_record_send's "changed since the last snapshot" comparison
  --    keeps working with no second spelling of the document (Law D).
  select jsonb_build_object(
           'eta_date',       v_po.eta_date,
           'destination_id', v_po.destination_id,
           'lines', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'sku', l.sku, 'qty', l.qty, 'destination_id', l.destination_id
                    ) order by l.sku, l.id)
               from purchase_order_lines l where l.po_id = p_po_id), '[]'::jsonb)
         ) into v_snap;

  select coalesce(max(rev_no), 0) into v_last_rev
    from po_revisions where po_id = p_po_id;

  insert into po_revisions (po_id, rev_no, snapshot, reason, created_by)
  values (p_po_id, v_last_rev + 1, v_snap, v_reason, v_uid)
  returning * into v_rev;

  -- ── PASS 3 · apply. The transaction-local flag lets these writes through
  --    the shared-PO guard below; nothing else ever sets it.
  perform set_config('carres.po_revise', 'true', true);

  select name into v_supplier_name from suppliers where id = v_po.supplier_id;

  for v_el in select * from jsonb_array_elements(v_updates) loop
    select * into v_line from purchase_order_lines
     where id = (v_el ->> 'line_id')::uuid;
    v_delta := (v_el ->> 'qty')::integer - v_line.qty;

    if (v_el ->> 'has_dest')::boolean then
      update purchase_order_lines
         set qty = (v_el ->> 'qty')::integer,
             destination_id = (v_el ->> 'destination_id')::uuid
       where id = (v_el ->> 'line_id')::uuid;
    else
      update purchase_order_lines
         set qty = (v_el ->> 'qty')::integer
       where id = (v_el ->> 'line_id')::uuid;
    end if;

    -- ⭐ 0443 · THE UNIT CONSEQUENCE OF A REVISION. An exact-unit line that
    -- grows is born its ADDITIONAL Unit IDs only — the pieces the supplier
    -- already has IDs for keep them. A line that shrinks retires the surplus
    -- not-yet-received Units (newest first): retired, never deleted, never
    -- reused, so every version of the paper still names a real permanent
    -- identity. A quantity line has no Units to move.
    if v_line.identity_mode = 'exact_unit' then
      if v_delta > 0 then
        insert into ops_stock_items
          (unit_code, sku, warehouse_id, status, supplier, po_no, po_line_id,
           identity_scope, source_ref, date_in)
        select public.allocate_unit_id(), v_line.sku, v_po.warehouse_id, 'incoming',
               v_supplier_name, p_po_id, v_line.id, 'unit', 'po_revision', current_date
          from generate_series(1, v_delta);
      elsif v_delta < 0 then
        with retired as (
          update ops_stock_items
             set status = 'voided', updated_at = now()
           where id in (
             select id from ops_stock_items
              where po_line_id = v_line.id and status = 'incoming'
              order by created_at desc, unit_code desc
              limit (-v_delta)
           )
          returning 1
        )
        select count(*) into v_retired from retired;
        if v_retired <> -v_delta then
          raise exception '% has fewer open Units than the revision retires', v_line.sku
            using errcode = 'P0001', detail = 'unit_ledger_mismatch';
        end if;
      end if;
    end if;
  end loop;

  v_version := coalesce(v_po.version, 1) + 1;
  update purchase_orders
     set version = v_version,
         revised_at = now(),
         updated_at = now()
   where id = p_po_id;

  v_actor := coalesce((select name from app_users where id = v_uid), initcap(v_role::text));

  -- Old → new, in the record (0325's discipline). The ruling's word is
  -- `Revised`; `Version` here is the DOCUMENT changing, which is exactly what
  -- 0317 reserved the word for.
  insert into po_history (po_id, text, by_role, by_user_id)
  values (p_po_id,
          format('Revised to Version %s — %s — %s',
                 v_version, array_to_string(v_changes, ' · '), v_reason),
          v_role, v_uid);
  insert into audit_log (role, actor_text, action, ref)
  values (v_role, v_actor,
          format('PO %s — revised to Version %s', p_po_id, v_version),
          p_po_id);

  return jsonb_build_object(
    'po_id', p_po_id,
    'version', v_version,
    'rev_no', v_rev.rev_no,
    'changes', to_jsonb(v_changes)
  );
end;
$function$;

revoke all on function public.purchasing_revise_po(text, text, jsonb) from public, anon;
grant execute on function public.purchasing_revise_po(text, text, jsonb) to authenticated, service_role;


-- ─── 5 · the document prints the line's own Units ────────────────────────────
create or replace function public.purchasing_po_document(p_po_id text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_role     app_role;
  v_po       purchase_orders;
  v_dest     purchasing_destinations;
  v_sup      suppliers;
  v_address  text;
  v_sup_addr text;
  v_lines    jsonb;
  v_issuer   text;
  v_missing_destination_name text;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'forbidden: only operation or principal can export a PO document'
      using errcode = '42501', detail = 'forbidden';
  end if;

  select * into v_po from purchase_orders where id = p_po_id;
  if not found then
    raise exception 'PO % not found', p_po_id
      using errcode = '42P01', detail = 'po_not_found';
  end if;

  if v_po.status = 'cancelled' then
    raise exception 'PO % is cancelled and cannot be exported', p_po_id
      using errcode = 'P0001', detail = 'po_not_printable';
  end if;

  select * into v_dest from purchasing_destinations where id = v_po.destination_id;
  select * into v_sup from suppliers where id = v_po.supplier_id;

  if v_dest.warehouse_id is not null then
    select address into v_address from warehouses where id = v_dest.warehouse_id;
  else
    v_address := v_dest.address;
  end if;

  if v_address is null or length(btrim(v_address)) = 0 then
    raise exception 'no address on file for %', v_dest.name
      using errcode = 'P0001', detail = 'destination_address_missing';
  end if;

  -- One PO may carry several destinations. Every line must still resolve to a
  -- real printable address before the formal document can leave Carres.
  select coalesce(d.name, 'the recorded Deliver To')
    into v_missing_destination_name
    from purchase_order_lines l
    left join purchasing_destinations d
      on d.id = coalesce(l.destination_id, v_po.destination_id)
    left join warehouses w on w.id = d.warehouse_id
   where l.po_id = p_po_id
     and nullif(btrim(case when d.warehouse_id is not null then w.address else d.address end), '') is null
   limit 1;

  if found then
    raise exception 'no address on file for %', v_missing_destination_name
      using errcode = 'P0001', detail = 'destination_address_missing';
  end if;

  v_sup_addr := nullif(btrim(coalesce(v_sup.address, '')), '');

  -- audit_log's one timestamp is `occurred_at` (0001). This was incorrectly
  -- spelled `created_at` in 0383, making every document call fail before any
  -- payload could be returned.
  select actor_text into v_issuer
    from audit_log
   where ref = p_po_id and action like 'Created PO %'
   order by occurred_at asc
   limit 1;

  select coalesce(jsonb_agg(x order by x->>'sku'), '[]'::jsonb) into v_lines
    from (
      select jsonb_build_object(
               'sku',         l.sku,
               'description', coalesce(ps.variant, l.sku),
               'qty',         l.qty,
               'unit',        'pc',
               'destination', (
                 select jsonb_build_object(
                          'name', d.name,
                          'address', case when d.warehouse_id is not null then w.address else d.address end
                        )
                   from purchasing_destinations d
                   left join warehouses w on w.id = d.warehouse_id
                  where d.id = coalesce(l.destination_id, v_po.destination_id)
               ),
               'attrs',       (
                 select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
                   from jsonb_each(coalesce(l.attrs, '{}'::jsonb)) as e(k, v)
                  where k in ('color', 'gap', 'fabric_name')
               ),
               -- 0443 · the Units THIS LINE was born with, by immutable line
               -- binding — never `(po_no, sku)`. Retired (voided) Units of a
               -- reduced revision stay off the current paper; a quantity
               -- line prints none because it has none.
               'identity_mode', l.identity_mode,
               'unit_codes', (
                 select coalesce(jsonb_agg(si.unit_code order by si.unit_code), '[]'::jsonb)
                   from ops_stock_items si
                  where si.po_line_id = l.id
                    and si.identity_scope = 'unit'
                    and si.status <> 'voided'
               ),
               'sources', (
                 select coalesce(
                          jsonb_agg(jsonb_build_object('so', s.so, 'qty', s.qty)
                                    order by s.so nulls last),
                          '[]'::jsonb)
                   from po_line_sources s
                  where s.po_line_id = l.id
               )
             ) as x
        from purchase_order_lines l
        left join product_skus ps on ps.sku = l.sku
       where l.po_id = p_po_id
    ) s;

  return jsonb_build_object(
    'po_number',   v_po.id,
    'po_id',       v_po.id,
    'version',     coalesce(v_po.version, 1),
    'issue_date',  to_char(coalesce(v_po.placed_at, now()), 'YYYY-MM-DD'),
    'supplier', jsonb_build_object(
      'name',    coalesce(v_sup.name, 'Supplier'),
      'address', v_sup_addr,
      'contact', v_sup.contact
    ),
    'destination', jsonb_build_object(
      'name',    v_dest.name,
      'address', v_address
    ),
    'delivery_instructions', nullif(btrim(coalesce(v_po.delivery_instructions, '')), ''),
    'eta_date',    v_po.official_delivery_date,
    'so_refs',     to_jsonb(coalesce(v_po.so_refs, array[]::int[])),
    'issued_by',   v_issuer,
    'lines',       v_lines,
    'terms',       null
  );
end;
$function$;

-- ─── 6 · THE PREFLIGHT REPAIR — restore the printed IDs the trigger voided ───
--
-- Predicate-scoped: open PO · exact-unit line · incoming < pending. Restores,
-- oldest first, the `po_mint` Units of that line the 0366 trigger voided —
-- the exact IDs already on the supplier's paper — until the line is whole.
-- Nothing is minted; nothing is renumbered. Every restored Unit gets its
-- lineage event through the existing 0366 trigger.
do $$
declare
  v_line record;
  v_need int;
  v_done int;
  v_left int := 0;
begin
  for v_line in
    select l.id, l.po_id, l.sku, (l.qty - l.received_qty) as pending,
           (select count(*) from public.ops_stock_items u
             where u.po_line_id = l.id and u.status = 'incoming') as incoming
      from public.purchase_order_lines l
      join public.purchase_orders po on po.id = l.po_id
     where po.status = 'open'
       and l.identity_mode = 'exact_unit'
  loop
    v_need := v_line.pending - v_line.incoming;
    if v_need <= 0 then continue; end if;

    with restored as (
      update public.ops_stock_items
         set status = 'incoming', updated_at = now()
       where id in (
         select id from public.ops_stock_items
          where po_line_id = v_line.id
            and status = 'voided'
            and source_ref = 'po_mint'
            and identity_scope = 'unit'
          order by created_at asc, unit_code asc
          limit v_need
       )
      returning 1
    )
    select count(*) into v_done from restored;

    if v_done < v_need then
      v_left := v_left + 1;
      raise notice '0443 preflight: % / % still short by % Unit(s) after restoring % voided printed ID(s)',
        v_line.po_id, v_line.sku, v_need - v_done, v_done;
    end if;
  end loop;

  if v_left > 0 then
    raise exception '0443 preflight: % open exact-unit line(s) cannot be made whole from their own printed Unit IDs — resolve before applying', v_left
      using errcode = 'P0001', detail = 'preflight_open_traceable_lines_short';
  end if;
end $$;

-- ─── 7 · sanity — the shape, never a count ───────────────────────────────────
do $$
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = '_operation_create_po_inner') <> 1 then
    raise exception '0443: _operation_create_po_inner must have exactly ONE signature';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'purchasing_revise_po') <> 1 then
    raise exception '0443: purchasing_revise_po must have exactly ONE signature';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'trg_po_units_follow_destination'
       and p.prosrc like '%gen_unit_code%'
  ) then
    raise exception '0443: the destination trigger still mints';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- VERIFY (read-only; a migration never asserts a production row count)
-- ---------------------------------------------------------------------
--   -- No open exact-unit line is short of its line-bound incoming Units:
--   select l.po_id, l.sku, l.qty - l.received_qty pending,
--          (select count(*) from ops_stock_items u where u.po_line_id = l.id and u.status = 'incoming') incoming
--     from purchase_order_lines l join purchase_orders po on po.id = l.po_id
--    where po.status = 'open' and l.identity_mode = 'exact_unit'
--      and l.qty - l.received_qty <> (select count(*) from ops_stock_items u where u.po_line_id = l.id and u.status = 'incoming');
--   -- EXPECT: no rows
--
--   -- NEGATIVE CONTROL (rolled back): a SKU with NULL stock_identity_mode
--   -- refuses purchasing_issue_pos_batch with detail catalog_identity_mode_missing
--   -- and formal_document_codes gains no PO row.
