-- ⚠️ APPLIED UNDER THE NAME `0398_the_five_purposes_a_purchase_may_serve`
-- (tracker 2026-08-28 14:34 UTC), BEFORE PR #973 landed main's different 0398.
-- Renamed with the `a` suffix so both texts survive in the repository without
-- a number collision (red line #7: an applied migration missing from the
-- repository is a P0). Its door vocabulary is SUPERSEDED by 0399 — the
-- internal_staff / subsidiary tokens it introduced were never used by any row
-- and survive only as two inert purchasing_purpose_approval rows 0399
-- documents. Do not re-apply.
-- ---------------------------------------------------------------------------
-- 0398 · The five purposes a purchase may serve
-- (PURCHASING — CARD 03 · Manual Purchase left filter rail; owner-approved
--  vocabulary 2026-08-28)
--
-- The approved Manual Purchase purposes are exactly: Ready Stock · Showroom
-- Display · Service Case · Internal Staff Purchase · Subsidiary Purchase.
-- Management is included under Internal Staff Purchase; there is no
-- Management Purchase.
--
-- TOKEN MAPPING — no false relabel (Card 03 §2):
--   ready_stock      Ready Stock              unchanged
--   display          Showroom Display         TRUE relabel — the token has
--                                             always meant purchased showroom
--                                             display (purchasing/MASTER §7.4)
--   warranty         Service Case             TRUE relabel — a warranty buy is
--                                             a buy for a customer Service
--                                             Case, the module owning that work
--   internal_staff   Internal Staff Purchase  NEW (this migration)
--   subsidiary       Subsidiary Purchase      NEW (this migration)
--   office · spare_parts                      LEGACY: old rows stay readable
--                                             with their truthful old label;
--                                             NEW requests refuse them by name.
--
-- WHAT THIS DOES
--   · widens the purpose CHECKs (requests, demand lines, purchase orders) to
--     admit the two new tokens — legacy tokens stay valid for existing rows
--   · seeds the per-purpose approval switch for the new tokens (default ON —
--     the safe side, 0359's own rule)
--   · recreates the three purpose-validating doors to OFFER exactly the five
--     current tokens: a word not in the dropdown may not be accepted for a new
--     write (0322's rule, both directions)
--   · re-emits `purchasing_issue_pos_batch` (0380's body, unchanged) with the
--     widened whitelist, so an approved internal_staff / subsidiary request
--     issues end to end — and an already-approved LEGACY request still issues
--     (ISSUE reads old truth; only CREATE refuses legacy tokens)
--
-- Data is walked past, never rewritten (red line #8): no row's purpose is
-- updated, and every live row today is TEST data under the clean-start law.
-- ---------------------------------------------------------------------------

set search_path = public, pg_temp;

-- ---------------------------------------------------------------------
-- 1. The stores admit the new tokens (legacy stays valid for old rows)
-- ---------------------------------------------------------------------

alter table public.purchase_requests
  drop constraint if exists purchase_requests_purpose_check;
alter table public.purchase_requests
  add constraint purchase_requests_purpose_check check (purpose in
    ('ready_stock', 'display', 'warranty', 'internal_staff', 'subsidiary',
     'office', 'spare_parts'));

alter table public.purchase_demands
  drop constraint if exists purchase_demands_purpose_check;
alter table public.purchase_demands
  add constraint purchase_demands_purpose_check check (purpose in
    ('ready_stock', 'display', 'warranty', 'internal_staff', 'subsidiary',
     'office', 'spare_parts'));

alter table public.purchase_orders
  drop constraint if exists purchase_orders_purpose_check;
alter table public.purchase_orders
  add constraint purchase_orders_purpose_check check (
    purpose is null or purpose in
    ('customer_sales', 'ready_stock', 'display', 'warranty', 'internal_staff',
     'subsidiary', 'office', 'spare_parts'));

comment on column public.purchase_requests.purpose is
  'Card 03 (2026-08-28): offered values are ready_stock, display (Showroom Display), warranty (Service Case), internal_staff, subsidiary. office/spare_parts are LEGACY — readable on old rows, refused for new requests.';

-- ---------------------------------------------------------------------
-- 2. The approval switch knows the new purposes (default ON — safe side)
-- ---------------------------------------------------------------------

alter table public.purchasing_purpose_approval
  drop constraint if exists purchasing_purpose_approval_purpose_check;
alter table public.purchasing_purpose_approval
  add constraint purchasing_purpose_approval_purpose_check check (purpose in
    ('ready_stock', 'display', 'warranty', 'internal_staff', 'subsidiary',
     'office', 'spare_parts'));

insert into public.purchasing_purpose_approval (purpose)
values ('internal_staff'), ('subsidiary')
on conflict (purpose) do nothing;

-- ---------------------------------------------------------------------
-- 3. The doors offer exactly the five current tokens
-- ---------------------------------------------------------------------

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
     ('ready_stock', 'display', 'warranty', 'internal_staff', 'subsidiary') then
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

  -- The offered five (Card 03). `office`/`spare_parts` are LEGACY — a new
  -- request may not be born with a word the dropdown no longer offers.
  if p_purpose is null or p_purpose not in
     ('ready_stock', 'display', 'warranty', 'internal_staff', 'subsidiary') then
    raise exception 'purpose % is not a purpose', p_purpose
      using errcode = '22023', detail = 'unknown_purpose';
  end if;

  if nullif(btrim(coalesce(p_why, '')), '') is null then
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
     ('ready_stock', 'display', 'warranty', 'internal_staff', 'subsidiary') then
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
  -- from 0323/0359). A product has exactly one factory; asking a human to pick
  -- one is asking them to get it wrong.
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

-- ---------------------------------------------------------------------
-- 4. The one creation authority learns the new purposes
--    (0380's body, restated in full because a function is replaced whole;
--     the ONLY change is the purpose whitelist — legacy tokens stay
--     issuable so an already-approved old request is not stranded)
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

    -- ⭐ 0398 · the ONLY change: internal_staff and subsidiary join the
    -- vocabulary; office and spare_parts stay ISSUABLE (an approved legacy
    -- request is old truth, not a new write).
    v_purpose := nullif(v_po->>'purpose', '');
    if v_purpose is not null and v_purpose not in
       ('customer_sales', 'ready_stock', 'display', 'warranty',
        'internal_staff', 'subsidiary', 'office', 'spare_parts') then
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
  '0379/0380/0398: the ONE Purchase Order creation authority. Reached through the governed journeys (SO Batch Purchase, Manual Purchase); it asks `purchasing_actor_may_issue` and `purchasing_check_line_commercials` itself, so a direct RPC call can bypass neither duty/cover nor commercial approval. 0398 admits the internal_staff/subsidiary purposes; legacy office/spare_parts stay issuable for old approved requests.';

-- ---------------------------------------------------------------------
-- VERIFY (read-only; a migration never asserts a production row count)
-- ---------------------------------------------------------------------
--   -- The switch knows all seven tokens, the two new ones defaulting ON:
--   select purpose, requires_approval from purchasing_purpose_approval order by 1;
--   -- EXPECT: rows include internal_staff=true and subsidiary=true
--
--   -- NEGATIVE CONTROL — a LEGACY token must be refused at the create door:
--   --   select purchasing_create_request('office', '<dest>', 'x');
--   --   EXPECT: ERROR purpose office is not a purpose (unknown_purpose)
--
--   -- NEGATIVE CONTROL — an unknown token must still be refused:
--   --   select purchasing_create_request('management', '<dest>', 'x');
--   --   EXPECT: ERROR purpose management is not a purpose (unknown_purpose)
--
--   -- A new token passes the stores' CHECKs (rolled back, writes nothing):
--   --   begin;
--   --     insert into purchase_requests (purpose, destination_id, why, approval_required)
--   --     values ('subsidiary', '<dest>', 'probe', true);
--   --   rollback;
