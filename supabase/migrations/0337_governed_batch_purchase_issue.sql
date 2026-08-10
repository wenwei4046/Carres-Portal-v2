-- Card 2 · governed Batch Purchase Issue boundary.
-- Old Orders keeps using operation_create_po / operation_create_pos_batch.
-- This additive door wraps the same PO helper, but enforces the permanent
-- Batch Purchase commercial and factory-pickup laws atomically.

set search_path = public, pg_temp;

alter table public.purchase_order_lines
  add column if not exists commercial_treatment text,
  add column if not exists commercial_reason text;

alter table public.purchase_order_lines
  drop constraint if exists purchase_order_lines_commercial_treatment_allowed,
  drop constraint if exists purchase_order_lines_commercial_treatment_complete;

alter table public.purchase_order_lines
  add constraint purchase_order_lines_commercial_treatment_allowed check (
    commercial_treatment is null
    or commercial_treatment in ('normal', 'free_of_charge')
  ),
  add constraint purchase_order_lines_commercial_treatment_complete check (
    commercial_treatment is null
    or (
      commercial_treatment = 'normal'
      and cost is not null and cost > 0
      and commercial_reason is null
    )
    or (
      commercial_treatment = 'free_of_charge'
      and cost = 0
      and nullif(btrim(commercial_reason), '') is not null
    )
  );

comment on column public.purchase_order_lines.commercial_treatment is
  'Commercial meaning of the PO transaction cost. NULL is retained only for legacy creation paths/rows; governed Batch Purchase writes normal or free_of_charge.';
comment on column public.purchase_order_lines.commercial_reason is
  'Mandatory immutable-at-issue explanation for a free_of_charge PO line; NULL for normal commercial lines.';

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

      -- These two document facts used to be a PostgREST update after batch
      -- creation. Keeping the same values inside this transaction closes the
      -- partial-issue state without changing destination or ETA rules.
      update purchase_orders
         set destination_id = v_destination_id,
             eta_date = v_eta
       where id = v_po_id;
      if not found then
        raise exception 'created purchase order not found'
          using errcode = 'P0001', detail = 'po_not_created';
      end if;

      for v_line in select * from jsonb_array_elements(v_po->'lines')
      loop
        update purchase_order_lines
           set commercial_treatment = v_line->>'commercial_treatment',
               commercial_reason = nullif(btrim(coalesce(v_line->>'commercial_reason', '')), '')
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
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.purchase_order_lines'::regclass
       and conname = 'purchase_order_lines_commercial_treatment_complete'
  ) then
    raise exception '0337 sanity: commercial constraint missing';
  end if;
  if to_regprocedure('public.purchasing_issue_pos_batch(jsonb)') is null then
    raise exception '0337 sanity: governed Issue RPC missing';
  end if;
end;
$sanity$;
