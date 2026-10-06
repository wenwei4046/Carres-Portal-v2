-- ---------------------------------------------------------------------------
-- 0399 · One vocabulary for the purchase purpose
-- (PURCHASING — CARD 03 repair, 2026-08-28)
--
-- TWO CARD-03 LANES COLLIDED ON 0398. This lane applied
-- `0398_the_five_purposes_a_purchase_may_serve` (tracker 2026-08-28 14:34 UTC;
-- its text survives in the repo as 0398a) with the tokens
-- internal_staff / subsidiary and TRUE-relabelled display / warranty. Minutes
-- later PR #973 merged `0398_a_purchase_names_the_approved_purpose` to main —
-- the SAME owner ruling, spelt with the tokens showroom_display / service_case
-- / internal_staff_purchase / subsidiary_purchase and the four old values
-- RETIRED, never relabelled. Main's application code speaks THAT vocabulary,
-- so that vocabulary is the one truth (Law D) and this migration re-emits the
-- CHECKs and all four doors with it — 0398 (main)'s text verbatim.
--
-- MAIN'S OWN 0398 MUST NEVER BE APPLIED: its purchasing_purpose_approval
-- CHECK would fail validation against the two switch rows the applied 0398a
-- seeded (internal_staff, subsidiary). Those rows are INERT ARTIFACTS of the
-- collision — no door offers or accepts their tokens, no data row carries
-- them — and they are deliberately NOT deleted here (a production DELETE
-- belongs to the owner, red line #1); the switch CHECK below simply tolerates
-- them until an owner-approved cleanup removes them.
--
-- Everything below this header is 0398 (main) verbatim except that one CHECK.
-- ---------------------------------------------------------------------------

set search_path = public, pg_temp;

-- ---------------------------------------------------------------------
-- 1. The CHECKs hold history + the approved five
-- ---------------------------------------------------------------------

alter table public.purchase_requests
  drop constraint if exists purchase_requests_purpose_check;
alter table public.purchase_requests
  add constraint purchase_requests_purpose_check check (purpose in
    ('ready_stock', 'display', 'office', 'warranty', 'spare_parts',
     'showroom_display', 'service_case', 'internal_staff_purchase',
     'subsidiary_purchase'));

alter table public.purchase_demands
  drop constraint if exists purchase_demands_purpose_check;
alter table public.purchase_demands
  add constraint purchase_demands_purpose_check check (purpose in
    ('ready_stock', 'display', 'office', 'warranty', 'spare_parts',
     'showroom_display', 'service_case', 'internal_staff_purchase',
     'subsidiary_purchase'));

alter table public.purchasing_purpose_approval
  drop constraint if exists purchasing_purpose_approval_purpose_check;
alter table public.purchasing_purpose_approval
  add constraint purchasing_purpose_approval_purpose_check check (purpose in
    ('ready_stock', 'display', 'office', 'warranty', 'spare_parts',
     'showroom_display', 'service_case', 'internal_staff_purchase',
     'subsidiary_purchase',
     -- the 0398a collision's two inert rows (see header) — tolerated, never
     -- offered; removed only by an owner-approved cleanup
     'internal_staff', 'subsidiary'));

alter table public.purchase_orders
  drop constraint if exists purchase_orders_purpose_check;
alter table public.purchase_orders
  add constraint purchase_orders_purpose_check check (
    purpose is null or purpose in
      ('customer_sales', 'ready_stock', 'display', 'office', 'warranty',
       'spare_parts', 'showroom_display', 'service_case',
       'internal_staff_purchase', 'subsidiary_purchase')
  );

comment on column public.purchase_orders.purpose is
  'The reason this PO was born (0361; vocabulary re-ruled by Card 03, 2026-08-28): customer_sales for the SO Batch lane; ready_stock / showroom_display / service_case / internal_staff_purchase / subsidiary_purchase for the Manual Purchase lane. display / warranty / office / spare_parts survive on history only — retired, never relabelled. NULL only on POs issued before 0361 — never backfilled (clean start).';

-- ---------------------------------------------------------------------
-- 2. The approval switch knows the new purposes — approval ON (0359's
--    own safe default; the owner decides per purpose in Settings)
-- ---------------------------------------------------------------------

insert into public.purchasing_purpose_approval (purpose)
values ('showroom_display'), ('service_case'),
       ('internal_staff_purchase'), ('subsidiary_purchase')
on conflict (purpose) do nothing;

-- ---------------------------------------------------------------------
-- 3. The doors admit ONLY the approved five — a retired value is refused
--    by the same name an invented one gets (0322's lesson: a word a
--    dropdown offers that the server refuses by name is the disease, and
--    so is a word the server accepts that no dropdown may offer)
-- ---------------------------------------------------------------------

-- 3a. The header door — 0359's body, gate narrowed.
create or replace function public.purchasing_create_request(
  p_purpose        text,
  p_destination_id uuid,
  p_why            text,
  p_required_by    date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role     app_role;
  v_required boolean;
  v_id       uuid;
  v_no       text;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  if p_purpose is null or p_purpose not in
     ('ready_stock', 'showroom_display', 'service_case',
      'internal_staff_purchase', 'subsidiary_purchase') then
    raise exception 'purpose % is not a purpose', p_purpose
      using errcode = '22023', detail = 'unknown_purpose';
  end if;

  if nullif(btrim(coalesce(p_why, '')), '') is null then
    -- The door enforces it, not only the button: a blank why is a request
    -- the approver cannot read.
    raise exception 'why may not be blank' using errcode = '22023', detail = 'why_required';
  end if;

  if not exists (
    select 1 from purchasing_destinations where id = p_destination_id and active
  ) then
    raise exception 'unknown destination' using errcode = '22023', detail = 'unknown_destination';
  end if;

  select requires_approval into v_required
    from purchasing_purpose_approval where purpose = p_purpose;
  -- A missing switch row defaults to REQUIRING approval — the safe side.
  v_required := coalesce(v_required, true);

  insert into purchase_requests (purpose, destination_id, required_by, why,
                                 approval_required, created_by)
  values (p_purpose, p_destination_id, p_required_by, btrim(p_why),
          v_required, auth.uid())
  returning id, req_no into v_id, v_no;

  return jsonb_build_object('id', v_id, 'req_no', v_no,
                            'approval_required', v_required);
end;
$fn$;

-- 3b. The line door — 0359's body, gate narrowed. Same single signature,
-- replaced whole; never overloaded.
create or replace function public.purchasing_create_demand(
  p_sku            text,
  p_qty            int,
  p_destination_id uuid,
  p_required_by    date default null,
  p_remark         text default null,
  p_purpose        text default 'ready_stock',
  p_request_id     uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role     app_role;
  v_supplier uuid;
  v_id       uuid;
  v_req      purchase_requests%rowtype;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  if p_purpose is null or p_purpose not in
     ('ready_stock', 'showroom_display', 'service_case',
      'internal_staff_purchase', 'subsidiary_purchase') then
    raise exception 'purpose % is not a purpose', p_purpose
      using errcode = '22023', detail = 'unknown_purpose';
  end if;
  if p_qty is null or p_qty < 1 then
    raise exception 'qty must be at least 1' using errcode = '22023', detail = 'invalid_qty';
  end if;

  if p_request_id is not null then
    select * into v_req from purchase_requests where id = p_request_id;
    if not found then
      raise exception 'unknown request' using errcode = '22023', detail = 'unknown_request';
    end if;
    -- A line inherits its header's meaning; a line that contradicts it is a
    -- second truth (Law D).
    if v_req.purpose <> p_purpose then
      raise exception 'line purpose % does not match request %', p_purpose, v_req.purpose
        using errcode = '22023', detail = 'purpose_mismatch';
    end if;
    if v_req.destination_id <> p_destination_id then
      raise exception 'line destination does not match request'
        using errcode = '22023', detail = 'destination_mismatch';
    end if;
    if v_req.refused_at is not null then
      raise exception 'request is refused' using errcode = '22023', detail = 'request_refused';
    end if;
  end if;

  -- THE SUPPLIER IS DERIVED, NEVER CHOSEN (Jess, 2026-08-03; kept verbatim
  -- from 0323). A product has exactly one factory; asking a human to pick one
  -- is asking them to get it wrong.
  select supplier_id into v_supplier from product_skus where sku = p_sku;
  if not found then
    raise exception 'unknown sku %', p_sku using errcode = '22023', detail = 'unknown_sku';
  end if;
  if v_supplier is null then
    raise exception 'sku % has no supplier', p_sku
      using errcode = '22023', detail = 'sku_has_no_supplier';
  end if;

  if not exists (
    select 1 from purchasing_destinations where id = p_destination_id and active
  ) then
    raise exception 'unknown destination' using errcode = '22023', detail = 'unknown_destination';
  end if;

  insert into purchase_demands
    (purpose, sku, supplier_id, destination_id, qty, required_by, remark,
     request_id, created_by)
  values
    (p_purpose, p_sku, v_supplier, p_destination_id, p_qty, p_required_by,
     nullif(btrim(coalesce(p_remark, '')), ''), p_request_id, auth.uid())
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'supplier_id', v_supplier);
end;
$fn$;

-- 3c. The Settings switch door — 0359's body, gate narrowed. A retired
-- purpose's switch row survives as history but cannot be flipped: no new
-- request can be born under it, so the switch decides nothing.
create or replace function public.purchasing_set_purpose_approval(
  p_purpose text,
  p_value   boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role text := (select public.purchasing_settings_gate());
  v_old  boolean;
begin
  if p_purpose is null or p_purpose not in
     ('ready_stock', 'showroom_display', 'service_case',
      'internal_staff_purchase', 'subsidiary_purchase') then
    raise exception 'purpose % is not a purpose', p_purpose
      using errcode = '22023', detail = 'unknown_purpose';
  end if;
  if p_value is null then
    raise exception 'value required' using errcode = '22023', detail = 'invalid_value';
  end if;

  select requires_approval into v_old
    from purchasing_purpose_approval where purpose = p_purpose for update;

  update purchasing_purpose_approval
     set requires_approval = p_value, updated_by = auth.uid(), updated_at = now()
   where purpose = p_purpose;

  perform public.purchasing_record_change(
    v_role, 'purpose_approval:' || p_purpose, null, null,
    v_old::text, p_value::text,
    'set approval for ' || p_purpose || ' to ' || p_value::text);
end;
$fn$;

-- ---------------------------------------------------------------------
-- 4. The ONE creation authority learns the vocabulary — 0380's body,
--    restated whole, ONLY the purpose gate widened. 0382's
--    _operation_create_po_inner underneath it is untouched.
-- ---------------------------------------------------------------------

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
        'subsidiary_purchase') then
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
      v_po_id := public._operation_create_po_inner(
        p_supplier_id := v_supplier_id,
        p_warehouse_id := nullif(v_po->>'warehouse_id', '')::uuid,
        p_lines := v_po->'lines',
        p_eta_date := v_eta,
        p_so_refs := v_so_refs,
        p_note := v_po->>'note',
        p_procurement_partner_id := v_partner_id
      );

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
  '0379/0380 (+0398 vocabulary): the ONE Purchase Order creation authority. Reached through the governed journeys (SO Batch Purchase, Manual Purchase); it asks `purchasing_actor_may_issue` and `purchasing_check_line_commercials` itself, so a direct RPC call can bypass neither duty/cover nor commercial approval.';

-- ---------------------------------------------------------------------
-- VERIFY (read-only; a migration never asserts a production row count)
-- ---------------------------------------------------------------------
--   select purpose, requires_approval from purchasing_purpose_approval order by 1;
--   -- EXPECT: nine rows; the four new ones true
--
--   -- NEGATIVE CONTROL — a retired value must be refused by name:
--   --   select purchasing_create_request('office', '<dest>', 'x');
--   --   EXPECT: ERROR purpose office is not a purpose (unknown_purpose)
--
--   -- NEGATIVE CONTROL — an invented value likewise:
--   --   select purchasing_create_request('management_purchase', '<dest>', 'x');
--   --   EXPECT: ERROR (unknown_purpose)
--
--   -- POSITIVE — the approved five pass the gate (rolled back in test):
--   --   select purchasing_create_request('subsidiary_purchase', '<dest>', 'why');
