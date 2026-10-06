-- ═══════════════════════════════════════════════════════════════════════════
-- 0573 · A PURCHASE ORDER MAY BE ISSUED WITHOUT A RECORDED PRICE
--
-- ⚠️ RENUMBERED FROM 0565, 2026-09-23, BEFORE IT WAS EVER APPLIED. The Sales
-- Order lane shipped `0565_an_issued_version_keeps_its_document` while this
-- card was paused, and the repository tail then moved to 0572. Nothing of this
-- file ran under the old number: the tracker holds no row for it. Red line 7
-- is why the number is taken again at push time, not at write time.
-- PURCHASING · owner instruction (Jess, 2026-09-23): a Purchase Order may be
-- issued for a line whose Catalog price is NOT RECORDED. Price and financial
-- approval must never block PLACING an order. A price that IS recorded keeps
-- every rule it has today, unchanged.
--
-- ⭐ WHY THIS IS AN ABSENCE AND NOT A DISCOUNT.
-- Two gates read the same three line facts — `commercial_treatment`, `cost`,
-- `cost_source`. Until now each gate insisted all three were present, so a
-- SKU Carres has never been quoted for could not be ordered at all: the
-- operator had to invent a number, and an invented number is the one thing
-- a commercial record must never contain. NONE of the three present is now
-- read as what it is — Carres has no price for this line yet — and the order
-- goes out. The line is born with NULL cost, NULL cost_source and NULL
-- treatment, which is the honest record of that absence (CLAUDE.md §6: a
-- fact nobody has is never manufactured).
--
-- ⛔ HALF A COMMERCIAL FACT IS STILL REFUSED, AND BY THE SAME NAME.
-- A cost with no cost_source, a cost_source with no cost, a treatment with
-- no cost, or a cost with no treatment is not an absence — it is a mistake,
-- and it keeps refusing under the exact detail codes the API already reads
-- (`cost_required`, `commercial_treatment_required`, `cost_source_required`).
-- Only the all-three-absent line is new.
--
-- ── WHAT IS DELIBERATELY NOT CHANGED ──────────────────────────────────────
--   · `purchasing_check_line_commercials` and `po_cost_approvals` — the
--     price-approval engine (0380) is untouched. A recorded price that is not
--     the approved Catalog price still needs somebody else's approval, and
--     that approval is still SPENT on the PO that used it. A price-not-
--     recorded line simply never reaches the engine, so it neither requires
--     an approval nor consumes one.
--   · THE MANUAL PURCHASE (MPR) APPROVAL GATE — whether Carres should buy at
--     all is a different question from what it costs, it lives in
--     `purchasing_create_request` / `approval_decide` / `purchasing_actor_may_issue`,
--     and no line of it is touched here. `not_po_duty` still guards the door.
--   · THE FREE OF CHARGE RULE — `free_of_charge` still demands cost 0, a
--     hand-entered source and a reason under 500 characters, and still
--     refuses with `free_of_charge_reason_required`. Free of charge is a
--     CLAIM about price; not recorded is the absence of one. They are not
--     the same fact and this file keeps them apart.
--   · THE TABLE CONSTRAINTS — none. Verified in this repository and against
--     the live catalogue before writing this file:
--     `purchase_order_lines_commercial_treatment_complete` (0337) is
--     satisfied by its first arm, `commercial_treatment IS NULL`, whatever
--     cost is; `purchase_order_lines_cost_check` reads
--     `cost IS NULL OR cost >= 0`; and `cost`, `cost_source`,
--     `commercial_treatment` and `commercial_reason` are all nullable with no
--     default. A NULL price was already legal to STORE — only the two doors
--     refused to write it. The sanity block re-proves the constraint arm.
--
-- ⭐ A PRICE RECORDED LATER IS A SEPARATE FINANCE/COMMERCIAL ACT, NOT A
-- RE-ISSUE. Nothing in this file back-fills, guesses or reserves a price, and
-- issuing the PO does not become provisional. When the supplier's price
-- arrives it is recorded through the governed commercial/revision path on its
-- own date and with its own actor — the PO that was already placed is not
-- re-issued, and its number does not change.
--
-- ── HOW THE TWO BODIES BELOW WERE WRITTEN, AND WHY IT MATTERS ─────────────
-- Each body is the COMMITTED body of its door — `_operation_create_po_inner`
-- and `purchasing_issue_pos_batch`, both from 0443 — extracted verbatim and
-- edited in exactly three places. Nothing is re-derived from the ruling.
-- Re-typing `purchasing_issue_pos_batch` from the spec would have silently
-- dropped the actor gate, the advisory lock, the batch-size limit, the
-- supplier-kind and procurement-partner rules, the purpose vocabulary, the
-- confirmed-delivery-date gate, the demand SKU match, the Unit ledger
-- verification and the per-PO savepoint that rolls one bad PO back — none of
-- which this instruction is allowed to change. The extraction was checked
-- the only way that proves anything: the md5 of each extracted body equals
-- `md5(prosrc)` of the live function (aa16259a…, 5f1e4415…), and no migration
-- after 0443 redefines either one (0482 only revokes grants; 0522/0546 only
-- mention them in comments).
--
-- Both are re-published with CREATE OR REPLACE under their existing
-- signatures, so no grant, comment or dependency is dropped.
--
-- RLS: no policy changes. GRANTS: unchanged. DR/CR: none. DATA: none — this
--   file reads no row and writes no row.
-- ═══════════════════════════════════════════════════════════════════════════
begin;

