-- ============================================================================
-- 0380 — a price nobody approved stops the order
--        (CARD-2026-08-22-purchasing-02 closure §3; purchasing/MASTER.md §5.6)
--
-- MEASURED 2026-08-24, three holes, all in the same shape — PO Duty deciding
-- commercial truth it does not own:
--
--   1 · PO Duty could type any Transaction Cost and issue it. `hand_entered`
--       was accepted on its own word.
--   2 · PO Duty could mark a line Free of Charge with only a reason string.
--   3 · An UNTOUCHED catalog cost was re-read by the API and sent back as
--       `cost_source: catalog`, so the RPC compared the live value against
--       itself and always agreed. A supplier price that moved between review
--       and Issue was adopted SILENTLY.
--
-- MASTER §5.6: "A supplier price change stops the issue/change and routes to
-- the commercial approver; Operations does not decide it."
--
-- ── THE SHAPE OF THE FIX ────────────────────────────────────────────────────
--
-- The reviewed cost travels as an EXPECTED FACT (`expected_catalog_cost`), the
-- way the document version now does. The server re-reads Catalog and compares.
-- A mismatch creates ZERO purchase orders — not this one, not the other
-- nineteen — because the batch is atomic and a half-priced batch is worse than
-- a refusal.
--
-- Declaring the cost the operator saw is not trusting the browser: it is what
-- makes the comparison possible at all. The number that is STORED is still the
-- server's own read.
--
-- Anything other than the approved catalog price — a hand-entered cost, a Free
-- of Charge — now needs an APPROVAL RECORD that PO Duty cannot write for
-- themselves. Manager approval owns commercial exceptions (§6 of the Card);
-- this makes that structural instead of advisory.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 · the approved commercial fact
-- ---------------------------------------------------------------------------
create table if not exists public.po_cost_approvals (
  id uuid primary key default gen_random_uuid(),
  sku text not null,
  supplier_id uuid not null references public.suppliers(id),
  /** `hand_entered` = an agreed price that is not Catalog's.
   *  `free_of_charge` = no charge, for a stated reason. */
  treatment text not null check (treatment in ('hand_entered', 'free_of_charge')),
  /** The approved amount. NULL exactly when the treatment is free of charge. */
  unit_cost numeric(14,2),
  reason text not null,
  approved_by uuid not null references public.app_users(id),
  approved_at timestamptz not null default now(),
  /** An approval is for a decision, not for ever. */
  expires_on date,
  used_by_po text references public.purchase_orders(id),
  constraint po_cost_approval_amount check (
    (treatment = 'free_of_charge' and unit_cost is null)
    or (treatment = 'hand_entered' and unit_cost is not null and unit_cost > 0)
  )
);

comment on table public.po_cost_approvals is
  '0380: an APPROVED commercial exception — a price that is not Catalog''s, or a Free of Charge. PO Duty may not approve their own; the issue authority refuses an exception without one.';

create index if not exists po_cost_approvals_open_idx
  on public.po_cost_approvals (sku, supplier_id, treatment)
  where used_by_po is null;

alter table public.po_cost_approvals enable row level security;

drop policy if exists po_cost_approvals_read on public.po_cost_approvals;
create policy po_cost_approvals_read on public.po_cost_approvals
  for select to authenticated
  using (public.app_role() in ('operation', 'principal', 'finance'));

revoke all on public.po_cost_approvals from authenticated;
grant select on public.po_cost_approvals to authenticated;

/**
 * The approval door. A commercial approver — principal or finance — records
 * the exception. **PO Duty cannot approve their own**: the check is on the
 * ROLE, so an Operations login is refused whether or not they hold the duty,
 * and a principal who is also today's acting cover is refused too.
 */
