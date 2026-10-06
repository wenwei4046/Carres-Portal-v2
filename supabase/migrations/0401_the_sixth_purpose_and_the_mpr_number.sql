-- ---------------------------------------------------------------------
-- 0401 · The sixth purpose, the MPR number, and the structured `For`
-- (PURCHASING — CARD 04 · Manual Purchase Permanent Register;
--  docs/purchasing/MASTER.md §§5.2 · 6.1 · 9.2; docs/COPY-STANDARD.md)
--
-- Three corrections, one vocabulary:
--
--   1 · `Other Purchase` joins the approved purposes (owner-approved Card 04
--       vocabulary): exactly six creatable values. Only `other_purchase`
--       requires its `What is this for?` answer (stored in `why`); routine
--       purposes stop asking a duplicate `Why`. No stored value is
--       relabelled; the four retired values stay history-only.
--
--   2 · A NEW Manual Purchase is numbered `MPR-YYYYMMDD-RRRR` through the
--       ONE governed allocator (0381, §6.1) — never `PR-`, never a counting
--       sequence that tells a reader how many requests were born in between.
--       Existing identities are permanent and are NOT renumbered.
--
--   3 · The `For` fact becomes STRUCTURED object truth, per purpose:
--       `service_case`            → for_service_case_id  (the linked Case)
--       `internal_staff_purchase` → for_staff_user_id    (the real person)
--       `subsidiary_purchase`     → for_subsidiary_name  (the actual company)
--       `ready_stock` / `showroom_display` are served by the governed
--       destination already on the request; `other_purchase` by its answer.
--       The door REQUIRES the right fact for a new request and refuses the
--       wrong one by name; the table CHECK only forbids a fact on a foreign
--       purpose, so pre-0401 history applies clean (a migration never
--       asserts what production rows must already hold).
--
-- The doors are replaced whole (0399's bodies), never overloaded:
-- `purchasing_create_request` changes signature, so the old signature is
-- DROPPED first; `purchasing_issue_pos_batch` is restated whole with only
-- its purpose gate widened.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 1. The number series — the governed allocator mints MPR
-- ---------------------------------------------------------------------

alter table public.purchase_requests
  alter column req_no set default public.allocate_formal_document_code('MPR');

comment on column public.purchase_requests.req_no is
  'The Manual Purchase identity. Since 0401: MPR-YYYYMMDD-RRRR from allocate_formal_document_code (0381) — the shared daily visible-code pool, drawn at random, never a sequence. Pre-0401 REQ-#### identities are permanent and print exactly as stored.';

-- ---------------------------------------------------------------------
-- 2. The CHECKs learn the sixth purpose (history still held)
-- ---------------------------------------------------------------------

alter table public.purchase_requests
  drop constraint if exists purchase_requests_purpose_check;
alter table public.purchase_requests
  add constraint purchase_requests_purpose_check check (purpose in
    ('ready_stock', 'display', 'office', 'warranty', 'spare_parts',
     'showroom_display', 'service_case', 'internal_staff_purchase',
     'subsidiary_purchase', 'other_purchase'));

alter table public.purchase_demands
  drop constraint if exists purchase_demands_purpose_check;
alter table public.purchase_demands
  add constraint purchase_demands_purpose_check check (purpose in
    ('ready_stock', 'display', 'office', 'warranty', 'spare_parts',
     'showroom_display', 'service_case', 'internal_staff_purchase',
     'subsidiary_purchase', 'other_purchase'));

alter table public.purchasing_purpose_approval
  drop constraint if exists purchasing_purpose_approval_purpose_check;
alter table public.purchasing_purpose_approval
  add constraint purchasing_purpose_approval_purpose_check check (purpose in
    ('ready_stock', 'display', 'office', 'warranty', 'spare_parts',
     'showroom_display', 'service_case', 'internal_staff_purchase',
     'subsidiary_purchase', 'other_purchase',
     -- the 0398a collision's two inert rows (0399 header) — tolerated,
     -- never offered; removed only by an owner-approved cleanup
     'internal_staff', 'subsidiary'));

alter table public.purchase_orders
  drop constraint if exists purchase_orders_purpose_check;
alter table public.purchase_orders
  add constraint purchase_orders_purpose_check check (
    purpose is null or purpose in
      ('customer_sales', 'ready_stock', 'display', 'office', 'warranty',
       'spare_parts', 'showroom_display', 'service_case',
       'internal_staff_purchase', 'subsidiary_purchase', 'other_purchase')
  );

comment on column public.purchase_orders.purpose is
  'The reason this PO was born (0361; vocabulary re-ruled by Card 03 2026-08-28 and Card 04 2026-08-29): customer_sales for the SO Batch lane; ready_stock / showroom_display / service_case / internal_staff_purchase / subsidiary_purchase / other_purchase for the Manual Purchase lane. display / warranty / office / spare_parts survive on history only — retired, never relabelled. NULL only on POs issued before 0361 — never backfilled (clean start).';

-- The approval switch knows the sixth purpose — approval ON (0359's own
-- safe default; the owner decides per purpose in Settings).
insert into public.purchasing_purpose_approval (purpose)
values ('other_purchase')
on conflict (purpose) do nothing;

-- ---------------------------------------------------------------------
-- 3. `why` becomes Other Purchase's own answer; the structured For lands
-- ---------------------------------------------------------------------

alter table public.purchase_requests
  alter column why drop not null;
alter table public.purchase_requests
  drop constraint if exists purchase_requests_why_check;
alter table public.purchase_requests
  add constraint purchase_requests_why_check check (
    -- present means non-blank, and Other Purchase must answer its question
    (why is null or btrim(why) <> '')
    and (purpose <> 'other_purchase' or (why is not null and btrim(why) <> ''))
  );

comment on column public.purchase_requests.why is
  'The request''s stated reason. Since 0401 (Card 04): required exactly for other_purchase — its `What is this for?` answer; optional history for every other purpose (routine purposes stop asking a duplicate Why).';

alter table public.purchase_requests
  add column if not exists for_service_case_id uuid references public.service_cases(id),
  add column if not exists for_staff_user_id   uuid references public.app_users(id),
  add column if not exists for_subsidiary_name text;

-- A For fact on a foreign purpose is a second truth; a MISSING fact on a
-- pre-0401 row is history the door alone owes going forward.
alter table public.purchase_requests
  drop constraint if exists purchase_requests_for_fact_check;
alter table public.purchase_requests
  add constraint purchase_requests_for_fact_check check (
    (for_service_case_id is null or purpose = 'service_case')
    and (for_staff_user_id is null or purpose = 'internal_staff_purchase')
    and (for_subsidiary_name is null
         or (purpose = 'subsidiary_purchase' and btrim(for_subsidiary_name) <> ''))
  );

comment on column public.purchase_requests.for_service_case_id is
  'Card 04: the Service Case a service_case purchase serves — a structured link, never a remark. Required by the door for new service_case requests; null on other purposes and on pre-0401 history.';
comment on column public.purchase_requests.for_staff_user_id is
  'Card 04: the real staff member an internal_staff_purchase serves. Required by the door for new internal_staff_purchase requests; null otherwise.';
comment on column public.purchase_requests.for_subsidiary_name is
  'Card 04: the actual subsidiary company a subsidiary_purchase serves (no subsidiary master exists yet — the name is the structure available). Required by the door for new subsidiary_purchase requests; null otherwise.';

-- ---------------------------------------------------------------------
-- 4. The header door — NEW signature (the three For facts), so the old
--    signature is dropped first (one signature, never an overload)
-- ---------------------------------------------------------------------

drop function if exists public.purchasing_create_request(text, uuid, text, date);

create function public.purchasing_create_request(
  p_purpose             text,
  p_destination_id      uuid,
  p_why                 text default null,
  p_required_by         date default null,
  p_for_service_case_id uuid default null,
  p_for_staff_user_id   uuid default null,
  p_for_subsidiary_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role       app_role;
  v_required   boolean;
  v_id         uuid;
  v_no         text;
  v_why        text := nullif(btrim(coalesce(p_why, '')), '');
  v_subsidiary text := nullif(btrim(coalesce(p_for_subsidiary_name, '')), '');
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  if p_purpose is null or p_purpose not in
     ('ready_stock', 'showroom_display', 'service_case',
      'internal_staff_purchase', 'subsidiary_purchase', 'other_purchase') then
    raise exception 'purpose % is not a purpose', p_purpose
      using errcode = '22023', detail = 'unknown_purpose';
  end if;

  -- Only Other Purchase asks `What is this for?` — and it MUST answer.
  if p_purpose = 'other_purchase' and v_why is null then
    raise exception 'say what this is for' using errcode = '22023', detail = 'why_required';
  end if;

  -- THE STRUCTURED FOR — required on its own purpose, refused on a foreign
  -- one. A generic remark where an object relationship is owed is the
  -- defect this door exists to stop (Card 04 §3.6).
  if p_purpose = 'service_case' then
    if p_for_service_case_id is null then
      raise exception 'name the Service Case this purchase serves'
        using errcode = '22023', detail = 'service_case_required';
    end if;
    if not exists (select 1 from service_cases where id = p_for_service_case_id) then
      raise exception 'unknown service case' using errcode = '22023', detail = 'unknown_service_case';
    end if;
  elsif p_for_service_case_id is not null then
    raise exception 'a % purchase does not name a service case', p_purpose
      using errcode = '22023', detail = 'for_fact_mismatch';
  end if;

  if p_purpose = 'internal_staff_purchase' then
    if p_for_staff_user_id is null then
      raise exception 'name the staff member this purchase serves'
        using errcode = '22023', detail = 'staff_member_required';
    end if;
    if not exists (select 1 from app_users where id = p_for_staff_user_id) then
      raise exception 'unknown staff member' using errcode = '22023', detail = 'unknown_staff_member';
    end if;
  elsif p_for_staff_user_id is not null then
    raise exception 'a % purchase does not name a staff member', p_purpose
      using errcode = '22023', detail = 'for_fact_mismatch';
  end if;

  if p_purpose = 'subsidiary_purchase' then
    if v_subsidiary is null then
      raise exception 'name the subsidiary this purchase serves'
        using errcode = '22023', detail = 'subsidiary_required';
    end if;
  elsif v_subsidiary is not null then
    raise exception 'a % purchase does not name a subsidiary', p_purpose
      using errcode = '22023', detail = 'for_fact_mismatch';
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
                                 for_service_case_id, for_staff_user_id,
                                 for_subsidiary_name,
                                 approval_required, created_by)
  values (p_purpose, p_destination_id, p_required_by, v_why,
          p_for_service_case_id, p_for_staff_user_id, v_subsidiary,
          v_required, auth.uid())
  returning id, req_no into v_id, v_no;

  return jsonb_build_object('id', v_id, 'req_no', v_no,
                            'approval_required', v_required);
end;
$fn$;

revoke execute on function public.purchasing_create_request(text, uuid, text, date, uuid, uuid, text)
  from public, anon;
grant execute on function public.purchasing_create_request(text, uuid, text, date, uuid, uuid, text)
  to authenticated;

comment on function public.purchasing_create_request(text, uuid, text, date, uuid, uuid, text) is
  '0359''s header door; 0401 (Card 04): six approved purposes, MPR numbering via the column default, `why` required exactly for other_purchase, and the structured For fact required on its own purpose and refused on a foreign one.';

-- ---------------------------------------------------------------------
-- 5. The line door and the Settings switch — 0399's bodies, gates
--    widened to the approved six (same signatures, replaced whole)
-- ---------------------------------------------------------------------

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
      'internal_staff_purchase', 'subsidiary_purchase', 'other_purchase') then
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
      'internal_staff_purchase', 'subsidiary_purchase', 'other_purchase') then
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
-- 6. The ONE creation authority — 0399's body, restated whole, ONLY the
--    purpose gate widened by other_purchase. 0382's
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
  '0379/0380 (+0399/0401 vocabulary): the ONE Purchase Order creation authority. Reached through the governed journeys (SO Batch Purchase, Manual Purchase); it asks `purchasing_actor_may_issue` and `purchasing_check_line_commercials` itself, so a direct RPC call can bypass neither duty/cover nor commercial approval.';