set local search_path = public, pg_temp;

-- ─── 1 · the creation helper · both null is an absence ──────────────────────

create or replace function public._operation_create_po_inner(
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
    -- ⭐ 0573 · A PRICE THAT IS NOT RECORDED DOES NOT STOP THE ORDER (owner
    -- instruction, Jess 2026-09-23). BOTH null is an ABSENCE and is legal —
    -- Catalog simply has no price for this line yet. EXACTLY ONE null is
    -- still refused under the same name: half a commercial fact is a
    -- mistake, not an absence.
    if (v_cost is null) <> (v_cost_source is null) then
      raise exception 'cost and cost_source are recorded together or not at all (sku=%)', v_sku
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
  v_price_not_recorded boolean;
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
      -- ⭐ 0573 · PRICE NOT RECORDED. No treatment, no cost and no cost source
      -- is an ABSENCE: the order may be placed, the line makes no commercial
      -- claim, and no approval is required or spent. A treatment without a
      -- cost, or a cost without a treatment, still refuses below by its own
      -- name — that is half a commercial fact, which is a mistake.
      v_price_not_recorded :=
        v_treatment is null
        and v_cost is null
        and v_line->>'cost_source' is null;
      if v_price_not_recorded then
        null;
      elsif v_treatment = 'normal' then
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
      -- ⭐ 0573 · THE SAME ABSENCE, JUDGED THE SAME WAY IN BOTH PASSES. A line
      -- whose price is not recorded names no cost source and makes no
      -- commercial claim, so the governed-source gate and the commercial gate
      -- have nothing to judge and do not run: no approval is required, and
      -- none is spent. The supplier-truth check ABOVE is deliberately not
      -- skipped — who Carres buys from is not a price question.
      v_price_not_recorded :=
        v_line->>'commercial_treatment' is null
        and v_line->>'cost' is null
        and v_cost_source is null;
      if not v_price_not_recorded then
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

comment on function public._operation_create_po_inner(uuid, uuid, jsonb, date, integer[], text, uuid, uuid) is
  '0443 Unit birth, 0573 price absence: the ONE creation helper. Draws the PO number, writes every line fact on the line''s own row and mints each exact-unit line''s permanent line-bound Unit IDs in one transaction. Since 0573 a line may carry NO cost and NO cost_source — Carres has no price for it yet — but never exactly one of the two, which would be half a commercial fact.';

comment on function public.purchasing_issue_pos_batch(jsonb) is
  '0379/0380 (+0399/0401 vocabulary, 0443 Unit birth, 0573 price absence): the ONE Purchase Order creation authority. Reached through the governed journeys (SO Batch Purchase, Manual Purchase); it asks `purchasing_actor_may_issue` and `purchasing_check_line_commercials` itself, so a direct RPC call can bypass neither duty/cover nor commercial approval. Since 0573 a line that names no commercial treatment, no cost and no cost source is PRICE NOT RECORDED: it is issued without a price, reaches neither the cost-source gate nor the approval engine, and so neither requires nor spends an approval. `normal` and `free_of_charge` keep every rule they had. A price recorded later is a separate commercial act, not a re-issue.';

-- ─── 3 · the proof ──────────────────────────────────────────────────────────
--
-- This block reads the CATALOGUE only — pg_proc, pg_constraint, pg_attribute.
-- It touches no row of business data and asserts no production row count
-- (red line 8). What it proves is that the two bodies re-published above are
-- the committed bodies MINUS the three edits this instruction authorised: every
-- refusal name either function could raise before is still in its source, and
-- the number of raises is unchanged, so no rule was lost while relaxing the
-- price gate.
--
-- `already_on_po` is deliberately NOT asserted: it appears nowhere in
-- supabase/migrations, so asserting it would be asserting a rule Carres does
-- not have.
do $sanity$
declare
  v_src  text;
  v_def  text;
  v_n    int;
  m      text;
begin
  -- ① BOTH DOORS STILL EXIST, UNDER THE EXACT SIGNATURES THEY HAD.
  -- A replace that accidentally changed an argument would leave the old
  -- function beside the new one and PostgREST would keep resolving the old.
  if to_regprocedure(
       'public._operation_create_po_inner(uuid, uuid, jsonb, date, integer[], text, uuid, uuid)'
     ) is null then
    raise exception '0573 sanity: the creation helper lost its 8-argument signature';
  end if;
  if to_regprocedure('public.purchasing_issue_pos_batch(jsonb)') is null then
    raise exception '0573 sanity: the one PO creation authority is missing';
  end if;
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_operation_create_po_inner';
  if v_n <> 1 then
    raise exception '0573 sanity: expected exactly one creation helper, found %', v_n;
  end if;
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'purchasing_issue_pos_batch';
  if v_n <> 1 then
    raise exception '0573 sanity: expected exactly one issue authority, found %', v_n;
  end if;

  -- ② THE CREATION HELPER KEPT EVERY REFUSAL IT COULD ALREADY RAISE.
  select p.prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_operation_create_po_inner';
  foreach m in array array[
    'catalog_identity_mode_missing', 'cost_required', 'invalid_qty',
    'lines_empty', 'partner_not_found', 'sku_not_in_catalog',
    'source_allocation_mismatch', 'source_line_mismatch', 'supplier_not_found',
    'unit_allocation_failed', 'unknown_destination', 'unknown_source_order',
    'warehouse_not_found', 'warehouse_required',
    'allocate_formal_document_code', 'po_mint', 'ops_stock_items'
  ] loop
    if position(m in v_src) = 0 then
      raise exception '0573 sanity: _operation_create_po_inner lost %', m;
    end if;
  end loop;
  v_n := (length(v_src) - length(replace(v_src, 'raise exception', '')))
         / length('raise exception');
  if v_n <> 16 then
    raise exception '0573 sanity: the creation helper raises % times, expected the committed 16', v_n;
  end if;

  -- ③ AND IT CARRIES THE NEW RULE, WITH THE OLD ONE GONE.
  if position('(v_cost is null) <> (v_cost_source is null)' in v_src) = 0 then
    raise exception '0573 sanity: the creation helper does not carry the both-null-is-legal rule';
  end if;
  if position('if v_cost is null or v_cost_source is null then' in v_src) > 0 then
    raise exception '0573 sanity: the creation helper still refuses a line with no recorded price';
  end if;

  -- ④ THE ISSUE AUTHORITY KEPT EVERY REFUSAL AND EVERY GUARD.
  select p.prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'purchasing_issue_pos_batch';
  foreach m in array array[
    'blocked_delivery_date', 'commercial_treatment_required', 'cost_required',
    'cost_source_required', 'demand_sku_mismatch', 'free_of_charge_reason_required',
    'invalid_batch_size', 'lines_empty', 'not_po_duty', 'pickup_partner_not_allowed',
    'pickup_partner_required', 'po_not_created', 'unit_ledger_mismatch',
    'unknown_demand', 'unknown_destination', 'unknown_purpose', 'unresolved_supplier',
    'purchasing_actor_may_issue', 'purchasing_check_line_commercials',
    'pg_advisory_xact_lock', 'po_cost_approvals', '_operation_create_po_inner',
    'purchasing_demand_record_issue'
  ] loop
    if position(m in v_src) = 0 then
      raise exception '0573 sanity: purchasing_issue_pos_batch lost %', m;
    end if;
  end loop;
  v_n := (length(v_src) - length(replace(v_src, 'raise exception', '')))
         / length('raise exception');
  if v_n <> 21 then
    raise exception '0573 sanity: the issue authority raises % times, expected the committed 21', v_n;
  end if;

  -- ⑤ AND IT SKIPS THE PRICE GATES ON EXACTLY THE ABSENT LINE — IN BOTH PASSES.
  -- One pass judging the line differently from the other is the bug this
  -- assertion exists to catch.
  if position('v_price_not_recorded boolean;' in v_src) = 0 then
    raise exception '0573 sanity: the issue authority does not declare the price-not-recorded verdict';
  end if;
  v_n := (length(v_src) - length(replace(v_src, 'v_price_not_recorded', '')))
         / length('v_price_not_recorded');
  if v_n <> 5 then
    raise exception '0573 sanity: the price-not-recorded verdict appears % times, expected 5 (declared, then decided and obeyed in each of the two line passes)', v_n;
  end if;
  if position('if not v_price_not_recorded then' in v_src) = 0 then
    raise exception '0573 sanity: the cost-source and approval gates are not guarded by the verdict';
  end if;
  -- The free-of-charge arm must still be reached BY TREATMENT, not by absence.
  if position('elsif v_treatment = ''free_of_charge'' then' in v_src) = 0 then
    raise exception '0573 sanity: the free-of-charge arm no longer tests the treatment';
  end if;

  -- ⑥ NO CONSTRAINT WORK WAS NEEDED, AND NONE WAS DONE.
  -- The line table already stores an absent price: the completeness check is
  -- satisfied by its first arm, and no price column is NOT NULL.
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conrelid = 'public.purchase_order_lines'::regclass
     and conname = 'purchase_order_lines_commercial_treatment_complete';
  if v_def is null or position('commercial_treatment IS NULL' in v_def) = 0 then
    raise exception '0573 sanity: the line constraint no longer admits a line with no commercial treatment';
  end if;
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conrelid = 'public.purchase_order_lines'::regclass
     and conname = 'purchase_order_lines_cost_check';
  if v_def is null or position('cost IS NULL' in v_def) = 0 then
    raise exception '0573 sanity: the cost check no longer admits a NULL cost';
  end if;
  if exists (
    select 1 from pg_attribute
     where attrelid = 'public.purchase_order_lines'::regclass
       and attname in ('cost', 'cost_source', 'commercial_treatment', 'commercial_reason')
       and attnotnull
  ) then
    raise exception '0573 sanity: a price column on purchase_order_lines is NOT NULL';
  end if;
end
$sanity$;

commit;