create or replace function public.purchasing_approve_po_cost(
  p_sku text,
  p_supplier_id uuid,
  p_treatment text,
  p_unit_cost numeric,
  p_reason text,
  p_expires_on date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role app_role := public.app_role();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_id uuid;
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  -- COMMERCIAL AUTHORITY, NOT OPERATIONS. Operations executes the buy; it does
  -- not decide what Carres agrees to pay.
  if v_role is null or v_role not in ('principal', 'finance') then
    raise exception 'only a commercial approver may approve a price'
      using errcode = '42501', detail = 'not_commercial_approver';
  end if;
  -- ...and not even they may approve while holding the duty they would use it
  -- on. One person cannot be both sides of an exception.
  if public.purchasing_actor_may_issue(v_actor) then
    raise exception 'the current PO actor cannot approve their own exception'
      using errcode = '42501', detail = 'self_approval_refused';
  end if;
  if p_treatment not in ('hand_entered', 'free_of_charge') then
    raise exception 'unknown treatment' using errcode = '22023';
  end if;
  if v_reason = '' then
    raise exception 'a reason is required' using errcode = '22023', detail = 'reason_required';
  end if;

  insert into public.po_cost_approvals
    (sku, supplier_id, treatment, unit_cost, reason, approved_by, expires_on)
  values
    (p_sku, p_supplier_id, p_treatment,
     case when p_treatment = 'free_of_charge' then null else p_unit_cost end,
     v_reason, v_actor, p_expires_on)
  returning id into v_id;

  return jsonb_build_object('approval_id', v_id);
end;
$$;

revoke all on function public.purchasing_approve_po_cost(text, uuid, text, numeric, text, date) from public;
grant execute on function public.purchasing_approve_po_cost(text, uuid, text, numeric, text, date) to authenticated;

/**
 * THE GATE THE ISSUE AUTHORITY ASKS, per line.
 *
 * `p_expected_catalog_cost` is the price the OPERATOR REVIEWED. It is compared
 * with what Catalog says right now:
 *
 *   · catalog line, expectation matches live      → allowed
 *   · catalog line, expectation missing/different → `supplier_price_changed`
 *   · exception line                              → an open, unexpired,
 *                                                   unused approval must exist
 *
 * Returns the approval id it consumed, or null for a plain catalog line.
 */
create or replace function public.purchasing_check_line_commercials(
  p_sku text,
  p_supplier_id uuid,
  p_treatment text,
  p_cost numeric,
  p_cost_source text,
  p_expected_catalog_cost numeric
)
returns uuid
language plpgsql
stable security definer
set search_path = public
as $$
declare
  v_live numeric(14,2);
  v_approval uuid;
begin
  select cost into v_live from product_skus where sku = p_sku;

  if p_treatment = 'normal' and p_cost_source = 'catalog' then
    -- THE REVIEWED FACT MUST STILL BE TRUE. Without the expectation there is
    -- nothing to compare, so an absent one is a refusal rather than a pass.
    if p_expected_catalog_cost is null then
      raise exception 'the reviewed catalog cost was not declared (sku=%)', p_sku
        using errcode = 'P0001', detail = 'expected_cost_required';
    end if;
    if v_live is null or v_live <= 0
       or v_live is distinct from p_expected_catalog_cost::numeric(14,2)
       or v_live is distinct from p_cost::numeric(14,2) then
      raise exception 'supplier price changed since review (sku=%, reviewed=%, now=%)',
          p_sku, p_expected_catalog_cost, v_live
        using errcode = '40001', detail = 'supplier_price_changed';
    end if;
    return null;
  end if;

  -- Everything else is an EXCEPTION and needs somebody else's approval.
  select id into v_approval
    from public.po_cost_approvals
   where sku = p_sku
     and supplier_id = p_supplier_id
     and used_by_po is null
     and (expires_on is null or expires_on >= (timezone('Asia/Kuala_Lumpur', now()))::date)
     and treatment = case when p_treatment = 'free_of_charge' then 'free_of_charge' else 'hand_entered' end
     and (
       p_treatment = 'free_of_charge'
       or unit_cost is not distinct from p_cost::numeric(14,2)
     )
   order by approved_at desc
   limit 1;

  if v_approval is null then
    raise exception 'this price has no commercial approval (sku=%)', p_sku
      using errcode = 'P0001', detail = 'commercial_approval_required';
  end if;
  return v_approval;
end;
$$;

revoke all on function public.purchasing_check_line_commercials(text, uuid, text, numeric, text, numeric) from public;
grant execute on function public.purchasing_check_line_commercials(text, uuid, text, numeric, text, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 2 · the one creation authority, in its final form
-- ---------------------------------------------------------------------------
/**
 * `purchasing_issue_pos_batch` — THE ONE CREATION AUTHORITY, final form.
 *
 * It keeps every rule it had and gains the two it was missing: the ACTOR gate
 * (0379) and the COMMERCIAL gate (0380). The check sits at the very top: an unauthorised call must cost
 * a lookup, not a batch of validation.
 *
 * The body below is 0361's, unchanged except for the actor gate — it is
 * restated in full because a function is replaced whole.
 */
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
  '0379/0380: the ONE Purchase Order creation authority. Reached through the governed journeys (SO Batch Purchase, Manual Purchase); it asks `purchasing_actor_may_issue` and `purchasing_check_line_commercials` itself, so a direct RPC call can bypass neither duty/cover nor commercial approval.';

