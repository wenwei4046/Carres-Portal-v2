-- ---------------------------------------------------------------------------
-- 0361 · A PO carries the reason it was born for
-- (CARD-2026-08-18-manual-purchase §6, Jess 2026-08-18)
--
-- The card's own 🔴: *"`purchase_orders` carries NO reason column and
-- `purchase_order_lines` carries no link back to its demand — this card owes
-- that migration; without it the lane is unprovable downstream."* Report can
-- then split the month by `Customer Sales · Ready Stock · Display · Office ·
-- Warranty · Spare Parts` instead of reconstructing it.
--
-- `purchasing_issue_pos_batch` stays THE one creation authority (0339 — the
-- lock is on the authority, not on its byte count). Its payload gains two
-- OPTIONAL keys the To Order caller does not send, so nothing existing moves:
--   · per PO:   `purpose`   — one of the six reasons; when absent and the PO
--               carries `so_refs`, it is stamped `customer_sales`, because a
--               document born from customer orders needs nobody to say so.
--   · per line: `demand_id` — the line's own typed demand. Validated against
--               the demand's SKU, stamped on the line, and the issue is
--               RECORDED through 0320's own door inside the same transaction
--               — the manual lane cannot create a PO whose demand forgot it
--               was issued.
--
-- The Checkpoint-A `purchase_order_lines.purchase_request_id` (0309) is left
-- untouched: it points at the retired prototype and no code writes it.
-- ---------------------------------------------------------------------------

set search_path = public, pg_temp;

alter table public.purchase_orders
  add column if not exists purpose text;

alter table public.purchase_orders
  drop constraint if exists purchase_orders_purpose_check;
alter table public.purchase_orders
  add constraint purchase_orders_purpose_check check (
    purpose is null or purpose in
      ('customer_sales', 'ready_stock', 'display', 'office', 'warranty', 'spare_parts')
  );

comment on column public.purchase_orders.purpose is
  'The reason this PO was born (card 2026-08-18 §6): customer_sales for the SO Batch lane, one of the five typed purposes for the Manual Purchase lane. NULL only on POs issued before 0361 — never backfilled (clean start).';

alter table public.purchase_order_lines
  add column if not exists demand_id uuid references public.purchase_demands(id);

comment on column public.purchase_order_lines.demand_id is
  'The typed demand this line was issued FOR (card §6 — the demand link the report needs). NULL on customer-lane lines and on lines issued before 0361.';

create index if not exists purchase_order_lines_demand_idx
  on public.purchase_order_lines (demand_id) where demand_id is not null;

-- The one creation authority, extended in place — same signature, no second
-- door (0339's sanity block still passes).
create or replace function public.purchasing_issue_pos_batch(p_pos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
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
begin
  if not public.is_operation() then
    raise exception 'forbidden: operation only' using errcode = '42501';
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

  -- Keep two simultaneous Issue presses from entering the PO-number allocator
  -- together. The existing thread claim remains the demand-level conflict gate.
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

    -- 0361 · THE REASON. Optional on the wire; a customer-lane document
    -- (so_refs present) defaults to customer_sales.
    v_purpose := nullif(v_po->>'purpose', '');
    if v_purpose is not null and v_purpose not in
       ('customer_sales', 'ready_stock', 'display', 'office', 'warranty', 'spare_parts') then
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

      -- 0361 · THE DEMAND LINK. Optional; when present the demand must exist
      -- and name the same SKU — a link that contradicts its line is a second
      -- truth (Law D).
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

    -- A document born from customer orders says so without being asked.
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

    -- Repeat the SKU supplier and catalog-seeded-cost checks at the creation
    -- boundary. A direct/crafted RPC request cannot bypass the recomputation
    -- performed by the API.
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
      if v_cost_source = 'catalog'
         and (v_catalog_cost is null or v_catalog_cost <= 0
              or v_catalog_cost is distinct from (v_line->>'cost')::numeric(14,2)) then
        raise exception 'Catalog cost changed before Issue (sku=%)', v_line->>'sku'
          using errcode = '40001', detail = 'stale_catalog_cost';
      end if;
    end loop;

    begin
      v_po_id := public._operation_create_po_inner(
        p_supplier_id := v_supplier_id,
        p_warehouse_id := nullif(v_po->>'warehouse_id', '')::uuid,
        p_lines := v_po->'lines',
        p_eta_date := v_eta,
        p_so_refs := v_so_refs,
        p_note := v_po->>'note',
        p_procurement_partner_id := v_partner_id
      );

      -- These document facts used to be a PostgREST update after batch
      -- creation. Keeping the same values inside this transaction closes the
      -- partial-issue state without changing destination or ETA rules.
      -- 0361 adds the purpose to the same stamp.
      update purchase_orders
         set destination_id = v_destination_id,
             eta_date = v_eta,
             purpose = v_purpose
       where id = v_po_id;
      if not found then
        raise exception 'created purchase order not found'
          using errcode = 'P0001', detail = 'po_not_created';
      end if;

      for v_line in select * from jsonb_array_elements(v_po->'lines')
      loop
        v_demand_id := nullif(v_line->>'demand_id', '')::uuid;
        update purchase_order_lines
           set commercial_treatment = v_line->>'commercial_treatment',
               commercial_reason = nullif(btrim(coalesce(v_line->>'commercial_reason', '')), ''),
               demand_id = v_demand_id
         where po_id = v_po_id and sku = v_line->>'sku';
        if not found then
          raise exception 'created PO line not found (sku=%)', v_line->>'sku'
            using errcode = 'P0001', detail = 'po_line_not_created';
        end if;
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

        -- 0361 · THE ISSUE IS RECORDED WHERE IT HAPPENED. The manual lane's
        -- demand learns it was issued inside the same transaction, through
        -- 0320's own door — never a second arithmetic, never a forgetful
        -- after-the-fact PATCH. (The To Order caller sends no demand_id and
        -- keeps its own recording path, unchanged.)
        if v_demand_id is not null then
          perform public.purchasing_demand_record_issue(
            v_demand_id, (v_line->>'qty')::int, v_po_id);
        end if;
      end loop;

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

revoke all on function public.purchasing_issue_pos_batch(jsonb) from public, anon;
grant execute on function public.purchasing_issue_pos_batch(jsonb) to authenticated;

do $sanity$
begin
  if to_regprocedure('public.purchasing_issue_pos_batch(jsonb)') is null then
    raise exception '0361 sanity: governed Issue RPC missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'purchase_orders'
      and column_name = 'purpose'
  ) then
    raise exception '0361 sanity: purchase_orders.purpose missing';
  end if;
end;
$sanity$;

-- ---------------------------------------------------------------------
-- VERIFY (read-only)
-- ---------------------------------------------------------------------
--   select purpose, count(*) from purchase_orders group by 1;
--   -- EXPECT: existing POs all NULL (never backfilled)
--   -- NEGATIVE CONTROL — an unknown purpose must be refused by NAME:
--   --   p_pos with "purpose": "restock" → ERROR unknown_purpose
--   -- NEGATIVE CONTROL — a demand link naming another SKU must be refused:
--   --   line {sku: A, demand_id: <demand for B>} → ERROR demand_sku_mismatch