-- ---------------------------------------------------------------------
-- VERIFY (read-only; a migration never asserts a production row count)
-- ---------------------------------------------------------------------
--   select purpose, requires_approval from purchasing_purpose_approval order by 1;
--   -- EXPECT: other_purchase present, requires_approval = true
--
--   select column_default from information_schema.columns
--    where table_name = 'purchase_requests' and column_name = 'req_no';
--   -- EXPECT: allocate_formal_document_code('MPR'::text)
--
--   -- NEGATIVE CONTROL — a retired value must still be refused by name:
--   --   select purchasing_create_request('office', '<dest>');
--   --   EXPECT: ERROR (unknown_purpose)
--
--   -- NEGATIVE CONTROL — other_purchase without its answer:
--   --   select purchasing_create_request('other_purchase', '<dest>');
--   --   EXPECT: ERROR (why_required)
--
--   -- NEGATIVE CONTROL — a For fact on a foreign purpose:
--   --   select purchasing_create_request('ready_stock', '<dest>',
--   --     p_for_subsidiary_name := 'X');
--   --   EXPECT: ERROR (for_fact_mismatch)
--
--   -- POSITIVE (rolled back in test) — the sixth purpose creates, numbered MPR-:
--   --   select purchasing_create_request('other_purchase', '<dest>', 'spare parts for the van');
--   --   EXPECT: req_no like 'MPR-________-____'
